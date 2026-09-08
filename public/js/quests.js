/* ============================================================
   quests.js — main quest line + rotating daily quests
   ============================================================ */
(function () {
  'use strict';

  const MAIN = [
    { id: 'beginner', name: 'BEGINNER', desc: 'Сыграть 5 игр', target: 5, coins: 500, xp: 100, val: s => s.counters.games },
    { id: 'lucky', name: 'LUCKY PLAYER', desc: 'Выиграть 3 раза', target: 3, coins: 750, xp: 150, val: s => s.counters.wins },
    { id: 'slotfan', name: 'SLOT FAN', desc: 'Сделать 20 вращений слотов', target: 20, coins: 1000, xp: 250, val: s => s.counters.spins },
    { id: 'explorer', name: 'EXPLORER', desc: 'Посетить все основные зоны казино (8)', target: 8, coins: 1500, xp: 300, val: s => s.visited.filter(z => z !== 'vip').length },
    { id: 'roul_rookie', name: 'ROULETTE ROOKIE', desc: 'Сыграть 10 раундов рулетки', target: 10, coins: 1200, xp: 300, val: s => s.counters.roulette },
    { id: 'card_shark', name: 'CARD SHARK', desc: 'Сыграть 10 раздач в блэкджек', target: 10, coins: 1200, xp: 300, val: s => s.counters.blackjack },
    { id: 'dice_master', name: 'DICE MASTER', desc: 'Сделать 15 бросков кубиков', target: 15, coins: 1500, xp: 350, val: s => s.counters.dice },
    { id: 'flipper', name: 'COIN FLIPPER', desc: 'Подбросить монету 15 раз', target: 15, coins: 1200, xp: 300, val: s => s.counters.coinflip },
    { id: 'high_roller', name: 'HIGH ROLLER', desc: 'Поставить всего 50 000 монет', target: 50000, coins: 3000, xp: 600, val: s => s.counters.wager },
    { id: 'whale', name: 'WHALE', desc: 'Выиграть 25 000 монет чистыми', target: 25000, coins: 4000, xp: 800, val: s => s.counters.coinsWon },
    { id: 'vip_member', name: 'VIP MEMBER', desc: 'Достичь Level 15 и войти в VIP-зону', target: 1, coins: 5000, xp: 1000, val: s => (s.level >= 15 && s.visited.indexOf('vip') >= 0) ? 1 : 0 },
    { id: 'veteran', name: 'CASINO VETERAN', desc: 'Сыграть 150 игр', target: 150, coins: 6000, xp: 1200, val: s => s.counters.games }
  ];

  const DAILY_POOL = [
    { id: 'd_spins', name: '10 SPINS', desc: 'Сделать 10 вращений слотов', target: 10, coins: 600, xp: 120, key: 'spins' },
    { id: 'd_wins', name: '3 WINS', desc: 'Победить 3 раза', target: 3, coins: 800, xp: 150, key: 'wins' },
    { id: 'd_roul', name: 'VISIT ROULETTE', desc: 'Сыграть 3 раунда рулетки', target: 3, coins: 700, xp: 140, key: 'roulette', req: 'roulette' },
    { id: 'd_bj', name: 'PLAY BLACKJACK', desc: 'Сыграть 2 раздачи блэкджека', target: 2, coins: 700, xp: 140, key: 'blackjack', req: 'blackjack' },
    { id: 'd_earn', name: 'EARN 1000 COINS', desc: 'Заработать 1000 монет чистыми', target: 1000, coins: 900, xp: 180, key: 'coinsWon' },
    { id: 'd_dice', name: 'DICE NIGHT', desc: 'Сделать 5 бросков кубиков', target: 5, coins: 600, xp: 120, key: 'dice' },
    { id: 'd_flip', name: 'FLIP MASTER', desc: 'Подбросить монету 5 раз', target: 5, coins: 500, xp: 110, key: 'coinflip' },
    { id: 'd_wager', name: 'WAGER 2000', desc: 'Поставить 2000 монет', target: 2000, coins: 700, xp: 140, key: 'wager' },
    { id: 'd_games', name: 'BUSY NIGHT', desc: 'Сыграть 8 игр', target: 8, coins: 800, xp: 160, key: 'games' }
  ];

  /* ---- campaign day quests (§37): small rewards that help with the quota ---- */
  const CAMPAIGN_POOL = [
    { id: 'c_play', name: 'PLAY 5 GAMES', desc: 'Сыграть 5 раундов за день', target: 5, coins: 500, xp: 100, key: 'games' },
    { id: 'c_win', name: 'WIN 3 GAMES', desc: 'Выиграть 3 раунда за день', target: 3, coins: 750, xp: 150, key: 'wins' },
    { id: 'c_wager', name: 'WAGER', desc: 'Поставить {t} монет за день', target: 5000, coins: 600, xp: 120, key: 'wager', scaleTarget: true },
    { id: 'c_slots', name: 'SPIN THE REELS', desc: 'Сыграть 6 раз в слоты', target: 6, coins: 500, xp: 110, key: 'slots' },
    { id: 'c_floor2', name: 'PLAY ON FLOOR 2', desc: 'Сыграть 3 раунда на 2 этаже', target: 3, coins: 1000, xp: 250, key: 'floor2', minDay: 2 },
    { id: 'c_floor3', name: 'PLAY ON FLOOR 3', desc: 'Сыграть 3 раунда в VIP-зоне', target: 3, coins: 1500, xp: 400, key: 'floor3', minDay: 4 },
    { id: 'c_table', name: 'TABLE GAMES', desc: 'Сыграть 4 раунда рулетки или блэкджека', target: 4, coins: 900, xp: 200, key: 'table', minDay: 2 }
  ];
  /* reward scale per campaign day — keeps quests useful without breaking the economy */
  const DAY_SCALE = [1, 1.5, 4, 10, 25, 60];

  const DAILY_KEYS = ['games', 'wins', 'spins', 'coinsWon', 'wager', 'slots', 'roulette', 'blackjack', 'dice', 'coinflip'];

  function seededPick(list, count, seedStr) {
    let h = 0;
    for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) & 0x7fffffff;
    const pool = list.slice(), out = [];
    while (out.length < count && pool.length) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      out.push(pool.splice(h % pool.length, 1)[0]);
    }
    return out;
  }

  const Quests = {
    MAIN, DAILY_POOL,

    ensureDaily() {
      const today = Utils.dayKey();
      if (State.daily.day !== today) {
        const picks = seededPick(DAILY_POOL.filter(q => !q.req || Progression.isUnlocked(q.req)), 4, today + State.name);
        State.daily = { day: today, quests: picks.map(p => p.id), claimed: [], counters: {} };
        DAILY_KEYS.forEach(k => State.daily.counters[k] = 0);
        Bus.emit('state:dirty');
        Bus.emit('daily:reset');
      }
      if (!State.daily.counters) State.daily.counters = {};
      DAILY_KEYS.forEach(k => { if (typeof State.daily.counters[k] !== 'number') State.daily.counters[k] = 0; });
    },

    dailyList() {
      this.ensureDaily();
      return State.daily.quests.map(id => {
        const def = DAILY_POOL.find(q => q.id === id);
        if (!def) return null;
        const value = State.daily.counters[def.key] || 0;
        return {
          def, value, target: def.target,
          done: value >= def.target,
          claimed: State.daily.claimed.indexOf(def.id) >= 0
        };
      }).filter(Boolean);
    },

    /* ================= campaign day quests ================= */
    campaignScale(day) { return DAY_SCALE[Utils.clamp((day || State.campaign.day) - 1, 0, 5)]; },

    ensureCampaignDay(reset) {
      const c = State.campaign;
      if (!c.counters) c.counters = {};
      if (reset) c.claimed = [];
      if (!Array.isArray(c.claimed)) c.claimed = [];
    },

    campaignDefs(day) {
      day = day || State.campaign.day;
      const scale = this.campaignScale(day);
      return CAMPAIGN_POOL.filter(q => !q.minDay || day >= q.minDay).map(q => {
        const target = q.scaleTarget ? Math.round(q.target * scale / 100) * 100 : q.target;
        return {
          id: q.id, name: q.name, key: q.key,
          desc: q.desc.replace('{t}', Utils.fmt(target)),
          target: target,
          coins: Math.round(q.coins * scale / 10) * 10,
          xp: Math.round(q.xp * (1 + (day - 1) * 0.35))
        };
      });
    },

    campaignValue(key) {
      const c = State.campaign.counters || {};
      if (key === 'table') return (c.roulette || 0) + (c.blackjack || 0);
      return c[key] || 0;
    },

    campaignList() {
      this.ensureCampaignDay(false);
      return this.campaignDefs().map(def => {
        const value = this.campaignValue(def.key);
        return {
          def, value, target: def.target,
          done: value >= def.target,
          claimed: State.campaign.claimed.indexOf(def.id) >= 0
        };
      });
    },

    claimCampaign(id) {
      const q = this.campaignList().find(x => x.def.id === id);
      if (!q || !q.done || q.claimed) { Sound.play('deny'); return false; }
      if (State.campaign.phase !== 'casino') { Sound.play('deny'); return false; }
      State.campaign.claimed.push(id);
      Economy.add(q.def.coins, 'quest');
      Progression.addXp(q.def.xp);
      Sound.play('quest');
      Bus.emit('quest:claimed', { quest: q.def, campaign: true });
      Bus.emit('state:dirty');
      return true;
    },

    mainList() {
      return MAIN.map(def => {
        const value = def.val(State);
        return {
          def, value, target: def.target,
          done: value >= def.target,
          claimed: State.quests.claimed.indexOf(def.id) >= 0
        };
      });
    },

    claimable() {
      return this.mainList().filter(q => q.done && !q.claimed).length +
        this.dailyList().filter(q => q.done && !q.claimed).length +
        (State.campaign.phase === 'casino' ? this.campaignList().filter(q => q.done && !q.claimed).length : 0);
    },

    claim(id) {
      let q = this.mainList().find(x => x.def.id === id);
      let daily = false;
      if (!q) { q = this.dailyList().find(x => x.def.id === id); daily = true; }
      if (!q || !q.done || q.claimed) { Sound.play('deny'); return false; }
      (daily ? State.daily.claimed : State.quests.claimed).push(id);
      Economy.add(q.def.coins, 'quest');
      Progression.addXp(q.def.xp);
      Sound.play('quest');
      Bus.emit('quest:claimed', { quest: q.def, daily });
      Bus.emit('metric', { key: 'questsDone', value: State.quests.claimed.length + State.daily.claimed.length });
      Bus.emit('state:dirty');
      return true;
    },

    questsCompleted() { return State.quests.claimed.length; },
    timeToReset() { return Utils.nextMidnight() - Date.now(); }
  };

  /* daily counters fed by metric events */
  Bus.on('metric', m => {
    Quests.ensureDaily();
    const c = State.daily.counters;
    let key = m.key;
    if (key.indexOf('game:') === 0) key = key.slice(5);
    if (DAILY_KEYS.indexOf(key) >= 0 && m.add) {
      c[key] = (c[key] || 0) + m.add;
      Bus.emit('state:dirty');
    }
  });

  window.Quests = Quests;
})();
