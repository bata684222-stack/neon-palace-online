/* ============================================================
   dice.js — two-dice Over/Under/Seven betting
   ============================================================ */
(function () {
  'use strict';

  const PIPS = {
    1: [[50, 50]],
    2: [[26, 26], [74, 74]],
    3: [[26, 26], [50, 50], [74, 74]],
    4: [[26, 26], [74, 26], [26, 74], [74, 74]],
    5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
    6: [[26, 24], [74, 24], [26, 50], [74, 50], [26, 76], [74, 76]]
  };

  /* fair odds x house factor: pick a threshold, the payout follows the real
     probability of two dice (§21). Lucky Dice adds a further +10%. */
  const EV = 1.22;
  const CHOICES = {
    low: { label: 'LOW 2-5', p: 10 / 36, test: s => s <= 5 },
    under: { label: 'UNDER 7 (2-6)', p: 15 / 36, test: s => s <= 6 },
    seven: { label: 'EXACTLY 7', p: 6 / 36, test: s => s === 7 },
    over: { label: 'OVER 7 (8-12)', p: 15 / 36, test: s => s >= 8 },
    high: { label: 'HIGH 9-12', p: 10 / 36, test: s => s >= 9 }
  };
  function multOf(key) {
    const c = CHOICES[key];
    const bonus = window.Items ? Items.diceBonus() : 0;
    return Math.round((1 / c.p) * EV * (1 + bonus) * 100) / 100;
  }

  const Dice = {
    inter: null,
    betIdx: 1,
    choice: 'under',
    rolling: false,

    open(inter) { this.inter = inter; UI.open('dice', { inter }); },

    build(body, args) {
      const inter = args.inter || this.inter;
      const cfg = (inter && inter.cfg) || { name: 'DICE TABLE' };
      this.cfg = cfg;
      const lim = DayManager.betLimit('dice', cfg);
      const bets = DayManager.betOptions('dice', cfg);
      this.bets = bets;
      this.betIdx = Utils.clamp(this.betIdx, 0, bets.length - 1);

      body.innerHTML = `
        <div class="row between"><div class="sect" style="margin:0">${cfg.name}</div>
          <div class="muted">BALANCE: <b id="dc-bal" style="color:var(--gold)">${Utils.fmt(State.coins)}</b></div></div>
        <div class="dice-area">
          <div class="die" id="dc-d1"></div>
          <div class="die" id="dc-d2"></div>
          <div class="center" style="min-width:110px">
            <div class="muted">SUM</div><div class="big-num" id="dc-sum">—</div>
          </div>
        </div>
        <div class="sect">ВЫБОР СТАВКИ</div>
        <div class="out-bets" id="dc-choices"></div>
        <div class="sect" style="margin-top:14px">BET</div>
        <div class="bet-row" id="dc-bets"></div>
        <div class="muted" style="margin-top:10px">Лимит стола: ${Utils.fmt(lim.min)} — ${Utils.fmt(lim.max)} · время раунда: ${DayManager.TIME_COST.dice} мин${window.Items && Items.diceBonus() ? ' · 🎲 LUCKY DICE +10%' : ''}</div>
        <div class="result" id="dc-result" style="margin-top:14px">Выбери исход и ставку</div>
        <button class="btn gold" id="dc-roll" style="margin-top:14px;width:100%">ROLL DICE</button>`;

      const ch = body.querySelector('#dc-choices');
      Object.keys(CHOICES).forEach(k => {
        const b = Utils.el('button', 'obet' + (k === this.choice ? ' on' : ''), `${CHOICES[k].label} · x${multOf(k)}`);
        b.addEventListener('click', () => {
          this.choice = k; Sound.play('click');
          Utils.$$('.obet', ch).forEach(x => x.classList.remove('on'));
          b.classList.add('on');
        });
        ch.appendChild(b);
      });
      const row = body.querySelector('#dc-bets');
      bets.forEach((v, i) => {
        const c = Utils.el('button', 'chip' + (i === this.betIdx ? ' on' : ''), Utils.fmtShort(v));
        c.addEventListener('click', () => {
          this.betIdx = i; Sound.play('click');
          Utils.$$('.chip', row).forEach((x, k) => x.classList.toggle('on', k === i));
        });
        row.appendChild(c);
      });
      body.querySelector('#dc-roll').addEventListener('click', () => this.roll(body, inter));
      this.drawDie(body.querySelector('#dc-d1'), 1);
      this.drawDie(body.querySelector('#dc-d2'), 1);
    },

    drawDie(el, n) {
      el.innerHTML = '';
      (PIPS[n] || []).forEach(([x, y]) => {
        const p = Utils.el('div', 'pip');
        p.style.left = `calc(${x}% - 8px)`;
        p.style.top = `calc(${y}% - 8px)`;
        el.appendChild(p);
      });
    },

    roll(body, inter) {
      if (this.rolling) return;
      const bet = (this.bets || [1])[this.betIdx];
      const resEl = Utils.safe(body, '#dc-result');
      const v = Economy.validateBet('dice', bet, this.cfg);
      if (!v.ok) {
        Sound.play('deny');
        resEl.className = 'result lose'; resEl.textContent = v.reason;
        return;
      }
      this.rolling = true;
      Economy.bet(bet, 'dice');
      Sound.play('dice');
      World.rollWorldDice(inter, 1.6);
      const d1 = body.querySelector('#dc-d1'), d2 = body.querySelector('#dc-d2');
      d1.classList.add('rolling'); d2.classList.add('rolling');
      resEl.className = 'result'; resEl.textContent = 'БРОСОК...';
      body.querySelector('#dc-roll').disabled = true;
      body.querySelector('#dc-sum').textContent = '?';

      const a = Utils.randInt(1, 6), b = Utils.randInt(1, 6);
      const flick = setInterval(() => {
        this.drawDie(d1, Utils.randInt(1, 6));
        this.drawDie(d2, Utils.randInt(1, 6));
      }, 90);

      setTimeout(() => {
        clearInterval(flick);
        d1.classList.remove('rolling'); d2.classList.remove('rolling');
        if (d1.isConnected !== false) { this.drawDie(d1, a); this.drawDie(d2, b); }
        const sum = a + b;
        Utils.safe(body, '#dc-sum').textContent = sum;
        const c = CHOICES[this.choice];
        const won = c.test(sum);
        const payout = won ? Math.floor(bet * multOf(this.choice)) : 0;
        if (won) {
          resEl.className = 'result win';
          resEl.textContent = `${a} + ${b} = ${sum} · ${c.label} · +${Utils.fmt(payout)} монет`;
          if (payout >= bet * 4) {
            Sound.play('bigwin'); UI.bigWin('BIG WIN!');
            if (inter && inter.node) World.winBurst(inter.node.position.clone().setY(1.4), Inventory.effectColor(), 90);
          } else { Sound.play('win'); UI.sparks(12, Inventory.effectColor()); }
        } else {
          resEl.className = 'result lose';
          resEl.textContent = `${a} + ${b} = ${sum} · ставка не прошла`;
          Sound.play('lose');
        }
        Economy.settle('dice', bet, payout, { a, b, sum, choice: this.choice });
        Utils.safe(body, '#dc-bal').textContent = Utils.fmt(State.coins);
        Utils.safe(body, '#dc-roll').disabled = false;
        this.rolling = false;
        UI.refreshHUD();
      }, 1650);
    }
  };

  UI.registerPanel('dice', {
    title: (a) => (a && a.inter && a.inter.cfg && a.inter.cfg.name) || 'DICE',
    build: (body, args) => Dice.build(body, args),
    onClose: () => { Dice.rolling = false; }
  });

  window.Dice = Dice;
})();
