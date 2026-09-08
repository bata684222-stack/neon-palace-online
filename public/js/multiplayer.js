/* ============================================================
   multiplayer.js — lobby, HUD team quota, sync orchestration
   ============================================================ */
(function(){
  'use strict';
  const Multiplayer = {
    inRoom:false,
    isHost:false,

    init(){
      // lobby buttons wiring
      setTimeout(()=> this.bindLobby(), 300);
      Bus.on('network:connected', ()=> {
        UI.toast({title:'CONNECTED', text:'Сервер доступен — создай или войди в комнату', icon:'🌐', type:'gold'});
        this.refreshLobby();
        const s=document.getElementById('mp-lobby-status');
        if(s) s.textContent='CONNECTED — выбери комнату';
      });
      Bus.on('network:disconnected', ()=> {
        UI.toast({title:'SERVER CONNECTION LOST', text:'Пытаемся переподключиться...', icon:'⚠️', type:'red', time:5000});
        this.showConnectOverlay(true, 'SERVER CONNECTION LOST');
      });
      Bus.on('network:offline', ()=>{
        // file:// mode — keep lobby but show offline hint
        const s=document.getElementById('mp-lobby-status');
        if(s) s.textContent='OFFLINE (file://) — запусти npm start для online, solo доступно';
        const btn=document.getElementById('mp-create');
        if(btn) btn.disabled=true;
      });
      Bus.on('room:joined', (d)=>{
        this.inRoom=true;
        UI.hideLobby();
        UI.showRoom(d.room, d.you);
        this.syncStateToLocal(d.room);
      });
      Bus.on('room:state', (room)=>{
        if(!room) return;
        Network.room=room;
        UI.updateRoom(room);
        this.syncStateToLocal(room);
      });
      Bus.on('player:joined', (d)=>{
        UI.toast({title: d.name+' присоединился', text:'2/2 PLAYERS', icon:'👤'});
        this.syncStateToLocal(d.room);
      });
      Bus.on('player:left', (d)=>{
        UI.toast({title: (d.name||'Игрок')+' вышел', text:'PLAYER DISCONNECTED', icon:'⚠️', type:'red', time:6000});
        if(Network.room && Network.room.players.length<2){
          UI.showRoom(Network.room, Network.you);
        }
      });
      Bus.on('player:ready', (d)=> UI.updateRoom(d.room));
      Bus.on('remote:move', (d)=> RemotePlayer.onMove(d));
      Bus.on('chat:message', (d)=> UI.addChat(d));
      Bus.on('world:event', (d)=>{
        if(d.kind==='win') UI.toast({title: d.playerName+' WON!', text:'+'+Utils.fmt(d.net)+' в '+d.game, icon:'🏆', type:'gold', time:3500});
      });
      Bus.on('economy:sync', (d)=> this.onEconomySync(d));
      Bus.on('clock:sync', (d)=> this.onClockSync(d));
      Bus.on('game:result_multi', (d)=> this.onGameResult(d));
      Bus.on('travel:start', (d)=> this.onTravelStart(d));
      Bus.on('day:start_multi', (d)=> this.onDayStart(d));
      Bus.on('day:complete_multi', (d)=> this.onDayComplete(d));
      Bus.on('day:failed_multi', (d)=> this.onDayFailed(d));
      Bus.on('boss:ready_multi', (d)=> UI.toast({title:'ФИНАЛЬНАЯ КВОТА СОБРАНА', text:'Владелец ждёт в офисе на 3 этаже', icon:'🕴️', type:'gold', time:7000}));
      Bus.on('floor:unlocked_multi', (d)=> UI.toast({title:'FLOOR '+d.unlocked.join(',')+' UNLOCKED', text:'Лифт доступен', icon:'🛗', type:'gold', time:6000}));
      Bus.on('game:start_multi', (d)=> this.onGameStart(d));
      Bus.on('game:complete_multi', (d)=> this.onGameComplete(d));
      Bus.on('return:home', (d)=> this.onReturnHome(d));
      Bus.on('final:start', (d)=> Story.finalCutsceneMulti(d.startAt));
      Bus.on('network:error', (d)=> {
        // already toasted by network
      });
      // hook existing singleplayer events to multiplayer hooks
      Bus.on('day:complete', (d)=>{
        // if online, server already sent day_complete, don't duplicate local
        if(Network.isOnline()) return;
      });
    },

    syncStateToLocal(room){
      if(!room) return;
      if(!window.State || !State.campaign) return;
      const c=State.campaign;
      const wasPhase=c.phase;
      c.day=room.day;
      c.quota=room.quota;
      c.phase=room.phase;
      c.time=room.time;
      c.floor=room.floor;
      c.floors=room.floors.slice();
      c.bossReady=room.bossReady;
      if(Network.you){
        const me=room.players.find(p=>p.id===Network.you.id);
        if(me){
          State.coins=me.coins;
          State.tickets=me.tickets;
          State.xp=me.xp;
          State.level=me.level;
          if(me.items) State.items.owned=me.items.slice();
        }
      }
      State._teamEarnings=room.teamEarnings;
      UI.refreshHUD();
      UI.refreshCampaign();
      // handle reconnect teleport
      if(room.status==='playing' && wasPhase!==room.phase){
        if(room.phase==='casino' && Game.state!=='CASINO' && Game.state!=='PLAYING_GAME'){
          Game.setState('CASINO');
          const envId=room.floor===2?'casino2':room.floor===3?'casino3':'casino1';
          Game.enterEnv(envId, World.envSpawn(envId));
          Game.enableControl(true);
          UI.showHUD(true);
          UI.hideLobby(); UI.hideRoom();
        } else if(room.phase==='home' && Game.state!=='HOME'){
          Game.setState('HOME');
          Game.enterEnv('home', World.envSpawn('home'));
          Game.enableControl(true);
          UI.showHUD(true);
        }
      }
      if(room.players.length===2 && Network.you){
        const other=room.players.find(p=>p.id!==Network.you.id);
        if(other){
          if(!RemotePlayer.visible) RemotePlayer.show(other.id, other.name, other.pos);
          else RemotePlayer.setName(other.name);
        }
      } else if(room.players.length<2){
        RemotePlayer.hide();
      }
    },

    onEconomySync(d){
      // d: {teamEarnings, quota, time, players:[{id, coins, dayEarnings}]}
      if(d.players && Network.you){
        const me=d.players.find(p=>p.id===Network.you.id);
        if(me){
          State.coins=me.coins;
          if(me.dayEarnings!==undefined) State._myEarnings=me.dayEarnings;
        }
        if(d.teamEarnings!==undefined) State._teamEarnings=d.teamEarnings;
        if(d.quota!==undefined) State.campaign.quota=d.quota;
        if(d.time!==undefined) State.campaign.time=d.time;
        UI.refreshHUD();
        UI.refreshCampaign();
      }
    },
    onClockSync(d){
      if(Network.isOnline()){
        State.campaign.time=d.time;
        if(d.teamEarnings!==undefined) State._teamEarnings=d.teamEarnings;
        UI.refreshCampaign();
      }
    },
    onGameResult(d){
      // server authoritative result replaces local settle
      // d contains payout, net, etc per game. Already updated coins via economy:sync
      // Need to update UI panels if open
      // For now, each game panel listens to game:result_multi and renders accordingly
      Bus.emit('game:result', {game: d.game, bet: d.bet, payout: d.payout, net: d.net, outcome: d.won?'win': (d.payout>0?'push':'lose'), meta:d});
      // also big win handling
      if(d.net>0 && d.net >= d.bet*5){
        UI.bigWin('BIG WIN!');
        UI.sparks(18, Inventory.effectColor());
      }
      // add XP locally? Server already added xp to room player. Keep progression via server.
    },
    onGameStart(room){
      // hide lobby/room, start morning
      UI.hideLobby();
      UI.hideRoom();
      UI.showHUD(true);
      // teleport both to home
      Game.setState('HOME');
      Game.enterEnv('home', World.envSpawn('home'));
      UI.fadeTo(0,700);
      Sound.startMusic();
      UI.showDayIntro(()=>{
        Game.enableControl(true);
        UI.toast({title:`DAY ${room.day} / 6 — TEAM`, text:'Собирайте общую квоту! Препарация → машина (оба READY) → казино', icon:'👥', type:'gold', time:7000});
      });
      Game.enableControl(false);
    },
    onDayStart(d){
      // server says casino day started
      DayManager.c = State.campaign; // ensure
      State.campaign.phase='casino';
      State.campaign.time=0;
      State.campaign.day=d.day;
      State.campaign.quota=d.quota;
      State.campaign.floors=d.floors.slice();
      UI.refreshCampaign();
      UI.toast({title:`DAY ${d.day} / 6`, text:`TEAM QUOTA ${Utils.fmt(d.quota)} — оба играйте!`, icon:'🎯', type:'gold', time:6000});
    },
    onTravelStart(d){
      // synchronized travel cinematic: both clients start at same server time
      const delay=Math.max(0, d.startAt - Date.now());
      setTimeout(()=> Story.travelToCasinoMulti(d), delay);
    },
    onDayComplete(d){
      if(d.final){
        UI.showDayComplete(d, ()=> {
          // request return home? For final day, boss needed already. But if final quota via boss, this is after boss.
          Bus.emit('day:complete', d);
        });
      } else {
        UI.showDayComplete(d, ()=> Story.returnHomeMulti());
      }
    },
    onDayFailed(d){
      Story.dayFailedMulti(d);
    },
    onReturnHome(d){
      const delay=Math.max(0, (d.startAt||Date.now()) - Date.now());
      setTimeout(()=> Story.returnHomeMulti(), delay);
    },
    onGameComplete(d){
      UI.showVictory(()=> { UI.fadeTo(0,500); Bus.emit('game:toMenu'); Network.leaveRoom(); });
      UI.sparks(60,'rainbow');
    },

    showConnectOverlay(show, text){
      const el=document.getElementById('mp-connect');
      if(!el) return;
      el.classList.toggle('hidden', !show);
      if(text) el.querySelector('.mp-connect-text').textContent=text;
    },
    refreshLobby(){
      const btn=document.getElementById('mp-create');
      if(btn) btn.disabled=!Network.isConnected() && location.protocol!=='file:';
    },
    bindLobby(){
      const $=id=>document.getElementById(id);
      const getName=()=> {
        const v=$('mp-name')?$('mp-name').value.trim():'';
        return v||'Player';
      };
      const btnCreate=$('mp-create');
      if(btnCreate) btnCreate.onclick=()=>{
        if(!Network.isConnected()){ UI.toast({title:'NO SERVER', text:'Сервер недоступен', icon:'⚠️', type:'red'}); return; }
        Sound.play('click');
        Network.createRoom(getName());
        $('mp-lobby-status').textContent='Creating room...';
      };
      const btnQuick=$('mp-quick');
      if(btnQuick) btnQuick.onclick=()=>{
        if(!Network.isConnected()){ UI.toast({title:'NO SERVER', text:'Сервер недоступен', icon:'⚠️', type:'red'}); return; }
        Sound.play('click');
        Network.quickPlay(getName());
        $('mp-lobby-status').textContent='Searching room...';
      };
      const btnJoin=$('mp-join');
      if(btnJoin) btnJoin.onclick=()=>{
        const code=$('mp-code')?$('mp-code').value.trim():'';
        if(!code){ UI.toast({title:'ENTER CODE', text:'Введи код комнаты', icon:'⚠️', type:'red'}); return; }
        Sound.play('click');
        Network.joinRoom(code, getName());
      };
      const mpLobbyBack=$('mp-lobby-back');
      if(mpLobbyBack) mpLobbyBack.onclick=()=>{ Sound.play('click'); UI.hideLobby(); UI.showMainMenu(true); };
      const roomReady=$('room-ready');
      if(roomReady) roomReady.onclick=()=>{
        Sound.play('click');
        const me=Network.room && Network.you ? Network.room.players.find(p=>p.id===Network.you.id):null;
        const cur=me?me.ready:false;
        Network.setReady(!cur);
      };
      const roomStart=$('room-start');
      if(roomStart) roomStart.onclick=()=>{ Sound.play('click'); Network.startGame(); };
      const roomCopy=$('room-copy');
      if(roomCopy) roomCopy.onclick=()=>{
        const code=(Network.room?Network.room.code:'')||'';
        if(!code) return;
        if(navigator.clipboard) navigator.clipboard.writeText(code).then(()=> UI.toast({title:'COPIED', text:code, icon:'📋'}));
        else { prompt('Copy code:', code); }
      };
      const roomLeave=$('room-leave');
      if(roomLeave) roomLeave.onclick=()=>{ Sound.play('click'); Network.leaveRoom(); UI.hideRoom(); UI.showLobby(true); };
      const reconnect=$('mp-reconnect');
      if(reconnect) reconnect.onclick=()=>{ Network.connect(); const el=document.getElementById('mp-connect'); if(el) el.classList.add('hidden'); };
      // chat
      const chatInput=$('chat-input');
      const chatSend=$('chat-send');
      const chatLog=$('chat-log');
      const sendChat=()=>{
        if(!chatInput) return;
        const t=chatInput.value.trim();
        if(!t) return;
        if(Network.isOnline()) Network.sendChat(t);
        else UI.addChat({name:(getName()||'You'), text:t});
        chatInput.value='';
      };
      if(chatInput) chatInput.addEventListener('keydown', e=>{ if(e.code==='Enter'){ e.preventDefault(); sendChat(); } if(e.code==='Escape'){ UI.toggleChat(false); } });
      if(chatSend) chatSend.onclick=sendChat;
      // T to open chat
      window.addEventListener('keydown', e=>{
        if(e.code==='KeyT' && !UI.isOpen() && document.activeElement.tagName!=='INPUT'){
          e.preventDefault(); UI.toggleChat(true);
        }
      });
      // multiplayer menu button
      const btnMP=document.getElementById('btn-multiplayer');
      if(btnMP) btnMP.onclick=()=>{
        Sound.init(); Sound.play('click');
        if(!Network.isConnected() && location.protocol!=='file:'){
          Network.connect();
        }
        UI.showLobby(true);
      };
      // car ready handling: replaced via Story hooks, but also listen for E on car via interaction patch
    }
  };
  window.Multiplayer=Multiplayer;
})();
