/* ============================================================
   playerManager.js — player creation & rate limiting
   ============================================================ */
'use strict';
const Validation = require('./validation');

class PlayerManager {
  constructor(){
    this.sockets=new Map(); // ws -> player
    this.players=new Map(); // id -> player
    this.rate=new Map(); // ws -> {count, reset}
  }

  createPlayer(ws, name){
    const id=Validation.genId('p');
    const player={
      id,
      name: Validation.sanitizeName(name||'Player'),
      ws,
      ready:false,
      coins: 8000,
      tickets:0,
      xp:0,
      level:1,
      items:[], // ['lucky_charm', ...]
      pos:{x:0,y:1.7,z:12},
      yaw:0,
      pitch:0,
      state:'idle', // idle | walk | run | jump
      dayEarnings:0,
      lastMove: {x:0,y:1.7,z:12, t: Date.now()},
      lastChat:0,
      msgCount:0,
      msgReset: Date.now()
    };
    this.sockets.set(ws, player);
    this.players.set(id, player);
    ws._playerId=id;
    return player;
  }

  getByWs(ws){ return this.sockets.get(ws); }
  getById(id){ return this.players.get(id); }

  removeByWs(ws){
    const p=this.sockets.get(ws);
    if(p){ this.players.delete(p.id); this.sockets.delete(ws); this.rate.delete(ws); }
    return p;
  }

  // simple token bucket: max 30 msgs/sec
  checkRate(ws){
    const now=Date.now();
    let rec=this.rate.get(ws);
    if(!rec){ rec={count:0, reset: now+1000}; this.rate.set(ws, rec); }
    if(now>rec.reset){ rec.count=0; rec.reset=now+1000; }
    rec.count++;
    return rec.count <= 40;
  }

  checkChatRate(ws){
    const now=Date.now();
    const p=this.getByWs(ws);
    if(!p) return false;
    if(now - p.lastChat < 700) return false;
    p.lastChat=now;
    return true;
  }
}

module.exports = PlayerManager;
