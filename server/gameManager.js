/* ============================================================
   gameManager.js — delegates game actions to validation
   ============================================================ */
'use strict';
const Validation = require('./validation');

const GameManager = {
  // called when client requests play_slots etc
  playSlots(room, player, data){
    const tier=(data && data.tier)||'basic';
    const bet=Math.floor(Number(data && data.bet)||0);
    const hasVip = player.items.includes('vip_pass');
    const luck = player.items.includes('lucky_charm') ? 0.05 : 0;
    // validate
    const cfg={tier, minBet: tier==='vip'?2000: tier==='advanced'?500:100 };
    const v=Validation.validateBet({...player, day: room.day}, 'slots', bet, cfg);
    if(!v.ok) return {ok:false, reason: v.reason};
    if(bet > player.coins) return {ok:false, reason:'НЕ ХВАТАЕТ МОНЕТ'};
    // deduct
    player.coins -= bet;
    player.coins = Math.max(0, player.coins);
    // RNG
    const res=Validation.slotsResult(tier, luck);
    let payout=Math.floor(bet * res.mult);
    // house promo + item bonus
    const promo = (Validation.PROMO.slots||0) + (Validation.FLOOR_PROMO[room.floor]||0);
    let bonus=Math.round(bet*promo);
    const rawNet = payout - bet;
    // coin magnet +8%
    const hasMagnet=player.items.includes('coin_magnet');
    if(rawNet>0 && hasMagnet) bonus+=Math.round(rawNet*0.08);
    // safety card handled elsewhere? For slots, if loss and has safety, refund 50% once per day
    let safety=0;
    if(rawNet<0 && player.items.includes('safety_card') && !room[`safety_${player.id}`]){
      safety=Math.round(bet*0.5);
      room[`safety_${player.id}`]=true;
    }
    payout += bonus + safety;
    const net = payout - bet;
    if(payout>0) player.coins += payout;
    // update earnings
    player.dayEarnings = (player.dayEarnings||0) + net;
    room.recalcTeam();
    // time cost
    const cost = room.floor===3?30: (Validation.TIME_COST.slots||10);
    room.addTime(cost);
    // check if team met quota after this win
    if(room.phase==='casino' && room.teamEarnings >= room.quota){
      // delay check to allow broadcast first
      setTimeout(()=> room.checkDayEnd('quota'), 800);
    }
    return {
      ok:true, game:'slots',
      bet, payout, net, bonus, safety,
      picks: res.picks.map(s=>({id:s.id,ch:s.ch})),
      mult: res.mult, kind: res.kind,
      coins: player.coins, dayEarnings: player.dayEarnings, teamEarnings: room.teamEarnings,
      time: room.time
    };
  },

  playRoulette(room, player, data){
    const bets=data && data.bets || {};
    const total=Object.values(bets).reduce((s,v)=>s+ (+v||0),0);
    if(total<=0) return {ok:false, reason:'Сделай ставку'};
    const v=Validation.validateBet({...player, day: room.day}, 'roulette', total, {});
    if(!v.ok) return {ok:false, reason: v.reason};
    if(total > player.coins) return {ok:false, reason:'НЕ ХВАТАЕТ МОНЕТ'};
    player.coins -= total;
    const res=Validation.rouletteResult(bets);
    let payout=res.payout;
    const promo=(Validation.PROMO.roulette||0)+(Validation.FLOOR_PROMO[room.floor]||0);
    let bonus=Math.round(total*promo);
    const rawNet=payout - total;
    const hasMagnet=player.items.includes('coin_magnet');
    if(rawNet>0 && hasMagnet) bonus+=Math.round(rawNet*0.08);
    let safety=0;
    if(rawNet<0 && player.items.includes('safety_card') && !room[`safety_${player.id}`]){
      safety=Math.round(total*0.5); room[`safety_${player.id}`]=true;
    }
    payout+=bonus+safety;
    const net=payout-total;
    if(payout>0) player.coins+=payout;
    player.dayEarnings=(player.dayEarnings||0)+net;
    room.recalcTeam();
    const cost=room.floor===3?30:Validation.TIME_COST.roulette;
    room.addTime(cost);
    if(room.phase==='casino' && room.teamEarnings>=room.quota) setTimeout(()=>room.checkDayEnd('quota'),800);
    return {ok:true, game:'roulette', bet:total, payout, net, bonus, safety, result:res.n, wins:res.wins, coins:player.coins, dayEarnings:player.dayEarnings, teamEarnings:room.teamEarnings, time:room.time};
  },

  playDice(room, player, data){
    const bet=Math.floor(Number(data&&data.bet)||0);
    const choice=(data&&data.choice)||'under';
    const diceBonus=player.items.includes('lucky_dice')?0.10:0;
    const v=Validation.validateBet({...player, day: room.day}, 'dice', bet, {});
    if(!v.ok) return {ok:false, reason:v.reason};
    if(bet>player.coins) return {ok:false, reason:'НЕ ХВАТАЕТ МОНЕТ'};
    player.coins-=bet;
    const res=Validation.diceResult(choice, bet, diceBonus);
    let payout=res.payout;
    const promo=(Validation.PROMO.dice||0)+(Validation.FLOOR_PROMO[room.floor]||0);
    let bonus=Math.round(bet*promo);
    const rawNet=payout-bet;
    const hasMagnet=player.items.includes('coin_magnet');
    if(rawNet>0&&hasMagnet) bonus+=Math.round(rawNet*0.08);
    let safety=0;
    if(rawNet<0 && player.items.includes('safety_card') && !room[`safety_${player.id}`]){ safety=Math.round(bet*0.5); room[`safety_${player.id}`]=true; }
    payout+=bonus+safety;
    const net=payout-bet;
    if(payout>0) player.coins+=payout;
    player.dayEarnings=(player.dayEarnings||0)+net;
    room.recalcTeam();
    const cost=room.floor===3?30:Validation.TIME_COST.dice;
    room.addTime(cost);
    if(room.phase==='casino' && room.teamEarnings>=room.quota) setTimeout(()=>room.checkDayEnd('quota'),800);
    return {ok:true, game:'dice', bet, payout, net, bonus, safety, a:res.a, b:res.b, sum:res.sum, mult:res.mult, won:res.won, coins:player.coins, dayEarnings:player.dayEarnings, teamEarnings:room.teamEarnings, time:room.time};
  },

  playCoinflip(room, player, data){
    const bet=Math.floor(Number(data&&data.bet)||0);
    const pick=(data&&data.pick)||'heads';
    const luck=player.items.includes('lucky_charm')?0.05:0;
    const v=Validation.validateBet({...player, day: room.day}, 'coinflip', bet, {});
    if(!v.ok) return {ok:false, reason:v.reason};
    if(bet>player.coins) return {ok:false, reason:'НЕ ХВАТАЕТ МОНЕТ'};
    player.coins-=bet;
    const res=Validation.coinflipResult(pick, luck);
    const MULT=1.95;
    let payout=res.won? Math.floor(bet*MULT):0;
    const promo=(Validation.PROMO.coinflip||0)+(Validation.FLOOR_PROMO[room.floor]||0);
    let bonus=Math.round(bet*promo);
    const rawNet=payout-bet;
    const hasMagnet=player.items.includes('coin_magnet');
    if(rawNet>0&&hasMagnet) bonus+=Math.round(rawNet*0.08);
    let safety=0;
    if(rawNet<0 && player.items.includes('safety_card') && !room[`safety_${player.id}`]){ safety=Math.round(bet*0.5); room[`safety_${player.id}`]=true; }
    payout+=bonus+safety;
    const net=payout-bet;
    if(payout>0) player.coins+=payout;
    player.dayEarnings=(player.dayEarnings||0)+net;
    room.recalcTeam();
    const cost=room.floor===3?30:Validation.TIME_COST.coinflip;
    room.addTime(cost);
    if(room.phase==='casino' && room.teamEarnings>=room.quota) setTimeout(()=>room.checkDayEnd('quota'),800);
    return {ok:true, game:'coinflip', bet, payout, net, bonus, safety, result:res.result, won:res.won, coins:player.coins, dayEarnings:player.dayEarnings, teamEarnings:room.teamEarnings, time:room.time};
  },

  playBlackjack(room, player, data){
    // simplified: server just decides outcome randomly weighted to be slightly player-favorable due to promo? Keep simple: 42% win, 8% push, 50% lose, blackjack 5%
    const bet=Math.floor(Number(data&&data.bet)||0);
    const action=(data&&data.action)||'deal'; // deal|hit|stand|double - we simplify to single deal resolution
    const v=Validation.validateBet({...player, day: room.day}, 'blackjack', bet, {});
    if(!v.ok) return {ok:false, reason:v.reason};
    if(bet>player.coins) return {ok:false, reason:'НЕ ХВАТАЕТ МОНЕТ'};
    // For simplicity, each play_blackjack request is a full hand (like slots). Client will still show animations but server decides final outcome.
    player.coins -= bet;
    let outcome='lose', payout=0;
    const r=Math.random();
    if(r<0.05){ outcome='bj'; payout=Math.floor(bet*2.5); }
    else if(r<0.42){ outcome='win'; payout=bet*2; }
    else if(r<0.50){ outcome='push'; payout=bet; }
    else { outcome='lose'; payout=0; }
    // lucky charm small nudge: 5% to turn lose into push
    if(outcome==='lose' && player.items.includes('lucky_charm') && Math.random()<0.05){ outcome='push'; payout=bet; }
    const promo=(Validation.PROMO.blackjack||0)+(Validation.FLOOR_PROMO[room.floor]||0);
    let bonus=Math.round(bet*promo);
    const rawNet=payout-bet;
    const hasMagnet=player.items.includes('coin_magnet');
    if(rawNet>0&&hasMagnet) bonus+=Math.round(rawNet*0.08);
    let safety=0;
    if(rawNet<0 && player.items.includes('safety_card') && !room[`safety_${player.id}`]){ safety=Math.round(bet*0.5); room[`safety_${player.id}`]=true; }
    payout+=bonus+safety;
    const net=payout-bet;
    if(payout>0) player.coins+=payout;
    player.dayEarnings=(player.dayEarnings||0)+net;
    room.recalcTeam();
    const cost=room.floor===3?30:Validation.TIME_COST.blackjack;
    room.addTime(cost);
    if(room.phase==='casino' && room.teamEarnings>=room.quota) setTimeout(()=>room.checkDayEnd('quota'),800);
    // generate fake hands for display
    const mkCard=()=>{ const ranks=['A','2','3','4','5','6','7','8','9','10','J','Q','K']; const suits=['♠','♥','♦','♣']; return {r: ranks[Math.floor(Math.random()*ranks.length)], s: suits[Math.floor(Math.random()*suits.length)]}; };
    let playerHand=[mkCard(), mkCard()], dealerHand=[mkCard(), mkCard()];
    if(outcome==='bj') playerHand=[{r:'A',s:'♠'},{r:'K',s:'♥'}];
    return {ok:true, game:'blackjack', bet, payout, net, bonus, safety, outcome, playerHand, dealerHand, coins:player.coins, dayEarnings:player.dayEarnings, teamEarnings:room.teamEarnings, time:room.time};
  }
};

module.exports = GameManager;
