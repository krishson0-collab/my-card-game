/* =========================================================
   Desi Call Break — Sound System
   Uses Web Audio API — no external files needed
   ========================================================= */

const SoundSystem = (() => {
    let audioCtx = null;
    let enabled = true;
    let masterGain = null;

    // ✅ Initialize audio context (needs user interaction)
    function init() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.4;
            masterGain.connect(audioCtx.destination);
        } catch (e) {
            console.warn('Audio not supported:', e);
        }
    }

    // Resume context on user gesture
    function resume() {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    // ✅ Play a tone
    function playTone(freq, duration = 0.1, type = 'sine', volume = 0.5, delay = 0) {
        if (!enabled || !audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
            gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
            gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + delay + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duration);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(audioCtx.currentTime + delay);
            osc.stop(audioCtx.currentTime + delay + duration);
        } catch (e) {}
    }

    // ✅ Noise burst (for card flick)
    function playNoise(duration = 0.08, volume = 0.3) {
        if (!enabled || !audioCtx) return;
        try {
            const bufferSize = audioCtx.sampleRate * duration;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
            }
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            const gain = audioCtx.createGain();
            gain.gain.value = volume;
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.value = 800;
            source.connect(filter);
            filter.connect(gain);
            gain.connect(masterGain);
            source.start();
        } catch (e) {}
    }

    /* ============ PUBLIC SOUNDS ============ */

    // 🎴 Card throw — whoosh + flick
    function cardThrow() {
        playNoise(0.1, 0.35);
        playTone(600, 0.06, 'triangle', 0.25, 0);
        playTone(400, 0.08, 'triangle', 0.2, 0.04);
    }

    // 🃏 Card landing (on center)
    function cardLand() {
        playTone(220, 0.08, 'square', 0.15);
        playTone(180, 0.1, 'square', 0.1, 0.03);
    }

    // ✅ Trick win — happy ding
    function trickWin() {
        playTone(660, 0.12, 'sine', 0.4);
        playTone(880, 0.15, 'sine', 0.4, 0.1);
        playTone(1100, 0.2, 'sine', 0.35, 0.2);
    }

    // ❌ Trick loss — low thud
    function trickLoss() {
        playTone(200, 0.15, 'sawtooth', 0.2);
        playTone(150, 0.2, 'sawtooth', 0.15, 0.08);
    }

    // 💰 Bid placed — ching
    function bidPlaced() {
        playTone(880, 0.08, 'sine', 0.4);
        playTone(1320, 0.12, 'sine', 0.35, 0.07);
    }

    // 🚫 Pass — soft buzz
    function pass() {
        playTone(330, 0.1, 'sawtooth', 0.2);
        playTone(280, 0.12, 'sawtooth', 0.15, 0.06);
    }

    // 🎺 Trump set — trumpet-ish
    function trumpSet() {
        playTone(523, 0.1, 'sawtooth', 0.3);
        playTone(659, 0.1, 'sawtooth', 0.3, 0.08);
        playTone(784, 0.15, 'sawtooth', 0.3, 0.16);
        playTone(1047, 0.25, 'sawtooth', 0.3, 0.24);
    }

    // 🔔 Your turn — gentle bell
    function yourTurn() {
        playTone(880, 0.1, 'sine', 0.3);
        playTone(1100, 0.15, 'sine', 0.25, 0.08);
    }

    // 🎉 Bid made — celebration
    function bidMade() {
        playTone(523, 0.12, 'sine', 0.4);
        playTone(659, 0.12, 'sine', 0.4, 0.1);
        playTone(784, 0.12, 'sine', 0.4, 0.2);
        playTone(1047, 0.3, 'sine', 0.4, 0.3);
    }

    // 💥 Bid failed — sad trombone
    function bidFailed() {
        playTone(392, 0.15, 'sawtooth', 0.3);
        playTone(349, 0.15, 'sawtooth', 0.3, 0.12);
        playTone(311, 0.15, 'sawtooth', 0.3, 0.24);
        playTone(261, 0.4, 'sawtooth', 0.3, 0.36);
    }

    // 👑 Game win — fanfare
    function gameWin() {
        const notes = [523, 659, 784, 1047, 1318, 1047, 1318, 1568];
        notes.forEach((f, i) => {
            playTone(f, 0.15, 'sine', 0.35, i * 0.12);
        });
    }

    // 😔 Game lose — sad
    function gameLose() {
        playTone(523, 0.2, 'sine', 0.3);
        playTone(440, 0.2, 'sine', 0.3, 0.15);
        playTone(349, 0.3, 'sine', 0.3, 0.3);
        playTone(261, 0.5, 'sine', 0.3, 0.5);
    }

    // 🖱️ Button click
    function click() {
        playTone(1200, 0.04, 'sine', 0.15);
    }

    // 🔔 Notification
    function notify() {
        playTone(660, 0.1, 'sine', 0.3);
        playTone(880, 0.12, 'sine', 0.25, 0.08);
    }

    // ⏰ Timeout warning
    function timeoutWarning() {
        playTone(440, 0.1, 'square', 0.25);
        playTone(440, 0.1, 'square', 0.25, 0.15);
    }

    // 🎊 Round end
    function roundEnd() {
        playTone(784, 0.12, 'sine', 0.35);
        playTone(988, 0.12, 'sine', 0.35, 0.1);
        playTone(1318, 0.25, 'sine', 0.35, 0.2);
    }

    // 🤝 Emoji reaction
    function emojiPop() {
        playTone(1047, 0.06, 'sine', 0.3);
        playTone(1318, 0.08, 'sine', 0.25, 0.05);
    }

    // Toggle mute
    function toggle() {
        enabled = !enabled;
        if (masterGain) {
            masterGain.gain.value = enabled ? 0.4 : 0;
        }
        return enabled;
    }

    function isEnabled() { return enabled; }
    function setEnabled(val) {
        enabled = !!val;
        if (masterGain) masterGain.gain.value = enabled ? 0.4 : 0;
    }

    // ✅ Public API
    return {
        init,
        resume,
        cardThrow,
        cardLand,
        trickWin,
        trickLoss,
        bidPlaced,
        pass,
        trumpSet,
        yourTurn,
        bidMade,
        bidFailed,
        gameWin,
        gameLose,
        click,
        notify,
        timeoutWarning,
        roundEnd,
        emojiPop,
        toggle,
        isEnabled,
        setEnabled
    };
})();

/* =========================================================
   AUTO-INITIALIZE ON FIRST USER INTERACTION
   ========================================================= */
document.addEventListener('click', () => {
    SoundSystem.init();
    SoundSystem.resume();
}, { once: false, passive: true });

document.addEventListener('touchstart', () => {
    SoundSystem.init();
    SoundSystem.resume();
}, { once: false, passive: true });

document.addEventListener('keydown', () => {
    SoundSystem.init();
    SoundSystem.resume();
}, { once: false, passive: true });