# Vantage

An original browser-based tactical shooter (Three.js + Vite). All maps, models,
textures, sounds and spray patterns are generated in code for this project
(textures are baked once to `public/textures/` by `npm run bake:textures`).

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

## Stage 6 (this build)

- **Dunehold redesigned** around what makes Counter-Strike maps work: three lanes, a mid that feeds both sites, and
  named places. Long A (T ramp, long doors, a car and a sunken pit), a catwalk from mid up to A short, mid with an
  Xbox crate stack, mid doors and a raised window over mid on the defender side, upper tunnels to B and lower tunnels
  joining them to mid, CT ramp and B doors for rotations, A platform with goose, B back plat and car. The place
  you're in is shown under the radar. No spot on the defender side can see into the attacker spawn.
- **Small maps for small modes**: Dunehold Market (one bombsite: an alley, a covered market hall and a courtyard)
  for 2v2 and 3v3, Dunehold Yard (a tiny one-site yard with two lanes and a crooked middle) for 1v1
- Matches are **first to 5** rounds in every mode
- **Graphics quality** presets (Low, Medium, High, Ultra, Auto) with dynamic resolution, static map shadows,
  visibility culling, character and weapon levels of detail; an optional FPS readout
- Weapons are held properly in third and first person (shouldered rifles, two-handed pistols, forward-grip knife,
  aim pitch shared down the body), the view no longer shakes, and bots aim, move and react like people

## Stage 7 (this build)

- **Tighter maps**: Dunehold's lanes are two to four cells wide and turn (S-shaped upper tunnels, bent CT ramp and B
  doors, a site wall that stops long A at the front of the site); long A and mid are the only long sightlines. Only
  13% of spots see further than 12 cells, down from 76%. Dunehold Market's courtyard is now a small fountain court.
- **No walking out of the map**: every border is closed, and the game adds a solid boundary around the grid as a
  safety net. `npm run check:maps` checks every map: closed border, every cell reachable from T spawn and back,
  points on walkable cells, and a flood fill over the exported colliders that must never get outside.
- **Map detail**: grime at the foot of every wall and dirt on the floor beside it, stains, cracks, scorch marks and
  footprints on the ground, rubble, planks, sacks, pallets, tyres, boxes, gas bottles, hand carts, litter, manholes and
  gutters, plus air conditioners, electrics, pipes, cables, vents, posters, shop signs, house numbers and spray paint
  on the walls, and painted **A / B direction signs** at junctions pointing the shortest way to each site
- **Richer textures** (chipped and cracked stone, rain streaks, tie holes in concrete, worn tile paint and more) with
  world-space colour variation so repeats don't line up, and fine grain up close on Medium and above. They are baked
  to `public/textures/` by `npm run bake:textures` (from `src/texgen.js`) and generated in web workers if missing.
- Knives held like CS in first person (tip angled inward; reverse grip karambit, punch grip push dagger), and kept
  weapons start each round with a full magazine and reserve

## Stage 8 (this build)

- **Bots fight back**: reactions from 0.22 s (Elite) to 0.6 s (Recruit), aim that is quick when the crosshair was
  already close, tracking that leads a moving target (a change of strafe direction still throws it off for a moment),
  turning to face whoever shot them from an unseen angle, backing off to reload, and walking with the crosshair on the
  last place an enemy was seen or heard. A Veteran bot now kills a standing player at 18 m in about a second.
- **Teammate outlines**: a white glow around allies wherever a wall or object hides them (Settings > Graphics)
- **Hands that hold pistols properly**: a second pair of first-person arms shaped for guns (index finger along the
  frame, fingers wrapped round the grip, left hand cupping the right) replaces the closed fist on every gun
- **Buy menu**: every click registers (the menu no longer rebuilds itself under the cursor)
- **Market buy orders and bot traders**: place an order to buy any copy of an item at your price (credits held
  until it fills or you cancel), sell instantly to the best order, and trade with bot traders that keep every item
  listed, hold buy orders, buy fairly priced player listings, fill fair player orders and build up price history.
  Bots always buy cheaper than they sell. `MARKET_BOTS=0` turns them off.
- Fixed a crash when "Show FPS" was turned on

## Stage 9 (this build)

- **Crash fixes**: on the one-site maps (Dunehold Market for 2v2/3v3 and Dunehold Yard for 1v1), a bot
  going hunting could pick bombsite B, which those maps don't have, and that ended the match. More generally, an error in
  one frame no longer stops the match: each bot, grenade, effect and the HUD runs on its own, so a fault
  skips a beat and gets logged in the console. Only a game that fails every frame for about three seconds is
  stopped. A graphics driver reset now recovers instead of ending the match.
- **Party queue**: a party member whose last match crashed (so it never reported a result) no longer
  blocks the party with "A party member is still in a match". The server closes matches whose host has gone
  quiet.
- **Smoke grenades no longer lag**: each cloud is one draw call (instanced puffs, fewer on lower quality
  settings), puffs fade out right in front of the camera, and standing inside a cloud draws one flat grey
  fill under your hands instead of dozens of see-through layers over the whole screen.
- **Inspect animations**: the hands turn the weapon only as far as a wrist and forearm can. Pistols are
  turned one-handed while the support hand drops away, and knives show the flat of the blade with a wrist
  bend. Flips and spins happen in the fingers (a half-turn flip on most knives, the karambit spin, the
  balisong flip), so the arms no longer twist.
- **Enemy outlines**: a red glow around enemies you can see, so they stand out against the map. It never
  shows through walls or smoke. Turn it off in Settings > Graphics.
- **Market prices change every day**: every item's value moves by a few percent a day (about -30% to +45%
  around its base value over time), the same for everyone. Quick-sell, inventory values and the bot traders
  all follow it, and bots re-price their listings and buy orders at midnight UTC. The market list shows
  each item's value today and its change since yesterday.
- **Market search finds any item**: search by weapon, finish, knife or rarity ("ak47 redline",
  "karambit fade", "sticker holo"). Every matching item is listed, even if nobody is selling it, and each
  item's page has a price chart for the last 7 days, 30 days or all time, with the item's value day by day.
- **Every match pays credits**: harder bots pay more (about 0.7x on Recruit, 1x Regular, 1.4x Veteran,
  1.7x Expert, 1.9x Elite), and leaving a match early keeps the credits for your kills, assists and rounds
  won (no win/loss bonus or case drops). Online matches pay everyone, including players who left.
- **Rare knife patterns**: a skin's pattern number (rolled when it drops) now picks a named pattern from
  its finish's template. Tempered Bloom can be a Blue Gem (Tier 1, about 1 in 100, nearly all blue),
  a Tier 2 Blue Gem (3 in 100) or a Gold Gem (1 in 40); fades run 80-99% with a 1 in 20 Full Fade; the
  Nebula Swirl comes in Phases 1-4 or, rarely, Sapphire, Ruby or Black Pearl. Rare patterns look
  different, sell for more (a Tier 1 Blue Gem about 8x) and are named in the inspect screens and on market
  listings. Patterns live in `src/items/patterns.js`.
- **Player matches pay more**: online matches against real players pay up to 2.5x the credits of the
  same result against bots (scaled by how much of the other team were people).
- **Doppler knives**: two new knife finishes on every knife type. Doppler Wave is candy-coloured metal in
  Phase 1-4 (Phase 2, pink, is the most sought after) with rare Ruby and Sapphire (1.5 in 100 each) and
  Black Pearl (under 1 in 100) patterns; Gamma Wave is the green version with a rare Emerald (2 in 100).
  Like real dopplers they only come Factory New or Minimal Wear.

## Stage 10 (this build)

- **Lag spikes fixed**: skin textures are painted on a background thread (a Web Worker) instead of the
  main thread, so equipping, dropping or picking up a skinned gun no longer freezes a frame. A gun shows its
  stock finish for a moment until the skin is ready.
- **Hit registration**: hitboxes are capsules on the posed skeleton (head, neck, chest, arms, legs) instead of
  boxes that didn't match the models; bullets follow the aim punch the same way the camera does; invisible
  colliders on props no longer swallow shots.
- **Rewards always arrive**: a match result is queued on your device until the server confirms it (each
  result is paid once), and a win always drops a case.
- **Economy**: knives cost several times more (about 15,000 to 110,000), the gold-tier chance is 0.5%,
  every player gets one **Gold Case** (opens free into a knife or gloves) and the **Universal Case** holds
  every gun finish in the game plus every knife and pair of gloves.
- **Wear**: Field-Tested now visibly wears a skin (3-12% of it), Battle-Scarred is capped at about a third.
- **Buy menu**: one page with every weapon, and refunds: right-click (or click again) something you bought
  this round to sell it back for the full price until it's been used.
- **Weapons**: the M4A1 is now the **M4A4**, plus a new **M4A1-S** (silenced, 20 rounds) and **Negev**
  (150-round belt that settles into a steady stream), each with skins. Four new knives: Skeleton,
  Hawkbill, Trench and Cord, with every knife finish.
- **Gloves**: six types with four finishes each, gold tier like knives. They show on your first-person hands
  and drop from the new **Grip Case** (14 gun skins in the same styles: sport stripes, tartan, woven
  leather, a hedge maze, snakeskin, kimono blossoms), the Universal Case and the Gold Case.
- **Market buy orders name a condition**: an order asks for a wear (FN to BS) and optionally a pattern
  (phases, gems, Full Fade), only a matching copy can fill it, and bots fill orders at their own asking
  price with the rest of the bid returned. (Before, a bot could fill a high bid with a cheap Battle-Scarred
  copy and keep the whole bid.) Cancel listings from the inventory or the market.
- **Player profiles**: look at anyone's profile (from the social drawer, a market seller's name, the online
  leaderboards, or by account name): level, ranks, stats and their whole inventory with its value.
- **Hands that move**: the first-person arms have finger bones. Every knife has its own inspect with the
  wrist and fingers moving: twirls walked through the fingers, tosses caught in the fist, the karambit and
  skeleton knife spun round the index finger by their rings, real balisong flips from the end of a handle.
  Push daggers are redesigned and held as a pair, one in each hand. Support hands open to let go of a pistol
  and to take a magazine.
- **Smaller enemy outline**, and **market inspect animation** to see a skin in first person.
- **Fingers move on their own**: glove vertices are bound to the finger they belong to, so no more
  stretched strips between fingers when the hand opens. The karambit inspect is one continuous
  three-turn spin on the index finger, then a look at the blade and a turn of the wrist to show the other
  side.
- **Bots, remade** (`src/match/strategy.js`): the map is read once into dozens of positions (ways into
  each site, lanes, staging spots, defender angles, lurk and early-aggression spots), so bots don't keep
  going to the same few spots. Attackers run a different play each round (rush, execute, split, fake,
  slow default, contact walk, solo lurk), stage out of sight, throw utility and go together; they go
  early when ahead, switch sites after running into a stack and always hit before time runs out.
  Post-plant angles depend on how many are left. Defenders take varied angles and shift between them,
  rotate on information, fall back together when outnumbered, hunt when well ahead, and retake as a
  group (or save). A death sends the nearest teammate to check it out and tells the team where the shot
  came from; a dropped bomb is fetched with cover.
- **Game types** (vs bots, Play > Game type): **Team Deathmatch** (respawns, free weapons, first team to
  the kill limit), **Arms Race** (every kill is the next gun, a knife kill wins) and **Retakes** (every
  round starts planted). Online casual adds **3v3**.
- **Skin review**: every skin was scored against the best Counter-Strike skins of the same tier
  (`docs/Vantage skin review.docx`); the 13 weakest finish types were redrawn from scratch with the same
  names, colours and feel (paint, carbon, anodized, damascus, topo, scales, marble, ink, flames, lightning,
  tempered, livery, galaxy).
- **A Gold Case for every existing player** (Nov 2026): every account that existed when this went live gets
  one extra Gold Case, once, with a "Gift" row in its history. New accounts don't get it (they start with
  their own Gold Case). One-off gifts like this are the `GIFTS` list in `src/shared/economy.js`.

## Blender models

Weapons, knives, characters and the Dunehold map are modelled with Blender scripts in `blender/` (see
`blender/README.md`) and exported to `public/models/`. The game preloads them and keeps its
procedural models as a fallback.

## Roadmap

1. ~~Core gameplay~~
2. ~~Economy, cases, original skins, wear (float) values, stickers, inventory with 3D inspect~~
3. ~~Ranked system with tiers and subranks, plus bots that scale to your rank~~
4. ~~Backend: accounts, party queue, matchmaking, market with sales history, trading~~
5. ~~Small-scale versions of the map for 1v1 and 2v2~~; more maps
