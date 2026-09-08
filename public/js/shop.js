/* ============================================================
   shop.js — buy cosmetics with virtual coins
   ============================================================ */
(function () {
  'use strict';

  const Shop = {
    items(type) {
      return Inventory.CATALOG.filter(i => i.price > 0 && (!type || i.type === type));
    },
    buy(id) {
      const it = Inventory.get(id);
      if (!it) return false;
      if (Inventory.owns(id)) { Sound.play('deny'); return false; }
      if (!Economy.canAfford(it.price)) {
        Sound.play('deny');
        UI.toast({ title: 'НЕ ХВАТАЕТ МОНЕТ', text: `Нужно ${Utils.fmt(it.price)} монет`, icon: '💸', type: 'red' });
        return false;
      }
      Economy.spend(it.price, 'shop');
      State.inventory.owned.push(id);
      Sound.play('coin');
      UI.toast({ title: 'ПОКУПКА', text: `${it.name} добавлен в инвентарь`, icon: it.icon, type: 'gold' });
      Inventory.equip(id);
      Bus.emit('shop:bought', it);
      Bus.emit('state:dirty');
      return true;
    }
  };

  window.Shop = Shop;
})();
