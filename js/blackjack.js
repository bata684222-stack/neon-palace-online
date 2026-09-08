/* ============================================================
   blackjack.js — classic blackjack vs dealer (Hit / Stand / Double)
   ============================================================ */
(function () {
  'use strict';

  const SUITS = [{ s: '♠', r: false }, { s: '♥', r: true }, { s: '♦', r: true }, { s: '♣', r: false }];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  const Blackjack = {
    inter: null,
    betIdx: 1,
    shoe: [],
    player: [],
    dealer: [],
    bet: 0,
    stage: 'bet',   // bet | play | dealer | done
    hole: true,

    open(inter) {
      this.inter = inter;
      this.stage = 'bet';
      this.player = []; this.dealer = [];
      UI.open('blackjack', { inter });
    },

    newShoe() {
      this.shoe = [];
      for (let d = 0; d < 6; d++)
        for (const su of SUITS)
          for (const r of RANKS) this.shoe.push({ r, s: su.s, red: su.r });
      Utils.shuffle(this.shoe);
      Sound.play('shuffle');
    },
    draw() {
      if (this.shoe.length < 20) this.newShoe();
      return this.shoe.pop();
    },
    value(hand) {
      let total = 0, aces = 0;
      for (const c of hand) {
        if (c.r === 'A') { aces++; total += 11; }
        else if (['10', 'J', 'Q', 'K'].indexOf(c.r) >= 0) total += 10;
        else total += +c.r;
      }
      while (total > 21 && aces > 0) { total -= 10; aces--; }
      return total;
    },
    isBlackjack(hand) { return hand.length === 2 && this.value(hand) === 21; },

    build(body, args) {
      const inter = args.inter || this.inter;
      const cfg = (inter && inter.cfg) || { name: 'BLACKJACK' };
      this.cfg = cfg;
      this._body = body;
      const lim = DayManager.betLimit('blackjack', cfg);
      const bets = DayManager.betOptions('blackjack', cfg);
      this.bets = bets;
      this.betIdx = Utils.clamp(this.betIdx, 0, bets.length - 1);

      body.innerHTML = `
        <div class="row between"><div class="sect" style="margin:0">${cfg.name} · Blackjack pays 3:2 · Dealer stands on 17</div>
          <div class="muted">BALANCE: <b id="bj-bal" style="color:var(--gold)">${Utils.fmt(State.coins)}</b></div></div>
        <div class="bj-table">
          <div class="hand-label">DEALER <span class="score" id="bj-dscore">—</span></div>
          <div class="hand" id="bj-dealer"></div>
          <div class="hand-label">PLAYER <span class="score" id="bj-pscore">—</span></div>
          <div class="hand" id="bj-player"></div>
        </div>
        <div class="muted">Лимит стола: ${Utils.fmt(lim.min)} — ${Utils.fmt(lim.max)} · время раздачи: ${DayManager.TIME_COST.blackjack} мин · HOUSE PROMO: возврат ${Math.round(DayManager.promo('blackjack') * 100)}% ставки</div>
        <div class="result" id="bj-result">Выбери ставку и нажми DEAL</div>
        <div class="sect" style="margin-top:12px">BET</div>
        <div class="bet-row" id="bj-bets"></div>
        <div class="row" style="margin-top:14px;gap:10px">
          <button class="btn gold" id="bj-deal" style="flex:1">DEAL</button>
          <button class="btn" id="bj-hit" disabled>HIT</button>
          <button class="btn" id="bj-stand" disabled>STAND</button>
          <button class="btn" id="bj-double" disabled>DOUBLE</button>
        </div>`;

      const row = body.querySelector('#bj-bets');
      bets.forEach((b, i) => {
        const c = Utils.el('button', 'chip' + (i === this.betIdx ? ' on' : ''), Utils.fmtShort(b));
        c.addEventListener('click', () => {
          if (this.stage === 'play' || this.stage === 'dealer') return;
          this.betIdx = i; Sound.play('click');
          Utils.$$('.chip', row).forEach((x, k) => x.classList.toggle('on', k === i));
        });
        row.appendChild(c);
      });

      body.querySelector('#bj-deal').addEventListener('click', () => this.deal(body));
      body.querySelector('#bj-hit').addEventListener('click', () => this.hit(body));
      body.querySelector('#bj-stand').addEventListener('click', () => this.stand(body));
      body.querySelector('#bj-double').addEventListener('click', () => this.double(body));
      this.render(body);
    },

    cardEl(c, hidden) {
      if (hidden) return Utils.el('div', 'pcard back', '');
      return Utils.el('div', 'pcard' + (c.red ? ' red' : ''),
        `<div class="c-top">${c.r}${c.s}</div><div class="c-mid">${c.s}</div>`);
    },

    render(body) {
      const dEl = body.querySelector('#bj-dealer'), pEl = body.querySelector('#bj-player');
      if (!dEl || !pEl) return;
      dEl.innerHTML = ''; pEl.innerHTML = '';
      this.dealer.forEach((c, i) => dEl.appendChild(this.cardEl(c, i === 1 && this.hole && this.stage === 'play')));
      this.player.forEach(c => pEl.appendChild(this.cardEl(c)));
      body.querySelector('#bj-dscore').textContent = this.dealer.length
        ? (this.hole && this.stage === 'play' ? this.value([this.dealer[0]]) + ' + ?' : this.value(this.dealer))
        : '—';
      body.querySelector('#bj-pscore').textContent = this.player.length ? this.value(this.player) : '—';
      body.querySelector('#bj-bal').textContent = Utils.fmt(State.coins);
      const play = this.stage === 'play';
      body.querySelector('#bj-hit').disabled = !play;
      body.querySelector('#bj-stand').disabled = !play;
      body.querySelector('#bj-double').disabled = !play || this.player.length !== 2 || !Economy.canAfford(this.bet);
      body.querySelector('#bj-deal').disabled = play || this.stage === 'dealer';
    },

    deal(body) {
      if (this.stage === 'play' || this.stage === 'dealer') return;
      const bet = (this.bets || [100])[this.betIdx];
      const v = Economy.validateBet('blackjack', bet, this.cfg);
      if (!v.ok) {
        Sound.play('deny');
        const r = Utils.safe(body, '#bj-result');
        r.className = 'result lose'; r.textContent = v.reason;
        return;
      }
      if (!this.shoe.length) this.newShoe();
      Economy.bet(bet, 'blackjack');
      this.bet = bet;
      this.player = []; this.dealer = [];
      this.hole = true;
      this.stage = 'play';
      const r = Utils.safe(body, '#bj-result');
      r.className = 'result'; r.textContent = 'HIT, STAND или DOUBLE';

      const seq = [() => this.player.push(this.draw()), () => this.dealer.push(this.draw()),
      () => this.player.push(this.draw()), () => this.dealer.push(this.draw())];
      seq.forEach((fn, i) => setTimeout(() => {
        fn(); Sound.play('card'); this.render(body);
        if (i === 3) {
          const pbj = this.isBlackjack(this.player), dbj = this.isBlackjack(this.dealer);
          if (pbj || dbj) {
            if (pbj) { State.flags = State.flags || {}; State.flags.naturalBJ = true; }
            this.hole = false;
            this.stage = 'done';
            this.settle(body, pbj && dbj ? 'push' : pbj ? 'bj' : 'lose');
          }
        }
      }, i * 320));
    },

    hit(body) {
      if (this.stage !== 'play') return;
      this.player.push(this.draw());
      Sound.play('card');
      this.render(body);
      if (this.value(this.player) > 21) { this.hole = false; this.stage = 'done'; this.settle(body, 'bust'); }
    },

    double(body) {
      if (this.stage !== 'play' || this.player.length !== 2) return;
      if (!Economy.bet(this.bet, 'blackjack')) { Sound.play('deny'); return; }
      this.bet *= 2;
      this.player.push(this.draw());
      Sound.play('card');
      this.render(body);
      if (this.value(this.player) > 21) { this.hole = false; this.stage = 'done'; this.settle(body, 'bust'); }
      else this.stand(body);
    },

    stand(body) {
      if (this.stage !== 'play') return;
      this.stage = 'dealer';
      this.hole = false;
      this.render(body);
      const step = () => {
        if (this.value(this.dealer) < 17) {
          this.dealer.push(this.draw());
          Sound.play('card');
          this.render(body);
          setTimeout(step, 550);
        } else {
          const p = this.value(this.player), d = this.value(this.dealer);
          this.stage = 'done';
          if (d > 21 || p > d) this.settle(body, 'win');
          else if (p === d) this.settle(body, 'push');
          else this.settle(body, 'lose');
        }
      };
      setTimeout(step, 500);
    },

    settle(body, outcome) {
      const bet = this.bet;
      let payout = 0, text = '', cls = 'lose';
      const p = this.value(this.player), d = this.value(this.dealer);
      switch (outcome) {
        case 'bj': payout = Math.floor(bet * 2.5); text = `BLACKJACK! ${p} · +${Utils.fmt(payout)}`; cls = 'win'; break;
        case 'win': payout = bet * 2; text = `ПОБЕДА ${p} vs ${d} · +${Utils.fmt(payout)}`; cls = 'win'; break;
        case 'push': payout = bet; text = `PUSH ${p} vs ${d} · ставка возвращена`; cls = 'push'; break;
        case 'bust': payout = 0; text = `BUST ${p} — перебор`; break;
        default: payout = 0; text = `ПОРАЖЕНИЕ ${p} vs ${d}`;
      }
      const r = Utils.safe(body, '#bj-result');
      r.className = 'result ' + cls;
      r.textContent = text;
      if (payout > bet) {
        Sound.play(outcome === 'bj' ? 'bigwin' : 'win');
        UI.sparks(outcome === 'bj' ? 26 : 12, Inventory.effectColor());
        if (outcome === 'bj' && this.inter && this.inter.node) World.winBurst(this.inter.node.position.clone().setY(1.6), Inventory.effectColor(), 90);
      } else if (payout === 0) Sound.play('lose');
      Economy.settle('blackjack', bet, payout, { player: p, dealer: d, outcome });
      this.render(body);
      UI.refreshHUD();
    }
  };

  UI.registerPanel('blackjack', {
    title: (a) => (a && a.inter && a.inter.cfg && a.inter.cfg.name) || 'BLACKJACK',
    build: (body, args) => Blackjack.build(body, args),
    onClose: () => {
      // never swallow a live bet: finish the hand automatically
      if (Blackjack.stage === 'play') Blackjack.stand(Blackjack._body);
    }
  });

  window.Blackjack = Blackjack;
})();
