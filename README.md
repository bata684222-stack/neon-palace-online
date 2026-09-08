# NEON PALACE — 3D Casino Simulator · 6-DAY STORY CAMPAIGN + 2-PLAYER ONLINE

Полностью браузерная 3D-игра на **HTML5 + CSS3 + JavaScript (ES6+) + Three.js (WebGL)** + **Node.js + Express + ws** для мультиплеера.
Без React/Vue/Angular, без TypeScript, без сборщиков. Вся валюта — **виртуальная**, реальных денег нет.

Есть два режима:
- **SOLO** — классическая одиночная кампания (офлайн, `file://` работает, LocalStorage)
- **ONLINE 2-PLAYER** — два реальных игрока в одном 3D мире, общая квота, сервер authoritative

Игра — сюжетная кампания **6 дней**: дом → подготовка → чёрная машина → катсцена → казино → игры → квота в кассу → Tickets → домой → сон → следующий день. На шестой день — владелец казино и финал.

---

## Как запустить ЛОКАЛЬНО (SOLO офлайн)

**Вариант 1.** Открыть `index.html` двойным щелчком в Chrome/Edge/Firefox. Three.js локально (`vendor/three.min.js`), работает с `file://`, интернет не нужен.

**Вариант 2.** `python3 -m http.server 8080` → `http://localhost:8080`

## Как запустить ЛОКАЛЬНО (ONLINE 2 игрока)

Требуется Node.js ≥18.

```bash
npm install
npm start
# => NEON PALACE listening on 0.0.0.0:3000
# => открыть http://localhost:3000
```

Открой **две вкладки/два браузера** на `http://localhost:3000`:
1. Вкладка 1: `🌐 MULTIPLAYER` → введи имя → `CREATE ROOM` → скопируй `ROOM CODE` (например `A7K9X2`)
2. Вкладка 2: `🌐 MULTIPLAYER` → введи имя → вставь код → `JOIN` → `READY` у обоих → `START GAME`

Также доступны `QUICK PLAY` (автопоиск комнаты 1/2) и чат `[T]`.

Проверить сервер: `http://localhost:3000/health` → `{"status":"ok","rooms":[]}`

## Как задеплоить на Render (Web Service)

1. Залей проект в GitHub.
2. В Render → **New → Web Service** → подключи репозиторий.
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. Environment: `Node`
6. Deploy. Render выдаст URL вида `https://neon-palace.onrender.com` — он сразу раздаёт и frontend, и WebSocket (`wss://` автоматически).

Сервер:
- `process.env.PORT` (Render ставит свой) с fallback `3000`
- `0.0.0.0`
- `express.static(public)` + `ws` на том же `http` сервере
- клиент подключается к `location.host` с `wss://` если `https:` — никаких `localhost` в проде.

Нет отдельного frontend сервера.

---

## Управление

| Клавиша | Действие |
|---|---|
| `W A S D` | движение |
| Мышь | обзор (Pointer Lock, клик по игре) |
| `Shift` | бег |
| `Space` | прыжок |
| `E` | взаимодействие |
| `J` | квесты |
| `P` | профиль |
| `I` | инвентарь |
| `K` | достижения |
| `O` | магазин |
| `L` | daily reward |
| `M` | статус дня (дома PREPARE, в казино касса) |
| `T` | чат (online) |
| `Esc` | пауза / закрыть панель |
| `Space/Enter/Esc` | пропустить катсцену |

---

## Кампания 6 дней

```
HOME → PREPARE (Tickets) → CAR [E] GO TO CASINO → КАТСЦЕНА (13 планов) → КАЗИНО → ИГРЫ (время) → КАССА → DAY COMPLETE + TICKETS + XP → ДОМОЙ → СОН → УТРО
```
День 6: финальная квота → владелец на 3 этаже → финал → дом → диван → **6 DAYS COMPLETE / QUOTA PAID / GAME COMPLETE / THE END**

| День | Базовая квота | Максимум | Лимит ставки | Кредит фишек | Награда | Этажи |
|---|---|---|---|---|---|---|
| 1 | 5 000 | — | 2 000 | 8 000 | +3 🎟 | 1 |
| 2 | 15 000 | 30 000 | 6 000 | 24 000 | +4 🎟 | 1,2 |
| 3 | 40 000 | 80 000 | 16 000 | 64 000 | +5 🎟 | 1,2 |
| 4 | 100 000 | 200 000 | 40 000 | 160 000 | +6 🎟 | 1,2,3 |
| 5 | 250 000 | 450 000 | 100 000 | 400 000 | +8 🎟 | 1,2,3 |
| 6 | 600 000 | 1 000 000 | 240 000 | 900 000 | +10 🎟 | 1,2,3 |

Динамическая квота (и в solo, и в online): `nextQuota = baseNext + overpayment*1.5` (потолок дня). В online `overpayment = teamEarnings - quota` (сумма обоих игроков).

Время 08:00–22:00 =840 мин. Slots 10, Dice 15, Roulette 20, Blackjack 25, VIP 30 мин + дрейф 1 мин/1.15с. В 22:00 — **GAME OVER** с `RETRY DAY` (сохраняются Tickets/уровень/предметы/этажи).

### ONLINE особенности
- **Квота общая TEAM:** `Alice 2 500 + Bob 2 500 = 5 000/5 000` → день закрыт. HUD показывает `TEAM QUOTA` и вклад каждого.
- **Coins/Tickets/Items/XP/Level — индивидуальные.** Нельзя передавать Coins. Предметы действуют только на владельца.
- **Этажи открываются синхронно** для обоих (`floor_unlocked`).
- **Дома — один общий** (Вариант B). Оба видят друг друга.
- **Машина — оба READY**, затем синхронная катсцена (`travel_start` с `startAt` timestamp).
- **Игры — сервер решает результат** (`play_slots` → сервер RNG → `game_result`), клиент только рендерит. Кооперативно: один может играть Roulette, другой Slots одновременно.
- **Босс Day 6** проверяет `teamEarnings >= quota`, затем общая финальная катсцена → `GAME COMPLETE`.

---

## Архитектура ONLINE

```
CLIENT: HTML/CSS/JS/Three.js
SERVER: Node.js + Express + ws (authoritative)

project/
├── package.json          npm start → node server.js (PORT, 0.0.0.0)
├── server.js             Express static + WebSocket
├── server/
│   ├── validation.js     лимиты, RNG игр, quota, 1.5×, античит движения
│   ├── roomManager.js    код A7K9X2, 2 игрока, quick play, состояния дня
│   ├── playerManager.js  id p_xxxx, rate limit, chat limit
│   └── gameManager.js    playSlots/Roulette/Dice/Coinflip/Blackjack (server)
├── public/               раздаётся сервером (копия frontend)
│   ├── index.html
│   ├── style.css
│   ├── vendor/three.min.js
│   └── js/
│       ├── network.js        auto wss:// + protocol, сообщения
│       ├── remotePlayer.js   меш + имя + interpolation lerp
│       ├── multiplayer.js    lobby, HUD team, sync
│       ├── mpPatch.js        перехват игр → сервер, car/boss/чата
│       ├── main.js           boot + RemotePlayer + Network tick
│       ├── player.js         отправка 15Hz
│       └── ... (остальные как в solo)
└── README.md
```

**Server authoritative:** комнаты, id, позиции (валидация), день/время/квота, Coins/Tickets/XP, результаты игр, этажи, GameOver/Complete. Клиент — рендер/ввод/UI.

**Сообщения:** `create_room/join_room/quick_play/set_ready/start_game/player_update/chat_message/play_slots/…/buy_item/go_casino_ready/boss_interact` → `room_joined/player_joined/room_state/player_ready/game_start/day_start/player_update/chat_message/game_result/quota_update/day_time/travel_start/return_home/boss_ready/floor_unlocked/day_complete/game_over/game_complete/error`

**Синхронизация движения:** 10–20 Hz (66 мс throttle), интерполяция `prev→target lerp` + yaw lerp, состояние `idle/walk/run/jump`. Rate limit 40 msg/s, chat 0.7с, проверка телепорта >10 m/s.

**Безопасность:** валидация ставок/баланса/дня/этажа/cooldown на сервере, никогда `coins:999999` от клиента.

---

## Что внутри (мир / игрок / игры / прогрессия)

- Мир 60×44 м, примитивы + canvas-текстуры, 20 NPC, частицы, InstancedMesh.
- FPS: гравитация, бег, прыжок, коллизии, Pointer Lock.
- 5 мини-игр (Slots/Roulette/Blackjack/Dice/CoinFlip) — все с выплатами, лимитами, HOUSE PROMO (roulette 20%, BJ 18%, coin 15%, dice 5% + этаж +2/+4%).
- 30 уровней `400·1.15^(n-1)`, 12 квестов +4 daily, 26 достижений, daily 7-днев, 21 косметика, профиль.
- Сохранения `neonpalace_save_v1` (solo), автосейв 20с.
- Звук WebAudio процедурный, 3 качества.

---

## Структура solo (для справки)

```
casino3d/
├── index.html
├── style.css
├── vendor/three.min.js
└── js/
    ├── utils.js, save.js, audio.js, economy.js, progression.js, quests.js, achievements.js, inventory.js, shop.js, ui.js, world.js, dayManager.js, cinematicManager.js, home.js, car.js, floors.js, story.js, npc.js, player.js, interaction.js, slots.js, roulette.js, blackjack.js, dice.js, coinflip.js, main.js
```

---

## Тестирование

Вручную на двух вкладках: create/join/quick, 1/2 players, READY, START, WASD/mouse, remote interpolate, прыжок/бег, E, 5 игр (server result), Coins/Tickets раздельно, team quota сумма, 1.5×, Floor2/3, quests/items, house+car both ready → synced cinematic, casino entrance, Day Complete → return home → sleep → next day, Game Over → Retry, Day6 → Boss → final cinematic → Game Complete, disconnect `PLAYER DISCONNECTED`, reconnect по коду, чат `T`.

Автоматический WS тест (node): создание комнаты → join → ready → start → travel → day_start casino → play → quota_update — пройдено.

---

## Дисклеймер

Развлекательно-обучающий проект. Все монеты — **виртуальные**. Реальных ставок/пополнений/выводов нет.
