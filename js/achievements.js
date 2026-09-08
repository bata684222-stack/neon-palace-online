/* ============================================================
   achievements.js — 24 achievements with live checking
   ============================================================ */
(function () {
  'use strict';

  const DEFS = [
    { id: 'first_spin', name: 'FIRST SPIN', icon: '🎰', desc: 'Сделать первое вращение', coins: 200, xp: 50, check: s => s.counters.spins >= 1 },
    { id: 'first_win', name: 'FIRST WIN', icon: '🍀', desc: 'Первая победа', coins: 300, xp: 60, check: s => s.counters.wins >= 1 },
    { id: 'lucky', name: 'LUCKY', icon: '🎯', desc: 'Победить 10 раз', coins: 600, xp: 120, check: s => s.counters.wins >= 10 },
    { id: 'lucky777', name: 'LUCKY 7-7-7', icon: '7️⃣', desc: 'Собрать 777 на слотах', coins: 2000, xp: 400, check: s => s.stats.jackpots >= 1 },
    { id: 'slot_master', name: 'SLOT MASTER', icon: '🕹️', desc: '100 вращений слотов', coins: 1500, xp: 300, check: s => s.counters.spins >= 100 },
    { id: 'roulette_master', name: 'ROULETTE MASTER', icon: '🔴', desc: '50 раундов рулетки', coins: 1800, xp: 350, check: s => s.counters.roulette >= 50 },
    { id: 'blackjack_player', name: 'BLACKJACK PLAYER', icon: '🃏', desc: 'Сыграть блэкджек', coins: 300, xp: 60, check: s => s.counters.blackjack >= 1 },
    { id: 'blackjack_pro', name: 'BLACKJACK PRO', icon: '♠️', desc: 'Собрать натуральный блэкджек', coins: 1200, xp: 250, check: s => s.flags && s.flags.naturalBJ },
    { id: 'dice_roller', name: 'DICE ROLLER', icon: '🎲', desc: '25 бросков кубиков', coins: 1000, xp: 200, check: s => s.counters.dice >= 25 },
    { id: 'coin_master', name: 'COIN MASTER', icon: '🪙', desc: '20 подбрасываний монеты', coins: 900, xp: 180, check: s => s.counters.coinflip >= 20 },
    { id: 'explorer', name: 'EXPLORER', icon: '🧭', desc: 'Посетить все основные зоны', coins: 1200, xp: 240, check: s => s.visited.filter(z => z !== 'vip').length >= 8 },
    { id: 'big_winner', name: 'BIG WINNER', icon: '💰', desc: 'Выигрыш 5 000+ за раунд', coins: 1500, xp: 300, check: s => s.stats.bestWin >= 5000 },
    { id: 'jackpot', name: 'JACKPOT HUNTER', icon: '💎', desc: 'Выигрыш 20 000+ за раунд', coins: 4000, xp: 700, check: s => s.stats.bestWin >= 20000 },
    { id: 'level_5', name: 'LEVEL 5', icon: '⭐', desc: 'Достичь 5 уровня', coins: 500, xp: 0, check: s => s.level >= 5 },
    { id: 'level_10', name: 'LEVEL 10', icon: '🌟', desc: 'Достичь 10 уровня', coins: 1000, xp: 0, check: s => s.level >= 10 },
    { id: 'level_20', name: 'LEVEL 20', icon: '✨', desc: 'Достичь 20 уровня', coins: 3000, xp: 0, check: s => s.level >= 20 },
    { id: 'level_30', name: 'LEGEND', icon: '👑', desc: 'Достичь 30 уровня', coins: 10000, xp: 0, check: s => s.level >= 30 },
    { id: 'vip', name: 'VIP', icon: '🥇', desc: 'Войти в VIP-зону', coins: 2000, xp: 400, check: s => s.visited.indexOf('vip') >= 0 },
    { id: 'games_100', name: '100 GAMES', icon: '🎮', desc: 'Сыграть 100 игр', coins: 2000, xp: 400, check: s => s.counters.games >= 100 },
    { id: 'games_500', name: '500 GAMES', icon: '🏆', desc: 'Сыграть 500 игр', coins: 8000, xp: 1200, check: s => s.counters.games >= 500 },
    { id: 'quest_master', name: 'QUEST MASTER', icon: '📋', desc: 'Завершить 10 квестов', coins: 2500, xp: 500, check: s => s.quests.claimed.length >= 10 },
    { id: 'shopper', name: 'SHOPPER', icon: '🛍️', desc: 'Купить предмет в магазине', coins: 300, xp: 60, check: s => s.inventory.owned.length >= 1 },
    { id: 'collector', name: 'COLLECTOR', icon: '🎁', desc: 'Владеть 8 предметами', coins: 2500, xp: 500, check: s => s.inventory.owned.length >= 8 },
    { id: 'daily_devotee', name: 'DAILY DEVOTEE', icon: '📅', desc: 'Серия ежедневных наград 7 дней', coins: 3000, xp: 600, check: s => s.dailyReward.streak >= 7 },
    { id: 'millionaire', name: 'HIGH SOCIETY', icon: '🏦', desc: 'Иметь 100 000 монет', coins: 5000, xp: 1000, check: s => s.coins >= 100000 },
    { id: 'wager_king', name: 'WAGER KING', icon: '📈', desc: 'Поставить всего 250 000', coins: 6000, xp: 1000, check: s => s.counters.wager >= 250000 }
  ];

  const Achievements = {
    DEFS,
    has(id) { return State.achievements.indexOf(id) >= 0; },
    list() { return DEFS.map(d => ({ def: d, earned: this.has(d.id) })); },
    earnedCount() { return State.achievements.filter(id => DEFS.some(d => d.id === id)).length; },

    unlock(id) {
      const def = DEFS.find(d => d.id === id);
      if (!def || this.has(id)) return false;
      State.achievements.push(id);
      if (def.coins) Economy.add(def.coins, 'achievement');
      if (def.xp) Progression.addXp(def.xp);
      Sound.play('achievement');
      Bus.emit('achievement:earned', def);
      Bus.emit('state:dirty');
      return true;
    },

    checkAll() {
      if (!window.State) return;
      if (!State.flags) State.flags = {};
      for (const d of DEFS) {
        if (this.has(d.id)) continue;
        let ok = false;
        try { ok = !!d.check(State); } catch (e) { ok = false; }
        if (ok) this.unlock(d.id);
      }
    }
  };

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; Achievements.checkAll(); }, 120);
  }
  ['metric', 'coins:changed', 'level:up', 'game:result', 'zone:visited', 'quest:claimed', 'shop:bought', 'daily:claimed', 'save:loaded'].forEach(ev => Bus.on(ev, schedule));

  window.Achievements = Achievements;
})();
