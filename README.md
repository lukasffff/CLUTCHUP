# ClutchIQ

ClutchIQ is a DevHacks prototype for post-match VALORANT coaching. It connects a timestamped positioning observation to a playable cover drill with a rule-based opponent and an explainable scenario director.

## Run

Open `dist/index.html` directly in a current Chrome, Edge, or Firefox browser. The simulator and clip review work locally with no build step, credentials, or backend. For static hosting, serve the contents of `dist/`. The application uses HTML, CSS, JavaScript, and Canvas. The web fonts have local fallbacks.

Run the deterministic engine checks with `node tests/check.cjs`.

## Walkthrough

1. Open the player menu and choose Beginner Academy or Experienced player demo. The optional Riot ID is a device-local label. Riot account verification is outside this prototype.
2. Open Clip Review. The synthetic simulator replay has a geometry-derived double-exposure finding at 0:04.1. Jump to the evidence, then choose Open cover drill. For your own short recording, load the clip, pause at the relevant moment, and tag the observed issue. The report transforms that tag into a timestamped suggestion with a Needs Context label. The prototype does not infer events from arbitrary VALORANT video.
3. Start a round. Move with WASD or arrows, aim with the mouse or IJKL, and fire with click or Space. On a touchscreen, tap the floor to move and a visible enemy to fire. Use central cover to isolate the west and east threats. Reach the marked extraction zone after both threats are cleared.
4. Read the Bot Decision Log. The fixed opponent repeats two holds. The adaptive policy delays the east threat initially, increases support after a missed extraction or more than 1.5 seconds of double exposure, and introduces moving peeks after two consecutive clean extractions with at most one second of double exposure each.
5. Open Progress to run a controlled evaluation. Select a practice policy, then play three baseline rounds, four practice rounds, and three repeat assessment rounds. Before and after use the same three layouts in the same order and the same bot reaction timing. Export results as JSON.

## Evaluation

Primary metric: isolated clears out of the two available threats each round. Secondary metrics: seconds of simultaneous active line of sight and extraction rate. Both policies use the same maximum round budget and round count. Record actual active time and use comparable exposure to practice in a participant study. Randomize assignment where feasible and report counts, before/after results, and carryover limitations. The application starts with zero measured evaluations. Scripted engineer checks demonstrate simulator behavior and cannot establish a training benefit.

## Data

Uploaded video is held as a browser object URL and released when replaced or reloaded. The optional Riot ID, completed rounds, and completed evaluations are stored on the device. No match data or account credentials are sent to Riot or to a coaching API. Clear the browser's site data to delete saved records.

ClutchIQ is an independent prototype and is unaffiliated with Riot Games. See the [VALORANT Developer Policy](https://developer.riotgames.com/docs/valorant) and [DevHacks rules](https://devhacks2026.devpost.com/rules).

