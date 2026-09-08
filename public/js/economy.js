/* ============================================================
   economy.js — virtual coin balance, bets, payouts, statistics
   ALL currency in this game is fictional. No real money.
   ============================================================ */
(function () {
  'use strict';

  const Economy = {
    get coins() { return State.coins; },

    canAfford(n) { return State.coins >= n; },

    add(n, reason) {
      n = Math.round(n);
      if (!n) return State.coins;
      State.coins = Math.max(0, State.coins + n);
      Bus.emit('coins:changed', { delta: n, reason: reason || '' });
      Bus.emit('state:dirty');
      if (State.coins >= 100000) Bus.emit('metric', { key: 'richest', value: State.coins });
      return State.coins;
    },

    spend(n, reason) {
      n = Math.round(n);
      if (n <= 0) return true;
      if (State.coins < n) { Bus.emit('economy:denied', { need: n }); return false; }
      State.coins -= n;
      Bus.emit('coins:changed', { delta: -n, reason: reason || '' });
      Bus.emit('state:dirty');
      return true;
    },

    /* ---------------- TICKETS (second currency, items only) ---------------- */
    get tickets() { return State.tickets; },
    addTickets(n, reason) {
      n = Math.round(n);
      if (!n) return State.tickets;
      State.tickets = Math.max(0, State.tickets + n);
      if (n > 0) State.stats.ticketsEarned += n;
      Bus.emit('tickets:changed', { delta: n, reason: reason || '' });
      Bus.emit('state:dirty');
      return State.tickets;
    },
    spendTickets(n, reason) {
      n = Math.round(n);
      if (n <= 0) return true;
      if (State.tickets < n) { Bus.emit('economy:denied', { needTickets: n }); return false; }
      State.tickets -= n;
      Bus.emit('tickets:changed', { delta: -n, reason: reason || '' });
      Bus.emit('state:dirty');
      return true;
    },

    /**
     * Anti-exploit bet validation. Returns {ok, reason, amount}.
     * Rejects: NaN, <=0, above balance, above the daily table limit, below table minimum.
     */
    validateBet(game, amount, cfg) {
      amount = Math.floor(Number(amount));
      if (!isFinite(amount) || amount <= 0) return { ok: false, reason: 'Ставка должна быть больше 0', amount: 0 };
      const lim = window.DayManager ? DayManager.betLimit(game, cfg) : { min: 1, max: 1e12 };
      if (amount < lim.min) return { ok: false, reason: 'Минимальная ставка: ' + Utils.fmt(lim.min), amount };
      if (amount > lim.max) return { ok: false, reason: 'Лимит стола: ' + Utils.fmt(lim.max), amount };
      if (amount > State.coins) return { ok: false, reason: 'НЕ ХВАТАЕТ МОНЕТ', amount };
      return { ok: true, amount };
    },

    /** Take a bet: deducts coins and records wager. Returns false if too poor. */
    bet(amount, game) {
      amount = Math.round(amount);
      if (amount <= 0) return false;
      if (!this.spend(amount, 'bet:' + game)) return false;
      State.stats.totalWager += amount;
      State.counters.wager += amount;
      Bus.emit('metric', { key: 'wager', add: amount });
      Sound.play('bet');
      return true;
    },

    /**
     * Settle a finished round.
     * @param {string} game  slots|roulette|blackjack|dice|coinflip
     * @param {number} bet   total staked this round (already deducted by bet())
     * @param {number} payout total coins returned (0 = total loss, bet = push)
     */
    settle(game, bet, payout, meta) {
      payout = Math.round(payout);
      meta = meta || {};

      /* ---- house promo + item bonuses (this is what makes the quota beatable) ---- */
      const promo = window.DayManager ? DayManager.promo(game) : 0;   // cashback share of the stake
      let bonus = Math.round(bet * promo);
      const rawNet = payout - bet;
      if (rawNet > 0 && window.Items) bonus += Math.round(rawNet * Items.payoutBonus());
      /* ---- Safety Card: one charge per day softens a losing round ---- */
      let safety = 0;
      if (rawNet < 0 && window.Items && Items.useSafety(bet)) {
        safety = Math.round(bet * 0.5);
        Bus.emit('item:safety', { game, refund: safety });
      }
      payout += bonus + safety;

      const net = payout - bet;
      if (payout > 0) this.add(payout, 'win:' + game);

      const st = State.stats;
      st.gamesPlayed++;
      State.counters.games++;
      State.counters[game] = (State.counters[game] || 0) + 1;

      let outcome;
      if (net > 0) {
        outcome = 'win';
        st.wins++; State.counters.wins++;
        st.totalWon += payout;
        State.counters.coinsWon += net;
        if (net > st.bestWin) st.bestWin = net;
      } else if (net === 0 && payout > 0) {
        outcome = 'push'; st.pushes++;
      } else {
        outcome = 'lose'; st.losses++;
        st.coinsLost += (bet - payout);
      }

      // XP: participation + performance
      let xp = 8 + Math.floor(bet / 25);
      if (outcome === 'win') xp += 15 + Math.floor(net / 120);
      xp = Math.min(xp, 900);

      Bus.emit('metric', { key: 'games', add: 1 });
      Bus.emit('metric', { key: 'game:' + game, add: 1 });
      if (outcome === 'win') {
        Bus.emit('metric', { key: 'wins', add: 1 });
        Bus.emit('metric', { key: 'coinsWon', add: net });
        Bus.emit('metric', { key: 'bestWin', value: net });
      }
      meta.promo = bonus;
      meta.safety = safety;
      Bus.emit('game:result', { game, bet, payout, net, outcome, meta });
      Progression.addXp(xp);
      /* every finished round costs in-game time (campaign clock) */
      if (window.DayManager) DayManager.onRound(game, bet, net, meta);
      Bus.emit('state:dirty');
      return { net, outcome, xp, promo: bonus, safety };
    },

    /** slots reel spin counter (each spin, independent of settle) */
    countSpin() {
      State.stats.spins++;
      State.counters.spins++;
      Bus.emit('metric', { key: 'spins', add: 1 });
      Bus.emit('state:dirty');
    }
  };

  window.Economy = Economy;
})();
