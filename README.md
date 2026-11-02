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

## Stage 2 (this build)

- Weapon models rebuilt from smooth curved profiles, bevelled edges and lathed parts (no boxes)
- 14 collectable knife types plus the default field knife: bayonet, combat bayonet, karambit,
  balisong, flip, gut hook, bowie, push dagger, navaja, stiletto, kukri, tanto, survival and cleaver.
  The balisong and karambit have their own inspect animations.
- Rounded characters with fabric camo, helmets, plate carriers and first-person gloves
- Walls and floors use generated normal maps for depth (block joints, cracks, paving, sand ripples)
- 60 original weapon skins and 14 knife finishes across 28 procedural finish styles
- Wear system: every item has a float value from 0 to 1 that sets its condition (Factory New to
  Battle-Scarred) and how much paint has chipped off. A pattern seed from 0 to 999 makes each item unique.
- 112 stickers (28 designs × paper/holo/foil/gold), applied to four slots per gun and scraped off over time
- Five cases and a sticker capsule, with a case-opening reel, odds table and contents preview
- Inventory with filters, sorting, a rotatable 3D inspect view, equipping, quick-sell and Tally kill counters
- Credits and case drops earned from matches; equipped skins show in first person and on bots
- New client menu (Play, Inventory, Cases, Career, Settings)

## Roadmap

1. ~~Core gameplay~~
2. ~~Economy, cases, original skins, wear (float) values, stickers, inventory with 3D inspect~~
3. Ranked system with tiers and subranks, plus bots that scale to your rank
4. Backend: accounts, party queue, matchmaking, market with sales history, trading
5. More maps and small-scale versions of each map
