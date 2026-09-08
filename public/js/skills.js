/* ============================================================
   skills.js — skill trees 3D / HTML / Games (XP based)
   ============================================================ */
(function(){
  'use strict';
  const TREES={
    '3d':[
      {id:'speed', name:'Скорость бега', icon:'🏃', desc:'+8% скорость за уровень', max:3, costs:[500,1200,2500], apply: lvl=>{ Player.walkSpeed=4.6*(1+lvl*0.08); Player.runSpeed=8.2*(1+lvl*0.08); }},
      {id:'jump', name:'Прыжок', icon:'🦘', desc:'+15% высота прыжка', max:2, costs:[800,1800], apply: lvl=>{ Player.jumpSpeed=5.6*(1+lvl*0.15); }},
    ],
    'html':[
      {id:'ui_speed', name:'Быстрый UI', icon:'⚡', desc:'Ускоряет анимации HUD', max:2, costs:[600,1500], apply: ()=>{}},
      {id:'theme_unlock', name:'Темы', icon:'🎨', desc:'Открывает темы интерфейса', max:1, costs:[1000], apply: lvl=>{ if(lvl) Inventory.owns('th_royal')||State.inventory.owned.push('th_royal'); }},
    ],
    'games':[
      {id:'game_luck', name:'Удача игрока', icon:'🎲', desc:'+4% шанс победы во всех играх', max:3, costs:[700,1400,2600], apply: ()=>{}},
      {id:'game_payout', name:'Кэшбэк', icon:'💎', desc:'+12% к выигрышу', max:2, costs:[1000,2200], apply: ()=>{}},
    ]
  };
  const Skills={
    TREES,
    get(id){
      if(!State.skills) State.skills={};
      return State.skills[id]||0;
    },
    canBuy(tree, id){
      const def=TREES[tree].find(s=>s.id===id);
      if(!def) return false;
      const lvl=this.get(id);
      if(lvl>=def.max) return false;
      return State.xp >= def.costs[lvl];
    },
    buy(tree, id){
      const def=TREES[tree].find(s=>s.id===id);
      if(!def) return false;
      const lvl=this.get(id);
      if(lvl>=def.max) return false;
      const cost=def.costs[lvl];
      if(State.xp < cost){ Sound.play('deny'); UI.toast({title:'НЕ ХВАТАЕТ XP', text:`Нужно ${cost}`, icon:'⭐', type:'red'}); return false; }
      State.xp-=cost;
      if(!State.skills) State.skills={};
      State.skills[id]=lvl+1;
      def.apply(lvl+1);
      Sound.play('unlock');
      UI.toast({title:'SKILL', text:`${def.name} → ${lvl+1}`, icon:def.icon, type:'gold'});
      Bus.emit('state:dirty');
      UI.refreshHUD();
      return true;
    },
    applyAll(){
      for(const tree in TREES){
        for(const s of TREES[tree]){
          const lvl=this.get(s.id);
          if(lvl) s.apply(lvl);
        }
      }
    }
  };
  window.Skills=Skills;
  Bus.on('save:loaded', ()=> Skills.applyAll());
  if(window.State) setTimeout(()=> Skills.applyAll(), 500);

  UI.registerPanel('skills', {
    title:()=>'SKILLS — 3D / HTML / GAMES',
    build(body){
      body.innerHTML='';
      body.appendChild(Utils.el('div','muted','Трать XP на скиллы. Скачать скиллы = изучить. Каждая ветка — 3D (движение), HTML (интерфейс), Games (игры).'));
      body.appendChild(Utils.el('div','muted',`XP: <b style="color:var(--gold)">${Utils.fmt(State.xp)}</b>`));
      for(const tree in TREES){
        body.appendChild(Utils.el('div','sect', tree.toUpperCase()));
        const grid=Utils.el('div','grid c3');
        for(const def of TREES[tree]){
          const lvl=Skills.get(def.id);
          const maxed=lvl>=def.max;
          const cost=def.costs[lvl]||0;
          const card=Utils.el('div','card'+(maxed?' done':''),`
            <div style="font-size:28px; text-align:center">${def.icon}</div>
            <h4>${def.name}</h4>
            <p>${def.desc}</p>
            <div class="muted">lvl ${lvl}/${def.max} — ${maxed?'MAX':cost+' XP'}</div>
          `);
          const btn=Utils.el('button','btn '+(maxed?'':'gold'), maxed?'ИЗУЧЕНО':`ИЗУЧИТЬ ${cost} XP`);
          btn.disabled=maxed || State.xp < cost;
          btn.onclick=()=>{ if(Skills.buy(tree, def.id)){ body.innerHTML=''; UI.panels['skills'].build(body); } };
          card.appendChild(btn);
          grid.appendChild(card);
        }
        body.appendChild(grid);
      }
    }
  });
  // add to save defaults
  if(window.Save){
    const origDefaults=Save.defaults;
    Save.defaults=function(){
      const d=origDefaults();
      d.skills={};
      return d;
    };
    const origSanitize=Save.sanitize;
    Save.sanitize=function(d){
      d=origSanitize(d);
      if(!d.skills) d.skills={};
      return d;
    };
  }
})();
