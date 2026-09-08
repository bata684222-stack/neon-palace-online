/* ============================================================
   floors.js — casino FLOOR 2 (day 2), FLOOR 3 / VIP (day 4),
   the owner's office, plus the elevator + cashier used on every floor
   ============================================================ */
(function () {
  'use strict';

  const Floors = {
    envs: {},

    /* ================= shared parts ================= */

    /** hall shell: floor, ceiling, walls, neon strips, lights */
    shell(b, cfg) {
      const M = b.M;
      const w = cfg.x2 - cfg.x1, d = cfg.z2 - cfg.z1, h = cfg.h;
      const cx = (cfg.x1 + cfg.x2) / 2, cz = (cfg.z1 + cfg.z2) / 2;

      const floorMat = new THREE.MeshStandardMaterial({
        map: Utils.floorTexture(), color: cfg.floorColor || 0xb8c4da, roughness: .4, metalness: .4
      });
      b.plane(w, d, floorMat, cx, 0, cz);
      const carpet = new THREE.MeshStandardMaterial({ map: Utils.carpetTexture(), color: cfg.carpetColor || 0xffffff, roughness: .95 });
      b.plane(w * .5, d * .6, carpet, cx, .02, cz);
      b.plane(w, d, M.ceiling, cx, h, cz, Math.PI / 2);

      const t = 1;
      b.box(w + t * 2, h, t, M.wall, cx, h / 2, cfg.z2 + t / 2);
      b.collider(cx, cfg.z2 + t / 2, w + t * 2, t, 'wall');
      b.box(w + t * 2, h, t, M.wall, cx, h / 2, cfg.z1 - t / 2);
      b.collider(cx, cfg.z1 - t / 2, w + t * 2, t, 'wall');
      b.box(t, h, d, M.wall, cfg.x1 - t / 2, h / 2, cz);
      b.collider(cfg.x1 - t / 2, cz, t, d, 'wall');
      b.box(t, h, d, M.wall, cfg.x2 + t / 2, h / 2, cz);
      b.collider(cfg.x2 + t / 2, cz, t, d, 'wall');

      /* neon wall strips */
      const stripMat = cfg.neon || M.neonPurple;
      for (let x = cfg.x1 + 3; x <= cfg.x2 - 3; x += 6) {
        b.box(4.6, .16, .16, stripMat, x, h - 1.6, cfg.z1 + .3);
        b.box(4.6, .16, .16, stripMat, x, h - 1.6, cfg.z2 - .3);
      }
      for (let z = cfg.z1 + 3; z <= cfg.z2 - 3; z += 6) {
        b.box(4.6, .16, .16, stripMat, cfg.x1 + .3, h - 1.6, z, Math.PI / 2);
        b.box(4.6, .16, .16, stripMat, cfg.x2 - .3, h - 1.6, z, Math.PI / 2);
      }
      b.animate({ type: 'neonPulse', mat: stripMat, base: 2 });

      /* ceiling light panels */
      const pmat = new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: cfg.panelEmissive || 0x8fd4ff, emissiveIntensity: 1.2 });
      const geo = new THREE.BoxGeometry(3, .16, 1);
      const spots = [];
      for (let x = cfg.x1 + 4; x <= cfg.x2 - 4; x += 6) for (let z = cfg.z1 + 4; z <= cfg.z2 - 4; z += 7) spots.push([x, h - .25, z]);
      const inst = new THREE.InstancedMesh(geo, pmat, spots.length);
      const dm = new THREE.Object3D();
      spots.forEach((s, i) => { dm.position.set(s[0], s[1], s[2]); dm.updateMatrix(); inst.setMatrixAt(i, dm.matrix); });
      b.group.add(inst);
      b.animate({ type: 'panelFlicker', mat: pmat, base: 1.2 });

      /* lights: cheap point lights, tiered by quality */
      (cfg.lights || []).forEach((L, i) => {
        const l = new THREE.PointLight(L.c, L.i * 14, L.dist || 30, 2);
        l.position.set(L.x, h - 2.2, L.z);
        b.group.add(l);
        World.lights.tiered.push({ light: l, tier: i < 2 ? 1 : i < 5 ? 2 : 3 });
      });
      const amb = new THREE.PointLight(cfg.ambColor || 0xbfd4ff, 12, 60, 1.4);
      amb.position.set(cx, h - 1, cz);
      b.group.add(amb);

      /* columns */
      (cfg.columns || []).forEach(([x, z]) => {
        b.cyl(.5, .58, h, M.wallDark, x, h / 2, z, 12);
        b.cyl(.68, .68, .28, M.goldDark, x, .15, z, 12);
        const ring = b.cyl(.56, .56, .12, stripMat, x, 2.6, z, 12);
        b.animate({ type: 'ringPulse', obj: ring, phase: Math.random() * 6.28 });
        b.collider(x, z, 1.2, 1.2, 'column');
      });

      /* big floor sign */
      if (cfg.sign) {
        const tex = Utils.textTexture(cfg.sign, { w: 1024, h: 256, color: cfg.signColor || '#c07cff', bg: '#07070d', size: 120 });
        const sp = b.panel(13, 3.2, tex, cx, h - 2.4, cfg.z1 + .6, 0);
        sp.material.emissiveIntensity = 1.3;
        b.animate({ type: 'signPulse', mat: sp.material, base: 1.3 });
        b.glow(cfg.glowColor || 'rgba(192,124,255,.55)', 16, cx, h - 2.4, cfg.z1 + 1.4);
      }
    },

    /** elevator cabin — links all unlocked floors */
    elevator(b, x, z, ry, floorNo) {
      const M = b.M;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry || 0;
      b.group.add(g);
      b.box(4.4, 5, .4, M.wallDark, 0, 2.5, -1.3, 0, g);
      b.box(.4, 5, 2.8, M.wallDark, -2, 2.5, 0, 0, g);
      b.box(.4, 5, 2.8, M.wallDark, 2, 2.5, 0, 0, g);
      b.box(4.4, .4, 2.8, M.metal, 0, 4.8, 0, 0, g);
      b.box(4, .1, 2.6, M.goldDark, 0, .06, 0, 0, g);
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2f10, roughness: .25, metalness: .95, emissive: 0x241a02, emissiveIntensity: .9 });
      const dl = b.box(1.9, 4.4, .16, doorMat, -1, 2.2, 1.3, 0, g);
      const dr = b.box(1.9, 4.4, .16, doorMat, 1, 2.2, 1.3, 0, g);
      const tex = Utils.textTexture('ELEVATOR\nFLOOR ' + floorNo, { w: 512, h: 256, color: '#ffc63a', bg: '#0b0802', size: 66, border: '#ffc63a' });
      b.panel(2.4, 1.1, tex, 0, 4.9, 1.35, 0, g).material.emissiveIntensity = 1.1;
      b.glow('rgba(255,198,58,.5)', 7, x, 3.4, z);
      b.collider(x, z, 4.6, 3, 'elevator');
      const def = { node: g, label: 'ELEVATOR', key: 'panel', panel: 'elevator', doors: [dl, dr] };
      b.interact(4.6, 4, 2.4, 0, 2, 2.2, def, 0, g);
      b.animate({ type: 'signPulse', mat: doorMat, base: .9 });
      return def;
    },

    /** cashier: hand over the daily quota here */
    cashier(b, x, z, ry) {
      const M = b.M;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = ry || 0;
      b.group.add(g);
      b.box(5.4, 1.15, 1.6, M.wood, 0, .58, 0, 0, g);
      b.box(5.6, .14, 1.9, M.goldDark, 0, 1.2, 0, 0, g);
      b.box(5.4, 3.6, .4, M.wallDark, 0, 1.8, -1.4, 0, g);
      b.box(5.6, .18, .1, M.neonGold, 0, .44, .82, 0, g);
      /* cash cage bars */
      for (let i = -2; i <= 2; i++) b.cyl(.05, .05, 1.9, M.gold, i * 1.05, 2.2, -1.1, 8, g);
      const tex = Utils.textTexture('CASHIER\nPAY QUOTA', { w: 512, h: 256, color: '#ffc63a', bg: '#0c0902', size: 70, border: '#ffc63a' });
      const sg = b.panel(4.2, 1.7, tex, 0, 4.1, -1.15, 0, g);
      sg.material.emissiveIntensity = 1.2;
      b.animate({ type: 'signPulse', mat: sg.material, base: 1.2 });
      b.glow('rgba(255,198,58,.55)', 9, x, 3.2, z);
      /* stacks of chips on the counter */
      [-1.6, -.8, .8, 1.6].forEach((px, i) => {
        const mat = [M.neonCyan, M.neonPink, M.neonGold, M.neonGreen][i % 4];
        for (let k = 0; k < 4; k++) b.cyl(.16, .16, .05, mat, px, 1.3 + k * .055, .3, 10, g);
      });
      b.collider(x, z, 5.6, 2.2, 'cashier');
      const def = { node: g, label: 'PAY QUOTA', key: 'panel', panel: 'quota' };
      b.interact(5.6, 3, 2.4, 0, 1.6, .8, def, 0, g);
      return def;
    },

    /** simple standing crowd with idle animation (cheap, no pathfinding) */
    crowd(b, spots) {
      const bodyCols = [0x2b6fd6, 0xd63b6f, 0x2fbf7a, 0xd6a72f, 0x8a5cd6, 0x2fb8bf];
      spots.forEach(([x, z, ry], i) => {
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.rotation.y = ry || 0;
        b.group.add(g);
        const col = bodyCols[i % bodyCols.length];
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: .7 });
        const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: .8 });
        b.box(.52, .78, .3, mat, 0, 1.06, 0, 0, g);
        b.sphere(.17, skin, 0, 1.62, 0, g);
        b.box(.2, .72, .22, b.M.black, -.16, .36, 0, 0, g);
        b.box(.2, .72, .22, b.M.black, .16, .36, 0, 0, g);
        b.box(.13, .62, .16, mat, -.32, 1.06, 0, 0, g);
        b.box(.13, .62, .16, mat, .32, 1.06, 0, 0, g);
        b.collider(x, z, .8, .8, 'npc');
        b.animate({ type: 'idleNpc', obj: g, phase: Math.random() * 6.28, baseY: 0 });
      });
    },

    /* ================= FLOOR 1 extras (elevator + cashier) ================= */
    floor1Extras(W) {
      const b = W.builder(W.group, W.colliders, W.rayTargets, W.interactables);
      this.elevator(b, 26, 20, Math.PI, 1);
      this.cashier(b, -26, 21, 0);
    },

    /* ================= FLOOR 2 ================= */
    buildFloor2(scene) {
      const cfg = { x1: -22, x2: 22, z1: -18, z2: 18, h: 6.6 };
      const group = new THREE.Group();
      scene.add(group);
      const env = World.registerEnv('casino2', {
        group, zoneAt: (x, z) => {
          if (x < -10) return { id: 'f2_slots', label: 'F2 · NEON SLOTS' };
          if (x > 8 && z < 8) return { id: 'f2_roul', label: 'F2 · HIGH RISK ROULETTE' };
          if (z < -8) return { id: 'f2_bj', label: 'F2 · CARD ROOM' };
          return { id: 'f2_lobby', label: 'FLOOR 2 · SILVER LOUNGE' };
        },
        spawn: { x: 0, z: 12, yaw: Math.PI }, floor: 2,
        fog: 0.019, bg: 0x080615, name: 'FLOOR 2 · SILVER LOUNGE'
      });
      const b = World.builder(group, env.colliders, env.rayTargets, env.interactables);
      const M = b.M;
      this.shell(b, Object.assign({}, cfg, {
        sign: 'SILVER LOUNGE', signColor: '#c07cff', neon: M.neonPurple,
        floorColor: 0x9fb0d8, carpetColor: 0x7f6bd0, panelEmissive: 0xb08fff,
        columns: [[-11, -11], [11, -11], [-11, 11], [11, 11]],
        ambColor: 0xc8b8ff,
        lights: [
          { x: -16, z: 0, c: 0xc07cff, i: 2.2 }, { x: 12, z: -4, c: 0x8be8ff, i: 2.2 },
          { x: 0, z: 12, c: 0xffd88a, i: 2 }, { x: -6, z: -13, c: 0xff8ad0, i: 2 },
          { x: 16, z: 10, c: 0x7dffcf, i: 1.8 }, { x: 0, z: 0, c: 0xffe0a8, i: 1.8 }
        ]
      }));

      this.elevator(b, 19, 15, -Math.PI / 2, 2);

      /* advanced slot machines */
      const slotCfg = (i) => ({
        name: 'NEON SLOT #' + i, tier: 'advanced', bets: [500, 750, 1000, 2000], minBet: 500
      });
      [-9, -4.5, 0, 4.5, 9].forEach((z, i) => {
        World.slotMachine(-18, z, Math.PI / 2, slotCfg(i + 1), b);
        if (i < 4) World.slotMachine(-13, z + 2.2, -Math.PI / 2, slotCfg(i + 6), b);
      });

      /* high risk roulette */
      World.rouletteTable(13, -6, { name: 'HIGH RISK ROULETTE 1', highRisk: true }, b);
      World.rouletteTable(13, 5, { name: 'HIGH RISK ROULETTE 2', highRisk: true }, b);

      /* card room */
      World.blackjackTable(-6, -13, { name: 'BLACKJACK · SILVER 1' }, b);
      World.blackjackTable(2, -13, { name: 'BLACKJACK · SILVER 2' }, b);

      /* dice + quest board */
      World.diceTable(8, 12, { name: 'DICE · SILVER', bets: [100, 500, 1000, 2500] }, b);
      const qb = new THREE.Group();
      qb.position.set(-19, 0, -16);
      qb.rotation.y = Math.PI / 3;
      group.add(qb);
      b.box(5, 3.4, .3, M.wood, 0, 2.9, 0, 0, qb);
      b.panel(4.5, 2.5, Utils.textTexture('FLOOR 2\nQUESTS', { w: 512, h: 256, color: '#ffc63a', bg: '#0c0a06', size: 74, border: '#ffc63a' }), 0, 3, .18, 0, qb);
      b.interact(5, 3.6, 1.6, 0, 2.4, .7, { node: qb, label: 'QUEST BOARD', key: 'panel', panel: 'quests' }, 0, qb);

      /* decor + crowd */
      [[-20, 16], [20, -16], [-2, 16], [6, -16], [20, 4]].forEach(([x, z]) => World.plant(x, z, b));
      ['JACKPOT', 'HIGH\nRISK', 'SILVER\nNIGHT'].forEach((txt, i) => {
        const tex = Utils.textTexture(txt, { w: 384, h: 512, color: '#c07cff', bg: '#08070f', size: 72, border: '#c07cff' });
        const p = b.panel(2.4, 3.2, tex, -14 + i * 10, 3.4, cfg.z2 - .6, Math.PI);
        b.animate({ type: 'screenFlicker', mat: p.material, base: .8, phase: i });
      });
      this.crowd(b, [[-8, 6, .4], [4, 8, 2.2], [10, -12, 1.1], [-16, -6, 3], [16, 0, -1.2], [0, -6, .8]]);
      this.envs.casino2 = env;
      return env;
    },

    /* ================= FLOOR 3 — VIP ================= */
    buildFloor3(scene) {
      const cfg = { x1: -18, x2: 18, z1: -15, z2: 15, h: 7 };
      const group = new THREE.Group();
      scene.add(group);
      const env = World.registerEnv('casino3', {
        group, zoneAt: (x, z) => {
          if (z < -10) return { id: 'f3_boss', label: 'F3 · OWNER WING' };
          if (x < -8) return { id: 'f3_slots', label: 'F3 · DIAMOND SLOTS' };
          if (x > 6) return { id: 'f3_roul', label: 'F3 · HIGH ROLLER ROULETTE' };
          return { id: 'f3_lobby', label: 'FLOOR 3 · GOLD VIP' };
        },
        spawn: { x: 0, z: 11, yaw: Math.PI }, floor: 3,
        fog: 0.016, bg: 0x0b0803, name: 'FLOOR 3 · GOLD VIP'
      });
      const b = World.builder(group, env.colliders, env.rayTargets, env.interactables);
      const M = b.M;
      this.shell(b, Object.assign({}, cfg, {
        sign: 'GOLD VIP FLOOR', signColor: '#ffc63a', neon: M.neonGold,
        floorColor: 0xd8c69a, carpetColor: 0xc99a3a, panelEmissive: 0xffd88a,
        columns: [[-9, -8], [9, -8], [-9, 8], [9, 8]],
        ambColor: 0xffe3b0, glowColor: 'rgba(255,198,58,.6)',
        lights: [
          { x: -13, z: 0, c: 0xffc63a, i: 2.6 }, { x: 11, z: -4, c: 0xffd88a, i: 2.4 },
          { x: 0, z: 10, c: 0xfff0c0, i: 2.2 }, { x: 0, z: -11, c: 0xffb03a, i: 2.4 },
          { x: -6, z: -11, c: 0xd0a8ff, i: 1.8 }, { x: 14, z: 10, c: 0xffe0a8, i: 1.8 }
        ]
      }));

      this.elevator(b, 15, 12, -Math.PI / 2, 3);

      /* chandelier */
      const ch = new THREE.Group();
      ch.position.set(0, cfg.h - 1.4, 2);
      group.add(ch);
      b.cyl(.06, .06, 1.2, M.gold, 0, .8, 0, 8, ch);
      const ring = b.cyl(2.2, 2.2, .12, M.gold, 0, 0, 0, 24, ch);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        b.sphere(.16, M.lampWarm, Math.cos(a) * 2.2, -.12, Math.sin(a) * 2.2, ch);
      }
      b.glow('rgba(255,224,168,.6)', 12, 0, cfg.h - 2, 2);
      b.animate({ type: 'chandelier', obj: ch });

      /* VIP diamond slots */
      [-6, -2, 2, 6].forEach((z, i) => {
        World.slotMachine(-15, z, Math.PI / 2, {
          name: 'DIAMOND SLOT #' + (i + 1), tier: 'vip', vip: true,
          bets: [2000, 3000, 5000, 10000], minBet: 2000
        }, b);
      });

      /* high roller tables */
      World.rouletteTable(11, -5, { name: 'HIGH ROLLER ROULETTE', vip: true, highRisk: true }, b);
      World.rouletteTable(11, 6, { name: 'PRIVATE ROULETTE', vip: true, highRisk: true }, b);
      World.blackjackTable(-4, 9, { name: 'HIGH ROLLER BLACKJACK', vip: true }, b);
      World.blackjackTable(4, 9, { name: 'PRIVATE BLACKJACK', vip: true }, b);
      World.diceTable(0, -5, { name: 'VIP DICE', bets: [1000, 5000, 10000, 25000] }, b);

      /* owner's door */
      const od = new THREE.Group();
      od.position.set(0, 0, cfg.z1 + .4);
      group.add(od);
      b.box(6, 5.4, .5, M.wallDark, 0, 2.7, 0, 0, od);
      const dm = new THREE.MeshStandardMaterial({ color: 0x2a1e08, roughness: .25, metalness: .95, emissive: 0x3a2a00, emissiveIntensity: 1 });
      b.box(2.4, 4.6, .3, dm, -1.3, 2.3, .3, 0, od);
      b.box(2.4, 4.6, .3, dm, 1.3, 2.3, .3, 0, od);
      const otex = Utils.textTexture('CASINO OWNER\nPRIVATE OFFICE', { w: 640, h: 256, color: '#ffc63a', bg: '#0a0702', size: 58, border: '#ffc63a' });
      const os = b.panel(4.6, 1.6, otex, 0, 5, .35, 0, od);
      os.material.emissiveIntensity = 1.2;
      b.animate({ type: 'signPulse', mat: os.material, base: 1.2 });
      b.glow('rgba(255,198,58,.6)', 10, 0, 3.4, cfg.z1 + 1.2);
      b.collider(0, cfg.z1 + .4, 6, 1, 'ownerdoor');
      b.interact(5, 4, 1.6, 0, 2.2, 1.1, { node: od, label: "OWNER'S OFFICE", key: 'boss' }, 0, od);

      /* velvet ropes + guards + crowd */
      [[-3.4, -9], [3.4, -9]].forEach(([x, z]) => { b.cyl(.09, .12, 1.1, M.gold, x, .55, z, 10); b.sphere(.14, M.gold, x, 1.15, z); });
      this.crowd(b, [[-2.6, -8.6, 0], [2.6, -8.6, 0], [-11, 6, 1.2], [8, 1, -.6], [13, 4, 2.4]]);
      [[-17, 13], [17, -13], [-17, -13], [17, 13]].forEach(([x, z]) => World.plant(x, z, b));

      const qb = new THREE.Group();
      qb.position.set(-16, 0, 12);
      qb.rotation.y = -Math.PI / 3;
      group.add(qb);
      b.box(4.6, 3.2, .3, M.wood, 0, 2.8, 0, 0, qb);
      b.panel(4.1, 2.4, Utils.textTexture('VIP\nQUESTS', { w: 512, h: 256, color: '#ffc63a', bg: '#0c0a06', size: 76, border: '#ffc63a' }), 0, 2.9, .18, 0, qb);
      b.interact(4.6, 3.4, 1.6, 0, 2.4, .7, { node: qb, label: 'VIP QUEST BOARD', key: 'panel', panel: 'quests' }, 0, qb);

      this.envs.casino3 = env;
      return env;
    },

    /* ================= OWNER'S OFFICE (final boss room) ================= */
    buildBossRoom(scene) {
      const group = new THREE.Group();
      scene.add(group);
      const env = World.registerEnv('boss', {
        group, zoneAt: () => ({ id: 'boss', label: "OWNER'S OFFICE" }),
        spawn: { x: 0, z: 7.5, yaw: 0 }, floor: 3,
        fog: 0.03, bg: 0x0a0702, name: "OWNER'S OFFICE"
      });
      const b = World.builder(group, env.colliders, env.rayTargets, env.interactables);
      const M = b.M;
      const cfg = { x1: -8, x2: 8, z1: -7, z2: 9, h: 5.4 };
      this.shell(b, Object.assign({}, cfg, {
        neon: M.neonGold, floorColor: 0x8a7248, carpetColor: 0x8f2030,
        panelEmissive: 0xffd08a, ambColor: 0xffdca8,
        lights: [{ x: 0, z: -3, c: 0xffc63a, i: 3 }, { x: -5, z: 5, c: 0xffb03a, i: 2 }, { x: 5, z: 5, c: 0xffb03a, i: 2 }]
      }));

      /* desk */
      const desk = new THREE.Group();
      desk.position.set(0, 0, -3.2);
      group.add(desk);
      b.box(5, 1.05, 1.8, M.wood, 0, .55, 0, 0, desk);
      b.box(5.3, .12, 2.1, M.goldDark, 0, 1.14, 0, 0, desk);
      b.box(5.2, .2, .12, M.neonGold, 0, .5, .95, 0, desk);
      /* piles of chips + ledger */
      [-1.8, -1.2, 1.2, 1.8].forEach((px, i) => {
        const mat = [M.neonGold, M.neonPink, M.neonCyan, M.neonGold][i];
        for (let k = 0; k < 6; k++) b.cyl(.18, .18, .05, mat, px, 1.22 + k * .055, -.3, 12, desk);
      });
      b.box(.7, .06, .5, M.white, .2, 1.24, .5, .2, desk);
      b.collider(0, -3.2, 5.3, 2.2, 'desk');

      /* the owner himself */
      const boss = new THREE.Group();
      boss.position.set(0, 0, -5);
      group.add(boss);
      const suit = new THREE.MeshStandardMaterial({ color: 0x12131a, roughness: .5, metalness: .2 });
      const skin = new THREE.MeshStandardMaterial({ color: 0xe0ab84, roughness: .8 });
      b.box(.95, 1.15, .55, suit, 0, 1.35, 0, 0, boss);
      b.box(.22, 1, .2, new THREE.MeshStandardMaterial({ color: 0xb3242c, roughness: .5 }), 0, 1.4, .3, 0, boss);
      b.sphere(.22, skin, 0, 2.08, 0, boss);
      b.cyl(.3, .3, .12, M.black, 0, 2.28, 0, 14, boss);
      b.cyl(.19, .19, .3, M.black, 0, 2.42, 0, 14, boss);
      b.box(.22, .9, .24, suit, -.55, 1.3, 0, 0, boss);
      b.box(.22, .9, .24, suit, .55, 1.3, 0, 0, boss);
      b.box(.3, .8, .3, M.black, -.24, .4, 0, 0, boss);
      b.box(.3, .8, .3, M.black, .24, .4, 0, 0, boss);
      b.glow('rgba(255,198,58,.45)', 5, 0, 2.2, -5);
      b.collider(0, -5, 1.6, 1, 'boss');
      b.animate({ type: 'idleNpc', obj: boss, phase: 1.2, baseY: 0 });

      /* two guards */
      this.crowd(b, [[-4.2, -4.4, .3], [4.2, -4.4, -.3]]);

      /* safe + trophies */
      b.box(2, 2.4, 1, M.metal, -6.4, 1.2, -4.5, .3);
      b.cyl(.5, .5, .12, M.gold, -6.4, 2.5, -4.5, 16);
      b.collider(-6.4, -4.5, 2.2, 1.4, 'safe');
      const wall = Utils.textTexture('NEON PALACE\nOWNER', { w: 512, h: 320, color: '#ffc63a', bg: '#0a0702', size: 66, border: '#ffc63a' });
      b.panel(4, 2.5, wall, 0, 3.6, cfg.z1 + .55, 0);
      [[6.4, -4.5], [-6.4, 4], [6.4, 4]].forEach(([x, z]) => World.plant(x, z, b));

      /* interaction: hand over the final quota */
      b.interact(4, 3, 2.4, 0, 1.6, -3.9, { node: boss, label: 'TALK TO THE OWNER', key: 'bossTalk' });

      /* exit door back to floor 3 */
      const ex = new THREE.Group();
      ex.position.set(0, 0, cfg.z2 - .3);
      group.add(ex);
      b.box(3, 4.4, .3, M.wallDark, 0, 2.2, 0, 0, ex);
      b.panel(2.4, .9, Utils.textTexture('EXIT', { w: 512, h: 192, color: '#25e39a', bg: '#04120c', size: 96, border: '#25e39a' }), 0, 3.4, -.2, Math.PI, ex);
      b.interact(3, 3.4, 1.4, 0, 1.8, -.9, { node: ex, label: 'LEAVE OFFICE', key: 'bossExit' }, 0, ex);

      this.envs.boss = env;
      return env;
    },

    build(scene) {
      this.buildFloor2(scene);
      this.buildFloor3(scene);
      this.buildBossRoom(scene);
      return this;
    }
  };

  window.Floors = Floors;
})();
