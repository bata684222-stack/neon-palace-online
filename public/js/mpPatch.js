/* ============================================================
   mpPatch.js — multiplayer overrides for mini-games, economy, story
   ============================================================ */
(function(){
  'use strict';

  function isOnline(){ return window.Network && Network.isOnline(); }
  function shakeCoins(kind){
    const el=document.getElementById('hud-coins') || document.getElementById('panel-coins');
    if(!el) return;
    el.classList.remove('shake','win-pulse');
    void el.offsetWidth;
    el.classList.add(kind==='win'?'win-pulse':'shake');
    setTimeout(()=> el.classList.remove('shake','win-pulse'), 600);
  }
  function optimisticSpend(bet){
    if(!isOnline() || !bet) return;
    State.coins=Math.max(0, (State.coins||0) - bet);
    UI.refreshHUD();
    shakeCoins('spend');
    Sound.play('bet');
  }

  // ---- ROULETTE ----
  if(window.Roulette){
    const origSpin=Roulette.spin.bind(Roulette);
    Roulette.spin=function(body, inter){
      if(!isOnline()) return origSpin(body, inter);
      if(this.spinning) return;
      const total=this.total();
      if(total<=0){ Sound.play('deny'); Utils.safe(body,'#rl-result').textContent='Сначала поставь чипы'; return; }
      const v=Economy.validateBet('roulette', total, (inter&&inter.cfg)||{});
      if(!v.ok){ Sound.play('deny'); const r=Utils.safe(body,'#rl-result'); r.className='result lose'; r.textContent=v.reason; return; }
      this.spinning=true;
      const bets=Object.assign({}, this.bets);
      Sound.play('roulette', {ticks:36});
      World.spinRouletteWheel(inter, 0, 2);
      const resEl=body.querySelector('#rl-result');
      resEl.className='result'; resEl.textContent='ШАР В ИГРЕ... (server)';
      body.querySelector('#rl-spin').disabled=true;
      const pending=(payload)=>{
        if(!payload||payload.game!=='roulette') return;
        Bus.off('game:result_multi', pending);
        const result=payload.result;
        // animate wheel to server result
        const WHEEL_ORDER=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
        const idx=WHEEL_ORDER.indexOf(result);
        const dur=4400, t0=performance.now();
        const step=Math.PI*2/37;
        const start=Roulette.wheelAngle;
        const target=start + Math.PI*2*5 - (idx*step+step/2) - start;
        const animate=(now)=>{
          const k=Utils.clamp((now-t0)/dur,0,1);
          const e=1-Math.pow(1-k,4);
          Roulette.wheelAngle=start+target*e;
          Roulette.ballAngle=-Roulette.wheelAngle*2.4 - Math.PI*6*(1-e);
          if(Roulette.ctx) Roulette.drawWheel(k>=1?result:null);
          if(k<1) requestAnimationFrame(animate);
          else{
            Roulette.spinning=false;
            Roulette.ballAngle=-Math.PI/2;
            Roulette.drawWheel(result);
            // show payout
            const payout=payload.payout, wins=payload.wins||[], net=payload.net;
            const REDS=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
            const isRed=REDS.includes(result);
            const colorName=result===0?'ZERO':(isRed?'RED':'BLACK');
            if(payout>0){
              const resEl2=Utils.safe(body,'#rl-result');
              resEl2.className='result '+(net>0?'win':'push');
              resEl2.innerHTML=`<div><div class="ball-num">${result}</div>${colorName} · ${(wins||[]).join(', ')}<br>+${Utils.fmt(payout)} монет${payload.bonus?` (bonus ${Utils.fmt(payload.bonus)})`:''}</div>`;
              if(payout>=total*8){ Sound.play('bigwin'); UI.bigWin('BIG WIN!'); if(inter&&inter.node) World.winBurst(inter.node.position.clone().setY(1.6), Inventory.effectColor(),120); } else { Sound.play('win'); UI.sparks(12, Inventory.effectColor()); }
            } else { const r=Utils.safe(body,'#rl-result'); r.className='result lose'; r.innerHTML=`<div><div class="ball-num">${result}</div>${colorName} · ставки не прошли</div>`; Sound.play('lose'); }
            Roulette.bets={};
            Roulette.refreshBets(body);
            Utils.safe(body,'#rl-spin').disabled=false;
            UI.refreshHUD();
          }
        };
        requestAnimationFrame(animate);
      };
      optimisticSpend(total);
      Bus.on('game:result_multi', pending);
      setTimeout(()=>{ if(Roulette.spinning){ Bus.off('game:result_multi', pending); Roulette.spinning=false; Utils.safe(body,'#rl-spin').disabled=false; const r=Utils.safe(body,'#rl-result'); r.className='result lose'; r.textContent='Server timeout'; Sound.play('deny'); } },6000);
      Network.playRoulette(bets);
    };
  }

  // ---- DICE ----
  if(window.Dice){
    const origRoll=Dice.roll.bind(Dice);
    Dice.roll=function(body, inter){
      if(!isOnline()) return origRoll(body, inter);
      if(this.rolling) return;
      const bet=(this.bets||[1])[this.betIdx];
      const resEl=Utils.safe(body,'#dc-result');
      const v=Economy.validateBet('dice', bet, this.cfg);
      if(!v.ok){ Sound.play('deny'); resEl.className='result lose'; resEl.textContent=v.reason; return; }
      this.rolling=true;
      const choice=this.choice;
      Sound.play('dice');
      World.rollWorldDice(inter, 1.6);
      const d1=body.querySelector('#dc-d1'), d2=body.querySelector('#dc-d2');
      d1.classList.add('rolling'); d2.classList.add('rolling');
      resEl.className='result'; resEl.textContent='БРОСОК... (server)';
      body.querySelector('#dc-roll').disabled=true;
      body.querySelector('#dc-sum').textContent='?';
      const flick=setInterval(()=>{ Dice.drawDie(d1, Utils.randInt(1,6)); Dice.drawDie(d2, Utils.randInt(1,6)); },90);
      const pending=(payload)=>{
        if(!payload||payload.game!=='dice') return;
        Bus.off('game:result_multi', pending);
        clearInterval(flick);
        d1.classList.remove('rolling'); d2.classList.remove('rolling');
        if(d1.isConnected!==false){ Dice.drawDie(d1, payload.a); Dice.drawDie(d2, payload.b); }
        Utils.safe(body,'#dc-sum').textContent=payload.sum;
        if(payload.won){
          resEl.className='result win';
          resEl.textContent=`${payload.a} + ${payload.b} = ${payload.sum} · ${choice} · +${Utils.fmt(payload.payout)} монет${payload.bonus?` bonus ${Utils.fmt(payload.bonus)}`:''}`;
          if(payload.payout>=bet*4){ Sound.play('bigwin'); UI.bigWin('BIG WIN!'); if(inter&&inter.node) World.winBurst(inter.node.position.clone().setY(1.4), Inventory.effectColor(),90); } else { Sound.play('win'); UI.sparks(12, Inventory.effectColor()); }
        } else { resEl.className='result lose'; resEl.textContent=`${payload.a} + ${payload.b} = ${payload.sum} · ставка не прошла`; Sound.play('lose'); }
        Utils.safe(body,'#dc-bal').textContent=Utils.fmt(State.coins);
        Utils.safe(body,'#dc-roll').disabled=false;
        this.rolling=false;
        UI.refreshHUD();
      };
      optimisticSpend(bet);
      Bus.on('game:result_multi', pending);
      setTimeout(()=>{ if(this.rolling){ Bus.off('game:result_multi', pending); clearInterval(flick); this.rolling=false; Utils.safe(body,'#dc-roll').disabled=false; resEl.className='result lose'; resEl.textContent='Server timeout'; } },6000);
      Network.playDice(choice, bet);
    };
  }

  // ---- COINFLIP ----
  if(window.CoinFlip){
    const origFlip=CoinFlip.flip.bind(CoinFlip);
    CoinFlip.flip=function(body, inter){
      if(!isOnline()) return origFlip(body, inter);
      if(this.flipping) return;
      const bet=(this.bets||[1])[this.betIdx];
      const resEl=Utils.safe(body,'#cf-result');
      const v=Economy.validateBet('coinflip', bet, this.cfg);
      if(!v.ok){ Sound.play('deny'); resEl.className='result lose'; resEl.textContent=v.reason; return; }
      this.flipping=true;
      Sound.play('flip');
      World.flipWorldCoin(2);
      const coin=body.querySelector('#cf-coin');
      resEl.className='result'; resEl.textContent='МОНЕТА В ВОЗДУХЕ... (server)';
      body.querySelector('#cf-flip').disabled=true;
      const side=this.side;
      const pending=(payload)=>{
        if(!payload||payload.game!=='coinflip') return;
        Bus.off('game:result_multi', pending);
        const result=payload.result;
        const won=payload.won;
        const spins=6+Utils.randInt(0,2);
        const endDeg=spins*360 + (result==='tails'?180:0);
        const dur=1800, t0=performance.now();
        const anim=(now)=>{
          const k=Utils.clamp((now-t0)/dur,0,1);
          const e=1-Math.pow(1-k,3);
          if(coin.isConnected!==false) coin.style.transform=`rotateY(${endDeg*e}deg) translateY(${-Math.sin(k*Math.PI)*60}px)`;
          if(k<1) requestAnimationFrame(anim);
          else{
            if(won){ this.streak++; resEl.className='result win'; resEl.textContent=`${result.toUpperCase()} — победа! +${Utils.fmt(payload.payout)} монет${payload.bonus?` bonus ${Utils.fmt(payload.bonus)}`:''}`; Sound.play('win'); UI.sparks(14, Inventory.effectColor()); if(this.streak>=5){ UI.bigWin('STREAK x'+this.streak); if(inter&&inter.node) World.winBurst(inter.node.position.clone().setY(2.5), Inventory.effectColor(),110); } }
            else{ this.streak=0; resEl.className='result lose'; resEl.textContent=`${result.toUpperCase()} — мимо`; Sound.play('lose'); }
            Utils.safe(body,'#cf-streak').textContent=this.streak;
            Utils.safe(body,'#cf-bal').textContent=Utils.fmt(State.coins);
            Utils.safe(body,'#cf-flip').disabled=false;
            this.flipping=false;
            UI.refreshHUD();
          }
        };
        requestAnimationFrame(anim);
      };
      optimisticSpend(bet);
      Bus.on('game:result_multi', pending);
      setTimeout(()=>{ if(this.flipping){ Bus.off('game:result_multi', pending); this.flipping=false; Utils.safe(body,'#cf-flip').disabled=false; resEl.textContent='Server timeout'; } },6000);
      Network.playCoinflip(side, bet);
    };
  }

  // ---- BLACKJACK ----
  if(window.Blackjack){
    const origDeal=Blackjack.deal.bind(Blackjack);
    Blackjack.deal=function(body){
      if(!isOnline()) return origDeal(body);
      if(this.stage==='play'||this.stage==='dealer') return;
      const bet=(this.bets||[100])[this.betIdx];
      const v=Economy.validateBet('blackjack', bet, this.cfg);
      if(!v.ok){ Sound.play('deny'); const r=Utils.safe(body,'#bj-result'); r.className='result lose'; r.textContent=v.reason; return; }
      this.bet=bet;
      this.player=[]; this.dealer=[]; this.hole=true; this.stage='play';
      const r=Utils.safe(body,'#bj-result'); r.className='result'; r.textContent='Раздача... (server)';
      body.querySelector('#bj-deal').disabled=true;
      const pending=(payload)=>{
        if(!payload||payload.game!=='blackjack') return;
        Bus.off('game:result_multi', pending);
        // payload has outcome, payout, playerHand, dealerHand
        this.player=payload.playerHand||[]; this.dealer=payload.dealerHand||[]; this.hole=false;
        this.stage='done';
        // render
        const dEl=body.querySelector('#bj-dealer'), pEl=body.querySelector('#bj-player');
        if(dEl&&pEl){
          dEl.innerHTML=''; pEl.innerHTML='';
          this.dealer.forEach(c=> dEl.appendChild(this.cardEl(c)));
          this.player.forEach(c=> pEl.appendChild(this.cardEl(c)));
          const pv=Blackjack.value(this.player), dv=Blackjack.value(this.dealer);
          body.querySelector('#bj-dscore').textContent=dv;
          body.querySelector('#bj-pscore').textContent=pv;
        }
        const payout=payload.payout, outcome=payload.outcome;
        const resEl=Utils.safe(body,'#bj-result');
        if(payout>bet){ resEl.className='result win'; resEl.textContent=(outcome==='bj'?'BLACKJACK! ':'ПОБЕДА ')+`+${Utils.fmt(payout)}${payload.bonus?` bonus ${Utils.fmt(payload.bonus)}`:''}`; Sound.play(outcome==='bj'?'bigwin':'win'); UI.sparks(12, Inventory.effectColor()); }
        else if(payout===bet){ resEl.className='result push'; resEl.textContent='PUSH — ставка возвращена'; Sound.play('win'); }
        else { resEl.className='result lose'; resEl.textContent='ПОРАЖЕНИЕ'; Sound.play('lose'); }
        body.querySelector('#bj-bal').textContent=Utils.fmt(State.coins);
        body.querySelector('#bj-deal').disabled=false;
        body.querySelector('#bj-hit').disabled=true;
        body.querySelector('#bj-stand').disabled=true;
        body.querySelector('#bj-double').disabled=true;
        UI.refreshHUD();
      };
      optimisticSpend(bet);
      Bus.on('game:result_multi', pending);
      setTimeout(()=>{ if(this.stage==='play'){ Bus.off('game:result_multi', pending); this.stage='bet'; body.querySelector('#bj-deal').disabled=false; const rr=Utils.safe(body,'#bj-result'); rr.textContent='Server timeout'; } },6000);
      Network.playBlackjack(bet, 'deal');
    };
    // disable hit/stand/double in online (server handles full hand)
    const oldHit=Blackjack.hit.bind(Blackjack);
    Blackjack.hit=function(body){
      if(isOnline()){ UI.toast({title:'BLACKJACK', text:'В онлайн режиме — только DEAL (сервер решает результат)', icon:'🃏'}); return; }
      return oldHit(body);
    };
    const oldStand=Blackjack.stand.bind(Blackjack);
    Blackjack.stand=function(body){
      if(isOnline()){ UI.toast({title:'BLACKJACK', text:'В онлайн режиме — только DEAL', icon:'🃏'}); return; }
      return oldStand(body);
    };
    const oldDouble=Blackjack.double.bind(Blackjack);
    Blackjack.double=function(body){
      if(isOnline()){ UI.toast({title:'BLACKJACK', text:'В онлайн режиме — только DEAL', icon:'🃏'}); return; }
      return oldDouble(body);
    };
  }

  // ---- SHOP / ITEMS ----
  // intercept shop buy when online to use tickets via server
  if(window.Shop){
    const origBuy=Shop.buy;
    Shop.buy=function(id){
      if(isOnline()){
        // try server first, but also fallback to local if item is cosmetic?
        // campaign items are via Tickets, not shop coins. Shop is cosmetics for coins (local). Keep local for shop.
        return origBuy.call(this, id);
      }
      return origBuy.call(this, id);
    };
  }
  if(window.Items){
    const origBuy=Items.buy;
    Items.buy=function(id){
      if(isOnline()){
        Network.buyItem(id);
        // optimistic UI will be updated via item:bought_multi
        // also validate locally quickly
        return false;
      }
      return origBuy.call(this, id);
    };
  }
  Bus.on('item:bought_multi', (p)=>{
    // server confirmed
    if(p.items) State.items.owned=p.items.slice();
    if(p.tickets!==undefined) State.tickets=p.tickets;
    UI.refreshHUD();
    UI.toast({title:'ITEM BOUGHT', text: p.itemId, icon:'🎁', type:'gold'});
    // rebuild prepare panel if open
    if(UI.openKey==='prepare') UI.rebuild();
  });

  // ---- STORY / CAR ready ----
  // patch Story.handle for car to use multiplayer ready system
  if(window.Story){
    const origHandle=Story.handle.bind(Story);
    Story.handle=function(it){
      if(isOnline() && it.key==='car'){
        const c=State.campaign;
        if(c.phase==='casino' || c.daysCompleted>=c.day){ Sound.play('deny'); return true; }
        // toggle ready
        const btnReady = Network.room && Network.you ? (Network.room.players.find(p=>p.id===Network.you.id)||{}).carReady : false;
        Network.carReady(!btnReady);
        UI.toast({title: !btnReady ? 'READY ✓' : 'NOT READY', text: !btnReady ? 'Ждём второго игрока...' : 'Снял готовность', icon:'🚗', time:3000});
        // show car ready UI
        Bus.emit('car:ready', {players: Network.room?Network.room.players.map(p=>({id:p.id, name:p.name, carReady: p.id===Network.you.id ? !btnReady : !!p.carReady})) : []});
        return true;
      }
      if(isOnline() && it.key==='bed'){
        const c=State.campaign;
        if(c.daysCompleted>=c.day || c.finished){
          // need both sleep ready
          const meReady=Network.room && Network.you ? (Network.room.players.find(p=>p.id===Network.you.id)||{}).sleepReady : false;
          Network.sleepReady(!meReady);
          UI.toast({title: !meReady?'READY TO SLEEP':'NOT READY', text:'Ждём второго игрока', icon:'🛏️'});
          return true;
        } else {
          Sound.play('deny');
          UI.toast({title:'РАНО СПАТЬ', text:'Сначала закрой квоту', icon:'⏰', type:'red'});
          return true;
        }
      }
      if(isOnline() && (it.key==='boss' || it.key==='bossTalk')){
        Network.bossInteract();
        return true;
      }
      return origHandle(it);
    };
    // multiplayer travel
    Story.travelToCasinoMulti=function(data){
      // reuse original cinematic but synchronized
      // For now just call original but ensure both start same time
      Story.travelToCasino();
    };
    Story.returnHomeMulti=function(){
      // call original returnHome logic but without day_complete trigger duplication
      // original returnHome expects data, we already have it
      // just trigger cinematic
      const mockData={day: State.campaign.day, quota: State.campaign.quota, earnings: State._teamEarnings||0, tickets:0, xp:0, final:false};
      Story.returnHome(mockData);
    };
    Story.dayFailedMulti=function(d){
      Game.setState('GAME_OVER');
      Game.enableControl(false);
      Cinematic.play('day_failed', [{dur:1.6, fade:'out', fadeDur:1.4, sub:'22:00. Касса закрывается.', on:()=>Sound.play('lose')}],
        ()=>{ UI.showHUD(false); UI.showGameOver(d, {onRetry:()=>{ Network.retryDay(); UI.showHUD(true); UI.fadeTo(0,600); // server will send day_retry
          }, onMenu:()=>{ UI.fadeTo(0,400); Bus.emit('game:toMenu'); Network.leaveRoom(); }});
        }, {skippable:false});
    };
    Story.finalCutsceneMulti=function(startAt){
      const delay=Math.max(0, startAt - Date.now());
      setTimeout(()=> Story.finalCutscene(), delay);
    };
    Bus.on('day:retry_multi', (d)=>{
      UI.hideStoryScreens();
      UI.showHUD(true);
      UI.fadeTo(0,600);
      Story.startMorning(true);
    });
    Bus.on('boss:result', (p)=>{
      if(!p.ok){
        if(p.reason==='short') UI.toast({title:'НЕ ХВАТАЕТ', text:`Не хватает ${Utils.fmt(p.missing||0)} монет (team)`, icon:'🕴️', type:'red', time:6000});
        else UI.toast({title:'ОФИС ЗАКРЫТ', text:p.reason||'Не готово', icon:'🔒', type:'red'});
        Sound.play('deny');
      } else {
        // success, wait for game_complete
        UI.toast({title:'QUOTA PAID', text:'Владелец принял квоту!', icon:'✅', type:'gold', time:5000});
      }
    });
  }

  // ---- DAYMANAGER overpay sync ----
  Bus.on('quota_update', (p)=>{
    if(isOnline() && p.quota) State.campaign.quota=p.quota;
  });

  // ---- UI.refreshCampaign team quota ----
  if(window.UI){
    const origRefresh=UI.refreshCampaign.bind(UI);
    UI.refreshCampaign=function(){
      if(isOnline() && Network.room){
        // call original then patch numbers
        origRefresh();
        const hud=document.getElementById('campaign-hud');
        if(!hud) return;
        const s=Network.room;
        const earnEl=document.getElementById('ch-earn');
        const quotaEl=document.getElementById('ch-quota');
        const fillEl=document.getElementById('ch-fill');
        const floorEl=document.getElementById('ch-floor');
        const statusEl=document.getElementById('ch-status');
        if(earnEl) earnEl.textContent=Utils.fmt(Math.max(0, s.teamEarnings||0));
        if(quotaEl) quotaEl.textContent=Utils.fmt(s.quota||0);
        if(fillEl){
          const prog=s.quota? Math.min(100, Math.max(0, s.teamEarnings/s.quota*100)):0;
          fillEl.style.width=prog+'%';
          const hudBox=document.getElementById('campaign-hud');
          if(hudBox){
            hudBox.classList.toggle('met', s.teamEarnings>=s.quota);
            hudBox.classList.toggle('danger', s.teamEarnings < s.quota && s.time>=720);
          }
        }
        if(floorEl) floorEl.textContent='FLOOR '+(s.floor||1)+' · TEAM';
        if(statusEl){
          const left=(s.quota||0) - Math.max(0, s.teamEarnings||0);
          const minsLeft=Math.max(0, 840 - (s.time||0));
          const atHome=s.phase!=='casino';
          if(atHome) statusEl.textContent='PREPARE → оба READY у машины';
          else if(s.teamEarnings>=s.quota) statusEl.textContent= s.day>=6 ? 'TEAM QUOTA — к владельцу на 3 этаж!' : 'TEAM QUOTA — в кассу!';
          else statusEl.textContent=`TEAM нужно ${Utils.fmt(left)} · ${Math.floor(minsLeft/60)}ч ${minsLeft%60}м`;
        }
        return;
      }
      return origRefresh();
    };
  }

  console.log('[mpPatch] multiplayer patches applied');
})();
