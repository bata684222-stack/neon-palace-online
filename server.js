/* ============================================================
   server.js — authoritative Node+Express+ws for 2-player co-op
   Serves frontend and handles all game logic
   ============================================================ */
'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const Validation = require('./server/validation');
const { RoomManager } = require('./server/roomManager');
const PlayerManager = require('./server/playerManager');
const GameManager = require('./server/gameManager');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const app = express();

// determine public dir: if ./public exists use it, else use root (where index.html lives)
const publicDir = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
console.log('[Server] public dir:', publicDir);

app.use(express.static(publicDir, { maxAge: 0 }));

// also serve /js, /vendor, /style.css correctly if publicDir is root already
app.get('/health', (req,res)=> res.json({status:'ok', rooms: roomManager.listInfo()}));

// fallback to index.html for SPA (but keep file serving)
app.get('*', (req,res)=>{
  const idx = path.join(publicDir, 'index.html');
  if(fs.existsSync(idx)) res.sendFile(idx);
  else res.status(404).send('Not found');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const roomManager = new RoomManager();
const playerManager = new PlayerManager();

// helper send
function send(ws, type, payload){
  if(ws.readyState!==1) return;
  ws.send(JSON.stringify({type, payload}));
}
function sendError(ws, msg){
  send(ws, 'error', {message: msg});
}

// periodic cleanup
setInterval(()=> roomManager.cleanupEmpty(), 60*1000);

// broadcast room state helper
function broadcastRoom(room){
  const state=room.getState();
  room.broadcast({type:'room_state', payload: state});
}

wss.on('connection', (ws, req)=>{
  console.log('[WS] new connection', req.socket.remoteAddress);
  let player=null;
  let room=null;

  // rate limit raw
  ws.on('message', (raw)=>{
    let msg;
    try{ msg=JSON.parse(raw); } catch(e){ return sendError(ws,'Invalid JSON'); }
    const type=msg.type;
    const payload=msg.payload||{};
    // global rate
    if(!playerManager.checkRate(ws)){
      return send(ws,'error',{message:'Rate limit'});
    }
    try{
      switch(type){
        case 'create_room':{
          const name=Validation.sanitizeName(payload.name||'Player');
          if(player) {
            // already has player, reuse?
          } else {
            player=playerManager.createPlayer(ws, name);
          }
          player.name=name;
          room=roomManager.createRoom();
          room.addPlayer(player);
          ws._roomCode=room.code;
          console.log(`[Room] ${room.code} created by ${player.name} ${player.id}`);
          send(ws,'room_joined',{room: room.getState(), you: {id: player.id, name: player.name}});
          break;
        }
        case 'join_room':{
          const code=(payload.code||'').toString().trim().toUpperCase();
          const name=Validation.sanitizeName(payload.name||'Player');
          if(!code) return sendError(ws,'ROOM NOT FOUND');
          const r=roomManager.getRoom(code);
          if(!r) return sendError(ws,'ROOM NOT FOUND');
          if(r.isFull()) return sendError(ws,'ROOM FULL');
          if(r.status==='finished') return sendError(ws,'GAME ALREADY FINISHED');
          if(!player) player=playerManager.createPlayer(ws, name);
          player.name=name;
          room=r;
          r.addPlayer(player);
          ws._roomCode=r.code;
          console.log(`[Room] ${player.name} joined ${r.code}`);
          // notify all
          broadcastRoom(r);
          send(ws,'room_joined',{room: r.getState(), you:{id:player.id,name:player.name}});
          // inform other
          r.broadcast({type:'player_joined', payload:{id:player.id, name:player.name, room: r.getState()}}, player.id);
          break;
        }
        case 'quick_play':{
          const name=Validation.sanitizeName(payload.name||'Player');
          if(!player) player=playerManager.createPlayer(ws, name);
          player.name=name;
          let r=roomManager.findQuickPlay();
          if(r){
            room=r;
            r.addPlayer(player);
            ws._roomCode=r.code;
            console.log(`[QuickPlay] ${player.name} joined existing ${r.code}`);
            broadcastRoom(r);
            send(ws,'room_joined',{room:r.getState(), you:{id:player.id,name:player.name}});
            r.broadcast({type:'player_joined', payload:{id:player.id,name:player.name, room:r.getState()}}, player.id);
          } else {
            room=roomManager.createRoom();
            room.addPlayer(player);
            ws._roomCode=room.code;
            console.log(`[QuickPlay] ${player.name} created ${room.code} (waiting)`);
            send(ws,'room_joined',{room:room.getState(), you:{id:player.id,name:player.name}});
          }
          break;
        }
        case 'set_ready':{
          if(!room||!player) return sendError(ws,'Not in room');
          const ready=!!payload.ready;
          player.ready=ready;
          console.log(`[Ready] ${player.name} ${ready} in ${room.code}`);
          room.broadcast({type:'player_ready', payload:{id:player.id, ready, room: room.getState()}});
          break;
        }
        case 'start_game':{
          if(!room||!player) return sendError(ws,'Not in room');
          if(room.players.length!==2) return sendError(ws,'Need 2 players');
          if(!room.allReady()) return sendError(ws,'Both players must be READY');
          if(room.status==='playing') return;
          room.startGame();
          console.log(`[Game] start ${room.code} day ${room.day}`);
          room.broadcast({type:'game_start', payload: room.getState()});
          // also send day_start
          room.broadcast({type:'day_start', payload:{day:room.day, quota:room.quota, phase:room.phase, floors:room.floors.slice()}});
          break;
        }
        case 'player_update':{
          if(!room||!player) return;
          const {x,y,z,yaw,pitch,state}=payload;
          // validation
          if(typeof x!=='number'||typeof z!=='number') return;
          if(Math.abs(x)>100 || Math.abs(z)>100) return;
          const now=Date.now();
          const dt=(now - (player.lastMove.t||now))/1000;
          const valid=Validation.isMoveValid(player.lastMove, {x,y,z}, dt);
          if(!valid){
            // clamp, don't trust teleport
            // just ignore extreme teleport
            // console.warn('invalid move', player.id)
            // return;
          }
          player.pos={x: x||0, y: y||1.7, z: z||0};
          player.yaw=Number(yaw)||0;
          player.pitch=Number(pitch)||0;
          player.state=state||'idle';
          player.lastMove={x:player.pos.x, y:player.pos.y, z:player.pos.z, t: now};
          // broadcast to other player at reduced rate? we broadcast immediately
          room.broadcast({type:'player_update', payload:{id:player.id, pos:player.pos, yaw:player.yaw, pitch:player.pitch, state:player.state}}, player.id);
          break;
        }
        case 'chat_message':{
          if(!room||!player) return;
          if(!playerManager.checkChatRate(ws)) return;
          let text=(payload.text||'').toString().slice(0,120).replace(/[<>]/g,'');
          if(!text.trim()) return;
          const safe=text.trim();
          console.log(`[Chat ${room.code}] ${player.name}: ${safe}`);
          room.broadcast({type:'chat_message', payload:{id:player.id, name:player.name, text: safe, time: Date.now()}});
          break;
        }
        case 'play_slots':{
          if(!room||!player) return sendError(ws,'Not in room');
          if(room.phase!=='casino') return send(ws,'game_result',{ok:false, reason:'Not in casino'});
          const res=GameManager.playSlots(room, player, payload);
          if(!res.ok) return send(ws,'game_result',res);
          // send result to player
          send(ws,'game_result',{...res, game:'slots'});
          // broadcast team update to both
          room.broadcast({type:'quota_update', payload:{teamEarnings: room.teamEarnings, quota: room.quota, time: room.time, players: room.players.map(p=>({id:p.id, coins:p.coins, dayEarnings:p.dayEarnings}))}});
          room.broadcast({type:'coins_update', payload:{teamEarnings: room.teamEarnings, players: room.players.map(p=>({id:p.id, coins:p.coins}))}});
          // world event for other player: PLAYER 1 WON
          if(res.net>0) room.broadcast({type:'world_event', payload:{kind:'win', playerId: player.id, playerName: player.name, game:'slots', net:res.net}}, player.id);
          break;
        }
        case 'play_roulette':{
          if(!room||!player) return sendError(ws,'Not in room');
          if(room.phase!=='casino') return send(ws,'game_result',{ok:false, reason:'Not in casino'});
          const res=GameManager.playRoulette(room, player, payload);
          if(!res.ok) return send(ws,'game_result',res);
          send(ws,'game_result',{...res, game:'roulette'});
          room.broadcast({type:'quota_update', payload:{teamEarnings: room.teamEarnings, quota: room.quota, time: room.time, players: room.players.map(p=>({id:p.id, coins:p.coins, dayEarnings:p.dayEarnings}))}});
          if(res.net>0) room.broadcast({type:'world_event', payload:{kind:'win', playerId:player.id, playerName:player.name, game:'roulette', net:res.net}}, player.id);
          break;
        }
        case 'play_dice':{
          if(!room||!player) return sendError(ws,'Not in room');
          if(room.phase!=='casino') return send(ws,'game_result',{ok:false, reason:'Not in casino'});
          const res=GameManager.playDice(room, player, payload);
          if(!res.ok) return send(ws,'game_result',res);
          send(ws,'game_result',{...res, game:'dice'});
          room.broadcast({type:'quota_update', payload:{teamEarnings: room.teamEarnings, quota: room.quota, time: room.time, players: room.players.map(p=>({id:p.id, coins:p.coins, dayEarnings:p.dayEarnings}))}});
          if(res.net>0) room.broadcast({type:'world_event', payload:{kind:'win', playerId:player.id, playerName:player.name, game:'dice', net:res.net}}, player.id);
          break;
        }
        case 'play_coinflip':{
          if(!room||!player) return sendError(ws,'Not in room');
          if(room.phase!=='casino') return send(ws,'game_result',{ok:false, reason:'Not in casino'});
          const res=GameManager.playCoinflip(room, player, payload);
          if(!res.ok) return send(ws,'game_result',res);
          send(ws,'game_result',{...res, game:'coinflip'});
          room.broadcast({type:'quota_update', payload:{teamEarnings: room.teamEarnings, quota: room.quota, time: room.time, players: room.players.map(p=>({id:p.id, coins:p.coins, dayEarnings:p.dayEarnings}))}});
          if(res.net>0) room.broadcast({type:'world_event', payload:{kind:'win', playerId:player.id, playerName:player.name, game:'coinflip', net:res.net}}, player.id);
          break;
        }
        case 'play_blackjack':{
          if(!room||!player) return sendError(ws,'Not in room');
          if(room.phase!=='casino') return send(ws,'game_result',{ok:false, reason:'Not in casino'});
          const res=GameManager.playBlackjack(room, player, payload);
          if(!res.ok) return send(ws,'game_result',res);
          send(ws,'game_result',{...res, game:'blackjack'});
          room.broadcast({type:'quota_update', payload:{teamEarnings: room.teamEarnings, quota: room.quota, time: room.time, players: room.players.map(p=>({id:p.id, coins:p.coins, dayEarnings:p.dayEarnings}))}});
          if(res.net>0) room.broadcast({type:'world_event', payload:{kind:'win', playerId:player.id, playerName:player.name, game:'blackjack', net:res.net}}, player.id);
          break;
        }
        case 'buy_item':{
          if(!room||!player) return;
          const itemId=(payload.itemId||'').toString();
          const CATALOG_PRICES={lucky_charm:2, coin_magnet:4, lucky_dice:6, safety_card:8, vip_pass:12};
          const price=CATALOG_PRICES[itemId];
          if(price==null) return sendError(ws,'Unknown item');
          if(player.items.includes(itemId)) return sendError(ws,'Already owned');
          if((player.tickets||0) < price) return sendError(ws,'Not enough tickets');
          player.tickets-=price;
          player.items.push(itemId);
          send(ws,'item_bought',{itemId, tickets: player.tickets, items: player.items.slice()});
          room.broadcast({type:'tickets_update', payload:{players: room.players.map(p=>({id:p.id, tickets:p.tickets}))}});
          break;
        }
        case 'go_casino_ready':{
          if(!room||!player) return;
          player.carReady=!!payload.ready;
          room.broadcast({type:'car_ready_update', payload:{players: room.players.map(p=>({id:p.id, name:p.name, carReady: !!p.carReady}))}});
          const all=room.players.length===2 && room.players.every(p=>p.carReady);
          if(all){
            // both ready -> start synchronized travel
            const startAt=Date.now()+1200; // 1.2s in future
            room.phase='travel';
            room.broadcast({type:'travel_start', payload:{startAt, day: room.day, quota: room.quota}});
            // after travel, set to casino phase via day_start
            setTimeout(()=>{
              room.startDay();
              room.broadcast({type:'day_start', payload:{day: room.day, quota: room.quota, phase: room.phase, time: room.time, floors: room.floors.slice(), startAt: Date.now()+500}});
              room.broadcast({type:'quota_update', payload:{teamEarnings: room.teamEarnings, quota: room.quota, time: room.time, players: room.players.map(p=>({id:p.id, coins:p.coins, dayEarnings:p.dayEarnings}))}});
            }, 18000); // approx cinematic length 18s, tune
            // reset carReady after launch
          }
          break;
        }
        case 'request_return_home':{
          // after day_complete, both should return home together
          if(!room||!player) return;
          player.homeReady=!!payload.ready;
          room.broadcast({type:'home_ready_update', payload:{players: room.players.map(p=>({id:p.id, homeReady:!!p.homeReady}))}});
          const all=room.players.length===2 && room.players.every(p=>p.homeReady);
          if(all){
            room.phase='home';
            room.broadcast({type:'return_home', payload:{startAt: Date.now()+800}});
            // reset
            for(const p of room.players) p.homeReady=false;
          }
          break;
        }
        case 'sleep_ready':{
          if(!room||!player) return;
          player.sleepReady=!!payload.ready;
          room.broadcast({type:'sleep_ready_update', payload:{players: room.players.map(p=>({id:p.id, sleepReady:!!p.sleepReady}))}});
          const all=room.players.length===2 && room.players.every(p=>p.sleepReady);
          if(all){
            // advance day
            for(const p of room.players) p.sleepReady=false;
            // room already advanced? day_complete advanced next day. Just broadcast morning
            room.broadcast({type:'morning', payload:{day: room.day, quota: room.quota, floors: room.floors.slice(), startAt: Date.now()+800}});
          }
          break;
        }
        case 'boss_interact':{
          if(!room||!player) return;
          const res=room.tryBoss();
          if(!res.ok){
            if(res.reason==='short') send(ws,'boss_result',{ok:false, reason:'short', missing: res.missing});
            else send(ws,'boss_result',{ok:false, reason: res.reason});
          } else {
            send(ws,'boss_result',{ok:true});
          }
          break;
        }
        case 'final_cinematic_ready':{
          if(!room||!player) return;
          player.finalReady=!!payload.ready;
          room.broadcast({type:'final_ready_update', payload:{players: room.players.map(p=>({id:p.id, finalReady:!!p.finalReady}))}});
          if(room.players.length===2 && room.players.every(p=>p.finalReady)){
            const startAt=Date.now()+1000;
            room.broadcast({type:'final_start', payload:{startAt}});
          }
          break;
        }
        case 'retry_day':{
          if(!room) return;
          room.retryDay();
          break;
        }
        case 'leave_room':{
          if(!room||!player) return;
          room.removePlayer(player.id);
          room.broadcast({type:'player_left', payload:{id:player.id, room: room.getState()}});
          if(room.isEmpty()) roomManager.removeRoom(room.code);
          player=null; room=null; ws._roomCode=null;
          send(ws,'left_room',{});
          break;
        }
        case 'ping':{
          send(ws,'pong',{t: Date.now()});
          break;
        }
        default:{
          // console.log('unknown', type);
        }
      }
    }catch(e){
      console.error('msg handle error', e);
      sendError(ws, 'Server error');
    }
  });

  ws.on('close', ()=>{
    const p=playerManager.getByWs(ws);
    const code=ws._roomCode;
    if(p){
      console.log(`[WS] disconnect ${p.name} ${p.id}`);
      playerManager.removeByWs(ws);
      if(code){
        const r=roomManager.getRoom(code);
        if(r){
          r.removePlayer(p.id);
          r.broadcast({type:'player_left', payload:{id:p.id, name:p.name, room: r.getState()}});
          r.broadcast({type:'chat_message', payload:{id:'system', name:'SYSTEM', text: `${p.name} disconnected`, time: Date.now()}});
          if(r.isEmpty()){
            roomManager.removeRoom(r.code);
            console.log(`[Room] ${r.code} removed (empty)`);
          }
        }
      }
    }
  });

  ws.on('error', (e)=> console.error('[WS error]', e));
  // send connected
  send(ws,'connected',{message:'Connected to NEON PALACE server'});
});

server.listen(PORT, HOST, ()=>{
  console.log(`[Server] NEON PALACE listening on ${HOST}:${PORT}  (public: ${publicDir})`);
  console.log(`[Server] health: http://localhost:${PORT}/health`);
});
