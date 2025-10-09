const express = require('express');
const http = require('http');
const { Server } = require('socket.io');


const app = express();
const server = http.createServer(app);
const io = new Server(server);


app.use(express.static('public'));


const PORT = process.env.PORT || 3000;


// Game state
let players = {}; // socketId -> {name, score, eliminated, ready, lastGuess}
let roundsPlayed = 0;
let currentSubmissions = {}; // socketId -> number
let roundInProgress = false;
let eliminationInterval = 3; // default, will be updated dynamically


function resetRoundSubmissions() {
currentSubmissions = {};
for (const s in players) players[s].lastGuess = null;
}


function broadcastLobby() {
const list = Object.keys(players).map(id => ({
id,
name: players[id].name,
score: players[id].score,
eliminated: players[id].eliminated,
ready: players[id].ready
}));
io.emit('lobbyUpdate', { players: list, roundsPlayed });
}


function computeAndScoreRound() {
const ids = Object.keys(currentSubmissions);
if (ids.length === 0) return null;


const numbers = ids.map(id => currentSubmissions[id]);
const sum = numbers.reduce((a,b)=>a+b,0);
const avg = sum / numbers.length;
const target = +(0.8 * avg).toFixed(2);
// Check exact matches (must equal the target when rounded to 2 decimal places)
const exactGuessers = ids.filter(id => Number(currentSubmissions[id]) === Number(target));


let roundResult = {
target,
avg: +avg.toFixed(2),
exactGuessers: [],
closestId: null,
closestDiff: null
};


if (exactGuessers.length > 0) {
exactGuessers.forEach(id => {
players[id].score += 100;
roundResult.exactGuessers.push({ id, name: players[id].name });
});
} else {
// find nearest
let closestId = ids[0];
let closestDiff = Math.abs(Number(currentSubmissions[closestId]) - target);
for (let i = 1; i < ids.length; i++) {
const id = ids[i];
const diff = Math.abs(Number(currentSubmissions[id]) - target);
if (diff < closestDiff) {
closestDiff = diff;
closestId = id;
}
}
players[closestId].score += 50;
roundResult.closestId = closestId;
roundResult.closestName = players[closestId].name;
roundResult.closestDiff = closestDiff;
}


roundsPlayed += 1;
return roundResult;
}
function eliminatePlayers() {
const activePlayers = Object.entries(players)
.filter(([id, p]) => !p.eliminated)
.map(([id, p]) => ({ id, name: p.name, score: p.score }));


if (activePlayers.length <= 1) return []; // nothing to eliminate


// sort ascending by score
activePlayers.sort((a,b)=>a.score-b.score);


// number to eliminate: floor(25% of active), at least 1 (unless would eliminate all)
let toEliminate = Math.floor(activePlayers.length * 0.25);
if (toEliminate < 1) toEliminate = 1;
if (activePlayers.length - toEliminate < 1) toEliminate = activePlayers.length - 1;


const eliminated = activePlayers.slice(0, toEliminate);
eliminated.forEach(p => { players[p.id].eliminated = true; });


return eliminated;
}

function updateEliminationInterval() {
    const totalPlayers = Object.keys(players).length;
    eliminationInterval = Math.max(3, Math.floor(totalPlayers / 2));
}


io.on('connection', socket => {
console.log('socket connected', socket.id);


// Add placeholder
players[socket.id] = {
name: `Guest-${socket.id.slice(0,4)}`,
score: 0,
eliminated: false,
ready: false,
lastGuess: null
};


updateEliminationInterval(); // Update interval when a new player joins


// Send lobby
broadcastLobby();
socket.on('login', ({ name }) => {
if (!players[socket.id]) return;
players[socket.id].name = name || players[socket.id].name;
players[socket.id].score = 0;
players[socket.id].eliminated = false;
players[socket.id].ready = false;
broadcastLobby();
updateEliminationInterval(); // Update interval on login
});


socket.on('setReady', ({ ready }) => {
if (!players[socket.id]) return;
players[socket.id].ready = ready;
broadcastLobby();


// If all active players are ready and at least 2 players present, start round
const active = Object.values(players).filter(p=>!p.eliminated);
if (active.length >= 1 && active.every(p=>p.ready)) {
// start the round
roundInProgress = true;
resetRoundSubmissions();
io.emit('roundStart');
}
});


socket.on('submitNumber', ({ number }) => {
if (!players[socket.id] || players[socket.id].eliminated) return;
const n = Number(number);
if (!Number.isFinite(n) || n < 1 || n > 100) {
socket.emit('errorMsg', { msg: 'Invalid number. Must be between 1 and 100.' });
return;
}


currentSubmissions[socket.id] = n;
players[socket.id].lastGuess = n;


// If all active players submitted, compute result
const activeIds = Object.keys(players).filter(id=>!players[id].eliminated);
const allSubmitted = activeIds.every(id => currentSubmissions.hasOwnProperty(id));
if (allSubmitted) {
const result = computeAndScoreRound();
// Reset ready flags so players must ready again
for (const id of Object.keys(players)) players[id].ready = false;
roundInProgress = false;


// Eliminate players at the dynamic interval
const eliminatedThisRound = (roundsPlayed % eliminationInterval === 0)
? eliminatePlayers()
: [];


// Broadcast round result + lobby
io.emit('roundResult', { result, players: Object.keys(players).map(id=>({
id, name: players[id].name, score: players[id].score, eliminated: players[id].eliminated
})), roundsPlayed, eliminated: eliminatedThisRound });


// If only one player remains, game over
const remaining = Object.entries(players).filter(([id,p])=>!p.eliminated);
if (remaining.length === 1) {
io.emit('gameOver', { winner: { id: remaining[0][0], name: remaining[0][1].name, score: remaining[0][1].score } });
// reset game state for a new game (players keep names but scores reset)
for (const id in players) {
players[id].score = 0;
players[id].eliminated = false;
players[id].ready = false;
}
roundsPlayed = 0;
resetRoundSubmissions();
}


} else {
// inform clients how many submitted so far
io.emit('submissionUpdate', { submitted: Object.keys(currentSubmissions).length, total: Object.keys(players).filter(id=>!players[id].eliminated).length });
}
});


socket.on('disconnect', () => {
console.log('disconnect', socket.id);
delete players[socket.id];
broadcastLobby();
updateEliminationInterval(); // Update interval when a player leaves
});


});


server.listen(PORT, ()=>console.log('Server listening on', PORT));