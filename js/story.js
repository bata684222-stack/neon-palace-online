/* ============================================================
   story.js — the 6-day story flow: home, travel, arrival,
   floor unlocks, boss, endings. Every cutscene is a structured
   CinematicManager sequence (no ad-hoc setTimeout chains).
   ============================================================ */
(function () {
  'use strict';

  const Story = {
    /* ================= interaction prompts ================= */
    promptFor(it) {
      const c = State.campaign;
      switch (it.key) {
        case 'car':
          if (c.phase === 'casino') return { text: 'МАШИНА — ТЫ УЖЕ В КАЗИНО', locked: true };
          if (c.daysCompleted >= c.day) return { text: 'СНАЧАЛА ВЫСПИСЬ (КРОВАТЬ)', locked: true };
          return { text: 'GO TO CASINO' };
        case 'bed':
          if (c.finished) return { text: 'SLEEP' };
          if (c.daysCompleted >= c.day) return { text: 'SLEEP — START DAY ' + (c.day + 1) };
          return { text: 'СНАЧАЛА ЗАКРОЙ КВОТУ ДНЯ', locked: true };
        case 'sofa':
          return { text: c.finished ? 'SIT AND WATCH TV' : 'SIT ON SOFA' };
        case 'fridge': return { text: 'OPEN FRIDGE' };
        case 'homeDoor': return { text: Home.doorOpen ? 'CLOSE DOOR' : 'OPEN DOOR' };
        case 'boss':
          if (c.day < 6) return { text: "OWNER'S OFFICE — DAY 6 ONLY", locked: true };
          if (!c.bossReady) return { text: "OWNER'S OFFICE — СОБЕРИ ФИНАЛЬНУЮ КВОТУ", locked: true };
          return { text: "ENTER OWNER'S OFFICE" };
        case 'bossTalk': return { text: 'TALK TO THE OWNER' };
        case 'bossExit': return { text: 'LEAVE OFFICE' };
      }
      return null;
    },

    /* ================= interaction handler ================= */
    handle(it) {
      const c = State.campaign;
      switch (it.key) {
        case 'homeDoor': Home.openDoor(!Home.doorOpen); return true;
        case 'fridge':
          Sound.play('open');
          UI.toast({
            title: 'ХОЛОДИЛЬНИК', icon: '🥤', text: Utils.choice([
              'Холодный кофе и половина сэндвича. Сойдёт.',
              'Пусто. Только банка энергетика — она и пойдёт.',
              'Остатки ужина. Работать на голодный желудок — плохая идея.'
            ])
          });
          return true;
        case 'sofa':
          Sound.play('click');
          if (c.finished) UI.toast({ title: 'ДОМА', text: 'Долг закрыт. Телевизор бормочет что-то про новую квоту.', icon: '🛋️', type: 'gold' });
          else UI.toast({ title: 'ДИВАН', text: `Отдыхать будешь после квоты. Осталось дней: ${7 - c.day}`, icon: '🛋️' });
          return true;
        case 'car':
          if (c.phase === 'casino' || c.daysCompleted >= c.day) { Sound.play('deny'); return true; }
          this.travelToCasino();
          return true;
        case 'bed':
          if (c.daysCompleted >= c.day || c.finished) this.sleep();
          else {
            Sound.play('deny');
            UI.toast({ title: 'РАНО СПАТЬ', text: 'Сначала закрой квоту этого дня в казино', icon: '⏰', type: 'red' });
          }
          return true;
        case 'boss':
          if (c.day < 6 || !c.bossReady) {
            Sound.play('deny');
            UI.toast({
              title: 'ОФИС ЗАКРЫТ',
              text: c.day < 6 ? 'Владелец принимает только в последний день' : 'Сначала собери финальную квоту',
              icon: '🔒', type: 'red'
            });
            return true;
          }
          this.enterBossRoom();
          return true;
        case 'bossTalk': this.bossTalk(); return true;
        case 'bossExit': this.leaveBossRoom(); return true;
      }
      return false;
    },

    /* ================= environment helpers ================= */
    goEnv(id, spawn, onDone) {
      Game.enterEnv(id, spawn);
      if (onDone) onDone();
    },

    /* ================= DAY START ================= */
    /** the player wakes up at home: show the briefing, then hand over control */
    startMorning(showIntro) {
      const c = State.campaign;
      c.phase = 'home';
      Game.setState('HOME');
      Game.enterEnv('home', World.envSpawn('home'));
      UI.fadeTo(0, 700);
      Sound.startMusic();
      if (showIntro !== false) {
        UI.showDayIntro(() => {
          Game.enableControl(true);
          UI.toast({
            title: `DAY ${c.day} / 6`,
            text: 'PREPARE у стола → чёрная машина во дворе → казино',
            icon: '📋', type: 'gold', time: 6500
          });
        });
        Game.enableControl(false);
      } else {
        Game.enableControl(true);
      }
    },

    /* ================= §9 TRAVEL TO THE CASINO ================= */
    travelToCasino() {
      const c = State.campaign;
      Game.setState('TRAVEL_TO_CASINO');
      Game.enableControl(false);
      const car = Home.car;
      const carPos = [5.5, 0, 21.5];
      const camNow = [Player.pos.x, Player.pos.y, Player.pos.z];
      const drive = Car;

      Cinematic.play('travel_to_casino', [
        /* 1-2: walk up to the car, the door opens */
        {
          dur: 2.2, from: camNow, pos: [3.2, 1.7, 19.6], look: carPos, lookFrom: carPos,
          sub: 'Пора ехать. Квота сама себя не закроет.', on: () => { car.setLights(false); }
        },
        { dur: 1.6, pos: [3.0, 1.5, 21.0], look: [5.5, 1.0, 21.5], sub: '', on: () => car.openDoor(true) },
        /* 3-4: get in, door closes */
        { dur: 1.4, pos: [4.6, 1.25, 21.6], look: [6.6, 1.0, 21.5], sub: 'Ключ на месте.', on: () => Sound.play('step') },
        { dur: 1.2, pos: [5.2, 1.2, 21.5], look: [8.5, 1.1, 21.5], on: () => car.openDoor(false) },
        /* 5-6: headlights, engine */
        {
          dur: 1.8, pos: [10.5, 1.4, 21.5], look: [5.5, 1.0, 21.5], sub: 'Фары. Двигатель.',
          on: () => { car.setLights(true); Sound.play('door'); Sound.engine(true); }
        },
        /* 7: the car pulls away — hand over to the travel scene */
        {
          dur: 1.2, pos: [12, 2.2, 24], look: [5.5, 1.0, 21.5], fade: 'out', fadeDur: 1.1, shake: .2
        },
        {
          dur: 0.1, on: () => {
            Game.enterEnv('travel', null);
            Car.startDrive(Car.ROAD_Z_START, Car.ROAD_Z_END + 30, 15.5);
          }
        },
        /* 8: outside shot following the car */
        {
          dur: 3.2, fade: 'in', fadeDur: 1.2, shake: .25, sub: 'Ночной город. Дорога к NEON PALACE.',
          dyn: () => {
            const p = Car.pos();
            return { pos: [p.x - 7, 3.2, p.z + 9], look: [p.x, 1.2, p.z] };
          }
        },
        /* 9: low front wheel shot */
        {
          dur: 2.6, shake: .35, sub: '',
          dyn: () => { const p = Car.pos(); return { pos: [p.x + 3.4, .75, p.z - 7], look: [p.x, .9, p.z] }; }
        },
        /* 10: wide city shot */
        {
          dur: 3.4, shake: .12, sub: 'Город живёт по своим ставкам.',
          dyn: (k) => { const p = Car.pos(); return { pos: [p.x + 26, 16 + k * 6, p.z + 18], look: [p.x, 3, p.z - 12] }; }
        },
        /* 11: the casino appears far ahead */
        {
          dur: 3.4, shake: .1, sub: 'Вот оно. Казино, которому ты должен.',
          dyn: () => { const p = Car.pos(); return { pos: [p.x, 2.6, p.z + 8], look: [0, 12, Car.ROAD_Z_END - 14] }; }
        },
        /* 12: the car rolls up to the entrance */
        {
          dur: 3.0, shake: .18, sub: '',
          dyn: () => { const p = Car.pos(); return { pos: [p.x - 12, 4.5, p.z - 6], look: [p.x, 1.2, p.z] }; },
          on: () => Sound.engine(false)
        },
        /* §10 arrival: out of the car, up the facade, through the doors */
        {
          dur: 2.6, pos: [-9, 2.0, Car.ROAD_Z_END + 22], look: [0, 3, Car.ROAD_Z_END + 6],
          sub: 'Ты выходишь из машины.', on: () => { Car.car.openDoor(true); Sound.play('door'); }
        },
        {
          dur: 3.0, pos: [0, 4.0, Car.ROAD_Z_END + 14], look: [0, 20, Car.ROAD_Z_END - 12],
          sub: 'NEON PALACE. Шесть дней — и ты свободен.', on: () => Car.car.openDoor(false)
        },
        {
          dur: 2.6, pos: [0, 2.4, Car.ROAD_Z_END + 6], look: [0, 5, Car.ROAD_Z_END - 12],
          sub: 'Большие двери открываются.', on: () => Car.openCasinoDoors(true)
        },
        { dur: 2.2, pos: [0, 2.2, Car.ROAD_Z_END - 8], look: [0, 4, Car.ROAD_Z_END - 22], fade: 'out', fadeDur: 1.2 },
        /* into the hall */
        {
          dur: 0.1, on: () => {
            Game.enterEnv('casino1', { x: 0, z: 19, yaw: 0 });
            DayManager.beginCasinoDay();
          }
        },
        {
          dur: 3.4, from: [0, 5.6, 19], pos: [0, 2.6, 12], look: [0, 2.2, -6], lookFrom: [0, 2.4, 0],
          fade: 'in', fadeDur: 1.2, sub: 'Главный зал. 08:00. Часы пошли.',
          title: 'DAY ' + c.day + ' / 6', titleSub: 'QUOTA ' + Utils.fmt(c.quota)
        }
      ], () => {
        UI.fadeTo(0, 300);
        Sound.engine(false);
        Game.setState('CASINO');
        Player.teleport(0, 16, 0);
        Game.enableControl(true);
        this.afterArrival();
      });
    },

    /** floor unlock cinematics + tips right after arriving */
    afterArrival() {
      const c = State.campaign;
      const newFloors = (this._pendingFloors || []).slice();
      this._pendingFloors = [];
      if (newFloors.length) {
        this.floorUnlockCinematic(newFloors[0]);
        return;
      }
      UI.toast({
        title: 'КВОТА ДНЯ ' + c.day, text: `${Utils.fmt(c.quota)} монет до 22:00 · касса слева от входа`,
        icon: '🎯', type: 'gold', time: 6000
      });
    },

    /* ================= §27/§29 FLOOR UNLOCKED ================= */
    floorUnlockCinematic(floor) {
      const envId = floor === 2 ? 'casino2' : 'casino3';
      const name = floor === 2 ? 'SILVER LOUNGE' : 'GOLD VIP FLOOR';
      Game.enableControl(false);
      Game.setState('TRAVEL_TO_CASINO');
      Cinematic.play('floor_unlock', [
        { dur: 0.9, fade: 'out', fadeDur: .8 },
        {
          dur: 0.1, on: () => {
            Game.enterEnv(envId, null);
            State.campaign.floor = floor;
          }
        },
        {
          dur: 3.6, from: [0, 4.5, 14], pos: [0, 3.0, -4], look: [0, 2.2, -14], lookFrom: [0, 2.6, -2],
          fade: 'in', fadeDur: 1,
          title: 'FLOOR ' + floor + ' UNLOCKED', titleSub: name,
          sub: floor === 2
            ? 'Второй этаж открыт: ставки выше, выплаты крупнее.'
            : 'VIP-этаж открыт. Самые большие лимиты казино — и офис владельца.',
          on: () => Sound.play('unlock')
        },
        {
          dur: 3.2, pos: [-9, 2.4, 2], look: [6, 2, -6], sub: 'Пользуйся лифтом у входа, чтобы менять этажи.'
        },
        { dur: 1.0, fade: 'out', fadeDur: .9 },
        {
          dur: 0.1, on: () => {
            Game.enterEnv('casino1', { x: 26, z: 16, yaw: Math.PI });
            State.campaign.floor = 1;
          }
        },
        { dur: 1.2, from: [26, 1.7, 16], pos: [26, 1.7, 16], look: [20, 1.7, 10], fade: 'in', fadeDur: .9 }
      ], () => {
        UI.fadeTo(0, 300);
        Game.setState('CASINO');
        Game.enableControl(true);
        UI.toast({
          title: 'FLOOR ' + floor + ' ОТКРЫТ', text: 'Лифт справа от входа поднимет тебя наверх',
          icon: '🛗', type: 'gold', time: 6000
        });
      });
    },

    /* ================= §26 elevator ================= */
    goFloor(floor) {
      if (!DayManager.floorUnlocked(floor)) { Sound.play('deny'); return; }
      if (State.campaign.floor === floor) return;
      const envId = floor === 1 ? 'casino1' : floor === 2 ? 'casino2' : 'casino3';
      Game.enableControl(false);
      Sound.play('door');
      Cinematic.play('elevator', [
        { dur: 0.7, fade: 'out', fadeDur: .6, sub: 'Лифт...' },
        {
          dur: 0.2, on: () => {
            Game.enterEnv(envId, null);
            State.campaign.floor = floor;
            Bus.emit('state:dirty');
          }
        },
        { dur: 0.9, fade: 'in', fadeDur: .7, sub: '' }
      ], () => {
        UI.fadeTo(0, 200);
        Game.setState('CASINO');
        Game.enableControl(true);
        UI.setZone('FLOOR ' + floor);
      }, { skippable: false });
    },

    /* ================= §27 return home ================= */
    returnHome(data) {
      Game.setState('RETURN_HOME');
      Game.enableControl(false);
      Cinematic.play('return_home', [
        { dur: 1.0, fade: 'out', fadeDur: .9, sub: 'Квота сдана. Домой.' },
        {
          dur: 0.1, on: () => {
            Game.enterEnv('travel', null);
            Car.startDrive(Car.ROAD_Z_END + 30, Car.ROAD_Z_START, 9.5);
            Sound.engine(true);
          }
        },
        {
          dur: 3.4, fade: 'in', fadeDur: 1, shake: .2, sub: 'Ещё один день закрыт.',
          dyn: () => { const p = Car.pos(); return { pos: [p.x + 8, 3.4, p.z - 10], look: [p.x, 1.2, p.z] }; }
        },
        {
          dur: 3.6, shake: .12, sub: '',
          dyn: () => { const p = Car.pos(); return { pos: [p.x - 16, 8, p.z - 4], look: [p.x, 1.5, p.z] }; }
        },
        { dur: 1.2, fade: 'out', fadeDur: 1, on: () => Sound.engine(false) },
        {
          dur: 0.1, on: () => {
            Game.enterEnv('home', { x: 0, z: 12, yaw: Math.PI });
            State.campaign.phase = 'home';
          }
        },
        {
          dur: 2.6, from: [0, 3.4, 18], pos: [0, 1.8, 12.5], look: [0, 1.8, 9], lookFrom: [0, 2.2, 9],
          fade: 'in', fadeDur: 1, sub: 'Дом. Ложись спать — утром новый день.'
        }
      ], () => {
        UI.fadeTo(0, 300);
        Game.setState('HOME');
        Player.teleport(0, 12, Math.PI);
        Game.enableControl(true);
        UI.toast({
          title: 'ДОМА', text: 'PREPARE — потрать Tickets · КРОВАТЬ — начать следующий день',
          icon: '🏠', type: 'gold', time: 7000
        });
      });
    },

    /* ================= sleep -> next morning ================= */
    sleep() {
      const c = State.campaign;
      if (c.finished) {
        UI.toast({ title: 'КАМПАНИЯ ЗАВЕРШЕНА', text: 'Долг закрыт — можно просто отдохнуть', icon: '🌙', type: 'gold' });
        return;
      }
      Game.enableControl(false);
      Game.setState('RETURN_HOME');
      Cinematic.play('sleep', [
        { dur: 1.4, fade: 'out', fadeDur: 1.2, sub: 'Ты ложишься спать...', on: () => Sound.play('close') },
        {
          dur: 0.6, on: () => {
            const prevFloors = State.campaign.floors.slice();
            DayManager.advanceDay();
            this._pendingFloors = State.campaign.floors.filter(f => prevFloors.indexOf(f) < 0);
          }
        },
        { dur: 1.2, sub: 'Утро. 08:00.', title: 'DAY ' + (c.day) + ' / 6' }
      ], () => {
        this.startMorning(true);
      }, { skippable: false });
    },

    /* ================= §32 final boss ================= */
    enterBossRoom() {
      Game.enableControl(false);
      Sound.play('door');
      Cinematic.play('boss_enter', [
        { dur: 0.8, fade: 'out', fadeDur: .7, sub: 'Ты открываешь тяжёлую дверь.' },
        { dur: 0.2, on: () => Game.enterEnv('boss', World.envSpawn('boss')) },
        {
          dur: 3.2, from: [0, 1.8, 8], pos: [0, 1.75, 4.5], look: [0, 1.7, -5], lookFrom: [0, 1.7, -3],
          fade: 'in', fadeDur: .9, sub: 'Владелец казино ждал тебя.',
          title: 'FINAL QUOTA', titleSub: Utils.fmt(DayManager.earnings()) + ' / ' + Utils.fmt(State.campaign.quota)
        }
      ], () => {
        UI.fadeTo(0, 250);
        Game.setState('FINAL_BOSS');
        Player.teleport(0, 4.5, 0);
        Game.enableControl(true);
        UI.toast({ title: 'ВЛАДЕЛЕЦ', text: 'Подойди и нажми E, чтобы передать финальную квоту', icon: '🕴️', type: 'gold', time: 7000 });
      });
    },

    leaveBossRoom() {
      Game.enableControl(false);
      Cinematic.play('boss_exit', [
        { dur: 0.6, fade: 'out', fadeDur: .5 },
        { dur: 0.2, on: () => { Game.enterEnv('casino3', { x: 0, z: -8, yaw: 0 }); State.campaign.floor = 3; } },
        { dur: 0.8, fade: 'in', fadeDur: .6 }
      ], () => {
        UI.fadeTo(0, 200);
        Game.setState('CASINO');
        Game.enableControl(true);
      }, { skippable: false });
    },

    bossTalk() {
      const c = State.campaign;
      if (!DayManager.quotaMet()) {
        Sound.play('deny');
        UI.toast({
          title: 'НЕ ХВАТАЕТ', text: `Владелец пересчитал: не хватает ${Utils.fmt(c.quota - DayManager.earnings())} монет`,
          icon: '🕴️', type: 'red', time: 6000
        });
        return;
      }
      if (c.finished) { this.finalCutscene(); return; }
      Game.enableControl(false);
      Game.setState('FINAL_BOSS');
      Cinematic.play('boss_pay', [
        {
          dur: 2.6, from: [Player.pos.x, Player.pos.y, Player.pos.z], pos: [0, 1.75, -1.4], look: [0, 1.8, -5],
          sub: '— Всё здесь. Считай.', title: 'FINAL QUOTA',
          titleSub: Utils.fmt(DayManager.earnings()) + ' / ' + Utils.fmt(c.quota)
        },
        { dur: 2.4, pos: [1.8, 1.6, -2.2], look: [0, 1.4, -4.4], sub: 'Владелец медленно пересчитывает монеты...', on: () => Sound.play('coin') },
        {
          dur: 2.6, pos: [0, 1.7, -1.2], look: [0, 1.9, -5], sub: '— Долг закрыт. Ты свободен.',
          title: 'QUOTA PAID', titleSub: 'DEBT CLEARED',
          on: () => { Sound.play('jackpot'); DayManager.completeDay('boss'); }
        }
      ], () => { this.finalCutscene(); });
    },

    /* ================= §33 final cutscene ================= */
    finalCutscene() {
      Game.setState('FINAL_CUTSCENE');
      Game.enableControl(false);
      Cinematic.play('finale', [
        { dur: 2.4, from: [0, 1.7, -1.2], pos: [0, 1.8, 6], look: [0, 1.8, 9], lookFrom: [0, 1.8, -4], sub: 'Ты выходишь из офиса.' },
        { dur: 0.9, fade: 'out', fadeDur: .8 },
        { dur: 0.2, on: () => { Game.enterEnv('casino1', { x: 0, z: 0, yaw: 0 }); State.campaign.floor = 1; } },
        {
          dur: 3.6, from: [0, 2.2, -12], pos: [0, 2.2, 14], look: [0, 2.4, 21], lookFrom: [0, 2.4, 4],
          fade: 'in', fadeDur: 1, sub: 'Последний проход через зал.'
        },
        { dur: 1.0, fade: 'out', fadeDur: .9 },
        {
          dur: 0.2, on: () => {
            Game.enterEnv('travel', null);
            Car.startDrive(Car.ROAD_Z_END + 30, Car.ROAD_Z_START, 10);
            Sound.engine(true);
          }
        },
        {
          dur: 2.8, fade: 'in', fadeDur: 1, sub: 'Ты садишься в машину.',
          dyn: () => { const p = Car.pos(); return { pos: [p.x - 9, 2.6, p.z - 8], look: [p.x, 1.2, p.z] }; }
        },
        {
          dur: 3.0, shake: .1, sub: 'Казино остаётся позади.',
          dyn: () => { const p = Car.pos(); return { pos: [p.x + 4, 5, p.z - 16], look: [0, 10, Car.ROAD_Z_END - 12] }; }
        },
        {
          dur: 3.2, shake: .12, sub: 'Дорога домой — впервые без квоты на завтра.',
          dyn: () => { const p = Car.pos(); return { pos: [p.x - 14, 7, p.z - 2], look: [p.x, 1.4, p.z] }; }
        },
        { dur: 1.2, fade: 'out', fadeDur: 1, on: () => Sound.engine(false) },
        { dur: 0.2, on: () => { Game.enterEnv('home', { x: 0, z: 14, yaw: Math.PI }); } },
        {
          dur: 3.0, from: [8, 4, 26], pos: [2, 2.2, 15], look: [0, 1.8, 9.5], lookFrom: [4, 2, 18],
          fade: 'in', fadeDur: 1, sub: 'Дом.', on: () => { if (Home.car) Home.car.setLights(false); }
        },
        { dur: 2.2, pos: [0, 1.8, 10.5], look: [0, 1.7, 6], sub: 'Ты заходишь внутрь.', on: () => Home.openDoor(true) },
        { dur: 2.6, pos: [0, 1.75, 8], look: [0, 1.3, 5], sub: 'Гостиная. Тишина.' },
        {
          dur: 2.6, pos: [0, 1.3, 7.4], look: [0, 1.1, 2.2], sub: 'Ты садишься на диван.',
          on: () => Sound.play('close')
        },
        {
          dur: 2.6, pos: [0, 1.15, 6.2], look: [0, 1.35, 1.4], sub: 'И включаешь телевизор.',
          on: () => Sound.play('click')
        },
        {
          dur: 5.0, pos: [0, 3.2, 15], look: [0, 1.3, 2], ease: 'inout', sub: '',
          title: '6 DAYS COMPLETE', titleSub: 'QUOTA PAID'
        },
        {
          dur: 3.4, pos: [0, 6.5, 26], look: [0, 1.6, 4], ease: 'inout',
          title: 'GAME COMPLETE', titleSub: 'THE END', on: () => Sound.play('levelup')
        },
        { dur: 1.6, fade: 'out', fadeDur: 1.4 }
      ], () => {
        Game.setState('GAME_COMPLETE');
        State.campaign.finished = true;
        State.campaign.phase = 'done';
        Save.SaveGame(true);
        UI.showHUD(false);
        UI.showVictory(() => { UI.fadeTo(0, 500); Bus.emit('game:toMenu'); });
        UI.sparks(60, 'rainbow');
      });
    },

    /* ================= §25 failure ================= */
    dayFailed(d) {
      Game.setState('GAME_OVER');
      Game.enableControl(false);
      Cinematic.play('day_failed', [
        { dur: 1.6, fade: 'out', fadeDur: 1.4, sub: '22:00. Касса закрывается.', on: () => Sound.play('lose') }
      ], () => {
        UI.showHUD(false);
        UI.showGameOver(d, {
          onRetry: () => {
            DayManager.retryDay();
            UI.showHUD(true);
            UI.fadeTo(0, 600);
            this.startMorning(true);
          },
          onMenu: () => { UI.fadeTo(0, 400); Bus.emit('game:toMenu'); }
        });
      }, { skippable: false });
    }
  };

  window.Story = Story;
})();
