# ClutchIQ

ClutchIQ is a DevHacks prototype for post-match VALORANT coaching. It connects a timestamped positioning observation to a playable cover drill with a rule-based opponent and an explainable scenario director.

## Run

Open `dist/index.html` directly in a current Chrome, Edge, or Firefox browser. The first-person range uses WebGL and the bundled Three.js library. For static hosting, serve the contents of `dist/`. The simulator and clip review run locally without a build step, credentials, or backend.

Serve `dist/` over HTTP to launch the two games from **Play**. They use browser ES modules and ship with their dependencies. The game modes work on the same static host as ClutchIQ.

- **VALOTRAINER** is imported from [Pratilectron/valotrainer](https://github.com/Pratilectron/valotrainer/tree/ded498f5eb54867bd3d55648774984f6e3a90004) under MIT. The game uses its original ballistics and drill modes. ClutchIQ reads the five most recent drill results from device storage in Progress, and includes that history in the JSON export. The original license and weapon data notes are in `dist/valo-range/`.
- **Tiny Strike** is imported from [guyz/tinystrike](https://github.com/guyz/tinystrike/tree/04db555c4fc9f43fef3325c37930ad97a0c27aa3) under ISC, with its separate asset notices and rendering code license retained. The hosted game uses solo mode with bots. Online rooms and leaderboards require the upstream server. The original license and asset records are in `dist/tactical-match/`.

Run the deterministic engine checks with `node tests/check.cjs`.

## Walkthrough

1. Open the player menu and choose Beginner Academy or Experienced player demo. The optional Riot ID is a device-local label. Riot account verification is outside this prototype.
2. Open Clip Review. The synthetic simulator replay has a geometry-derived double-exposure finding at 0:04.1. Jump to the evidence, then choose Open cover drill. For your own short recording, load the clip, pause at the relevant moment, and tag the observed issue. The report transforms that tag into a timestamped suggestion with a Needs Context label. The prototype does not infer events from arbitrary VALORANT video.
3. Start a round in North Terminal. Move with WASD, aim with the mouse or IJKL, fire with left click or Space, and aim down sights with right click. Press R to reload, Shift to walk, C to crouch, Q to jump, and Escape to pause. On a touchscreen, drag on the left to move or on the right to aim, and tap the right side to fire. Use central cover to isolate each threat, then reach extraction.
4. Read the Bot Decision Log. The fixed opponent repeats two holds. The adaptive policy delays the east threat initially, increases support after a missed extraction or more than 1.5 seconds of double exposure, and introduces moving peeks after two consecutive clean extractions with at most one second of double exposure each.
5. Open Progress to run a controlled evaluation. Select a practice policy, then play three baseline rounds, four practice rounds, and three repeat assessment rounds. Before and after use the same three layouts in the same order and the same bot reaction timing. Export results as JSON.

## Evaluation

Strike and Veil are automatic rifles with different fire rates, spray and damage. Sentry is a semiautomatic sidearm. Moving and jumping increase shot spread. Practice on the walls to see the difference between single shots, short bursts and sustained fire. Ballistics and weapon handling use original tuning informed by Riot’s published [rifle movement accuracy](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-2-02/) and [spray recovery](https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-4-0/) notes.

Primary metric: isolated clears out of the two available threats each round. Secondary metrics: seconds of simultaneous active line of sight and extraction rate. Both policies use the same maximum round budget and round count. Record actual active time and use comparable exposure to practice in a participant study. Randomize assignment where feasible and report counts, before/after results, and carryover limitations. The application starts with zero measured evaluations. Scripted engineer checks demonstrate simulator behavior and cannot establish a training benefit.

## Data

Uploaded video is held as a browser object URL and released when replaced or reloaded. The optional Riot ID, completed rounds, and completed evaluations are stored on the device. No match data or account credentials are sent to Riot or to a coaching API. Clear the browser's site data to delete saved records.

ClutchIQ is an independent prototype and is unaffiliated with Riot Games. See the [VALORANT Developer Policy](https://developer.riotgames.com/docs/valorant) and [DevHacks rules](https://devhacks2026.devpost.com/rules).

