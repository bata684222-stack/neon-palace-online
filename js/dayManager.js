/* ============================================================
   dayManager.js — the 6-day story campaign
   day / quota / clock / bet limits / rewards / floors / win / loss
   ALL money is virtual in-game Coins.
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------
     DAY TABLE
     quota    — base quota of the day (§13)
     max      — hard ceiling for the dynamic quota (§16)
     cap      — maximum single bet allowed that day
     bank     — chip credit: the day always starts with at least this much
     tickets  — reward for closing the day (§5)
     floors   — casino floors unlocked from this day on (§11)
     --------------------------------------------------------- */
  const DAYS = [
    { day: 1, quota: 5000, max: 5000, cap: 2000, bank: 8000, tickets: 3, floors: [1] },
    { day: 2, quota: 15000, max: 30000, cap: 6000, bank: 24000, tickets: 4, floors: [1, 2] },
    { day: 3, quota: 40000, max: 80000, cap: 16000, bank: 64000, tickets: 5, floors: [1, 2] },
    { day: 4, quota: 100000, max: 200000, cap: 40000, bank: 160000, tickets: 6, floors: [1, 2, 3] },
    { day: 5, quota: 250000, max: 450000, cap: 100000, bank: 400000, tickets: 8, floors: [1, 2, 3] },
    { day: 6, quota: 600000, max: 1000000, cap: 240000, bank: 900000, tickets: 10, floors: [1, 2, 3] }
  ];

  const OVER_MULT = 1.5;          // §14 overpayment multiplier
  const DAY_START_MIN = 8 * 60;   // 08:00
  const DAY_END_MIN = 22 * 60;    // 22:00
  const DAY_MINUTES = DAY_END_MIN - DAY_START_MIN;   // 840 in-game minutes
  const REAL_SECONDS_PER_MINUTE = 1.15;              // the clock also ticks slowly by itself

  /* time cost of one finished round (§24) */
  const TIME_COST = { slots: 10, roulette: 20, blackjack: 25, dice: 15, coinflip: 5 };

  /* house cashback promo per game — the reason a player can actually grow money.
     Shown inside every game panel, so nothing is hidden from the player. */
  const PROMO = { slots: 0, roulette: 0.20, blackjack: 0.18, dice: 0.05, coinflip: 0.15 };
  const FLOOR_PROMO = { 1: 0, 2: 0.02, 3: 0.04 };

  /* per-game share of the daily bet cap */
  const CAP_SHARE = { slots: 1, roulette: 1, blackjack: 1, dice: 0.6, coinflip: 0.2 };
  /* blackjack minimum bet per day (§20) */
  const BJ_MIN = [100, 250, 500, 1000, 2500, 5000];

  const DayManager = {
    DAYS, TIME_COST, PROMO, DAY_MINUTES, OVER_MULT,
    _closing: false,
    _clock: 0,

    /* ================= helpers ================= */
    get c() { return State.campaign; },
    def(day) { return DAYS[Utils.clamp((day || this.c.day) - 1, 0, 5)]; },
    isFinalDay() { return this.c.day >= 6; },
    earnings() { return State.coins - this.c.dayStartCoins; },
    quota() { return this.c.quota; },
    progress() {
      const q = this.quota() || 1;
      return Utils.clamp(Math.max(0, this.earnings()) / q * 100, 0, 100);
    },
    quotaMet() { return this.earnings() >= this.quota(); },
    minutesLeft() { return Math.max(0, DAY_MINUTES - this.c.time); },
    clockText() {
      const m = DAY_START_MIN + Math.min(this.c.time, DAY_MINUTES);
      return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.floor(m % 60)).padStart(2, '0');
    },
    floorUnlocked(f) { return this.c.floors.indexOf(f) >= 0; },

    /* ================= bet limits (anti-exploit + economy) ================= */
    /** limits for one game; cfg is the table config from the world object */
    betLimit(game, cfg) {
      const d = this.def();
      let cap = Math.round(d.cap * (CAP_SHARE[game] == null ? 1 : CAP_SHARE[game]));
      if (window.Items && Items.has('vip_pass')) cap = Math.round(cap * 1.15);
      if (cfg && cfg.capMult) cap = Math.round(cap * cfg.capMult);
      let min = 1;
      if (game === 'slots') {
        const TIER_MIN = { basic: 100, advanced: 500, vip: 2000 };
        min = (cfg && cfg.minBet) || (cfg && TIER_MIN[cfg.tier]) || 100;
      }
      if (game === 'blackjack') min = BJ_MIN[Utils.clamp(this.c.day - 1, 0, 5)];
      if (game === 'roulette') min = 100;
      if (min > cap) min = cap;
      return { min, max: Math.max(min, cap) };
    },
    /** 4-5 chip values between min and cap for a game panel */
    betOptions(game, cfg) {
      const { min, max } = this.betLimit(game, cfg);
      if (game === 'slots' && cfg && cfg.bets) {
        const list = cfg.bets.filter(b => b <= max);
        return list.length ? list : [Math.min(min, max)];
      }
      const out = [];
      const steps = [1, 2, 5, 10];
      steps.forEach(s => { const v = Math.round(min * s / 10) * 10 || min; if (v >= min && v <= max) out.push(v); });
      out.push(max);
      if (game === 'dice' || game === 'coinflip') out.unshift(1);
      const uniq = [...new Set(out.filter(v => v >= 1 && v <= max))].sort((a, b) => a - b);
      return uniq.slice(-5);
    },
    promo(game) {
      let p = PROMO[game] || 0;
      p += FLOOR_PROMO[this.c.floor] || 0;
      return p;
    },

    /* ================= campaign lifecycle ================= */
    startCampaign(reset) {
      if (reset) {
        const fresh = Save.defaults();
        State.campaign = fresh.campaign;
        State.tickets = 0;
        State.items = { owned: [] };
        State.coins = 8000;
      }
      const c = this.c;
      c.started = true;
      c.finished = false;
      c.day = Math.max(1, c.day);
      c.phase = 'home';
      c.quota = this.def(c.day).quota;
      Bus.emit('campaign:started', { day: c.day });
      Bus.emit('state:dirty');
    },

    /** called when the player arrives at the casino: starts the working day */
    beginCasinoDay() {
      const c = this.c, d = this.def();
      c.phase = 'casino';
      c.time = 0;
      c.safetyUsed = false;
      c.bossReady = false;
      c.claimed = [];
      for (const k in c.counters) c.counters[k] = 0;
      /* chip credit: the house always fronts enough chips to play the day */
      if (State.coins < d.bank) {
        const credit = d.bank - State.coins;
        State.coins = d.bank;
        Bus.emit('coins:changed', { delta: credit, reason: 'credit' });
        Bus.emit('campaign:credit', { credit });
      }
      c.dayStartCoins = State.coins;
      c.floor = 1;
      this._closing = false;
      this._ended = false;
      Quests.ensureCampaignDay(true);
      Bus.emit('day:started', { day: c.day, quota: c.quota });
      Bus.emit('state:dirty');
      return { day: c.day, quota: c.quota };
    },

    /* ================= clock ================= */
    /** every finished round costs in-game minutes */
    onRound(game, bet, net, meta) {
      const c = this.c;
      c.counters.games++;
      c.counters.wager += bet;
      c.counters[game] = (c.counters[game] || 0) + 1;
      if (net > 0) { c.counters.wins++; c.counters.won += net; }
      else { c.counters.losses++; c.counters.lost += Math.abs(net); }
      if (c.floor === 2) c.counters.floor2++;
      if (c.floor === 3) c.counters.floor3++;
      /* VIP floor rounds are slower (§24) */
      const cost = (meta && meta.timeCost) || (c.floor === 3 ? 30 : (TIME_COST[game] || 10));
      this.spendTime(cost);
      Bus.emit('campaign:round', { game, bet, net });
      Bus.emit('state:dirty');
    },

    spendTime(minutes) {
      const c = this.c;
      if (c.phase !== 'casino' || this._closing) return;
      c.time = Math.min(DAY_MINUTES, c.time + minutes);
      Bus.emit('clock:changed', { time: c.time });
      if (c.time >= DAY_MINUTES && !this._ended) { this._ended = true; this.endOfDay('clock'); }
    },

    /** slow real-time drift so standing still is not free */
    tick(dt) {
      if (this.c.phase !== 'casino' || this._closing) return;
      if (window.Game && Game.state === 'PLAYING_GAME') return;
      this._clock += dt;
      while (this._clock >= REAL_SECONDS_PER_MINUTE) {
        this._clock -= REAL_SECONDS_PER_MINUTE;
        this.spendTime(1);
      }
    },

    /* ================= end of day ================= */
    /** 22:00 reached — automatic check (§24/§25) */
    endOfDay(reason) {
      if (this._closing || this.c.phase !== 'casino') return;
      if (this.quotaMet()) {
        if (this.isFinalDay()) {
          /* the final quota is handed over to the owner in person — the clock
             stops instead of ending the campaign automatically */
          this.c.bossReady = true;
          Bus.emit('boss:ready', { fromClock: true });
        } else this.completeDay(reason || 'clock');
      } else {
        this.failDay(reason || 'clock');
      }
    },

    /** the cashier / owner accepts the quota */
    payQuota() {
      if (this._closing) return { ok: false, reason: 'busy' };
      if (this.c.phase !== 'casino') return { ok: false, reason: 'phase' };
      if (!this.quotaMet()) {
        return { ok: false, reason: 'short', missing: this.quota() - this.earnings() };
      }
      if (this.isFinalDay() && !this.c.bossReady) {
        this.c.bossReady = true;
        Bus.emit('boss:ready', {});
        return { ok: false, reason: 'boss' };
      }
      this.completeDay('cashier');
      return { ok: true };
    },

    completeDay(reason) {
      if (this._closing) return;
      const c = this.c, d = this.def();
      this._closing = true;

      const earnings = this.earnings();
      const quota = this.quota();
      Economy.spend(quota, 'quota');                 // the quota is handed over
      State.stats.quotaPaid += quota;
      State.stats.daysCompleted++;
      c.prevEarnings = earnings;
      c.prevQuota = quota;
      c.daysCompleted = Math.max(c.daysCompleted, c.day);
      c.history.push({ day: c.day, quota, earnings, tickets: d.tickets });

      Economy.addTickets(d.tickets, 'day');
      const xp = 300 + c.day * 250;
      Progression.addXp(xp);
      Bus.emit('metric', { key: 'daysCompleted', value: c.daysCompleted });
      Bus.emit('metric', { key: 'quota', add: 1 });

      const final = this.isFinalDay();
      c.phase = final ? 'done' : 'home';
      if (final) { c.finished = true; State.campaign.finished = true; }
      Bus.emit('day:complete', {
        day: c.day, quota, earnings, over: Math.max(0, earnings - quota),
        tickets: d.tickets, xp, final, reason: reason || ''
      });
      Bus.emit('state:dirty');
      Save.SaveGame(true);
    },

    failDay(reason) {
      if (this._closing) return;
      this._closing = true;
      State.stats.daysFailed++;
      Bus.emit('day:failed', {
        day: this.c.day, quota: this.quota(), earnings: this.earnings(), reason: reason || ''
      });
      Bus.emit('state:dirty');
      Save.SaveGame(true);
    },

    /** §14 dynamic quota with §16 ceiling */
    computeNextQuota(nextDay) {
      const base = this.def(nextDay).quota;
      const cap = this.def(nextDay).max;
      const over = Math.max(0, this.c.prevEarnings - this.c.prevQuota);
      const q = Math.round(base + over * OVER_MULT);
      return Math.min(q, cap);
    },

    /** move the story to the next morning */
    advanceDay() {
      const c = this.c;
      if (c.day >= 6) { c.phase = 'done'; return c.day; }
      const next = c.day + 1;
      c.quota = this.computeNextQuota(next);
      c.day = next;
      c.phase = 'home';
      c.time = 0;
      c.bossReady = false;
      this._closing = false;
      const unlocked = [];
      this.def(next).floors.forEach(f => {
        if (c.floors.indexOf(f) < 0) { c.floors.push(f); unlocked.push(f); }
      });
      Bus.emit('day:new', { day: next, quota: c.quota, unlockedFloors: unlocked });
      Bus.emit('state:dirty');
      Save.SaveGame(true);
      return next;
    },

    /** §26 retry the same day, keeping tickets / level / items / floors */
    retryDay() {
      const c = this.c;
      c.retries++;
      c.time = 0;
      c.phase = 'home';
      c.bossReady = false;
      c.claimed = [];
      for (const k in c.counters) c.counters[k] = 0;
      c.safetyUsed = false;
      this._closing = false;
      this._ended = false;
      /* the quota of the failed day stays exactly the same */
      Bus.emit('day:retry', { day: c.day, quota: c.quota });
      Bus.emit('state:dirty');
      Save.SaveGame(true);
      return c.day;
    },

    /* ================= info for UI ================= */
    summary() {
      const d = this.def();
      return {
        day: this.c.day, total: 6, quota: this.quota(), base: d.quota, maxQuota: d.max,
        earnings: this.earnings(), progress: this.progress(), time: this.clockText(),
        minutesLeft: this.minutesLeft(), tickets: State.tickets, cap: d.cap,
        floors: this.c.floors.slice(), floor: this.c.floor, phase: this.c.phase
      };
    }
  };

  window.DayManager = DayManager;
})();
