# Vantage

An original browser-based tactical shooter (Three.js + Vite). All maps, models,
textures, sounds and spray patterns are generated in code for this project.

## Run

Offline (single player against bots):

```bash
npm install
npm run dev
```

Online (accounts, market, trading, friends, parties, multiplayer). Build the client, then start the
game server, which serves the client too:

```bash
npm install
npm run build
npm run server
```

Open http://localhost:8080. For development with hot reload, run `npm run server` in one terminal
and `npm run dev` in another; the dev server forwards `/ws` to port 8080.

Server settings come from environment variables: `PORT` (default 8080) and `DB_FILE` (default
`data/db.json`). To check a running server end to end, run `node server/selftest.js ws://localhost:8080/ws`.

### Hosting for other players

Run the server on any machine that other players can reach: a small cloud VM, a VPS or a home PC
with port forwarding. It needs Node 18+, the repo, `npm install && npm run build`, and then
`npm run server` kept running (for example with systemd or pm2). Put it behind HTTPS (Caddy or
nginx) so browsers can use `wss://`. Back up `data/db.json`, which holds all accounts and items.

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

## Stage 3 (this build)

- Ranked ladders for Competitive 5v5 and Wingman 2v2: 9 tiers and 29 divisions
  (Iron → Bronze → Silver → Gold → Platinum → Diamond → Obsidian → Vanguard → Apex)
- Hidden MMR with an uncertainty value, 5 placement matches (capped at Platinum IV) and RP that
  pulls toward your MMR. Higher tiers gain less and lose more, and win streaks give bonus RP.
- Promotion series (best of 3 into Diamond and Obsidian, best of 5 into Vanguard and Apex). Apex is
  limited to the top 100 on the leaderboard.
- Demotion shields, decay for Diamond and above after a week away, and abandon penalties with growing cooldowns
- Bot skill (reaction time, aim, spray control, tactics) follows your hidden rating
- Ranked page with emblems, RP bar, series tracker, stats, rank distribution and a leaderboard
  against a simulated player base
- 20 new illustrated skins and 3 knife finishes: original anime-style characters, landscapes, koi,
  wildstyle graffiti, comic pop-art, tattoo flash, mecha livery and sticker bombs, in the new
  Canvas Case and Street Case

## Stage 4 (this build)

- Game server (`server/`): accounts with hashed passwords and session tokens, and server-owned
  inventories (cases open on the server, so the client can't fake drops)
- Player market: list items at your own price, buy from other players (10% fee), view the
  listings for each item, and see sales history with a price chart, recent sales and a reference price
- Friends (requests by name, online/in-match status), parties of up to 5, and trade offers with
  item-for-item swaps that happen atomically on the server
- Matchmaking: casual online (real players, bots fill empty slots), ranked vs bots with your party,
  and ranked PvP (humans only, teams balanced by rating, search window widens over time). Online
  ladders are stored on the server, with a leaderboard of real players.
- Networked matches: the host simulates the round and bots, and clients send movement and shots
  then render 20 Hz snapshots. Hits, kills, round flow and results are synced, and leaving
  counts as an abandon in ranked.
- Illustrated skins and stickers use a hand-drawn renderer (ink lines, layered washes, paper grain)

Known limits: the host's machine runs the match, so a modified client acting as host could cheat.
A dedicated authoritative game server would close that gap. There is no host migration (if the host
leaves, the match ends), and offline items stay on the device that earned them.

## Blender models

Weapons, knives and the Dunehold map are modelled with Blender scripts in `blender/` (see
`blender/README.md`) and exported to `public/models/`. The game preloads them and keeps its
procedural models as a fallback.

## Roadmap

1. ~~Core gameplay~~
2. ~~Economy, cases, original skins, wear (float) values, stickers, inventory with 3D inspect~~
3. ~~Ranked system with tiers and subranks, plus bots that scale to your rank~~
4. ~~Backend: accounts, party queue, matchmaking, market with sales history, trading~~
5. More maps and small-scale versions of each map
