/* ============================================================
   audio.js — Web Audio API procedural sound engine
   (no external audio files required)
   ============================================================ */
(function () {
  'use strict';

  const Sound = {
    ctx: null, ready: false,
    master: null, musicGain: null, sfxGain: null,
    _musicTimer: null, _ambTimer: null, _step: 0,

    init() {
      if (this.ready) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { console.warn('WebAudio unavailable'); return false; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      // gentle limiter
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 12; comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.ready = true;
      this.applySettings();
      return true;
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    applySettings() {
      if (!this.ready) return;
      const s = (window.State && State.settings) || { master: .7, music: .45, sfx: .8 };
      this.master.gain.value = s.master;
      this.musicGain.gain.value = s.music;
      this.sfxGain.gain.value = s.sfx;
    },

    /* ---------- primitives ---------- */
    tone(freq, dur, type, vol, dest, detune) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (detune) o.frequency.exponentialRampToValueAtTime(Math.max(20, detune), t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol == null ? .3 : vol, t + Math.min(.02, dur * .3));
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t); o.stop(t + dur + .02);
      return o;
    },
    noise(dur, vol, filterFreq, type, dest) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = type || 'lowpass'; f.frequency.value = filterFreq || 900;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol == null ? .25 : vol, t);
      g.gain.exponentialRampToValueAtTime(.0008, t + dur);
      src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
      src.start(t);
      return src;
    },
    arp(notes, step, type, vol) {
      if (!this.ready) return;
      notes.forEach((n, i) => setTimeout(() => this.tone(n, step * 1.8, type || 'triangle', vol == null ? .25 : vol), i * step * 1000));
    },

    /* ---------- named SFX ---------- */
    play(name, opt) {
      if (!this.ready) { return; }
      this.resume();
      opt = opt || {};
      switch (name) {
        case 'click': this.tone(680, .06, 'square', .12); break;
        case 'hover': this.tone(420, .04, 'sine', .05); break;
        case 'open': this.arp([440, 660, 880], .05, 'triangle', .13); break;
        case 'close': this.arp([660, 440, 330], .05, 'triangle', .1); break;
        case 'deny': this.tone(180, .22, 'sawtooth', .16, null, 90); break;
        case 'step': {
          this._step = (this._step + 1) % 2;
          this.noise(.09, this._step ? .05 : .042, 380 + Math.random() * 120, 'lowpass');
          break;
        }
        case 'jump': this.tone(300, .13, 'sine', .12, null, 620); break;
        case 'land': this.noise(.12, .09, 260, 'lowpass'); break;
        case 'coin': this.arp([1046, 1568], .045, 'square', .1); break;
        case 'bet': this.tone(520, .07, 'square', .1); this.noise(.08, .06, 2200, 'highpass'); break;
        case 'spinstart': this.tone(220, .3, 'sawtooth', .1, null, 520); break;
        case 'tick': this.tone(1100 + Math.random() * 300, .028, 'square', .05); break;
        case 'reelstop': this.tone(260, .12, 'square', .12, null, 150); this.noise(.07, .07, 1400); break;
        case 'win': this.arp([523, 659, 784, 1046], .07, 'triangle', .22); break;
        case 'bigwin': this.arp([523, 659, 784, 1046, 1318, 1568, 2093], .075, 'triangle', .26);
          setTimeout(() => this.arp([1046, 1318, 1568, 2093], .06, 'square', .16), 260); break;
        case 'jackpot':
          this.arp([392, 523, 659, 784, 1046, 1318, 1568, 2093], .08, 'sawtooth', .2);
          setTimeout(() => this.arp([2093, 1568, 2093, 2637], .09, 'triangle', .2), 420);
          setTimeout(() => this.noise(1.2, .18, 5200, 'highpass'), 200);
          break;
        case 'lose': this.arp([392, 330, 262], .1, 'sine', .17); break;
        case 'levelup': this.arp([523, 659, 784, 1046, 1318], .085, 'triangle', .26);
          setTimeout(() => this.arp([784, 1046, 1568], .1, 'square', .17), 300); break;
        case 'achievement': this.arp([880, 1174, 1568], .08, 'sine', .22); break;
        case 'quest': this.arp([659, 880, 1174], .07, 'triangle', .2); break;
        case 'card': this.noise(.11, .12, 3200, 'highpass'); break;
        case 'shuffle': for (let i = 0; i < 6; i++) setTimeout(() => this.noise(.07, .07, 2600, 'highpass'), i * 55); break;
        case 'dice': for (let i = 0; i < 5; i++) setTimeout(() => this.noise(.08, .11, 700 + Math.random() * 800, 'bandpass'), i * 90); break;
        case 'roulette': {
          let i = 0;
          const total = opt.ticks || 34;
          const t0 = 40;
          const tick = () => {
            if (i >= total) return;
            this.tone(1500 + Math.random() * 500, .02, 'square', .05);
            i++;
            setTimeout(tick, t0 + i * i * 0.9);
          };
          tick();
          this.noise(.7, .06, 1500, 'bandpass');
          break;
        }
        case 'flip': this.tone(900, .5, 'sine', .1, null, 1500); this.noise(.12, .06, 4000, 'highpass'); break;
        case 'door': this.tone(90, .8, 'sine', .16, null, 60); this.noise(.9, .09, 320); break;
        case 'unlock': this.arp([440, 587, 880, 1174], .09, 'triangle', .22); break;
        case 'slotamb': this.tone(Utils.choice([880, 1046, 1318]), .12, 'square', .028); break;
        case 'ticket': this.arp([784, 1046, 1318], .06, 'square', .16); break;
        case 'quota': this.arp([392, 523, 659, 784], .1, 'triangle', .24); break;
        case 'fail': this.arp([330, 262, 196, 147], .16, 'sawtooth', .2); break;
      }
    },

    /** looping car engine (procedural, used by the travel cutscenes) */
    engine(on) {
      if (!this.ready) return;
      if (on) {
        if (this._eng) return;
        const ctx = this.ctx;
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
        const g = ctx.createGain(), f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 420;
        o1.type = 'sawtooth'; o1.frequency.value = 62;
        o2.type = 'square'; o2.frequency.value = 31;
        g.gain.value = 0;
        g.gain.linearRampToValueAtTime(.14, ctx.currentTime + 1.2);
        o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfxGain);
        o1.start(); o2.start();
        this._eng = { o1, o2, g, f };
        this._engTimer = setInterval(() => {
          if (!this._eng) return;
          const t = this.ctx.currentTime;
          const rev = 58 + Math.random() * 26;
          this._eng.o1.frequency.linearRampToValueAtTime(rev, t + .5);
          this._eng.o2.frequency.linearRampToValueAtTime(rev / 2, t + .5);
          this._eng.f.frequency.linearRampToValueAtTime(360 + Math.random() * 320, t + .5);
        }, 520);
      } else {
        clearInterval(this._engTimer); this._engTimer = null;
        const e = this._eng;
        this._eng = null;
        if (!e) return;
        const t = this.ctx.currentTime;
        e.g.gain.cancelScheduledValues(t);
        e.g.gain.setValueAtTime(e.g.gain.value, t);
        e.g.gain.linearRampToValueAtTime(0, t + .7);
        setTimeout(() => { try { e.o1.stop(); e.o2.stop(); } catch (err) { } }, 900);
      }
    },

    /* ---------- music + ambience ---------- */
    startMusic() {
      if (!this.ready || this._musicTimer) return;
      const scale = [110, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63];
      const pad = () => {
        const t = this.ctx.currentTime;
        [0, 2, 4].forEach(i => {
          const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
          f.type = 'lowpass'; f.frequency.value = 900;
          o.type = 'sawtooth';
          o.frequency.value = scale[i] * (Math.random() < .5 ? 1 : 2) / 2;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(.05, t + 1.4);
          g.gain.linearRampToValueAtTime(0, t + 7.8);
          o.connect(f); f.connect(g); g.connect(this.musicGain);
          o.start(t); o.stop(t + 8);
        });
      };
      const bass = () => {
        const n = Utils.choice([55, 65.4, 73.4, 82.4]);
        this.tone(n, .34, 'triangle', .12, this.musicGain);
      };
      let beat = 0;
      pad();
      this._musicTimer = setInterval(() => {
        beat++;
        if (beat % 16 === 1) pad();
        if (beat % 2 === 1) bass();
        if (beat % 4 === 2) this.tone(Utils.choice(scale) * 2, .18, 'sine', .05, this.musicGain);
        if (beat % 8 === 5) this.noise(.06, .04, 6000, 'highpass', this.musicGain);
      }, 480);
      // casino ambience: distant chimes + machine chirps + crowd hiss
      this._ambTimer = setInterval(() => {
        if (Math.random() < .5) this.play('slotamb');
        if (Math.random() < .22) this.noise(1.6, .022, 480, 'lowpass');
        if (Math.random() < .12) this.arp([1046, 1318], .06, 'sine', .03);
      }, 900);
    },
    stopMusic() {
      clearInterval(this._musicTimer); this._musicTimer = null;
      clearInterval(this._ambTimer); this._ambTimer = null;
    }
  };

  Bus.on('settings:changed', () => Sound.applySettings());
  window.Sound = Sound;
})();
