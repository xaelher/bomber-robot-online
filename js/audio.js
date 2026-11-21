// =========================================================================
// 1. WEB AUDIO SYNTHESIZER (Punchy Retro-SciFi SFX)
// =========================================================================

export class SoundFX {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }
    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }
    }
    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }
    playTone(freq, type, duration, vol = 0.14, slideFreq = null, delay = 0) {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        try {
            const t0 = this.ctx.currentTime + delay;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, t0);
            if (slideFreq) {
                osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideFreq), t0 + duration);
            }
            gain.gain.setValueAtTime(vol, t0);
            gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t0);
            osc.stop(t0 + duration + 0.01);
        } catch (e) { }
    }
    bombDrop() {
        // Mechanical metallic click + thud
        this.playTone(320, 'square', 0.05, 0.10, 140);
        this.playTone(150, 'triangle', 0.12, 0.18, 65, 0.02);
    }
    explosion() {
        if (this.muted) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            // Punchy sub-bass drop
            const sub = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(135, now);
            sub.frequency.exponentialRampToValueAtTime(28, now + 0.36);
            subGain.gain.setValueAtTime(0.35, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
            sub.connect(subGain);
            subGain.connect(this.ctx.destination);
            sub.start(now);
            sub.stop(now + 0.4);

            // Filtered blast noise
            const duration = 0.46;
            const bufferSize = Math.floor(this.ctx.sampleRate * duration);
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.13));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(950, now);
            filter.frequency.exponentialRampToValueAtTime(95, now + duration);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.32, now);
            gain.gain.exponentialRampToValueAtTime(0.005, now + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            noise.start(now);
        } catch (e) { }
    }
    powerup() {
        this.playTone(523.25, 'sine', 0.07, 0.14, null, 0);
        this.playTone(659.25, 'sine', 0.07, 0.14, null, 0.06);
        this.playTone(987.77, 'triangle', 0.16, 0.18, null, 0.12);
    }
    maxBombBonus() {
        this.playTone(587.33, 'triangle', 0.08, 0.15, null, 0);
        this.playTone(880, 'triangle', 0.08, 0.15, null, 0.07);
        this.playTone(1174.66, 'sine', 0.18, 0.18, null, 0.14);
    }
    virus() {
        this.playTone(280, 'sawtooth', 0.12, 0.14, 120, 0);
        this.playTone(190, 'sawtooth', 0.24, 0.15, 68, 0.1);
    }
    warp() {
        this.playTone(260, 'sine', 0.28, 0.18, 1280, 0);
        this.playTone(520, 'triangle', 0.22, 0.12, 190, 0.05);
    }
    shieldHit() {
        this.playTone(920, 'square', 0.14, 0.13, 340, 0);
        this.playTone(660, 'triangle', 0.18, 0.14, 240, 0.05);
    }
    crusherSlam() {
        this.playTone(110, 'sawtooth', 0.18, 0.22, 35, 0);
    }
    suddenDeathAlarm() {
        this.playTone(620, 'sawtooth', 0.16, 0.14, 440, 0);
        this.playTone(620, 'sawtooth', 0.16, 0.14, 440, 0.22);
        this.playTone(820, 'sawtooth', 0.28, 0.16, 520, 0.44);
    }
    countdownBeep(urgent = false) {
        this.playTone(urgent ? 940 : 660, 'sine', 0.09, 0.11);
    }
    robotEliminated() {
        this.playTone(420, 'sawtooth', 0.14, 0.19, 190, 0);
        this.playTone(210, 'sawtooth', 0.34, 0.20, 52, 0.13);
    }
    victory() {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((n, idx) => {
            this.playTone(n, 'triangle', 0.24, 0.18, null, idx * 0.11);
        });
    }
    rareBlockSpawn() {
        this.playTone(440, 'sine', 0.12, 0.16, 880, 0);
        this.playTone(659.25, 'triangle', 0.14, 0.16, 1318.5, 0.09);
        this.playTone(1046.5, 'sine', 0.28, 0.20, 1567.98, 0.18);
    }
    rarePickup() {
        const notes = [587.33, 783.99, 1046.5, 1396.91];
        notes.forEach((n, idx) => this.playTone(n, 'triangle', 0.18, 0.18, null, idx * 0.06));
    }
    weaponSwap() {
        this.playTone(420, 'square', 0.05, 0.09, 680, 0);
    }
    sniperShot() {
        // High-powered railgun crack + sub kick
        this.playTone(1450, 'sawtooth', 0.14, 0.24, 180, 0);
        this.playTone(220, 'triangle', 0.18, 0.25, 48, 0);
    }
    knifeSlash() {
        this.playTone(980, 'sawtooth', 0.07, 0.15, 260, 0);
        this.playTone(1320, 'triangle', 0.06, 0.12, 420, 0.02);
    }
    detonatorPlant() {
        this.playTone(720, 'sine', 0.06, 0.13, 980, 0);
        this.playTone(980, 'sine', 0.06, 0.13, 720, 0.07);
    }
    detonatorTrigger() {
        this.playTone(1200, 'square', 0.05, 0.14, 1600, 0);
        this.playTone(1600, 'square', 0.07, 0.15, 900, 0.05);
    }
}

export const sfx = new SoundFX();

