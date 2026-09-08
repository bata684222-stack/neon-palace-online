/* ============================================================
   player.js — first-person PlayerController
   WASD + mouse look (Pointer Lock), gravity, jump, run, collisions
   ============================================================ */
(function () {
  'use strict';

  const EYE = 1.7;
  const RADIUS = 0.42;

  const Player = {
    camera: null,
    dom: null,
    enabled: false,
    locked: false,
    pos: new THREE.Vector3(0, EYE, 18),
    vel: new THREE.Vector3(),
    yaw: 0,                // 0 = looking toward -Z (into the hall)
    pitch: 0,
    onGround: true,
    walkSpeed: 4.6,
    runSpeed: 8.2,
    jumpSpeed: 5.6,
    gravity: 18,
    keys: {},
    _bob: 0,
    _stepDist: 0,
    _lastLandY: 0,

    init(camera, dom) {
      this.camera = camera;
      this.dom = dom;
      this.applySettings();

      window.addEventListener('keydown', e => {
        this.keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0 && this.locked) e.preventDefault();
      });
      window.addEventListener('keyup', e => { this.keys[e.code] = false; });
      window.addEventListener('blur', () => { this.keys = {}; });

      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === this.dom;
        Bus.emit('pointerlock:changed', { locked: this.locked });
      });
      document.addEventListener('mousemove', e => {
        if (!this.locked || !this.enabled) return;
        const s = (State.settings.sensitivity || 1) * 0.0022;
        this.yaw -= e.movementX * s;
        this.pitch -= e.movementY * s * (State.settings.invertY ? -1 : 1);
        this.pitch = Utils.clamp(this.pitch, -Math.PI / 2 + .05, Math.PI / 2 - .05);
      });

      Bus.on('settings:changed', () => this.applySettings());
    },

    applySettings() {
      if (!this.camera) return;
      this.camera.fov = State.settings.fov || 75;
      this.camera.updateProjectionMatrix();
    },

    requestLock() {
      if (!this.dom || this.locked) return;
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => { });
    },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },

    setEnabled(v) {
      this.enabled = v;
      if (!v) { this.keys = {}; this.vel.x = this.vel.z = 0; }
    },

    /** never leave the player stuck inside geometry after a teleport */
    unstick(x, z) {
      if (!this.blocked(x, z)) return { x, z };
      for (let r = 0.5; r <= 6; r += 0.5) {
        for (let a = 0; a < 16; a++) {
          const ang = a / 16 * Math.PI * 2;
          const nx = x + Math.cos(ang) * r, nz = z + Math.sin(ang) * r;
          if (!this.blocked(nx, nz)) return { x: nx, z: nz };
        }
      }
      return { x, z };
    },

    teleport(x, z, yaw) {
      const free = this.unstick(x, z);
      x = free.x; z = free.z;
      this.pos.set(x, EYE, z);
      this.vel.set(0, 0, 0);
      if (yaw !== undefined) this.yaw = yaw;
      this.pitch = 0;
      this.sync();
    },

    /* ---------------- collisions ---------------- */
    blocked(x, z) {
      const cols = World.colliders;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        if (c.disabled) continue;
        if (x > c.x1 - RADIUS && x < c.x2 + RADIUS && z > c.z1 - RADIUS && z < c.z2 + RADIUS) return true;
      }
      return false;
    },

    update(dt) {
      /* §42 the player can never move during a cutscene */
      if (window.Cinematic && Cinematic.playing) { this.keys = {}; return; }
      if (!this.enabled) { this.sync(); return; }
      const k = this.keys;
      let fwd = 0, side = 0;
      if (k['KeyW'] || k['ArrowUp']) fwd += 1;
      if (k['KeyS'] || k['ArrowDown']) fwd -= 1;
      if (k['KeyA'] || k['ArrowLeft']) side -= 1;
      if (k['KeyD'] || k['ArrowRight']) side += 1;

      const running = !!(k['ShiftLeft'] || k['ShiftRight']);
      const speed = running ? this.runSpeed : this.walkSpeed;

      // desired velocity in world space (smoothed for nice feel)
      const len = Math.hypot(fwd, side) || 1;
      const nf = fwd / len, ns = side / len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const wantX = (-sin * nf + cos * ns) * speed * (fwd || side ? 1 : 0);
      const wantZ = (-cos * nf - sin * ns) * speed * (fwd || side ? 1 : 0);
      const accel = this.onGround ? 12 : 4;
      this.vel.x += (wantX - this.vel.x) * Math.min(1, accel * dt);
      this.vel.z += (wantZ - this.vel.z) * Math.min(1, accel * dt);

      // jump + gravity
      if ((k['Space']) && this.onGround) {
        this.vel.y = this.jumpSpeed;
        this.onGround = false;
        Sound.play('jump');
      }
      this.vel.y -= this.gravity * dt;

      // move with per-axis collision resolution
      const nx = this.pos.x + this.vel.x * dt;
      if (!this.blocked(nx, this.pos.z)) this.pos.x = nx; else this.vel.x = 0;
      const nz = this.pos.z + this.vel.z * dt;
      if (!this.blocked(this.pos.x, nz)) this.pos.z = nz; else this.vel.z = 0;

      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= EYE) {
        if (!this.onGround && this.vel.y < -3) Sound.play('land');
        this.pos.y = EYE;
        this.vel.y = 0;
        this.onGround = true;
      }

      // footsteps + head bob
      const planar = Math.hypot(this.vel.x, this.vel.z);
      if (this.onGround && planar > .8) {
        this._stepDist += planar * dt;
        this._bob += dt * (running ? 13 : 9);
        if (this._stepDist > (running ? 2.1 : 1.55)) { this._stepDist = 0; Sound.play('step'); }
      } else this._bob += dt * 1.2;

      this.sync(planar);
      Bus.emit('player:moved', this.pos);
      // multiplayer sync 10-15Hz
      if(window.Network && Network.isOnline()){
        const running = !!(this.keys['ShiftLeft']||this.keys['ShiftRight']);
        const moving = Math.hypot(this.vel.x,this.vel.z)>0.1;
        const state = !this.onGround ? 'jump' : moving ? (running?'run':'walk') : 'idle';
        Network.sendMove(this.pos.x, this.pos.y, this.pos.z, this.yaw, this.pitch, state);
      }
    },

    sync(planar) {
      if (!this.camera) return;
      const bob = planar > .8 ? Math.sin(this._bob) * 0.045 : 0;
      const sway = planar > .8 ? Math.cos(this._bob * .5) * 0.012 : 0;
      this.camera.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
      this.camera.rotation.set(this.pitch, this.yaw, sway, 'YXZ');
      // rotation order must be YXZ for FPS camera
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(this.pitch, this.yaw, sway);
    }
  };

  window.Player = Player;
  window.PlayerController = Player;
})();
