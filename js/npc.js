/* ============================================================
   npc.js — simple low-poly NPCs that wander, idle and sit
   ============================================================ */
(function () {
  'use strict';

  const COLORS = [0x3d5afe, 0xff5252, 0x26a69a, 0xffca28, 0xab47bc, 0x8d6e63, 0x26c6da, 0xef6c9c, 0x9ccc65];
  const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

  // walkable waypoints (kept in open floor areas)
  const WAYPOINTS = [
    [0, 16], [-8, 14], [8, 14], [-20, 12], [20, 12], [0, 8], [-20, 0], [-20, -8],
    [0, 4], [8, 0], [-8, 0], [0, -6], [-8, -12], [8, -12], [13, -6], [22, -2],
    [13, 8], [22, 16], [-14, 16], [-24, 16], [0, 20], [26, 6], [26, -16], [8, -20], [-8, -20], [-20, -16]
  ];

  class NPC {
    constructor(i) {
      const g = new THREE.Group();
      this.group = g;
      this.mode = Math.random() < .3 ? 'idle' : 'walk';
      const bodyMat = new THREE.MeshStandardMaterial({ color: Utils.choice(COLORS), roughness: .7 });
      const skinMat = new THREE.MeshStandardMaterial({ color: Utils.choice(SKIN), roughness: .8 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x21252f, roughness: .8 });

      const torso = new THREE.Mesh(new THREE.CylinderGeometry(.24, .3, .78, 10), bodyMat);
      torso.position.y = 1.05;
      g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10), skinMat);
      head.position.y = 1.62;
      g.add(head);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(.175, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
      hair.position.y = 1.65;
      g.add(hair);
      this.legs = [];
      [-.12, .12].forEach(x => {
        const l = new THREE.Mesh(new THREE.BoxGeometry(.16, .68, .18), dark);
        l.position.set(x, .34, 0);
        g.add(l);
        this.legs.push(l);
      });
      this.arms = [];
      [-.32, .32].forEach(x => {
        const a = new THREE.Mesh(new THREE.BoxGeometry(.12, .6, .14), bodyMat);
        a.position.set(x, 1.08, 0);
        g.add(a);
        this.arms.push(a);
      });

      const wp = Utils.choice(WAYPOINTS);
      g.position.set(wp[0] + Utils.rand(-2, 2), 0, wp[1] + Utils.rand(-2, 2));
      this.target = new THREE.Vector3(wp[0], 0, wp[1]);
      this.speed = Utils.rand(.9, 1.9);
      this.phase = Math.random() * 6.28;
      this.idleTime = Utils.rand(2, 9);
      this.pickTarget();
    }

    pickTarget() {
      const wp = Utils.choice(WAYPOINTS);
      this.target.set(wp[0] + Utils.rand(-1.6, 1.6), 0, wp[1] + Utils.rand(-1.6, 1.6));
    }

    update(dt, t) {
      const g = this.group;
      if (this.mode === 'idle') {
        this.idleTime -= dt;
        g.rotation.y += Math.sin(t * .5 + this.phase) * dt * .3;
        this.legs.forEach(l => l.rotation.x = 0);
        this.arms.forEach((a, i) => a.rotation.x = Math.sin(t * 1.2 + this.phase + i) * .08);
        if (this.idleTime <= 0) { this.mode = 'walk'; this.pickTarget(); }
        return;
      }
      const dx = this.target.x - g.position.x, dz = this.target.z - g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < .6) {
        if (Math.random() < .55) { this.mode = 'idle'; this.idleTime = Utils.rand(3, 12); }
        else this.pickTarget();
        return;
      }
      const ux = dx / dist, uz = dz / dist;
      const nx = g.position.x + ux * this.speed * dt;
      const nz = g.position.z + uz * this.speed * dt;
      if (Player.blocked ? !NPC.blocked(nx, nz) : true) {
        g.position.x = nx;
        g.position.z = nz;
      } else this.pickTarget();
      g.rotation.y = Math.atan2(ux, uz);
      const sw = Math.sin(t * this.speed * 4 + this.phase);
      this.legs[0].rotation.x = sw * .55;
      this.legs[1].rotation.x = -sw * .55;
      this.arms[0].rotation.x = -sw * .4;
      this.arms[1].rotation.x = sw * .4;
      g.position.y = Math.abs(Math.sin(t * this.speed * 4 + this.phase)) * .035;
    }
  }

  NPC.blocked = function (x, z) {
    const cols = World.colliders;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      if (c.disabled || c.tag === 'wall') continue;
      if (x > c.x1 - .5 && x < c.x2 + .5 && z > c.z1 - .5 && z < c.z2 + .5) return true;
    }
    // keep NPCs inside the main hall
    if (x < -29 || x > 29 || z < -21 || z > 21) return true;
    return false;
  };

  const NPCs = {
    list: [],
    sitting: [],
    spawn(scene, count) {
      count = count || 14;
      for (let i = 0; i < count; i++) {
        const n = new NPC(i);
        scene.add(n.group);
        this.list.push(n);
      }
      // a few permanently seated NPCs at slot machines & tables
      const seats = [[-22.6, -14, Math.PI / 2], [-22.6, 1, Math.PI / 2], [-17.4, -9, -Math.PI / 2],
      [15.5, -12.5, -0.8], [23.5, -5.5, -0.8], [15, 6, 2.4]];
      seats.forEach(([x, z, ry]) => {
        const n = new NPC(0);
        n.mode = 'sit';
        n.group.position.set(x, -.18, z);
        n.group.rotation.y = ry;
        n.legs.forEach(l => { l.rotation.x = -Math.PI / 2.2; l.position.y = .5; l.position.z = .16; });
        scene.add(n.group);
        this.sitting.push(n);
      });
      return this;
    },
    setVisible(v) {
      this._visible = v;
      this.list.forEach(n => n.group.visible = v);
      this.sitting.forEach(n => n.group.visible = v);
    },
    update(dt, t) {
      if (this._visible === false) return;
      for (const n of this.list) n.update(dt, t);
      for (const n of this.sitting) {
        n.arms.forEach((a, i) => a.rotation.x = -0.9 + Math.sin(t * 2 + i) * .12);
      }
    },
    setCount(n) {
      this.list.forEach((npc, i) => npc.group.visible = i < n);
    }
  };

  window.NPCs = NPCs;
})();
