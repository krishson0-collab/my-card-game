const Sound = {
    ctx: null,
    enabled: true,

    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            this.enabled = false;
        }
    },

    play(freq, duration, type = "sine", volume = 0.15, delay = 0) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === "suspended") this.ctx.resume();
        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(volume, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + duration);
    },

    yourTurn() {
        this.play(660, 0.15, "sine", 0.18, 0);
        this.play(880, 0.25, "sine", 0.18, 0.15);
    },
    cardPlay() { this.play(500, 0.06, "triangle", 0.12); },
    bid() {
        this.play(880, 0.12, "square", 0.12);
        this.play(1100, 0.1, "square", 0.1, 0.08);
    },
    pass() { this.play(220, 0.18, "sawtooth", 0.1); },
    trickWin() {
        this.play(523, 0.1, "sine", 0.16, 0);
        this.play(659, 0.1, "sine", 0.16, 0.1);
        this.play(784, 0.22, "sine", 0.16, 0.2);
    },
    gameWin() {
        const notes = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
        notes.forEach((n, i) => this.play(n, 0.22, "sine", 0.18, i * 0.13));
    },
    gameLose() {
        this.play(440, 0.3, "sawtooth", 0.14, 0);
        this.play(330, 0.4, "sawtooth", 0.14, 0.28);
        this.play(220, 0.5, "sawtooth", 0.14, 0.6);
    },
    error() { this.play(150, 0.2, "square", 0.12); },
    deal() {
        for (let i = 0; i < 5; i++) {
            this.play(700 + i * 50, 0.05, "triangle", 0.08, i * 0.05);
        }
    }
};

function vibrate(pattern) {
    if (navigator.vibrate) {
        try { navigator.vibrate(pattern); } catch(e) {}
    }
}

function launchConfetti() {
    const colors = ["#f0c040", "#2ecc71", "#e74c3c", "#3498db", "#fff", "#9b59b6", "#e67e22"];
    for (let i = 0; i < 80; i++) {
        const piece = document.createElement("div");
        piece.className = "confetti";
        piece.style.left = Math.random() * 100 + "%";
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDelay = (Math.random() * 0.8) + "s";
        piece.style.animationDuration = (2.5 + Math.random() * 2) + "s";
        piece.style.transform = `rotate(${Math.random() * 360}deg)`;
        if (Math.random() > 0.5) piece.style.borderRadius = "50%";
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 5000);
    }
}