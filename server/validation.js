/* ============================================================
   validation.js — server-authoritative validation & game logic
   ============================================================ */
'use strict';

const DAYS = [
  { day: 1, quota: 5000, max: 5000, cap: 2000, bank: 8000, tickets: 3, floors: [1] },
  { day: 2, quota: 15000, max: 30000, cap: 6000, bank: 24000, tickets: 4, floors: [1, 2] },
  { day: 3, quota: 40000, max: 80000, cap: 16000, bank: 64000, tickets: 5, floors: [1, 2] },
  { day: 4, quota: 100000, max: 200000, cap: 40000, bank: 160000, tickets: 6, floors: [1, 2, 3] },
  { day: 5, quota: 250000, max: 450000, cap: 100000, bank: 400000, tickets: 8, floors: [1, 2, 3] },
  { day: 6, quota: 600000, max: 1000000, cap: 240000, bank: 900000, tickets: 10, floors: [1, 2, 3] }
];
const OVER_MULT = 1.5;
const DAY_MINUTES = 840;
const TIME_COST = { slots: 10, roulette: 20, blackjack: 25, dice: 15, coinflip: 5 };
const PROMO = { slots: 0, roulette: 0.20, blackjack: 0.18, dice: 0.05, coinflip: 0.15 };
const FLOOR_PROMO = { 1: 0, 2: 0.02, 3: 0.04 };
const CAP_SHARE = { slots: 1, roulette: 1, blackjack: 1, dice: 0.6, coinflip: 0.2 };
const BJ_MIN = [100, 250, 500, 1000, 2500, 5000];

const SLOT_SYMS = [
  { id: 'cherry', w: 28 }, { id: 'lemon', w: 24 }, { id: 'orange', w: 18 },
  { id: 'star', w: 14 }, { id: 'diamond', w: 10 }, { id: 'seven', w: 6 }
];
const PAYTABLES = {
  basic: { three: { cherry: 8, lemon: 8, orange: 10, star: 10, diamond: 10, seven: 10 }, pair: { cherry: 1.65, lemon: 1.65, orange: 1.75, star: 1.85, diamond: 2.25, seven: 2.65 } },
  advanced: { three: { cherry: 4, lemon: 5, orange: 6, star: 6, diamond: 6, seven: 6 }, pair: { cherry: 1.9, lemon: 2.0, orange: 2.1, star: 2.3, diamond: 2.7, seven: 3.0 } },
  vip: { three: { cherry: 3, lemon: 4, orange: 5, star: 5, diamond: 5, seven: 5 }, pair: { cherry: 2.0, lemon: 2.1, orange: 2.2, star: 2.4, diamond: 2.8, seven: 3.2 } }
};

function clamp(v,a,b){ return Math.min(b, Math.max(a,v)); }
function randInt(a,b){ return Math.floor(a + Math.random()*(b-a+1)); }
function weighted(list){
  let total=0; for(const it of list) total+=it.w;
  let r=Math.random()*total;
  for(const it of list){ r-=it.w; if(r<=0) return it.v; }
  return list[list.length-1].v;
}
function sanitizeName(s){
  if(typeof s!=='string') return 'Player';
  s=s.trim().slice(0,16).replace(/[<>]/g,'');
  if(!s) return 'Player';
  return s;
}
function genId(prefix){ return prefix + '_' + Math.random().toString(36).slice(2,7) + Math.random().toString(36).slice(2,4); }
function genRoomCode(){
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c=''; for(let i=0;i<6;i++) c+=chars[randInt(0,chars.length-1)];
  return c;
}

const Validation = {
  DAYS, OVER_MULT, DAY_MINUTES, TIME_COST, PROMO, FLOOR_PROMO, CAP_SHARE, BJ_MIN, PAYTABLES, SLOT_SYMS,
  clamp, randInt, weighted, sanitizeName, genId, genRoomCode,

  betLimit(day, game, cfg, hasVipPass){
    const d = DAYS[clamp(day-1,0,5)];
    let cap = Math.round(d.cap * (CAP_SHARE[game]==null?1:CAP_SHARE[game]));
    if(hasVipPass) cap = Math.round(cap*1.15);
    if(cfg && cfg.capMult) cap = Math.round(cap*cfg.capMult);
    let min=1;
    if(game==='slots'){
      const TIER_MIN={basic:100, advanced:500, vip:2000};
      min=(cfg&&cfg.minBet)||(cfg&&TIER_MIN[cfg.tier])||100;
    }
    if(game==='blackjack') min=BJ_MIN[clamp(day-1,0,5)];
    if(game==='roulette') min=100;
    if(min>cap) min=cap;
    return {min, max: Math.max(min,cap)};
  },

  validateBet(player, game, amount, cfg){
    amount=Math.floor(Number(amount));
    if(!isFinite(amount)||amount<=0) return {ok:false, reason:'Ставка должна быть больше 0'};
    const lim = this.betLimit(player.day || 1, game, cfg, player.items && player.items.includes('vip_pass'));
    if(amount < lim.min) return {ok:false, reason:'Минимальная ставка: '+lim.min};
    if(amount > lim.max) return {ok:false, reason:'Лимит стола: '+lim.max};
    if(amount > player.coins) return {ok:false, reason:'НЕ ХВАТАЕТ МОНЕТ'};
    return {ok:true, amount, lim};
  },

  // ---- game RNG (server authoritative) ----
  slotsResult(tier='basic', luckBonus=0){
    const picks=[weighted(SLOT_SYMS.map(s=>({v:s,w:s.w}))), weighted(SLOT_SYMS.map(s=>({v:s,w:s.w}))), weighted(SLOT_SYMS.map(s=>({v:s,w:s.w})))];
    // lucky charm: small chance to force pair
    if(luckBonus>0 && Math.random()<luckBonus){
      picks[1]=picks[0];
    }
    const table = PAYTABLES[tier]||PAYTABLES.basic;
    let mult=0, kind='NO WIN';
    const [a,b,c]=picks;
    if(a.id===b.id && b.id===c.id){ mult=table.three[a.id]; kind=a.id==='seven'?'JACKPOT 7-7-7!':'THREE '+a.id; }
    else if(a.id===b.id||b.id===c.id||a.id===c.id){ const sym=a.id===b.id?a:(b.id===c.id?b:a); mult=table.pair[sym.id]; kind='PAIR '+sym.id; }
    return { picks, mult, kind, tier };
  },

  rouletteResult(bets){
    const n=randInt(0,36);
    const REDS=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    const isRed=x=>REDS.includes(x);
    const OUTSIDE={
      red: {mult:2, test:x=>x!==0&&isRed(x)}, black:{mult:2,test:x=>x!==0&&!isRed(x)},
      even:{mult:2,test:x=>x!==0&&x%2===0}, odd:{mult:2,test:x=>x%2===1},
      low:{mult:2,test:x=>x>=1&&x<=18}, high:{mult:2,test:x=>x>=19},
      d1:{mult:3,test:x=>x>=1&&x<=12}, d2:{mult:3,test:x=>x>=13&&x<=24}, d3:{mult:3,test:x=>x>=25&&x<=36}
    };
    let payout=0, wins=[];
    for(const k in bets){
      const amt=bets[k];
      if(k.startsWith('n:')){ if(+k.slice(2)===n){ payout+=amt*36; wins.push(`Number ${n} x36`);} }
      else if(OUTSIDE[k]&&OUTSIDE[k].test(n)){ payout+=amt*OUTSIDE[k].mult; wins.push(`${k} x${OUTSIDE[k].mult}`); }
    }
    return { n, payout, wins, isRed: isRed(n) };
  },

  diceResult(choice='under', bet=100, diceBonus=0){
    const a=randInt(1,6), b=randInt(1,6), sum=a+b;
    const CHOICES={
      low:{p:10/36,test:s=>s<=5}, under:{p:15/36,test:s=>s<=6}, seven:{p:6/36,test:s=>s===7},
      over:{p:15/36,test:s=>s>=8}, high:{p:10/36,test:s=>s>=9}
    };
    const c=CHOICES[choice]||CHOICES.under;
    const won=c.test(sum);
    const baseMult= (1/c.p)*1.22*(1+diceBonus);
    const mult=Math.round(baseMult*100)/100;
    const payout=won?Math.floor(bet*mult):0;
    return {a,b,sum,won,payout,mult,choice};
  },

  coinflipResult(pick='heads', luckBonus=0){
    let result=Math.random()<0.5?'heads':'tails';
    if(result!==pick && Math.random()<luckBonus) result=pick;
    return { result, won: result===pick };
  },

  // blackjack helpers
  BJ_SUITS:[{s:'♠',r:false},{s:'♥',r:true},{s:'♦',r:true},{s:'♣',r:false}],
  BJ_RANKS:['A','2','3','4','5','6','7','8','9','10','J','Q','K'],
  bjValue(hand){
    let total=0, aces=0;
    for(const c of hand){
      if(c.r==='A'){aces++; total+=11;}
      else if(['10','J','Q','K'].includes(c.r)) total+=10;
      else total+=+c.r;
    }
    while(total>21&&aces>0){total-=10;aces--;}
    return total;
  },

  // movement check: max speed 9 m/s, tick 15Hz => max ~0.6m per packet + margin
  isMoveValid(prev, next, dtSec){
    if(!prev) return true;
    const dx=next.x-prev.x, dz=next.z-prev.z, dy=(next.y||0)-(prev.y||0);
    const dist=Math.hypot(dx,dz,dy);
    const maxDist = 10 * Math.max(0.05, dtSec) + 2.5; // generous + jump
    return dist <= maxDist;
  },

  computeNextQuota(nextDay, prevEarnings, prevQuota){
    const base = DAYS[clamp(nextDay-1,0,5)].quota;
    const cap = DAYS[clamp(nextDay-1,0,5)].max;
    const over=Math.max(0, prevEarnings - prevQuota);
    const q=Math.round(base + over*OVER_MULT);
    return Math.min(q, cap);
  }
};

module.exports = Validation;
