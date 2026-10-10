/* Desi Call Break — Client */
const socket = io();

const S = {
    myId: null, roomId: null, isSpectator: false, myHand: [],
    phase: 'warmup', trumpSuit: null, currentPlayerId: null,
    leadPlayerId: null, currentBid: 7, highestBid: 7, highestBidderId: null,
    biddingActive: false, nextBidderId: null,
    handSizes: {}, tricks: {}, revealedHand: null, revealedOwnerId: null,
    bidWinnerId: null, teamAScore: 0, teamBScore: 0, totalTricks: 5,
    playerNames: {}, playerTeams: {}, bidHistory: [], playerBids: {},
    isPlayingCard: false, cardJustPlayed: false, lastResolvedTrick: -1,
    seatMap: {}, pcMap: {}
};

const $ = id => document.getElementById(id);

const SEAT_MAP = {
    1: { top: 2, left: 3, right: 4 },
    2: { top: 1, left: 4, right: 3 },
    3: { top: 4, left: 2, right: 1 },
    4: { top: 3, left: 1, right: 2 }
};

function buildMaps() {
    const m = SEAT_MAP[S.myId] || SEAT_MAP[1];
    S.seatMap = { 'seat-top': m.top, 'seat-left': m.left, 'seat-right': m.right };
    S.pcMap = { 'pc-top': m.top, 'pc-left': m.left, 'pc-right': m.right, 'pc-bottom': S.myId };
}

/* ============ LOBBY ============ */
const btnJoin = $('btn-join');
if (btnJoin) btnJoin.addEventListener('click', () => {
    const name = $('input-name').value.trim() || 'Player';
    const room = $('input-room').value.trim();
    const pass = $('input-pass').value.trim();
    if (!room) return showLobbyMsg('Enter a Room ID');
    socket.emit('joinRoom', { roomId: room, playerName: name, password: pass || null });
});

const btnBot = $('btn-bot');
if (btnBot) btnBot.addEventListener('click', () => {
    const name = $('input-name').value.trim() || 'You';
    const roomId = 'bot_' + Math.random().toString(36).slice(2, 8);
    socket.emit('startBotGame', { roomId, playerName: name });
});

const btnSpectate = $('btn-spectate');
if (btnSpectate) btnSpectate.addEventListener('click', () => {
    const name = $('input-name').value.trim() || 'Spectator';
    const room = $('input-room').value.trim();
    if (!room) return showLobbyMsg('Enter Room ID to spectate');
    socket.emit('joinRoom', { roomId: room, playerName: name, isSpectator: true });
});

function showLobbyMsg(msg) {
    const el = $('lobby-msg');
    if (!el) return;
    el.textContent = msg;
    setTimeout(() => el.textContent = '', 3500);
}

/* ============ SOCKET ============ */
socket.on('joined', data => {
    S.myId = data.playerId; S.roomId = data.roomId; S.isSpectator = !!data.isSpectator;
    const lobbyEl = $('lobby'); if (lobbyEl) lobbyEl.classList.add('hidden');
    const gameEl = $('game'); if (gameEl) gameEl.classList.remove('hidden');
    buildMaps();
    if (S.isSpectator) {
        const sb = $('spectator-banner'); if (sb) sb.classList.remove('hidden');
        const ma = $('my-area'); if (ma) ma.classList.add('hidden');
        const bu = $('bid-ui'); if (bu) bu.classList.remove('active');
    }
});

socket.on('joinError', msg => showLobbyMsg(msg));

socket.on('roomUpdate', data => {
    data.players.forEach(p => {
        S.playerNames[p.id] = p.name;
        S.playerTeams[p.id] = p.team;
    });
    renderAllSeats();
});

socket.on('gameStart', data => {
    S.myId = data.yourId; S.myHand = data.yourHand || [];
    S.phase = data.phase; S.currentBid = data.currentBid;
    S.teamAScore = data.teamAScore; S.teamBScore = data.teamBScore;
    S.totalTricks = data.phase === 'warmup' ? 5 : 13;
    S.revealedHand = null; S.revealedOwnerId = null;
    S.bidWinnerId = null; S.trumpSuit = null;
    S.playerBids = {}; S.leadPlayerId = null;
    S.isPlayingCard = false; S.cardJustPlayed = false; S.lastResolvedTrick = -1;
    buildMaps();
    data.players.forEach(p => {
        S.playerNames[p.id] = p.name; S.playerTeams[p.id] = p.team;
        S.handSizes[p.id] = p.handSize; S.tricks[p.id] = p.tricks;
    });
    S.bidHistory = data.bidHistory || [];
    renderBidHistory();
    renderBidBadges();
    const tc = $('teammate-cards'); if (tc) tc.classList.add('hidden');
    document.querySelectorAll('.pc-slot').forEach(s => s.innerHTML = '');
    document.querySelectorAll('.seat').forEach(s => s.classList.remove('active', 'bid-winner', 'leader'));
    renderGame();
    renderAllSeats();
    if (data.currentBidderId && data.currentBidderId !== S.myId) {
        renderBidTurnGlow(data.currentBidderId);
    }
    if (data.currentBidderId === S.myId) renderBidUI();
});

socket.on('bidUpdate', data => {
    S.currentBid = data.currentBid; S.highestBid = data.highestBid;
    S.highestBidderId = data.highestBidderId;
    S.biddingActive = data.biddingActive; S.nextBidderId = data.nextBidderId;
    S.phase = data.phase; S.bidHistory = data.bidHistory || [];
    parseBidHistory(S.bidHistory);
    renderBidHistory();
    renderBidBadges();
    if (data.biddingActive && data.nextBidderId) {
        renderBidTurnGlow(data.nextBidderId);
    } else {
        document.querySelectorAll('.seat').forEach(s => s.classList.remove('active'));
    }
    if (data.biddingActive && data.nextBidderId === S.myId && !S.isSpectator) renderBidUI();
    else { const bu = $('bid-ui'); if (bu) bu.classList.remove('active'); }
});

socket.on('biddingFinished', data => {
    S.highestBid = data.highestBid; S.highestBidderId = data.highestBidderId;
    S.biddingActive = false;
    const bu = $('bid-ui'); if (bu) bu.classList.remove('active');
    document.querySelectorAll('.seat').forEach(s => s.classList.remove('active'));
    renderCrown();
    if (data.highestBidderId === S.myId && !S.isSpectator) {
        const tm = $('trump-modal'); if (tm) tm.classList.remove('hidden');
    }
});

socket.on('warmupSkipped', () => {});

socket.on('trumpSet', data => {
    S.trumpSuit = data.trumpSuit; S.highestBidderId = data.highestBidderId;
    updateTrumpIndicator();
    if (data.waitReveal && data.highestBidderId === S.myId && !S.isSpectator) {
        const rm = $('reveal-modal'); if (rm) rm.classList.remove('hidden');
    }
});

socket.on('teammateRevealed', data => {});

socket.on('roundStarted', data => {
    S.myHand = data.yourHand || [];
    S.trumpSuit = data.trumpSuit;
    S.currentPlayerId = data.currentPlayerId;
    S.leadPlayerId = data.leadPlayerId;
    S.revealedHand = data.revealedHand;
    S.revealedOwnerId = data.revealedOwnerId;
    S.bidWinnerId = data.bidWinnerId;
    S.phase = data.phase;
    S.totalTricks = data.totalTricks;
    S.isPlayingCard = false; S.cardJustPlayed = false; S.lastResolvedTrick = -1;
    document.querySelectorAll('.pc-slot').forEach(s => s.innerHTML = '');
    data.handSizes.forEach(h => { S.handSizes[h.id] = h.size; S.tricks[h.id] = h.tricks; });
    if (S.revealedHand && S.revealedHand.length > 0) {
        const tc = $('teammate-cards'); if (tc) tc.classList.remove('hidden');
        renderTeammateHand();
    }
    updateTrumpIndicator();
    renderGame();
    renderCrown();
    renderLeaderStar();
    renderBidBadges();
});

socket.on('cardPlayed', data => {
    const slot = findPcSlotForPlayer(data.playerId);
    if (slot) {
        const slotEl = $(slot);
        if (slotEl) { slotEl.innerHTML = ''; slotEl.appendChild(makeCardEl(data.card)); }
    }
    if (data.playerId === S.myId) S.isPlayingCard = false;
    S.currentPlayerId = data.nextPlayerId;
    if (data.leadPlayerId) S.leadPlayerId = data.leadPlayerId;
    renderTurnIndicator();
    renderLeaderStar();
    highlightPlayable();
});

socket.on('handUpdate', data => {
    S.myHand = data.hand || [];
    renderMyHand();
    highlightPlayable();
});

socket.on('trickResolved', data => {
    data.players.forEach(p => { S.tricks[p.id] = p.tricks; S.handSizes[p.id] = p.handSize; });
    renderScores();
    S.cardJustPlayed = false;
    S.isPlayingCard = false;
    if (data.bidBroken) showToast('💥 Bid Broken!', 1500);
    const thisTrick = data.trickNumber;
    S.lastResolvedTrick = thisTrick;
    setTimeout(() => {
        if (S.lastResolvedTrick === thisTrick && S.currentPlayerId === data.nextPlayerId) {
            document.querySelectorAll('.pc-slot').forEach(s => s.innerHTML = '');
        }
    }, 800);
    S.currentPlayerId = data.nextPlayerId;
    if (data.leadPlayerId) S.leadPlayerId = data.leadPlayerId;
    renderTurnIndicator();
    renderLeaderStar();
});

socket.on('revealedHandUpdate', data => {
    S.revealedHand = data.revealedHand;
    S.revealedOwnerId = data.revealedOwnerId;
    if (S.revealedHand && S.revealedHand.length > 0) {
        const tc = $('teammate-cards'); if (tc) tc.classList.remove('hidden');
        renderTeammateHand();
    }
});

socket.on('roundEnd', data => showRoundEnd(data));
socket.on('gameOver', data => showGameOver(data));
socket.on('gameRestarted', () => {
    const go = $('game-over-modal'); if (go) go.classList.add('hidden');
    const re = $('round-end-modal'); if (re) re.classList.add('hidden');
});
socket.on('restartVotesUpdate', data => { const el = $('vote-badge'); if (el) el.textContent = data.total; });
socket.on('errorMsg', msg => console.warn('Server error:', msg));
socket.on('playerLeft', data => console.log(data.playerName + ' left'));
socket.on('spectatorJoined', data => {
    if (!data.room) return;
    S.teamAScore = data.room.teamAScore; S.teamBScore = data.room.teamBScore; S.phase = data.room.phase;
    data.room.players.forEach(p => {
        S.playerNames[p.id] = p.name; S.playerTeams[p.id] = p.team;
        S.handSizes[p.id] = p.handSize; S.tricks[p.id] = p.tricks;
    });
    renderGame();
});

/* ============ HELPERS ============ */
function findPcSlotForPlayer(pid) {
    if (pid === S.myId) return 'pc-bottom';
    for (const slot in S.pcMap) {
        if (S.pcMap[slot] === pid) return slot;
    }
    return null;
}

function findSeatForPlayer(pid) {
    if (pid === S.myId) return null;
    for (const seat in S.seatMap) {
        if (S.seatMap[seat] === pid) return seat;
    }
    return null;
}

function renderAllSeats() {
    ['seat-top', 'seat-left', 'seat-right'].forEach(seatId => {
        const pid = S.seatMap[seatId];
        if (!pid) return;
        const seatEl = $(seatId);
        if (!seatEl) return;
        const nameEl = seatEl.querySelector('.pb-name');
        if (nameEl) nameEl.textContent = S.playerNames[pid] || 'Waiting';
        const badge = seatEl.querySelector('.score-badge');
        if (badge) badge.textContent = `${S.tricks[pid] || 0}/${S.totalTricks}`;
    });
}

/* ============ RENDERING ============ */
function renderGame() {
    renderMyHand(); renderScores(); renderTurnIndicator();
    updateTrumpIndicator(); renderCrown(); renderLeaderStar();
    const phaseEl = $('phase-label');
    if (phaseEl) phaseEl.textContent = S.phase === 'warmup' ? 'WARMUP' : 'MAIN';
    const myTricks = S.tricks[S.myId] || 0;
    const trickEl = $('tricks-label');
    if (trickEl) trickEl.textContent = `${myTricks}/${S.totalTricks}`;
    if (S.playerNames[S.myId]) {
        const myNameEl = $('my-name');
        if (myNameEl) myNameEl.textContent = S.playerNames[S.myId];
    }
}

function renderMyHand() {
    if (S.isSpectator) return;
    const el = $('player1-cards');
    if (!el) return;
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
    const aEl = $('score-a'); if (aEl) aEl.textContent = S.teamAScore;
    const bEl = $('score-b'); if (bEl) bEl.textContent = S.teamBScore;
    renderAllSeats();
    const myTrickEl = $('my-tricks'); if (myTrickEl) myTrickEl.textContent = S.tricks[S.myId] || 0;
    const trickEl = $('tricks-label'); if (trickEl) trickEl.textContent = `${S.tricks[S.myId] || 0}/${S.totalTricks}`;
}

function renderTurnIndicator() {
    document.querySelectorAll('.seat').forEach(s => s.classList.remove('active'));
    if (S.currentPlayerId && S.currentPlayerId !== S.myId) {
        const seatId = findSeatForPlayer(S.currentPlayerId);
        if (seatId) { const el = $(seatId); if (el) el.classList.add('active'); }
    }
    highlightPlayable();
}

function renderBidTurnGlow(bidderId) {
    document.querySelectorAll('.seat').forEach(s => s.classList.remove('active'));
    if (bidderId && bidderId !== S.myId) {
        const seatId = findSeatForPlayer(bidderId);
        if (seatId) { const el = $(seatId); if (el) el.classList.add('active'); }
    }
}

function renderLeaderStar() {
    document.querySelectorAll('.seat').forEach(s => s.classList.remove('leader'));
    if (S.leadPlayerId !== null && S.leadPlayerId !== S.myId) {
        const seatId = findSeatForPlayer(S.leadPlayerId);
        if (seatId) { const el = $(seatId); if (el) el.classList.add('leader'); }
    }
}

function highlightPlayable() {
    document.querySelectorAll('#player1-cards .card').forEach(c => c.classList.remove('playable'));
    if (S.currentPlayerId !== S.myId) return;
    if (!S.myHand.length) return;
    document.querySelectorAll('#player1-cards .card').forEach(c => c.classList.add('playable'));
}

function updateTrumpIndicator() {
    const el = $('trump-indicator');
    if (!el) return;
    if (!S.trumpSuit) {
        el.classList.add('empty');
        const iconEl = $('trump-icon'); if (iconEl) iconEl.textContent = '?';
        const nameEl = $('trump-name-small'); if (nameEl) nameEl.textContent = 'No Trump';
    } else {
        el.classList.remove('empty');
        const iconEl = $('trump-icon'); if (iconEl) iconEl.textContent = S.trumpSuit;
        const nameEl = $('trump-name-small');
        if (nameEl) nameEl.textContent = S.playerNames[S.highestBidderId] || 'Trump';
    }
}

function renderBidUI() {
    let container = $('main-bid-buttons');
    if (!container) {
        console.warn('⚠️ main-bid-buttons not found — creating...');
        const bidUI = $('bid-ui');
        if (!bidUI) { console.error('❌ bid-ui missing'); return; }
        container = document.createElement('div');
        container.id = 'main-bid-buttons';
        bidUI.appendChild(container);
    }
    container.innerHTML = '';

    const infoEl = $('bid-turn-info');

    if (S.phase === 'warmup') {
        const bidBtn = document.createElement('button');
        bidBtn.textContent = 'Bid 5';
        bidBtn.onclick = () => { socket.emit('bid', { bid: 5 }); const bu = $('bid-ui'); if (bu) bu.classList.remove('active'); };
        container.appendChild(bidBtn);

        const passBtn = document.createElement('button');
        passBtn.textContent = 'PASS'; passBtn.className = 'pass-btn';
        passBtn.onclick = () => { socket.emit('pass'); const bu = $('bid-ui'); if (bu) bu.classList.remove('active'); };
        container.appendChild(passBtn);

        if (infoEl) infoEl.textContent = 'Warmup — Bid 5 or Pass';
    } else {
        const startBid = Math.max(8, S.currentBid + 1);
        for (let v = startBid; v <= 13; v++) {
            const btn = document.createElement('button');
            btn.textContent = v;
            btn.onclick = () => { socket.emit('bid', { bid: v }); const bu = $('bid-ui'); if (bu) bu.classList.remove('active'); };
            container.appendChild(btn);
        }
        const passBtn = document.createElement('button');
        passBtn.textContent = 'PASS'; passBtn.className = 'pass-btn';
        passBtn.onclick = () => { socket.emit('pass'); const bu = $('bid-ui'); if (bu) bu.classList.remove('active'); };
        container.appendChild(passBtn);

        if (infoEl) infoEl.textContent = `Bid above ${S.currentBid}`;
    }

    const bu = $('bid-ui'); if (bu) bu.classList.add('active');
}

function renderBidHistory() {
    const el = $('bid-history-list');
    if (!el) return;
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

function parseBidHistory(history) {
    if (!history) return;
    history.forEach(entry => {
        const parts = entry.split(' → ');
        if (parts.length < 2) return;
        const name = parts[0].trim();
        const val = parts[1].trim();
        let foundId = null;
        for (const id in S.playerNames) {
            if (S.playerNames[id] === name) { foundId = id; break; }
        }
        if (!foundId) return;
        if (val.startsWith('Bid')) S.playerBids[foundId] = val.replace('Bid', '').trim();
        else if (val.startsWith('PASS')) S.playerBids[foundId] = 'PASS';
    });
}

function renderBidBadges() {
    document.querySelectorAll('.bid-badge').forEach(b => b.remove());
    ['seat-top', 'seat-left', 'seat-right'].forEach(seatId => {
        const pid = S.seatMap[seatId];
        if (!pid) return;
        const bid = S.playerBids[pid];
        if (!bid) return;
        const seat = $(seatId);
        if (!seat) return;
        const badge = document.createElement('div');
        badge.className = 'bid-badge ' + (bid === 'PASS' ? 'pass' : 'bid');
        badge.textContent = bid === 'PASS' ? '✕' : bid;
        const wrap = seat.querySelector('.avatar-wrap');
        if (wrap) wrap.appendChild(badge);
    });
    const myBid = S.playerBids[S.myId];
    const myRow = $('my-avatar-row');
    if (myRow) {
        myRow.querySelectorAll('.bid-badge').forEach(b => b.remove());
        if (myBid) {
            const badge = document.createElement('div');
            badge.className = 'bid-badge ' + (myBid === 'PASS' ? 'pass' : 'bid');
            badge.textContent = myBid === 'PASS' ? '✕' : myBid;
            myRow.appendChild(badge);
        }
    }
}

function renderCrown() {
    document.querySelectorAll('.seat').forEach(s => s.classList.remove('bid-winner'));
    if (S.highestBidderId !== null && S.highestBidderId !== S.myId) {
        const seatId = findSeatForPlayer(S.highestBidderId);
        if (seatId) { const el = $(seatId); if (el) el.classList.add('bid-winner'); }
    }
}

function renderTeammateHand() {
    const el = $('teammate-cards-list');
    if (!el) return;
    el.innerHTML = '';
    if (!S.revealedHand) return;
    S.revealedHand.forEach(card => { el.appendChild(makeCardEl(card)); });
    const owner = S.playerNames[S.revealedOwnerId] || 'Partner';
    const titleEl = $('partner-title');
    if (titleEl) titleEl.textContent = `👀 Partner — ${owner}`;
}

/* ============ ACTIONS ============ */
function onPlayCard(idx) {
    if (S.currentPlayerId !== S.myId) return;
    if (S.isPlayingCard) return;
    if (S.cardJustPlayed) return;
    S.isPlayingCard = true;
    S.cardJustPlayed = true;
    socket.emit('playCard', { cardIndex: idx });
    setTimeout(() => { S.isPlayingCard = false; }, 1000);
}

const trumpBtns = $('trump-buttons');
if (trumpBtns) trumpBtns.addEventListener('click', e => {
    if (e.target.tagName === 'BUTTON') {
        socket.emit('chooseTrump', { suit: e.target.dataset.suit });
        const tm = $('trump-modal'); if (tm) tm.classList.add('hidden');
    }
});

const revealYes = $('reveal-yes');
if (revealYes) revealYes.addEventListener('click', () => {
    socket.emit('revealDecision', { decision: 'show' });
    const rm = $('reveal-modal'); if (rm) rm.classList.add('hidden');
});

const revealNo = $('reveal-no');
if (revealNo) revealNo.addEventListener('click', () => {
    socket.emit('revealDecision', { decision: 'hide' });
    const rm = $('reveal-modal'); if (rm) rm.classList.add('hidden');
});

const toggleRevBtn = $('btn-toggle-reveal');
if (toggleRevBtn) toggleRevBtn.addEventListener('click', () => {
    socket.emit('toggleReveal');
    const list = $('teammate-cards-list');
    if (!list) return;
    const hidden = list.style.visibility === 'hidden';
    list.style.visibility = hidden ? 'visible' : 'hidden';
    const btn = $('btn-toggle-reveal');
    if (btn) btn.textContent = hidden ? '🙈 Hide' : '👀 Show';
});

const voteReset = $('btn-vote-reset');
if (voteReset) voteReset.addEventListener('click', () => socket.emit('voteRestart'));

const historyBtn = $('btn-history');
if (historyBtn) historyBtn.addEventListener('click', () => { const h = $('history-panel'); if (h) h.classList.remove('hidden'); });

const closeHistory = $('btn-close-history');
if (closeHistory) closeHistory.addEventListener('click', () => { const h = $('history-panel'); if (h) h.classList.add('hidden'); });

const clearHistory = $('btn-clear-history');
if (clearHistory) clearHistory.addEventListener('click', () => {
    if (confirm('Clear all history?')) {
        S.bidHistory = []; S.playerBids = {};
        renderBidHistory(); renderBidBadges();
        const rl = $('round-history-list');
        if (rl) rl.innerHTML = '<div class="bid-empty">No rounds yet</div>';
    }
});

const leaveBtn = $('btn-leave');
if (leaveBtn) leaveBtn.addEventListener('click', () => {
    if (confirm('Leave the game?')) { socket.emit('leaveRoom'); setTimeout(() => location.reload(), 300); }
});

const backLobby = $('btn-back-lobby');
if (backLobby) backLobby.addEventListener('click', () => {
    socket.emit('leaveRoom'); setTimeout(() => location.reload(), 300);
});

/* ============ MODALS ============ */
function showRoundEnd(data) {
    const modal = $('round-end-modal');
    if (!modal) return;
    const trophy = $('round-trophy');
    const title = $('round-result-title');
    const sub = $('round-result-sub');
    const scores = $('round-scores');

    if (data.phase === 'warmup') {
        if (data.success) {
            if (trophy) trophy.textContent = '😅';
            if (title) title.textContent = 'Warmup Survived';
            if (sub) sub.textContent = `${data.bidderTeam} bid 5 — opponents +26`;
        } else {
            if (trophy) trophy.textContent = '💥';
            if (title) title.textContent = 'Warmup Failed';
            if (sub) sub.textContent = `${data.bidderTeam} bid 5 and failed — -26`;
        }
    } else {
        if (data.bidBroken) {
            if (trophy) trophy.textContent = '💥';
            if (title) title.textContent = 'Bid Broken!';
            if (sub) sub.textContent = `${data.team} bid ${data.bid} — opponents broke it (${data.sar})`;
        } else if (data.sar >= 0) {
            if (trophy) trophy.textContent = '🎉';
            if (title) title.textContent = 'Bid Made!';
            if (sub) sub.textContent = `${data.team} bid ${data.bid}, won ${data.tricks} tricks (+${data.sar})`;
        } else {
            if (trophy) trophy.textContent = '💥';
            if (title) title.textContent = 'Bid Failed!';
            if (sub) sub.textContent = `${data.team} bid ${data.bid}, won only ${data.tricks} (${data.sar})`;
        }
    }
    if (scores) {
        scores.innerHTML = `
            <div class="score-row ${data.teamAScore > data.teamBScore ? 'winner' : ''}">
                <span class="team-label">Team A</span><span class="team-score">${data.teamAScore}</span>
            </div>
            <div class="score-row ${data.teamBScore > data.teamAScore ? 'winner' : ''}">
                <span class="team-label">Team B</span><span class="team-score">${data.teamBScore}</span>
            </div>`;
    }
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('hidden'), 4500);
}

function showGameOver(data) {
    const titleEl = $('game-over-title');
    const subEl = $('game-over-sub');
    const scoresEl = $('game-over-scores');
    if (titleEl) titleEl.textContent = `TEAM ${data.winner} WINS!`;
    if (subEl) subEl.textContent = 'Congratulations!';
    if (scoresEl) {
        scoresEl.innerHTML = `
            <div class="score-row ${data.winner === 'A' ? 'winner' : ''}">
                <span class="team-label">Team A</span><span class="team-score">${data.teamAScore}</span>
            </div>
            <div class="score-row ${data.winner === 'B' ? 'winner' : ''}">
                <span class="team-label">Team B</span><span class="team-score">${data.teamBScore}</span>
            </div>`;
    }
    const gm = $('game-over-modal'); if (gm) gm.classList.remove('hidden');
}

function showToast(msg, duration = 2000) {
    let toast = document.getElementById('toast-msg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-msg';
        toast.style.cssText = `position:fixed;top:30%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.9);color:#fff;padding:14px 28px;border-radius:16px;font-size:16px;font-weight:900;z-index:3000;border:2px solid #ffd966;box-shadow:0 10px 30px rgba(0,0,0,0.6);pointer-events:none;white-space:nowrap;`;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, duration);
}