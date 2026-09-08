/* ============================================================
   save.js — LocalStorage persistence: SaveGame / LoadGame / ResetSave
   ============================================================ */
(function () {
  'use strict';
  const KEY = 'neonpalace_save_v1';
  const MAX_COINS = 5e7;          // hard ceiling for a legit 6-day campaign
  const MAX_STAT = 1e10;
  /* §16 the campaign quota can never exceed the day maximum */
  const QUOTA_MAX = [30000, 30000, 80000, 200000, 450000, 1000000];

  function defaults() {
    return {
      version: 2,
      name: 'PLAYER',
      created: Date.now(),
      lastPlayed: Date.now(),
      coins: 10000,
      tickets: 0,
      xp: 0,
      level: 1,
      /* ---- 6-day story campaign ---- */
      campaign: {
        started: false,
        finished: false,
        day: 1,                 // 1..6
        phase: 'home',          // home | casino | done
        time: 0,                // minutes since 08:00 (0..840)
        quota: 5000,            // quota of the CURRENT day
        dayStartCoins: 0,       // coins at the moment the casino day began
        prevEarnings: 0,        // earnings of the previous finished day
        prevQuota: 0,
        daysCompleted: 0,
        floors: [1],            // unlocked casino floors
        floor: 1,               // floor the player currently stands on
        retries: 0,
        safetyUsed: false,      // Safety Card charge spent today
        bossReady: false,       // final quota reached -> owner is waiting
        seenIntro: false,
        counters: { games: 0, wins: 0, losses: 0, wager: 0, won: 0, lost: 0, floor2: 0, floor3: 0, slots: 0, roulette: 0, blackjack: 0, dice: 0, coinflip: 0 },
        claimed: [],            // campaign day-quest ids claimed today
        history: []             // [{day, quota, earnings, tickets}]
      },
      items: { owned: [] },     // campaign items bought with Tickets
      upgrades: { bet_boost:0, luck_boost:0, payout_boost:0 },
      stats: {
        gamesPlayed: 0, wins: 0, losses: 0, pushes: 0,
        bestWin: 0, totalWager: 0, totalWon: 0, spins: 0,
        playTime: 0, jackpots: 0,
        coinsLost: 0, quotaPaid: 0, daysCompleted: 0,
        ticketsEarned: 0, itemsBought: 0, daysFailed: 0
      },
      counters: {           // lifetime metrics used by quests/achievements
        games: 0, wins: 0, spins: 0, coinsWon: 0, wager: 0,
        slots: 0, roulette: 0, blackjack: 0, dice: 0, coinflip: 0, zones: 0
      },
      quests: { claimed: [] },
      daily: { day: null, quests: [], claimed: [], counters: {} },
      dailyReward: { lastDay: null, streak: 0 },
      achievements: [],
      inventory: { owned: [], equipped: { avatar: 'av_default', frame: null, title: null, effect: null, theme: 'th_neon' } },
      unlockedAreas: [],
      visited: [],
      settings: {
        quality: 'high', fov: 75, sensitivity: 1.0, invertY: false,
        master: 0.7, music: 0.45, sfx: 0.8, showFps: true
      }
    };
  }

  function deepMerge(base, over) {
    if (over === null || over === undefined) return base;
    if (typeof base !== 'object' || Array.isArray(base) || base === null) return over;
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k in over) out[k] = deepMerge(base[k], over[k]);
    return out;
  }

  /* ---- anti-exploit: never trust LocalStorage content ---- */
  function num(v, min, max, def) {
    v = typeof v === 'number' && isFinite(v) ? v : def;
    return Math.min(max, Math.max(min, v));
  }
  function arr(v) { return Array.isArray(v) ? v.filter(x => typeof x === 'string' || typeof x === 'number') : []; }

  function sanitize(d) {
    d.coins = Math.floor(num(d.coins, 0, MAX_COINS, 10000));
    d.tickets = Math.floor(num(d.tickets, 0, 9999, 0));
    d.level = Math.floor(num(d.level, 1, 30, 1));
    d.xp = Math.floor(num(d.xp, 0, 1e9, 0));
    if (typeof d.name !== 'string' || !d.name) d.name = 'PLAYER';
    d.name = String(d.name).slice(0, 18);
    const c = d.campaign;
    c.day = Math.floor(num(c.day, 1, 6, 1));
    c.time = num(c.time, 0, 840, 0);
    const qMax = QUOTA_MAX[Utils.clamp(c.day - 1, 0, 5)];
    c.quota = Math.floor(num(c.quota, 1, qMax, 5000));
    if (!(c.quota > 0)) c.quota = 5000;
    c.dayStartCoins = Math.floor(num(c.dayStartCoins, 0, MAX_COINS, 0));
    c.prevEarnings = Math.floor(num(c.prevEarnings, -MAX_COINS, MAX_COINS, 0));
    c.prevQuota = Math.floor(num(c.prevQuota, 0, 1000000, 0));
    c.daysCompleted = Math.floor(num(c.daysCompleted, 0, 6, 0));
    c.retries = Math.floor(num(c.retries, 0, 9999, 0));
    if (['home', 'casino', 'done'].indexOf(c.phase) < 0) c.phase = 'home';
    c.floors = arr(c.floors).map(n => Math.floor(num(+n, 1, 3, 1)));
    if (!c.floors.length) c.floors = [1];
    c.floor = Math.floor(num(c.floor, 1, 3, 1));
    if (c.floors.indexOf(c.floor) < 0) c.floor = 1;
    c.claimed = arr(c.claimed);
    if (!Array.isArray(c.history)) c.history = [];
    for (const k in c.counters) c.counters[k] = Math.floor(num(c.counters[k], 0, MAX_STAT, 0));
    for (const k in d.stats) d.stats[k] = num(d.stats[k], 0, MAX_STAT, 0);
    for (const k in d.counters) d.counters[k] = num(d.counters[k], 0, MAX_STAT, 0);
    /* only known item ids may exist in the save */
    const ITEM_IDS = ['lucky_charm', 'coin_magnet', 'lucky_dice', 'safety_card', 'vip_pass'];
    d.items.owned = arr(d.items.owned).filter((v, i, a) => ITEM_IDS.indexOf(v) >= 0 && a.indexOf(v) === i);
    if(!d.upgrades) d.upgrades={ bet_boost:0, luck_boost:0, payout_boost:0 };
    ['bet_boost','luck_boost','payout_boost'].forEach(k=> d.upgrades[k]=Math.floor(num(d.upgrades[k],0,3,0)));
    d.inventory.owned = arr(d.inventory.owned);
    d.achievements = arr(d.achievements);
    d.unlockedAreas = arr(d.unlockedAreas);
    d.visited = arr(d.visited);
    const s = d.settings;
    s.quality = ['low', 'medium', 'high'].indexOf(s.quality) >= 0 ? s.quality : 'high';
    s.fov = num(s.fov, 60, 110, 75);
    s.sensitivity = num(s.sensitivity, 0.2, 3, 1);
    ['master', 'music', 'sfx'].forEach(k => s[k] = num(s[k], 0, 1, .7));
    return d;
  }

  const Save = {
    key: KEY,
    defaults,
    sanitize,
    hasSave() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } },
    /** true only when the save actually contains player progress */
    hasProgress() {
      const s = window.State;
      if (!s) return this.hasSave();
      return (s.level || 1) > 1 || (s.xp || 0) > 0 ||
        (s.stats && s.stats.gamesPlayed > 0) ||
        (s.quests && s.quests.claimed.length > 0) ||
        (s.achievements && s.achievements.length > 0) ||
        (s.inventory && s.inventory.owned.length > 0) ||
        (s.campaign && s.campaign.started) ||
        s.coins !== 10000;
    },
    LoadGame() {
      let raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
      let data = defaults();
      if (raw) {
        try { data = deepMerge(defaults(), JSON.parse(raw)); }
        catch (e) { console.warn('Save corrupted, using defaults', e); data = defaults(); }
      }
      window.State = sanitize(data);
      Bus.emit('save:loaded', data);
      return data;
    },
    SaveGame(silent) {
      if (!window.State) return false;
      try {
        State.lastPlayed = Date.now();
        localStorage.setItem(KEY, JSON.stringify(State));
        if (!silent) Bus.emit('save:saved');
        return true;
      } catch (e) { console.warn('Save failed', e); return false; }
    },
    ResetSave() {
      try { localStorage.removeItem(KEY); } catch (e) { }
      window.State = defaults();
      Bus.emit('save:reset');
      return window.State;
    },
    info() {
      if (!this.hasSave()) return null;
      try {
        const d = JSON.parse(localStorage.getItem(KEY));
        return {
          level: d.level || 1, coins: d.coins || 0, lastPlayed: d.lastPlayed || 0,
          day: (d.campaign && d.campaign.day) || 1,
          finished: !!(d.campaign && d.campaign.finished)
        };
      } catch (e) { return null; }
    }
  };

  // autosave (debounced) whenever something meaningful changes
  let pending = null;
  Bus.on('state:dirty', () => {
    if (pending) return;
    pending = setTimeout(() => { pending = null; Save.SaveGame(true); }, 1200);
  });

  window.Save = Save;
  window.SaveGame = () => Save.SaveGame();
  window.LoadGame = () => Save.LoadGame();
  window.ResetSave = () => Save.ResetSave();
})();
