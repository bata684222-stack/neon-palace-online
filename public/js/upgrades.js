/* ============================================================
   upgrades.js — money/bet/chance upgrader (uses Tickets)
   ============================================================ */
(function(){
  'use strict';
  const CATALOG=[
    {id:'bet_boost', name:'BET LIMIT +20%', icon:'💰', desc:'Увеличивает лимит ставки на 20% за уровень (макс 3)', max:3, costs:[5,10,15], effect: lvl=>`+${lvl*20}% лимит`},
    {id:'luck_boost', name:'LUCK +5%', icon:'🍀', desc:'+5% шанс пары/победы в Slots/Coinflip за уровень (макс 3)', max:3, costs:[4,8,12], effect: lvl=>`+${lvl*5}% шанс`},
    {id:'payout_boost', name:'PAYOUT +10%', icon:'📈', desc:'+10% к чистому выигрышу за уровень (макс 3)', max:3, costs:[6,12,18], effect: lvl=>`+${lvl*10}% выплата`},
  ];
  const Upgrades={
    CATALOG,
    getLevel(id){
      if(!State.upgrades) State.upgrades={};
      return State.upgrades[id]||0;
    },
    canBuy(id){
      const def=CATALOG.find(c=>c.id===id);
      if(!def) return false;
      const lvl=this.getLevel(id);
      if(lvl>=def.max) return false;
      const cost=def.costs[lvl];
      return State.tickets>=cost;
    },
    buy(id){
      const def=CATALOG.find(c=>c.id===id);
      if(!def) return false;
      const lvl=this.getLevel(id);
      if(lvl>=def.max) { Sound.play('deny'); return false; }
      const cost=def.costs[lvl];
      if(State.tickets<cost){ Sound.play('deny'); UI.toast({title:'НЕ ХВАТАЕТ TICKETS', text:`Нужно ${cost} 🎟`, icon:'🎟️', type:'red'}); return false; }
      if(window.Network && Network.isOnline()){
        // try server — tickets are individual, but we can still handle locally and sync
        // for now handle locally and broadcast via tickets sync will happen via server item? Use custom message
        // fallback to local
      }
      State.tickets-=cost;
      State.upgrades[id]=lvl+1;
      Sound.play('unlock');
      UI.toast({title:'UPGRADE', text:`${def.name} → lvl ${lvl+1}`, icon:def.icon, type:'gold'});
      Bus.emit('upgrades:changed', {id, lvl:lvl+1});
      Bus.emit('state:dirty');
      UI.refreshHUD();
      return true;
    },
    betMult(){ return 1 + this.getLevel('bet_boost')*0.20; },
    luckBonus(){ return this.getLevel('luck_boost')*0.05; },
    payoutBonus(){ return this.getLevel('payout_boost')*0.10; },
    summary(){
      return CATALOG.map(c=>({id:c.id, lvl:this.getLevel(c.id), max:c.max, cost: c.costs[this.getLevel(c.id)]||0}) );
    }
  };
  // patch DayManager betLimit to include upgrades
  Bus.on('upgrades:changed', ()=>{});
  // hook into existing functions via mpPatch or direct override
  if(window.DayManager){
    const origBetLimit=DayManager.betLimit.bind(DayManager);
    DayManager.betLimit=function(game,cfg){
      const r=origBetLimit(game,cfg);
      const m=Upgrades.betMult();
      if(m!==1){
        r.max=Math.round(r.max*m);
        r.min=Math.round(r.min*m);
        if(r.min>r.max) r.min=r.max;
      }
      return r;
    };
  }
  window.Upgrades=Upgrades;

  // UI panel
  UI.registerPanel('upgrades', {
    title:()=>'UPGRADES',
    build(body){
      body.innerHTML='';
      body.appendChild(Utils.el('div','muted','Трать Tickets на постоянные улучшения (действуют всю кампанию, макс 3 уровня). В online — индивидуально, но общие деньги помогают команде.'));
      const grid=Utils.el('div','grid c3'); grid.style.marginTop='12px';
      CATALOG.forEach(def=>{
        const lvl=Upgrades.getLevel(def.id);
        const maxed=lvl>=def.max;
        const cost=def.costs[lvl]||0;
        const card=Utils.el('div','card'+(maxed?' done':''),`
          <div style="font-size:32px; text-align:center">${def.icon}</div>
          <h4>${def.name}</h4>
          <p>${def.desc}</p>
          <div class="muted">Уровень: <b>${lvl}/${def.max}</b> — ${def.effect(lvl)}</div>
          <div class="muted">След. цена: ${maxed?'MAX':cost+' 🎟'}</div>
        `);
        const btn=Utils.el('button','btn '+(maxed?'':'gold')+(Upgrades.canBuy(def.id)?'':'') , maxed?'MAXED':`BUY ${cost} 🎟`);
        btn.disabled=maxed || !Upgrades.canBuy(def.id);
        btn.addEventListener('click',()=>{ if(Upgrades.buy(def.id)){ body.innerHTML=''; UI.panels['upgrades'].build(body); } });
        card.appendChild(btn);
        grid.appendChild(card);
      });
      body.appendChild(grid);
      const sum=Utils.el('div','sect','ТЕКУЩИЕ БОНУСЫ');
      body.appendChild(sum);
      body.appendChild(Utils.el('div',null,`
        <div class="stat-line"><span>Bet Limit</span><span>+${(Upgrades.betMult()-1)*100 |0}%</span></div>
        <div class="stat-line"><span>Luck</span><span>+${Upgrades.luckBonus()*100 |0}%</span></div>
        <div class="stat-line"><span>Payout</span><span>+${Upgrades.payoutBonus()*100 |0}%</span></div>
      `));
    }
  });

  // integrate luck/payout into existing Items bonuses
  if(window.Items){
    const origLuck=Items.luckBonus ? Items.luckBonus.bind(Items) : ()=>0;
    Items.luckBonus=function(game){
      const base=origLuck(game);
      return base + Upgrades.luckBonus();
    };
    const origPayout=Items.payoutBonus ? Items.payoutBonus.bind(Items) : ()=>0;
    Items.payoutBonus=function(){
      const base=origPayout();
      return base + Upgrades.payoutBonus();
    };
  }
  // ensure State.upgrades exists on load
  Bus.on('save:loaded', ()=>{
    if(!State.upgrades) State.upgrades={};
  });
  if(window.State && !State.upgrades) State.upgrades={};

})();
