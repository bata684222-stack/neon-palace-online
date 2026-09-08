# Skill: Game Design / Economy / Multiplayer

## Economy (6-day quota)
- Small payouts vs big quotas, `1.5× overpayment` with ceiling, `HOUSE PROMO` cashback (roulette 20% etc + floor +2/+4) to make quota beatable.
- `Bet limits` per day `cap*share` + `VIP +15%` + `upgrades +20%`. Validate `min/max/balance` server-side, never trust client `coins:9999`.
- `Safety Card` 50% refund once/day, `Lucky Charm` 5% nudge, `Coin Magnet` 8% net.

## Multiplayer (authoritative)
- `Node+Express+ws` same `http` server, `PORT env` + `0.0.0.0`, auto `wss://` via `location.host`.
- Rooms `A7K9X2` max 2, `CREATE/JOIN/QUICK`, `READY`, `START` only when `2/2 READY`.
- `player_update` 15Hz throttle, `lerp(prev,target)` for `pos/yaw`, `jump` y sync ground-relative.
- Server validated: `bet/balance/day/floor/cooldown`, rate 40/s, chat 0.7s, movement `>10m/s` reject, game RNG server.

## Campaign Flow
- `HOME→PREPARE→CAR both READY→TRAVEL startAt→CASINO→TEAM QUOTA (sharedCoins, teamEarnings sum)→CASHIER→DAY_COMPLETE (tickets+XP per player, nextQuota base+over*1.5)→RETURN_HOME→SLEEP both READY→next DAY`. Day6 `BOSS` checks `teamEarnings>=quota` → `FINAL` → `HOME sofa` → `GAME COMPLETE`.

## Skills / Upgrades
- `UPGRADES` (Tickets): `BET +20%`, `LUCK +5%`, `PAYOUT +10%` max3, patch `DayManager.betLimit` + `Items` bonuses.
- `SKILLS` (XP): 3 trees `3D:speed/jump`, `HTML:ui/theme`, `Games:luck/payout` — spend XP, apply via `Player` props.
- Save `upgrades` + `skills` in `neonpalace_save_v1` with sanitize, `State._teamEarnings` for HUD.

## Visual
- 3D hall from primitives + `CanvasTexture` 512 + `InstancedMesh` + `tiered lights` + `dust` + `winBurst`. Keep `RTT` cheap: no `AO` map second UV unless needed.
