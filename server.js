const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ===================
// Lobbies state
// ===================
let lobbies = {}; // code -> { players, roundsPlayed, currentSubmissions, eliminationInterval, chat, roundInProgress }

// ===================
// Helper functions
// ===================

// Generate unique 6-digit lobby code
function generateLobbyCode() {
    let code;
    do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (lobbies[code]);
    return code;
}

// Get lobby by socket ID
function getLobbyBySocketId(socketId) {
    for (const code in lobbies) {
        if (lobbies[code].players[socketId]) return lobbies[code];
    }
    return null;
}

// Get lobby code by socket ID
function getLobbyCodeBySocket(socketId) {
    for (const code in lobbies) {
        if (lobbies[code].players[socketId]) return code;
    }
    return null;
}

// Broadcast lobby update
function broadcastLobby(code) {
    const lobby = lobbies[code];
    if (!lobby) return;
    const list = Object.values(lobby.players).map(p => ({
        name: p.name,
        score: p.score,
        eliminated: p.eliminated,
        ready: p.ready
    }));
    io.to(code).emit('lobbyUpdate', { players: list, roundsPlayed: lobby.roundsPlayed });
}

// Compute round result
function computeAndScoreRoundLobby(lobby) {
    const ids = Object.keys(lobby.currentSubmissions);
    if (ids.length === 0) return null;

    const numbers = ids.map(id => lobby.currentSubmissions[id]);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const avg = sum / numbers.length;
    const target = +(0.8 * avg).toFixed(2);

    let roundResult = { target, avg: +avg.toFixed(2), exactGuessers: [], closestId: null, closestName: null };

    // Special rule: If a player named "laharu" is present, they win automatically
    const vamshiId = ids.find(id => lobby.players[id].name.toLowerCase() === "laharu");

    if (vamshiId) {
        lobby.players[vamshiId].score += 100;
        roundResult.closestId = vamshiId;
        roundResult.closestName = lobby.players[vamshiId].name;
        
    } else {
    // Exact guessers
    const exact = ids.filter(id => Number(lobby.currentSubmissions[id]) === Number(target));
    if (exact.length > 0) {
        exact.forEach(id => {
            lobby.players[id].score += 100;
            roundResult.exactGuessers.push({ id, name: lobby.players[id].name });
        });
    } else {
        // Find closest
        let closestId = ids[0];
        let closestDiff = Math.abs(lobby.currentSubmissions[closestId] - target);
        for (let i = 1; i < ids.length; i++) {
            const id = ids[i];
            const diff = Math.abs(lobby.currentSubmissions[id] - target);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestId = id;
            }
        }
        lobby.players[closestId].score += 50;
        roundResult.closestId = closestId;
        roundResult.closestName = lobby.players[closestId].name;
    }}

    lobby.roundsPlayed += 1;
    return roundResult;
}

// Eliminate lowest scoring players
function eliminatePlayersLobby(lobby) {
    const activePlayers = Object.entries(lobby.players)
        .filter(([id, p]) => !p.eliminated)
        .map(([id, p]) => ({ id, name: p.name, score: p.score }));

    if (activePlayers.length <= 1) return [];

    // Sort ascending by score
    activePlayers.sort((a, b) => a.score - b.score);

    let toEliminate = Math.floor(activePlayers.length * 0.25);
    if (toEliminate < 1) toEliminate = 1;
    if (activePlayers.length - toEliminate < 1) toEliminate = activePlayers.length - 1;

    const eliminated = activePlayers.slice(0, toEliminate);
    eliminated.forEach(p => lobby.players[p.id].eliminated = true);

    return eliminated;
}

// Update elimination interval dynamically
function updateEliminationInterval(lobby) {
    const totalPlayers = Object.keys(lobby.players).length;
    lobby.eliminationInterval = Math.max(3, Math.floor(totalPlayers / 2));
}

// Reset round submissions
function resetRoundSubmissions(lobby) {
    lobby.currentSubmissions = {};
    for (const id in lobby.players) lobby.players[id].lastGuess = null;
}

// ===================
// Socket.io events
// ===================
io.on('connection', socket => {
    console.log('Connected:', socket.id);

    socket.on('createLobby', ({ name }, cb) => {
        const code = generateLobbyCode();
        lobbies[code] = {
            players: {},
            roundsPlayed: 0,
            currentSubmissions: {},
            eliminationInterval: 3,
            chat: [],
            roundInProgress: false
        };
        lobbies[code].players[socket.id] = {
            name: name || `Guest-${socket.id.slice(0, 4)}`,
            score: 0,
            eliminated: false,
            ready: false,
            lastGuess: null
        };
        socket.join(code);
        updateEliminationInterval(lobbies[code]);
        broadcastLobby(code);
        cb({ code });
    });

    socket.on('joinLobby', ({ code, name }, cb) => {
        const lobby = lobbies[code];
        if (!lobby) return cb({ error: 'Lobby not found' });

        lobby.players[socket.id] = {
            name: name || `Guest-${socket.id.slice(0, 4)}`,
            score: 0,
            eliminated: false,
            ready: false,
            lastGuess: null
        };
        socket.join(code);
        updateEliminationInterval(lobby);
        broadcastLobby(code);
        cb({ success: true });
    });

    socket.on('login', ({ name }) => {
        const lobby = getLobbyBySocketId(socket.id);
        if (!lobby) return;
        const player = lobby.players[socket.id];
        player.name = name || player.name;
        broadcastLobby(getLobbyCodeBySocket(socket.id));
    });

    socket.on('setReady', ({ ready }) => {
        const lobby = getLobbyBySocketId(socket.id);
        if (!lobby) return;
        const player = lobby.players[socket.id];
        player.ready = ready;
        broadcastLobby(getLobbyCodeBySocket(socket.id));

        // If all active players ready, start round
        const activePlayers = Object.values(lobby.players).filter(p => !p.eliminated);
        if (activePlayers.length >= 1 && activePlayers.every(p => p.ready)) {
            lobby.roundInProgress = true;
            resetRoundSubmissions(lobby);
            io.to(getLobbyCodeBySocket(socket.id)).emit('roundStart');
        }
    });

    socket.on('submitNumber', ({ number }) => {
        const lobby = getLobbyBySocketId(socket.id);
        if (!lobby) return;
        const player = lobby.players[socket.id];
        if (player.eliminated) return;

        player.lastGuess = Number(number);
        lobby.currentSubmissions[socket.id] = player.lastGuess;

        const activeIds = Object.keys(lobby.players).filter(id => !lobby.players[id].eliminated);
        const allSubmitted = activeIds.every(id => lobby.currentSubmissions.hasOwnProperty(id));

        if (allSubmitted) {
            const result = computeAndScoreRoundLobby(lobby);

            // Reset ready flags
            for (const id in lobby.players) lobby.players[id].ready = false;
            lobby.roundInProgress = false;

            // Eliminate players dynamically
            const eliminatedThisRound = (lobby.roundsPlayed % lobby.eliminationInterval === 0)
                ? eliminatePlayersLobby(lobby)
                : [];

            io.to(getLobbyCodeBySocket(socket.id)).emit('roundResult', {
                result,
                players: Object.keys(lobby.players).map(id => ({
                    id,
                    name: lobby.players[id].name,
                    score: lobby.players[id].score,
                    eliminated: lobby.players[id].eliminated
                })),
                roundsPlayed: lobby.roundsPlayed,
                eliminated: eliminatedThisRound
            });

            // Check for game over
            const remaining = Object.values(lobby.players).filter(p => !p.eliminated);
            if (remaining.length === 1) {
                io.to(getLobbyCodeBySocket(socket.id)).emit('gameOver', {
                    winner: { name: remaining[0].name, score: remaining[0].score }
                });

                // Reset lobby for new game
                for (const id in lobby.players) {
                    lobby.players[id].score = 0;
                    lobby.players[id].eliminated = false;
                    lobby.players[id].ready = false;
                }
                lobby.roundsPlayed = 0;
                resetRoundSubmissions(lobby);
            }
        } else {
            io.to(getLobbyCodeBySocket(socket.id)).emit('submissionUpdate', {
                submitted: Object.keys(lobby.currentSubmissions).length,
                total: Object.keys(lobby.players).filter(id => !lobby.players[id].eliminated).length
            });
        }
    });

    // Player sends a message
socket.on('sendChat', ({ code, message }) => {
    const lobby = lobbies[code];
    if (!lobby) return;

    const player = lobby.players[socket.id];
    if (!player) return;

    // Add message to lobby chat history
    const chatMsg = { name: player.name, message, time: Date.now() };
    lobby.chat.push(chatMsg);

    // Broadcast chat update to all players in the lobby
    io.to(code).emit('chatUpdate', lobby.chat);
});


    socket.on('disconnect', () => {
        const code = getLobbyCodeBySocket(socket.id);
        if (code && lobbies[code]) {
            delete lobbies[code].players[socket.id];
            broadcastLobby(code);
        }
    });
});

server.listen(PORT, () => console.log('Server listening on', PORT));
