/* ============================================================
   main.js — bootstrap, render loop, GAME STATES, hotkeys
   states: MAIN_MENU HOME PREPARATION TRAVEL_TO_CASINO CASINO
           PLAYING_GAME DAY_COMPLETE RETURN_HOME GAME_OVER
           FINAL_BOSS FINAL_CUTSCENE GAME_COMPLETE
   ============================================================ */
(function () {
  'use strict';

  const FREE_STATES = ['HOME', 'CASINO', 'FINAL_BOSS'];      // player may walk
  const CINE_STATES = ['TRAVEL_TO_CASINO', 'RETURN_HOME', 'FINAL_CUTSCENE'];

  const Game = {
    mode: 'loading',       // loading | menu | playing | paused
    state: 'MAIN_MENU',
    renderer: null,
    scene: null,
    camera: null,
    clock: null,
    elapsed: 0,
    frames: 0,
    zoneTimer: 0,
    curZone: '',

    /* ---------------- boot ---------------- */
    async boot() {
      if (!window.THREE) { this.fail('Three.js не загрузился. Проверь файл vendor/three.min.js'); return; }
      Save.LoadGame();
      Quests.ensureDaily();
      UI.init();
      Inventory.apply();
      if(window.Network){ Network.connect(); }
      if(window.Multiplayer){ Multiplayer.init(); }

      const canvas = document.getElementById('scene');
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: State.settings.quality !== 'low', powerPreference: 'high-performance' });
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(State.settings.fov, window.innerWidth / window.innerHeight, 0.08, 600);
      this.clock = new THREE.Clock();

      const steps = [
        ['Loading Three.js core...', () => { }],
        ['Building casino floor 1...', () => World.build(this.scene)],
        ['Building floors 2 & 3...', () => Floors.build(this.scene)],
        ['Building the night city...', () => Car.buildTravel(this.scene)],
        ['Building your house...', () => Home.build(this.scene)],
        ['Spawning guests...', () => NPCs.spawn(this.scene, 14)],
        ['Calibrating player controller...', () => {
          Player.init(this.camera, canvas);
          Interaction.init(this.camera);
          Cinematic.init(this.camera);
          if(window.RemotePlayer) RemotePlayer.init(this.scene);
        }],
        ['Lighting the neon...', () => this.applyQuality()],
        ['Ready.', () => { }]
      ];

      for (let i = 0; i < steps.length; i++) {
        document.getElementById('loader-text').textContent = steps[i][0];
        document.getElementById('loader-fill').style.width = Math.round((i / steps.length) * 100) + '%';
        await new Promise(r => setTimeout(r, 30));
        try { steps[i][1](); } catch (e) { console.error('Build step failed:', steps[i][0], e); this.fail(e.message); return; }
      }
      document.getElementById('loader-fill').style.width = '100%';
      await new Promise(r => setTimeout(r, 160));
      document.getElementById('loading').classList.add('hidden');

      World.activate('home');
      Player.teleport(0, 20, Math.PI);

      this.bindEvents();
      this.mode = 'menu';
      this.state = 'MAIN_MENU';
      UI.showMainMenu(true);
      this.loop();
    },

    fail(msg) {
      const l = document.getElementById('loader-text');
      if (l) { l.textContent = 'ОШИБКА: ' + msg; l.style.color = '#ff6b6b'; }
    },

    /* ---------------- state helpers ---------------- */
    setState(s) {
      this.state = s;
      if (CINE_STATES.indexOf(s) >= 0) this.mode = 'cine';
      else if (s === 'MAIN_MENU') this.mode = 'menu';
      else if (s === 'GAME_OVER' || s === 'GAME_COMPLETE' || s === 'DAY_COMPLETE') this.mode = 'story';
      else this.mode = 'playing';
      UI.refreshCampaign();
      Bus.emit('state:changed', { state: s });
    },
    canWalk() { return FREE_STATES.indexOf(this.state) >= 0 && !UI.isOpen() && !(window.Cinematic && Cinematic.playing); },

    enableControl(v) {
      if (v && !this.canWalk()) v = false;
      Player.setEnabled(v);
      if (v) { Player.requestLock(); UI.lockHint(!Player.locked); }
      else { Player.releaseLock(); UI.lockHint(false); UI.prompt(null); }
    },

    /** switch environment and (optionally) place the player */
    enterEnv(id, spawn) {
      World.activate(id);
      const sp = spawn || World.envSpawn(id);
      if (sp) Player.teleport(sp.x, sp.z, sp.yaw);
      const e = World.envs[id];
      if (e && e.floor && e.floor > 0 && id.indexOf('casino') === 0) State.campaign.floor = e.floor;
      this.curZone = '';
      /* keep the VIP door in sync with progression / campaign day */
      if (id === 'casino1' && Progression.isUnlocked('vip') && !World.vipOpen) World.openVipDoor(true);
      NPCs.setVisible(id === 'casino1');
      UI.setZone((e && e.name) || id.toUpperCase());
    },

    /* ---------------- events ---------------- */
    bindEvents() {
      const canvas = document.getElementById('scene');

      window.addEventListener('resize', () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      });

      canvas.addEventListener('click', () => {
        Sound.init();
        if (this.canWalk() && !Player.locked) Player.requestLock();
      });

      Bus.on('game:start', d => this.startPlay(d && d.mode));
      Bus.on('game:resume', () => this.resume());
      Bus.on('game:toMenu', () => this.toMenu());

      Bus.on('pointerlock:changed', d => {
        if (d.locked) {
          UI.lockHint(false);
          if (this.mode === 'paused') { this.resume(); }
        } else {
          if (this.mode === 'playing' && !UI.isOpen() && !Cinematic.playing) this.pause();
          UI.lockHint(this.canWalk());
        }
      });

      Bus.on('ui:open', d => {
        Player.setEnabled(false);
        Player.releaseLock();
        UI.prompt(null);
        if (d && d.key === 'prepare') this._prevState = this.state, this.setState('PREPARATION');
        else if (d && ['slots', 'roulette', 'blackjack', 'dice', 'coinflip'].indexOf(d.key) >= 0) {
          this._prevState = this.state; this.setState('PLAYING_GAME');
        }
      });
      Bus.on('ui:close', () => {
        if (this.state === 'PLAYING_GAME' || this.state === 'PREPARATION') {
          this.setState(this._prevState || (State.campaign.phase === 'casino' ? 'CASINO' : 'HOME'));
        }
        if (this.mode === 'playing') this.enableControl(true);
        else if (this.mode === 'paused') UI.showPause(true);
      });

      Bus.on('settings:changed', d => { if (d && d.quality) this.applyQuality(); Player.applySettings(); });
      Bus.on('save:reset', () => {
        UI.toast({ title: 'RESET', text: 'Перезапуск игры...', icon: '🗑', type: 'red' });
        setTimeout(() => location.reload(), 700);
      });
      Bus.on('economy:denied', () => Sound.play('deny'));
      Bus.on('elevator:go', d => Story.goFloor(d.floor));

      /* ---- campaign flow ---- */
      Bus.on('day:complete', d => {
        Sound.play('quota');
        UI.sparks(40, '#ffc63a');
        if (d.final) return;                        // the finale is driven by the boss scene
        this.setState('DAY_COMPLETE');
        this.enableControl(false);
        UI.showDayComplete(d, () => Story.returnHome(d));
      });
      Bus.on('day:failed', d => { Sound.play('fail'); Story.dayFailed(d); });
      Bus.on('boss:ready', () => {
        UI.toast({
          title: 'ФИНАЛЬНАЯ КВОТА СОБРАНА', text: 'Владелец ждёт в приватном офисе на 3 этаже',
          icon: '🕴️', type: 'gold', time: 9000
        });
      });
      Bus.on('level:up', d => { if (d.unlock && d.unlock.key === 'vip') World.openVipDoor(true); });

      // multiplayer bindings
      Bus.on('room:joined', ()=>{ UI.hideLobby(); UI.showHUD(false); });
      Bus.on('game:complete_multi', ()=> this.toMenu());
      Bus.on('player:left', d=>{
        if(Network.isOnline() && Network.room && Network.room.players.length===1){
          UI.toast({title:'Игрок вышел', text:'Ожидание переподключения...', icon:'⚠️', type:'red', time:6000});
        }
      });

      window.addEventListener('keydown', e => {
        // chat input has priority
        const chatInput=document.getElementById('chat-input');
        if(chatInput && document.activeElement===chatInput){
          if(e.code==='Escape'){ chatInput.blur(); UI.toggleChat(false); e.preventDefault(); return; }
          if(e.code==='Enter') return; // let chat handle
        }
        if (Cinematic.playing) return;
        if (e.code === 'Escape') {
          if (UI.isOpen()) { UI.close(); e.preventDefault(); return; }
          if (this.mode === 'playing') { this.pause(); return; }
          if (this.mode === 'paused') { this.resume(); return; }
        }
        if (this.mode !== 'playing' || UI.isOpen()) return;
        const map = { KeyJ: 'quests', KeyP: 'profile', KeyI: 'inventory', KeyK: 'achievements', KeyO: 'shop', KeyL: 'daily' };
        if (e.code === 'KeyM') {
          UI.open(State.campaign.phase === 'casino' ? 'quota' : 'prepare');
          e.preventDefault(); return;
        }
        if (e.code === 'KeyT') { UI.toggleChat(true); e.preventDefault(); return; }
        if (map[e.code]) { UI.open(map[e.code]); e.preventDefault(); }
      });

      setInterval(() => { if (this.mode === 'playing' || this.mode === 'paused') Save.SaveGame(true); }, 20000);
      window.addEventListener('beforeunload', () => Save.SaveGame(true));
      document.addEventListener('visibilitychange', () => { if (document.hidden) Save.SaveGame(true); });
    },

    applyQuality() {
      const q = State.settings.quality;
      const pr = q === 'low' ? 0.7 : q === 'medium' ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
      this.renderer.setPixelRatio(pr);
      this.renderer.shadowMap.enabled = q === 'high';
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      World.setQuality(q);
      NPCs.setCount(q === 'low' ? 6 : q === 'medium' ? 10 : 14);
    },

    /* ---------------- start / continue ---------------- */
    startPlay(mode) {
      if (this.mode === 'playing' || this.mode === 'cine') { UI.showMainMenu(false); return; }
      if (mode === 'play' && Save.hasProgress()) {
        UI.confirm('НОВАЯ КАМПАНИЯ?', 'Текущий прогресс (день, Tickets, предметы) будет удалён. Используй CONTINUE, чтобы продолжить.', () => {
          Save.ResetSave();
        });
        return;
      }
      UI.hideStoryScreens();
      UI.showMainMenu(false);
      UI.showHUD(true);
      Inventory.apply();
      Sound.init();
      Sound.startMusic();
      Achievements.checkAll();

      const fresh = mode === 'play' || !State.campaign.started;
      if (fresh) {
        DayManager.startCampaign(true);
        UI.refreshHUD();
        Story.startMorning(true);
        return;
      }

      /* CONTINUE: resume exactly where the story stopped */
      Quests.ensureDaily();
      const c = State.campaign;
      if (c.finished) {
        this.setState('HOME');
        this.enterEnv('home', World.envSpawn('home'));
        this.enableControl(true);
        UI.toast({ title: 'КАМПАНИЯ ПРОЙДЕНА', text: 'Долг закрыт. Можно начать новую кампанию из меню.', icon: '🏆', type: 'gold', time: 7000 });
      } else if (c.phase === 'casino') {
        this.setState('CASINO');
        const envId = c.floor === 2 ? 'casino2' : c.floor === 3 ? 'casino3' : 'casino1';
        this.enterEnv(envId, World.envSpawn(envId));
        this.enableControl(true);
        UI.toast({
          title: `DAY ${c.day} / 6`, icon: '🎯', type: 'gold', time: 7000,
          text: `Квота ${Utils.fmt(Math.max(0, DayManager.earnings()))} / ${Utils.fmt(c.quota)} · время ${DayManager.clockText()}`
        });
      } else {
        Story.startMorning(true);
      }
      UI.refreshHUD();
    },

    pause() {
      if (this.mode !== 'playing') return;
      this.mode = 'paused';
      Player.setEnabled(false);
      Player.releaseLock();
      UI.prompt(null);
      UI.showPause(true);
      Save.SaveGame(true);
    },

    resume() {
      if (this.mode !== 'paused') return;
      UI.showPause(false);
      this.mode = 'playing';
      this.enableControl(true);
    },

    toMenu() {
      Save.SaveGame(true);
      this.setState('MAIN_MENU');
      this.mode = 'menu';
      Player.setEnabled(false);
      Player.releaseLock();
      UI.close(true);
      UI.showPause(false);
      UI.showHUD(false);
      UI.hideStoryScreens();
      UI.prompt(null);
      UI.fadeTo(0, 400);
      UI.cinematicOn(false);
      World.activate('home');
      UI.showMainMenu(true);
      Sound.stopMusic();
      Sound.engine(false);
    },

    /* ---------------- zones ---------------- */
    trackZone(dt) {
      this.zoneTimer -= dt;
      if (this.zoneTimer > 0) return;
      this.zoneTimer = 0.35;
      if (!World.vipOpen && State.level >= 15) World.openVipDoor(true);
      const z = World.zoneAt(Player.pos.x, Player.pos.z);
      if (z.id !== this.curZone) {
        this.curZone = z.id;
        UI.setZone(z.label);
        if (State.visited.indexOf(z.id) < 0) {
          State.visited.push(z.id);
          State.counters.zones = State.visited.length;
          Bus.emit('zone:visited', { id: z.id, label: z.label });
          Bus.emit('metric', { key: 'zones', value: State.visited.length });
          Progression.addXp(40);      // XP only: free coins would break the quota economy
          Bus.emit('state:dirty');
        }
      }
    },

    /* ---------------- loop ---------------- */
    loop() {
      const self = this;
      const frame = () => {
        requestAnimationFrame(frame);
        const dt = Math.min(self.clock.getDelta(), 0.05);
        self.elapsed += dt;

        Tween.update(dt);
        Car.update(dt);

        if (Cinematic.playing) {
          Cinematic.update(dt);
        } else if (self.mode === 'playing' && self.canWalk()) {
          Player.update(dt);
          if(window.RemotePlayer) RemotePlayer.update(dt);
          Interaction.update();
          self.trackZone(dt);
          State.stats.playTime += dt;
          if(!window.Network || !Network.isOnline()) DayManager.tick(dt);
          else {
            // still need local clock sync display, but server is authoritative
          }
        } else if (self.mode === 'menu') {
          /* menu camera: slow orbit around the house */
          const a = self.elapsed * 0.09;
          self.camera.position.set(Math.cos(a) * 22, 7.5, 20 + Math.sin(a) * 22);
          self.camera.lookAt(0, 2.4, 6);
        } else {
          Player.sync();
          if (self.mode === 'playing') DayManager.tick(dt);
        }

        World.update(dt, self.elapsed);
        NPCs.update(dt, self.elapsed);
        if(window.RemotePlayer && RemotePlayer.visible) RemotePlayer.update(dt);

        self.renderer.render(self.scene, self.camera);

        self.frames++;
        const now = performance.now();
        if (!self._fpsMark) self._fpsMark = now;
        if (now - self._fpsMark >= 500) {
          const fps = Math.round(self.frames * 1000 / (now - self._fpsMark));
          const el = document.getElementById('fps-counter');
          if (el) el.textContent = fps + ' FPS';
          self.frames = 0; self._fpsMark = now;
        }
      };
      requestAnimationFrame(frame);
    }
  };

  window.Game = Game;
  window.addEventListener('error', e => console.error('[GameError]', e.message));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Game.boot());
  else Game.boot();
})();
