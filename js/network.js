/* ============================================================
   network.js — client WebSocket layer, auto host, protocol
   ============================================================ */
(function(){
  'use strict';
  const Network = {
    ws:null,
    connected:false,
    you:null, // {id, name}
    room:null, // server room state
    lastSend:0,
    _reconnectTimer:null,
    _onMessage: null,

    getWsUrl(){
      // if running file:// -> no server, return null (offline)
      if(location.protocol==='file:') return null;
      const proto = location.protocol==='https:' ? 'wss:' : 'ws:';
      // use current host (Render provides same host)
      return proto + '//' + location.host;
    },

    connect(){
      const url=this.getWsUrl();
      if(!url){
        console.log('[Network] file:// mode — offline');
        this.connected=false;
        Bus.emit('network:offline');
        return;
      }
      console.log('[Network] connecting to', url);
      Bus.emit('network:connecting');
      try{
        this.ws=new WebSocket(url);
      }catch(e){ console.error(e); this.scheduleReconnect(); return; }
      this.ws.onopen=()=>{
        this.connected=true;
        console.log('[Network] connected');
        Bus.emit('network:connected');
        // stop reconnect timer
        if(this._reconnectTimer){ clearTimeout(this._reconnectTimer); this._reconnectTimer=null; }
      };
      this.ws.onclose=()=>{
        console.log('[Network] closed');
        this.connected=false;
        Bus.emit('network:disconnected');
        this.scheduleReconnect();
      };
      this.ws.onerror=(e)=>{
        console.warn('[Network] error', e);
        Bus.emit('network:error', {message:'Connection error'});
      };
      this.ws.onmessage=(ev)=>{
        let msg;
        try{ msg=JSON.parse(ev.data);}catch(e){return;}
        this.handle(msg);
      };
    },

    scheduleReconnect(){
      if(this._reconnectTimer) return;
      if(location.protocol==='file:') return;
      this._reconnectTimer=setTimeout(()=>{
        this._reconnectTimer=null;
        console.log('[Network] reconnecting...');
        this.connect();
      }, 2500);
    },

    isOnline(){
      return this.connected && this.ws && this.ws.readyState===1 && this.room;
    },
    isConnected(){ return this.connected; },

    send(type, payload){
      if(!this.ws || this.ws.readyState!==1){
        console.warn('[Network] send while offline', type);
        return false;
      }
      try{
        this.ws.send(JSON.stringify({type, payload: payload||{}}));
        return true;
      }catch(e){ console.error(e); return false; }
    },

    // ---- room actions ----
    createRoom(name){
      this.send('create_room',{name: name||'Player'});
    },
    joinRoom(code, name){
      this.send('join_room',{code, name: name||'Player'});
    },
    quickPlay(name){
      this.send('quick_play',{name: name||'Player'});
    },
    setReady(ready){
      this.send('set_ready',{ready: !!ready});
    },
    startGame(){
      this.send('start_game',{});
    },
    leaveRoom(){
      this.send('leave_room',{});
      this.room=null;
      Bus.emit('room:left');
    },

    // movement: 15 Hz throttled
    sendMove(x,y,z,yaw,pitch,state){
      const now=performance.now();
      if(now - this.lastSend < 66) return; // 15Hz
      this.lastSend=now;
      this.send('player_update',{x,y,z,yaw,pitch,state});
    },
    sendChat(text){
      this.send('chat_message',{text});
    },

    // games
    playSlots(tier, bet){ this.send('play_slots',{tier, bet}); },
    playRoulette(bets){ this.send('play_roulette',{bets}); },
    playDice(choice, bet){ this.send('play_dice',{choice, bet}); },
    playCoinflip(pick, bet){ this.send('play_coinflip',{pick, bet}); },
    playBlackjack(bet, action){ this.send('play_blackjack',{bet, action}); },
    buyItem(itemId){ this.send('buy_item',{itemId}); },
    carReady(ready){ this.send('go_casino_ready',{ready}); },
    homeReady(ready){ this.send('request_return_home',{ready}); },
    sleepReady(ready){ this.send('sleep_ready',{ready}); },
    bossInteract(){ this.send('boss_interact',{}); },
    finalReady(ready){ this.send('final_cinematic_ready',{ready}); },
    retryDay(){ this.send('retry_day',{}); },

    handle(msg){
      const t=msg.type;
      const p=msg.payload||{};
      // console.log('[Network] recv', t, p);
      switch(t){
        case 'connected':
          Bus.emit('network:connected');
          break;
        case 'room_joined':
          this.you=p.you;
          this.room=p.room;
          Bus.emit('room:joined', {you: p.you, room: p.room});
          Bus.emit('room:state', p.room);
          break;
        case 'room_state':
          this.room=p;
          Bus.emit('room:state', p);
          break;
        case 'player_joined':
          Bus.emit('player:joined', p);
          if(p.room){ this.room=p.room; Bus.emit('room:state', p.room); }
          break;
        case 'player_left':
          Bus.emit('player:left', p);
          if(p.room){ this.room=p.room; Bus.emit('room:state', p.room); }
          break;
        case 'player_ready':
          if(p.room){ this.room=p.room; }
          Bus.emit('player:ready', p);
          Bus.emit('room:state', p.room);
          break;
        case 'game_start':
          this.room=p;
          Bus.emit('game:start_multi', p);
          Bus.emit('room:state', p);
          break;
        case 'day_start':
          if(this.room){ Object.assign(this.room, p); }
          Bus.emit('day:start_multi', p);
          Bus.emit('room:state', this.room);
          break;
        case 'player_update':
          Bus.emit('remote:move', p);
          break;
        case 'chat_message':
          Bus.emit('chat:message', p);
          break;
        case 'game_result':
          Bus.emit('game:result_multi', p);
          break;
        case 'quota_update':
        case 'coins_update':
        case 'tickets_update':
          Bus.emit('economy:sync', p);
          if(p.teamEarnings!==undefined && this.room) this.room.teamEarnings=p.teamEarnings;
          if(p.quota!==undefined && this.room) this.room.quota=p.quota;
          Bus.emit('room:state', this.room);
          break;
        case 'day_time':
          if(this.room){ this.room.time=p.time; this.room.teamEarnings=p.teamEarnings; if(p.quota) this.room.quota=p.quota; if(p.bossReady!==undefined) this.room.bossReady=p.bossReady; }
          Bus.emit('clock:sync', p);
          Bus.emit('room:state', this.room);
          break;
        case 'world_event':
          Bus.emit('world:event', p);
          break;
        case 'car_ready_update':
          Bus.emit('car:ready', p);
          break;
        case 'travel_start':
          Bus.emit('travel:start', p);
          break;
        case 'return_home':
          Bus.emit('return:home', p);
          break;
        case 'home_ready_update':
          Bus.emit('home:ready', p);
          break;
        case 'sleep_ready_update':
          Bus.emit('sleep:ready', p);
          break;
        case 'morning':
          Bus.emit('morning:multi', p);
          break;
        case 'day_complete':
          Bus.emit('day:complete_multi', p);
          if(this.room){
            if(!p.final){
              this.room.day=p.nextDay || this.room.day+1;
              this.room.quota=p.nextQuota;
              this.room.phase='home';
              this.room.time=0;
              this.room.teamEarnings=0;
              if(p.unlockedFloors) for(const f of p.unlockedFloors) if(!this.room.floors.includes(f)) this.room.floors.push(f);
            } else {
              this.room.phase='done';
            }
          }
          Bus.emit('room:state', this.room);
          break;
        case 'game_over':
          Bus.emit('day:failed_multi', p);
          break;
        case 'day_retry':
          if(this.room){ this.room.phase='home'; this.room.time=0; this.room.teamEarnings=0; Object.assign(this.room, p); }
          Bus.emit('day:retry_multi', p);
          Bus.emit('room:state', this.room);
          break;
        case 'boss_ready':
          if(this.room) this.room.bossReady=true;
          Bus.emit('boss:ready_multi', p);
          Bus.emit('room:state', this.room);
          break;
        case 'boss_success':
        case 'boss_result':
          Bus.emit('boss:result', p);
          break;
        case 'floor_unlocked':
          if(this.room){ this.room.floors=p.floors.slice(); }
          Bus.emit('floor:unlocked_multi', p);
          Bus.emit('room:state', this.room);
          break;
        case 'item_bought':
          Bus.emit('item:bought_multi', p);
          break;
        case 'final_ready_update':
          Bus.emit('final:ready', p);
          break;
        case 'final_start':
          Bus.emit('final:start', p);
          break;
        case 'game_complete':
          Bus.emit('game:complete_multi', p);
          break;
        case 'error':
          Bus.emit('network:error', p);
          UI.toast({title: p.message||'Error', text:'', icon:'⚠️', type:'red', time:4000});
          console.warn('[Server error]', p.message);
          break;
        case 'pong':
          break;
        default:
          // console.log('unknown msg', t);
          break;
      }
      // generic
      Bus.emit('network:message', msg);
    }
  };

  window.Network = Network;
})();
