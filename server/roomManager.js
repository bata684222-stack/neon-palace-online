/* ============================================================
   roomManager.js — 2-player rooms, lobby, quick play
   ============================================================ */
'use strict';
const Validation = require('./validation');

class Room {
  constructor(code){
    this.code=code;
    this.players=[]; // {id, name, ws, ready, coins, tickets, items, xp, level, pos, yaw, pitch, state, dayEarnings, ...}
    this.maxPlayers=2;
    this.status='waiting'; // waiting | ready | playing | finished
    this.createdAt=Date.now();
    this.day=1;
    this.quota=5000;
    this.phase='home'; // home | casino | done
    this.time=0; // 0..840
    this.floor=1;
    this.floors=[1];
    this.teamEarnings=0;
    this.dayStartCoins={}; // playerId -> coins at day start
    this.counters={games:0, wins:0};
    this.history=[];
    this.prevEarnings=0;
    this.prevQuota=0;
    this.bossReady=false;
    this._clock=null;
    this._tickInterval=null;
    this.dayTimer=null;
  }

  isFull(){ return this.players.length>=this.maxPlayers; }
  isEmpty(){ return this.players.length===0; }
  hasPlayer(id){ return this.players.some(p=>p.id===id); }
  getPlayer(id){ return this.players.find(p=>p.id===id); }

  addPlayer(p){
    if(this.isFull()) return false;
    this.players.push(p);
    return true;
  }
  removePlayer(id){
    this.players=this.players.filter(p=>p.id!==id);
  }

  allReady(){
    return this.players.length===2 && this.players.every(p=>p.ready);
  }

  broadcast(msg, excludeId){
    const data=JSON.stringify(msg);
    for(const p of this.players){
      if(excludeId && p.id===excludeId) continue;
      try{ if(p.ws && p.ws.readyState===1) p.ws.send(data); }catch(e){}
    }
  }

  sendTo(id, msg){
    const p=this.getPlayer(id);
    if(!p) return;
    try{ if(p.ws.readyState===1) p.ws.send(JSON.stringify(msg)); }catch(e){}
  }

  getState(){
    return {
      code: this.code,
      status: this.status,
      day: this.day,
      quota: this.quota,
      phase: this.phase,
      time: this.time,
      floor: this.floor,
      floors: this.floors.slice(),
      teamEarnings: this.teamEarnings,
      bossReady: this.bossReady,
      players: this.players.map(p=>({
        id:p.id, name:p.name, ready:!!p.ready, coins:p.coins, tickets:p.tickets,
        level:p.level, xp:p.xp, items: p.items? p.items.slice():[],
        pos: p.pos, yaw:p.yaw, pitch:p.pitch, state:p.state||'idle',
        dayEarnings: p.dayEarnings||0
      }))
    };
  }

  // start campaign for both
  startGame(){
    this.status='playing';
    this.day=1;
    this.quota=Validation.DAYS[0].quota;
    this.phase='home';
    this.time=0;
    this.floor=1;
    this.floors=[1];
    this.teamEarnings=0;
    this.bossReady=false;
    this.prevEarnings=0;
    this.prevQuota=0;
    for(const p of this.players){
      p.dayEarnings=0;
      p.coins = Math.max(p.coins, Validation.DAYS[0].bank);
      this.dayStartCoins[p.id]=p.coins;
    }
    this.startClock();
  }

  startDay(){
    this.phase='casino';
    this.time=0;
    this.teamEarnings=0;
    this.bossReady=false;
    for(const p of this.players){
      p.dayEarnings=0;
      const d=Validation.DAYS[this.day-1];
      if(p.coins < d.bank){
        p.coins = d.bank;
      }
      this.dayStartCoins[p.id]=p.coins;
    }
  }

  // 1.15 sec per minute drift
  startClock(){
    this.stopClock();
    this._clock=0;
    // tick every 1150ms = 1 minute
    this._tickInterval=setInterval(()=>{
      if(this.phase!=='casino' || this.status!=='playing') return;
      this.time=Math.min(Validation.DAY_MINUTES, this.time+1);
      this.broadcast({type:'day_time', payload:{time:this.time, teamEarnings:this.teamEarnings, quota:this.quota}});
      if(this.time>=Validation.DAY_MINUTES){
        this.checkDayEnd('clock');
      }
    }, 1150);
  }
  stopClock(){
    if(this._tickInterval) clearInterval(this._tickInterval);
    this._tickInterval=null;
  }

  addTime(minutes){
    if(this.phase!=='casino') return;
    this.time=Math.min(Validation.DAY_MINUTES, this.time+minutes);
    this.broadcast({type:'day_time', payload:{time:this.time, teamEarnings:this.teamEarnings}});
    if(this.time>=Validation.DAY_MINUTES) this.checkDayEnd('clock');
  }

  recalcTeam(){
    let sum=0;
    for(const p of this.players){
      sum+= (p.dayEarnings||0);
    }
    this.teamEarnings=sum;
  }

  checkDayEnd(reason){
    if(this.phase!=='casino') return;
    if(this.teamEarnings >= this.quota){
      if(this.day>=6){
        this.bossReady=true;
        this.broadcast({type:'boss_ready', payload:{day:this.day, teamEarnings:this.teamEarnings, quota:this.quota}});
        // don't auto-complete day 6, wait for boss
        this.broadcast({type:'day_time', payload:{time:this.time, teamEarnings:this.teamEarnings, quota:this.quota, bossReady:true}});
      } else {
        this.completeDay(reason||'clock');
      }
    } else {
      this.failDay(reason||'clock');
    }
  }

  completeDay(reason){
    if(this.status!=='playing') return;
    const day=this.day;
    const quota=this.quota;
    const earnings=this.teamEarnings;
    const over=Math.max(0, earnings - quota);
    this.prevEarnings=earnings;
    this.prevQuota=quota;
    this.history.push({day,quota,earnings});
    // rewards per player
    const d=Validation.DAYS[day-1];
    for(const p of this.players){
      p.tickets=(p.tickets||0)+d.tickets;
      p.xp=(p.xp||0)+(300 + day*250);
      // simple level calc 400*1.15^(n-1)
      while(p.level < 30){
        const need=Math.round(400*Math.pow(1.15,p.level-1)/10)*10;
        if(p.xp >= need){ p.xp-=need; p.level++; } else break;
      }
      // deduct quota from total coins? In singleplayer Economy.spend quota. Team quota is virtual: deduct from each? We deduct from each player's balance proportionally? Easier: deduct quota from team but track individually.
      // For fairness: subtract quota/2 from each? But spec says quota is team, not per-player spend. We'll just keep coins as is (no deduction) and let next day bank ensure minimum.
      // Actually original: Economy.spend(quota) deducts from player's coins. For multiplayer, we should not double-deduct. We'll deduct team quota from summed? Simpler: no deduction, keep coins.
    }
    const final=this.day>=6;
    if(final){
      this.phase='done';
      this.status='finished';
      this.stopClock();
      this.broadcast({type:'day_complete', payload:{day, quota, earnings, over, tickets:d.tickets, final:true, nextQuota:0, unlockedFloors:[]}});
      // also game_complete after boss? Day6 complete triggers final cinematic via boss
    } else {
      const nextDay=day+1;
      const nextQuota=Validation.computeNextQuota(nextDay, earnings, quota);
      const prevFloors=this.floors.slice();
      this.day=nextDay;
      this.quota=nextQuota;
      this.phase='home';
      this.time=0;
      this.teamEarnings=0;
      this.bossReady=false;
      for(const p of this.players) p.dayEarnings=0;
      const nextDef=Validation.DAYS[nextDay-1];
      const unlocked=[];
      for(const f of nextDef.floors){ if(!this.floors.includes(f)){ this.floors.push(f); unlocked.push(f);} }
      if(unlocked.length) this.broadcast({type:'floor_unlocked', payload:{floors:this.floors.slice(), unlocked}});
      this.broadcast({type:'day_complete', payload:{day, quota, earnings, over, tickets:d.tickets, final:false, nextDay, nextQuota, unlockedFloors:unlocked}});
    }
  }

  failDay(reason){
    this.broadcast({type:'game_over', payload:{day:this.day, quota:this.quota, teamEarnings:this.teamEarnings, reason}});
  }

  retryDay(){
    this.phase='home';
    this.time=0;
    this.teamEarnings=0;
    this.bossReady=false;
    for(const p of this.players) p.dayEarnings=0;
    this.broadcast({type:'day_retry', payload:{day:this.day, quota:this.quota, floors:this.floors.slice()}});
  }

  // boss interaction: check team quota met
  tryBoss(){
    if(this.day<6) return {ok:false, reason:'not_final'};
    if(!this.bossReady && this.teamEarnings < this.quota) return {ok:false, reason:'short', missing: this.quota - this.teamEarnings};
    // succeed
    this.bossReady=true;
    // this will trigger completeDay via boss
    const day=this.day, quota=this.quota, earnings=this.teamEarnings, over=Math.max(0,earnings-quota);
    const d=Validation.DAYS[day-1];
    for(const p of this.players){
      p.tickets=(p.tickets||0)+d.tickets;
      p.xp=(p.xp||0)+(300+day*250);
    }
    this.phase='done';
    this.status='finished';
    this.history.push({day,quota,earnings});
    this.stopClock();
    this.broadcast({type:'boss_success', payload:{day, quota, earnings}});
    this.broadcast({type:'day_complete', payload:{day,quota,earnings,over,tickets:d.tickets, final:true}});
    this.broadcast({type:'game_complete', payload:{history:this.history, teamEarnings:earnings}});
    return {ok:true};
  }

  // cleanup when empty
  destroy(){
    this.stopClock();
    this.players=[];
  }
}

class RoomManager {
  constructor(){
    this.rooms=new Map(); // code -> Room
  }

  createRoom(){
    let code;
    let tries=0;
    do{ code=Validation.genRoomCode(); tries++; } while(this.rooms.has(code) && tries<20);
    const room=new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code){
    if(!code) return null;
    return this.rooms.get(code.toUpperCase())||null;
  }

  findQuickPlay(){
    for(const [code, room] of this.rooms){
      if(room.status==='waiting' && room.players.length===1) return room;
    }
    return null;
  }

  removeRoom(code){
    const r=this.rooms.get(code);
    if(r) r.destroy();
    this.rooms.delete(code);
  }

  cleanupEmpty(){
    for(const [code, room] of this.rooms){
      if(room.isEmpty()){
        const age=Date.now()-room.createdAt;
        if(age> 5*60*1000) this.removeRoom(code);
      }
    }
  }

  listInfo(){
    const out=[];
    for(const [code, r] of this.rooms) out.push({code, players:r.players.length, status:r.status, day:r.day});
    return out;
  }
}

module.exports = { Room, RoomManager };
