/* ============================================================
   progression.js — XP, 30 levels, rewards, area/game unlocks
   ============================================================ */
(function () {
  'use strict';

  const UNLOCKS = {
    5: { key: 'roulette', label: 'ROULETTE UNLOCKED' },
    8: { key: 'dicehigh', label: 'HIGH-STAKES DICE UNLOCKED' },
    10: { key: 'blackjack', label: 'BLACKJACK UNLOCKED' },
    12: { key: 'luckyslots', label: 'LUCKY SLOTS (higher bets) UNLOCKED' },
    15: { key: 'vip', label: 'VIP AREA UNLOCKED' },
    20: { key: 'vipslots', label: 'VIP DIAMOND SLOTS UNLOCKED' },
    25: { key: 'hightable', label: 'HIGH-ROLLER BLACKJACK UNLOCKED' },
    30: { key: 'legend', label: 'TITLE: LEGEND OF NEON PALACE' }
  };

  // requirement lookup: feature -> level
  const REQ = { slots: 1, dice: 1, coinflip: 1, roulette: 5, dicehigh: 8, blackjack: 10, luckyslots: 12, vip: 15, vipslots: 20, hightable: 25, legend: 30 };

  const MAX_LEVEL = 30;
  const table = [];   // xp needed to advance FROM level i (1-based)
  for (let l = 1; l <= MAX_LEVEL; l++) table[l] = Math.round(400 * Math.pow(1.15, l - 1) / 10) * 10;

  const Progression = {
    MAX_LEVEL, UNLOCKS, REQ,
    xpForLevel(l) { return l >= MAX_LEVEL ? Infinity : table[l]; },
    levelReward(l) { return 500 + (l - 2) * 250; },

    progress() {
      const need = this.xpForLevel(State.level);
      return {
        level: State.level,
        xp: State.xp,
        need: need === Infinity ? State.xp : need,
        pct: need === Infinity ? 100 : Utils.clamp(State.xp / need * 100, 0, 100)
      };
    },

    addXp(n) {
      if (n <= 0) return;
      if (State.level >= MAX_LEVEL) { State.xp += n; Bus.emit('xp:changed'); return; }
      State.xp += n;
      Bus.emit('xp:changed', { add: n });
      let guard = 0;
      while (State.level < MAX_LEVEL && State.xp >= this.xpForLevel(State.level) && guard++ < 40) {
        State.xp -= this.xpForLevel(State.level);
        State.level++;
        this.onLevelUp(State.level);
      }
      Bus.emit('state:dirty');
    },

    onLevelUp(level) {
      const reward = this.levelReward(level);
      Economy.add(reward, 'levelup');
      const unlock = UNLOCKS[level];
      if (unlock && State.unlockedAreas.indexOf(unlock.key) < 0) State.unlockedAreas.push(unlock.key);
      Bus.emit('level:up', { level, reward, unlock });
      Bus.emit('metric', { key: 'level', value: level });
      Bus.emit('state:dirty');
    },

    /* during the 6-day campaign the tables are gated by the STORY DAY, not by
       the free-play level — otherwise day 1 would lock out roulette/blackjack */
    CAMPAIGN_DAY: { roulette: 1, blackjack: 1, dicehigh: 2, luckyslots: 2, vip: 3, vipslots: 4, hightable: 4 },

    inCampaign() {
      const c = State.campaign;
      return !!(c && c.started && !c.finished);
    },

    isUnlocked(key) {
      if (!key) return true;
      if (this.inCampaign()) {
        const d = this.CAMPAIGN_DAY[key];
        if (d !== undefined) return State.campaign.day >= d;
      }
      const need = REQ[key];
      if (!need) return true;
      return State.level >= need;
    },
    requiredLevel(key) { return REQ[key] || 1; },
    /** human readable requirement, campaign aware */
    lockText(key) {
      if (this.inCampaign() && this.CAMPAIGN_DAY[key] !== undefined) return 'DAY ' + this.CAMPAIGN_DAY[key];
      return 'LEVEL ' + this.requiredLevel(key);
    },

    /** list for the profile / level panel */
    milestones() {
      const out = [];
      for (let l = 2; l <= MAX_LEVEL; l++) {
        out.push({ level: l, coins: this.levelReward(l), unlock: UNLOCKS[l] ? UNLOCKS[l].label : null, reached: State.level >= l });
      }
      return out;
    }
  };

  window.Progression = Progression;
})();
