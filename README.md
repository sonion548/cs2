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

Server settings come from environment variables, or from a `.env` file next to `package.json`
(copy `.env.example`; `.env` is never committed):

- `DATABASE_URL`: a Postgres connection string (for example a free Neon database). When it's set,
  accounts, inventories, market listings and trades are saved in the `vantage_kv` table and market
  sales in `vantage_sales` (both created automatically).
- `DB_FILE`: without `DATABASE_URL`, everything is saved to this JSON file instead (default
  `data/db.json`).
- `PORT`: default 8080.

To check a running server end to end, run `node server/selftest.js ws://localhost:8080/ws`.

### Saving accounts in Neon (Postgres)

1. Sign up at neon.tech and create a project (the free plan is enough). Pick the region closest to
   where the game server runs (for Render's Oregon region, AWS US West 2).
2. In the project dashboard click **Connect** and copy the connection string. It looks like
   `postgresql://user:password@ep-something-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require`.
   Use it exactly as Neon shows it: the server reads `sslmode` and `channel_binding` and always uses a
   verified TLS connection.
3. Optional local check: put `DATABASE_URL=<that string>` in a `.env` file next to `package.json`
   and run `npm run db:check`. It connects, creates the tables and prints how many accounts are stored.
4. Already have accounts in `data/db.json`? Copy them across once with `npm run db:import`.

Neon pauses the database after a few minutes without traffic and wakes it on the next request. The
server retries for about a minute at startup while the database wakes up, and reconnects on its own
if an idle connection is dropped.

### Hosting on Render

The repo includes a Render Blueprint (`render.yaml`) that sets up one web service. It builds the
client and runs the game server (HTTP and WebSockets on Render's port). Accounts live in Neon, so the
service needs no disk.

1. Push this branch to GitHub (or merge it into `main`).
2. In Render: **New → Blueprint**, connect the GitHub repo, pick the branch and click **Apply**.
   Render asks for `DATABASE_URL`: paste the Neon connection string.
3. When the deploy finishes, open the `https://<name>.onrender.com` URL. Players sign in from the menu.

The Blueprint uses the free plan, which sleeps after 15 minutes idle (the next visit takes about a
minute to wake it). Accounts are safe either way because they're in Neon. Switch `plan` to
`starter` to keep it awake.

### Hosting elsewhere

Run the server on any machine that other players can reach: a small cloud VM, a VPS or a home PC
with port forwarding. It needs Node 22+, the repo, `npm install && npm run build`, and then
`npm run server` kept running (for example with systemd or pm2). Put it behind HTTPS (Caddy or
nginx) so browsers can use `wss://`. Set `DATABASE_URL` to keep accounts in Neon, or back up
`data/db.json` if you use the file.

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

## Stage 5 (this build)

- **Bombsite rounds**: one attacker carries the bomb; plant it on A or B (hold Use, 3.2 s), defenders defuse it
  (10 s, 5 s with a kit) before the 40 s fuse runs out. The bomb drops on death and any attacker can pick it up.
- **Match economy and buy phase**: 15 s freeze time plus 20 s of buying near your spawn. Money from kills (by weapon
  class), round wins, a growing loss bonus, plants and defuses. Survivors keep their gear between rounds.
- **Arsenal**: 28 guns across pistols, SMGs, rifles (two scoped), snipers, shotguns (pump with shell-by-shell
  reloads, semi-auto, double barrel) and machine guns, each with its own role, price and learnable spray pattern.
- **Grenades**: HE, flashbang, smoke (blocks vision for players and bots), molotov / incendiary (burning ground that
  smoke puts out) and decoy. Hold Fire to throw, Alt-fire to lob, both for a medium throw.
- **Weapons on the ground**: buying or dropping (G) leaves the old gun on the floor; walk over it or press Use to swap.
- **Characters**: skinned soldiers on one skeleton. Arms reach the weapon's grip and foregrip with IK, rifles sit in
  the shoulder with a bladed stance, plus walk cycle, crouch, aim pitch, reload, recoil and plant/defuse poses.
  Dead bodies become ragdolls that settle against walls and floors, then disappear after a while.
- **First-person**: arms are solved every frame, so they stay on the gun during inspects; bolt cycling, pump racking,
  slide lock on an empty pistol, revolver cylinder, left hand fetching magazines, grenade wind-up and throw.
- **Surface marks**: bullet holes, blood spatter on walls and floors behind hits, knife cuts, scorch marks.
- **Bots** only know what they see (not through walls or smoke, not while flashed), hear (gunfire, footsteps,
  grenades, the bomb) or get shot by. They buy by budget, plant, retake, defuse, fetch a dropped bomb and use utility.
- **Spectating**: after death, follow teammates in first person (with their gun and arms) or third person, or fly a
  free camera (off in ranked). Fire / Alt-fire switch player, Jump changes the view.
- **Settings**: rebind every action (two slots each, keyboard or mouse) and edit the crosshair (style, length,
  thickness, gap, colour, opacity, outline, dot, T-style) with a live preview.
- **Dunehold** now has buildings you can walk into (an apartment hall, a market hall, side rooms off mid and a house
  between B and the defender spawn), a second tunnel to B, sandbag cover on both sites and rooftop detail.
- 140 new weapon finishes (six new finish styles: pattern-welded steel, marble, wood grain, anodised, gold seams and
  hydro-dip) in five new cases. The cleaver is retired: any cleaver you own becomes a bowie with the same finish.

Online: the host runs the bomb, money and grenades for everyone; dropped weapons are only visible on the machine that
dropped them.

## Blender models

Weapons, knives, characters and the Dunehold map are modelled with Blender scripts in `blender/` (see
`blender/README.md`) and exported to `public/models/`. The game preloads them and keeps its
procedural models as a fallback.

## Roadmap

1. ~~Core gameplay~~
2. ~~Economy, cases, original skins, wear (float) values, stickers, inventory with 3D inspect~~
3. ~~Ranked system with tiers and subranks, plus bots that scale to your rank~~
4. ~~Backend: accounts, party queue, matchmaking, market with sales history, trading~~
5. More maps and small-scale versions of each map
