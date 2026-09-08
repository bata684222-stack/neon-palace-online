/* ============================================================
   home.js — the player's small cosy low-poly house + front yard
   living room, kitchen, bedroom, PREPARE station, black car
   ============================================================ */
(function () {
  'use strict';

  const R = { x1: -9, x2: 9, z1: -8, z2: 9, h: 3.4 };   // interior

  const Home = {
    env: null,
    door: null,
    doorOpen: false,
    tvOn: true,

    build(scene) {
      const group = new THREE.Group();
      scene.add(group);
      const env = World.registerEnv('home', {
        group,
        zoneAt: (x, z) => {
          if (z > 10) return { id: 'yard', label: 'FRONT YARD' };
          if (x < -3 && z < 1) return { id: 'kitchen', label: 'KITCHEN' };
          if (x > 3 && z < 1) return { id: 'bedroom', label: 'BEDROOM' };
          return { id: 'living', label: 'LIVING ROOM' };
        },
        spawn: { x: 0, z: 3.4, yaw: 0 }, floor: 0,
        fog: 0.022, bg: 0x080c16, name: 'HOME'
      });
      this.env = env;
      const b = World.builder(group, env.colliders, env.rayTargets, env.interactables);
      this.shell(b);
      this.livingRoom(b);
      this.kitchen(b);
      this.bedroom(b);
      this.yard(b);
      this.lights(b);
      return env;
    },

    /* ---------------- shell ---------------- */
    shell(b) {
      const M = b.M;
      const woodFloor = new THREE.MeshStandardMaterial({ color: 0x9c6b42, roughness: .75, metalness: .05 });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8cbb8, roughness: .9 });
      const ceilMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: .95 });
      const rugMat = new THREE.MeshStandardMaterial({ color: 0x8a3550, roughness: .95 });

      b.plane(R.x2 - R.x1, R.z2 - R.z1, woodFloor, 0, 0, (R.z1 + R.z2) / 2);
      b.plane(R.x2 - R.x1, R.z2 - R.z1, ceilMat, 0, R.h, (R.z1 + R.z2) / 2, Math.PI / 2);
      b.plane(7, 5, rugMat, 0, .012, 4);

      const t = .3, h = R.h, cz = (R.z1 + R.z2) / 2, w = R.x2 - R.x1, d = R.z2 - R.z1;
      /* north wall */
      b.box(w + t * 2, h, t, wallMat, 0, h / 2, R.z1 - t / 2);
      b.collider(0, R.z1 - t / 2, w + t * 2, t, 'wall');
      /* side walls */
      b.box(t, h, d, wallMat, R.x1 - t / 2, h / 2, cz);
      b.collider(R.x1 - t / 2, cz, t, d, 'wall');
      b.box(t, h, d, wallMat, R.x2 + t / 2, h / 2, cz);
      b.collider(R.x2 + t / 2, cz, t, d, 'wall');
      /* south wall with a door gap at x -1.2..1.2 */
      b.box(7.8, h, t, wallMat, -5.1, h / 2, R.z2 + t / 2);
      b.collider(-5.1, R.z2 + t / 2, 7.8, t, 'wall');
      b.box(7.8, h, t, wallMat, 5.1, h / 2, R.z2 + t / 2);
      b.collider(5.1, R.z2 + t / 2, 7.8, t, 'wall');
      b.box(2.4, .5, t, wallMat, 0, h - .25, R.z2 + t / 2);

      /* interior partitions (kitchen / bedroom) */
      b.box(t, h, 5, wallMat, -3, h / 2, R.z1 + 2.5);
      b.collider(-3, R.z1 + 2.5, t, 5, 'wall');
      b.box(t, h, 5, wallMat, 3, h / 2, R.z1 + 2.5);
      b.collider(3, R.z1 + 2.5, t, 5, 'wall');

      /* windows */
      const glass = new THREE.MeshStandardMaterial({
        color: 0x9fd8ff, emissive: 0x274a7a, emissiveIntensity: .9,
        transparent: true, opacity: .55, roughness: .1, metalness: .4
      });
      const frame = new THREE.MeshStandardMaterial({ color: 0x4a3527, roughness: .7 });
      const win = (x, y, z, w2, h2, ry) => {
        b.box(w2, h2, .1, glass, x, y, z, ry);
        b.box(w2 + .2, .12, .16, frame, x, y + h2 / 2, z, ry);
        b.box(w2 + .2, .12, .16, frame, x, y - h2 / 2, z, ry);
        b.box(.12, h2 + .2, .16, frame, x + (ry ? 0 : w2 / 2), y, z + (ry ? w2 / 2 : 0), ry);
        b.box(.12, h2 + .2, .16, frame, x - (ry ? 0 : w2 / 2), y, z - (ry ? w2 / 2 : 0), ry);
      };
      win(-6, 1.9, R.z1 - .1, 2.6, 1.4, 0);
      win(6, 1.9, R.z1 - .1, 2.6, 1.4, 0);
      win(R.x1 + .1, 1.9, 4, 3, 1.5, Math.PI / 2);
      win(R.x2 - .1, 1.9, 4, 3, 1.5, Math.PI / 2);

      /* front door (animated) */
      const doorG = new THREE.Group();
      doorG.position.set(-1.2, 0, R.z2 + .15);
      b.group.add(doorG);
      const doorMat = new THREE.MeshStandardMaterial({ color: 0x5d3a22, roughness: .6 });
      b.box(2.4, 2.9, .12, doorMat, 1.2, 1.45, 0, 0, doorG);
      b.sphere(.09, b.M.gold, 2.2, 1.45, .1, doorG);
      this.door = doorG;
      this.doorCollider = b.collider(0, R.z2 + .15, 2.6, .4, 'door');
      b.interact(2.6, 2.9, 1.1, 1.2, 1.45, 0, {
        node: doorG, label: 'OPEN DOOR', key: 'homeDoor'
      }, 0, doorG);
    },

    /* ---------------- living room ---------------- */
    livingRoom(b) {
      const M = b.M;
      /* sofa */
      const sofa = new THREE.Group();
      sofa.position.set(0, 0, 6.4);
      b.group.add(sofa);
      const sofaMat = new THREE.MeshStandardMaterial({ color: 0x35506e, roughness: .85 });
      b.box(3.4, .45, 1.4, sofaMat, 0, .35, 0, 0, sofa);
      b.box(3.4, .8, .35, sofaMat, 0, .82, .55, 0, sofa);
      b.box(.35, .7, 1.4, sofaMat, -1.6, .6, 0, 0, sofa);
      b.box(.35, .7, 1.4, sofaMat, 1.6, .6, 0, 0, sofa);
      [-.8, .8].forEach(px => b.box(1.1, .18, 1, new THREE.MeshStandardMaterial({ color: 0x486a90, roughness: .9 }), px, .64, -.05, 0, sofa));
      b.collider(0, 6.4, 3.6, 1.6, 'sofa');
      b.interact(3.4, 1.6, 1.6, 0, .9, -.5, { node: sofa, label: 'SIT ON SOFA', key: 'sofa' }, 0, sofa);

      /* coffee table */
      b.box(1.8, .12, 1, M.wood, 0, .45, 4.4);
      [-.75, .75].forEach(px => [-.35, .35].forEach(pz => b.box(.1, .45, .1, M.wood, px, .22, 4.4 + pz)));
      b.box(.4, .06, .3, M.white, .3, .53, 4.4, .3);
      b.collider(0, 4.4, 1.9, 1.1, 'table');

      /* TV + stand */
      const tv = new THREE.Group();
      tv.position.set(0, 0, 1.4);
      b.group.add(tv);
      b.box(2.6, .6, .5, M.wood, 0, .3, 0, 0, tv);
      b.box(2.3, 1.3, .12, M.black, 0, 1.35, 0, 0, tv);
      const scrTex = Utils.textTexture('NEON NEWS\nQUOTA SEASON', { w: 512, h: 288, color: '#7fe8ff', bg: '#08131f', size: 52 });
      const scr = b.panel(2.1, 1.15, scrTex, 0, 1.35, .08, 0, tv);
      scr.material.emissiveIntensity = 1;
      b.animate({ type: 'tvGlow', mat: scr.material, base: 1, phase: 0 });
      b.glow('rgba(90,190,255,.5)', 5, 0, 1.5, 1.9);
      b.collider(0, 1.4, 2.7, .8, 'tv');
      b.interact(2.6, 2, 1.4, 0, 1.2, .8, { node: tv, label: 'WATCH TV', key: 'panel', panel: 'tv' }, 0, tv);

      /* floor lamp + plant + shelf */
      b.cyl(.25, .3, .06, M.metal, -4, .03, 5.5, 12);
      b.cyl(.04, .04, 1.8, M.metal, -4, .9, 5.5, 8);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(.42, .5, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffd08a, emissiveIntensity: 1.4, side: THREE.DoubleSide }));
      shade.position.set(-4, 1.95, 5.5);
      b.group.add(shade);
      b.glow('rgba(255,214,138,.55)', 4, -4, 1.9, 5.5);
      b.collider(-4, 5.5, .7, .7, 'lamp');
      World.plant(4.2, 5.6, b);

      /* wall shelf with trinkets */
      b.box(2.6, .1, .5, M.wood, -6.5, 2.1, 1.6);
      [-.7, 0, .7].forEach((px, i) => b.box(.22, .3, .22, [M.neonCyan, M.neonPink, M.neonGold][i], -6.5 + px, 2.3, 1.6));
      /* wall picture */
      b.panel(1.6, 1.1, Utils.textTexture('HOME', { w: 384, h: 256, color: '#ffc63a', bg: '#241a10', size: 84, border: '#ffc63a' }), 6.6, 2.1, 1.75, 0);
    },

    /* ---------------- kitchen ---------------- */
    kitchen(b) {
      const M = b.M;
      const counter = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: .6 });
      const cab = new THREE.MeshStandardMaterial({ color: 0x35485e, roughness: .7 });
      /* counter run along the north wall */
      b.box(5.6, .9, .7, cab, -6, .45, R.z1 + .5);
      b.box(5.8, .1, .8, counter, -6, .93, R.z1 + .5);
      b.collider(-6, R.z1 + .5, 5.8, .9, 'counter');
      /* sink */
      b.box(.7, .08, .5, M.metal, -7.2, .99, R.z1 + .5);
      b.cyl(.03, .03, .35, M.metal, -7.2, 1.15, R.z1 + .25, 8);
      /* stove */
      b.box(.9, .06, .6, M.black, -4.6, 1, R.z1 + .5);
      [[-.2, -.15], [.2, -.15], [-.2, .15], [.2, .15]].forEach(([dx, dz]) =>
        b.cyl(.11, .11, .03, new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: .5 }), -4.6 + dx, 1.04, R.z1 + .5 + dz, 12));
      /* upper cabinets */
      b.box(5.6, .8, .45, cab, -6, 2.3, R.z1 + .35);
      /* fridge */
      const fr = new THREE.Group();
      fr.position.set(-8.2, 0, R.z1 + 3.2);
      b.group.add(fr);
      const frMat = new THREE.MeshStandardMaterial({ color: 0xd9dee6, roughness: .35, metalness: .5 });
      b.box(1.1, 2.1, 1, frMat, 0, 1.05, 0, 0, fr);
      b.box(.06, .9, .06, M.metal, .58, 1.5, .3, 0, fr);
      b.box(.06, .6, .06, M.metal, .58, .6, .3, 0, fr);
      b.box(.3, .3, .02, M.neonPink, 0, 1.6, .52, 0, fr);
      b.collider(-8.2, R.z1 + 3.2, 1.2, 1.1, 'fridge');
      b.interact(1.4, 2.2, 1.4, 0, 1.1, .7, { node: fr, label: 'OPEN FRIDGE', key: 'fridge' }, 0, fr);

      /* dining table + chairs */
      b.cyl(1, 1, .1, M.wood, -6, .78, -2.4, 20);
      b.cyl(.12, .16, .78, M.wood, -6, .39, -2.4, 10);
      b.collider(-6, -2.4, 2, 2, 'table');
      [[-6, -3.7, 0], [-6, -1.1, Math.PI], [-7.4, -2.4, Math.PI / 2], [-4.6, -2.4, -Math.PI / 2]].forEach(([x, z, ry]) => {
        const c = new THREE.Group();
        c.position.set(x, 0, z); c.rotation.y = ry;
        b.group.add(c);
        b.box(.5, .08, .5, M.wood, 0, .48, 0, 0, c);
        b.box(.5, .6, .08, M.wood, 0, .78, -.21, 0, c);
        [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]].forEach(([dx, dz]) => b.box(.06, .48, .06, M.wood, dx, .24, dz, 0, c));
      });
      /* kitchen lamp */
      b.cyl(.02, .02, .8, M.metal, -6, 3, -2.4, 6);
      const sh = new THREE.Mesh(new THREE.ConeGeometry(.45, .4, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd8a0, emissiveIntensity: 1.3, side: THREE.DoubleSide }));
      sh.position.set(-6, 2.55, -2.4);
      b.group.add(sh);
      b.glow('rgba(255,216,160,.5)', 4.5, -6, 2.4, -2.4);
    },

    /* ---------------- bedroom + PREPARE station ---------------- */
    bedroom(b) {
      const M = b.M;
      /* bed */
      const bed = new THREE.Group();
      bed.position.set(6.4, 0, -5);
      b.group.add(bed);
      b.box(2.2, .4, 3.2, M.wood, 0, .25, 0, 0, bed);
      b.box(2.1, .3, 3, new THREE.MeshStandardMaterial({ color: 0xe6e0d2, roughness: .9 }), 0, .58, 0, 0, bed);
      b.box(2.1, .18, 1.6, new THREE.MeshStandardMaterial({ color: 0x3f5f8a, roughness: .9 }), 0, .74, .7, 0, bed);
      b.box(.9, .22, .5, new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: .9 }), -.5, .8, -1.2, 0, bed);
      b.box(.9, .22, .5, new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: .9 }), .5, .8, -1.2, 0, bed);
      b.box(2.3, 1.1, .16, M.wood, 0, .55, -1.7, 0, bed);
      b.collider(6.4, -5, 2.4, 3.4, 'bed');
      b.interact(2.6, 2, 3.4, 0, 1, 0, { node: bed, label: 'SLEEP', key: 'bed' }, 0, bed);

      /* nightstand + lamp */
      b.box(.7, .6, .6, M.wood, 4.6, .3, -6.2);
      b.collider(4.6, -6.2, .8, .7, 'nightstand');
      b.cyl(.18, .2, .3, new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf8a, emissiveIntensity: 1.5 }), 4.6, .75, -6.2, 12);
      b.glow('rgba(255,207,138,.5)', 3, 4.6, .85, -6.2);

      /* PREPARE station: desk + wardrobe */
      const desk = new THREE.Group();
      desk.position.set(4.2, 0, -1.2);
      desk.rotation.y = -Math.PI / 2;
      b.group.add(desk);
      b.box(2.6, .12, 1, M.wood, 0, .78, 0, 0, desk);
      b.box(.12, .78, .9, M.wood, -1.2, .39, 0, 0, desk);
      b.box(.12, .78, .9, M.wood, 1.2, .39, 0, 0, desk);
      /* gear on the desk: chips, cards, dice, charm */
      b.cyl(.16, .16, .05, M.neonGold, -.8, .87, .1, 12, desk);
      b.cyl(.16, .16, .05, M.neonGold, -.8, .92, .1, 12, desk);
      b.box(.3, .06, .42, M.white, -.1, .87, .1, .2, desk);
      b.box(.16, .16, .16, M.white, .5, .9, .1, .5, desk);
      b.box(.16, .16, .16, M.white, .74, .9, -.05, .9, desk);
      b.sphere(.12, M.neonGreen, 1, .93, .15, desk);
      const pTex = Utils.textTexture('PREPARE\nBUY ITEMS', { w: 512, h: 256, color: '#25e39a', bg: '#06120d', size: 62, border: '#25e39a' });
      const ps = b.panel(1.9, .95, pTex, 0, 1.7, -.42, 0, desk);
      ps.material.emissiveIntensity = 1.1;
      b.animate({ type: 'signPulse', mat: ps.material, base: 1.1 });
      b.glow('rgba(37,227,154,.45)', 4.5, 4.2, 1.5, -1.2);
      b.collider(4.2, -1.2, 1.2, 2.7, 'desk');
      b.interact(1.6, 2.4, 2.8, 0, 1.2, .7, { node: desk, label: 'PREPARE', key: 'panel', panel: 'prepare' }, 0, desk);

      /* wardrobe */
      const wd = new THREE.Group();
      wd.position.set(8, 0, -1.6);
      b.group.add(wd);
      b.box(1.6, 2.4, .8, M.wood, 0, 1.2, 0, 0, wd);
      b.box(.06, 1.6, .06, M.gold, -.2, 1.2, .42, 0, wd);
      b.box(.06, 1.6, .06, M.gold, .2, 1.2, .42, 0, wd);
      b.collider(8, -1.6, 1.7, .9, 'wardrobe');
      b.interact(1.8, 2.4, 1.4, 0, 1.2, .6, { node: wd, label: 'PREPARE', key: 'panel', panel: 'prepare' }, 0, wd);

      /* mirror + rug */
      b.panel(1, 1.8, Utils.textTexture(' ', { w: 256, h: 448, color: '#ffffff', bg: '#7f97ad', size: 10 }), 3.2, 1.7, -6.4, 0);
    },

    /* ---------------- front yard, road, city, car ---------------- */
    yard(b) {
      const M = b.M;
      const grass = new THREE.MeshStandardMaterial({ color: 0x24402c, roughness: .95 });
      const road = new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: .85 });
      const path = new THREE.MeshStandardMaterial({ color: 0x565b66, roughness: .9 });

      b.plane(70, 44, grass, 0, -.02, 26);
      b.plane(70, 8, road, 0, 0, 30);
      b.plane(3.2, 12, path, 0, .01, 14);
      /* road markings */
      for (let x = -32; x <= 32; x += 6) b.box(2.4, .02, .22, M.white, x, .02, 30);

      /* house exterior shell (so the yard reads as "outside") */
      const ext = new THREE.MeshStandardMaterial({ color: 0xbfae95, roughness: .9 });
      const roof = new THREE.MeshStandardMaterial({ color: 0x6d2f2a, roughness: .8 });
      b.box(19.2, 3.6, .4, ext, 0, 1.8, R.z2 + .55);
      const rf = new THREE.Mesh(new THREE.ConeGeometry(13.6, 2.6, 4), roof);
      rf.position.set(0, R.h + 1.3, .5);
      rf.rotation.y = Math.PI / 4;
      b.group.add(rf);
      /* porch */
      b.box(5, .2, 2, path, 0, .1, R.z2 + 1.4);
      b.box(.2, 2.4, .2, M.wood, -2.3, 1.2, R.z2 + 2.3);
      b.box(.2, 2.4, .2, M.wood, 2.3, 1.2, R.z2 + 2.3);
      b.box(5, .3, .3, roof, 0, 2.5, R.z2 + 2.3);
      const pl = new THREE.MeshStandardMaterial({ color: 0xfff0cc, emissive: 0xffd89a, emissiveIntensity: 1.6 });
      b.sphere(.16, pl, 0, 2.2, R.z2 + 1.1);
      b.glow('rgba(255,216,154,.6)', 5, 0, 2.2, R.z2 + 1.1);

      /* fence */
      for (let x = -20; x <= 20; x += 1.6) {
        if (Math.abs(x) < 2.4) continue;
        b.box(.14, 1.2, .14, M.wood, x, .6, 25);
      }
      b.box(40, .12, .12, M.wood, 0, 1.05, 25);
      b.collider(-11.5, 25, 17, .5, 'fence');
      b.collider(11.5, 25, 17, .5, 'fence');

      /* neighbour houses + city skyline silhouettes */
      const nb = new THREE.MeshStandardMaterial({ color: 0x2b3040, roughness: .9 });
      const winM = new THREE.MeshStandardMaterial({ color: 0xffd88a, emissive: 0xffc978, emissiveIntensity: 1.2 });
      [-26, 26].forEach(x => {
        b.box(12, 5, 10, nb, x, 2.5, 12);
        const r2 = new THREE.Mesh(new THREE.ConeGeometry(9, 2.2, 4), roof);
        r2.position.set(x, 6.1, 12); r2.rotation.y = Math.PI / 4;
        b.group.add(r2);
        [-3, 0, 3].forEach(dx => b.box(1.2, 1.2, .1, winM, x + dx, 2.8, 7));
        b.collider(x, 12, 12, 10, 'house');
      });
      for (let i = 0; i < 14; i++) {
        const x = -60 + i * 9 + Utils.rand(-2, 2);
        const h = Utils.rand(10, 30);
        b.box(Utils.rand(5, 9), h, 7, nb, x, h / 2, 46);
        for (let k = 0; k < 6; k++) {
          b.box(.7, .7, .08, winM, x + Utils.rand(-2.5, 2.5), 3 + k * 3.4, 42.5);
        }
      }
      /* distant casino glow on the horizon */
      const cas = Utils.textTexture('NEON PALACE', { w: 1024, h: 256, color: '#ff2d95', bg: '#07070d', size: 130 });
      const cp = b.panel(26, 6, cas, 8, 22, 60, 0);
      cp.material.emissiveIntensity = 1.4;
      b.animate({ type: 'signPulse', mat: cp.material, base: 1.4 });
      b.glow('rgba(255,45,149,.5)', 44, 8, 20, 58);

      /* street lamps */
      [-14, 0, 14].forEach(x => {
        b.cyl(.12, .16, 5, M.metal, x, 2.5, 27.5, 8);
        b.box(1.4, .16, .16, M.metal, x + .6, 5, 27.5);
        b.sphere(.24, pl, x + 1.2, 4.9, 27.5);
        b.glow('rgba(255,240,200,.5)', 7, x + 1.2, 4.7, 27.5);
        b.collider(x, 27.5, .5, .5, 'lamp');
      });

      /* trees */
      [[-8, 20], [9, 21], [-16, 17], [17, 18]].forEach(([x, z]) => {
        b.cyl(.28, .36, 2.4, M.wood, x, 1.2, z, 8);
        for (let k = 0; k < 3; k++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(1.7 - k * .35, 1.8, 9), M.plant);
          c.position.set(x, 2.6 + k * 1.1, z);
          b.group.add(c);
        }
        b.collider(x, z, .9, .9, 'tree');
      });

      /* mailbox */
      b.cyl(.06, .06, 1.1, M.wood, 2.6, .55, 24.2, 8);
      b.box(.4, .3, .6, M.red, 2.6, 1.25, 24.2);

      /* the black car on the driveway */
      const car = Car.build(b, 5.5, 0, 21.5, -Math.PI / 2);
      this.car = car;
      b.collider(5.5, 21.5, 4.6, 2.4, 'car');
      b.interact(5.4, 3, 3.2, 0, 1.4, 0, { node: car.group, label: 'GO TO CASINO', key: 'car' }, 0, car.group);
    },

    lights(b) {
      const g = b.group;
      /* moonlight + warm interior */
      const moon = new THREE.DirectionalLight(0x9fb6e0, 0.55);
      moon.position.set(-18, 26, 30);
      g.add(moon);
      const hemi = new THREE.HemisphereLight(0x2a3d5e, 0x191310, .45);
      g.add(hemi);
      const inside = [
        { x: 0, z: 5, c: 0xffdfb0, i: 1.5 }, { x: -6, z: -2.4, c: 0xffe0b8, i: 1.25 },
        { x: 6, z: -4, c: 0xffd0a0, i: 1.15 }, { x: 0, z: 1.6, c: 0x8fd0ff, i: 0.8 },
        { x: 4.2, z: -1.2, c: 0x9fffd8, i: 0.8 }
      ];
      inside.forEach((L, i) => {
        const l = new THREE.PointLight(L.c, L.i * 12, 14, 2);
        l.position.set(L.x, 2.6, L.z);
        g.add(l);
        World.lights.tiered.push({ light: l, tier: i < 2 ? 1 : i < 4 ? 2 : 3 });
      });
      const yard = new THREE.PointLight(0xffe0b0, 24, 40, 1.6);
      yard.position.set(0, 6, 20);
      g.add(yard);
      const street = new THREE.PointLight(0xbfd4ff, 20, 60, 1.4);
      street.position.set(0, 8, 30);
      g.add(street);
    },

    /* ---------------- door animation ---------------- */
    openDoor(open) {
      if (!this.door) return;
      this.doorOpen = open;
      this.doorCollider.disabled = open;
      Tween.to(this.door.rotation, { y: open ? -Math.PI / 2.1 : 0 }, .7, Tween.easeOutCubic);
      Sound.play('door');
    }
  };

  window.Home = Home;
})();
