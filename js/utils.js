/* ============================================================
   utils.js — helpers, event bus, small tween system
   ============================================================ */
(function () {
  'use strict';

  const Utils = {
    clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    weighted(list) { // [{v, w}]
      let total = 0;
      for (const it of list) total += it.w;
      let r = Math.random() * total;
      for (const it of list) { r -= it.w; if (r <= 0) return it.v; }
      return list[list.length - 1].v;
    },
    fmt(n) { return Math.round(n).toLocaleString('en-US'); },
    fmtShort(n) {
      n = Math.round(n);
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'K';
      return n.toLocaleString('en-US');
    },
    timeLeft(ms) {
      if (ms < 0) ms = 0;
      const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    },
    dayKey(d) {
      d = d || new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    nextMidnight() {
      const d = new Date();
      d.setHours(24, 0, 0, 0);
      return d.getTime();
    },
    el(tag, cls, html) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html != null) e.innerHTML = html;
      return e;
    },
    $: (sel, root) => (root || document).querySelector(sel),
    /** querySelector that never returns null: detached panels get a no-op stub,
        so a mini-game can always finish its payout even if its UI was closed */
    safe(root, sel) {
      const el = root ? root.querySelector(sel) : null;
      if (el) return el;
      return {
        style: {}, dataset: {}, disabled: false, value: '', textContent: '', innerHTML: '',
        classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
        appendChild() { }, addEventListener() { }, querySelector() { return null; },
        querySelectorAll() { return []; }
      };
    },
    $$: (sel, root) => Array.from((root || document).querySelectorAll(sel)),
    escape(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },

    /* ---- procedural textures (no external assets needed) ---- */
    glowTexture(color) {
      const key = 'glow_' + color;
      if (Utils._tex[key]) return Utils._tex[key];
      const s = 128, c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, color);
      grd.addColorStop(0.25, color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.globalAlpha = 1;
      g.fillRect(0, 0, s, s);
      const t = new THREE.CanvasTexture(c);
      Utils._tex[key] = t;
      return t;
    },
    dotTexture() {
      if (Utils._tex.dot) return Utils._tex.dot;
      const s = 64, c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.4, 'rgba(255,255,255,.55)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      const t = new THREE.CanvasTexture(c);
      Utils._tex.dot = t;
      return t;
    },
    textTexture(text, opts) {
      opts = opts || {};
      const w = opts.w || 512, h = opts.h || 256;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = opts.bg || '#07090f';
      g.fillRect(0, 0, w, h);
      if (opts.border) {
        g.strokeStyle = opts.border; g.lineWidth = 10;
        g.strokeRect(5, 5, w - 10, h - 10);
      }
      g.fillStyle = opts.color || '#00e5ff';
      g.font = `bold ${opts.size || 74}px Segoe UI, Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const lines = String(text).split('\n');
      const lh = (opts.size || 74) * 1.2;
      lines.forEach((ln, i) => {
        g.fillText(ln, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lh, w * 0.92);
      });
      const t = new THREE.CanvasTexture(c);
      t.anisotropy = 4;
      return t;
    },
    carpetTexture() {
      if (Utils._tex.carpet) return Utils._tex.carpet;
      const s = 512, c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      // base deep burgundy with gradient
      const grd=g.createLinearGradient(0,0,s,s);
      grd.addColorStop(0,'#4a1226'); grd.addColorStop(0.5,'#5d1730'); grd.addColorStop(1,'#3a0f1e');
      g.fillStyle=grd; g.fillRect(0,0,s,s);
      // fine weave noise
      for(let i=0;i<8000;i++){
        const x=Math.random()*s, y=Math.random()*s;
        const br=140+Math.random()*70|0, r=br, g2=18+Math.random()*30|0, b=55+Math.random()*50|0;
        g.fillStyle=`rgba(${r},${g2},${b},.42)`;
        g.fillRect(x,y,1.5,1.5);
      }
      // gold damask pattern
      g.strokeStyle='rgba(255,198,58,.32)'; g.lineWidth=7;
      for(let i=0;i<4;i++){ g.beginPath(); g.arc(s/2,s/2,48+i*56,0,Math.PI*2); g.stroke(); }
      // diamond lattice
      g.strokeStyle='rgba(255,220,120,.14)'; g.lineWidth=1.2;
      for(let x=0;x<s;x+=64){ g.beginPath(); g.moveTo(x,0); g.lineTo(x+s, s); g.stroke(); g.beginPath(); g.moveTo(x+s,0); g.lineTo(x, s); g.stroke(); }
      // vignette
      const vg=g.createRadialGradient(s/2,s/2, s*0.3, s/2,s/2, s*0.9);
      vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,0.22)');
      g.fillStyle=vg; g.fillRect(0,0,s,s);
      const t=new THREE.CanvasTexture(c);
      t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=16; t.colorSpace=THREE.SRGBColorSpace;
      Utils._tex.carpet=t; return t;
    },
    floorTexture() {
      if (Utils._tex.floor) return Utils._tex.floor;
      const s=512, c=document.createElement('canvas');
      c.width=c.height=s;
      const g=c.getContext('2d');
      // polished dark marble
      g.fillStyle='#0c101c'; g.fillRect(0,0,s,s);
      // large tiles 256
      g.fillStyle='#121a2e';
      g.fillRect(0,0,s/2,s/2); g.fillRect(s/2,s/2,s/2,s/2);
      // grout + bevel
      g.strokeStyle='rgba(0,229,255,.13)'; g.lineWidth=2;
      g.strokeRect(0.5,0.5,s-1,s-1); g.strokeRect(s/2+0.5,0.5,s/2-1,s/2-1); g.strokeRect(0.5,s/2+0.5,s/2-1,s/2-1); g.strokeRect(s/2+0.5,s/2+0.5,s/2-1,s/2-1);
      // marble veins
      g.strokeStyle='rgba(120,160,220,.09)'; g.lineWidth=1;
      for(let i=0;i<18;i++){ g.beginPath(); g.moveTo(Math.random()*s,0); g.bezierCurveTo(Math.random()*s,s*0.33, Math.random()*s,s*0.66, Math.random()*s,s); g.stroke(); }
      // specular speckles
      for(let i=0;i<1800;i++){ g.fillStyle=`rgba(255,255,255,${Math.random()*.07})`; g.fillRect(Math.random()*s, Math.random()*s, 1.2,1.2); }
      // neon edge glow
      g.strokeStyle='rgba(0,229,255,.07)'; g.lineWidth=6; g.strokeRect(0,0,s,s);
      const t=new THREE.CanvasTexture(c);
      t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=16; t.colorSpace=THREE.SRGBColorSpace;
      Utils._tex.floor=t; return t;
    },
    // new: high-res wall texture for extra detail
    wallTexture(){
      if(Utils._tex.wall) return Utils._tex.wall;
      const s=512, c=document.createElement('canvas'); c.width=c.height=s;
      const g=c.getContext('2d');
      g.fillStyle='#1e2535'; g.fillRect(0,0,s,s);
      // subtle panels
      g.fillStyle='rgba(255,255,255,.025)';
      for(let y=0;y<s;y+=128){ for(let x=0;x<s;x+=256){ g.fillRect(x+2,y+2,252,124); }}
      g.strokeStyle='rgba(0,229,255,.06)'; g.lineWidth=1; g.strokeRect(0,0,s,s);
      const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.anisotropy=8;
      Utils._tex.wall=t; return t;
    },
    _tex: {}
  };

  /* ---------------- event bus ---------------- */
  const Bus = {
    _m: {},
    on(name, fn) { (this._m[name] = this._m[name] || []).push(fn); return fn; },
    off(name, fn) { const a = this._m[name]; if (a) this._m[name] = a.filter(f => f !== fn); },
    emit(name, data) {
      const a = this._m[name];
      if (!a) return;
      for (const f of a.slice()) { try { f(data); } catch (e) { console.error('[Bus:' + name + ']', e); } }
    }
  };

  /* ---------------- tiny tween ---------------- */
  const Tween = {
    list: [],
    to(obj, props, dur, ease, onDone) {
      const from = {};
      for (const k in props) from[k] = obj[k];
      const t = { obj, from, props, dur: Math.max(0.0001, dur), t: 0, ease: ease || Tween.easeOutCubic, onDone };
      Tween.list.push(t);
      return t;
    },
    update(dt) {
      for (let i = Tween.list.length - 1; i >= 0; i--) {
        const t = Tween.list[i];
        t.t += dt;
        const k = Utils.clamp(t.t / t.dur, 0, 1), e = t.ease(k);
        for (const p in t.props) t.obj[p] = Utils.lerp(t.from[p], t.props[p], e);
        if (k >= 1) { Tween.list.splice(i, 1); if (t.onDone) t.onDone(); }
      }
    },
    easeOutCubic: k => 1 - Math.pow(1 - k, 3),
    easeInOutQuad: k => (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
    easeOutBack: k => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2),
    easeOutQuint: k => 1 - Math.pow(1 - k, 5)
  };

  window.Utils = Utils;
  window.Bus = Bus;
  window.Tween = Tween;
})();
