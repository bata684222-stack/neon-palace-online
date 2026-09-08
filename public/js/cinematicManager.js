/* ============================================================
   cinematicManager.js — structured cutscene sequences
   camera moves, look-at, fade, shake, subtitles, sounds, events
   No chaotic setTimeout(): every scene is a list of timed steps
   updated from the main render loop.
   ============================================================ */
(function () {
  'use strict';

  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  const Cinematic = {
    playing: false,
    steps: [],
    index: -1,
    t: 0,
    onDone: null,
    camera: null,
    skippable: true,
    _shake: 0,
    _shakeAmp: 0,
    _from: null, _to: null, _lookFrom: null, _lookTo: null,
    _tmp: new THREE.Vector3(),
    _look: new THREE.Vector3(),
    name: '',

    init(camera) {
      this.camera = camera;
      window.addEventListener('keydown', (e) => {
        if (!this.playing) return;
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
          e.preventDefault();
          if (this.skippable) this.skip();
        }
      });
    },

    /**
     * play(name, steps, onDone)
     * step = {
     *   dur:  seconds (default 2)
     *   pos:  [x,y,z]         camera position at the END of the step
     *   look: [x,y,z]         look-at target at the END of the step
     *   from / lookFrom:      optional explicit start values
     *   ease: 'linear'|'inout'|'out'
     *   fade: 'out' | 'in'    fade to/from black over the step
     *   shake: 0..1
     *   sub:  subtitle text
     *   title: big centred title
     *   sound: sfx name
     *   on:   function called once when the step starts
     * }
     */
    play(name, steps, onDone, opts) {
      opts = opts || {};
      this.name = name;
      this.steps = steps.slice();
      this.index = -1;
      this.t = 0;
      this.playing = true;
      this.onDone = onDone || null;
      this.skippable = opts.skippable !== false;
      this._shakeAmp = 0;
      UI.cinematicOn(true, this.skippable);
      Bus.emit('cinematic:start', { name });
      this.next();
    },

    next() {
      this.index++;
      this.t = 0;
      if (this.index >= this.steps.length) { this.finish(); return; }
      const s = this.steps[this.index];
      const prev = this.steps[this.index - 1];

      const camPos = this.camera.position;
      this._from = s.from ? V(s.from) : camPos.clone();
      this._to = s.pos ? V(s.pos) : this._from.clone();
      this._lookFrom = s.lookFrom ? V(s.lookFrom)
        : (this._lookTo ? this._lookTo.clone() : (prev && prev.look ? V(prev.look) : this._from.clone().add(new THREE.Vector3(0, 0, -1))));
      this._lookTo = s.look ? V(s.look) : this._lookFrom.clone();
      this._shakeAmp = s.shake || 0;

      if (s.sub !== undefined) UI.subtitle(s.sub);
      if (s.title) UI.cineTitle(s.title, s.titleSub || '');
      if (s.fade === 'out') UI.fadeTo(1, (s.fadeDur || Math.min(s.dur || 2, 1)) * 1000);
      if (s.fade === 'in') UI.fadeTo(0, (s.fadeDur || Math.min(s.dur || 2, 1)) * 1000);
      if (s.sound) Sound.play(s.sound);
      if (s.on) { try { s.on(); } catch (e) { console.error('[cinematic step]', e); } }
    },

    update(dt) {
      if (!this.playing) return;
      const s = this.steps[this.index];
      if (!s) { this.finish(); return; }
      const dur = s.dur == null ? 2 : s.dur;
      this.t += dt;
      const k = dur <= 0 ? 1 : Utils.clamp(this.t / dur, 0, 1);
      const e = s.ease === 'linear' ? k
        : s.ease === 'out' ? Tween.easeOutCubic(k)
          : Tween.easeInOutQuad(k);

      if (s.dyn) {
        /* dynamic camera: follows a moving object (car chase shots) */
        let r = null;
        try { r = s.dyn(k, this.t); } catch (err) { console.error('[cinematic dyn]', err); }
        if (r && r.pos) this._tmp.set(r.pos[0], r.pos[1], r.pos[2]); else this._tmp.copy(this._from);
        if (r && r.look) this._look.set(r.look[0], r.look[1], r.look[2]); else this._look.copy(this._lookTo);
      } else {
        this._tmp.copy(this._from).lerp(this._to, e);
        this._look.copy(this._lookFrom).lerp(this._lookTo, e);
      }

      if (this._shakeAmp > 0) {
        this._shake += dt * 34;
        this._tmp.x += Math.sin(this._shake * 1.7) * 0.035 * this._shakeAmp;
        this._tmp.y += Math.cos(this._shake * 2.3) * 0.03 * this._shakeAmp;
        this._tmp.z += Math.sin(this._shake * 1.1) * 0.02 * this._shakeAmp;
      }
      this.camera.position.copy(this._tmp);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this._look);
      if (s.roll) this.camera.rotateZ(Math.sin(this.t * 0.8) * s.roll);

      if (k >= 1) this.next();
    },

    skip() {
      if (!this.playing) return;
      /* run the remaining side effects so the game state stays consistent */
      for (let i = this.index; i < this.steps.length; i++) {
        const s = this.steps[i];
        if (i === this.index) continue;
        if (s.on) { try { s.on(); } catch (e) { console.error(e); } }
      }
      const last = this.steps[this.steps.length - 1];
      if (last && last.pos) this.camera.position.copy(V(last.pos));
      if (last && last.look) this.camera.lookAt(V(last.look));
      Sound.play('close');
      this.finish();
    },

    finish() {
      this.playing = false;
      this.steps = [];
      this.index = -1;
      this._shakeAmp = 0;
      UI.subtitle('');
      UI.cinematicOn(false);
      UI.hideCineTitle();
      const cb = this.onDone;
      this.onDone = null;
      Bus.emit('cinematic:end', { name: this.name });
      if (cb) { try { cb(); } catch (e) { console.error('[cinematic done]', e); } }
    }
  };

  window.Cinematic = Cinematic;
})();
