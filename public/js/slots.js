/* ============================================================
   slots.js — 3-reel slot machine mini-game
   ============================================================ */
(function () {
  'use strict';

  /* Reel strip: identical odds on every machine tier, only the paytable
     and the bet size change. Verified return-to-player ~119% (the house
     promo that makes the 6-day quota beatable — small absolute payouts). */
  const SYMBOLS = [
    { id: 'cherry', ch: '🍒', w: 28 },
    { id: 'lemon', ch: '🍋', w: 24 },
    { id: 'orange', ch: '🍊', w: 18 },
    { id: 'star', ch: '⭐', w: 14 },
    { id: 'diamond', ch: '💎', w: 10 },
    { id: 'seven', ch: '7️⃣', w: 6 }
  ];

  /* §18 economy: basic max win = x10 (1 000 on a 100 bet),
     advanced max = x6 (3 000 on 500), vip max = x5 (10 000 on 2 000) */
  const PAYTABLES = {
    basic: {
      name: 'BASIC SLOT', min: 100,
      three: { cherry: 8, lemon: 8, orange: 10, star: 10, diamond: 10, seven: 10 },
      pair: { cherry: 1.65, lemon: 1.65, orange: 1.75, star: 1.85, diamond: 2.25, seven: 2.65 }
    },
    advanced: {
      name: 'ADVANCED SLOT', min: 500,
      three: { cherry: 4, lemon: 5, orange: 6, star: 6, diamond: 6, seven: 6 },
      pair: { cherry: 1.9, lemon: 2.0, orange: 2.1, star: 2.3, diamond: 2.7, seven: 3.0 }
    },
    vip: {
      name: 'VIP SLOT', min: 2000,
      three: { cherry: 3, lemon: 4, orange: 5, star: 5, diamond: 5, seven: 5 },
      pair: { cherry: 2.0, lemon: 2.1, orange: 2.2, star: 2.4, diamond: 2.8, seven: 3.2 }
    }
  };
  const ROW_H = 120;

  const Slots = {
    inter: null,
    betIdx: 1,
    spinning: false,

    open(inter) {
      this.inter = inter;
      UI.open('slots', { inter });
    },

    tableFor(cfg) { return PAYTABLES[(cfg && cfg.tier) || 'basic'] || PAYTABLES.basic; },

    pick() { return Utils.weighted(SYMBOLS.map(s => ({ v: s, w: s.w }))); },

    evaluate(res, table) {
      const [a, b, c] = res;
      if (a.id === b.id && b.id === c.id) {
        return {
          mult: table.three[a.id], sym: a,
          kind: a.id === 'seven' ? 'JACKPOT 7-7-7!' : 'THREE OF A KIND — ' + a.ch.repeat(3)
        };
      }
      if (a.id === b.id || b.id === c.id || a.id === c.id) {
        const sym = a.id === b.id ? a : (b.id === c.id ? b : a);
        return { mult: table.pair[sym.id], sym, kind: 'PAIR ' + sym.ch + sym.ch };
      }
      return { mult: 0, sym: null, kind: 'NO WIN' };
    },

    /** Lucky Charm: a small chance to turn a dead spin into the smallest win */
    applyLuck(res) {
      if (Math.random() >= Items.luckBonus('slots')) return res;
      const sym = res[0];
      res[1] = sym;                       // force a pair
      return res;
    },

    build(body, args) {
      const self = this;
      const inter = args.inter || this.inter;
      const cfg = (inter && inter.cfg) || { name: 'SLOTS', tier: 'basic' };
      const table = this.tableFor(cfg);
      this.table = table;
      const lim = DayManager.betLimit('slots', cfg);
      const bets = DayManager.betOptions('slots', cfg);
      this.betIdx = Utils.clamp(this.betIdx, 0, bets.length - 1);

      body.innerHTML = `
        <div class="slot-machine">
          <div class="row between"><div class="sect" style="margin:0">${cfg.name || 'SLOT MACHINE'}</div>
            <div class="muted">BALANCE: <b id="sl-bal" style="color:var(--gold)">${Utils.fmt(State.coins)}</b></div></div>
          <div class="reels" id="sl-reels">
            <div class="reel"><div class="strip"></div></div>
            <div class="reel"><div class="strip"></div></div>
            <div class="reel"><div class="strip"></div></div>
          </div>
          <div class="result" id="sl-result">Выбери ставку и жми SPIN</div>
          <div class="muted" style="margin-top:8px">${table.name} · лимит стола: ${Utils.fmt(lim.min)} — ${Utils.fmt(lim.max)} · время раунда: ${DayManager.TIME_COST.slots} мин</div>
          <div class="sect" style="margin-top:14px">BET</div>
          <div class="bet-row" id="sl-bets"></div>
          <div class="row" style="margin-top:14px;gap:10px">
            <button class="btn gold" id="sl-spin" style="flex:1">SPIN  ·  <span id="sl-betlabel"></span></button>
            <button class="btn sm" id="sl-max">MAX BET</button>
          </div>
          <div class="paytable" id="sl-pay"></div>
        </div>`;

      const betRow = body.querySelector('#sl-bets');
      bets.forEach((b, i) => {
        const chip = Utils.el('button', 'chip' + (i === this.betIdx ? ' on' : ''), Utils.fmtShort(b));
        chip.addEventListener('click', () => {
          this.betIdx = i;
          Sound.play('click');
          Utils.$$('.chip', betRow).forEach((c, k) => c.classList.toggle('on', k === i));
          body.querySelector('#sl-betlabel').textContent = Utils.fmt(bets[this.betIdx]);
        });
        betRow.appendChild(chip);
      });
      body.querySelector('#sl-betlabel').textContent = Utils.fmt(bets[this.betIdx]);
      body.querySelector('#sl-max').addEventListener('click', () => {
        this.betIdx = bets.length - 1;
        Utils.$$('.chip', betRow).forEach((c, k) => c.classList.toggle('on', k === this.betIdx));
        body.querySelector('#sl-betlabel').textContent = Utils.fmt(bets[this.betIdx]);
        Sound.play('click');
      });

      const pay = body.querySelector('#sl-pay');
      SYMBOLS.slice().reverse().forEach(s => {
        pay.appendChild(Utils.el('div', null, `${s.ch}${s.ch}${s.ch} — x${table.three[s.id]}`));
      });
      SYMBOLS.slice().reverse().forEach(s => {
        pay.appendChild(Utils.el('div', null, `${s.ch}${s.ch} — x${table.pair[s.id]}`));
      });

      // fill reels with idle symbols
      Utils.$$('.strip', body).forEach(strip => {
        strip.innerHTML = '';
        for (let i = 0; i < 3; i++) strip.appendChild(Utils.el('div', 'sym', this.pick().ch));
        strip.style.transform = 'translateY(0px)';
      });

      body.querySelector('#sl-spin').addEventListener('click', () => self.spin(body, bets[self.betIdx], inter));
      this._keyHandler = (e) => {
        if (e.code === 'Space' && UI.openKey === 'slots') { e.preventDefault(); self.spin(body, bets[self.betIdx], inter); }
      };
      window.addEventListener('keydown', this._keyHandler);
    },

    spin(body, bet, inter) {
      if (this.spinning) return;
      const cfg = (inter && inter.cfg) || {};
      const v = Economy.validateBet('slots', bet, cfg);
      if (!v.ok) {
        Sound.play('deny');
        const r = Utils.safe(body, '#sl-result');
        r.className = 'result lose';
        r.textContent = v.reason;
        return;
      }
      // multiplayer authoritative
      if(window.Network && Network.isOnline()){
        this.spinning=true;
        const tier=(cfg && cfg.tier)||'basic';
        const resEl=body.querySelector('#sl-result');
        resEl.className='result'; resEl.textContent='SPINNING... (server)';
        body.querySelector('#sl-spin').disabled=true;
        Sound.play('spinstart');
        World.spinSlotMachine(inter, 2.4);
        // dummy animation
        const strips=Utils.$$('.strip', body);
        const reels=Utils.$$('.reel', body);
        reels.forEach(r=>r.classList.remove('hit'));
        strips.forEach((strip,i)=>{
          strip.innerHTML='';
          for(let k=0;k<22;k++) strip.appendChild(Utils.el('div','sym', this.pick().ch));
          strip.style.transform='translateY(0px)';
        });
        const pending=(payload)=>{
          if(!payload || payload.game!=='slots') return;
          Bus.off('game:result_multi', pending);
          const data=payload;
          // animate to server picks
          const picks=data.picks.map(p=>({id:p.id,ch:p.ch}));
          const SPIN_ROWS=22;
          let finished=0;
          strips.forEach((strip,i)=>{
            // replace last element with server pick
            strip.innerHTML='';
            for(let k=0;k<SPIN_ROWS;k++) strip.appendChild(Utils.el('div','sym', this.pick().ch));
            strip.appendChild(Utils.el('div','sym', picks[i].ch));
            strip.style.transform='translateY(0px)';
            const dist=SPIN_ROWS*120;
            const dur=1400+i*520;
            const t0=performance.now();
            const step=(now)=>{
              const k=Utils.clamp((now-t0)/dur,0,1);
              const e=1-Math.pow(1-k,5);
              if(strip.isConnected!==false) strip.style.transform=`translateY(${-dist*e}px)`;
              if(k<1) requestAnimationFrame(step);
              else{
                Sound.play('reelstop'); finished++;
                if(finished===3){
                  // show server result
                  const net=data.net, payout=data.payout;
                  const mult=data.mult;
                  const kind=data.kind;
                  const resEl2=Utils.safe(body,'#sl-result');
                  const reels2=Utils.$$('.reel', body);
                  if(payout>0){
                    reels2.forEach(r=>r.classList.add('hit'));
                    resEl2.className='result '+(net>=0?'win':'push');
                    resEl2.textContent=`${kind} · +${Utils.fmt(payout)} монет (x${mult})${data.bonus?` + bonus ${Utils.fmt(data.bonus)}`:''}`;
                    const jackpot=picks[0].id==='seven'&&picks[1].id==='seven'&&picks[2].id==='seven';
                    if(jackpot||payout>=bet*6){ Sound.play(jackpot?'jackpot':'bigwin'); UI.bigWin(jackpot?'JACKPOT 777!':'BIG WIN!'); if(inter&&inter.node) World.winBurst(inter.node.position.clone().setY(2), Inventory.effectColor(),140); }
                    else { Sound.play('win'); UI.sparks(12, Inventory.effectColor()); }
                  } else { resEl2.className='result lose'; resEl2.textContent='NO WIN — попробуй ещё'; Sound.play('lose'); }
                  Utils.safe(body,'#sl-bal').textContent=Utils.fmt(State.coins);
                  Utils.safe(body,'#sl-spin').disabled=false;
                  UI.refreshHUD();
                  this.spinning=false;
                }
              }
            };
            requestAnimationFrame(step);
          });
        };
        Bus.on('game:result_multi', pending);
        // also timeout if no answer
        setTimeout(()=>{ if(this.spinning){ Bus.off('game:result_multi', pending); this.spinning=false; Utils.safe(body,'#sl-spin').disabled=false; const r=Utils.safe(body,'#sl-result'); r.className='result lose'; r.textContent='Server timeout — попробуй снова'; Sound.play('deny'); } }, 6000);
        Network.playSlots(tier, bet);
        return;
      }
      this.spinning = true;
      Economy.bet(bet, 'slots');
      Economy.countSpin();
      Sound.play('spinstart');
      World.spinSlotMachine(inter, 2.4);

      const res = this.applyLuck([this.pick(), this.pick(), this.pick()]);
      const strips = Utils.$$('.strip', body);
      const reels = Utils.$$('.reel', body);
      reels.forEach(r => r.classList.remove('hit'));
      const resEl = body.querySelector('#sl-result');
      resEl.className = 'result';
      resEl.textContent = 'SPINNING...';
      body.querySelector('#sl-spin').disabled = true;

      const SPIN_ROWS = 22;
      let finished = 0;
      const tickTimer = setInterval(() => Sound.play('tick'), 80);

      strips.forEach((strip, i) => {
        strip.innerHTML = '';
        for (let k = 0; k < SPIN_ROWS; k++) strip.appendChild(Utils.el('div', 'sym', this.pick().ch));
        strip.appendChild(Utils.el('div', 'sym', res[i].ch));
        strip.style.transform = 'translateY(0px)';
        const dist = SPIN_ROWS * ROW_H;
        const dur = 1400 + i * 520;
        const t0 = performance.now();
        const step = (now) => {
          const k = Utils.clamp((now - t0) / dur, 0, 1);
          const e = 1 - Math.pow(1 - k, 5);
          if (strip.isConnected !== false) strip.style.transform = `translateY(${-dist * e}px)`;
          if (k < 1) requestAnimationFrame(step);
          else {
            Sound.play('reelstop');
            finished++;
            if (finished === 3) { clearInterval(tickTimer); this.finish(body, bet, res, inter); }
          }
        };
        requestAnimationFrame(step);
      });
    },

    finish(body, bet, res, inter) {
      const table = this.table || this.tableFor(inter && inter.cfg);
      const evalRes = this.evaluate(res, table);
      const payout = Math.floor(bet * evalRes.mult);
      const resEl = Utils.safe(body, '#sl-result');
      const reels = Utils.$$('.reel', body);

      if (res[0].id === 'seven' && res[1].id === 'seven' && res[2].id === 'seven') {
        State.stats.jackpots++;
      }

      if (payout > 0) {
        reels.forEach(r => r.classList.add('hit'));
        const net = payout - bet;
        resEl.className = 'result ' + (net >= 0 ? 'win' : 'push');
        resEl.textContent = `${evalRes.kind} · +${Utils.fmt(payout)} монет (x${evalRes.mult})`;
        const jackpot = res[0].id === 'seven' && res[1].id === 'seven' && res[2].id === 'seven';
        if (jackpot || payout >= bet * 6) {
          Sound.play(jackpot ? 'jackpot' : 'bigwin');
          UI.bigWin(jackpot ? 'JACKPOT 777!' : 'BIG WIN!');
          if (inter && inter.node) World.winBurst(inter.node.position.clone().setY(2), Inventory.effectColor(), 140);
        } else {
          Sound.play('win');
          UI.sparks(12, Inventory.effectColor());
        }
      } else {
        resEl.className = 'result lose';
        resEl.textContent = 'NO WIN — попробуй ещё';
        Sound.play('lose');
      }

      Economy.settle('slots', bet, payout, { symbols: res.map(r => r.id), tier: (inter && inter.cfg && inter.cfg.tier) || 'basic' });
      Utils.safe(body, '#sl-bal').textContent = Utils.fmt(State.coins);
      Utils.safe(body, '#sl-spin').disabled = false;
      UI.refreshHUD();
      this.spinning = false;
    }
  };

  UI.registerPanel('slots', {
    title: (a) => (a && a.inter && a.inter.cfg && a.inter.cfg.name) || 'SLOT MACHINE',
    build: (body, args) => Slots.build(body, args),
    onClose: () => {
      if (Slots._keyHandler) window.removeEventListener('keydown', Slots._keyHandler);
      Slots._keyHandler = null;
      Slots.spinning = false;
    }
  });

  window.Slots = Slots;
})();
