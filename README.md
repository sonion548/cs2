# Vantage

An original browser-based tactical shooter (Three.js + Vite). All maps, models,
textures, sounds and spray patterns are generated in code for this project.

## Run

```bash
npm install
npm run dev
```

Open the printed URL and click **Start match**.

## Stage 1 (this build)

- Ground and air movement with friction and acceleration, walking, crouching, jumping and stair stepping
- Weapons: AK-47, M4A1, AWP (scoped), Desert Eagle, Glock-18, USP and a knife (with a backstab bonus)
- Fixed, learnable spray patterns per gun (see `src/weapons.js`), movement and jump inaccuracy,
  distance falloff, armour penetration and hit groups (head, chest, stomach, legs)
- Viewmodel with bob, sway, kick, deploy, reload and inspect (`F`) animations
- Original map **Dunehold** with two bombsites, mid, a long A lane and B tunnels
- Bots with a single `skill` value that sets reaction time, aim, spray control and tactics
- 5v5, 3v3, 2v2 and 1v1 rounds, radar, kill feed, scoreboard, damage indicators and a loadout menu

## Roadmap

1. ~~Core gameplay~~
2. Economy, cases, original skins, wear (float) values, stickers, inventory with 3D inspect
3. Ranked system with tiers and subranks, plus bots that scale to your rank
4. Backend: accounts, party queue, matchmaking, market with sales history, trading
5. More maps and small-scale versions of each map
