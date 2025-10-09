const socket = io();

// DOM elements
const startPage = document.getElementById('startPage');
const nameInput = document.getElementById('nameInput');
const lobbyCodeInput = document.getElementById('lobbyCodeInput');
const createLobbyBtn = document.getElementById('createLobbyBtn');
const joinLobbyBtn = document.getElementById('joinLobbyBtn');

const lobby = document.getElementById('lobby');
const playersList = document.getElementById('playersList');
const readyBtn = document.getElementById('readyBtn');
const lobbyCodeSpan = document.getElementById('lobbyCode');

const gameArea = document.getElementById('gameArea');
const roundNumberSpan = document.getElementById('roundNumber');
const numberInput = document.getElementById('numberInput');
const submitBtn = document.getElementById('submitBtn');
const submissionStatus = document.getElementById('submissionStatus');
const resultArea = document.getElementById('resultArea');

const scoreboard = document.getElementById('scoreboard');
const scoresDiv = document.getElementById('scores');

const chatBox = document.getElementById('chatBox');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

const gameOver = document.getElementById('gameOver');
const winnerText = document.getElementById('winnerText');
const restartBtn = document.getElementById('restartBtn');

let currentLobby = null;
let myName = null;
let myReady = false;

// --- CREATE LOBBY ---
createLobbyBtn.onclick = () => {
    const inputName = nameInput.value.trim();
    if (!inputName) {
        alert('Please enter your name');
        return;
    }
    myName = inputName;

    socket.emit('createLobby', { name: inputName }, ({ code }) => {
        currentLobby = code;
        lobbyCodeSpan.textContent = code;

        // Switch UI
        startPage.classList.add('hidden');
        lobby.classList.remove('hidden');
        scoreboard.classList.remove('hidden');
        chatBox.classList.remove('hidden');
    });
};

// --- JOIN LOBBY ---
joinLobbyBtn.onclick = () => {
    const inputName = nameInput.value.trim();
    if (!inputName) {
        alert('Please enter your name');
        return;
    }
    myName = inputName;

    const code = lobbyCodeInput.value.trim();
    if (!code) return alert('Enter a valid lobby code');

    socket.emit('joinLobby', { code, name: inputName }, (res) => {
        if (res.error) return alert(res.error);

        currentLobby = code;
        lobbyCodeSpan.textContent = code;

        // Switch UI
        startPage.classList.add('hidden');
        lobby.classList.remove('hidden');
        scoreboard.classList.remove('hidden');
        chatBox.classList.remove('hidden');
    });
};


// --- READY BUTTON ---
readyBtn.onclick = () => {
    myReady = !myReady;
    readyBtn.textContent = myReady ? 'Cancel Ready' : 'OK (Ready)';
    socket.emit('setReady', { ready: myReady });
};

// --- SUBMIT NUMBER ---
submitBtn.onclick = () => {
    const val = Number(numberInput.value);
    if (isNaN(val) || val < 1 || val > 100) {
        return alert('Enter a number between 1 and 100');
    }
    socket.emit('submitNumber', { number: val });
    submitBtn.disabled = true;
};

// // --- Chat Elements ---
// const chatInput = document.getElementById('chatInput');
// const sendChatBtn = document.getElementById('sendChatBtn');
const lc= document.getElementById('lobbyCode');

// --- Send Chat Message ---
sendChatBtn.onclick = () => {
    const msg = chatInput.value.trim();
    // console.log(lobbyCodeSpan.textContent);
   const lobbyCodeSpan = lc.textContent;
    if (!msg || !lobbyCodeSpan) return;

    // Emit message to server with lobby code
    console.log(window.currentLobby);
    console.log(msg);
    socket.emit('sendChat', { code: lobbyCodeSpan, message: msg });
    chatInput.value = '';
};

// --- Receive Updated Chat ---
socket.on('chatUpdate', (messages) => {
    chatMessages.innerHTML = messages.map(m => {
        // Check if message is from me
        const isMine = m.name === myName;
        return `<div class="chatMessage ${isMine ? 'mine' : 'other'}">
                    <strong>${m.name}:</strong> ${m.message}
                </div>`;
    }).join('');
    chatMessages.scrollTop = chatMessages.scrollHeight;
});



// --- LOBBY UPDATE ---
socket.on('lobbyUpdate', ({ players, roundsPlayed }) => {
    playersList.innerHTML = players.map(p => `
        <div class="player ${p.eliminated ? 'eliminated' : ''}">
            <span class="name">${p.name}</span>
            <span class="score">${p.score}</span>
            <span class="status">${p.eliminated ? '(Eliminated)' : p.ready ? '(Ready)' : ''}</span>
        </div>
    `).join('');
    roundNumberSpan.textContent = roundsPlayed + 1;
});

// --- ROUND EVENTS ---
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
        </div>
    `).join('');

    submitBtn.disabled = true;
});

socket.on('gameOver', ({ winner }) => {
    winnerText.textContent = `🏆 Winner: ${winner.name} (Score: ${winner.score})`;
    gameOver.classList.remove('hidden');
    gameArea.classList.add('hidden');
    lobby.classList.add('hidden');
});
