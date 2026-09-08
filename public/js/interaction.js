/* ============================================================
   interaction.js — camera-center Raycaster + [E] interaction
   ============================================================ */
(function () {
  'use strict';

  const Interaction = {
    ray: null,
    camera: null,
    current: null,
    MAX_DIST: 4.2,

    init(camera) {
      this.camera = camera;
      this.ray = new THREE.Raycaster();
      this.ray.far = this.MAX_DIST;
      window.addEventListener('keydown', e => {
        if (e.code !== 'KeyE') return;
        if (UI.isOpen() || !Player.enabled) return;
        this.activate();
      });
    },

    update() {
      if (!Player.enabled || UI.isOpen()) { UI.prompt(null); this.current = null; return; }
      this.camera.updateMatrixWorld();
      this.ray.setFromCamera({ x: 0, y: 0 }, this.camera);
      const hits = this.ray.intersectObjects(World.rayTargets, false);
      if (!hits.length) { this.current = null; UI.prompt(null); return; }
      const obj = hits[0].object;
      const it = obj.userData.interact;
      if (!it) { this.current = null; UI.prompt(null); return; }
      this.current = it;

      if (window.Story) {
        const sp = Story.promptFor(it);
        if (sp) { UI.prompt(sp.text, sp.locked); return; }
      }

      if (it.key === 'vipdoor') {
        if (World.vipOpen || Progression.isUnlocked('vip')) UI.prompt('ENTER VIP AREA');
        else UI.prompt('VIP AREA — ' + Progression.lockText('vip'), true);
        return;
      }
      if (it.lock && !Progression.isUnlocked(it.lock)) {
        UI.prompt(`LOCKED — ${Progression.lockText(it.lock)}`, true);
        return;
      }
      UI.prompt(it.label);
    },

    activate() {
      const it = this.current;
      if (!it) return;
      /* §44 no interacting while a panel / cinematic is up */
      if (UI.isOpen() || (window.Cinematic && Cinematic.playing) || !Player.enabled) return;

      if (it.key === 'vipdoor') {
        if (World.vipOpen) { Sound.play('click'); return; }
        if (Progression.isUnlocked('vip')) {
          World.openVipDoor(true);
          UI.toast({ title: 'VIP AREA UNLOCKED', text: 'Двери открылись — добро пожаловать', icon: '🥇', type: 'gold' });
        } else {
          Sound.play('deny');
          UI.toast({ title: 'ДОСТУП ЗАКРЫТ', text: `VIP AREA требует Level 15 (сейчас ${State.level})`, icon: '🔒', type: 'red' });
        }
        return;
      }

      if (it.lock && !Progression.isUnlocked(it.lock)) {
        Sound.play('deny');
        UI.toast({
          title: 'ЗАБЛОКИРОВАНО',
          text: `${it.label} откроется: ${Progression.lockText(it.lock)}`,
          icon: '🔒', type: 'red'
        });
        return;
      }

      if (window.Story && Story.handle(it)) return;

      if (it.key === 'panel') { UI.open(it.panel); return; }

      const games = { slots: window.Slots, roulette: window.Roulette, blackjack: window.Blackjack, dice: window.Dice, coinflip: window.CoinFlip };
      const g = games[it.game];
      if (g && g.open) g.open(it);
    }
  };

  window.Interaction = Interaction;
})();
