const socket = io();


// Elements
const loginScreen = document.getElementById('loginScreen');
const lobby = document.getElementById('lobby');
const gameArea = document.getElementById('gameArea');
const scoreboard = document.getElementById('scoreboard');
const gameOver = document.getElementById('gameOver');


const nameInput = document.getElementById('nameInput');
const loginBtn = document.getElementById('loginBtn');
const readyBtn = document.getElementById('readyBtn');
const playersList = document.getElementById('playersList');
const roundInfo = document.getElementById('roundInfo');
const numberInput = document.getElementById('numberInput');
const submitBtn = document.getElementById('submitBtn');
const resultArea = document.getElementById('resultArea');
const scoresDiv = document.getElementById('scores');
const submissionStatus = document.getElementById('submissionStatus');
const roundNumberSpan = document.getElementById('roundNumber');
const winnerText = document.getElementById('winnerText');
const restartBtn = document.getElementById('restartBtn');


let myId = null;
let myReady = false;
let roundsPlayed = 0;


loginBtn.addEventListener('click', () => {
const name = nameInput.value.trim() || `Player-${Math.floor(Math.random()*1000)}`;
socket.emit('login', { name });
loginScreen.classList.add('hidden');
lobby.classList.remove('hidden');
scoreboard.classList.remove('hidden');
});
readyBtn.addEventListener('click', () => {
myReady = !myReady;
readyBtn.textContent = myReady ? 'Cancel Ready' : 'OK (Ready)';
socket.emit('setReady', { ready: myReady });
});


submitBtn.addEventListener('click', () => {
const val = Number(numberInput.value);
if (isNaN(val) || val < 1 || val > 100) {
alert('Enter a valid number between 1 and 100');
return;
}
socket.emit('submitNumber', { number: val });
submitBtn.disabled = true;
});


restartBtn.addEventListener('click', () => {
location.reload();
});


socket.on('connect', () => {
myId = socket.id;
});


socket.on('lobbyUpdate', ({ players, roundsPlayed: rp }) => {
roundsPlayed = rp || 0;
playersList.innerHTML = players.map(p => `
<div class="player ${p.eliminated ? 'eliminated' : ''}">
<span class="name">${p.name}</span>
<span class="score">${p.score}</span>
<span class="status">${p.eliminated ? '(Eliminated)' : p.ready ? '(Ready)' : ''}</span>
</div>`).join('');
roundNumberSpan.textContent = roundsPlayed + 1;
});
socket.on('roundStart', () => {
resultArea.innerHTML = '';
submissionStatus.textContent = 'Round started — submit your number!';
numberInput.value = '';
submitBtn.disabled = false;
gameArea.classList.remove('hidden');
});


socket.on('submissionUpdate', ({ submitted, total }) => {
submissionStatus.textContent = `Submitted ${submitted} / ${total}`;
});


socket.on('roundResult', ({ result, players, roundsPlayed, eliminated }) => {
let html = `<p><strong>Average:</strong> ${result.avg} — <strong>Target (80%):</strong> ${result.target}</p>`;
if (result.exactGuessers && result.exactGuessers.length) {
html += `<p>🎯 Exact guessers: ${result.exactGuessers.map(e => e.name).join(', ')} (+100)</p>`;
} else {
html += `<p>Closest: ${result.closestName} (+50)</p>`;
}
if (eliminated && eliminated.length) {
html += `<p>❌ Eliminated: ${eliminated.map(e => e.name).join(', ')}</p>`;
}
resultArea.innerHTML = html;


scoresDiv.innerHTML = players.map(p => `
<div class="score-row ${p.eliminated ? 'eliminated' : ''}">
<span>${p.name}</span>
<span>${p.score}</span>
</div>`).join('');


submitBtn.disabled = true;
});


socket.on('gameOver', ({ winner }) => {
winnerText.textContent = `🏆 GudduOP: ${winner.name} (Score: ${winner.score})`;
gameOver.classList.remove('hidden');
gameArea.classList.add('hidden');
lobby.classList.add('hidden');
});
socket.on('errorMsg', ({ msg }) => alert(msg));