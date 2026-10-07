const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

// ======================================================
// CONSTANTS
// ======================================================
const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const RANK_VALUE = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };

const RIGHT_HAND_ORDER = [0, 3, 1, 2];
const TEAMMATES = { 1: 2, 2: 1, 3: 4, 4: 3 };
const TEAMS = { A: [1, 2], B: [3, 4] };

const PHASE_WARMUP = "warmup";
const PHASE_MAIN = "main";

const WARMUP_CARDS = 5;
const WARMUP_BID = 5;
const WARMUP_TRICKS = 5;
const WARMUP_PENALTY = 26;

const MAIN_START_BID = 7;
const MAIN_MIN_BID = 8;
const MAIN_MAX_BID = 13;
const MAIN_TRICKS = 13;
const REVEAL_THRESHOLD = 9;
const WIN_SCORE = 52;

// ======================================================
// HELPERS
// ======================================================
function nextIndex(i) {
    const pos = RIGHT_HAND_ORDER.indexOf(i);
    return RIGHT_HAND_ORDER[(pos + 1) % 4];
}

function createDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r });
    return d;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function sortHand(hand) {
    const order = { "♠️": 0, "♥️": 1, "♣️": 2, "♦️": 3 };
    return [...hand].sort((a, b) => {
        if (order[a.suit] !== order[b.suit]) return order[a.suit] - order[b.suit];
        return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    });
}

// ======================================================
// ROOMS
// ======================================================
const rooms = {};

function createRoom(roomId, password) {
    return {
        id: roomId,
        password: password || null,
        phase: PHASE_WARMUP,
        players: [
            { id: 1, name: "Player 1", team: "A", hand: [], tricks: 0, socketId: null, connected: false, isBot: false },
            { id: 2, name: "Player 2", team: "A", hand: [], tricks: 0, socketId: null, connected: false, isBot: false },
            { id: 3, name: "Player 3", team: "B", hand: [], tricks: 0, socketId: null, connected: false, isBot: false },
            { id: 4, name: "Player 4", team: "B", hand: [], tricks: 0, socketId: null, connected: false, isBot: false }
        ],
        currentBid: MAIN_START_BID,
        highestBid: MAIN_START_BID,
        highestBidder: null,
        currentBidderIndex: 0,
        bidsMade: 0,
        biddingActive: false,
        warmupAllPassed: false,
        trumpSuit: null,
        teammateRevealed: false,
        revealDecision: null,
        currentPlayerIndex: 0,
        leadSuit: null,
        trickCards: [],
        trickNumber: 0,
        bidHistory: [],
        teamAScore: 0,
        teamBScore: 0,
        roundStarted: false,
        gameEnded: false,
        restartVotes: new Set(),
        isBotGame: false
    };
}

// ======================================================
// DEAL
// ======================================================
function dealWarmup(room) {
    const deck = shuffle(createDeck());
    room.phase = PHASE_WARMUP;
    room.players.forEach(p => { p.hand = []; p.tricks = 0; });
    let idx = 0;
    for (let c = 0; c < WARMUP_CARDS; c++) {
        for (let p = 0; p < 4; p++) {
            room.players[p].hand.push(deck[idx++]);
        }
    }
    room.players.forEach(p => { p.hand = sortHand(p.hand); });
    resetRoundState(room, WARMUP_BID - 1);
}

function dealMainFromWarmup(room) {
    const usedCards = new Set();
    room.players.forEach(p => p.hand.forEach(c => usedCards.add(c.rank + c.suit)));
    const availableDeck = shuffle(createDeck()).filter(c => !usedCards.has(c.rank + c.suit));
    let idx = 0;
    for (let c = 0; c < 8; c++) {
        for (let p = 0; p < 4; p++) {
            room.players[p].hand.push(availableDeck[idx++]);
        }
    }
    room.players.forEach(p => { p.hand = sortHand(p.hand); });
    room.phase = PHASE_MAIN;
    resetRoundState(room, MAIN_START_BID);
}

function resetRoundState(room, startingBid) {
    room.currentBid = startingBid;
    room.highestBid = startingBid;
    room.highestBidder = null;
    room.currentBidderIndex = 0;
    room.bidsMade = 0;
    room.biddingActive = true;
    room.warmupAllPassed = false;
    room.trumpSuit = null;
    room.teammateRevealed = false;
    room.revealDecision = null;
    room.currentPlayerIndex = 0;
    room.leadSuit = null;
    room.trickCards = [];
    room.trickNumber = 0;
    room.bidHistory = [];
    room.roundStarted = false;
}

function getCurrentBidderIndex(room) {
    return RIGHT_HAND_ORDER[room.currentBidderIndex];
}

// ======================================================
// BIDDING
// ======================================================
function handleBid(room, playerId, bid) {
    if (!room.biddingActive) return { error: "Bidding closed" };
    if (playerId - 1 !== getCurrentBidderIndex(room)) return { error: "Not your turn" };

    if (room.phase === PHASE_WARMUP) {
        if (bid !== WARMUP_BID) return { error: "Warmup mein sirf Bid 5 possible hai" };
        room.currentBid = WARMUP_BID;
        room.highestBid = WARMUP_BID;
        room.highestBidder = playerId - 1;
        room.bidHistory.push(`${room.players[playerId - 1].name} → Bid 5`);
        for (let i = 1; i < 4; i++) {
            const skipIdx = RIGHT_HAND_ORDER[(room.currentBidderIndex + i) % 4];
            room.bidHistory.push(`${room.players[skipIdx].name} → PASS (auto)`);
        }
        room.biddingActive = false;
        return { ok: true };
    }

    if (bid <= room.currentBid) return { error: "Bid must be higher" };
    if (bid < MAIN_MIN_BID || bid > MAIN_MAX_BID) return { error: "Invalid bid" };

    room.currentBid = bid;
    room.highestBid = bid;
    room.highestBidder = playerId - 1;
    room.bidHistory.push(`${room.players[playerId - 1].name} → Bid ${bid}`);
    advanceMainBidder(room);
    return { ok: true };
}

function handlePass(room, playerId) {
    if (!room.biddingActive) return { error: "Bidding closed" };
    if (playerId - 1 !== getCurrentBidderIndex(room)) return { error: "Not your turn" };
    room.bidHistory.push(`${room.players[playerId - 1].name} → PASS`);

    if (room.phase === PHASE_WARMUP) {
        room.bidsMade++;
        if (room.bidsMade >= 4) {
            room.biddingActive = false;
            room.warmupAllPassed = true;
            return { ok: true, warmupAllPassed: true };
        }
        room.currentBidderIndex = (room.currentBidderIndex + 1) % 4;
        return { ok: true };
    }

    advanceMainBidder(room);
    return { ok: true };
}

function advanceMainBidder(room) {
    room.bidsMade++;
    if (room.bidsMade >= 4) {
        if (room.highestBidder === null) {
            const forced = RIGHT_HAND_ORDER[0];
            room.highestBidder = forced;
            room.highestBid = MAIN_MIN_BID;
            room.currentBid = MAIN_MIN_BID;
            room.bidHistory.push(`⚠️ All passed — forced bid ${MAIN_MIN_BID} on ${room.players[forced].name}`);
        }
        room.biddingActive = false;
        return;
    }
    room.currentBidderIndex = (room.currentBidderIndex + 1) % 4;
}

// ======================================================
// TRUMP & REVEAL
// ======================================================
function handleTrump(room, playerId, suit) {
    if (room.highestBidder !== playerId - 1) return { error: "Not trump holder" };
    if (!SUITS.includes(suit)) return { error: "Invalid suit" };
    room.trumpSuit = suit;
    if (room.phase === PHASE_WARMUP) {
        startCardRound(room);
        return { ok: true, waitReveal: false };
    }
    if (room.highestBid >= REVEAL_THRESHOLD) return { ok: true, waitReveal: true };
    startCardRound(room);
    return { ok: true, waitReveal: false };
}

function handleRevealDecision(room, playerId, decision) {
    if (room.highestBidder !== playerId - 1) return { error: "Not trump holder" };
    if (room.trumpSuit === null) return { error: "Trump not set" };
    room.revealDecision = decision;
    room.teammateRevealed = decision === "show";
    startCardRound(room);
    return { ok: true };
}

// ======================================================
// CARD PLAY
// ======================================================
function startCardRound(room) {
    room.roundStarted = true;
    room.currentPlayerIndex = room.highestBidder;
    room.trickNumber = 0;
    room.trickCards = [];
    room.leadSuit = null;
    room.players.forEach(p => p.tricks = 0);
}

function canPlayCard(room, playerIndex, card) {
    if (!room.roundStarted) return false;
    if (room.currentPlayerIndex !== playerIndex) return false;
    if (room.trickCards.length === 0) return true;
    const player = room.players[playerIndex];
    const hasLead = player.hand.some(c => c.suit === room.leadSuit);
    if (!hasLead) return true;
    return card.suit === room.leadSuit;
}

function handlePlayCard(room, playerId, cardIndex) {
    if (!room.roundStarted) return { error: "Round not started" };
    const idx = playerId - 1;
    if (room.currentPlayerIndex !== idx) return { error: "Not your turn" };
    const player = room.players[idx];
    const card = player.hand[cardIndex];
    if (!card) return { error: "Invalid card" };
    if (!canPlayCard(room, idx, card)) return { error: "Must follow lead suit" };
    if (room.trickCards.length === 0) room.leadSuit = card.suit;
    player.hand.splice(cardIndex, 1);
    room.trickCards.push({ playerIndex: idx, card });
    if (room.trickCards.length === 4) return { ok: true, resolveTrick: true };
    room.currentPlayerIndex = nextIndex(room.currentPlayerIndex);
    return { ok: true };
}

function resolveTrick(room) {
    const winner = determineTrickWinner(room);
    room.players[winner].tricks++;
    room.trickNumber++;
    room.trickCards = [];
    room.leadSuit = null;
    room.currentPlayerIndex = winner;

    if (room.phase === PHASE_WARMUP && room.highestBidder !== null) {
        const bidderTeam = room.players[room.highestBidder].team;
        const winnerTeam = room.players[winner].team;
        if (winnerTeam !== bidderTeam) {
            return { winner, roundEnd: true, warmupFailed: true };
        }
    }

    const total = room.phase === PHASE_WARMUP ? WARMUP_TRICKS : MAIN_TRICKS;
    if (room.trickNumber >= total) return { winner, roundEnd: true };
    return { winner, roundEnd: false };
}

function determineTrickWinner(room) {
    let winner = room.trickCards[0];
    for (let i = 1; i < room.trickCards.length; i++) {
        if (beats(room, room.trickCards[i].card, winner.card)) winner = room.trickCards[i];
    }
    return winner.playerIndex;
}

function beats(room, challenger, current) {
    const cT = challenger.suit === room.trumpSuit;
    const wT = current.suit === room.trumpSuit;
    if (cT && !wT) return true;
    if (!cT && wT) return false;
    if (cT && wT) return RANK_VALUE[challenger.rank] > RANK_VALUE[current.rank];
    const cL = challenger.suit === room.leadSuit;
    const wL = current.suit === room.leadSuit;
    if (cL && !wL) return true;
    if (!cL && wL) return false;
    if (cL && wL) return RANK_VALUE[challenger.rank] > RANK_VALUE[current.rank];
    return false;
}

// ======================================================
// ROUND END
// ======================================================
function finishWarmup(room) {
    room.roundStarted = false;
    const bidderTeam = room.players[room.highestBidder].team;
    let tricksWon = 0;
    TEAMS[bidderTeam].forEach(num => tricksWon += room.players[num - 1].tricks);
    const success = tricksWon >= WARMUP_BID;
    let result;
    if (success) {
        const oppTeam = bidderTeam === "A" ? "B" : "A";
        if (oppTeam === "A") room.teamAScore += WARMUP_PENALTY;
        else room.teamBScore += WARMUP_PENALTY;
        result = { phase: PHASE_WARMUP, success: true, bidderTeam, tricks: tricksWon, bonusTeam: oppTeam, bonus: WARMUP_PENALTY, teamAScore: room.teamAScore, teamBScore: room.teamBScore };
    } else {
        if (bidderTeam === "A") room.teamAScore -= WARMUP_PENALTY;
        else room.teamBScore -= WARMUP_PENALTY;
        if (room.teamAScore < 0) room.teamAScore = 0;
        if (room.teamBScore < 0) room.teamBScore = 0;
        result = { phase: PHASE_WARMUP, success: false, bidderTeam, tricks: tricksWon, penaltyTeam: bidderTeam, penalty: WARMUP_PENALTY, teamAScore: room.teamAScore, teamBScore: room.teamBScore };
    }
    return result;
}

function finishMain(room) {
    room.roundStarted = false;
    const bidderTeam = room.players[room.highestBidder].team;
    let tricksWon = 0;
    TEAMS[bidderTeam].forEach(num => tricksWon += room.players[num - 1].tricks);

    const sar = tricksWon >= room.highestBid ? room.highestBid : -(room.highestBid * 2);

    if (bidderTeam === "A") room.teamAScore += sar;
    else room.teamBScore += sar;
    if (room.teamAScore < 0) room.teamAScore = 0;
    if (room.teamBScore < 0) room.teamBScore = 0;
    if (room.teamAScore >= WIN_SCORE) room.gameEnded = "A";
    else if (room.teamBScore >= WIN_SCORE) room.gameEnded = "B";
    else room.gameEnded = false;
    return { phase: PHASE_MAIN, team: bidderTeam, tricks: tricksWon, bid: room.highestBid, sar, teamAScore: room.teamAScore, teamBScore: room.teamBScore, gameOver: room.gameEnded };
}

// ======================================================
// BROADCAST
// ======================================================
function sendGameStart(room) {
    if (!room || !room.players) return;
    room.players.forEach(p => {
        if (!p || p.isBot) return;
        if (!p.socketId || !p.connected) return;
        try {
            io.to(p.socketId).emit("gameStart", {
                yourId: p.id, yourHand: p.hand, phase: room.phase,
                players: room.players.map(pl => ({ id: pl.id, name: pl.name, team: pl.team, handSize: pl.hand.length, tricks: pl.tricks })),
                currentBid: room.currentBid,
                currentBidderId: room.players[getCurrentBidderIndex(room)].id,
                bidHistory: room.bidHistory,
                teamAScore: room.teamAScore, teamBScore: room.teamBScore
            });
        } catch (e) { console.error("sendGameStart:", e.message); }
    });
}

function sendBidUpdate(room) {
    if (!room) return;
    try {
        io.to(room.id).emit("bidUpdate", {
            currentBid: room.currentBid, highestBid: room.highestBid,
            highestBidderId: room.highestBidder !== null && room.players[room.highestBidder] ? room.players[room.highestBidder].id : null,
            bidHistory: room.bidHistory,
            nextBidderId: room.biddingActive ? room.players[getCurrentBidderIndex(room)].id : null,
            biddingActive: room.biddingActive, phase: room.phase
        });
    } catch (e) { console.error("sendBidUpdate:", e.message); }
}

function broadcastRoundStart(room) {
    if (!room || !room.players) return;
    let revealedHand = null, revealedOwnerId = null;
    try {
        if (room.teammateRevealed && room.highestBidder !== null && room.highestBidder !== undefined && room.players[room.highestBidder]) {
            const bidderId = room.players[room.highestBidder].id;
            const mateId = TEAMMATES[bidderId];
            if (mateId && room.players[mateId - 1]) {
                revealedHand = room.players[mateId - 1].hand;
                revealedOwnerId = mateId;
            }
        }
    } catch (e) { console.error("broadcastRoundStart reveal:", e.message); }

    const bidWinnerId = (room.highestBidder !== null && room.highestBidder !== undefined && room.players[room.highestBidder])
        ? room.players[room.highestBidder].id : null;

    room.players.forEach(p => {
        if (!p || p.isBot) return;
        if (!p.socketId || !p.connected) return;
        try {
            io.to(p.socketId).emit("roundStarted", {
                yourId: p.id, yourHand: p.hand, phase: room.phase,
                trumpSuit: room.trumpSuit,
                currentPlayerId: room.players[room.currentPlayerIndex].id,
                leadPlayerId: room.players[room.currentPlayerIndex].id,
                handSizes: room.players.map(pl => ({ id: pl.id, size: pl.hand.length, tricks: pl.tricks })),
                revealedHand, revealedOwnerId, bidWinnerId,
                totalTricks: room.phase === PHASE_WARMUP ? WARMUP_TRICKS : MAIN_TRICKS
            });
        } catch (e) { console.error("broadcastRoundStart emit:", e.message); }
    });
}

function broadcastRevealedHandUpdate(room) {
    if (!room) return;
    if (!room.teammateRevealed) return;
    if (room.highestBidder === null || room.highestBidder === undefined) return;
    if (!room.players || !room.players[room.highestBidder]) return;
    const bidderId = room.players[room.highestBidder].id;
    const mateId = TEAMMATES[bidderId];
    if (!mateId) return;
    if (!room.players[mateId - 1]) return;
    try {
        io.to(room.id).emit("revealedHandUpdate", {
            revealedHand: room.players[mateId - 1].hand,
            revealedOwnerId: mateId
        });
    } catch (e) { console.error("broadcastRevealedHandUpdate:", e.message); }
}

// ======================================================
// BOT AI
// ======================================================
function scheduleBotAction(room) {
    if (!room || !room.players) return;

    if (room.biddingActive) {
        const bidderIdx = getCurrentBidderIndex(room);
        const bidder = room.players[bidderIdx];
        if (bidder && bidder.isBot) {
            setTimeout(() => botBid(room, bidder), 1400);
            return;
        }
    }

    if (room.roundStarted) {
        const player = room.players[room.currentPlayerIndex];
        if (player && player.isBot) {
            setTimeout(() => botPlay(room, player), 1100);
            return;
        }
    }
}

function botBid(room, bot) {
    if (!room.biddingActive) return;
    if (!room.players[getCurrentBidderIndex(room)]) return;
    if (room.players[getCurrentBidderIndex(room)].id !== bot.id) return;

    if (room.phase === PHASE_WARMUP) {
        const shouldBid = Math.random() > 0.5;
        if (shouldBid) handleBid(room, bot.id, 5);
        else handlePass(room, bot.id);
        sendBidUpdate(room);

        if (!room.biddingActive) {
            io.to(room.id).emit("biddingFinished", {
                highestBid: room.highestBid,
                highestBidderId: room.players[room.highestBidder].id,
                highestBidderName: room.players[room.highestBidder].name,
                phase: room.phase
            });
            if (room.warmupAllPassed) {
                io.to(room.id).emit("warmupSkipped", {});
                setTimeout(() => {
                    dealMainFromWarmup(room);
                    sendGameStart(room);
                    sendBidUpdate(room);
                    setTimeout(() => scheduleBotAction(room), 800);
                }, 1500);
            } else {
                setTimeout(() => botChooseTrump(room), 1400);
            }
        } else scheduleBotAction(room);
        return;
    }

    const strong = bot.hand.filter(c => RANK_VALUE[c.rank] >= 11).length;
    const nextBid = room.currentBid + 1;
    let shouldBid = false;

    if (strong >= 5 && nextBid <= 11) shouldBid = true;
    else if (strong >= 4 && nextBid <= 10) shouldBid = true;
    else if (strong >= 3 && nextBid <= 9) shouldBid = true;

    if (shouldBid && nextBid <= MAIN_MAX_BID) handleBid(room, bot.id, nextBid);
    else handlePass(room, bot.id);

    sendBidUpdate(room);

    if (!room.biddingActive) {
        io.to(room.id).emit("biddingFinished", {
            highestBid: room.highestBid,
            highestBidderId: room.players[room.highestBidder].id,
            highestBidderName: room.players[room.highestBidder].name,
            phase: room.phase
        });
        setTimeout(() => botChooseTrump(room), 1400);
    } else scheduleBotAction(room);
}

function botChooseTrump(room) {
    if (room.highestBidder === null || room.highestBidder === undefined) return;
    const bidder = room.players[room.highestBidder];
    if (!bidder) return;

    if (bidder.isBot) {
        const counts = { "♠️": 0, "♥️": 0, "♦️": 0, "♣️": 0 };
        bidder.hand.forEach(c => counts[c.suit]++);
        let bestSuit = "♠️";
        let maxCount = 0;
        for (const s of SUITS) {
            if (counts[s] > maxCount) { maxCount = counts[s]; bestSuit = s; }
        }

        handleTrump(room, bidder.id, bestSuit);

        io.to(room.id).emit("trumpSet", {
            trumpSuit: bestSuit,
            waitReveal: room.highestBid >= REVEAL_THRESHOLD && room.phase === PHASE_MAIN,
            highestBidderId: bidder.id,
            highestBidderName: bidder.name
        });

        if (room.highestBid >= REVEAL_THRESHOLD && room.phase === PHASE_MAIN) {
            setTimeout(() => botRevealDecision(room, bidder), 1200);
        } else {
            broadcastRoundStart(room);
            setTimeout(() => scheduleBotAction(room), 800);
        }
    }
}

function botRevealDecision(room, bot) {
    const decision = Math.random() > 0.4 ? "show" : "hide";
    handleRevealDecision(room, bot.id, decision);
    io.to(room.id).emit("teammateRevealed", { revealed: room.teammateRevealed });
    broadcastRoundStart(room);
    setTimeout(() => scheduleBotAction(room), 800);
}

function botPlay(room, bot) {
    if (!room.roundStarted) return;
    if (!room.players[room.currentPlayerIndex]) return;
    if (room.players[room.currentPlayerIndex].id !== bot.id) return;

    const playable = bot.hand.filter(c => canPlayCard(room, bot.id - 1, c));
    const choices = playable.length > 0 ? playable : bot.hand;
    choices.sort((a, b) => RANK_VALUE[a.rank] - RANK_VALUE[b.rank]);
    const card = choices[0];
    const idx = bot.hand.indexOf(card);

    const res = handlePlayCard(room, bot.id, idx);
    if (res.error) {
        const res2 = handlePlayCard(room, bot.id, 0);
        if (res2.error) return;
    }

    io.to(room.id).emit("cardPlayed", {
        playerId: bot.id,
        playerName: bot.name,
        card: room.trickCards[room.trickCards.length - 1].card,
        trickCards: room.trickCards,
        nextPlayerId: room.trickCards.length < 4 ? room.players[room.currentPlayerIndex].id : null,
        leadPlayerId: room.trickCards[0].playerIndex + 1
    });

    if (res.resolveTrick) {
        setTimeout(() => {
            const r = resolveTrick(room);
            io.to(room.id).emit("trickResolved", {
                winnerId: room.players[r.winner].id,
                trickNumber: room.trickNumber,
                nextPlayerId: room.players[room.currentPlayerIndex].id,
                leadPlayerId: room.players[room.currentPlayerIndex].id,
                warmupFailed: !!r.warmupFailed,
                players: room.players.map(p => ({ id: p.id, tricks: p.tricks, handSize: p.hand.length }))
            });
            if (r.roundEnd) {
                if (room.phase === PHASE_WARMUP) {
                    const result = finishWarmup(room);
                    io.to(room.id).emit("roundEnd", result);
                    if (room.teamAScore >= WIN_SCORE || room.teamBScore >= WIN_SCORE) {
                        const winner = room.teamAScore >= WIN_SCORE ? "A" : "B";
                        room.gameEnded = winner;
                        io.to(room.id).emit("gameOver", { winner, teamAScore: room.teamAScore, teamBScore: room.teamBScore });
                    } else {
                        setTimeout(() => {
                            dealWarmup(room);
                            sendGameStart(room);
                            sendBidUpdate(room);
                            setTimeout(() => scheduleBotAction(room), 800);
                        }, 5000);
                    }
                } else {
                    const result = finishMain(room);
                    io.to(room.id).emit("roundEnd", result);
                    if (room.gameEnded) {
                        io.to(room.id).emit("gameOver", { winner: room.gameEnded, teamAScore: room.teamAScore, teamBScore: room.teamBScore });
                    } else {
                        setTimeout(() => {
                            dealWarmup(room);
                            sendGameStart(room);
                            sendBidUpdate(room);
                            setTimeout(() => scheduleBotAction(room), 800);
                        }, 4000);
                    }
                }
            } else scheduleBotAction(room);
        }, 1200);
    } else scheduleBotAction(room);
}

// ======================================================
// SOCKET
// ======================================================
io.on("connection", socket => {
    // JOIN ROOM
    socket.on("joinRoom", ({ roomId, playerName, password }) => {
        if (rooms[roomId]) {
            const room = rooms[roomId];
            const anyConnected = room.players.some(p => p.connected);
            if (anyConnected && room.password) {
                if (!password || password !== room.password) {
                    return socket.emit("joinError", "Galat password!");
                }
            }
        } else {
            rooms[roomId] = createRoom(roomId, password || null);
        }

        const room = rooms[roomId];
        const seat = room.players.find(p => !p.connected);
        if (!seat) return socket.emit("joinError", "Room full");

        seat.connected = true;
        seat.socketId = socket.id;
        if (playerName) seat.name = playerName;

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.playerId = seat.id;

        socket.emit("joined", { playerId: seat.id, roomId });

        io.to(roomId).emit("roomUpdate", {
            players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected, team: p.team }))
        });

        const allConnected = room.players.every(p => p.connected);
        if (allConnected && !room.biddingActive && !room.roundStarted && !room.gameEnded) {
            dealWarmup(room);
            sendGameStart(room);
            sendBidUpdate(room);
        }
    });

    // ======================================================
    // START BOT GAME
    // ======================================================
    socket.on("startBotGame", ({ roomId, playerName }) => {
        console.log(`🤖 Bot game request: room=${roomId}, name=${playerName}`);

        if (rooms[roomId]) delete rooms[roomId];

        rooms[roomId] = createRoom(roomId, null);
        const room = rooms[roomId];
        room.isBotGame = true;

        const humanSeat = room.players[0];
        humanSeat.connected = true;
        humanSeat.socketId = socket.id;
        humanSeat.name = playerName || "You";
        humanSeat.isBot = false;

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.playerId = 1;

        room.players.forEach((p, idx) => {
            if (idx > 0) {
                p.connected = true;
                p.isBot = true;
                p.name = `🤖 Bot ${p.id}`;
                p.socketId = null;
            }
        });

        socket.emit("joined", { playerId: 1, roomId });

        io.to(roomId).emit("roomUpdate", {
            players: room.players.map(p => ({
                id: p.id, name: p.name, connected: p.connected, team: p.team, isBot: p.isBot
            }))
        });

        dealWarmup(room);
        sendGameStart(room);
        sendBidUpdate(room);

        console.log(`✅ Bot game started in room ${roomId}`);

        setTimeout(() => scheduleBotAction(room), 800);
    });

    // BID
    socket.on("bid", ({ bid }) => {
        const room = rooms[socket.data.roomId];
        if (!room) return;
        const res = handleBid(room, socket.data.playerId, bid);
        if (res.error) return socket.emit("errorMsg", res.error);
        sendBidUpdate(room);
        if (!room.biddingActive) {
            io.to(room.id).emit("biddingFinished", {
                highestBid: room.highestBid,
                highestBidderId: room.players[room.highestBidder].id,
                highestBidderName: room.players[room.highestBidder].name,
                phase: room.phase
            });
        }
        setTimeout(() => scheduleBotAction(room), 500);
    });

    // PASS
    socket.on("pass", () => {
        const room = rooms[socket.data.roomId];
        if (!room) return;
        const res = handlePass(room, socket.data.playerId);
        if (res.error) return socket.emit("errorMsg", res.error);
        sendBidUpdate(room);
        if (!room.biddingActive) {
            if (room.phase === PHASE_WARMUP && room.warmupAllPassed) {
                io.to(room.id).emit("warmupSkipped", {});
                setTimeout(() => {
                    dealMainFromWarmup(room);
                    sendGameStart(room);
                    sendBidUpdate(room);
                    setTimeout(() => scheduleBotAction(room), 800);
                }, 1500);
            } else {
                io.to(room.id).emit("biddingFinished", {
                    highestBid: room.highestBid,
                    highestBidderId: room.players[room.highestBidder].id,
                    highestBidderName: room.players[room.highestBidder].name,
                    phase: room.phase
                });
            }
        }
        setTimeout(() => scheduleBotAction(room), 500);
    });

    // TRUMP
    socket.on("chooseTrump", ({ suit }) => {
        const room = rooms[socket.data.roomId];
        if (!room) return;
        const res = handleTrump(room, socket.data.playerId, suit);
        if (res.error) return socket.emit("errorMsg", res.error);
        io.to(room.id).emit("trumpSet", {
            trumpSuit: suit,
            waitReveal: !!res.waitReveal,
            highestBidderId: room.players[room.highestBidder].id,
            highestBidderName: room.players[room.highestBidder].name
        });
        if (!res.waitReveal) {
            broadcastRoundStart(room);
            setTimeout(() => scheduleBotAction(room), 800);
        }
    });

    // REVEAL
    socket.on("revealDecision", ({ decision }) => {
        const room = rooms[socket.data.roomId];
        if (!room) return;
        const res = handleRevealDecision(room, socket.data.playerId, decision);
        if (res.error) return socket.emit("errorMsg", res.error);
        io.to(room.id).emit("teammateRevealed", { revealed: room.teammateRevealed });
        broadcastRoundStart(room);
        setTimeout(() => scheduleBotAction(room), 800);
    });

    // TOGGLE REVEAL
    socket.on("toggleReveal", () => {
        const room = rooms[socket.data.roomId];
        if (!room) return;
        const pid = socket.data.playerId;
        if (room.highestBidder === null || room.highestBidder === undefined) return;
        if (room.highestBidder !== pid - 1) return;
        room.teammateRevealed = !room.teammateRevealed;
        room.revealDecision = room.teammateRevealed ? "show" : "hide";
        io.to(room.id).emit("teammateRevealed", { revealed: room.teammateRevealed });
        if (room.teammateRevealed) broadcastRevealedHandUpdate(room);
    });

    // PLAY CARD
    socket.on("playCard", ({ cardIndex }) => {
        const room = rooms[socket.data.roomId];
        if (!room) return;
        const pid = socket.data.playerId;
        const res = handlePlayCard(room, pid, cardIndex);
        if (res.error) return socket.emit("errorMsg", res.error);

        const pidPlayer = room.players[pid - 1];
        if (pidPlayer && pidPlayer.socketId) {
            io.to(pidPlayer.socketId).emit("handUpdate", { hand: pidPlayer.hand });
        }

        if (room.teammateRevealed && room.highestBidder !== null && room.highestBidder !== undefined && room.players[room.highestBidder]) {
            const mateId = TEAMMATES[room.players[room.highestBidder].id];
            if (mateId && pid === mateId) broadcastRevealedHandUpdate(room);
        }

        io.to(room.id).emit("cardPlayed", {
            playerId: pid,
            playerName: room.players[pid - 1].name,
            card: room.trickCards[room.trickCards.length - 1].card,
            trickCards: room.trickCards,
            nextPlayerId: room.trickCards.length < 4 ? room.players[room.currentPlayerIndex].id : null,
            leadPlayerId: room.trickCards[0].playerIndex + 1
        });

        if (res.resolveTrick) {
            setTimeout(() => {
                const r = resolveTrick(room);
                io.to(room.id).emit("trickResolved", {
                    winnerId: room.players[r.winner].id,
                    trickNumber: room.trickNumber,
                    nextPlayerId: room.players[room.currentPlayerIndex].id,
                    leadPlayerId: room.players[room.currentPlayerIndex].id,
                    warmupFailed: !!r.warmupFailed,
                    players: room.players.map(p => ({ id: p.id, tricks: p.tricks, handSize: p.hand.length }))
                });
                if (r.roundEnd) {
                    if (room.phase === PHASE_WARMUP) {
                        const result = finishWarmup(room);
                        io.to(room.id).emit("roundEnd", result);
                        if (room.teamAScore >= WIN_SCORE || room.teamBScore >= WIN_SCORE) {
                            const winner = room.teamAScore >= WIN_SCORE ? "A" : "B";
                            room.gameEnded = winner;
                            io.to(room.id).emit("gameOver", { winner, teamAScore: room.teamAScore, teamBScore: room.teamBScore });
                        } else {
                            setTimeout(() => {
                                dealWarmup(room);
                                sendGameStart(room);
                                sendBidUpdate(room);
                                setTimeout(() => scheduleBotAction(room), 800);
                            }, 5000);
                        }
                    } else {
                        const result = finishMain(room);
                        io.to(room.id).emit("roundEnd", result);
                        if (room.gameEnded) {
                            io.to(room.id).emit("gameOver", { winner: room.gameEnded, teamAScore: room.teamAScore, teamBScore: room.teamBScore });
                        } else {
                            setTimeout(() => {
                                dealWarmup(room);
                                sendGameStart(room);
                                sendBidUpdate(room);
                                setTimeout(() => scheduleBotAction(room), 800);
                            }, 4000);
                        }
                    }
                } else setTimeout(() => scheduleBotAction(room), 600);
            }, 1200);
        } else setTimeout(() => scheduleBotAction(room), 600);
    });

    // VOTE RESET
    socket.on("voteRestart", () => {
        const room = rooms[socket.data.roomId];
        if (!room) return;
        const pid = socket.data.playerId;
        if (room.restartVotes.has(pid)) room.restartVotes.delete(pid);
        else room.restartVotes.add(pid);
        io.to(room.id).emit("restartVotesUpdate", {
            votes: Array.from(room.restartVotes),
            total: room.restartVotes.size
        });
        if (room.restartVotes.size >= 3) {
            room.teamAScore = 0;
            room.teamBScore = 0;
            room.gameEnded = false;
            room.restartVotes.clear();
            dealWarmup(room);
            io.to(room.id).emit("gameRestarted", {});
            sendGameStart(room);
            sendBidUpdate(room);
            setTimeout(() => scheduleBotAction(room), 800);
        }
    });

    // LEAVE
    socket.on("leaveRoom", () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        const room = rooms[roomId];
        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
            player.connected = false;
            player.socketId = null;
            player.hand = [];
            player.tricks = 0;
            room.restartVotes.delete(player.id);
            io.to(roomId).emit("roomUpdate", {
                players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected, team: p.team }))
            });
            io.to(roomId).emit("playerLeft", { playerId: player.id, playerName: player.name });
        }
        socket.leave(roomId);
        socket.data.roomId = null;
        socket.data.playerId = null;
        const anyConnected = room.players.some(p => p.connected && !p.isBot);
        if (!anyConnected) { delete rooms[roomId]; console.log(`🗑️ Room ${roomId} deleted`); }
    });

    // DISCONNECT
    socket.on("disconnect", () => {
        const roomId = socket.data.roomId;
        if (!roomId || !rooms[roomId]) return;
        const room = rooms[roomId];
        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
            player.connected = false;
            player.socketId = null;
            room.restartVotes.delete(player.id);
            io.to(roomId).emit("roomUpdate", {
                players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected, team: p.team }))
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Server: http://localhost:${PORT}`));