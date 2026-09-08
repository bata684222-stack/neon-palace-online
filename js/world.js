/* ============================================================
   world.js — procedural 3D casino: geometry, lights, neon,
   interactive objects, colliders, zones, particles
   ============================================================ */
(function () {
  'use strict';

  const HALL = { x1: -30, x2: 30, z1: -22, z2: 22, h: 7 };
  const VIP = { x1: 2, x2: 28, z1: -52, z2: -32, h: 6.5 };
  const COR = { x1: 11, x2: 19, z1: -32, z2: -22 };

  const M = {}; // shared materials
  const G = {}; // shared geometries

  const World = {
    scene: null,
    group: null,
    colliders: [],
    interactables: [],
    rayTargets: [],
    lights: { optional: [], spots: [], tiered: [] },
    dust: null,
    animated: [],
    bursts: [],
    vipOpen: false,
    envs: {},
    active: null,
    env: null,
    _t: 0,

    /* ================= build ================= */
    build(scene) {
      this.scene = scene;
      this.group = new THREE.Group();
      scene.add(this.group);
      this.casinoEnv = this.registerEnv('casino1', {
        group: this.group, colliders: this.colliders, rayTargets: this.rayTargets,
        zoneAt: (x, z) => this.casinoZoneAt(x, z),
        spawn: { x: 0, z: 19, yaw: 0 }, floor: 1,
        fog: 0.017, bg: 0x05060c, name: 'FLOOR 1 · MAIN HALL'
      });

      scene.fog = new THREE.FogExp2(0x05060c, 0.017);
      scene.background = new THREE.Color(0x05060c);

      this.initAssets();
      this.buildLights();
      this.buildHall();
      this.buildEntrance();
      this.buildSlotZone();
      this.buildDiceZone();
      this.buildRouletteZone();
      this.buildBlackjackZone();
      this.buildCoinFlip();
      this.buildServices();
      this.buildVip();
      this.buildDecor();
      if (window.Floors) Floors.floor1Extras(this);
      this.buildParticles();

      if (State.unlockedAreas.indexOf('vip') >= 0 || State.level >= 15) this.openVipDoor(false);
      this.setQuality(State.settings.quality);
      return this;
    },

    initAssets() {
      const floorTex = Utils.floorTexture();
      floorTex.repeat.set(15, 11);
      const carpet = Utils.carpetTexture();
      carpet.repeat.set(4, 4);

      M.floor = new THREE.MeshStandardMaterial({ map: floorTex, color: 0xe8eefc, roughness: .28, metalness: .42 });
      M.carpet = new THREE.MeshStandardMaterial({ map: carpet, roughness: .88, metalness: 0.04 });
      const wallTex=Utils.wallTexture(); wallTex.repeat.set(3,1);
      M.wall = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xE8EEFC, roughness: .72, metalness: .12 });
      M.wallDark = new THREE.MeshStandardMaterial({ color: 0x0d111c, roughness: .9 });
      M.ceiling = new THREE.MeshStandardMaterial({ color: 0x090c14, roughness: .95 });
      M.metal = new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: .3, metalness: .9 });
      M.gold = new THREE.MeshStandardMaterial({ color: 0xffc63a, roughness: .25, metalness: 1, emissive: 0x3a2a00 });
      M.goldDark = new THREE.MeshStandardMaterial({ color: 0x6b5320, roughness: .4, metalness: .9 });
      M.felt = new THREE.MeshStandardMaterial({ color: 0x0f5132, roughness: .95 });
      M.feltVip = new THREE.MeshStandardMaterial({ color: 0x4a1030, roughness: .95 });
      M.wood = new THREE.MeshStandardMaterial({ color: 0x2a1b13, roughness: .6, metalness: .2 });
      M.glass = new THREE.MeshStandardMaterial({ color: 0x7fd8ff, transparent: true, opacity: .18, roughness: .05, metalness: .6 });
      M.plastic = new THREE.MeshStandardMaterial({ color: 0x1b2233, roughness: .55, metalness: .3 });
      M.leather = new THREE.MeshStandardMaterial({ color: 0x2c1a2e, roughness: .7, metalness: .1 });
      M.leatherRed = new THREE.MeshStandardMaterial({ color: 0x53121f, roughness: .7 });
      M.plant = new THREE.MeshStandardMaterial({ color: 0x1d5c37, roughness: .85 });
      M.pot = new THREE.MeshStandardMaterial({ color: 0x30343f, roughness: .7, metalness: .3 });
      M.neonCyan = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 2.1, roughness: .3 });
      M.neonPink = new THREE.MeshStandardMaterial({ color: 0xff2d95, emissive: 0xff2d95, emissiveIntensity: 2.1, roughness: .3 });
      M.neonGold = new THREE.MeshStandardMaterial({ color: 0xffc63a, emissive: 0xffc63a, emissiveIntensity: 1.9, roughness: .3 });
      M.neonPurple = new THREE.MeshStandardMaterial({ color: 0xc07cff, emissive: 0xc07cff, emissiveIntensity: 1.9, roughness: .3 });
      M.neonGreen = new THREE.MeshStandardMaterial({ color: 0x25e39a, emissive: 0x25e39a, emissiveIntensity: 1.9, roughness: .3 });
      M.lampWarm = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffd08a, emissiveIntensity: 1.6 });
      M.hit = new THREE.MeshBasicMaterial({ visible: false });
      M.white = new THREE.MeshStandardMaterial({ color: 0xf0f4ff, roughness: .5 });
      M.red = new THREE.MeshStandardMaterial({ color: 0xb3242c, roughness: .5 });
      M.black = new THREE.MeshStandardMaterial({ color: 0x14161d, roughness: .5 });

      this.M = M; this.G = G;
      G.box = new THREE.BoxGeometry(1, 1, 1);
      G.cyl = new THREE.CylinderGeometry(.5, .5, 1, 20);
      G.sph = new THREE.SphereGeometry(.5, 16, 12);
      G.plane = new THREE.PlaneGeometry(1, 1);
    },

    /* ---------- primitives ---------- */
    box(w, h, d, mat, x, y, z, ry, parent) {
      const m = new THREE.Mesh(G.box, mat);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      if (ry) m.rotation.y = ry;
      (parent || this.group).add(m);
      return m;
    },
    cyl(rt, rb, h, mat, x, y, z, seg, parent) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 18), mat);
      m.position.set(x, y, z);
      (parent || this.group).add(m);
      return m;
    },
    sphere(r, mat, x, y, z, parent) {
      const m = new THREE.Mesh(G.sph, mat);
      m.scale.setScalar(r * 2);
      m.position.set(x, y, z);
      (parent || this.group).add(m);
      return m;
    },
    panel(w, h, tex, x, y, z, ry, parent, emissive) {
      const mat = new THREE.MeshStandardMaterial({
        map: tex, emissive: emissive === undefined ? 0xffffff : emissive,
        emissiveMap: tex, emissiveIntensity: .85, roughness: .5, side: THREE.FrontSide
      });
      const m = new THREE.Mesh(G.plane, mat);
      m.scale.set(w, h, 1);
      m.position.set(x, y, z);
      if (ry) m.rotation.y = ry;
      (parent || this.group).add(m);
      return m;
    },
    glow(color, size, x, y, z, parent) {
      const mat = new THREE.SpriteMaterial({
        map: Utils.glowTexture(color), color: 0xffffff, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: .55
      });
      const s = new THREE.Sprite(mat);
      s.scale.set(size, size, 1);
      s.position.set(x, y, z);
      (parent || this.group).add(s);
      return s;
    },
    addCollider(cx, cz, w, d, tag) {
      const c = { x1: cx - w / 2, x2: cx + w / 2, z1: cz - d / 2, z2: cz + d / 2, tag: tag || '', disabled: false };
      this.colliders.push(c);
      return c;
    },

    /** temporarily redirect construction into another environment's group/arrays */
    _with(b, fn) {
      const og = this.group, oc = this.colliders, orr = this.rayTargets, oi = this.interactables;
      this.group = b.group; this.colliders = b.colliders;
      this.rayTargets = b.rayTargets; this.interactables = b.interactables || oi;
      try { return fn(); } finally {
        this.group = og; this.colliders = oc; this.rayTargets = orr; this.interactables = oi;
      }
    },

    /* ---------- lights ---------- */
    buildLights() {
      this.scene.add(new THREE.AmbientLight(0x5b6a90, 1.15));
      const hemi = new THREE.HemisphereLight(0x6a7ba8, 0x241426, 0.9);
      this.scene.add(hemi);
      // soft key light so floors and furniture read clearly
      const key = new THREE.DirectionalLight(0xbfd4ff, 0.55);
      key.position.set(12, 16, 18);
      this.scene.add(key);

      const mainSpots = [
        { x: 0, z: 16, c: 0xd7e6ff, i: 3.0 },
        { x: 0, z: 8, c: 0x00e5ff, i: 2.8 },
        { x: -20, z: -4, c: 0xff8ad0, i: 2.8 },
        { x: 20, z: -8, c: 0xffd88a, i: 3.0 },
        { x: 20, z: 6, c: 0x8be8ff, i: 2.6 },
        { x: 0, z: -14, c: 0xd0a8ff, i: 2.4 },
        { x: 0, z: -2, c: 0xffc63a, i: 3.0 },
        { x: -20, z: 10, c: 0xffe0a8, i: 2.4 }
      ];
      mainSpots.forEach((s, i) => {
        const sp = new THREE.SpotLight(s.c, s.i * 7, 34, Math.PI / 3.6, .6, 1.2);
        sp.position.set(s.x, 6.4, s.z);
        sp.target.position.set(s.x, 0, s.z);
        this.scene.add(sp); this.scene.add(sp.target);
        this.lights.spots.push(sp);
        // tier 1 = always on, 2 = medium+high, 3 = high only
        this.lights.tiered.push({ light: sp, tier: i < 3 ? 1 : i < 6 ? 2 : 3 });
        if (i > 2) this.lights.optional.push(sp);
      });

      const points = [
        { x: -22, z: 14, c: 0xffc63a, i: 2.2 }, { x: 22, z: 14, c: 0x8be8ff, i: 2.2 },
        { x: -20, z: -14, c: 0xff8ad0, i: 1.8 }, { x: 26, z: -18, c: 0x7dffcf, i: 1.8 },
        { x: 15, z: -27, c: 0xffd88a, i: 1.8 },
        { x: 15, z: -40, c: 0xffc63a, i: 3.4 }, { x: 24, z: -46, c: 0xd0a8ff, i: 2.4 },
        { x: -20, z: 2, c: 0xffe0b0, i: 1.8 }, { x: -20, z: -8, c: 0xbfe6ff, i: 1.8 },
        { x: 8, z: -40, c: 0xffd0e8, i: 2.4 }, { x: 15, z: -48, c: 0xffe0a8, i: 2.2 }
      ];
      points.forEach((p, i) => {
        const l = new THREE.PointLight(p.c, p.i * 14, 30, 2);
        l.position.set(p.x, 4.2, p.z);
        this.scene.add(l);
        this.lights.tiered.push({ light: l, tier: i < 2 ? 1 : i < 7 ? 2 : 3 });
        if (i > 1) this.lights.optional.push(l);
      });
    },

    /* ---------- hall shell ---------- */
    buildHall() {
      const w = HALL.x2 - HALL.x1, d = HALL.z2 - HALL.z1;
      // floor
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.floor);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, 0, 0);
      floor.receiveShadow = true;
      this.group.add(floor);
      // central carpet
      const carpet = new THREE.Mesh(new THREE.PlaneGeometry(26, 22), M.carpet);
      carpet.rotation.x = -Math.PI / 2;
      carpet.position.set(0, 0.02, 2);
      this.group.add(carpet);
      // ceiling
      const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.ceiling);
      ceil.rotation.x = Math.PI / 2;
      ceil.position.y = HALL.h;
      this.group.add(ceil);

      // walls (with north VIP gap)
      const t = 1, h = HALL.h;
      this.box(w, h, t, M.wall, 0, h / 2, HALL.z2 + t / 2);           // south
      this.addCollider(0, HALL.z2 + t / 2, w, t, 'wall');
      this.box(t, h, d, M.wall, HALL.x1 - t / 2, h / 2, 0);           // west
      this.addCollider(HALL.x1 - t / 2, 0, t, d, 'wall');
      this.box(t, h, d, M.wall, HALL.x2 + t / 2, h / 2, 0);           // east
      this.addCollider(HALL.x2 + t / 2, 0, t, d, 'wall');
      // north wall in two parts (gap x 11..19 for VIP door)
      this.box(41, h, t, M.wall, -9.5, h / 2, HALL.z1 - t / 2);
      this.addCollider(-9.5, HALL.z1 - t / 2, 41, t, 'wall');
      this.box(11, h, t, M.wall, 24.5, h / 2, HALL.z1 - t / 2);
      this.addCollider(24.5, HALL.z1 - t / 2, 11, t, 'wall');

      // wall neon strips (instanced)
      const strip = new THREE.BoxGeometry(1, .16, .16);
      const stripMatA = M.neonCyan, stripMatB = M.neonPink;
      const rows = [];
      for (let x = -28; x <= 28; x += 7) { rows.push([x, 5.2, HALL.z2 - .2, 0, 6]); rows.push([x, 5.2, HALL.z1 + .2, 0, 6]); }
      for (let z = -19; z <= 19; z += 7) { rows.push([HALL.x1 + .2, 5.2, z, Math.PI / 2, 6]); rows.push([HALL.x2 - .2, 5.2, z, Math.PI / 2, 6]); }
      const instA = new THREE.InstancedMesh(strip, stripMatA, rows.length);
      const dummy = new THREE.Object3D();
      rows.forEach((r, i) => {
        dummy.position.set(r[0], r[1], r[2]);
        dummy.rotation.set(0, r[3], 0);
        dummy.scale.set(r[4], 1, 1);
        dummy.updateMatrix();
        instA.setMatrixAt(i, dummy.matrix);
      });
      this.group.add(instA);
      this.animated.push({ type: 'neonPulse', obj: instA, base: 2.1, mat: stripMatA });

      // ceiling light panels (instanced)
      const panelGeo = new THREE.BoxGeometry(3.4, .16, 1.1);
      const pmat = new THREE.MeshStandardMaterial({ color: 0xdff6ff, emissive: 0x6fd9ff, emissiveIntensity: 1.15 });
      const spots = [];
      for (let x = -26; x <= 26; x += 6.6) for (let z = -18; z <= 18; z += 8) spots.push([x, HALL.h - .25, z]);
      const inst = new THREE.InstancedMesh(panelGeo, pmat, spots.length);
      spots.forEach((s, i) => {
        dummy.position.set(s[0], s[1], s[2]); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
        dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
      });
      this.group.add(inst);
      this.animated.push({ type: 'panelFlicker', mat: pmat, base: 1.15 });

      // columns
      const colPos = [[-10, -18], [10, -18], [-10, 18], [10, 18], [-26, 8], [26, 8], [-26, -12], [26, -12]];
      colPos.forEach(([x, z]) => this.column(x, z));

      // big neon logo above entrance (inside, facing hall)
      const logo = Utils.textTexture('NEON PALACE', { w: 1024, h: 256, color: '#ff2d95', bg: '#07070d', size: 150 });
      const lp = this.panel(16, 4, logo, 0, 5.2, HALL.z2 - .55, Math.PI, null, 0xffffff);
      lp.material.emissiveIntensity = 1.3;
      this.glow('rgba(255,45,149,.8)', 20, 0, 5.2, HALL.z2 - 1.2);
      this.animated.push({ type: 'signPulse', mat: lp.material, base: 1.3 });
    },

    column(x, z) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.group.add(g);
      this.cyl(.55, .62, HALL.h, M.wallDark, 0, HALL.h / 2, 0, 14, g);
      this.cyl(.72, .72, .3, M.goldDark, 0, .16, 0, 14, g);
      this.cyl(.72, .72, .3, M.goldDark, 0, HALL.h - .16, 0, 14, g);
      const ring = this.cyl(.6, .6, .12, M.neonCyan, 0, 2.6, 0, 14, g);
      this.animated.push({ type: 'ringPulse', obj: ring, phase: Math.random() * 6.28 });
      this.glow('rgba(0,229,255,.55)', 3.4, x, 2.6, z);
      this.addCollider(x, z, 1.3, 1.3, 'column');
    },

    /* ---------- entrance / lobby ---------- */
    buildEntrance() {
      // glass doors
      const dg = new THREE.Group();
      this.group.add(dg);
      [-2.1, 2.1].forEach(dx => {
        this.box(4, 5, .18, M.glass, dx, 2.5, HALL.z2 - .1, 0, dg);
        this.box(4.2, .2, .3, M.goldDark, dx, 5.1, HALL.z2 - .1, 0, dg);
      });
      this.addCollider(0, HALL.z2 - .1, 9, .6, 'doors');

      // reception desk
      const desk = new THREE.Group();
      desk.position.set(0, 0, 17);
      this.group.add(desk);
      this.box(7, 1.1, 1.6, M.wood, 0, .55, 0, 0, desk);
      this.box(7.4, .12, 1.9, M.goldDark, 0, 1.16, 0, 0, desk);
      const deskNeon = new THREE.MeshStandardMaterial({ color: 0xff2d95, emissive: 0xff2d95, emissiveIntensity: 1.1, roughness: .4 });
      this.box(6.2, .18, .08, deskNeon, 0, .42, .82, 0, desk);
      this.addCollider(0, 17, 7.4, 1.9, 'desk');
      this.glow('rgba(255,45,149,.35)', 3.6, 0, .9, 17.9);
      // small reception plaque (kept low so it never blocks the spawn view)
      const wtex = Utils.textTexture('RECEPTION', { w: 512, h: 128, color: '#ffc63a', bg: '#0a0710', size: 74 });
      this.panel(2.2, .55, wtex, 0, .78, 16.05, Math.PI, null);

      // sofas + coffee tables in lobby
      [[-12, 15, 0], [12, 15, 0], [-12, 19.5, Math.PI], [12, 19.5, Math.PI]].forEach(([x, z, ry]) => this.sofa(x, z, ry));
      [[-12, 17.4], [12, 17.4]].forEach(([x, z]) => {
        this.cyl(.9, .7, .5, M.metal, x, .25, z, 16);
        this.cyl(1, 1, .08, M.glass, x, .54, z, 16);
        this.addCollider(x, z, 2, 2, 'table');
      });

      // arrival carpet strip
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(9, 12), M.carpet);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, .015, 16);
      this.group.add(strip);
    },

    sofa(x, z, ry, b) {
      if (b) return this._with(b, () => this.sofa(x, z, ry));
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry || 0;
      this.group.add(g);
      this.box(4.4, .5, 1.7, M.leather, 0, .35, 0, 0, g);
      this.box(4.4, 1.1, .4, M.leather, 0, .95, -.65, 0, g);
      this.box(.4, .8, 1.7, M.leather, -2, .8, 0, 0, g);
      this.box(.4, .8, 1.7, M.leather, 2, .8, 0, 0, g);
      [-1.1, 1.1].forEach(px => this.box(1.8, .18, 1.4, M.leatherRed, px, .62, .08, 0, g));
      const rot = Math.abs(Math.sin(ry || 0)) > .5;
      this.addCollider(x, z, rot ? 1.9 : 4.6, rot ? 4.6 : 1.9, 'sofa');
    },

    /* ---------- slot machines ---------- */
    slotMachine(x, z, ry, cfg, b) {
      if (b) return this._with(b, () => this.slotMachine(x, z, ry, cfg));
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      this.group.add(g);

      const vip = !!cfg.vip;
      const bodyMat = vip
        ? new THREE.MeshStandardMaterial({ color: 0x3a1030, roughness: .45, metalness: .6 })
        : new THREE.MeshStandardMaterial({ color: 0x1d2233, roughness: .5, metalness: .5 });
      this.box(1.15, .35, .95, M.goldDark, 0, .17, 0, 0, g);           // plinth
      this.box(1.05, 1.5, .85, bodyMat, 0, 1.1, 0, 0, g);              // cabinet
      this.box(1.1, .5, .5, bodyMat, 0, 2.05, -.15, 0, g);             // top
      const scrTex = Utils.textTexture(vip ? 'DIAMOND\nSLOTS' : 'LUCKY\nSLOTS', {
        w: 512, h: 512, color: vip ? '#ff8ad8' : '#ffc63a', bg: '#0a0d16', size: 92, border: vip ? '#ff2d95' : '#00e5ff'
      });
      this.panel(.8, .8, scrTex, 0, 1.55, .44, 0, g).material.emissiveIntensity = 1.1;
      // reels
      const reelMat = new THREE.MeshStandardMaterial({ color: 0xf3f6ff, roughness: .35, emissive: 0x554400, emissiveIntensity: .25 });
      const reels = [];
      [-.26, 0, .26].forEach(px => {
        const r = this.cyl(.2, .2, .22, reelMat, px, .95, .3, 16, g);
        r.rotation.z = Math.PI / 2;
        reels.push(r);
      });
      // buttons
      [[-.25, 0x25e39a], [0, 0xffc63a], [.25, 0xff2d95]].forEach(([px, col]) => {
        const bm = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .9 });
        this.cyl(.07, .07, .05, bm, px, .72, .45, 10, g).rotation.x = Math.PI / 2;
      });
      // side lamps
      const lampMat = new THREE.MeshStandardMaterial({ color: 0xffc63a, emissive: 0xffc63a, emissiveIntensity: 1.4 });
      const lamps = [];
      [-.56, .56].forEach(px => {
        for (let i = 0; i < 3; i++) lamps.push(this.sphere(.06, lampMat, px, .8 + i * .45, .2, g));
      });
      this.box(.9, .12, .1, vip ? M.neonPink : M.neonCyan, 0, 2.34, -.1, 0, g);
      this.glow(vip ? 'rgba(255,45,149,.6)' : 'rgba(255,198,58,.5)', 2.6, x, 1.9, z);

      const hit = this.box(1.5, 2.4, 1.5, M.hit, 0, 1.2, .2, 0, g);
      this.addCollider(x, z, 1.5, 1.3, 'slot');
      const inter = {
        node: g, label: vip ? 'PLAY DIAMOND SLOTS' : 'PLAY SLOTS', key: 'slots',
        game: 'slots', cfg: cfg, lock: cfg.lock || null, reels, lamps, lampMat
      };
      hit.userData.interact = inter;
      this.interactables.push(inter);
      this.rayTargets.push(hit);
      this.animated.push({ type: 'slotLamps', lamps, mat: lampMat, phase: Math.random() * 6.28, node: g });
      return inter;
    },

    buildSlotZone() {
      // neon sign
      const sign = Utils.textTexture('SLOT PARADISE', { w: 1024, h: 256, color: '#00e5ff', bg: '#07070d', size: 120 });
      const sp = this.panel(11, 2.6, sign, HALL.x1 + .6, 5, -4, Math.PI / 2, null);
      sp.material.emissiveIntensity = 1.2;
      this.animated.push({ type: 'signPulse', mat: sp.material, base: 1.2 });
      this.glow('rgba(0,229,255,.6)', 14, HALL.x1 + 1.2, 5, -4);

      const zs = [-14, -9, -4, 1, 6];
      zs.forEach((z, i) => {
        this.slotMachine(-24, z, Math.PI / 2, { bets: [50, 100, 250, 500], name: 'CLASSIC SLOTS #' + (i + 1) });
        this.slotMachine(-16, z, -Math.PI / 2, {
          bets: i < 3 ? [50, 100, 250, 500] : [100, 250, 500, 1000],
          lock: i >= 3 ? 'luckyslots' : null, name: 'LUCKY SLOTS #' + (i + 1)
        });
      });
      // stools (instanced)
      const geo = new THREE.CylinderGeometry(.28, .22, .55, 12);
      const mat = new THREE.MeshStandardMaterial({ color: 0x53121f, roughness: .7 });
      const pts = [];
      zs.forEach(z => { pts.push([-22.6, z]); pts.push([-17.4, z]); });
      const inst = new THREE.InstancedMesh(geo, mat, pts.length);
      const d = new THREE.Object3D();
      pts.forEach((p, i) => { d.position.set(p[0], .5, p[1]); d.updateMatrix(); inst.setMatrixAt(i, d.matrix); });
      this.group.add(inst);
      // floor accent
      const acc = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 24), new THREE.MeshStandardMaterial({ color: 0x160a20, roughness: .9 }));
      acc.rotation.x = -Math.PI / 2; acc.position.set(-20, .014, -4);
      this.group.add(acc);
    },

    /* ---------- dice ---------- */
    diceTable(x, z, cfg, b) {
      if (b) return this._with(b, () => this.diceTable(x, z, cfg));
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.group.add(g);
      this.box(4.2, .75, 2.6, M.wood, 0, .38, 0, 0, g);
      this.box(3.9, .1, 2.3, M.felt, 0, .78, 0, 0, g);
      this.box(4.3, .18, .18, M.neonGreen, 0, .86, 1.25, 0, g);
      this.box(4.3, .18, .18, M.neonGreen, 0, .86, -1.25, 0, g);
      const dieMat = new THREE.MeshStandardMaterial({ color: 0xf7f9ff, roughness: .35 });
      const dice = [];
      [-.5, .5].forEach(px => {
        const dm = this.box(.34, .34, .34, dieMat, px, 1, .3, 0, g);
        dice.push(dm);
      });
      const tex = Utils.textTexture('DICE\nOVER / UNDER', { w: 512, h: 256, color: '#25e39a', bg: '#08120e', size: 66 });
      this.panel(2.4, 1.2, tex, 0, 2.3, -1.4, 0, g).material.emissiveIntensity = 1;
      this.glow('rgba(37,227,154,.5)', 5, x, 1.6, z);
      const hit = this.box(4.6, 2, 3, M.hit, 0, 1, 0, 0, g);
      this.addCollider(x, z, 4.4, 2.8, 'dice');
      const inter = { node: g, label: 'PLAY DICE', key: 'dice', game: 'dice', cfg, dice, lock: cfg.lock || null };
      hit.userData.interact = inter;
      this.interactables.push(inter);
      this.rayTargets.push(hit);
      this.animated.push({ type: 'diceIdle', dice, phase: Math.random() * 6 });
      return inter;
    },

    buildDiceZone() {
      const sign = Utils.textTexture('DICE CORNER', { w: 1024, h: 256, color: '#25e39a', bg: '#07070d', size: 130 });
      const sp = this.panel(10, 2.4, sign, 0, 5, HALL.z1 + .6, 0, null);
      this.animated.push({ type: 'signPulse', mat: sp.material, base: 1 });
      this.glow('rgba(37,227,154,.5)', 12, 0, 5, HALL.z1 + 1.2);
      this.diceTable(-5, -16, { bets: [50, 100, 250, 500], name: 'DICE TABLE 1' });
      this.diceTable(5, -16, { bets: [250, 500, 1000, 2500], lock: 'dicehigh', name: 'HIGH-STAKES DICE' });
    },

    /* ---------- roulette ---------- */
    rouletteTable(x, z, cfg, b) {
      if (b) return this._with(b, () => this.rouletteTable(x, z, cfg));
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.group.add(g);
      const vip = !!cfg.vip;
      this.cyl(2.3, 2.5, .75, M.wood, 0, .38, 0, 24, g);
      this.cyl(2.25, 2.25, .1, vip ? M.feltVip : M.felt, 0, .79, 0, 24, g);
      this.cyl(2.4, 2.4, .12, M.goldDark, 0, .84, 0, 24, g);
      // wheel
      const wheel = new THREE.Group();
      wheel.position.set(0, .9, 0);
      g.add(wheel);
      this.cyl(1.05, 1.15, .16, M.goldDark, 0, 0, 0, 28, wheel);
      this.cyl(.95, .95, .1, M.black, 0, .1, 0, 28, wheel);
      // pockets: alternate red/black wedges via instanced boxes
      const pocketGeo = new THREE.BoxGeometry(.2, .09, .42);
      const instR = new THREE.InstancedMesh(pocketGeo, M.red, 18);
      const instB = new THREE.InstancedMesh(pocketGeo, M.black, 19);
      const d = new THREE.Object3D();
      let ri = 0, bi = 0;
      for (let i = 0; i < 37; i++) {
        const a = i / 37 * Math.PI * 2;
        d.position.set(Math.cos(a) * .75, .16, Math.sin(a) * .75);
        d.rotation.set(0, -a, 0);
        d.updateMatrix();
        if (i % 2 === 0 && ri < 18) instR.setMatrixAt(ri++, d.matrix);
        else if (bi < 19) instB.setMatrixAt(bi++, d.matrix);
      }
      wheel.add(instR); wheel.add(instB);
      this.cyl(.3, .34, .3, M.gold, 0, .26, 0, 16, wheel);
      const ball = this.sphere(.07, M.white, .82, .22, 0, wheel);
      // layout cloth
      const layTex = this.rouletteLayoutTexture();
      const lay = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.6), new THREE.MeshStandardMaterial({ map: layTex, roughness: .9 }));
      lay.rotation.x = -Math.PI / 2;
      lay.position.set(0, .86, 2.6);
      g.add(lay);
      this.box(4, .8, 2, M.wood, 0, .4, 2.6, 0, g);
      this.addCollider(x, z, 5, 5.6, 'roul');
      const tex = Utils.textTexture(vip ? 'VIP ROULETTE' : 'ROULETTE', { w: 512, h: 200, color: vip ? '#ffc63a' : '#ff2d95', bg: '#0b0710', size: 92 });
      const sp = this.panel(3, 1.2, tex, 0, 3.1, -1.6, 0, g);
      this.animated.push({ type: 'signPulse', mat: sp.material, base: 1 });
      this.glow(vip ? 'rgba(255,198,58,.55)' : 'rgba(255,45,149,.5)', 6.5, x, 2, z);
      for (let i = 0; i < 4; i++) this.chair(x + Math.cos(i / 4 * 6.28) * 3.2, z + Math.sin(i / 4 * 6.28) * 3.2, -i / 4 * 6.28);
      const hit = this.box(5, 2.4, 5.6, M.hit, 0, 1.2, 0, 0, g);
      const inter = { node: g, label: vip ? 'PLAY VIP ROULETTE' : 'PLAY ROULETTE', key: 'roulette', game: 'roulette', cfg, wheel, ball, lock: cfg.lock || 'roulette' };
      hit.userData.interact = inter;
      this.interactables.push(inter);
      this.rayTargets.push(hit);
      this.animated.push({ type: 'wheelIdle', wheel, ball });
      return inter;
    },

    rouletteLayoutTexture() {
      if (Utils._tex.roulLayout) return Utils._tex.roulLayout;
      const w = 1024, h = 460, c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#0f5132'; g.fillRect(0, 0, w, h);
      const REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
      g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.fillStyle = '#127a3d'; g.fillRect(10, 10, 70, 330); g.strokeRect(10, 10, 70, 330);
      g.fillStyle = '#fff'; g.fillText('0', 45, 175);
      for (let i = 1; i <= 36; i++) {
        const col = Math.floor((i - 1) / 3), row = 2 - ((i - 1) % 3);
        const x = 90 + col * 76, y = 10 + row * 110;
        g.fillStyle = REDS.indexOf(i) >= 0 ? '#b3242c' : '#15181f';
        g.fillRect(x, y, 76, 110);
        g.strokeRect(x, y, 76, 110);
        g.fillStyle = '#fff'; g.fillText(String(i), x + 38, y + 55);
      }
      const labels = ['1st 12', '2nd 12', '3rd 12'];
      labels.forEach((t, i) => {
        const x = 90 + i * 304;
        g.fillStyle = '#0d4429'; g.fillRect(x, 340, 304, 55); g.strokeRect(x, 340, 304, 55);
        g.fillStyle = '#fff'; g.fillText(t, x + 152, 368);
      });
      const outs = ['1-18', 'EVEN', 'RED', 'BLACK', 'ODD', '19-36'];
      outs.forEach((t, i) => {
        const x = 90 + i * 152;
        g.fillStyle = t === 'RED' ? '#b3242c' : t === 'BLACK' ? '#15181f' : '#0d4429';
        g.fillRect(x, 395, 152, 55); g.strokeRect(x, 395, 152, 55);
        g.fillStyle = '#fff'; g.fillText(t, x + 76, 423);
      });
      const t = new THREE.CanvasTexture(c);
      Utils._tex.roulLayout = t;
      return t;
    },

    chair(x, z, ry) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry || 0;
      this.group.add(g);
      this.box(.7, .12, .7, M.leatherRed, 0, .55, 0, 0, g);
      this.box(.7, .8, .12, M.leatherRed, 0, .95, -.3, 0, g);
      this.cyl(.09, .12, .55, M.metal, 0, .27, 0, 8, g);
      this.cyl(.32, .32, .06, M.metal, 0, .04, 0, 10, g);
      return g;
    },

    buildRouletteZone() {
      const sign = Utils.textTexture('ROULETTE ROYALE', { w: 1024, h: 256, color: '#ff2d95', bg: '#07070d', size: 118 });
      const sp = this.panel(11, 2.6, sign, HALL.x2 - .6, 5, -12, -Math.PI / 2, null);
      this.animated.push({ type: 'signPulse', mat: sp.material, base: 1.1 });
      this.glow('rgba(255,45,149,.55)', 13, HALL.x2 - 1.2, 5, -12);
      this.rouletteTable(17, -14, { bets: [50, 100, 250, 500], name: 'ROULETTE 1' });
      this.rouletteTable(25, -7, { bets: [100, 250, 500, 1000], name: 'ROULETTE 2' });
    },

    /* ---------- blackjack ---------- */
    blackjackTable(x, z, cfg, b) {
      if (b) return this._with(b, () => this.blackjackTable(x, z, cfg));
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = cfg.ry || 0;
      this.group.add(g);
      const vip = !!cfg.vip;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, .18, 28, 1, false, 0, Math.PI), vip ? M.feltVip : M.felt);
      top.position.set(0, .8, 0);
      g.add(top);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(2.2, .1, 8, 28, Math.PI), M.goldDark);
      rim.position.set(0, .86, 0);
      rim.rotation.x = Math.PI / 2;
      g.add(rim);
      this.box(4.4, .8, 2.2, M.wood, 0, .4, -1.1, 0, g);
      this.cyl(2.2, 2.2, .8, M.wood, 0, .4, 0, 24, g);
      // dealer shoe + chip stacks
      this.box(.5, .3, .35, M.plastic, 0, 1, -1.5, 0, g);
      const chipCols = [0xffc63a, 0x00e5ff, 0xff2d95, 0x25e39a];
      chipCols.forEach((c, i) => {
        const cm = new THREE.MeshStandardMaterial({ color: c, roughness: .6 });
        for (let k = 0; k < 4; k++) this.cyl(.14, .14, .035, cm, -.9 + i * .6, .92 + k * .036, -1.6, 12, g);
      });
      const tex = Utils.textTexture(vip ? 'HIGH-ROLLER\nBLACKJACK' : 'BLACKJACK\nPAYS 3 TO 2', { w: 512, h: 256, color: vip ? '#ffc63a' : '#00e5ff', bg: '#071018', size: 62 });
      const sp = this.panel(2.6, 1.3, tex, 0, 2.5, -2.2, 0, g);
      this.animated.push({ type: 'signPulse', mat: sp.material, base: 1 });
      this.glow(vip ? 'rgba(255,198,58,.5)' : 'rgba(0,229,255,.45)', 6, x, 1.8, z);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI * (0.15 + i * 0.23);
        const cx = x + Math.cos(a) * 3, cz = z + Math.sin(a) * 3;
        this.chair(cx, cz, -a + Math.PI);
      }
      this.addCollider(x, z, 5, 4.6, 'bj');
      const hit = this.box(4.8, 2.2, 4.4, M.hit, 0, 1.1, 0, 0, g);
      const inter = { node: g, label: vip ? 'PLAY HIGH-ROLLER BLACKJACK' : 'PLAY BLACKJACK', key: 'blackjack', game: 'blackjack', cfg, lock: cfg.lock || 'blackjack' };
      hit.userData.interact = inter;
      this.interactables.push(inter);
      this.rayTargets.push(hit);
      return inter;
    },

    buildBlackjackZone() {
      const sign = Utils.textTexture('BLACKJACK LOUNGE', { w: 1024, h: 256, color: '#00e5ff', bg: '#07070d', size: 108 });
      const sp = this.panel(11, 2.6, sign, HALL.x2 - .6, 5, 6, -Math.PI / 2, null);
      this.animated.push({ type: 'signPulse', mat: sp.material, base: 1.1 });
      this.glow('rgba(0,229,255,.5)', 13, HALL.x2 - 1.2, 5, 6);
      this.blackjackTable(17, 4, { bets: [50, 100, 250, 500], name: 'BLACKJACK 1', ry: Math.PI });
      this.blackjackTable(25, 10, { bets: [100, 250, 500, 1000], name: 'BLACKJACK 2', ry: Math.PI * 1.15 });
    },

    /* ---------- coin flip ---------- */
    buildCoinFlip() {
      const g = new THREE.Group();
      g.position.set(0, 0, -2);
      this.group.add(g);
      this.cyl(1.6, 1.9, .35, M.goldDark, 0, .17, 0, 24, g);
      this.cyl(1.2, 1.3, 1.1, M.wood, 0, .75, 0, 24, g);
      this.cyl(1.35, 1.35, .12, M.gold, 0, 1.35, 0, 24, g);
      const ring = this.cyl(1.5, 1.5, .1, M.neonGold, 0, .2, 0, 28, g);
      const coin = this.cyl(.95, .95, .16, M.gold, 0, 2.5, 0, 30, g);
      coin.rotation.x = Math.PI / 2;
      const face = Utils.textTexture('$', { w: 256, h: 256, color: '#7a5a00', bg: '#ffd766', size: 190 });
      this.panel(1.6, 1.6, face, 0, 2.5, .09, 0, g);
      this.glow('rgba(255,198,58,.75)', 8, 0, 2.5, -2 + 2);
      const tex = Utils.textTexture('COIN FLIP\nHEADS OR TAILS', { w: 512, h: 256, color: '#ffc63a', bg: '#0d0a05', size: 60 });
      const sp = this.panel(3, 1.5, tex, 0, 4.3, 0, 0, g);
      this.animated.push({ type: 'signPulse', mat: sp.material, base: 1.1 });
      this.addCollider(0, -2, 3.4, 3.4, 'coin');
      const hit = this.box(4, 3.4, 4, M.hit, 0, 1.7, 0, 0, g);
      const inter = { node: g, label: 'PLAY COIN FLIP', key: 'coinflip', game: 'coinflip', cfg: { bets: [50, 100, 250, 500, 1000], name: 'COIN FLIP STATION' }, coin };
      hit.userData.interact = inter;
      this.interactables.push(inter);
      this.rayTargets.push(hit);
      this.animated.push({ type: 'coinIdle', coin, ring });
      this.coinNode = inter;
    },

    /* ---------- services: quest board, shop, daily, terminal ---------- */
    buildServices() {
      // QUEST BOARD (north wall)
      const qb = new THREE.Group();
      qb.position.set(-14, 0, HALL.z1 + .8);
      this.group.add(qb);
      this.box(6, 3.6, .3, M.wood, 0, 3, 0, 0, qb);
      const qTex = Utils.textTexture('QUEST BOARD', { w: 512, h: 256, color: '#ffc63a', bg: '#0c0a06', size: 76, border: '#ffc63a' });
      this.panel(5.4, 2.6, qTex, 0, 3.1, .18, 0, qb).material.emissiveIntensity = 1;
      this.box(6.2, .2, .2, M.neonGold, 0, 4.95, .1, 0, qb);
      this.glow('rgba(255,198,58,.5)', 8, -14, 3.2, HALL.z1 + 1.2);
      let hit = this.box(6, 4, 1.6, M.hit, 0, 2.4, .6, 0, qb);
      let inter = { node: qb, label: 'QUEST BOARD', key: 'panel', panel: 'quests' };
      hit.userData.interact = inter; this.interactables.push(inter); this.rayTargets.push(hit);

      // SHOP (east lobby corner)
      const sh = new THREE.Group();
      sh.position.set(23, 0, 17);
      sh.rotation.y = Math.PI;
      this.group.add(sh);
      this.box(6, 1.2, 1.4, M.wood, 0, .6, 0, 0, sh);
      this.box(6.2, .14, 1.7, M.goldDark, 0, 1.27, 0, 0, sh);
      this.box(6, 3.4, .4, M.wallDark, 0, 1.7, -1.6, 0, sh);
      [0, 1, 2].forEach(i => this.box(5.6, .12, 1, M.metal, 0, 1.1 + i * .9, -1.3, 0, sh));
      // goods
      const goodMats = [M.neonCyan, M.neonPink, M.neonGold, M.neonPurple, M.neonGreen];
      for (let i = 0; i < 12; i++) {
        const m = goodMats[i % goodMats.length];
        this.box(.35, .35, .35, m, -2.2 + (i % 6) * .9, 1.3 + Math.floor(i / 6) * .9, -1.3, Math.random(), sh);
      }
      const shTex = Utils.textTexture('SHOP', { w: 512, h: 256, color: '#00e5ff', bg: '#04080e', size: 150, border: '#00e5ff' });
      const shs = this.panel(4, 1.8, shTex, 0, 4.4, -1.3, 0, sh);
      this.animated.push({ type: 'signPulse', mat: shs.material, base: 1.2 });
      this.glow('rgba(0,229,255,.55)', 9, 23, 3, 16);
      this.addCollider(23, 17, 6.4, 2.2, 'shop');
      hit = this.box(6.4, 3, 2.6, M.hit, 0, 1.5, .6, 0, sh);
      inter = { node: sh, label: 'SHOP', key: 'panel', panel: 'shop' };
      hit.userData.interact = inter; this.interactables.push(inter); this.rayTargets.push(hit);

      // DAILY REWARD STATION (west lobby corner)
      const dr = new THREE.Group();
      dr.position.set(-23, 0, 17);
      dr.rotation.y = Math.PI;
      this.group.add(dr);
      this.box(2.2, .4, 2.2, M.goldDark, 0, .2, 0, 0, dr);
      this.box(1.9, 2.6, 1.9, new THREE.MeshStandardMaterial({ color: 0x241533, roughness: .5, metalness: .5 }), 0, 1.6, 0, 0, dr);
      const gift = this.box(1.3, 1.3, 1.3, M.neonPink, 0, 3.6, 0, .5, dr);
      this.box(1.45, .22, .22, M.neonGold, 0, 3.6, 0, .5, dr);
      this.box(.22, .22, 1.45, M.neonGold, 0, 3.6, 0, .5, dr);
      const dTex = Utils.textTexture('DAILY\nREWARD', { w: 512, h: 512, color: '#ffc63a', bg: '#0d0616', size: 110, border: '#ff2d95' });
      this.panel(1.6, 1.6, dTex, 0, 1.9, .98, 0, dr).material.emissiveIntensity = 1.1;
      this.glow('rgba(255,45,149,.6)', 8, -23, 3.6, 16);
      this.addCollider(-23, 17, 2.4, 2.4, 'daily');
      hit = this.box(3.4, 4.6, 3.4, M.hit, 0, 2.3, .4, 0, dr);
      inter = { node: dr, label: 'DAILY REWARD', key: 'panel', panel: 'daily', gift };
      hit.userData.interact = inter; this.interactables.push(inter); this.rayTargets.push(hit);
      this.animated.push({ type: 'giftBob', obj: gift, phase: 0 });

      // STATS TERMINAL (lobby)
      const tm = new THREE.Group();
      tm.position.set(-8, 0, 19.5);
      tm.rotation.y = Math.PI;
      this.group.add(tm);
      this.box(1.5, .3, 1, M.metal, 0, .15, 0, 0, tm);
      this.box(1.2, 1.6, .5, M.plastic, 0, 1, 0, 0, tm);
      const tTex = Utils.textTexture('PLAYER\nTERMINAL', { w: 512, h: 384, color: '#25e39a', bg: '#04120c', size: 84, border: '#25e39a' });
      this.panel(1.5, 1.1, tTex, 0, 2.2, .1, 0, tm).material.emissiveIntensity = 1;
      this.box(1.7, 1.3, .18, M.wallDark, 0, 2.2, .02, 0, tm);
      this.glow('rgba(37,227,154,.45)', 4.5, -8, 2.2, 19);
      this.addCollider(-8, 19.5, 1.7, 1.2, 'terminal');
      hit = this.box(2.4, 3, 2, M.hit, 0, 1.5, .5, 0, tm);
      inter = { node: tm, label: 'PLAYER PROFILE', key: 'panel', panel: 'profile' };
      hit.userData.interact = inter; this.interactables.push(inter); this.rayTargets.push(hit);

      // ACHIEVEMENT WALL (west of entrance)
      const aw = new THREE.Group();
      aw.position.set(8, 0, 20.8);
      aw.rotation.y = Math.PI;
      this.group.add(aw);
      this.box(5, 3, .3, M.wood, 0, 3, 0, 0, aw);
      const aTex = Utils.textTexture('HALL OF FAME\nACHIEVEMENTS', { w: 512, h: 320, color: '#c07cff', bg: '#0a0616', size: 62, border: '#c07cff' });
      this.panel(4.4, 2.4, aTex, 0, 3, .18, 0, aw).material.emissiveIntensity = 1;
      this.glow('rgba(192,124,255,.5)', 7, 8, 3, 20);
      hit = this.box(5, 3.4, 1.6, M.hit, 0, 2.6, .7, 0, aw);
      inter = { node: aw, label: 'ACHIEVEMENTS', key: 'panel', panel: 'achievements' };
      hit.userData.interact = inter; this.interactables.push(inter); this.rayTargets.push(hit);
    },

    /* ---------- VIP ---------- */
    buildVip() {
      // corridor
      const corW = COR.x2 - COR.x1, corD = COR.z2 - COR.z1;
      const cf = new THREE.Mesh(new THREE.PlaneGeometry(corW, corD), M.carpet);
      cf.rotation.x = -Math.PI / 2;
      cf.position.set((COR.x1 + COR.x2) / 2, .01, (COR.z1 + COR.z2) / 2);
      this.group.add(cf);
      const cc = new THREE.Mesh(new THREE.PlaneGeometry(corW, corD), M.ceiling);
      cc.rotation.x = Math.PI / 2; cc.position.set(15, 5, -27);
      this.group.add(cc);
      this.box(.6, 5, corD, M.wallDark, COR.x1 - .3, 2.5, -27);
      this.addCollider(COR.x1 - .3, -27, .6, corD, 'wall');
      this.box(.6, 5, corD, M.wallDark, COR.x2 + .3, 2.5, -27);
      this.addCollider(COR.x2 + .3, -27, .6, corD, 'wall');
      for (let z = -24; z >= -31; z -= 3.5) {
        this.box(.16, .16, 3, M.neonGold, COR.x1 + .2, 4.4, z);
        this.box(.16, .16, 3, M.neonGold, COR.x2 - .2, 4.4, z);
      }

      // VIP door (two sliding panels) at z = -22
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a1e08, roughness: .3, metalness: .95, emissive: 0x2a1c00, emissiveIntensity: .8 });
      this.vipDoors = [];
      [-1, 1].forEach(s => {
        const p = this.box(4, 5, .35, doorMat, 15 + s * 2, 2.5, HALL.z1 - .2);
        this.vipDoors.push({ mesh: p, base: 15 + s * 2, dir: s });
      });
      this.box(8.6, .3, .5, M.neonGold, 15, 5.2, HALL.z1 - .2);
      const vTex = Utils.textTexture('VIP AREA\nREQUIRES LEVEL 15', { w: 640, h: 256, color: '#ffc63a', bg: '#0d0a02', size: 62, border: '#ffc63a' });
      this.vipSign = this.panel(6, 2.2, vTex, 15, 5.9, HALL.z1 + .3, Math.PI);
      this.animated.push({ type: 'signPulse', mat: this.vipSign.material, base: 1.1 });
      this.glow('rgba(255,198,58,.6)', 12, 15, 4, HALL.z1 + 1);
      this._vipCollider = this.addCollider(15, HALL.z1 - .2, 8, .8, 'vipdoor');
      const hit = this.box(8, 5, 1.6, M.hit, 15, 2.5, HALL.z1 + .6);
      const inter = { node: null, label: 'VIP DOOR', key: 'vipdoor' };
      hit.userData.interact = inter;
      this.interactables.push(inter);
      this.rayTargets.push(hit);

      // VIP room
      const vw = VIP.x2 - VIP.x1, vd = VIP.z2 - VIP.z1;
      const vf = new THREE.Mesh(new THREE.PlaneGeometry(vw, vd), new THREE.MeshStandardMaterial({ color: 0x5c2440, roughness: .55, metalness: .35 }));
      vf.rotation.x = -Math.PI / 2;
      vf.position.set((VIP.x1 + VIP.x2) / 2, .01, (VIP.z1 + VIP.z2) / 2);
      this.group.add(vf);
      const vc = new THREE.Mesh(new THREE.PlaneGeometry(vw, vd), M.ceiling);
      vc.rotation.x = Math.PI / 2;
      vc.position.set(15, VIP.h, -42);
      this.group.add(vc);
      const t = .8;
      this.box(vw + t * 2, VIP.h, t, M.wallDark, 15, VIP.h / 2, VIP.z1 - t / 2);
      this.addCollider(15, VIP.z1 - t / 2, vw + t * 2, t, 'wall');
      this.box(t, VIP.h, vd, M.wallDark, VIP.x1 - t / 2, VIP.h / 2, -42);
      this.addCollider(VIP.x1 - t / 2, -42, t, vd, 'wall');
      this.box(t, VIP.h, vd, M.wallDark, VIP.x2 + t / 2, VIP.h / 2, -42);
      this.addCollider(VIP.x2 + t / 2, -42, t, vd, 'wall');
      // south wall of VIP with gap for corridor (x 11..19)
      this.box(9, VIP.h, t, M.wallDark, 6.5, VIP.h / 2, VIP.z2 + t / 2);
      this.addCollider(6.5, VIP.z2 + t / 2, 9, t, 'wall');
      this.box(9, VIP.h, t, M.wallDark, 23.5, VIP.h / 2, VIP.z2 + t / 2);
      this.addCollider(23.5, VIP.z2 + t / 2, 9, t, 'wall');

      // gold columns + chandelier
      [[5, -36], [25, -36], [5, -48], [25, -48]].forEach(([x, z]) => {
        this.cyl(.5, .56, VIP.h, M.goldDark, x, VIP.h / 2, z, 14);
        this.cyl(.62, .62, .3, M.gold, x, .16, z, 14);
        this.cyl(.62, .62, .3, M.gold, x, VIP.h - .16, z, 14);
        this.addCollider(x, z, 1.2, 1.2, 'column');
      });
      const ch = new THREE.Group();
      ch.position.set(15, VIP.h - 1.2, -42);
      this.group.add(ch);
      this.cyl(1.6, .3, 1.2, M.gold, 0, 0, 0, 16, ch);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2;
        this.sphere(.16, M.lampWarm, Math.cos(a) * 1.5, -.5, Math.sin(a) * 1.5, ch);
      }
      this.glow('rgba(255,214,138,.7)', 12, 15, VIP.h - 1.6, -42);
      this.animated.push({ type: 'chandelier', obj: ch });

      // VIP slots / tables
      [6, 10, 20, 24].forEach((x, i) => this.slotMachine(x, -49.5, 0, { vip: true, bets: [1000, 2500, 5000, 10000], lock: 'vipslots', name: 'DIAMOND SLOTS #' + (i + 1) }));
      this.rouletteTable(8, -40, { vip: true, bets: [500, 1000, 2500, 5000], lock: 'vip', name: 'VIP ROULETTE' });
      this.blackjackTable(22, -40, { vip: true, bets: [1000, 2500, 5000, 10000], lock: 'hightable', name: 'HIGH-ROLLER BLACKJACK', ry: Math.PI });

      // VIP quest board
      const qb = new THREE.Group();
      qb.position.set(VIP.x1 + .5, 0, -45);
      qb.rotation.y = Math.PI / 2;
      this.group.add(qb);
      this.box(5, 3, .3, M.goldDark, 0, 2.8, 0, 0, qb);
      const tex = Utils.textTexture('VIP QUESTS', { w: 512, h: 256, color: '#ffc63a', bg: '#100a02', size: 88, border: '#ffc63a' });
      this.panel(4.4, 2.4, tex, 0, 2.8, .18, 0, qb).material.emissiveIntensity = 1;
      this.glow('rgba(255,198,58,.5)', 7, VIP.x1 + 1, 2.8, -45);
      const h2 = this.box(5, 3.4, 1.6, M.hit, 0, 2.4, .7, 0, qb);
      const i2 = { node: qb, label: 'VIP QUEST BOARD', key: 'panel', panel: 'quests' };
      h2.userData.interact = i2; this.interactables.push(i2); this.rayTargets.push(h2);

      // VIP sofas
      [[15, -35, 0], [15, -49, Math.PI]].forEach(([x, z, ry]) => this.sofa(x, z, ry));
    },

    openVipDoor(animate) {
      if (this.vipOpen) return;
      this.vipOpen = true;
      this._vipCollider.disabled = true;
      const tex = Utils.textTexture('VIP AREA\nWELCOME', { w: 640, h: 256, color: '#ffc63a', bg: '#0d0a02', size: 72, border: '#ffc63a' });
      this.vipSign.material.map = tex;
      this.vipSign.material.emissiveMap = tex;
      this.vipSign.material.needsUpdate = true;
      this.vipDoors.forEach(d => {
        const target = d.base + d.dir * 3.9;
        if (animate) Tween.to(d.mesh.position, { x: target }, 1.6, Tween.easeInOutQuad);
        else d.mesh.position.x = target;
      });
      if (animate) Sound.play('door');
    },

    /* ---------- decor ---------- */
    buildDecor() {
      const plantSpots = [[-28, 20], [28, 20], [-28, -20], [28, -20], [-11, 10], [11, 10], [-11, -10], [11, -10],
      [-28, 2], [28, 2], [4, 20], [-4, 20], [4, -34], [26, -34]];
      plantSpots.forEach(([x, z]) => this.plant(x, z));

      // wall art / screens
      const artColors = ['#00e5ff', '#ff2d95', '#ffc63a', '#c07cff', '#25e39a'];
      const artTexts = ['JACKPOT\nTONIGHT', 'PLAY\nSMART', 'NEON\nNIGHTS', 'LUCKY\n777', 'BIG\nWINS'];
      for (let i = 0; i < 5; i++) {
        const x = -22 + i * 11;
        const tex = Utils.textTexture(artTexts[i], { w: 384, h: 512, color: artColors[i], bg: '#08070f', size: 78, border: artColors[i] });
        const p = this.panel(2.6, 3.4, tex, x, 3.4, HALL.z1 + .55, 0);
        p.material.emissiveIntensity = .8;
        this.animated.push({ type: 'screenFlicker', mat: p.material, base: .8, phase: i });
      }
      // big TV screens on side walls
      [[HALL.x1 + .6, 8, Math.PI / 2], [HALL.x2 - .6, -20, -Math.PI / 2]].forEach(([x, z, ry]) => {
        const tex = Utils.textTexture('LIVE\nWINNERS', { w: 512, h: 320, color: '#ffffff', bg: '#0b1020', size: 84, border: '#00e5ff' });
        const p = this.panel(5, 3, tex, x, 3.6, z, ry);
        this.animated.push({ type: 'screenFlicker', mat: p.material, base: .9, phase: 2 });
      });
      // hanging lamps over lobby & aisles
      [[-20, -4], [-20, 6], [0, 8], [0, 16], [20, -2], [20, 12], [-6, -16], [6, -16]].forEach(([x, z]) => this.hangLamp(x, z));
      // rope barriers near VIP door
      [[11.6, -20.5], [18.4, -20.5]].forEach(([x, z]) => {
        this.cyl(.09, .12, 1.1, M.gold, x, .55, z, 10);
        this.sphere(.14, M.gold, x, 1.15, z);
      });
    },

    plant(x, z, b) {
      if (b) return this._with(b, () => this.plant(x, z));
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.group.add(g);
      this.cyl(.42, .32, .7, M.pot, 0, .35, 0, 12, g);
      this.cyl(.4, .4, .1, M.wood, 0, .7, 0, 12, g);
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, len = Utils.rand(.9, 1.7);
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(.22, len, 5), M.plant);
        leaf.position.set(Math.cos(a) * .25, .8 + len / 2, Math.sin(a) * .25);
        leaf.rotation.set(Math.cos(a) * .45, a, Math.sin(a) * .45);
        g.add(leaf);
      }
      this.addCollider(x, z, .9, .9, 'plant');
    },

    hangLamp(x, z) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.group.add(g);
      this.cyl(.03, .03, 1.6, M.metal, 0, HALL.h - .8, 0, 6, g);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(.6, .5, 14, 1, true), M.metal);
      shade.position.set(0, HALL.h - 2, 0);
      g.add(shade);
      this.sphere(.18, M.lampWarm, 0, HALL.h - 2.2, 0, g);
      this.glow('rgba(255,214,138,.5)', 3.2, x, HALL.h - 2.3, z);
    },

    /* ---------- particles ---------- */
    buildParticles() {
      const count = 900;
      const pos = new Float32Array(count * 3);
      const vel = [];
      for (let i = 0; i < count; i++) {
        pos[i * 3] = Utils.rand(-29, 29);
        pos[i * 3 + 1] = Utils.rand(.2, 6.5);
        pos[i * 3 + 2] = Utils.rand(-50, 21);
        vel.push(Utils.rand(.02, .12));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        size: .09, map: Utils.dotTexture(), color: 0x9fd8ff, transparent: true,
        opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false
      });
      this.dust = new THREE.Points(geo, mat);
      this.dust.frustumCulled = false;
      this.group.add(this.dust);
      this.dustVel = vel;

      // burst pool
      this.burstGeo = new THREE.BufferGeometry();
      const bp = new Float32Array(300 * 3);
      this.burstGeo.setAttribute('position', new THREE.BufferAttribute(bp, 3));
      this.burstMat = new THREE.PointsMaterial({
        size: .28, map: Utils.dotTexture(), color: 0xffc63a, transparent: true,
        opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
      });
      this.burstPoints = new THREE.Points(this.burstGeo, this.burstMat);
      this.burstPoints.frustumCulled = false;
      this.burstPoints.visible = false;
      this.group.add(this.burstPoints);
      this.burstData = [];
    },

    winBurst(pos, color, count) {
      count = Math.min(count || 90, 300);
      this.burstMat.color.set(color || '#ffc63a');
      this.burstData = [];
      for (let i = 0; i < count; i++) {
        this.burstData.push({
          x: pos.x, y: pos.y, z: pos.z,
          vx: Utils.rand(-3, 3), vy: Utils.rand(2, 6.5), vz: Utils.rand(-3, 3), life: Utils.rand(.8, 1.6)
        });
      }
      this.burstPoints.visible = true;
    },

    /* ---------- quality ---------- */
    setQuality(q) {
      const low = q === 'low', med = q === 'medium';
      // fewer simultaneous lights = the single biggest perf win in forward rendering
      this.lights.tiered.forEach(({ light, tier }) => {
        light.visible = low ? tier === 1 : med ? tier <= 2 : true;
      });
      // shadows are the most expensive part: only two casters, only on high
      this.lights.spots.forEach((l, i) => {
        const wants = q === 'high' && i < 2;
        l.castShadow = wants;
        if (wants) { l.shadow.mapSize.set(1024, 1024); l.shadow.bias = -0.0008; l.shadow.camera.far = 24; }
      });
      if (this.dust) {
        const n = low ? 200 : med ? 480 : 900;
        this.dust.geometry.setDrawRange(0, n);
        this.dust.material.size = low ? .07 : .09;
      }
    },

    /* ---------- environments (home / casino floors / travel) ---------- */
    registerEnv(id, e) {
      e.id = id;
      e.colliders = e.colliders || [];
      e.rayTargets = e.rayTargets || [];
      e.interactables = e.interactables || [];
      this.envs[id] = e;
      return e;
    },
    activate(id) {
      const e = this.envs[id];
      if (!e) { console.warn('No env: ' + id); return null; }
      Object.keys(this.envs).forEach(k => { const g = this.envs[k].group; if (g) g.visible = (k === id); });
      this.active = id;
      this.env = e;
      this.colliders = e.colliders;
      this.rayTargets = e.rayTargets;
      if (e.fog != null) this.scene.fog = new THREE.FogExp2(e.bg == null ? 0x05060c : e.bg, e.fog);
      else this.scene.fog = null;
      if (e.bg != null) this.scene.background = new THREE.Color(e.bg);
      if (this.dust) this.dust.visible = (id !== 'travel');
      if (e.onEnter) { try { e.onEnter(); } catch (err) { console.error(err); } }
      Bus.emit('env:changed', { id: id, env: e });
      return e;
    },
    envSpawn(id) {
      const e = this.envs[id || this.active];
      return (e && e.spawn) || { x: 0, z: 0, yaw: 0 };
    },

    /** primitive builder bound to another group / collider set (used by home, floors, car) */
    builder(group, colliders, rayTargets, interactables) {
      const W = this;
      return {
        group, colliders, rayTargets, interactables: interactables || [],
        M: M, G: G,
        box: (w, h, d, mat, x, y, z, ry, parent) => W.box(w, h, d, mat, x, y, z, ry, parent || group),
        cyl: (rt, rb, h, mat, x, y, z, seg, parent) => W.cyl(rt, rb, h, mat, x, y, z, seg, parent || group),
        sphere: (r, mat, x, y, z, parent) => W.sphere(r, mat, x, y, z, parent || group),
        panel: (w, h, tex, x, y, z, ry, parent, em) => W.panel(w, h, tex, x, y, z, ry, parent || group, em),
        glow: (color, size, x, y, z, parent) => W.glow(color, size, x, y, z, parent || group),
        plane(w, d, mat, x, y, z, rx) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
          m.rotation.x = rx == null ? -Math.PI / 2 : rx;
          m.position.set(x, y, z);
          group.add(m);
          return m;
        },
        collider(cx, cz, w, d, tag) {
          const c = { x1: cx - w / 2, x2: cx + w / 2, z1: cz - d / 2, z2: cz + d / 2, tag: tag || '', disabled: false };
          colliders.push(c);
          return c;
        },
        /** register an invisible hit box as an interactable */
        interact(w, h, d, x, y, z, def, ry, parent) {
          const hit = W.box(w, h, d, M.hit, x, y, z, ry, parent || group);
          hit.userData.interact = def;
          rayTargets.push(hit);
          this.interactables.push(def);
          def.hit = hit;
          return def;
        },
        animate(a) { W.animated.push(a); return a; },
        text: Utils.textTexture
      };
    },

    /* ---------- zones ---------- */
    zoneAt(x, z) {
      const e = this.env;
      if (e && e.zoneAt) return e.zoneAt(x, z);
      return this.casinoZoneAt(x, z);
    },
    casinoZoneAt(x, z) {
      if (z < -24) return { id: 'vip', label: 'VIP AREA' };
      if (x > 14 && z >= 12) return { id: 'shop', label: 'SHOP' };
      if (x < -14 && z >= 12) return { id: 'daily', label: 'REWARD LOUNGE' };
      if (x <= -12 && z < 12) return { id: 'slots', label: 'SLOT PARADISE' };
      if (x >= 11 && z < -2) return { id: 'roulette', label: 'ROULETTE ROYALE' };
      if (x >= 11 && z < 12) return { id: 'blackjack', label: 'BLACKJACK LOUNGE' };
      if (z <= -8) return { id: 'dice', label: 'DICE CORNER' };
      if (Math.abs(x) <= 10 && z < 8) return { id: 'coinflip', label: 'COIN FLIP PLAZA' };
      return { id: 'lobby', label: 'GRAND LOBBY' };
    },

    /* ---------- animation ---------- */
    update(dt, t) {
      this._t = t;
      for (const a of this.animated) {
        switch (a.type) {
          case 'neonPulse': a.mat.emissiveIntensity = 1.6 + Math.sin(t * 2) * .55; break;
          case 'panelFlicker': a.mat.emissiveIntensity = a.base + Math.sin(t * 1.3) * .18; break;
          case 'signPulse': a.mat.emissiveIntensity = a.base + Math.sin(t * 3 + (a.phase || 0)) * .3; break;
          case 'screenFlicker':
            a.mat.emissiveIntensity = a.base + Math.sin(t * 6 + a.phase) * .12 + (Math.random() < .01 ? -.4 : 0);
            break;
          case 'ringPulse': a.obj.position.y = 2.6 + Math.sin(t * 1.4 + a.phase) * .5; break;
          case 'slotLamps': {
            const k = (Math.sin(t * 4 + a.phase) + 1) / 2;
            a.mat.emissiveIntensity = 0.7 + k * 1.4;
            if (a.node.userData.spinUntil && t < a.node.userData.spinUntil) {
              a.node.userData.reelSpin = (a.node.userData.reelSpin || 0) + dt * 22;
            }
            break;
          }
          case 'diceIdle':
            a.dice.forEach((d, i) => { d.rotation.y = t * .6 + i; d.position.y = 1 + Math.sin(t * 2 + i) * .03; });
            break;
          case 'wheelIdle':
            if (!a.wheel.userData.spinning) a.wheel.rotation.y += dt * .12;
            break;
          case 'coinIdle':
            a.coin.rotation.z += dt * (a.coin.userData.fast ? 14 : 1.2);
            a.coin.position.y = 2.5 + Math.sin(t * 1.2) * .18;
            a.ring.material.emissiveIntensity = 1.4 + Math.sin(t * 3) * .5;
            break;
          case 'giftBob':
            a.obj.position.y = 3.6 + Math.sin(t * 1.6) * .16;
            a.obj.rotation.y = t * .5;
            break;
          case 'chandelier': a.obj.rotation.y = t * .18; break;
          case 'idleNpc':
            a.obj.position.y = a.baseY + Math.abs(Math.sin(t * 1.1 + a.phase)) * .05;
            a.obj.rotation.y += Math.sin(t * .35 + a.phase) * .0025;
            break;
          case 'tvGlow':
            a.mat.emissiveIntensity = a.base + Math.sin(t * 9 + a.phase) * .25 + (Math.random() < .04 ? .5 : 0);
            break;
          case 'carLights':
            a.mat.emissiveIntensity = a.on ? 2.4 + Math.sin(t * 12) * .3 : 0;
            break;
        }
      }
      // slot reels
      for (const it of this.interactables) {
        if (it.reels && it.node.userData.spinUntil) {
          if (t < it.node.userData.spinUntil) it.reels.forEach((r, i) => r.rotation.x += dt * (26 + i * 4));
          else it.node.userData.spinUntil = 0;
        }
      }
      // dust drift
      if (this.dust) {
        const p = this.dust.geometry.attributes.position;
        const n = this.dust.geometry.drawRange.count || p.count;
        for (let i = 0; i < n; i++) {
          let y = p.getY(i) + this.dustVel[i] * dt;
          if (y > 6.8) y = .2;
          p.setY(i, y);
          p.setX(i, p.getX(i) + Math.sin(t * .3 + i) * dt * .05);
        }
        p.needsUpdate = true;
      }
      // bursts
      if (this.burstData.length) {
        const p = this.burstGeo.attributes.position;
        let alive = 0;
        for (let i = 0; i < this.burstData.length; i++) {
          const b = this.burstData[i];
          b.life -= dt;
          if (b.life > 0) {
            b.vy -= 7 * dt;
            b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
            p.setXYZ(i, b.x, b.y, b.z);
            alive++;
          } else p.setXYZ(i, 0, -100, 0);
        }
        p.needsUpdate = true;
        this.burstGeo.setDrawRange(0, this.burstData.length);
        if (!alive) { this.burstData = []; this.burstPoints.visible = false; }
      }
      // roulette wheel spin easing
      if (this._wheelSpin) {
        const w = this._wheelSpin;
        w.t += dt;
        const k = Utils.clamp(w.t / w.dur, 0, 1);
        const e = Tween.easeOutQuint(k);
        w.wheel.rotation.y = w.from + (w.to - w.from) * e;
        if (w.ball) {
          const ang = -w.from * 3 - (w.to - w.from) * 4 * e;
          const rad = Utils.lerp(.95, .72, e);
          w.ball.position.set(Math.cos(ang) * rad, .22 + Math.sin(k * Math.PI) * .12, Math.sin(ang) * rad);
        }
        if (k >= 1) { w.wheel.userData.spinning = false; this._wheelSpin = null; }
      }
      // 3d dice roll
      if (this._diceRoll) {
        const d = this._diceRoll;
        d.t += dt;
        const k = Utils.clamp(d.t / d.dur, 0, 1);
        d.dice.forEach((m, i) => {
          if (k < 1) {
            m.rotation.x += dt * (12 + i * 3);
            m.rotation.z += dt * (9 + i * 4);
            m.position.y = 1 + Math.abs(Math.sin(k * 11 + i)) * (1 - k) * .8;
          } else { m.position.y = 1; }
        });
        if (k >= 1) this._diceRoll = null;
      }
    },

    /* ---------- 3D feedback hooks used by mini-games ---------- */
    spinSlotMachine(inter, dur) {
      if (!inter || !inter.node) return;
      inter.node.userData.spinUntil = this._t + (dur || 2);
    },
    spinRouletteWheel(inter, result, dur) {
      if (!inter || !inter.wheel) return;
      const from = inter.wheel.rotation.y;
      inter.wheel.userData.spinning = true;
      this._wheelSpin = {
        wheel: inter.wheel, ball: inter.ball, from,
        to: from + Math.PI * 2 * 6 + (result / 37) * Math.PI * 2,
        dur: dur || 4, t: 0
      };
    },
    rollWorldDice(inter, dur) {
      if (!inter || !inter.dice) return;
      this._diceRoll = { dice: inter.dice, dur: dur || 1.6, t: 0 };
    },
    flipWorldCoin(dur) {
      const c = this.coinNode && this.coinNode.coin;
      if (!c) return;
      c.userData.fast = true;
      setTimeout(() => c.userData.fast = false, (dur || 2) * 1000);
    }
  };

  window.World = World;
  window.HALL = HALL;
})();
