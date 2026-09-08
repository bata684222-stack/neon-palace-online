/* ============================================================
   inventory.js — cosmetic catalog, ownership, equipping
   ============================================================ */
(function () {
  'use strict';

  const CATALOG = [
    /* avatars */
    { id: 'av_default', type: 'avatar', name: 'ROOKIE', icon: '🎩', price: 0, rarity: 'common', desc: 'Стартовый аватар' },
    { id: 'av_cool', type: 'avatar', name: 'COOL CAT', icon: '😎', price: 2000, rarity: 'common', desc: 'Полное спокойствие за столом' },
    { id: 'av_wolf', type: 'avatar', name: 'LONE WOLF', icon: '🐺', price: 5000, rarity: 'rare', desc: 'Одинокий хищник казино' },
    { id: 'av_bot', type: 'avatar', name: 'CARD BOT', icon: '🤖', price: 8000, rarity: 'rare', desc: 'Считает карты за 0.2 мс' },
    { id: 'av_king', type: 'avatar', name: 'THE KING', icon: '👑', price: 15000, rarity: 'epic', desc: 'Король зала' },
    { id: 'av_unicorn', type: 'avatar', name: 'LUCKY UNICORN', icon: '🦄', price: 30000, rarity: 'legendary', desc: 'Символ невозможной удачи' },
    /* frames */
    { id: 'fr_cyan', type: 'frame', name: 'NEON FRAME', icon: '🔷', price: 3000, rarity: 'common', value: '#00e5ff', desc: 'Циановая рамка аватара' },
    { id: 'fr_pink', type: 'frame', name: 'MAGENTA FRAME', icon: '🔶', price: 5000, rarity: 'rare', value: '#ff2d95', desc: 'Розовая неоновая рамка' },
    { id: 'fr_gold', type: 'frame', name: 'GOLD FRAME', icon: '🟨', price: 12000, rarity: 'epic', value: '#ffc63a', desc: 'Золотая рамка для VIP' },
    { id: 'fr_plasma', type: 'frame', name: 'PLASMA FRAME', icon: '🟪', price: 25000, rarity: 'legendary', value: '#c07cff', desc: 'Пульсирующая плазма' },
    /* titles */
    { id: 'ti_lucky', type: 'title', name: 'TITLE: LUCKY ONE', icon: '🏷️', price: 4000, rarity: 'common', value: 'LUCKY ONE', desc: 'Титул в профиле' },
    { id: 'ti_shark', type: 'title', name: 'TITLE: CARD SHARK', icon: '🏷️', price: 10000, rarity: 'rare', value: 'CARD SHARK', desc: 'Титул в профиле' },
    { id: 'ti_whale', type: 'title', name: 'TITLE: HIGH ROLLER', icon: '🏷️', price: 25000, rarity: 'epic', value: 'HIGH ROLLER', desc: 'Титул в профиле' },
    { id: 'ti_legend', type: 'title', name: 'TITLE: NEON LEGEND', icon: '🏷️', price: 50000, rarity: 'legendary', value: 'NEON LEGEND', desc: 'Титул в профиле' },
    /* win effects */
    { id: 'ef_sparks', type: 'effect', name: 'GOLD SPARKS', icon: '✨', price: 6000, rarity: 'rare', value: '#ffc63a', desc: 'Золотые частицы при выигрыше' },
    { id: 'ef_neon', type: 'effect', name: 'NEON BURST', icon: '💠', price: 9000, rarity: 'rare', value: '#00e5ff', desc: 'Неоновая вспышка при выигрыше' },
    { id: 'ef_confetti', type: 'effect', name: 'CONFETTI', icon: '🎊', price: 15000, rarity: 'epic', value: 'rainbow', desc: 'Разноцветное конфетти' },
    /* UI themes */
    { id: 'th_neon', type: 'theme', name: 'THEME: NEON BLUE', icon: '🎨', price: 0, rarity: 'common', value: ['#00e5ff', '#ff2d95'], desc: 'Стандартная тема' },
    { id: 'th_royal', type: 'theme', name: 'THEME: ROYAL', icon: '🎨', price: 7000, rarity: 'rare', value: ['#c07cff', '#ffc63a'], desc: 'Пурпур и золото' },
    { id: 'th_emerald', type: 'theme', name: 'THEME: EMERALD', icon: '🎨', price: 9000, rarity: 'rare', value: ['#25e39a', '#a6ff4d'], desc: 'Изумрудный интерфейс' },
    { id: 'th_crimson', type: 'theme', name: 'THEME: CRIMSON', icon: '🎨', price: 12000, rarity: 'epic', value: ['#ff4d5e', '#ffb03a'], desc: 'Багровое казино' }
  ];

  const TYPE_LABEL = { avatar: 'AVATARS', frame: 'FRAMES', title: 'TITLES', effect: 'WIN EFFECTS', theme: 'UI THEMES' };

  const Inventory = {
    CATALOG, TYPE_LABEL,
    get(id) { return CATALOG.find(i => i.id === id); },
    owns(id) {
      const it = this.get(id);
      if (it && it.price === 0) return true;
      return State.inventory.owned.indexOf(id) >= 0;
    },
    ownedItems() { return CATALOG.filter(i => this.owns(i)); },
    isEquipped(id) {
      const it = this.get(id);
      return it ? State.inventory.equipped[it.type] === id : false;
    },
    equip(id) {
      const it = this.get(id);
      if (!it || !this.owns(id)) { Sound.play('deny'); return false; }
      State.inventory.equipped[it.type] = id;
      Sound.play('click');
      this.apply();
      Bus.emit('inventory:changed');
      Bus.emit('state:dirty');
      return true;
    },
    unequip(type) {
      if (type === 'avatar' || type === 'theme') return false;
      State.inventory.equipped[type] = null;
      this.apply();
      Bus.emit('inventory:changed');
      Bus.emit('state:dirty');
      return true;
    },
    equipped(type) { return this.get(State.inventory.equipped[type]); },
    title() { const t = this.equipped('title'); return t ? t.value : null; },
    effectColor() {
      const e = this.equipped('effect');
      if (!e) return '#ffc63a';
      if (e.value === 'rainbow') return Utils.choice(['#ff4d5e', '#ffc63a', '#25e39a', '#00e5ff', '#c07cff']);
      return e.value;
    },
    /** apply cosmetics to the DOM (theme colors, avatar, frame) */
    apply() {
      const root = document.documentElement;
      const th = this.equipped('theme');
      if (th && Array.isArray(th.value)) {
        root.style.setProperty('--accent', th.value[0]);
        root.style.setProperty('--accent2', th.value[1]);
        const hex = th.value[0].replace('#', '');
        const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
        root.style.setProperty('--line', `rgba(${r},${g},${b},.28)`);
      }
      const fr = this.equipped('frame');
      root.style.setProperty('--frame', fr ? fr.value : 'transparent');
      const av = this.equipped('avatar') || this.get('av_default');
      const el = document.getElementById('hud-avatar');
      if (el) el.textContent = av.icon;
    }
  };

  Bus.on('save:loaded', () => setTimeout(() => Inventory.apply(), 0));

  /* ============================================================
     CAMPAIGN ITEMS — bought with TICKETS, they really affect play.
     Hard design rule (§7): a single item never gives more than ~10%,
     and nothing here can guarantee a win.
     ============================================================ */
  const ITEMS = [
    {
      id: 'lucky_charm', name: 'LUCKY CHARM', icon: '🍀', price: 2, rarity: 'common',
      desc: 'Немного повышает шанс положительного исхода в Slots и Coin Flip (+5%).',
      effect: '+5% шанс в Slots / Coin Flip'
    },
    {
      id: 'coin_magnet', name: 'COIN MAGNET', icon: '🧲', price: 4, rarity: 'rare',
      desc: 'Все выигрыши приносят на 8% больше монет.',
      effect: '+8% к чистому выигрышу'
    },
    {
      id: 'lucky_dice', name: 'LUCKY DICE', icon: '🎲', price: 6, rarity: 'rare',
      desc: 'Коэффициенты в Dice выше на 10%.',
      effect: '+10% к выплатам в Dice'
    },
    {
      id: 'safety_card', name: 'SAFETY CARD', icon: '🛡️', price: 8, rarity: 'epic',
      desc: 'Один раз за игровой день возвращает половину проигранной ставки.',
      effect: '1 раз в день: возврат 50% ставки'
    },
    {
      id: 'vip_pass', name: 'VIP PASS', icon: '🎟️', price: 12, rarity: 'legendary',
      desc: 'Лимит ставок стола выше на 15% и доступ к VIP-возможностям этажей.',
      effect: '+15% лимит ставки, VIP-доступ'
    }
  ];

  const Items = {
    CATALOG: ITEMS,
    get(id) { return ITEMS.find(i => i.id === id); },
    has(id) { return State.items && State.items.owned.indexOf(id) >= 0; },
    owned() { return ITEMS.filter(i => this.has(i.id)); },

    buy(id) {
      const it = this.get(id);
      if (!it) return false;
      if (this.has(id)) { Sound.play('deny'); return false; }
      if (State.tickets < it.price) {
        Sound.play('deny');
        UI.toast({ title: 'НЕ ХВАТАЕТ TICKETS', text: `${it.name} стоит ${it.price} 🎟`, icon: '🎟️', type: 'red' });
        return false;
      }
      if (!Economy.spendTickets(it.price, 'item:' + id)) return false;
      State.items.owned.push(id);
      State.stats.itemsBought++;
      Sound.play('unlock');
      UI.toast({ title: 'ПРЕДМЕТ КУПЛЕН', text: `${it.icon} ${it.name} · ${it.effect}`, icon: '🎁', type: 'gold' });
      Bus.emit('item:bought', { id });
      Bus.emit('metric', { key: 'items', value: State.items.owned.length });
      Bus.emit('state:dirty');
      return true;
    },

    /* ---- effects ---- */
    /** extra chance of a positive outcome (0..0.05) for slots / coinflip */
    luckBonus(game) {
      if (!this.has('lucky_charm')) return 0;
      return (game === 'slots' || game === 'coinflip') ? 0.05 : 0;
    },
    /** share added to the net win */
    payoutBonus() { return this.has('coin_magnet') ? 0.08 : 0; },
    /** dice multiplier bonus */
    diceBonus() { return this.has('lucky_dice') ? 0.10 : 0; },
    /** safety card: one charge per campaign day */
    safetyAvailable() {
      return this.has('safety_card') && State.campaign && State.campaign.phase === 'casino' && !State.campaign.safetyUsed;
    },
    useSafety() {
      if (!this.safetyAvailable()) return false;
      State.campaign.safetyUsed = true;
      Bus.emit('state:dirty');
      return true;
    },
    hasVip() { return this.has('vip_pass'); },

    summary() {
      return {
        luck: this.has('lucky_charm') ? '+5%' : '—',
        payout: this.has('coin_magnet') ? '+8%' : '—',
        dice: this.has('lucky_dice') ? '+10%' : '—',
        safety: this.has('safety_card') ? (State.campaign.safetyUsed ? 'использован' : 'готов') : '—',
        vip: this.has('vip_pass') ? 'активен' : '—'
      };
    }
  };

  window.Items = Items;

  window.Inventory = Inventory;
})();
