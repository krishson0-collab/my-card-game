const socket = io();

let MY_ID = null;
let MY_NAME = "";
let ROOM_ID = null;
let CURRENT_PHASE = "warmup";
let MY_VOTED_RESTART = false;
let PLAYER_NAMES = {};
let BID_WINNER_ID = null;
let CURRENT_MODE = "online";
let TEAMMATE_CARDS_VISIBLE = true;

const $ = id => document.getElementById(id);
const show = el => el.classList.remove("hidden");
const hide = el => el.classList.add("hidden");

const RIGHT_HAND_ORDER = [1, 4, 2, 3];
const TEAMMATES = { 1: 2, 2: 1, 3: 4, 4: 3 };

function getPlayerName(pid) {
    if (pid === MY_ID) return "You";
    return PLAYER_NAMES[pid] || `P${pid}`;
}

function getSeatPosition(playerId) {
    if (playerId === MY_ID) return "bottom";
    if (playerId === TEAMMATES[MY_ID]) return "top";
    const myIdx = RIGHT_HAND_ORDER.indexOf(MY_ID);
    const rightPlayer = RIGHT_HAND_ORDER[(myIdx + 1) % 4];
    const leftPlayer = RIGHT_HAND_ORDER[(myIdx + 3) % 4];
    if (playerId === rightPlayer) return "right";
    if (playerId === leftPlayer) return "left";
    return null;
}

$("sound-btn").onclick = () => {
    Sound.init();
    Sound.enabled = !Sound.enabled;
    const btn = $("sound-btn");
    btn.querySelector(".icon-emoji").textContent = Sound.enabled ? "🔊" : "🔇";
    const status = $("sound-status");
    if (status) status.textContent = Sound.enabled ? "On" : "Off";
    if (Sound.enabled) Sound.bid();
    vibrate(30);
};

// LOBBY
function openLobbyForm(mode) {
    CURRENT_MODE = mode;
    const form = $("lobby-form");
    const title = $("form-title");
    const roomCodeGroup = $("room-code-group");
    const roomPassGroup = $("room-pass-group");

    roomCodeGroup.classList.remove("hidden");
    roomPassGroup.classList.remove("hidden");

    if (mode === "bot") {
        title.textContent = "🤖 Practice Mode";
        roomCodeGroup.classList.add("hidden");
        roomPassGroup.classList.add("hidden");
    } else if (mode === "online") {
        title.textContent = "🌐 Play Online";
        roomPassGroup.classList.add("hidden");
    } else if (mode === "private") {
        title.textContent = "🔒 Private Room";
    } else if (mode === "local") {
        title.textContent = "📱 Play Locally";
    }

    $("lobby-msg").textContent = "";
    show(form);
}

$("bot-btn").onclick = () => { Sound.bid(); vibrate(30); openLobbyForm("bot"); };
$("online-btn").onclick = () => { Sound.bid(); vibrate(30); openLobbyForm("online"); };
$("private-btn").onclick = () => { Sound.bid(); vibrate(30); openLobbyForm("private"); };
$("local-btn").onclick = () => { Sound.bid(); vibrate(30); openLobbyForm("local"); };
$("form-back").onclick = () => { Sound.pass(); hide($("lobby-form")); };

$("join-btn").onclick = () => {
    const name = $("player-name").value.trim() || "Player";
    const room = $("room-id").value.trim().toLowerCase();
    const password = $("room-password").value.trim();

    $("profile-name-display").textContent = name;
    localStorage.setItem("playerName", name);

    if (CURRENT_MODE === "bot") {
        const botRoom = "bot_" + Date.now();
        Sound.bid(); vibrate(30);
        socket.emit("startBotGame", { roomId: botRoom, playerName: name });
        return;
    }

    if (!room) return ($("lobby-msg").textContent = "Room code daalo");
    if (CURRENT_MODE === "private" && !password) return ($("lobby-msg").textContent = "Password daalo");

    ROOM_ID = room;
    MY_NAME = name;
    socket.emit("joinRoom", { roomId: room, playerName: name, password });
};

const savedName = localStorage.getItem("playerName");
if (savedName) $("profile-name-display").textContent = savedName;

socket.on("joinError", msg => { $("lobby-msg").textContent = "❌ " + msg; Sound.error(); });
socket.on("joined", data => {
    MY_ID = data.playerId;
    ROOM_ID = data.roomId;
    hide($("lobby"));
    show($("game"));
});
socket.on("roomUpdate", data => {
    data.players.forEach(p => { PLAYER_NAMES[p.id] = p.name; });
    const list = $("players-list");
    list.innerHTML = "<h3>Players:</h3>";
    data.players.forEach(p => {
        const d = document.createElement("div");
        d.textContent = `${p.name} (P${p.id}) — ${p.connected ? "✅" : "❌"}`;
        list.appendChild(d);
    });
    refreshAllSeats();
});
socket.on("errorMsg", msg => { showMsg("❌ " + msg); Sound.error(); vibrate(80); });

$("reset-vote-btn").onclick = () => { Sound.bid(); vibrate(30); socket.emit("voteRestart"); };
socket.on("restartVotesUpdate", data => {
    $("reset-vote-badge").textContent = data.total;
    $("reset-vote-info").textContent = `${data.total}/4`;
    MY_VOTED_RESTART = data.votes.includes(MY_ID);
    $("reset-vote-btn").classList.toggle("voted", MY_VOTED_RESTART);
});
socket.on("gameRestarted", () => {
    MY_VOTED_RESTART = false;
    $("reset-vote-badge").textContent = "0";
    $("reset-vote-btn").classList.remove("voted");
});

$("history-btn").onclick = () => { Sound.bid(); show($("history-overlay")); show($("history-panel")); };
$("close-history-btn").onclick = () => { hide($("history-overlay")); hide($("history-panel")); };
$("history-overlay").onclick = () => { hide($("history-overlay")); hide($("history-panel")); };

$("settings-btn").onclick = () => { Sound.bid(); vibrate(30); show($("settings-panel")); };
$("close-settings-btn").onclick = () => { hide($("settings-panel")); };
$("settings-sound").onclick = () => { $("sound-btn").onclick(); };
$("settings-history").onclick = () => { hide($("settings-panel")); show($("history-overlay")); show($("history-panel")); };
$("settings-leave").onclick = () => { hide($("settings-panel")); show($("leave-confirm-panel")); };

$("leave-fab").onclick = () => { Sound.pass(); vibrate(50); show($("leave-confirm-panel")); };
$("leave-confirm-no").onclick = () => { hide($("leave-confirm-panel")); };
$("leave-confirm-yes").onclick = () => {
    Sound.pass(); vibrate(100);
    socket.emit("leaveRoom");
    hide($("leave-confirm-panel"));
    hide($("game"));
    show($("lobby"));
    MY_ID = null; ROOM_ID = null; PLAYER_NAMES = {}; BID_WINNER_ID = null;
    $("players-list").innerHTML = "";
    hide($("lobby-form"));
};
socket.on("playerLeft", data => { showMsg(`👋 ${data.playerName} ne room chhod diya`); Sound.pass(); });

// GAME START
socket.on("gameStart", data => {
    MY_ID = data.yourId;
    CURRENT_PHASE = data.phase;
    data.players.forEach(p => { PLAYER_NAMES[p.id] = p.name; });
    BID_WINNER_ID = null;
    TEAMMATE_CARDS_VISIBLE = true;

    refreshAllSeats();
    updatePhaseUI(data.phase);
    renderHand(data.yourHand);
    updatePlayerStats(data.players.map(p => ({ ...p, tricks: 0 })));
    resetAllTricks();
    renderBidHistory(data.bidHistory);

    // Reset trump
    $("trump-display").textContent = "-";
    $("trump-chooser-name").textContent = "";
    const tIcon = $("trump-icon");
    const tName = $("trump-name-small");
    const tIndicator = $("trump-indicator");
    if (tIcon) tIcon.textContent = "-";
    if (tName) tName.textContent = "";
    if (tIndicator) tIndicator.classList.add("empty");

    $("team-a-score").textContent = data.teamAScore || 0;
    $("team-b-score").textContent = data.teamBScore || 0;

    clearAllSlots();
    hide($("teammate-cards"));
    $("teammate-cards-list").innerHTML = "";
    clearActiveLeader();
    clearBidWinner();

    // Hide bid UI — table khali
    $("bid-ui").classList.remove("active");

    showMsg(data.phase === "warmup" ? "🔥 WARMUP — 5 cards" : "🃏 MAIN ROUND — 13 cards");
    Sound.deal();
    vibrate(50);
    enableBidButtons(false);
});

function refreshAllSeats() {
    ["top", "left", "right", "bottom"].forEach(pos => {
        const nameEl = $(`${pos}-name`);
        if (nameEl) {
            for (let pid = 1; pid <= 4; pid++) {
                if (getSeatPosition(pid) === pos) {
                    let n = PLAYER_NAMES[pid] || `P${pid}`;
                    if (pid === MY_ID) n = `${n} (You)`;
                    nameEl.textContent = n;
                    const avatarEl = $(`${pos}-avatar`);
                    if (avatarEl) {
                        const isBot = (PLAYER_NAMES[pid] || "").includes("Bot") || (PLAYER_NAMES[pid] || "").startsWith("🤖");
                        avatarEl.textContent = isBot ? "🤖" : "🧑";
                    }
                    break;
                }
            }
        }
    });
}

function updatePhaseUI(phase) {
    $("phase-display").textContent = phase === "warmup" ? "WARMUP" : "MAIN";
    if (phase === "warmup") { show($("warmup-bid-buttons")); hide($("main-bid-buttons")); }
    else { hide($("warmup-bid-buttons")); show($("main-bid-buttons")); }
}

document.querySelectorAll(".bid-button, .bid-button-warmup").forEach(b => {
    b.onclick = () => {
        if (b.disabled) return;
        Sound.bid(); vibrate(30);
        socket.emit("bid", { bid: Number(b.dataset.bid) });
    };
});
$("pass-button").onclick = () => {
    if ($("pass-button").disabled) return;
    Sound.pass(); vibrate(50); socket.emit("pass");
};
$("pass-button-main").onclick = () => {
    if ($("pass-button-main").disabled) return;
    Sound.pass(); vibrate(50); socket.emit("pass");
};

// BID UPDATE — TABLE KHALI RAKHNE KE LIYE
socket.on("bidUpdate", data => {
    CURRENT_PHASE = data.phase;
    updatePhaseUI(data.phase);
    renderBidHistory(data.bidHistory);

    const bidUi = $("bid-ui");

    if (data.biddingActive && data.nextBidderId === MY_ID) {
        // SIRF MERI BAARI MEIN SHOW
        bidUi.classList.add("active");
        $("bid-turn-info").textContent = "🎯 Tumhari baari";
        enableBidButtons(true);
        Sound.yourTurn();
        vibrate([100, 50, 100]);
    } else {
        // WARNA HIDE — TABLE KHALI
        bidUi.classList.remove("active");
        enableBidButtons(false);
    }

    if (data.biddingActive) {
        setActivePlayer(data.nextBidderId);
    } else {
        clearActivePlayer();
    }
});

function enableBidButtons(on) {
    document.querySelectorAll(".bid-button").forEach(b => b.disabled = !on);
    document.querySelectorAll(".bid-button-warmup").forEach(b => b.disabled = !on);
    $("pass-button").disabled = !on;
    $("pass-button-main").disabled = !on;
}

socket.on("biddingFinished", data => {
    showMsg(`👑 ${data.highestBidderName} — ${data.highestBid}`);
    BID_WINNER_ID = data.highestBidderId;
    setBidWinner(data.highestBidderId);
    if (data.highestBidderId === MY_ID) show($("trump-panel"));
});

socket.on("warmupSkipped", () => showMsg("⏭️ Sab pass — main round!"));

document.querySelectorAll("#trump-buttons button").forEach(b => {
    b.onclick = () => {
        Sound.bid(); vibrate(30);
        socket.emit("chooseTrump", { suit: b.dataset.suit });
        hide($("trump-panel"));
    };
});

// TRUMPOT + HUMAN dono
socket.on("trumpSet", data => {
    const chooserName = data.highestBidderName || getPlayerName(data.highestBidderId);

    $("trump-display").textContent = data.trumpSuit;
    $("trump-chooser-name").textContent = chooserName ? `(${chooserName})` : "";

    const tIcon = $("trump-icon");
    const tName = $("trump-name-small");
    const tIndicator = $("trump-indicator");

    if (tIcon) tIcon.textContent = data.trumpSuit;
    if (tName) tName.textContent = chooserName ? chooserName.split(" ")[0] : "";
    if (tIndicator) tIndicator.classList.remove("empty");

    showMsg(`👑 Trump: ${data.trumpSuit} — ${chooserName}`);
    if (data.waitReveal && data.highestBidderId === MY_ID) show($("reveal-panel"));
});

$("reveal-yes").onclick = () => { Sound.bid(); socket.emit("revealDecision", { decision: "show" }); hide($("reveal-panel")); };
$("reveal-no").onclick = () => { Sound.pass(); socket.emit("revealDecision", { decision: "hide" }); hide($("reveal-panel")); };

socket.on("teammateRevealed", data => {
    if (data.revealed) {
        showMsg("👀 Partner ke cards khul gaye");
        TEAMMATE_CARDS_VISIBLE = true;
        const list = $("teammate-cards-list");
        if (list) list.style.display = "flex";
        const btn = $("toggle-reveal-btn");
        if (btn) { btn.textContent = "🙈 Hide"; btn.classList.remove("hidden-state"); }
    } else {
        showMsg("🔒 Partner ke cards chhupe rahenge");
        hide($("teammate-cards"));
    }
});

$("toggle-reveal-btn").onclick = () => {
    TEAMMATE_CARDS_VISIBLE = !TEAMMATE_CARDS_VISIBLE;
    const btn = $("toggle-reveal-btn");
    const list = $("teammate-cards-list");
    if (TEAMMATE_CARDS_VISIBLE) {
        list.style.display = "flex";
        btn.textContent = "🙈 Hide";
        btn.classList.remove("hidden-state");
    } else {
        list.style.display = "none";
        btn.textContent = "👁️ Show";
        btn.classList.add("hidden-state");
    }
    Sound.bid(); vibrate(30);
};

// ROUND STARTED — TRUMP DISPLAY FIX (BOT KE LIYE BHI)
socket.on("roundStarted", data => {
    CURRENT_PHASE = data.phase;
    updatePhaseUI(data.phase);
    renderHand(data.yourHand);

    // TRUMP DISPLAY UPDATE
    $("trump-display").textContent = data.trumpSuit;

    const tIcon = $("trump-icon");
    const tName = $("trump-name-small");
    const tIndicator = $("trump-indicator");

    if (tIcon && data.trumpSuit) {
        tIcon.textContent = data.trumpSuit;
        if (tIndicator) tIndicator.classList.remove("empty");
        if (tName && data.bidWinnerId) {
            const name = PLAYER_NAMES[data.bidWinnerId] || `P${data.bidWinnerId}`;
            tName.textContent = name.split(" ")[0];
        }
    }

    updatePlayerStats(data.handSizes);
    resetAllTricks();
    clearAllSlots();
    TEAMMATE_CARDS_VISIBLE = true;

    // HIDE BID UI — TABLE KHALI
    $("bid-ui").classList.remove("active");

    if (data.revealedHand && data.revealedHand.length > 0) {
        renderTeammateCards(data.revealedHand, data.revealedOwnerId);
    } else {
        hide($("teammate-cards"));
    }

    if (data.bidWinnerId) { BID_WINNER_ID = data.bidWinnerId; setBidWinner(data.bidWinnerId); }
    if (data.currentPlayerId === MY_ID) { Sound.yourTurn(); vibrate([100, 50, 100]); }
    setActivePlayer(data.currentPlayerId);
    setTrickLeader(data.leadPlayerId || data.currentPlayerId);
    showMsg(data.currentPlayerId === MY_ID ? "🎯 Tumhari baari" : `⏳ ${getPlayerName(data.currentPlayerId)} ki baari`);
});

function createCardEl(card, isPlayable = false) {
    const d = document.createElement("div");
    d.className = "card";
    const isRed = card.suit === "♥️" || card.suit === "♦️";
    if (isRed) d.classList.add("red"); else d.classList.add("black");

    const rankEl = document.createElement("div");
    rankEl.className = "c-rank";
    rankEl.textContent = card.rank;

    const suitEl = document.createElement("div");
    suitEl.className = "c-suit";
    suitEl.textContent = card.suit;

    d.appendChild(rankEl); d.appendChild(suitEl);
    if (isPlayable) d.classList.add("playable");
    return d;
}

function renderHand(hand) {
    const c = $("player1-cards");
    c.innerHTML = "";
    hand.forEach((card, i) => {
        const d = createCardEl(card);
        d.onclick = () => { Sound.cardPlay(); vibrate(20); socket.emit("playCard", { cardIndex: i }); };
        c.appendChild(d);
    });
}

socket.on("handUpdate", data => renderHand(data.hand));

socket.on("cardPlayed", data => {
    renderPlayedCards(data.trickCards);
    requestAnimationFrame(() => renderPlayedCards(data.trickCards));
    setTimeout(() => renderPlayedCards(data.trickCards), 100);
    Sound.cardPlay();
    const displayName = data.playerName || getPlayerName(data.playerId);
    showMsg(`${displayName} → ${data.card.rank}${data.card.suit}`);
    if (data.nextPlayerId) {
        setActivePlayer(data.nextPlayerId);
        if (data.nextPlayerId === MY_ID) {
            setTimeout(() => { Sound.yourTurn(); vibrate([100, 50, 100]); }, 400);
        }
    } else clearActivePlayer();
    if (data.leadPlayerId) setTrickLeader(data.leadPlayerId);
});

function renderPlayedCards(trickCards) {
    if (!trickCards) return;
    clearAllSlots();
    trickCards.forEach(item => {
        const pid = item.playerIndex + 1;
        const pos = getSeatPosition(pid);
        if (!pos) return;
        const slot = $(`slot-${pos}`);
        if (!slot) return;
        slot.appendChild(createCardEl(item.card));
    });
    document.body.offsetHeight;
}

function clearAllSlots() {
    ["top", "left", "right", "bottom"].forEach(pos => {
        const slot = $(`slot-${pos}`);
        if (slot) slot.innerHTML = "";
    });
}

socket.on("revealedHandUpdate", data => renderTeammateCards(data.revealedHand, data.revealedOwnerId));

function renderTeammateCards(hand, ownerId) {
    show($("teammate-cards"));
    $("revealed-owner").textContent = `${PLAYER_NAMES[ownerId] || "P" + ownerId}`;
    const c = $("teammate-cards-list");
    c.innerHTML = "";
    hand.forEach(card => c.appendChild(createCardEl(card)));
    c.style.display = "flex";
    const btn = $("toggle-reveal-btn");
    if (btn) { btn.textContent = "🙈 Hide"; btn.classList.remove("hidden-state"); }
}

socket.on("trickResolved", data => {
    if (data.warmupFailed) showMsg(`💥 Warmup khatam — bidder ki team haar gayi!`);
    else showMsg(`🏆 ${getPlayerName(data.winnerId)} ne trick ${data.trickNumber} jeeti`);
    if (data.winnerId === MY_ID) { Sound.trickWin(); vibrate([50, 30, 50, 30, 100]); }
    setTimeout(() => clearAllSlots(), 1200);
    updatePlayerStats(data.players);
    setActivePlayer(data.nextPlayerId);
    setTrickLeader(data.leadPlayerId || data.nextPlayerId);
});

socket.on("roundEnd", result => {
    $("team-a-score").textContent = result.teamAScore;
    $("team-b-score").textContent = result.teamBScore;
    let summary;
    if (result.phase === "warmup") {
        if (result.success) {
            summary = `🔥 WARMUP: Team ${result.bidderTeam} ne 5/5 liye → Team ${result.bonusTeam} +26`;
            showMsg(`🏁 WARMUP WIN — Team ${result.bonusTeam} +26`);
        } else {
            summary = `💥 WARMUP: Team ${result.bidderTeam} fail → -26`;
            showMsg(`🏁 WARMUP FAIL — Team ${result.bidderTeam} -26`);
        }
    } else {
        const sign = result.sar >= 0 ? "+" : "";
        summary = `🎴 MAIN: Team ${result.team} bid ${result.bid}, ${result.tricks} tricks → ${sign}${result.sar}`;
        showMsg(`🏁 Round — Team ${result.team}: ${result.tricks} tricks, SAR ${sign}${result.sar}`);
    }
    addRoundHistory(summary, result.teamAScore, result.teamBScore);
});

function addRoundHistory(text, aScore, bScore) {
    const c = $("round-history-list");
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `<div class="history-text">${text}</div><div class="history-scores">A: ${aScore} | B: ${bScore}</div>`;
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
}

socket.on("gameOver", data => {
    const winnerName = data.winner === "A" ? "Team A" : "Team B";
    $("winner-team").textContent = `🎉 ${winnerName} Wins!`;
    $("final-team-a").textContent = data.teamAScore + " SAR";
    $("final-team-b").textContent = data.teamBScore + " SAR";
    $("final-row-a").classList.toggle("winner", data.winner === "A");
    $("final-row-b").classList.toggle("winner", data.winner === "B");
    $("result-message").textContent = `Team ${data.winner} ne 52 SAR cross kiye!`;
    show($("game-over-panel"));
    const myTeam = (MY_ID === 1 || MY_ID === 2) ? "A" : "B";
    if (data.winner === myTeam) { Sound.gameWin(); launchConfetti(); vibrate([200, 100, 200, 100, 400]); }
    else { Sound.gameLose(); vibrate(500); }
});

$("close-result-btn").onclick = () => hide($("game-over-panel"));

function getSeatElByPlayerId(pid) {
    const pos = getSeatPosition(pid);
    if (!pos) return null;
    return $(`seat-${pos}`);
}
function setActivePlayer(pid) {
    document.querySelectorAll(".seat").forEach(el => el.classList.remove("active"));
    if (!pid) return;
    const seat = getSeatElByPlayerId(pid);
    if (seat) seat.classList.add("active");
}
function clearActivePlayer() { document.querySelectorAll(".seat").forEach(el => el.classList.remove("active")); }
function setTrickLeader(pid) {
    document.querySelectorAll(".seat").forEach(el => el.classList.remove("leader"));
    if (!pid) return;
    const seat = getSeatElByPlayerId(pid);
    if (seat) seat.classList.add("leader");
}
function clearActiveLeader() { document.querySelectorAll(".seat").forEach(el => el.classList.remove("leader", "active")); }
function setBidWinner(pid) {
    document.querySelectorAll(".seat").forEach(el => el.classList.remove("bid-winner"));
    if (!pid) return;
    const seat = getSeatElByPlayerId(pid);
    if (seat) seat.classList.add("bid-winner");
}
function clearBidWinner() { document.querySelectorAll(".seat").forEach(el => el.classList.remove("bid-winner")); }

function updatePlayerStats(players) {
    players.forEach(p => {
        const pos = getSeatPosition(p.id);
        if (!pos) return;
        const countEl = $(`${pos}-count`);
        if (countEl) {
            const size = p.handSize !== undefined ? p.handSize : p.size;
            if (size !== undefined) countEl.textContent = size;
        }
        const tricksEl = $(`${pos}-tricks`);
        if (tricksEl && p.tricks !== undefined) tricksEl.textContent = p.tricks;
    });
    const myPlayer = players.find(p => p.id === MY_ID);
    if (myPlayer) {
        const bottomTricks = $("bottom-tricks");
        if (bottomTricks && myPlayer.tricks !== undefined) bottomTricks.textContent = myPlayer.tricks;
    }
}
function resetAllTricks() {
    ["top", "left", "right", "bottom"].forEach(pos => {
        const el = $(`${pos}-tricks`);
        if (el) el.textContent = "0";
    });
}

function renderBidHistory(history) {
    const c = $("bid-history-list");
    if (!c) return;
    c.innerHTML = "";
    if (!history || history.length === 0) {
        c.innerHTML = '<div class="bid-empty">No bids yet...</div>';
        return;
    }
    history.forEach(item => {
        const d = document.createElement("div");
        d.className = "bid-item";
        const parts = item.split(" → ");
        const player = parts[0] || "?";
        const action = parts[1] || "";
        if (action.includes("PASS")) {
            d.classList.add("pass");
            if (action.includes("auto")) d.classList.add("auto-pass");
        } else if (action.includes("Bid")) d.classList.add("bid");

        const ps = document.createElement("span");
        ps.className = "bid-player";
        ps.textContent = player;

        const as = document.createElement("span");
        as.className = "bid-value";
        as.textContent = action.replace("(auto)", "").replace("⚠️", "").trim();

        d.appendChild(ps); d.appendChild(as);
        c.appendChild(d);
    });
    c.scrollTop = c.scrollHeight;
}

function showMsg(msg) { $("game-message").textContent = msg; }