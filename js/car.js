/* ============================================================
   car.js — the black car + the night-city travel environment
   builds the vehicle, drives it along the road, and provides
   the camera paths used by the travel cinematics
   ============================================================ */
(function () {
  'use strict';

  const ROAD_Z_START = 30;     // in front of the house
  const ROAD_Z_END = -300;     // casino entrance

  const Car = {
    group: null,           // car currently being driven (travel env)
    travelEnv: null,
    driving: null,
    _wheelSpin: 0,
    headMat: null,
    tailMat: null,

    /* ================= model ================= */
    build(b, x, y, z, ry) {
      const M = b.M;
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = ry || 0;
      b.group.add(g);

      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0b0c11, roughness: .22, metalness: .85 });
      const trimMat = new THREE.MeshStandardMaterial({ color: 0x22242c, roughness: .4, metalness: .7 });
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2a3a, roughness: .1, metalness: .6, transparent: true, opacity: .7 });
      const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6da, emissive: 0xfff0c8, emissiveIntensity: 0 });
      const tailMat = new THREE.MeshStandardMaterial({ color: 0x8f1420, emissive: 0xff2a2a, emissiveIntensity: 0 });
      const tyreMat = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: .95 });
      const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9c2d0, roughness: .3, metalness: .95 });

      /* chassis */
      b.box(4.5, .62, 1.95, bodyMat, 0, .68, 0, 0, g);
      b.box(3.9, .18, 2.02, trimMat, 0, .42, 0, 0, g);
      /* cabin */
      b.box(2.5, .62, 1.82, bodyMat, -.15, 1.28, 0, 0, g);
      b.box(2.2, .5, 1.86, glassMat, -.15, 1.3, 0, 0, g);
      /* bonnet / boot slopes */
      b.box(1.05, .3, 1.9, bodyMat, 1.85, .92, 0, 0, g);
      b.box(.8, .34, 1.9, bodyMat, -1.9, .95, 0, 0, g);
      /* doors (animated) */
      const doors = [];
      [-1, 1].forEach(side => {
        const d = new THREE.Group();
        d.position.set(-.5, .95, side * .98);
        g.add(d);
        const panel = new THREE.Mesh(World.G.box, bodyMat);
        panel.scale.set(1.7, .8, .1);
        panel.position.set(.55, 0, 0);
        d.add(panel);
        const win = new THREE.Mesh(World.G.box, glassMat);
        win.scale.set(1.3, .42, .06);
        win.position.set(.55, .48, 0);
        d.add(win);
        doors.push({ node: d, side });
      });
      /* lights */
      [-.62, .62].forEach(pz => {
        b.box(.12, .2, .5, headMat, 2.32, .88, pz, 0, g);
        b.box(.1, .16, .42, tailMat, -2.28, .95, pz, 0, g);
      });
      b.box(4.3, .1, .1, trimMat, 0, .34, .98, 0, g);
      b.box(4.3, .1, .1, trimMat, 0, .34, -.98, 0, g);
      /* wheels */
      const wheels = [];
      [[1.42, .98], [1.42, -.98], [-1.42, .98], [-1.42, -.98]].forEach(([px, pz]) => {
        const w = new THREE.Group();
        w.position.set(px, .42, pz);
        g.add(w);
        const tyre = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .3, 16), tyreMat);
        tyre.rotation.x = Math.PI / 2;
        w.add(tyre);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .32, 10), rimMat);
        rim.rotation.x = Math.PI / 2;
        w.add(rim);
        wheels.push(w);
      });
      /* headlight cones */
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff3d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const beams = [];
      [-.62, .62].forEach(pz => {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 9, 12, 1, true), beamMat);
        cone.rotation.z = Math.PI / 2;
        cone.position.set(6.9, .8, pz);
        g.add(cone);
        beams.push(cone);
      });
      const glow = b.glow('rgba(255,240,200,.7)', 0.01, 0, 0, 0, g);
      glow.position.set(2.6, .9, 0);

      const car = { group: g, doors, wheels, headMat, tailMat, beamMat, beams, glow, lightsOn: false };
      car.setLights = (on) => {
        car.lightsOn = on;
        headMat.emissiveIntensity = on ? 2.6 : 0;
        tailMat.emissiveIntensity = on ? 1.6 : 0;
        beamMat.opacity = on ? .13 : 0;
        glow.scale.setScalar(on ? 6 : 0.01);
      };
      car.openDoor = (open) => {
        car.doors.forEach(d => Tween.to(d.node.rotation, { y: open ? d.side * -1.15 : 0 }, .8, Tween.easeOutCubic));
        Sound.play(open ? 'door' : 'close');
      };
      car.setLights(false);
      return car;
    },

    /* ================= travel environment ================= */
    buildTravel(scene) {
      const group = new THREE.Group();
      scene.add(group);
      const env = World.registerEnv('travel', {
        group, zoneAt: () => ({ id: 'road', label: 'NIGHT CITY' }),
        spawn: { x: 0, z: 0, yaw: 0 }, floor: 0,
        fog: 0.006, bg: 0x05060f, name: 'NIGHT CITY'
      });
      this.travelEnv = env;
      const b = World.builder(group, env.colliders, env.rayTargets, env.interactables);
      const M = b.M;

      const asphalt = new THREE.MeshStandardMaterial({ color: 0x191b22, roughness: .8 });
      const ground = new THREE.MeshStandardMaterial({ color: 0x0e1017, roughness: .95 });
      b.plane(240, 420, ground, 0, -.04, -140);
      b.plane(14, 400, asphalt, 0, 0, -140);
      for (let z = ROAD_Z_START; z > ROAD_Z_END; z -= 8) b.box(.3, .02, 3.2, M.white, 0, .02, z);
      /* kerbs */
      b.box(.6, .3, 400, new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: .9 }), -7.3, .15, -140);
      b.box(.6, .3, 400, new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: .9 }), 7.3, .15, -140);

      /* city blocks (instanced for performance) */
      const bGeo = new THREE.BoxGeometry(1, 1, 1);
      const bMat = new THREE.MeshStandardMaterial({ color: 0x1d2130, roughness: .9 });
      const winGeo = new THREE.PlaneGeometry(.8, .8);
      const winMat = new THREE.MeshStandardMaterial({
        color: 0xffe0a0, emissive: 0xffd58a, emissiveIntensity: 1.3, side: THREE.DoubleSide
      });
      const blocks = [], wins = [];
      for (let z = ROAD_Z_START - 6; z > ROAD_Z_END + 10; z -= 16) {
        [-1, 1].forEach(side => {
          const w = Utils.rand(9, 15), h = Utils.rand(12, 46), d = Utils.rand(10, 16);
          const x = side * (11 + w / 2 + Utils.rand(0, 5));
          blocks.push([x, h / 2, z, w, h, d]);
          const rows = Math.min(9, Math.floor(h / 4));
          for (let r = 0; r < rows; r++) {
            for (let c = -1; c <= 1; c++) {
              if (Math.random() < .35) continue;
              wins.push([x - side * (w / 2 + .06), 3 + r * 4, z + c * (d / 3.2), side]);
            }
          }
        });
      }
      const bi = new THREE.InstancedMesh(bGeo, bMat, blocks.length);
      const dm = new THREE.Object3D();
      blocks.forEach((v, i) => {
        dm.position.set(v[0], v[1], v[2]); dm.rotation.set(0, 0, 0);
        dm.scale.set(v[3], v[4], v[5]); dm.updateMatrix(); bi.setMatrixAt(i, dm.matrix);
      });
      group.add(bi);
      const wi = new THREE.InstancedMesh(winGeo, winMat, wins.length);
      wins.forEach((v, i) => {
        dm.position.set(v[0], v[1], v[2]);
        dm.rotation.set(0, v[3] > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        dm.scale.setScalar(1); dm.updateMatrix(); wi.setMatrixAt(i, dm.matrix);
      });
      group.add(wi);
      b.animate({ type: 'panelFlicker', mat: winMat, base: 1.3 });

      /* street lamps (instanced poles + real glow sprites every other one) */
      for (let z = ROAD_Z_START - 10; z > ROAD_Z_END + 12; z -= 22) {
        [-8.4, 8.4].forEach(x => {
          b.cyl(.12, .16, 6, M.metal, x, 3, z, 6);
          const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffe0a0, emissiveIntensity: 1.8 });
          b.box(1.6, .16, .16, M.metal, x - Math.sign(x) * .8, 6, z);
          b.sphere(.22, lampMat, x - Math.sign(x) * 1.5, 5.9, z);
          b.glow('rgba(255,232,180,.45)', 7, x - Math.sign(x) * 1.5, 5.7, z);
        });
      }
      /* roadside neon billboards */
      const ads = [['LUCKY 777', '#ffc63a'], ['NEON NIGHTS', '#ff2d95'], ['PLAY SMART', '#00e5ff'], ['JACKPOT AHEAD', '#25e39a']];
      ads.forEach((ad, i) => {
        const z = -40 - i * 55;
        const side = i % 2 ? 1 : -1;
        const tex = Utils.textTexture(ad[0], { w: 768, h: 256, color: ad[1], bg: '#08070f', size: 110, border: ad[1] });
        const p = b.panel(11, 4, tex, side * 10, 7.5, z, side > 0 ? -Math.PI / 2 : Math.PI / 2);
        p.material.emissiveIntensity = 1.3;
        b.animate({ type: 'signPulse', mat: p.material, base: 1.3, phase: i });
        b.cyl(.2, .2, 5.6, M.metal, side * 10, 2.8, z, 8);
        b.glow('rgba(255,255,255,.22)', 12, side * 10, 7.5, z);
      });

      /* ---- the casino exterior at the end of the road ---- */
      const cg = new THREE.Group();
      cg.position.set(0, 0, ROAD_Z_END - 26);
      group.add(cg);
      const facade = new THREE.MeshStandardMaterial({ color: 0x1a1c2a, roughness: .6, metalness: .3 });
      b.box(64, 26, 26, facade, 0, 13, 0, 0, cg);
      b.box(70, 1.4, 30, new THREE.MeshStandardMaterial({ color: 0x2b2f42, roughness: .7 }), 0, 26.6, 0, 0, cg);
      /* entrance */
      b.box(16, 9, 2, new THREE.MeshStandardMaterial({ color: 0x0d0f18, roughness: .5 }), 0, 4.5, 13.2, 0, cg);
      const doorMat = new THREE.MeshStandardMaterial({ color: 0xffd88a, emissive: 0xffc63a, emissiveIntensity: 1.1, transparent: true, opacity: .8 });
      this.casinoDoors = [];
      [-1, 1].forEach(s => {
        const d = b.box(7.4, 8, .3, doorMat, s * 3.85, 4.2, 14.1, 0, cg);
        this.casinoDoors.push({ mesh: d, base: s * 3.85, dir: s });
      });
      /* neon sign + columns + red carpet */
      const sTex = Utils.textTexture('NEON PALACE', { w: 1024, h: 256, color: '#ff2d95', bg: '#07070d', size: 150 });
      const sign = b.panel(38, 9, sTex, 0, 17, 13.6, 0, cg);
      sign.material.emissiveIntensity = 1.6;
      b.animate({ type: 'signPulse', mat: sign.material, base: 1.6 });
      b.glow('rgba(255,45,149,.55)', 60, 0, 17, 15, cg);
      [-11, 11].forEach(x => {
        b.cyl(1.2, 1.4, 12, new THREE.MeshStandardMaterial({ color: 0x2a2e40, roughness: .7 }), x, 6, 15, 12, cg);
        const ring = b.cyl(1.3, 1.3, .3, b.M.neonCyan, x, 9, 15, 12, cg);
        b.animate({ type: 'ringPulse', obj: ring, phase: x });
      });
      b.plane(12, 22, new THREE.MeshStandardMaterial({ color: 0x8c1a2a, roughness: .95 }), 0, .05, 26, -Math.PI / 2);
      /* spotlights sweeping the sky */
      for (let i = 0; i < 4; i++) {
        const beam = new THREE.Mesh(
          new THREE.ConeGeometry(2.4, 40, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xff8ad0, transparent: true, opacity: .09, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        beam.position.set(-24 + i * 16, 28, 0);
        beam.rotation.z = (i % 2 ? .3 : -.3);
        cg.add(beam);
        b.animate({ type: 'ringPulse', obj: beam, phase: i * 1.7 });
      }

      /* lights for the drive */
      const hemi = new THREE.HemisphereLight(0x2a3a68, 0x0a0a12, .8);
      group.add(hemi);
      const moon = new THREE.DirectionalLight(0x9fb6e0, .8);
      moon.position.set(-40, 60, -60);
      group.add(moon);
      [[0, -20], [0, -110], [0, -220], [0, ROAD_Z_END - 6]].forEach(([x, z], i) => {
        const l = new THREE.PointLight(i === 3 ? 0xff8ad0 : 0xbfd4ff, i === 3 ? 60 : 26, i === 3 ? 120 : 70, 1.4);
        l.position.set(x, 10, z);
        group.add(l);
        World.lights.tiered.push({ light: l, tier: i < 2 ? 1 : 2 });
      });

      /* the car used during the trip */
      this.car = this.build(b, 0, 0, ROAD_Z_START, -Math.PI / 2);
      this.car.group.rotation.y = Math.PI;    // point along -Z
      return env;
    },

    /* ================= driving ================= */
    startDrive(fromZ, toZ, dur, onDone) {
      this.driving = { t: 0, dur: dur, from: fromZ, to: toZ, onDone: onDone || null };
      if (this.car) {
        this.car.group.position.set(0, 0, fromZ);
        this.car.group.rotation.y = toZ < fromZ ? Math.PI : 0;
        this.car.setLights(true);
      }
    },
    stopDrive() { this.driving = null; },
    pos() { return this.car ? this.car.group.position : new THREE.Vector3(); },

    update(dt) {
      const d = this.driving;
      if (d && this.car) {
        d.t = Math.min(d.dur, d.t + dt);
        const k = d.t / d.dur;
        // улучшенная плавная кривая — без рывков в начале/конце
        const e = k < .12 ? Tween.easeOutCubic(k / .12) * .12 : k > .88 ? .88 + (1 - Math.pow(1 - (k - .88) / .12, 3)) * .12 : k;
        this.car.group.position.z = Utils.lerp(d.from, d.to, e);
        // легкое покачивание только на высокой скорости, иначе прямо
        const wobble = k>0.15 && k<0.85 ? Math.sin(k * Math.PI * 4) * 0.08 : 0;
        this.car.group.position.x = wobble;
        // небольшой крен в повороте
        this.car.group.rotation.z = wobble * 0.12;
        this._wheelSpin += dt * 26;
        this.car.wheels.forEach(w => w.rotation.x = this._wheelSpin);
        if (d.t >= d.dur) { const cb = d.onDone; this.driving = null; this.car.group.rotation.z=0; if (cb) cb(); }
      }
      /* idle wheels shimmer for the parked car at home */
      if (window.Home && Home.car && Home.car.lightsOn) {
        Home.car.wheels.forEach(w => w.rotation.x += dt * 2);
      }
    },

    openCasinoDoors(open) {
      (this.casinoDoors || []).forEach(d => {
        Tween.to(d.mesh.position, { x: open ? d.base + d.dir * 7.2 : d.base }, 2.2, Tween.easeInOutQuad);
      });
      Sound.play('door');
    },

    ROAD_Z_START, ROAD_Z_END
  };

  window.Car = Car;
})();
