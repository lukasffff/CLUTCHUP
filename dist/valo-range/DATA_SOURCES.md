# Data provenance (researched Sep 2026)

## Global mechanics
- Yaw 0.07°/count, cm/360 = 914.4/(DPI×Sens×0.07): valohub.co/sensitivity,
  valorantsensconverter.com, mousetester.io, west-games.com (all agree).
- HFOV locked 103°: edpi-calculator.org/tools/valorant-scoped-sensitivity.
- Scope/ADS 0%-match multipliers (1.15x .908 / 1.25x .870 / 1.5x .815 / 2.5x .747 /
  3.5x .731 / 5x .723): edpi-calculator.org (community set).
- Zoom levels per weapon (1.15x SMG/heavy ADS, 1.25x rifle ADS, 1.5x Guardian,
  3.5x Marshal/Outlaw, 2.5x/5x Operator): edpi-calculator.org + wiki.playvalorant.com.
- Headshot ding ~1245 Hz: prior art (community).

## Per-weapon bands, RPM, mag, reload, pen (primary source)
- liquipedia.net/valorant/Portal:Weapons/Statistics (full H/B/L × range bands,
  wall pen, mag/reserve, primary + alt fire rates). Includes 2026 Bandit.
- Cross-checked vs strafe.com 2026 guide, dotesports.com weapon stats,
  ilovevalorant.com, valdb.gg, vgraphs.com, wiki.playvalorant.com weapon pages.

## Handling details
- Phantom spread table (0.2°/0.17 crouch, max 0.9/0.76, move +0.8/3/6/10,
  ADS 0.11/0.09, crouch ×0.85, HS ×4, leg ×0.85): valorant.fandom.com/wiki/Phantom,
  wiki.playvalorant.com/en-us/Phantom.
- Judge spread table (2.5/2.12, max 4/3.4, +0.5/1/2/4, 12 pellets, HS ×2):
  wiki.playvalorant.com/en-us/Judge.
- Marshal (3.5x scope, 1° hip / 0° scoped, 1.5/1.2 rps, equip 1.25s, scoped move 90%),
  Operator (2.5x/5x, 5° hip / 0° scoped, 0.6 rps, equip 1.5s, scoped move 72%),
  Shorty (15 pellets, 0-7/7-15/15-50 bands, HS ×2, spread 4°, equip 0.75s, 300 cr):
  wiki.playvalorant.com weapon pages.
- Vandal ADS (0.157° spread, 8.32 rps ADS) / Phantom ADS (9.9 rps): Liquipedia + vgraphs.
- Vandal/Phantom equip 1.0s, reload 2.5s: vgraphs.com. Other equip times estimated
  from class (pistols 0.75 / SMG 0.9 / rifles+heavy 1.0 / Sheriff 1.0 / knife 0.5).
- Run speeds per weapon: dotesports table (5.73 knife/pistols/SMG, 5.4 rifles,
  5.13 heavies/Operator, 5.06 shotguns). Outlaw run estimated 5.06.
- Riot Data Drop Phantom vs Vandal (playvalorant.com): falloff behavior, ADS
  usage, armor interaction — model matches its conclusions.
- Ghost 13-round / Frenzy 15-round mags, Shorty 300 cr,
  Guardian 5.25/4.275 rps, Ares 75/70 bands, Bandit bands: Liquipedia (current).
- Bulldog primary 10 rps, alt 3-round burst @13.333 rps intra / 2.105 bursts/s,
  alt spread 0.1°, burst recovery 0.35 s: wiki.playvalorant.com/en-us/Bulldog.
- Stinger primary spread 0.65°/0.55 crouch, max 1.5°/1.28, move +0.15/1/2.5,
  alt 4-round burst @18 rps intra / 2.118 bursts/s, alt spread 0.5° (patch),
  recovery 0.4 s: wiki.playvalorant.com/en-us/Stinger, Liquipedia/Stinger.
- Classic alt = 3 pellets instantly @2.22/s, alt spread 2.2°, primary 1st-shot
  0.4°, equip 0.75 s: wiki.playvalorant.com/en-us/Classic, vgraphs, op.gg.
- Movement physics: accel 18.75 m/s², friction v·e^(-3.3t)−28.6t, jump 1.2 m /
  g 21 / v0 7.098, knife 6.75 m/s: r/VALORANT "Valorant Physics, Derived".
- Deadzone 27.5% (=1.485 m/s @5.4): tbaustin gist; stop timings 0.055/0.104/0.160 s
  (Riot dev via turbosmurfs.gg, Aug 2026); counter-strafe adds no braking force.
- Patch 6.11: running shots uniform in cone, running vertical recoil ×1.8 on
  Vandal/Phantom/Spectre (still in effect): turbosmurfs.gg.
- Marshal reload 0.5 s per bullet: wiki.playvalorant.com/en-us/Marshal.
- Orb color study: computed WCAG contrast + hue separation of 8 candidates vs the
  scene palette (walls/floor/radianite/red/cream) — vivid violet wins; legacy
  teal sat 2.8° from Radianite glow (the reported wash-out). See tools note below.
- Facility art direction (Radianite, range-hall layout) is original art inspired
  by VALORANT's Range, not copied assets.
- 9 scenery themes are original palette/mood variations over one hall contract;
  no gameplay numbers change between themes.
- Crosshair profile code format (segments, tokens, ranges, defaults, colors):
  Liquipedia Module:Crosshair decoder, r/VALORANT crosshair-code reverse
  engineering, flank.gg color table. Unknown tokens (b, p) + A/S segments
  preserved verbatim; unlinked vertical lengths merged (noted on import).
- Tracking-bot movement principles: move → stop → shoot → move, 0.2–0.3 s jiggle
  exposure, tempo variation, micro vs long strafes, counter-strafe/stop-shoot,
  deadzone 25–30%: strafe.com 2026 strafe guide, metabot.gg counter-strafe +
  peeking guides, bo3.gg counter-strafe guide, boostroom.com movement guide.
  Engine numbers (accel/friction/deadzone/stop) reused from above; strafe
  durations, pause/fake/crouch rates and rhythm cadence are modeled
  assumptions, labeled as such in stalker.js.
- Oni Katana (Onimaru Kunitsuna): Oni 2.0 bundle, 5350 VP melee, level 2 custom
  anim/VFX/audio on run/inspect/equip/swipes, sheathed until inspect (Y) or slash,
  base + Gold/Black + Pink/Mint + Blue/White: dotesports.com, sportskeeda.com,
  insidesport.in, r/VALORANT (sheath + inspect behavior, pull-out size).
- Melee frame data: LMB 50 / RMB 75, ×2 from behind, damage at 0.19 s, re-swing
  0.49 s / 1.205 s, equip 0.6 s, 3-swing LMB combo, LMB longer range / RMB 1.5x
  box: wiki.playvalorant.com/en-us/Melee, Kavlo frame analysis (reddit),
  thespike.gg knifing deep-dive, Liquipedia/Tactical_Knife.
- Bucky alt-fire 5-pellet slug, primary 9 pellets: community consensus (flagged estimate).
- Recoil pitch/yaw per gun: game-feel approximation (VALORANT crosshair follows
  recoil; we mirror into camera). Flagged estimate in codex.

## Known approximations (labeled `estimate` in-game)
Recoil magnitudes, unlisted 1st-shot spreads, unlisted equip times, Outlaw hip
spread + reload, Bucky pellet counts, Classic burst ammo cost, ADS move slowdown.
Everything else is game data.
