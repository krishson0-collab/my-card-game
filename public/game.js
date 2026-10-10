/* =========================================================
   29 Card Game — Client
   Works with server.js (socket.io)
   ========================================================= */

const socket = io();

// State
const S = {
    myId: null,
    roomId: null,
    isSpectator: false,
    myHand: [],
    phase: 'warmup',
    trumpSuit: null,
    currentPlayerId: null,
    currentBid: 7,
    highestBid: 7,
    highestBidderId: null,
    biddingActive: false,
    nextBidderId: null,
    handSizes: {},
    tricks: {},
    revealedHand: null,
    revealedOwnerId: null,
    bidWinnerId: null,
    teamAScore: 0,
    teamBScore: 0,
    totalTricks: 5,
    playerNames: {},
    playerTeams: {},
    bidHistory: []
};

const $ = id => document.getElementById(id);

/* =========================================================
   LOBBY ACTIONS
   ========================================================= */
$('btn-join').addEventListener('click', () => {
    const name = $('input-name').value.trim() || 'Player';
    const room = $('input-room').value.trim();
    const pass = $('input-pass').value.trim();
    if (!room) return showLobbyMsg('Enter a Room ID');
    socket.emit('joinRoom', { roomId: room, playerName: name, password: pass || null });
});

$('btn-bot').addEventListener('click', () => {
    const name = $('input-name').value.trim() || 'You';
    const roomId = 'bot_' + Math.random().toString(36).slice(2, 8);
    socket.emit('startBotGame', { roomId, playerName: name });
});

$('btn-spectate').addEventListener('click', () => {
    const name = $('input-name').value.trim() || 'Spectator';
    const room = $('input-room').value.trim();
    if (!room) return showLobbyMsg('Enter Room ID to spectate');
    socket.emit('joinRoom', { roomId: room, playerName: name, isSpectator: true });
});

function showLobbyMsg(msg) {
    $('lobby-msg').textContent = msg;
    setTimeout(() => $('lobby-msg').textContent = '', 3500);
}

/* =========================================================
   SOCKET EVENTS
   ========================================================= */
socket.on('joined', data => {
    S.myId = data.playerId;
    S.roomId = data.roomId;
    S.isSpectator = !!data.isSpectator;
    $('lobby').classList.add('hidden');
    $('game').classList.remove('hidden');
    if (S.isSpectator) {
        $('spectator-banner').classList.remove('hidden');
        $('my-area').classList.add('hidden');
        $('bid-ui').classList.remove('active');
    }
});

socket.on('joinError', msg => showLobbyMsg(msg));

socket.on('roomUpdate', data => {
    data.players.forEach(p => {
        S.playerNames[p.id] = p.name;
        S.playerTeams[p.id] = p.team;
        const seat = $('seat-' + p.id);
        if (seat) seat.querySelector('.pb-name').textContent = p.name;
    });
    if (S.myId && S.playerNames[S.myId]) {
        $('my-name').textContent = S.playerNames[S.myId];
    }
});

socket.on('gameStart', data => {
    S.myId = data.yourId;
    S.myHand = data.yourHand || [];
    S.phase = data.phase;
    S.currentBid = data.currentBid;
    S.teamAScore = data.teamAScore;
    S.teamBScore = data.teamBScore;
    S.totalTricks = data.phase === 'warmup' ? 5 : 13;
    S.revealedHand = null;
    S.revealedOwnerId = null;
    S.bidWinnerId = null;
    S.trumpSuit = null;

    data.players.forEach(p => {
        S.playerNames[p.id] = p.name;
        S.playerTeams[p.id] = p.team;
        S.handSizes[p.id] = p.handSize;
        S.tricks[p.id] = p.tricks;
    });

    S.bidHistory = data.bidHistory || [];
    renderBidHistory();

    $('teammate-cards').classList.add('hidden');
    document.querySelectorAll('.pc-slot').forEach(s => s.innerHTML = '');
    document.querySelectorAll('.seat').forEach(s => s.classList.remove('active', 'bid-winner'));

    renderGame();

    if (data.currentBidderId === S.myId) {
        renderBidUI();
    }
});

socket.on('bidUpdate', data => {
    S.currentBid = data.currentBid;
    S.highestBid = data.highestBid;
    S.highestBidderId = data.highestBidderId;
    S.biddingActive = data.biddingActive;
    S.nextBidderId = data.nextBidderId;
    S.phase = data.phase;
    S.bidHistory = data.bidHistory || [];

    renderBidHistory();

    if (data.biddingActive && data.nextBidderId === S.myId && !S.isSpectator) {
        renderBidUI();
    } else {
        $('bid-ui').classList.remove('active');
    }
});

socket.on('biddingFinished', data => {
    S.highestBid = data.highestBid;
    S.highestBidderId = data.highestBidderId;
    S.biddingActive = false;
    $('bid-ui').classList.remove('active');
    renderCrown();

    if (data.highestBidderId === S.myId && !S.isSpectator) {
        // Show trump modal
        $('trump-modal').classList.remove('hidden');
    }
});

socket.on('warmupSkipped', () => {
    // Server will send gameStart after 1.5s for main deal
});

socket.on('trumpSet', data => {
    S.trumpSuit = data.trumpSuit;
    S.highestBidderId = data.highestBidderId;
    updateTrumpIndicator();

    if (data.waitReveal && data.highestBidderId === S.myId && !S.isSpectator) {
        $('reveal-modal').classList.remove('hidden');
    }
});

socket.on('teammateRevealed', data => {
    // Flag only — actual hand arrives with roundStarted
});

socket.on('roundStarted', data => {
    S.myHand = data.yourHand || [];
    S.trumpSuit = data.trumpSuit;
    S.currentPlayerId = data.currentPlayerId;
    S.revealedHand = data.revealedHand;
    S.revealedOwnerId = data.revealedOwnerId;
    S.bidWinnerId = data.bidWinnerId;
    S.phase = data.phase;
    S.totalTricks = data.totalTricks;

    data.handSizes.forEach(h => {
        S.handSizes[h.id] = h.size;
        S.tricks[h.id] = h.tricks;
    });

    if (S.revealedHand && S.revealedHand.length > 0) {
        $('teammate-cards').classList.remove('hidden');
        renderTeammateHand();
    }

    updateTrumpIndicator();
    renderGame();
    renderCrown();
});

socket.on('cardPlayed', data => {
    const slot = $('pc-' + data.playerId);
    if (slot) {
        slot.innerHTML = '';
        slot.appendChild(makeCardEl(data.card));
    }
    S.currentPlayerId = data.nextPlayerId;
    renderTurnIndicator();
    highlightPlayable();
});

socket.on('handUpdate', data => {
    S.myHand = data.hand || [];
    renderMyHand();
    highlightPlayable();
});

socket.on('trickResolved', data => {
    data.players.forEach(p => {
        S.tricks[p.id] = p.tricks;
        S.handSizes[p.id] = p.handSize;
    });
    renderScores();

    setTimeout(() => {
        document.querySelectorAll('.pc-slot').forEach(s => s.innerHTML = '');
    }, 800);

    S.currentPlayerId = data.nextPlayerId;
    renderTurnIndicator();
});

socket.on('revealedHandUpdate', data => {
    S.revealedHand = data.revealedHand;
    S.revealedOwnerId = data.revealedOwnerId;
    if (S.revealedHand && S.revealedHand.length > 0) {
        $('teammate-cards').classList.remove('hidden');
        renderTeammateHand();
    }
});

socket.on('roundEnd', data => {
    showRoundEnd(data);
});

socket.on('gameOver', data => {
    showGameOver(data);
});

socket.on('gameRestarted', () => {
    $('game-over-modal').classList.add('hidden');
    $('round-end-modal').classList.add('hidden');
});

socket.on('restartVotesUpdate', data => {
    $('vote-badge').textContent = data.total;
});

socket.on('errorMsg', msg => {
    console.warn('Server error:', msg);
});

socket.on('playerLeft', data => {
    console.log(data.playerName + ' left the room');
});

socket.on('spectatorJoined', data => {
    // Setup spectator view
    if (!data.room) return;
    S.teamAScore = data.room.teamAScore;
    S.teamBScore = data.room.teamBScore;
    S.phase = data.room.phase;
    data.room.players.forEach(p => {
        S.playerNames[p.id] = p.name;
        S.playerTeams[p.id] = p.team;
        S.handSizes[p.id] = p.handSize;
        S.tricks[p.id] = p.tricks;
    });
    renderGame();
});

/* =========================================================
   RENDERING
   ========================================================= */
function renderGame() {
    renderMyHand();
    renderScores();
    renderTurnIndicator();
    updateTrumpIndicator();
    renderCrown();
    $('phase-label').textContent = S.phase === 'warmup' ? 'WARMUP' : 'MAIN';
    const myTricks = S.tricks[S.myId] || 0;
    $('tricks-label').textContent = `${myTricks}/${S.totalTricks}`;
    if (S.playerNames[S.myId]) {
        $('my-name').textContent = S.playerNames[S.myId];
    }
}

function renderMyHand() {
    if (S.isSpectator) return;
    const el = $('player1-cards');
    el.innerHTML = '';
    S.myHand.forEach((card, idx) => {
        const cardEl = makeCardEl(card);
        cardEl.dataset.idx = idx;
        cardEl.addEventListener('click', () => onPlayCard(idx));
        el.appendChild(cardEl);
    });
}

function makeCardEl(card) {
    const el = document.createElement('div');
    const isRed = card.suit === '♥️' || card.suit === '♦️';
    el.className = 'card ' + (isRed ? 'red' : 'black');
    el.innerHTML = `<div class="c-rank">${card.rank}</div><div class="c-suit">${card.suit}</div>`;
    return el;
}

function renderScores() {
    $('score-a').textContent = S.teamAScore;
    $('score-b').textContent = S.teamBScore;

    [1, 2, 3, 4].forEach(id => {
        const seat = $('seat-' + id);
        if (!seat) return;
        const badge = seat.querySelector('.score-badge');
        if (badge) badge.textContent = `${S.tricks[id] || 0}/${S.totalTricks}`;
    });

    $('my-tricks').textContent = S.tricks[S.myId] || 0;
    $('tricks-label').textContent = `${S.tricks[S.myId] || 0}/${S.totalTricks}`;
}

function renderTurnIndicator() {
    document.querySelectorAll('.seat').forEach(s => s.classList.remove('active'));
    if (S.currentPlayerId && S.currentPlayerId !== S.myId) {
        const seat = $('seat-' + S.currentPlayerId);
        if (seat) seat.classList.add('active');
    }
    highlightPlayable();
}

function highlightPlayable() {
    document.querySelectorAll('#player1-cards .card').forEach(c => c.classList.remove('playable'));
    if (S.currentPlayerId !== S.myId) return;
    if (!S.myHand.length) return;
    document.querySelectorAll('#player1-cards .card').forEach(c => c.classList.add('playable'));
}

function updateTrumpIndicator() {
    const el = $('trump-indicator');
    if (!S.trumpSuit) {
        el.classList.add('empty');
        $('trump-icon').textContent = '?';
        $('trump-name-small').textContent = 'No Trump';
    } else {
        el.classList.remove('empty');
        $('trump-icon').textContent = S.trumpSuit;
        const bidderName = S.playerNames[S.highestBidderId] || 'Trump';
        $('trump-name-small').textContent = bidderName;
    }
}

function renderBidUI() {
    const container = $('main-bid-buttons');
    container.innerHTML = '';

    if (S.phase === 'warmup') {
        const bidBtn = document.createElement('button');
        bidBtn.textContent = 'Bid 5';
        bidBtn.onclick = () => {
            socket.emit('bid', { bid: 5 });
            $('bid-ui').classList.remove('active');
        };
        container.appendChild(bidBtn);

        const passBtn = document.createElement('button');
        passBtn.textContent = 'PASS';
        passBtn.className = 'pass-btn';
        passBtn.onclick = () => {
            socket.emit('pass');
            $('bid-ui').classList.remove('active');
        };
        container.appendChild(passBtn);

        $('bid-turn-info').textContent = 'Warmup — Bid 5 or Pass';
    } else {
        const startBid = Math.max(8, S.currentBid + 1);
        for (let v = startBid; v <= 13; v++) {
            const btn = document.createElement('button');
            btn.textContent = v;
            btn.onclick = () => {
                socket.emit('bid', { bid: v });
                $('bid-ui').classList.remove('active');
            };
            container.appendChild(btn);
        }
        const passBtn = document.createElement('button');
        passBtn.textContent = 'PASS';
        passBtn.className = 'pass-btn';
        passBtn.onclick = () => {
            socket.emit('pass');
            $('bid-ui').classList.remove('active');
        };
        container.appendChild(passBtn);

        $('bid-turn-info').textContent = `Bid above ${S.currentBid}`;
    }

    $('bid-ui').classList.add('active');
}

function renderBidHistory() {
    const el = $('bid-history-list');
    el.innerHTML = '';
    if (!S.bidHistory || S.bidHistory.length === 0) {
        el.innerHTML = '<div class="bid-empty">No bids yet</div>';
        return;
    }
    S.bidHistory.forEach(h => {
        const div = document.createElement('div');
        div.className = 'bid-item';
        div.textContent = h;
        el.appendChild(div);
    });
}

function renderCrown() {
    document.querySelectorAll('.seat').forEach(s => s.classList.remove('bid-winner'));
    if (S.highestBidderId !== null && S.highestBidderId !== undefined) {
        const seat = $('seat-' + S.highestBidderId);
        if (seat) seat.classList.add('bid-winner');
    }
}

function renderTeammateHand() {
    const el = $('teammate-cards-list');
    el.innerHTML = '';
    if (!S.revealedHand) return;
    S.revealedHand.forEach(card => {
        el.appendChild(makeCardEl(card));
    });
    const owner = S.playerNames[S.revealedOwnerId] || 'Partner';
    $('partner-title').textContent = `👀 Partner — ${owner}`;
}

/* =========================================================
   ACTIONS
   ========================================================= */
function onPlayCard(idx) {
    if (S.currentPlayerId !== S.myId) return;
    socket.emit('playCard', { cardIndex: idx });
}

$('trump-buttons').addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') {
        const suit = e.target.dataset.suit;
        socket.emit('chooseTrump', { suit });
        $('trump-modal').classList.add('hidden');
    }
});

$('reveal-yes').addEventListener('click', () => {
    socket.emit('revealDecision', { decision: 'show' });
    $('reveal-modal').classList.add('hidden');
});

$('reveal-no').addEventListener('click', () => {
    socket.emit('revealDecision', { decision: 'hide' });
    $('reveal-modal').classList.add('hidden');
});

$('btn-toggle-reveal').addEventListener('click', () => {
    socket.emit('toggleReveal');
    const list = $('teammate-cards-list');
    const hidden = list.style.visibility === 'hidden';
    list.style.visibility = hidden ? 'visible' : 'hidden';
    $('btn-toggle-reveal').textContent = hidden ? '🙈 Hide' : '👀 Show';
});

$('btn-vote-reset').addEventListener('click', () => {
    socket.emit('voteRestart');
});

$('btn-history').addEventListener('click', () => {
    $('history-panel').classList.remove('hidden');
});

$('btn-close-history').addEventListener('click', () => {
    $('history-panel').classList.add('hidden');
});

$('btn-leave').addEventListener('click', () => {
    if (confirm('Leave the game?')) {
        socket.emit('leaveRoom');
        setTimeout(() => location.reload(), 300);
    }
});

$('btn-back-lobby').addEventListener('click', () => {
    socket.emit('leaveRoom');
    setTimeout(() => location.reload(), 300);
});

/* =========================================================
   MODALS
   ========================================================= */
function showRoundEnd(data) {
    const modal = $('round-end-modal');
    const trophy = $('round-trophy');
    const title = $('round-result-title');
    const sub = $('round-result-sub');
    const scores = $('round-scores');

    if (data.phase === 'warmup') {
        if (data.success) {
            trophy.textContent = '😅';
            title.textContent = 'Warmup Survived';
            sub.textContent = `${data.bidderTeam} bid 5 — opponents +26`;
        } else {
            trophy.textContent = '💥';
            title.textContent = 'Warmup Failed';
            sub.textContent = `${data.bidderTeam} bid 5 and failed — -26`;
        }
    } else {
        if (data.sar >= 0) {
            trophy.textContent = '🎉';
            title.textContent = 'Bid Made!';
            sub.textContent = `${data.team} bid ${data.bid}, won ${data.tricks} tricks (+${data.sar})`;
        } else {
            trophy.textContent = '💥';
            title.textContent = 'Bid Failed!';
            sub.textContent = `${data.team} bid ${data.bid}, won only ${data.tricks} (${data.sar})`;
        }
    }

    scores.innerHTML = `
        <div class="score-row ${data.teamAScore > data.teamBScore ? 'winner' : ''}">
            <span class="team-label">Team A</span>
            <span class="team-score">${data.teamAScore}</span>
        </div>
        <div class="score-row ${data.teamBScore > data.teamAScore ? 'winner' : ''}">
            <span class="team-label">Team B</span>
            <span class="team-score">${data.teamBScore}</span>
        </div>
    `;

    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('hidden'), 4500);
}

function showGameOver(data) {
    const modal = $('game-over-modal');
    $('game-over-title').textContent = `TEAM ${data.winner} WINS!`;
    $('game-over-sub').textContent = 'Congratulations!';
    $('game-over-scores').innerHTML = `
        <div class="score-row ${data.winner === 'A' ? 'winner' : ''}">
            <span class="team-label">Team A</span>
            <span class="team-score">${data.teamAScore}</span>
        </div>
        <div class="score-row ${data.winner === 'B' ? 'winner' : ''}">
            <span class="team-label">Team B</span>
            <span class="team-score">${data.teamBScore}</span>
        </div>
    `;
    modal.classList.remove('hidden');
}