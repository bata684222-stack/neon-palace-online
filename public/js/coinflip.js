/* ============================================================
   coinflip.js — heads / tails station (x1.95)
   ============================================================ */
(function () {
  'use strict';

  const MULT = 1.95;

  const CoinFlip = {
    inter: null,
    betIdx: 1,
    side: 'heads',
    flipping: false,
    streak: 0,

    open(inter) { this.inter = inter; UI.open('coinflip', { inter }); },

    build(body, args) {
      const inter = args.inter || this.inter;
      const cfg = (inter && inter.cfg) || { name: 'COIN FLIP' };
      this.cfg = cfg;
      const lim = DayManager.betLimit('coinflip', cfg);
      const bets = DayManager.betOptions('coinflip', cfg);
      this.bets = bets;
      this.betIdx = Utils.clamp(this.betIdx, 0, bets.length - 1);

      body.innerHTML = `
        <div class="row between"><div class="sect" style="margin:0">${cfg.name} · выплата x${MULT}</div>
          <div class="muted">BALANCE: <b id="cf-bal" style="color:var(--gold)">${Utils.fmt(State.coins)}</b></div></div>
        <div class="coin3d"><div class="coin-inner" id="cf-coin">
          <div class="coin-face a">H</div><div class="coin-face b">T</div></div></div>
        <div class="out-bets" style="grid-template-columns:repeat(2,1fr)" id="cf-sides"></div>
        <div class="sect" style="margin-top:14px">BET</div>
        <div class="bet-row" id="cf-bets"></div>
        <div class="muted" style="margin-top:8px">Лимит: ${Utils.fmt(lim.min)} — ${Utils.fmt(lim.max)} · время раунда: ${DayManager.TIME_COST.coinflip} мин</div>
        <div class="result" id="cf-result" style="margin-top:14px">Выбери сторону и ставку</div>
        <div class="row between" style="margin-top:10px">
          <span class="muted">Серия побед подряд: <b id="cf-streak">${this.streak}</b></span>
        </div>
        <button class="btn gold" id="cf-flip" style="margin-top:12px;width:100%">FLIP COIN</button>`;

      const sides = body.querySelector('#cf-sides');
      [['heads', 'HEADS (H)'], ['tails', 'TAILS (T)']].forEach(([k, label]) => {
        const b = Utils.el('button', 'obet' + (k === this.side ? ' on' : ''), label);
        b.addEventListener('click', () => {
          this.side = k; Sound.play('click');
          Utils.$$('.obet', sides).forEach(x => x.classList.remove('on'));
          b.classList.add('on');
        });
        sides.appendChild(b);
      });
      const row = body.querySelector('#cf-bets');
      bets.forEach((v, i) => {
        const c = Utils.el('button', 'chip' + (i === this.betIdx ? ' on' : ''), Utils.fmtShort(v));
        c.addEventListener('click', () => {
          this.betIdx = i; Sound.play('click');
          Utils.$$('.chip', row).forEach((x, k) => x.classList.toggle('on', k === i));
        });
        row.appendChild(c);
      });
      body.querySelector('#cf-flip').addEventListener('click', () => this.flip(body, inter));
    },

    flip(body, inter) {
      if (this.flipping) return;
      const bet = (this.bets || [1])[this.betIdx];
      const resEl = Utils.safe(body, '#cf-result');
      const v = Economy.validateBet('coinflip', bet, this.cfg);
      if (!v.ok) {
        Sound.play('deny');
        resEl.className = 'result lose'; resEl.textContent = v.reason;
        return;
      }
      this.flipping = true;
      Economy.bet(bet, 'coinflip');
      Sound.play('flip');
      World.flipWorldCoin(2);
      let result = Math.random() < .5 ? 'heads' : 'tails';
      /* Lucky Charm: small chance to nudge a losing flip (§6, capped at 5%) */
      if (result !== this.side && Math.random() < Items.luckBonus('coinflip')) result = this.side;
      const coin = body.querySelector('#cf-coin');
      resEl.className = 'result'; resEl.textContent = 'МОНЕТА В ВОЗДУХЕ...';
      body.querySelector('#cf-flip').disabled = true;

      const spins = 6 + Utils.randInt(0, 2);
      const endDeg = spins * 360 + (result === 'tails' ? 180 : 0);
      const dur = 1800, t0 = performance.now();
      const anim = (now) => {
        const k = Utils.clamp((now - t0) / dur, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        if (coin.isConnected !== false) coin.style.transform = `rotateY(${endDeg * e}deg) translateY(${-Math.sin(k * Math.PI) * 60}px)`;
        if (k < 1) requestAnimationFrame(anim);
        else this.finish(body, bet, result, inter);
      };
      requestAnimationFrame(anim);
    },

    finish(body, bet, result, inter) {
      const won = result === this.side;
      const payout = won ? Math.floor(bet * MULT) : 0;
      const resEl = Utils.safe(body, '#cf-result');
      if (won) {
        this.streak++;
        resEl.className = 'result win';
        resEl.textContent = `${result.toUpperCase()} — победа! +${Utils.fmt(payout)} монет`;
        Sound.play('win');
        UI.sparks(14, Inventory.effectColor());
        if (this.streak >= 5) {
          UI.bigWin('STREAK x' + this.streak);
          if (inter && inter.node) World.winBurst(inter.node.position.clone().setY(2.5), Inventory.effectColor(), 110);
        }
      } else {
        this.streak = 0;
        resEl.className = 'result lose';
        resEl.textContent = `${result.toUpperCase()} — мимо`;
        Sound.play('lose');
      }
      Utils.safe(body, '#cf-streak').textContent = this.streak;
      Economy.settle('coinflip', bet, payout, { result, pick: this.side });
      Utils.safe(body, '#cf-bal').textContent = Utils.fmt(State.coins);
      Utils.safe(body, '#cf-flip').disabled = false;
      this.flipping = false;
      UI.refreshHUD();
    }
  };

  UI.registerPanel('coinflip', {
    title: () => 'COIN FLIP',
    build: (body, args) => CoinFlip.build(body, args),
    onClose: () => { CoinFlip.flipping = false; }
  });

  window.CoinFlip = CoinFlip;
})();
