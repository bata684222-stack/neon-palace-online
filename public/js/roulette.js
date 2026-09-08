/* ============================================================
   roulette.js — European roulette (single zero) mini-game
   ============================================================ */
(function () {
  'use strict';

  const REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  const isRed = n => REDS.indexOf(n) >= 0;
  const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

  const OUTSIDE = {
    red: { label: 'RED', mult: 2, test: n => n !== 0 && isRed(n) },
    black: { label: 'BLACK', mult: 2, test: n => n !== 0 && !isRed(n) },
    even: { label: 'EVEN', mult: 2, test: n => n !== 0 && n % 2 === 0 },
    odd: { label: 'ODD', mult: 2, test: n => n % 2 === 1 },
    low: { label: '1-18', mult: 2, test: n => n >= 1 && n <= 18 },
    high: { label: '19-36', mult: 2, test: n => n >= 19 },
    d1: { label: '1st 12', mult: 3, test: n => n >= 1 && n <= 12 },
    d2: { label: '2nd 12', mult: 3, test: n => n >= 13 && n <= 24 },
    d3: { label: '3rd 12', mult: 3, test: n => n >= 25 && n <= 36 }
  };

  const Roulette = {
    inter: null,
    chip: 50,
    bets: {},      // key -> amount ('n:17' or 'red')
    spinning: false,
    lastResult: null,

    open(inter) {
      this.inter = inter;
      this.bets = {};
      const chips = DayManager.betOptions('roulette', inter && inter.cfg);
      this.chip = chips[0];
      UI.open('roulette', { inter });
    },

    total() { return Object.keys(this.bets).reduce((s, k) => s + this.bets[k], 0); },

    payoutFor(n) {
      let payout = 0;
      const wins = [];
      for (const k in this.bets) {
        const amt = this.bets[k];
        if (k.indexOf('n:') === 0) {
          if (+k.slice(2) === n) { payout += amt * 36; wins.push(`Number ${n} x36`); }
        } else if (OUTSIDE[k] && OUTSIDE[k].test(n)) {
          payout += amt * OUTSIDE[k].mult;
          wins.push(`${OUTSIDE[k].label} x${OUTSIDE[k].mult}`);
        }
      }
      return { payout, wins };
    },

    build(body, args) {
      const self = this;
      const inter = args.inter || this.inter;
      const cfg = (inter && inter.cfg) || { name: 'ROULETTE' };
      const lim = DayManager.betLimit('roulette', cfg);
      const chips = DayManager.betOptions('roulette', cfg);
      this.lim = lim;
      if (chips.indexOf(this.chip) < 0) this.chip = chips[0];

      body.innerHTML = `
        <div class="roul-wrap">
          <div class="center">
            <canvas id="roul-canvas" width="320" height="320"></canvas>
            <div class="result" id="rl-result" style="margin-top:12px;min-width:280px">Сделай ставку</div>
          </div>
          <div class="roul-bets">
            <div class="row between"><div class="sect" style="margin:0">${cfg.name}</div>
              <div class="muted">BALANCE: <b id="rl-bal" style="color:var(--gold)">${Utils.fmt(State.coins)}</b></div></div>
            <div class="muted" style="margin:6px 0">CHIP VALUE</div>
            <div class="bet-row" id="rl-chips"></div>
            <div class="num-grid" id="rl-nums"></div>
            <div class="out-bets" id="rl-outs"></div>
            <div class="row between" style="margin-top:12px">
              <div class="muted">СТАВКА: <b id="rl-total" style="color:var(--gold)">0</b></div>
              <div class="row" style="gap:8px">
                <button class="btn sm" id="rl-clear">CLEAR</button>
                <button class="btn gold sm" id="rl-spin">SPIN</button>
              </div>
            </div>
            <div class="muted" style="margin-top:10px">Клик по числу или ставке добавляет выбранный чип. Выплаты: число x36, RED/BLACK/EVEN/ODD/1-18/19-36 x2, дюжина x3.
              <br>Лимит стола: ${Utils.fmt(lim.min)} — ${Utils.fmt(lim.max)} за раунд · время раунда: ${DayManager.TIME_COST.roulette} мин
              <br>HOUSE PROMO: возврат ${Math.round(DayManager.promo('roulette') * 100)}% ставки каждый спин.</div>
          </div>
        </div>`;

      const chipRow = body.querySelector('#rl-chips');
      chips.forEach((b, i) => {
        const c = Utils.el('button', 'chip' + (b === this.chip ? ' on' : ''), Utils.fmtShort(b));
        c.addEventListener('click', () => {
          this.chip = b; Sound.play('click');
          Utils.$$('.chip', chipRow).forEach((x, k) => x.classList.toggle('on', k === i));
        });
        chipRow.appendChild(c);
      });

      const nums = body.querySelector('#rl-nums');
      const zero = Utils.el('button', 'num green', '0');
      zero.addEventListener('click', () => this.addBet('n:0', body));
      nums.appendChild(zero);
      for (let i = 1; i <= 36; i++) {
        const n = Utils.el('button', 'num ' + (isRed(i) ? 'red' : 'black'), String(i));
        n.dataset.k = 'n:' + i;
        n.addEventListener('click', () => this.addBet('n:' + i, body));
        nums.appendChild(n);
      }
      const outs = body.querySelector('#rl-outs');
      Object.keys(OUTSIDE).forEach(k => {
        const b = Utils.el('button', 'obet', OUTSIDE[k].label);
        b.dataset.k = k;
        b.addEventListener('click', () => this.addBet(k, body));
        outs.appendChild(b);
      });

      body.querySelector('#rl-clear').addEventListener('click', () => {
        this.bets = {}; Sound.play('click'); this.refreshBets(body);
      });
      body.querySelector('#rl-spin').addEventListener('click', () => this.spin(body, inter));

      this.canvas = body.querySelector('#roul-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.wheelAngle = 0;
      this.ballAngle = 0;
      this.drawWheel(this.lastResult);
      this.refreshBets(body);
    },

    addBet(key, body) {
      if (this.spinning) return;
      if (!Economy.canAfford(this.total() + this.chip)) { Sound.play('deny'); return; }
      const lim = this.lim || DayManager.betLimit('roulette');
      if (this.total() + this.chip > lim.max) {
        Sound.play('deny');
        const r = Utils.safe(body, '#rl-result');
        r.className = 'result lose';
        r.textContent = 'Лимит стола: ' + Utils.fmt(lim.max);
        return;
      }
      if (this.total() + this.chip > State.coins) {
        Sound.play('deny');
        const r = Utils.safe(body, '#rl-result');
        r.className = 'result lose';
        r.textContent = 'НЕ ХВАТАЕТ МОНЕТ';
        return;
      }
      this.bets[key] = (this.bets[key] || 0) + this.chip;
      Sound.play('bet');
      this.refreshBets(body);
    },

    refreshBets(body) {
      if (!body || !body.querySelector('#rl-total')) return;
      body.querySelector('#rl-total').textContent = Utils.fmt(this.total());
      Utils.$$('.num', body).forEach(n => n.classList.toggle('on', !!this.bets[n.dataset.k]));
      Utils.$$('.obet', body).forEach(n => {
        n.classList.toggle('on', !!this.bets[n.dataset.k]);
        n.textContent = OUTSIDE[n.dataset.k].label + (this.bets[n.dataset.k] ? ' · ' + Utils.fmtShort(this.bets[n.dataset.k]) : '');
      });
      body.querySelector('#rl-bal').textContent = Utils.fmt(State.coins);
    },

    drawWheel(highlight) {
      const c = this.ctx, s = 320, r = s / 2;
      if (!c) return;
      c.clearRect(0, 0, s, s);
      c.save();
      c.translate(r, r);
      c.rotate(this.wheelAngle);
      const step = Math.PI * 2 / 37;
      WHEEL_ORDER.forEach((n, i) => {
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, r - 6, i * step, (i + 1) * step);
        c.closePath();
        c.fillStyle = n === 0 ? '#127a3d' : (isRed(n) ? '#b3242c' : '#15181f');
        if (highlight === n) c.fillStyle = '#ffc63a';
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,.25)';
        c.lineWidth = 1;
        c.stroke();
        c.save();
        c.rotate(i * step + step / 2);
        c.fillStyle = highlight === n ? '#221800' : '#fff';
        c.font = 'bold 13px Arial';
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.fillText(String(n), r - 12, 0);
        c.restore();
      });
      c.beginPath(); c.arc(0, 0, r * .42, 0, Math.PI * 2);
      c.fillStyle = '#3a2b06'; c.fill();
      c.beginPath(); c.arc(0, 0, r * .34, 0, Math.PI * 2);
      c.fillStyle = '#0b0d14'; c.fill();
      c.restore();

      // ball
      c.save();
      c.translate(r, r);
      const br = r * (this.spinning ? .84 : .74);
      c.beginPath();
      c.arc(Math.cos(this.ballAngle) * br, Math.sin(this.ballAngle) * br, 6, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.shadowColor = '#fff'; c.shadowBlur = 12;
      c.fill();
      c.restore();

      // center label
      if (highlight !== null && highlight !== undefined && !this.spinning) {
        c.save();
        c.translate(r, r);
        c.fillStyle = highlight === 0 ? '#25e39a' : (isRed(highlight) ? '#ff6b6b' : '#e8f4ff');
        c.font = 'bold 44px Arial';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(highlight), 0, 0);
        c.restore();
      }
    },

    spin(body, inter) {
      if (this.spinning) return;
      const total = this.total();
      if (total <= 0) {
        Sound.play('deny');
        Utils.safe(body, '#rl-result').textContent = 'Сначала поставь чипы';
        return;
      }
      const v = Economy.validateBet('roulette', total, (inter && inter.cfg) || {});
      if (!v.ok) {
        Sound.play('deny');
        const r = Utils.safe(body, '#rl-result');
        r.className = 'result lose'; r.textContent = v.reason;
        return;
      }
      if (!Economy.bet(total, 'roulette')) {
        Sound.play('deny');
        body.querySelector('#rl-result').textContent = 'НЕ ХВАТАЕТ МОНЕТ';
        return;
      }
      this.spinning = true;
      const result = Utils.randInt(0, 36);
      const idx = WHEEL_ORDER.indexOf(result);
      Sound.play('roulette', { ticks: 36 });
      World.spinRouletteWheel(inter, result, 4.4);

      const resEl = body.querySelector('#rl-result');
      resEl.className = 'result';
      resEl.textContent = 'ШАР В ИГРЕ...';
      body.querySelector('#rl-spin').disabled = true;

      const dur = 4400, t0 = performance.now();
      const step = Math.PI * 2 / 37;
      const targetWheel = Math.PI * 2 * 5 - (idx * step + step / 2);
      const startWheel = this.wheelAngle;
      const animate = (now) => {
        const k = Utils.clamp((now - t0) / dur, 0, 1);
        const e = 1 - Math.pow(1 - k, 4);
        this.wheelAngle = startWheel + (targetWheel - startWheel) * e;
        this.ballAngle = -this.wheelAngle * 2.4 - Math.PI * 6 * (1 - e);
        if (this.ctx) this.drawWheel(k >= 1 ? result : null);
        if (k < 1) requestAnimationFrame(animate);
        else {
          this.spinning = false;
          this.ballAngle = -Math.PI / 2;
          this.drawWheel(result);
          this.finish(body, total, result, inter);
        }
      };
      requestAnimationFrame(animate);
    },

    finish(body, total, result, inter) {
      const { payout, wins } = this.payoutFor(result);
      const resEl = Utils.safe(body, '#rl-result');
      this.lastResult = result;
      const colorName = result === 0 ? 'ZERO' : (isRed(result) ? 'RED' : 'BLACK');
      if (payout > 0) {
        const net = payout - total;
        resEl.className = 'result ' + (net > 0 ? 'win' : 'push');
        resEl.innerHTML = `<div><div class="ball-num">${result}</div>${colorName} · ${wins.join(', ')}<br>+${Utils.fmt(payout)} монет</div>`;
        if (payout >= total * 8) {
          Sound.play('bigwin');
          UI.bigWin('BIG WIN!');
          if (inter && inter.node) World.winBurst(inter.node.position.clone().setY(1.6), Inventory.effectColor(), 120);
        } else { Sound.play('win'); UI.sparks(12, Inventory.effectColor()); }
      } else {
        resEl.className = 'result lose';
        resEl.innerHTML = `<div><div class="ball-num">${result}</div>${colorName} · ставки не прошли</div>`;
        Sound.play('lose');
      }
      Economy.settle('roulette', total, payout, { result });
      this.bets = {};
      this.refreshBets(body);
      Utils.safe(body, '#rl-spin').disabled = false;
      UI.refreshHUD();
    }
  };

  UI.registerPanel('roulette', {
    title: (a) => (a && a.inter && a.inter.cfg && a.inter.cfg.name) || 'ROULETTE',
    build: (body, args) => Roulette.build(body, args),
    onClose: () => {
      if (Roulette.spinning) return;
      Roulette.bets = {};
    }
  });

  window.Roulette = Roulette;
})();
