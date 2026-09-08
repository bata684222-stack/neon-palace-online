/* ============================================================
   ui.js — HUD, menus, panels, notifications, FX
   ============================================================ */
(function () {
  'use strict';

  /* ---------------- daily login reward ---------------- */
  const DAILY_REWARDS = [500, 750, 1000, 1500, 2500, 4000, 10000];
  const DailyReward = {
    REWARDS: DAILY_REWARDS,
    dayIndex() { return (State.dailyReward.streak % 7); },      // 0..6 -> next day to claim
    claimedToday() { return State.dailyReward.lastDay === Utils.dayKey(); },
    claim() {
      if (this.claimedToday()) { Sound.play('deny'); return false; }
      const yesterday = Utils.dayKey(new Date(Date.now() - 864e5));
      if (State.dailyReward.lastDay !== yesterday) {
        if (State.dailyReward.lastDay !== null && State.dailyReward.streak % 7 !== 0) State.dailyReward.streak = 0;
      }
      const idx = this.dayIndex();
      const amount = DAILY_REWARDS[idx];
      Economy.add(amount, 'daily');
      Progression.addXp(120 + idx * 40);
      State.dailyReward.streak++;
      State.dailyReward.lastDay = Utils.dayKey();
      Sound.play('coin');
      UI.toast({ title: 'DAILY REWARD', text: `Day ${idx + 1}: +${Utils.fmt(amount)} монет`, icon: '🎁', type: 'gold' });
      UI.sparks(24, '#ffc63a');
      Bus.emit('daily:claimed', { day: idx + 1, amount });
      Bus.emit('state:dirty');
      return true;
    },
    timeToNext() { return Utils.nextMidnight() - Date.now(); }
  };

  const $ = (id) => document.getElementById(id);

  const UI = {
    panels: {},
    openKey: null,
    _timers: [],

    init() {
      // main menu buttons
      Utils.$$('#main-menu [data-menu]').forEach(b => {
        b.addEventListener('click', () => {
          Sound.init(); Sound.play('click');
          const a = b.dataset.menu;
          if (a === 'play' || a === 'continue') Bus.emit('game:start', { mode: a });
          else this.open(a);
        });
        b.addEventListener('mouseenter', () => Sound.play('hover'));
      });
      // pause buttons
      Utils.$$('#pause-menu [data-pause]').forEach(b => {
        b.addEventListener('click', () => {
          Sound.play('click');
          const a = b.dataset.pause;
          if (a === 'resume') Bus.emit('game:resume');
          else if (a === 'save') { Save.SaveGame(); this.toast({ title: 'SAVED', text: 'Прогресс сохранён', icon: '💾' }); }
          else if (a === 'menu') Bus.emit('game:toMenu');
          else this.open(a);
        });
      });
      $('panel-close').addEventListener('click', () => { Sound.play('close'); this.close(); });
      $('confirm-no').addEventListener('click', () => { Sound.play('click'); this.hideConfirm(); });

      Bus.on('coins:changed', () => this.refreshHUD());
      Bus.on('xp:changed', () => this.refreshHUD());
      Bus.on('level:up', d => this.levelUpFx(d));
      Bus.on('achievement:earned', d => {
        this.toast({ title: 'ДОСТИЖЕНИЕ: ' + d.name, text: `${d.desc} · +${Utils.fmt(d.coins)} монет`, icon: d.icon, type: 'pink' });
        this.sparks(18, '#ff2d95');
      });
      Bus.on('quest:claimed', d => this.toast({ title: 'КВЕСТ ВЫПОЛНЕН', text: `${d.quest.name} · +${Utils.fmt(d.quest.coins)} монет, +${d.quest.xp} XP`, icon: '📋', type: 'gold' }));
      Bus.on('zone:visited', d => this.toast({ title: 'НОВАЯ ЗОНА', text: d.label, icon: '🧭' }));
      Bus.on('inventory:changed', () => this.refreshHUD());
      Bus.on('daily:reset', () => this.toast({ title: 'DAILY QUESTS', text: 'Новые ежедневные задания доступны', icon: '🔄' }));

      Bus.on('tickets:changed', () => this.refreshHUD());
      Bus.on('clock:changed', () => this.refreshCampaign());
      Bus.on('day:started', () => this.refreshCampaign());
      Bus.on('day:new', () => this.refreshCampaign());
      Bus.on('env:changed', () => this.refreshCampaign());
      Bus.on('campaign:credit', d => this.toast({
        title: 'CHIP CREDIT', text: `Казино выдало ${Utils.fmt(d.credit)} монет на игру этого дня`, icon: '🏦', type: 'gold', time: 5200
      }));
      Bus.on('item:safety', d => this.toast({
        title: 'SAFETY CARD', text: `Возврат ${Utils.fmt(d.refund)} монет — заряд использован`, icon: '🛡️', type: 'gold'
      }));
      Bus.on('quest:claimed', () => { if (this.openKey === 'quests') this.rebuild(); });

      this.registerCorePanels();
      this.registerCampaignPanels();
      this.refreshHUD();
    },

    /* ---------------- HUD ---------------- */
    refreshHUD() {
      if (!window.State) return;
      const p = Progression.progress();
      const c = $('hud-coins'); if (c) c.textContent = Utils.fmt(State.coins);
      const l = $('hud-level'); if (l) l.textContent = State.level;
      const f = $('hud-xp-fill'); if (f) f.style.width = p.pct + '%';
      const t = $('hud-xp-text');
      if (t) t.textContent = State.level >= Progression.MAX_LEVEL ? 'MAX LEVEL' : `${Utils.fmt(p.xp)} / ${Utils.fmt(p.need)} XP`;
      const tk = $('hud-tickets'); if (tk) tk.textContent = Utils.fmt(State.tickets);
      const pc = $('panel-coins'); if (pc) pc.textContent = Utils.fmt(State.coins);
      this.refreshCampaign();
      const fps = $('fps-counter'); if (fps) fps.style.display = State.settings.showFps ? '' : 'none';
    },
    setZone(label) { const z = $('zone-name'); if (z) z.textContent = label; },
    prompt(text, locked) {
      const p = $('prompt'), c = $('crosshair');
      if (!p) return;
      if (!text) { p.classList.add('hidden'); if (c) c.classList.remove('active'); return; }
      if (p.classList.contains('hidden') || $('prompt-text').textContent !== text) {
        $('prompt-text').textContent = text;
        p.classList.remove('hidden');
      }
      p.classList.toggle('locked', !!locked);
      if (c) c.classList.add('active');
    },
    showHUD(v) { $('hud').classList.toggle('hidden', !v); },
    lockHint(v) { $('lock-hint').classList.toggle('hidden', !v); },

    /* ---------------- screens ---------------- */
    showMainMenu(v) {
      $('main-menu').classList.toggle('hidden', !v);
      if (v) {
        const has = Save.hasProgress();
        $('menu-save-info').textContent = has
          ? `Сохранение: DAY ${State.campaign.day}/6 · квота ${Utils.fmt(State.campaign.quota)} · ${Utils.fmt(State.coins)} монет · ${State.tickets} 🎟`
          : 'Новая кампания — 6 дней, растущая квота, виртуальные монеты';
        const cont = Utils.$('#main-menu [data-menu="continue"]');
        cont.disabled = !has;
      }
    },
    showPause(v) { $('pause-menu').classList.toggle('hidden', !v); },

    /* ---------------- panels ---------------- */
    registerPanel(key, def) { this.panels[key] = def; },
    isOpen() { return !!this.openKey; },
    GAME_PANELS: ['slots', 'roulette', 'blackjack', 'dice', 'coinflip'],
    /** §44 a mini-game round in progress blocks panel switching */
    gameBusy() {
      const busy = (window.Slots && Slots.spinning) || (window.Roulette && Roulette.spinning)
        || (window.Dice && Dice.rolling) || (window.CoinFlip && CoinFlip.flipping)
        || (window.Blackjack && Blackjack.stage === 'dealer');
      if (!busy) { this._busySince = 0; return false; }
      const now = Date.now();
      if (!this._busySince) this._busySince = now;
      /* watchdog: never trap the player if a round animation dies */
      return now - this._busySince < 20000;
    },

    open(key, args) {
      const def = this.panels[key];
      if (!def) { console.warn('No panel: ' + key); return; }
      /* §44 only one game at a time */
      if (this.openKey && this.openKey !== key && this.GAME_PANELS.indexOf(key) >= 0) {
        Sound.play('deny');
        return;
      }
      if (this.openKey === key && this.GAME_PANELS.indexOf(key) >= 0) return;
      this.openKey = key;
      $('panel-title').textContent = def.title(args) || key.toUpperCase();
      const body = $('panel-body');
      body.innerHTML = '';
      body.scrollTop = 0;
      def.build(body, args || {});
      $('overlay').classList.remove('hidden');
      this.refreshHUD();
      Sound.play('open');
      Bus.emit('ui:open', { key });
      if (def.tick) {
        const h = setInterval(() => { if (this.openKey === key) def.tick(body); }, 1000);
        this._timers.push(h);
      }
    },
    close(force) {
      if (!this.openKey) return;
      const def = this.panels[this.openKey];
      this._timers.forEach(clearInterval); this._timers = [];
      const key = this.openKey;
      this.openKey = null;
      $('overlay').classList.add('hidden');
      $('panel-body').innerHTML = '';
      if (def && def.onClose) { try { def.onClose(); } catch (e) { console.error(e); } }
      Bus.emit('ui:close', { key });
    },
    rebuild() { if (this.openKey) { const k = this.openKey, d = this.panels[k]; const body = $('panel-body'); const sc = body.scrollTop; body.innerHTML = ''; d.build(body, {}); body.scrollTop = sc; this.refreshHUD(); } },

    /* ---------------- notifications & FX ---------------- */
    toast(o) {
      const wrap = $('toasts');
      if (!wrap) return;
      const t = Utils.el('div', 'toast ' + (o.type || ''),
        `<div class="ic">${o.icon || 'ℹ️'}</div><div><div class="tt">${Utils.escape(o.title || '')}</div>
         <div class="tx">${Utils.escape(o.text || '')}</div></div>`);
      wrap.appendChild(t);
      while (wrap.children.length > 5) wrap.removeChild(wrap.firstChild);
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, o.time || 4200);
    },
    sparks(count, color) {
      const wrap = $('sparks');
      if (!wrap) return;
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      for (let i = 0; i < count; i++) {
        const s = Utils.el('div', 'spark');
        const col = color === 'rainbow' ? Utils.choice(['#ff4d5e', '#ffc63a', '#25e39a', '#00e5ff', '#c07cff']) : (color || '#ffc63a');
        s.style.background = col;
        s.style.boxShadow = '0 0 10px ' + col;
        s.style.left = cx + 'px'; s.style.top = cy + 'px';
        wrap.appendChild(s);
        const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 320, dur = 700 + Math.random() * 700;
        const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
        s.animate([
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px,${dy + 180}px) rotate(${Math.random() * 720}deg) scale(.3)`, opacity: 0 }
        ], { duration: dur, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => s.remove();
      }
    },
    flash(alpha) {
      const f = $('flash');
      f.style.opacity = alpha == null ? .5 : alpha;
      setTimeout(() => f.style.opacity = 0, 90);
    },
    bigWin(text) {
      const d = Utils.el('div', 'bigwin', `<span>${Utils.escape(text)}</span>`);
      document.getElementById('app').appendChild(d);
      this.sparks(46, Inventory.effectColor());
      this.flash(.35);
      setTimeout(() => d.remove(), 1900);
    },
    levelUpFx(d) {
      Sound.play('levelup');
      const fx = $('levelup-fx');
      $('lu-sub').textContent = 'LEVEL ' + d.level + '  ·  +' + Utils.fmt(d.reward) + ' COINS';
      fx.classList.remove('hidden');
      this.sparks(40, '#ffc63a');
      setTimeout(() => fx.classList.add('hidden'), 2000);
      this.toast({ title: 'LEVEL UP → ' + d.level, text: `+${Utils.fmt(d.reward)} монет` + (d.unlock ? ' · ' + d.unlock.label : ''), icon: '⬆️', type: 'gold' });
      if (d.unlock) {
        setTimeout(() => {
          Sound.play('unlock');
          this.toast({ title: 'РАЗБЛОКИРОВАНО', text: d.unlock.label, icon: '🔓', type: 'pink', time: 6000 });
        }, 900);
      }
      this.refreshHUD();
    },

    confirm(title, text, onYes) {
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text;
      $('confirm').classList.remove('hidden');
      const yes = $('confirm-yes');
      const clone = yes.cloneNode(true);
      yes.parentNode.replaceChild(clone, yes);
      clone.addEventListener('click', () => { Sound.play('click'); this.hideConfirm(); onYes(); });
    },
    hideConfirm() { $('confirm').classList.add('hidden'); },

    /* ---------------- core panels ---------------- */
    registerCorePanels() {
      const self = this;

      /* ---- QUESTS ---- */
      this.registerPanel('quests', {
        title: () => 'QUESTS',
        build(body) {
          const main = Quests.mainList(), daily = Quests.dailyList();
          const wrap = Utils.el('div');
          if (State.campaign.started) {
            const cq = Quests.campaignList();
            wrap.appendChild(Utils.el('div', 'row between',
              `<div class="sect" style="margin:0">DAY ${State.campaign.day} QUESTS</div>
               <div class="muted">Награды помогают закрыть квоту${State.campaign.phase !== 'casino' ? ' · доступны в казино' : ''}</div>`));
            const cg = Utils.el('div', 'grid c2');
            cq.forEach(q => {
              const pct = Utils.clamp(q.value / q.target * 100, 0, 100);
              const card = Utils.el('div', 'card' + (q.claimed ? ' done' : ''));
              card.innerHTML = `<div class="row between"><h4>${q.def.name}</h4>
                  <span class="tag ${q.claimed ? 'gold' : ''}">${q.claimed ? 'CLAIMED' : q.done ? 'READY' : 'IN PROGRESS'}</span></div>
                <p>${q.def.desc}</p>
                <div class="bar"><i style="width:${pct}%"></i></div>
                <div class="row between"><span class="muted">${Utils.fmtShort(Math.min(q.value, q.target))} / ${Utils.fmtShort(q.target)}</span>
                  <span class="muted">🪙 ${Utils.fmt(q.def.coins)} &nbsp; ⭐ ${q.def.xp} XP</span></div>`;
              if (q.done && !q.claimed && State.campaign.phase === 'casino') {
                const b = Utils.el('button', 'btn gold sm', 'CLAIM REWARD');
                b.style.marginTop = '10px';
                b.addEventListener('click', () => { Quests.claimCampaign(q.def.id); self.rebuild(); });
                card.appendChild(b);
              }
              cg.appendChild(card);
            });
            wrap.appendChild(cg);
          }
          wrap.innerHTML = `<div class="row between"><div class="sect">DAILY QUESTS</div>
            <div class="muted">Обновление через <b id="q-timer">${Utils.timeLeft(Quests.timeToReset())}</b></div></div>`;
          const dg = Utils.el('div', 'grid c2');
          daily.forEach(q => dg.appendChild(questCard(q, self)));
          wrap.appendChild(dg);
          wrap.appendChild(Utils.el('div', 'sect', 'MAIN QUESTS'));
          const mg = Utils.el('div', 'grid c2');
          main.forEach(q => mg.appendChild(questCard(q, self)));
          wrap.appendChild(mg);
          body.appendChild(wrap);
        },
        tick(body) { const t = body.querySelector('#q-timer'); if (t) t.textContent = Utils.timeLeft(Quests.timeToReset()); }
      });

      function questCard(q, ui) {
        const pct = Utils.clamp(q.value / q.target * 100, 0, 100);
        const card = Utils.el('div', 'card' + (q.claimed ? ' done' : ''));
        card.innerHTML = `<div class="row between"><h4>${q.def.name}</h4>
            <span class="tag ${q.claimed ? 'gold' : ''}">${q.claimed ? 'CLAIMED' : q.done ? 'READY' : 'IN PROGRESS'}</span></div>
          <p>${q.def.desc}</p>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <div class="row between"><span class="muted">${Utils.fmtShort(Math.min(q.value, q.target))} / ${Utils.fmtShort(q.target)}</span>
            <span class="muted">🪙 ${Utils.fmt(q.def.coins)} &nbsp; ⭐ ${q.def.xp} XP</span></div>`;
          if (q.done && !q.claimed) {
          const b = Utils.el('button', 'btn gold sm', 'CLAIM REWARD');
          b.style.marginTop = '10px';
          b.addEventListener('click', () => { Quests.claim(q.def.id); ui.rebuild(); });
          card.appendChild(b);
        }
        return card;
      }

      /* ---- PROFILE ---- */
      this.registerPanel('profile', {
        title: () => 'PROFILE',
        build(body) {
          const s = State.stats, p = Progression.progress();
          const av = Inventory.equipped('avatar') || Inventory.get('av_default');
          const title = Inventory.title();
          const winRate = s.gamesPlayed ? (s.wins / s.gamesPlayed * 100).toFixed(1) : '0.0';
          body.innerHTML = `
            <div class="row" style="gap:18px;align-items:flex-start;flex-wrap:wrap">
              <div class="card center" style="min-width:210px;flex:1">
                <div style="font-size:64px">${av.icon}</div>
                <div class="big-num">${Utils.escape(State.name)}</div>
                ${title ? `<div class="tag gold" style="margin-top:6px">${title}</div>` : ''}
                <div class="muted" style="margin-top:10px">LEVEL ${State.level} / ${Progression.MAX_LEVEL}</div>
                <div class="bar"><i style="width:${p.pct}%"></i></div>
                <div class="muted">${State.level >= Progression.MAX_LEVEL ? 'MAX LEVEL' : Utils.fmt(p.xp) + ' / ' + Utils.fmt(p.need) + ' XP'}</div>
                <div class="big-num" style="color:var(--gold);margin-top:12px">🪙 ${Utils.fmt(State.coins)}</div>
              </div>
              <div style="flex:2;min-width:280px">
                <div class="sect">STATISTICS</div>
                <div class="stat-line"><span>Games Played</span><span>${Utils.fmt(s.gamesPlayed)}</span></div>
                <div class="stat-line"><span>Wins</span><span>${Utils.fmt(s.wins)}</span></div>
                <div class="stat-line"><span>Losses</span><span>${Utils.fmt(s.losses)}</span></div>
                <div class="stat-line"><span>Pushes</span><span>${Utils.fmt(s.pushes)}</span></div>
                <div class="stat-line"><span>Win Rate</span><span>${winRate}%</span></div>
                <div class="stat-line"><span>Best Win</span><span>${Utils.fmt(s.bestWin)}</span></div>
                <div class="stat-line"><span>Total Wager</span><span>${Utils.fmt(s.totalWager)}</span></div>
                <div class="stat-line"><span>Total Won</span><span>${Utils.fmt(s.totalWon)}</span></div>
                <div class="stat-line"><span>Slot Spins</span><span>${Utils.fmt(s.spins)}</span></div>
                <div class="stat-line"><span>Jackpots (777)</span><span>${Utils.fmt(s.jackpots)}</span></div>
                <div class="stat-line"><span>Quests Completed</span><span>${State.quests.claimed.length} / ${Quests.MAIN.length}</span></div>
                <div class="stat-line"><span>Achievements</span><span>${Achievements.earnedCount()} / ${Achievements.DEFS.length}</span></div>
                <div class="stat-line"><span>Daily Streak</span><span>${State.dailyReward.streak} дн.</span></div>
                <div class="stat-line"><span>Zones Visited</span><span>${State.visited.length} / 9</span></div>
                <div class="stat-line"><span>Play Time</span><span>${Math.floor(State.stats.playTime / 60)} мин</span></div>
                <div class="sect">CAMPAIGN</div>
                <div class="stat-line"><span>Current Day</span><span>${State.campaign.day} / 6</span></div>
                <div class="stat-line"><span>Days Completed</span><span>${State.campaign.daysCompleted}</span></div>
                <div class="stat-line"><span>Quota Completed</span><span>${Utils.fmt(State.stats.quotaPaid)}</span></div>
                <div class="stat-line"><span>Coins Earned</span><span>${Utils.fmt(State.stats.totalWon)}</span></div>
                <div class="stat-line"><span>Coins Lost</span><span>${Utils.fmt(State.stats.coinsLost)}</span></div>
                <div class="stat-line"><span>Tickets</span><span>${State.tickets} (всего ${State.stats.ticketsEarned})</span></div>
                <div class="stat-line"><span>Items Bought</span><span>${State.stats.itemsBought}</span></div>
                <div class="stat-line"><span>Days Failed / Retries</span><span>${State.stats.daysFailed} / ${State.campaign.retries}</span></div>
                <div class="stat-line"><span>Unlocked Floors</span><span>${State.campaign.floors.join(', ')}</span></div>
              </div>
            </div>
            <div class="sect" style="margin-top:18px">LEVEL REWARDS</div>
            <div class="grid c4" id="ms-grid"></div>`;
          const g = body.querySelector('#ms-grid');
          Progression.milestones().forEach(m => {
            g.appendChild(Utils.el('div', 'card' + (m.reached ? ' done' : ''),
              `<h4>LVL ${m.level}</h4><p>🪙 ${Utils.fmt(m.coins)}${m.unlock ? '<br>🔓 ' + m.unlock : ''}</p>`));
          });
        }
      });

      /* ---- SHOP ---- */
      this.registerPanel('shop', {
        title: () => 'SHOP',
        build(body) {
          body.appendChild(Utils.el('div', 'muted', 'Покупки за виртуальные монеты. Всё сохраняется автоматически.'));
          Object.keys(Inventory.TYPE_LABEL).forEach(type => {
            const items = Shop.items(type);
            if (!items.length) return;
            body.appendChild(Utils.el('div', 'sect', Inventory.TYPE_LABEL[type]));
            const g = Utils.el('div', 'grid c4');
            items.forEach(it => {
              const owned = Inventory.owns(it.id), eq = Inventory.isEquipped(it.id);
              const card = Utils.el('div', 'item' + (owned ? ' owned' : '') + (eq ? ' equipped' : ''));
              card.innerHTML = `<div class="ico">${it.icon}</div><div class="nm">${it.name}</div>
                <div class="row between"><span class="tag ${it.rarity}">${it.rarity.toUpperCase()}</span>
                <span class="pr">🪙 ${Utils.fmt(it.price)}</span></div>
                <p style="font-size:11px;color:var(--muted)">${it.desc}</p>`;
              const b = Utils.el('button', 'btn sm' + (owned ? '' : ' gold'),
                owned ? (eq ? 'EQUIPPED' : 'EQUIP') : 'BUY');
              b.disabled = owned && eq;
              b.addEventListener('click', () => {
                if (owned) Inventory.equip(it.id); else Shop.buy(it.id);
                self.rebuild();
              });
              card.appendChild(b);
              g.appendChild(card);
            });
            body.appendChild(g);
          });
        }
      });

      /* ---- INVENTORY ---- */
      this.registerPanel('inventory', {
        title: () => 'INVENTORY',
        build(body) {
          const owned = Inventory.ownedItems();
          body.appendChild(Utils.el('div', 'muted', `Предметов: ${owned.length} / ${Inventory.CATALOG.length}`));
          Object.keys(Inventory.TYPE_LABEL).forEach(type => {
            const items = owned.filter(i => i.type === type);
            if (!items.length) return;
            body.appendChild(Utils.el('div', 'sect', Inventory.TYPE_LABEL[type]));
            const g = Utils.el('div', 'grid c4');
            items.forEach(it => {
              const eq = Inventory.isEquipped(it.id);
              const card = Utils.el('div', 'item owned' + (eq ? ' equipped' : ''));
              card.innerHTML = `<div class="ico">${it.icon}</div><div class="nm">${it.name}</div>
                <div class="row between"><span class="tag ${it.rarity}">${it.rarity.toUpperCase()}</span>
                <span class="muted">x1</span></div>
                <p style="font-size:11px;color:var(--muted)">${it.desc}</p>`;
              const b = Utils.el('button', 'btn sm' + (eq ? '' : ' gold'), eq ? 'EQUIPPED ✓' : 'EQUIP');
              b.addEventListener('click', () => {
                if (eq && it.type !== 'avatar' && it.type !== 'theme') Inventory.unequip(it.type);
                else Inventory.equip(it.id);
                self.rebuild();
              });
              card.appendChild(b);
              g.appendChild(card);
            });
            body.appendChild(g);
          });
          if (!owned.length) body.appendChild(Utils.el('p', 'muted', 'Инвентарь пуст — заходи в SHOP.'));
        }
      });

      /* ---- ACHIEVEMENTS ---- */
      this.registerPanel('achievements', {
        title: () => 'ACHIEVEMENTS',
        build(body) {
          const list = Achievements.list();
          body.appendChild(Utils.el('div', 'muted', `Получено ${Achievements.earnedCount()} из ${list.length}`));
          const g = Utils.el('div', 'grid c3');
          g.style.marginTop = '12px';
          list.forEach(a => {
            g.appendChild(Utils.el('div', 'card' + (a.earned ? ' done' : ' locked'),
              `<div class="row"><div style="font-size:26px">${a.def.icon}</div>
               <div><h4>${a.def.name}</h4><p>${a.def.desc}</p></div></div>
               <div class="muted" style="margin-top:8px">${a.earned ? '✔ ПОЛУЧЕНО' : `🪙 ${Utils.fmt(a.def.coins)} · ⭐ ${a.def.xp} XP`}</div>`));
          });
          body.appendChild(g);
        }
      });

      /* ---- DAILY REWARD ---- */
      this.registerPanel('daily', {
        title: () => 'DAILY REWARD',
        build(body) {
          const idx = DailyReward.dayIndex(), claimed = DailyReward.claimedToday();
          const days = Utils.el('div', 'days');
          DAILY_REWARDS.forEach((amt, i) => {
            const cls = i < idx ? 'day claimed' : (i === idx && !claimed ? 'day today' : 'day');
            days.appendChild(Utils.el('div', cls,
              `<div class="d">DAY ${i + 1}</div><div class="amt">🪙 ${Utils.fmtShort(amt)}</div>
               <div class="d">${i === 6 ? 'BIG BONUS' : '+' + (120 + i * 40) + ' XP'}</div>`));
          });
          body.appendChild(days);
          const info = Utils.el('div', 'center');
          info.style.marginTop = '18px';
          info.innerHTML = `<div class="muted">Серия: <b>${State.dailyReward.streak}</b> дней подряд</div>
            <div class="muted" id="dr-timer" style="margin-top:6px">${claimed ? 'Следующая награда через ' + Utils.timeLeft(DailyReward.timeToNext()) : 'Награда доступна!'}</div>`;
          body.appendChild(info);
          const b = Utils.el('button', 'btn gold', claimed ? 'УЖЕ ПОЛУЧЕНО СЕГОДНЯ' : `CLAIM DAY ${idx + 1} · 🪙 ${Utils.fmt(DAILY_REWARDS[idx])}`);
          b.style.margin = '16px auto 0'; b.style.display = 'block';
          b.disabled = claimed;
          b.addEventListener('click', () => { if (DailyReward.claim()) self.rebuild(); });
          body.appendChild(b);
        },
        tick(body) {
          const t = body.querySelector('#dr-timer');
          if (t && DailyReward.claimedToday()) t.textContent = 'Следующая награда через ' + Utils.timeLeft(DailyReward.timeToNext());
        }
      });

      /* ---- SETTINGS ---- */
      this.registerPanel('settings', {
        title: () => 'SETTINGS',
        build(body) {
          const s = State.settings;
          const mk = (label, html) => {
            const f = Utils.el('div', 'field', `<label>${label}</label><div class="row">${html}</div>`);
            body.appendChild(f);
            return f;
          };
          body.appendChild(Utils.el('div', 'sect', 'GRAPHICS'));
          const q = mk('Graphics Quality', `<select id="st-q">
              <option value="low">LOW</option><option value="medium">MEDIUM</option><option value="high">HIGH</option></select>`);
          q.querySelector('#st-q').value = s.quality;
          q.querySelector('#st-q').addEventListener('change', e => {
            s.quality = e.target.value; Sound.play('click');
            Bus.emit('settings:changed', { quality: true }); Bus.emit('state:dirty');
          });
          const fov = mk('Field of View', `<input type="range" id="st-fov" min="60" max="110" step="1" value="${s.fov}"><span class="val" id="st-fov-v">${s.fov}°</span>`);
          fov.querySelector('#st-fov').addEventListener('input', e => {
            s.fov = +e.target.value; fov.querySelector('#st-fov-v').textContent = s.fov + '°';
            Bus.emit('settings:changed', { fov: true }); Bus.emit('state:dirty');
          });
          const fps = mk('Show FPS', `<input type="checkbox" id="st-fps" ${s.showFps ? 'checked' : ''}>`);
          fps.querySelector('#st-fps').addEventListener('change', e => { s.showFps = e.target.checked; self.refreshHUD(); Bus.emit('state:dirty'); });

          body.appendChild(Utils.el('div', 'sect', 'CONTROLS'));
          const sens = mk('Mouse Sensitivity', `<input type="range" id="st-sens" min="0.2" max="3" step="0.05" value="${s.sensitivity}"><span class="val" id="st-sens-v">${s.sensitivity.toFixed(2)}</span>`);
          sens.querySelector('#st-sens').addEventListener('input', e => {
            s.sensitivity = +e.target.value; sens.querySelector('#st-sens-v').textContent = s.sensitivity.toFixed(2);
            Bus.emit('settings:changed', {}); Bus.emit('state:dirty');
          });
          const inv = mk('Invert Y', `<input type="checkbox" id="st-inv" ${s.invertY ? 'checked' : ''}>`);
          inv.querySelector('#st-inv').addEventListener('change', e => { s.invertY = e.target.checked; Bus.emit('settings:changed', {}); Bus.emit('state:dirty'); });

          body.appendChild(Utils.el('div', 'sect', 'AUDIO'));
          [['master', 'Master Volume'], ['music', 'Music Volume'], ['sfx', 'SFX Volume']].forEach(([k, label]) => {
            const f = mk(label, `<input type="range" id="st-${k}" min="0" max="1" step="0.01" value="${s[k]}"><span class="val" id="st-${k}-v">${Math.round(s[k] * 100)}%</span>`);
            f.querySelector(`#st-${k}`).addEventListener('input', e => {
              s[k] = +e.target.value; f.querySelector(`#st-${k}-v`).textContent = Math.round(s[k] * 100) + '%';
              Sound.applySettings(); Bus.emit('settings:changed', {}); Bus.emit('state:dirty');
            });
          });

          body.appendChild(Utils.el('div', 'sect', 'SAVE DATA'));
          const row = Utils.el('div', 'row');
          const bs = Utils.el('button', 'btn sm', '💾 SAVE GAME');
          bs.addEventListener('click', () => { Save.SaveGame(); self.toast({ title: 'SAVED', text: 'Прогресс записан в LocalStorage', icon: '💾' }); });
          const br = Utils.el('button', 'btn sm danger', '🗑 RESET SAVE');
          br.addEventListener('click', () => {
            self.confirm('RESET SAVE?', 'Весь прогресс (монеты, уровень, квесты, инвентарь) будет удалён безвозвратно.', () => {
              Save.ResetSave();
              Bus.emit('game:toMenu');
              self.close();
              self.toast({ title: 'SAVE RESET', text: 'Прогресс сброшен', icon: '🗑', type: 'red' });
            });
          });
          row.appendChild(bs); row.appendChild(br);
          body.appendChild(row);
        }
      });

      /* ---- CONTROLS ---- */
      this.registerPanel('controls', {
        title: () => 'CONTROLS',
        build(body) {
          body.innerHTML = `
            <div class="grid c2">
              <div class="card"><h4>ДВИЖЕНИЕ</h4>
                <p><kbd>W</kbd> вперёд<br><kbd>S</kbd> назад<br><kbd>A</kbd> влево<br><kbd>D</kbd> вправо<br>
                <kbd>⇧</kbd> бег<br><kbd>␣</kbd> прыжок</p></div>
              <div class="card"><h4>КАМЕРА</h4><p>Мышь — обзор (Pointer Lock)<br>Клик по игре — захват курсора<br><kbd>ESC</kbd> — освободить курсор / пауза</p></div>
              <div class="card"><h4>ВЗАИМОДЕЙСТВИЕ</h4><p><kbd>E</kbd> — использовать объект<br>Наведи прицел на автомат или стол</p></div>
              <div class="card"><h4>БЫСТРЫЕ ПАНЕЛИ</h4>
                <p><kbd>J</kbd> квесты<br><kbd>P</kbd> профиль<br><kbd>I</kbd> инвентарь<br><kbd>K</kbd> достижения<br><kbd>O</kbd> магазин<br><kbd>L</kbd> daily reward</p></div>
            </div>`;
        }
      });
    }
  };


  /* ============================================================
     CAMPAIGN UI — quota HUD, cinematic layer, story screens,
     PREPARE / CASHIER / ELEVATOR / TV panels
     ============================================================ */
  Object.assign(UI, {
    /* ---------------- campaign HUD ---------------- */
    refreshCampaign() {
      const hud = $('campaign-hud');
      if (!hud || !window.DayManager || !window.State) return;
      const c = State.campaign;
      const HUD_STATES = ['CASINO', 'PLAYING_GAME', 'HOME', 'PREPARATION', 'FINAL_BOSS'];
      const show = c.started && !c.finished && Game && HUD_STATES.indexOf(Game.state) >= 0
        && !(window.Cinematic && Cinematic.playing);
      hud.classList.toggle('hidden', !show);
      if (!show) return;
      const s = DayManager.summary();
      const atHome = c.phase !== 'casino';
      $('ch-day').textContent = s.day;
      $('ch-time').textContent = atHome ? '08:00' : s.time;
      $('ch-earn').textContent = atHome ? '0' : Utils.fmt(Math.max(0, s.earnings));
      $('ch-quota').textContent = Utils.fmt(s.quota);
      $('ch-fill').style.width = (atHome ? 0 : s.progress) + '%';
      $('ch-floor').textContent = atHome ? 'HOME' : 'FLOOR ' + s.floor;
      const met = !atHome && s.earnings >= s.quota;
      hud.classList.toggle('met', met);
      hud.classList.toggle('danger', !met && s.minutesLeft <= 120);
      $('ch-status').textContent = atHome
        ? (c.daysCompleted >= c.day ? 'День закрыт — ложись спать' : 'Собери квоту в казино до 22:00')
        : met
          ? (DayManager.isFinalDay() ? 'Квота собрана — к владельцу на 3 этаж' : 'Квота собрана — иди в кассу')
          : `Осталось ${Utils.fmt(s.quota - Math.max(0, s.earnings))} · ${Math.floor(s.minutesLeft / 60)}ч ${s.minutesLeft % 60}м`;
    },

    /* ---------------- cinematic layer ---------------- */
    cinematicOn(on, skippable) {
      $('cine').classList.toggle('hidden', !on);
      document.body.classList.toggle('cinematic', !!on);
      $('cine-skip').style.display = skippable === false ? 'none' : '';
      if (!on) this.subtitle('');
      this.refreshCampaign();
    },
    subtitle(text) {
      const el = $('subtitle');
      if (!el) return;
      el.textContent = text || '';
      el.style.opacity = text ? 1 : 0;
    },
    cineTitle(main, sub) {
      const t = $('cine-title');
      $('ct-main').textContent = main || '';
      $('ct-sub').textContent = sub || '';
      t.classList.remove('hidden');
      clearTimeout(this._ctTimer);
      this._ctTimer = setTimeout(() => t.classList.add('hidden'), 3200);
    },
    hideCineTitle() { $('cine-title').classList.add('hidden'); },
    fadeTo(alpha, ms) {
      const f = $('fade');
      if (!f) return;
      f.style.transition = `opacity ${Math.max(60, ms || 600)}ms linear`;
      f.style.opacity = alpha;
    },

    /* ---------------- story screens ---------------- */
    _screen(id, v) { const e = $(id); if (e) e.classList.toggle('hidden', !v); },
    hideStoryScreens() {
      ['day-intro', 'day-complete', 'game-over', 'victory'].forEach(id => this._screen(id, false));
    },

    showDayIntro(onGo) {
      const c = State.campaign, d = DayManager.def();
      const texts = [
        'Первый день. Владелец казино ждёт свою долю. Разберись, как устроены игры, и собери квоту до 22:00.',
        'Второй этаж открыт: ставки выше, но и время идёт так же быстро. Квота выросла.',
        'Третий день. Одной удачи мало — выбирай игры с лучшим соотношением времени и выплаты.',
        'VIP-этаж открыт. Крупные лимиты, крупные риски. Предметы из PREPARE начинают решать.',
        'Предфинальный день. Ошибка стоит слишком дорого. Используй все этажи и все бонусы.',
        'ФИНАЛЬНЫЙ ДЕНЬ. Последняя квота — и владелец отпустит тебя. Соберись.'
      ];
      $('di-day').textContent = `DAY ${c.day} / 6`;
      $('di-quota').textContent = Utils.fmt(c.quota);
      $('di-time').textContent = '08:00';
      const over = Math.max(0, c.prevEarnings - c.prevQuota);
      $('di-text').innerHTML = Utils.escape(texts[Utils.clamp(c.day - 1, 0, 5)]) +
        `<br><br><span class="muted">Базовая квота дня: ${Utils.fmt(d.quota)}` +
        (over > 0 ? ` · перевыполнение прошлого дня ${Utils.fmt(over)} × 1.5 = +${Utils.fmt(Math.round(over * 1.5))}` : '') +
        ` · максимум дня: ${Utils.fmt(d.max)}<br>Лимит ставки: ${Utils.fmt(d.cap)} · Tickets за день: ${d.tickets} 🎟</span>`;
      this._screen('day-intro', true);
      const b = $('di-go');
      const fresh = b.cloneNode(true);
      b.parentNode.replaceChild(fresh, b);
      fresh.addEventListener('click', () => {
        Sound.play('click');
        this._screen('day-intro', false);
        if (onGo) onGo();
      });
    },

    showDayComplete(d, onGo) {
      $('dc-title').textContent = d.final ? 'FINAL QUOTA PAID' : `DAY ${d.day} COMPLETE`;
      $('dc-rewards').innerHTML = `
        <div class="rw"><span class="k">QUOTA PAID</span><span class="v">${Utils.fmt(d.quota)}</span></div>
        <div class="rw"><span class="k">EARNED</span><span class="v">${Utils.fmt(d.earnings)}</span></div>
        <div class="rw"><span class="k">TICKETS</span><span class="v">+${d.tickets} 🎟</span></div>
        <div class="rw"><span class="k">XP</span><span class="v">+${Utils.fmt(d.xp)}</span></div>`;
      const nextQ = d.final ? 0 : DayManager.computeNextQuota(d.day + 1);
      $('dc-text').innerHTML = d.final
        ? 'Долг закрыт. Владелец больше ничего не требует.'
        : `Перевыполнение: <b>${Utils.fmt(d.over)}</b> монет.<br>Квота следующего дня: <b style="color:#ffc63a">${Utils.fmt(nextQ)}</b>` +
        (d.over > 0 ? ` <span class="muted">(база ${Utils.fmt(DayManager.def(d.day + 1).quota)} + ${Utils.fmt(d.over)} × 1.5)</span>` : '') +
        `<br><span class="muted">Потрать Tickets в PREPARE дома — предметы реально влияют на игру.</span>`;
      $('dc-go').textContent = d.final ? 'К ВЛАДЕЛЬЦУ' : 'ЕХАТЬ ДОМОЙ';
      this._screen('day-complete', true);
      const b = $('dc-go');
      const fresh = b.cloneNode(true);
      b.parentNode.replaceChild(fresh, b);
      fresh.addEventListener('click', () => {
        Sound.play('click');
        this._screen('day-complete', false);
        if (onGo) onGo();
      });
    },

    showGameOver(d, handlers) {
      $('go-day').textContent = 'DAY ' + d.day;
      $('go-nums').textContent = `${Utils.fmt(Math.max(0, d.earnings))} / ${Utils.fmt(d.quota)}`;
      $('go-text').innerHTML = d.reason === 'clock'
        ? 'Часы показали 22:00, а квота не собрана. Владелец не принимает объяснений.<br><span class="muted">RETRY DAY начнёт этот день заново. Tickets, уровень, предметы и открытые этажи сохранятся.</span>'
        : 'Квота не собрана.<br><span class="muted">RETRY DAY начнёт этот день заново.</span>';
      this._screen('game-over', true);
      const mk = (id, fn) => {
        const b = $(id), fresh = b.cloneNode(true);
        b.parentNode.replaceChild(fresh, b);
        fresh.addEventListener('click', () => { Sound.play('click'); this._screen('game-over', false); fn(); });
      };
      mk('go-retry', handlers.onRetry);
      mk('go-menu', handlers.onMenu);
    },

    showVictory(onMenu) {
      const s = State.stats, c = State.campaign;
      $('vc-stats').innerHTML = `
        <div class="rw"><span class="k">DAYS</span><span class="v">6 / 6</span></div>
        <div class="rw"><span class="k">QUOTA PAID</span><span class="v">${Utils.fmtShort(s.quotaPaid)}</span></div>
        <div class="rw"><span class="k">GAMES</span><span class="v">${Utils.fmt(s.gamesPlayed)}</span></div>
        <div class="rw"><span class="k">BEST WIN</span><span class="v">${Utils.fmtShort(s.bestWin)}</span></div>
        <div class="rw"><span class="k">TICKETS</span><span class="v">${s.ticketsEarned} 🎟</span></div>
        <div class="rw"><span class="k">RETRIES</span><span class="v">${c.retries}</span></div>`;
      this._screen('victory', true);
      const b = $('vc-menu'), fresh = b.cloneNode(true);
      b.parentNode.replaceChild(fresh, b);
      fresh.addEventListener('click', () => { Sound.play('click'); this._screen('victory', false); onMenu(); });
    },

    /* ---------------- campaign panels ---------------- */
    registerCampaignPanels() {
      const self = this;

      /* ---- PREPARE: buy items with tickets ---- */
      this.registerPanel('prepare', {
        title: () => 'PREPARE FOR THE NIGHT',
        build(body) {
          body.appendChild(Utils.el('div', 'row between',
            `<div class="sect" style="margin:0">ITEMS</div>
             <div class="muted">TICKETS: <b class="tick-badge">${State.tickets} 🎟</b></div>`));
          body.appendChild(Utils.el('div', 'muted',
            'Tickets выдаются за закрытые дни. Предметы покупаются один раз и работают всю кампанию. Максимальный эффект одного предмета — около 10%, гарантии победы нет.'));
          const g = Utils.el('div', 'grid c3');
          g.style.marginTop = '12px';
          Items.CATALOG.forEach(it => {
            const owned = Items.has(it.id);
            const card = Utils.el('div', 'item item-card' + (owned ? ' owned equipped' : ''));
            card.innerHTML = `<div class="ico">${it.icon}</div><div class="nm">${it.name}</div>
              <div class="row between"><span class="tag ${it.rarity}">${it.rarity.toUpperCase()}</span>
              <span class="pr tick-badge">${it.price} 🎟</span></div>
              <p style="font-size:11px;color:var(--muted)">${it.desc}</p>
              <div class="muted" style="font-size:11px">Эффект: ${it.effect}</div>`;
            const b = Utils.el('button', 'btn sm' + (owned ? '' : ' gold'), owned ? 'КУПЛЕНО ✓' : 'BUY');
            b.disabled = owned || State.tickets < it.price;
            b.addEventListener('click', () => { if (Items.buy(it.id)) self.rebuild(); });
            card.appendChild(b);
            g.appendChild(card);
          });
          body.appendChild(g);

          const sum = Items.summary();
          body.appendChild(Utils.el('div', 'sect', 'АКТИВНЫЕ ЭФФЕКТЫ'));
          body.appendChild(Utils.el('div', null,
            `<div class="stat-line"><span>Шанс в Slots / Coin Flip</span><span>${sum.luck}</span></div>
             <div class="stat-line"><span>Бонус к выигрышу</span><span>${sum.payout}</span></div>
             <div class="stat-line"><span>Коэффициенты Dice</span><span>${sum.dice}</span></div>
             <div class="stat-line"><span>Safety Card</span><span>${sum.safety}</span></div>
             <div class="stat-line"><span>VIP Pass (+15% лимит)</span><span>${sum.vip}</span></div>`));
        }
      });

      /* ---- CASHIER: pay the quota ---- */
      this.registerPanel('quota', {
        title: () => 'CASHIER',
        build(body) {
          const s = DayManager.summary();
          const met = s.earnings >= s.quota;
          body.innerHTML = `
            <div class="quota-big">
              <div class="q-sub">DAY ${s.day} / 6 · QUOTA</div>
              <div class="q-nums">${Utils.fmt(Math.max(0, s.earnings))} / ${Utils.fmt(s.quota)}</div>
              <div class="bar" style="max-width:420px;margin:12px auto"><i style="width:${s.progress}%"></i></div>
              <div class="q-sub">TIME ${s.time} · ДО ЗАКРЫТИЯ ${Math.floor(s.minutesLeft / 60)}ч ${s.minutesLeft % 60}м</div>
            </div>
            <div class="story-rewards">
              <div class="rw"><span class="k">COINS</span><span class="v">${Utils.fmt(State.coins)}</span></div>
              <div class="rw"><span class="k">BET LIMIT</span><span class="v">${Utils.fmtShort(s.cap)}</span></div>
              <div class="rw"><span class="k">TICKETS</span><span class="v">${State.tickets} 🎟</span></div>
              <div class="rw"><span class="k">FLOORS</span><span class="v">${s.floors.join('·')}</span></div>
            </div>`;
          const info = Utils.el('p', 'muted');
          info.style.marginTop = '16px';
          info.innerHTML = met
            ? (DayManager.isFinalDay()
              ? 'Финальная квота собрана. Кассир направляет тебя к владельцу — 3 этаж, приватный офис.'
              : 'Квота собрана. Сдай её и отправляйся домой — перевыполнение увеличит квоту следующего дня в 1.5 раза.')
            : `Не хватает <b>${Utils.fmt(s.quota - Math.max(0, s.earnings))}</b> монет. Кассир не примет неполную квоту.`;
          body.appendChild(info);
          const b = Utils.el('button', 'btn ' + (met ? 'gold' : ''), met ? (DayManager.isFinalDay() ? 'К ВЛАДЕЛЬЦУ' : 'СДАТЬ КВОТУ') : 'КВОТА НЕ СОБРАНА');
          b.style.cssText = 'margin:18px auto 0;display:block;min-width:260px';
          b.disabled = !met;
          b.addEventListener('click', () => {
            const r = DayManager.payQuota();
            if (r.ok) self.close();
            else if (r.reason === 'boss') {
              self.close();
              self.toast({ title: 'ВЛАДЕЛЕЦ ЖДЁТ', text: 'Поднимись на 3 этаж в приватный офис', icon: '🕴️', type: 'gold', time: 6000 });
            } else Sound.play('deny');
          });
          body.appendChild(b);
        },
        tick(body) { }
      });

      /* ---- ELEVATOR ---- */
      this.registerPanel('elevator', {
        title: () => 'ELEVATOR',
        build(body) {
          body.appendChild(Utils.el('div', 'muted', 'Этажи открываются по мере прохождения кампании.'));
          const info = [
            { f: 1, name: 'FLOOR 1 · MAIN HALL', sub: 'Slots · Roulette · Blackjack · Dice · Coin Flip · Cashier' },
            { f: 2, name: 'FLOOR 2 · SILVER LOUNGE', sub: 'Advanced Slots · High Risk Roulette · Card Room (Day 2)' },
            { f: 3, name: 'FLOOR 3 · GOLD VIP', sub: 'VIP Slots · High Roller Tables · Owner (Day 4)' }
          ];
          info.forEach(it => {
            const un = DayManager.floorUnlocked(it.f);
            const cur = State.campaign.floor === it.f;
            const b = Utils.el('button', 'floor-btn' + (cur ? ' current' : ''),
              `<span>${it.name}<div class="fl-sub">${it.sub}</div></span>
               <span>${cur ? 'ВЫ ЗДЕСЬ' : un ? '▲' : '🔒 LOCKED'}</span>`);
            b.disabled = !un || cur;
            b.addEventListener('click', () => { self.close(); Bus.emit('elevator:go', { floor: it.f }); });
            body.appendChild(b);
          });
        }
      });

      /* ---- TV at home ---- */
      this.registerPanel('tv', {
        title: () => 'TV',
        build(body) {
          const c = State.campaign, d = DayManager.def();
          body.innerHTML = `
            <div class="sect">NEON NEWS · КАНАЛ КАЗИНО</div>
            <div class="card"><h4>QUOTA WATCH</h4>
              <p>День ${c.day} из 6. Квота дня: <b style="color:#ffc63a">${Utils.fmt(c.quota)}</b> монет.
              Лимит ставки: ${Utils.fmt(d.cap)}. Награда за день: ${d.tickets} 🎟.</p></div>
            <div class="sect">СОВЕТЫ ВЕДУЩЕГО</div>
            <div class="grid c2">
              <div class="card"><h4>ВРЕМЯ = РЕСУРС</h4><p>Slots 10 мин, Dice 15, Roulette 20, Blackjack 25, VIP 30.
                За день всего 840 минут. Считай выигрыш на минуту, а не за раунд.</p></div>
              <div class="card"><h4>HOUSE PROMO</h4><p>Рулетка возвращает ${Math.round(DayManager.promo('roulette') * 100)}% ставки,
                блэкджек ${Math.round(DayManager.promo('blackjack') * 100)}%. На старших этажах промо выше.</p></div>
              <div class="card"><h4>ПЕРЕВЫПОЛНЕНИЕ</h4><p>Каждая лишняя монета сверх квоты добавит 1.5 монеты к квоте
                следующего дня. Иногда выгоднее закрыть день ровно.</p></div>
              <div class="card"><h4>ПРЕДМЕТЫ</h4><p>Tickets тратятся в PREPARE. Coin Magnet и Lucky Dice работают всю кампанию,
                Safety Card перезаряжается каждый день.</p></div>
            </div>`;
        }
      });

      /* ---- STORY / HOW TO PLAY (main menu) ---- */
      this.registerPanel('story', {
        title: () => 'STORY',
        build(body) {
          body.innerHTML = `
            <div class="sect">ИСТОРИЯ</div>
            <p class="muted">Ты должен казино. Владелец назначил график: шесть дней, каждый день — квота.
              Утро начинается дома, вечер — в зале NEON PALACE. Не собрал квоту до 22:00 — день проигран.</p>
            <div class="sect">ЦИКЛ ДНЯ</div>
            <p class="muted">HOME → PREPARE (предметы за Tickets) → ЧЁРНАЯ МАШИНА → КАТСЦЕНА → КАЗИНО →
              ИГРЫ → КВОТА В КАССУ → TICKETS → ДОМОЙ → СОН → СЛЕДУЮЩИЙ ДЕНЬ.</p>
            <div class="sect">КВОТЫ</div>
            <div class="grid c3">
              ${DayManager.DAYS.map(d => `<div class="card"><h4>DAY ${d.day}</h4>
                <p>Квота: <b style="color:#ffc63a">${Utils.fmt(d.quota)}</b><br>
                Максимум: ${Utils.fmt(d.max)}<br>Лимит ставки: ${Utils.fmt(d.cap)}<br>
                Награда: ${d.tickets} 🎟<br>Этажи: ${d.floors.join(', ')}</p></div>`).join('')}
            </div>
            <div class="sect">ДИНАМИЧЕСКАЯ КВОТА</div>
            <p class="muted">nextQuota = базовая квота дня + (перевыполнение × 1.5), но не выше максимума дня.</p>
            <div class="sect">УПРАВЛЕНИЕ</div>
            <p class="muted">WASD — движение, мышь — обзор, SHIFT — бег, SPACE — прыжок,
              E — взаимодействие, ESC — меню, J — квесты, P — профиль, I — инвентарь, M — статус дня.</p>
            <p class="muted">Вся валюта в игре виртуальная. Реальных ставок и выплат нет.</p>`;
        }
      });
    }
  });

  // ---- multiplayer helpers ----
  Object.assign(UI, {
    showLobby(v){
      const lobby=document.getElementById('mp-lobby');
      const menu=document.getElementById('main-menu');
      if(lobby) lobby.classList.toggle('hidden', !v);
      if(v && menu) menu.classList.add('hidden');
      if(v){
        const nameIn=document.getElementById('mp-name');
        if(nameIn && !nameIn.value) nameIn.value=(window.State&&State.name)||'Player';
        const status=document.getElementById('mp-lobby-status');
        if(status){
          if(!Network.isConnected() && location.protocol!=='file:') status.textContent='CONNECTING TO SERVER...';
          else if(Network.isConnected()) status.textContent='CONNECTED — выбери комнату';
          else status.textContent='OFFLINE — запусти npm start';
        }
      }
    },
    hideLobby(){ const e=document.getElementById('mp-lobby'); if(e) e.classList.add('hidden'); },
    showRoom(room, you){
      const el=document.getElementById('mp-room');
      if(!el) return;
      el.classList.remove('hidden');
      this.updateRoom(room);
    },
    updateRoom(room){
      if(!room) return;
      const codeEl=document.getElementById('room-code');
      if(codeEl) codeEl.textContent=room.code||'------';
      const cnt=document.getElementById('room-count');
      if(cnt) cnt.textContent= (room.players?room.players.length:0) + ' / 2 PLAYERS';
      const list=document.getElementById('room-players');
      if(list){
        list.innerHTML='';
        (room.players||[]).forEach(p=>{
          const card=document.createElement('div');
          card.className='mp-player-card'+(p.ready?' ready':'');
          const isYou = window.Network && Network.you && p.id===Network.you.id;
          card.innerHTML=`<div class="av">${isYou?'😎':'👤'}</div><div style="flex:1"><div class="nm">${Utils.escape(p.name)}${isYou?' (YOU)':''}</div><div class="st">${p.ready?'READY ✓':'NOT READY'}</div></div><div class="tag ${p.ready?'gold':''}">${p.ready?'READY':'WAIT'}</div>`;
          list.appendChild(card);
        });
        if((room.players||[]).length<2){
          const w=document.createElement('div');
          w.className='mp-player-card'; w.style.opacity='.55';
          w.innerHTML=`<div class="av">…</div><div class="nm">WAITING FOR PLAYER 2</div>`;
          list.appendChild(w);
        }
      }
      const readyBtn=document.getElementById('room-ready');
      const startBtn=document.getElementById('room-start');
      const status=document.getElementById('room-status');
      if(readyBtn){
        const me=room.players && Network.you ? room.players.find(p=>p.id===Network.you.id):null;
        if(me) { 
          const canStart=room.players && room.players.length===2 && room.players.every(p=>p.ready);
          if(me.ready){
            readyBtn.textContent='✓ READY — ОТМЕНИТЬ';
            readyBtn.classList.remove('gold');
            readyBtn.style.opacity= canStart ? '0.6' : '1';
          } else {
            readyBtn.textContent='READY ✓';
            readyBtn.classList.add('gold');
            readyBtn.style.opacity='1';
          }
          // прячем кнопку отмены когда уже можно стартовать — чтобы не путать (по желанию можно оставить)
          // если хочешь полностью скрыть: readyBtn.classList.toggle('hidden', canStart && me.ready);
        }
      }
      if(startBtn){
        const canStart=room.players && room.players.length===2 && room.players.every(p=>p.ready);
        startBtn.classList.toggle('hidden', !canStart);
        startBtn.disabled=!canStart;
      }
      if(status){
        if(!room.players || room.players.length<2) status.textContent='Ожидание второго игрока... Введи код на втором устройстве';
        else if(room.players.every(p=>p.ready)) status.textContent='Оба READY — хост может нажать START GAME';
        else status.textContent='Нажми READY, когда готов';
      }
      this.refreshCampaign();
      this.refreshHUD();
      // also update campaign HUD multiplayer part
      const mpHud=document.getElementById('mp-hud');
      const mpPlayers=document.getElementById('mp-hud-players');
      const mpTeam=document.getElementById('mp-hud-team');
      if(mpHud && mpPlayers && mpTeam){
        if(room.players && room.players.length===2 && Network.isOnline()){
          mpHud.classList.remove('hidden');
          document.getElementById('ch-label').textContent='TEAM QUOTA';
          mpPlayers.innerHTML=room.players.map(p=> `<span>${Utils.escape(p.name)}: <b style="color:${Network.you&&p.id===Network.you.id?'#7dffcf':'#ffc63a'}">${Utils.fmt(p.dayEarnings||0)}</b> · ${Utils.fmt(p.coins)} 🪙</span>`).join('');
          mpTeam.textContent=`TEAM: ${Utils.fmt(room.teamEarnings||0)} / ${Utils.fmt(room.quota)} · TIME ${Math.floor((room.time||0)/60+8)}:${String((room.time||0)%60).padStart(2,'0')}`;
        } else { mpHud.classList.add('hidden'); const cl=document.getElementById('ch-label'); if(cl) cl.textContent='QUOTA'; }
      }
    },
    hideRoom(){ const e=document.getElementById('mp-room'); if(e) e.classList.add('hidden'); },
    hideLobbyRoomAll(){ this.hideLobby(); this.hideRoom(); const c=document.getElementById('mp-connect'); if(c) c.classList.add('hidden'); },
    showConnectOverlay(show, text){
      const el=document.getElementById('mp-connect'); if(!el) return;
      el.classList.toggle('hidden', !show);
      if(text){ const t=el.querySelector('.mp-connect-text'); if(t) t.textContent=text; }
    },
    addChat(d){
      const log=document.getElementById('chat-log');
      if(!log) return;
      const wasHidden=log.style.display==='none' || getComputedStyle(log).display==='none';
      log.style.display='flex';
      // не показываем поле ввода автоматически — только по T
      const line=document.createElement('div');
      const isSys=d.id==='system';
      line.className=isSys?'sys':'';
      const safeName=Utils.escape(d.name||'Unknown');
      const safeText=Utils.escape(d.text||'');
      line.innerHTML= isSys ? `<i>${safeText}</i>` : `<b>${safeName}:</b> ${safeText}`;
      log.appendChild(line);
      log.scrollTop=log.scrollHeight;
      setTimeout(()=>{ if(log.children.length>50) log.removeChild(log.firstChild); },0);
      // автоскрытие через 7 сек если чат не открыт вручную и не в фокусе
      clearTimeout(this._chatHideTimer);
      const input=document.getElementById('chat-input');
      const isInputFocused=document.activeElement===input;
      if(!isInputFocused){
        this._chatHideTimer=setTimeout(()=>{
          const row=document.getElementById('chat-input-row');
          const log2=document.getElementById('chat-log');
          if(document.activeElement!==input) {
            // не скрываем если мышь над чатом
            if(log2 && !log2.matches(':hover') && (!row || !row.matches(':hover'))){
              log2.style.display='none';
            }
          }
        }, 7000);
      }
    },
    toggleChat(show){
      const log=document.getElementById('chat-log');
      const row=document.getElementById('chat-input-row');
      const input=document.getElementById('chat-input');
      if(show===undefined) show = log.style.display==='none';
      log.style.display= show ? 'flex' : 'none';
      row.style.display= show ? 'flex' : 'none';
      if(show && input) setTimeout(()=>input.focus(), 30);
    }
  });

  window.UI = UI;
  window.DailyReward = DailyReward;
})();
