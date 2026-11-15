# CLUTCHUP final QA audit

Date: November 15, 2026. Starting commit: 4ff104b on `codex/phase2-intelligent-coaching`; existing draft PR #1 targets main. The starting build had **63**, not 55, passing Node tests.

## Release decision

**Automated audit passed; live hackathon sign-off is still pending.** The audit fixes confirmed defects and supplies a rehearsal guide. It does not claim that the complete native-browser playthrough, all ability visuals, the target-resolution benchmark or the three-minute live rehearsal passed.

Desktop Edge state capture failed; Computer Use then stopped because it could not determine the browser URL confidently enough to enforce its policy. No further browser input or alternative browser automation was attempted. Prior Phase 2 browser observations are identified as historical, not evidence of the new revision's UI.

No live analysis key was configured in the audit shell. Provider validation/success/error paths were tested with mocked responses; live vision-model quality and current YouTube embedded playback are unverified. No real human before/after improvement or fixed/adaptive outcome was fabricated.

## Confirmed defects and fixes

| ID | Confirmed problem | Fix / regression evidence |
| --- | --- | --- |
| QA-01 | Starting a new baseline could leave the dashboard paired to an older retest/baseline. | The latest baseline starts a new comparison; a retest must occur later. Multiple chronological runs are tested. |
| QA-02 | Expanding a historical retest could show measurements from the profile's newest retest. | Comparison accepts the report's own run ID. A historical improving run remains bound to its own before/after data even when a newer run worsens. |
| QA-03 | Saved YouTube reviews/local-video reports were shared across local profile labels. | Profile-scoped reads, writes and deletion preserve other profiles' items, even when IDs overlap. Legacy unlabelled reviews belong to Local. Failure/reload/deletion checks preserve unrelated match progress. |
| QA-04 | Valid JSON of the wrong shape in session storage could crash callers expecting an array. | Session reads fall back safely and reject null/non-record entries. Regression covers malformed array contents and object instead of array. |
| QA-05 | The smoke-opportunity detector required at least two enemies, making it unreachable in the primary 1v1. | It can now record one legal screenable enemy line. An actual Harbor smoke-opportunity test verifies one opponent and the ability name. Text states the actual count. |
| QA-06 | A selected historical tactic could equal the current route, yet be logged as a change. | Attack adaptation chooses a different authored route when needed; unchanged defender patrols are not reported as changes. The test verifies different queued coordinates and the three-round evidence. |
| QA-07 | Finishing an authored route cleared `routeName` before the round report, losing failure/adaptation evidence. | A retained round-route name survives route completion and is saved with the round. Actual route assignment/completion is tested. |
| QA-08 | Player fire deadlines discarded fractional elapsed time, reducing and varying continuous fire rate by frame interval. | Deadlines retain remainder, reset after interruption and do not generate catch-up bursts. Actual rifle-trigger replay now records 100 shots in ten seconds at each tested 20-165 FPS; prior scheduling recorded 93-98. Bot cooldowns retain elapsed remainder too. |
| QA-09 | Roster rebuild dropped actors without invoking existing owned-rig cleanup. | Rebuild releases owned visual materials/mixer bindings before removal. Regression verifies disposal and one-opponent CT/T rosters. Shared templates are retained. |
| QA-10 | A `trailer` query could override coached roster size with cinematic bot counts. | Cinematic roster override is excluded whenever coaching is active. Primary coach launch specs always describe a duel. Archived non-coached game remains available. |
| QA-11 | New graphics preferences could be lost when continuing from the game or launching from a video finding. | Launch paths preserve selected quality; settings persist Low/Medium/High and retain the legacy Low preference. Settings/home/progress render in a DOM fixture. |
| QA-12 | Newly recorded range results omitted the active local profile key. | Range session bridge now stamps the active label. Original archived range history stays device-local and separate from tactical diagnosis. This bridge is source/syntax checked; native range UI was not retested. |

## Required gaps completed without redesigning the game

- Implemented distinct Low, Medium and High presets across render resolution, texture budget, shadows, sky environment and post-processing. No maps, agents, weapons or cosmetic systems were added.
- Expanded opt-in diagnostics to average frame time/FPS, 1% low, p95/p99/max, frame spikes, per-system CPU costs, draw calls/triangles, geometry/textures and available heap metrics. Reset and local JSON export are available. Frame-stat arithmetic is unit-tested; actual new browser captures remain pending.
- Added a controlled fixed/adaptive comparison to Progress. Both use the same Harbor customs starts, controller, pistols, no buying and fixed reaction delay. Fixed disables historical route/peek choices; reactive combat/abilities remain in both. Records include comparison protocol v1. The comparison has no seeded player results and requires at least two observed rounds per condition before comparison. This descriptive A/B interface does not establish causal human improvement.
- Changed assessment protocol to v3 after the firing-policy correction. Old v1/v2 history remains saved but cannot be paired with v3 assessments. Take a fresh baseline.
- Coaching feedback and supported video training links explain the practice method and measured target alongside the action, rationale and correction.
- Created `DEMO_GUIDE.md` with exact preparation, the requested 0:00-3:00 schedule, honest pre-recorded-result disclosure and fallback steps.

## Verification by requested phase

| Requested area | Evidence available now | Still requiring live verification |
| --- | --- | --- |
| Project inspection | Source tree, README/Phase 2 report, main update loop, bot navigation/tactics, habits, coach/benchmarks, agents/effects/HUD, review parser/sampler/endpoint and storage paths reviewed. All existing tests read/run; archived engine check also passes. | Not every line of vendor/minified libraries or every archived game mode was re-audited. |
| Performance | OS reports i9-14900HX, RTX 4060 Laptop GPU and Intel UHD. Real Harbor CPU ray/path/collision batches run; timing replay and bounded-step tests pass. See PERFORMANCE_REPORT.md. | New rendered FPS/1% low/spikes at 2560 x 1600; GPU selection/acceleration; shadows/texture visuals and long-run memory trace. |
| 1v1 gameplay | Actual controller logic covers look, walking/crouch/jump, collision and death; firearm hitboxes/headshots/reload checks pass. Plant/defuse timers and stationary requirements pass. Roster checks cover one opponent and either side. | Physical mouse/keyboard feel, sound, buying/weapon switching during a full human round, attacker/defender match play and complete native round transitions. |
| Opponent intelligence | Existing navigation/recovery/holding/strafe, sound-consumption, last-seen aim, smoke/flash/recon and cover-maneuver checks pass. New repeated-approach test verifies history threshold, changed authored route coordinates and explanatory evidence. | Human-visible tactical quality of the changed route across extended sessions and all utility combinations. |
| Coaching cycle | Synthetic gameplay-event test uses real shot recorder and persistence for baseline -> diagnosis -> support/standard/challenge -> reassessment -> recommendation. Separate tests move each real demonstration actor through Harbor collision, reach staged positions and restore scene/pose. | Complete human-controlled cycle and proof of useful learning. Synthetic test records stay out of the user's saved progress. |
| Abilities | All 16 receive individual logic tests for key mapping, activation, real scene objects, effects, charge/cooldown, HUD state, death rejection, expiry/cleanup and round/match resets. Dash/barrier failure cases and one-opponent smoke opportunity pass. | Actual appearance/audio and physical-key feel in desktop Chrome/Edge; exhaustive ability interactions or every cast placement. |
| YouTube | Watch/short/Shorts/live URL parsing, timestamps, manual note CRUD/persistence, conservative drill selection and source separation pass. No embedded frames are sent for fake AI analysis. | Current network iframe playback/seek controls and creator restrictions. |
| Local video | Size/format/segment limits and ordered timestamps pass. Mocked provider test covers explicit authorization, origin/shape validation, success, empty findings, refusal, timeout, malformed provider output and HTTP errors without exposing provider error details. Key stays server-side. | Actual codec decoding/upload/frame preview rendering on this browser and live model evidence quality. |
| Coaching accuracy | Low/high aim error, moving-shot and pre-aimed-opening metrics have evidence thresholds; recurring weaknesses need independent attempts. Text connects observation, rationale, correction, practice method and measured target. Utility advice requires recorded effects/opportunity. | A validated model of intent, complete angle clearing, deterrence, teamwork or causal improvement. These are explicitly not claimed. |
| UI | Settings/home/progress render and persist quality in a Node DOM fixture; all changed/new JavaScript parses. Existing CSS supports selects and responsive layout. | New controls' visual layout/overlaps, export downloads, native pointer capture and three-minute rehearsal. A DOM fixture is not a browser screenshot. |
| Data | Session persistence/deduplication, profile separation, same-ID review deletion across profiles, malformed session fallback and storage errors are tested. JSON export uses only the active label's sessions/reviews/reports. | Clicking/reopening/exporting/deleting through the actual new browser UI. |
| Fixed/adaptive evaluation | Setup/protocol matching, separate conditions, actual-count aggregation, empty state and minimum-attempt gate are tested. Historical tactics alter actual route queues. | Real fixed/adaptive human measurements, order-control study and before/after coaching benefit. No real comparison data has been collected in this audit. |
| Three-minute demonstration | Exact runbook supplied; 24-second lesson sequence fits the requested teaching segment. Existing tests verify the authored sequence and cleanup. | Target-hardware rehearsal and stage sign-off. Results segment must show genuine results recorded before the slot; it cannot fit three complete retest trials into 30 seconds. |

## Ability matrix result

Logic tests passed for Kestrel: Slipstream, Glint, Veil Step, Overtake; Morrow: Waypoint Smoke, Ember Field, Crosswall, Nightfall; Relay: Survey Node, Corner Burst, Static Patch, Wide Sweep; Bastion: Gatepost, Frost Mesh, Trip Beacon, Last Line.

These use the real Harbor world, Three.js scene objects, collision, smoke intersection, bot flash behavior, recon/trap reveal, slow scale and zone damage. HUD fields are exercised through the real renderer method with lightweight DOM objects. Actual physical C/Q/E/X input is not simulated as a native-browser success. F resolves to the objective action and V to the prior weapon; remapping swaps duplicates correctly. Effects on death remain active until expiry/round clear by design; a dead owner cannot cast again.

## Coaching accuracy and measurement boundaries

- **Observed:** shot counts, hit zones, movement at fire, contact-window aim-height samples, player-opened peeks, sightline breaks, near-cover/exposed time, ability contacts, objectives and authored route assignments.
- **Inferred:** a recurring threshold-crossing behavior merits a lesson, or a repeated approach merits a counter-route. The log exposes the supporting counts. This is rule-based selection, not learning a new strategy through machine learning.
- **Changed:** route coordinates/defensive watch, contact-based cover maneuvers, assistance or challenge settings, and lesson choice. Assistance delay alone is not presented as tactical adaptation.
- **Improved:** only a measured ratio/count difference under comparable recorded conditions. Historical retests bind to their own run. Combat randomness and small samples remain explicit.
- **Uncertain:** whether pre-aimed contact means all angles were cleared, whether near-cover time means protection, whether an unused utility deterred the opponent, whether a player intended a choice, and whether coaching caused a change.

A 1v1 can have at most one clear enemy line. The legacy multiple-enemy metric remains zero and is not a solo strength claim. The comparison uses actual exposed time and labels pre-aimed openings as an orientation proxy. Aim-height sampling is limited to visible targets near the aim window, not all crosshair positions across a match.

## Before/after results

No valid human v3 baseline/retest pair or human fixed/adaptive result was collected during this audit. The synthetic cycle tests improvement arithmetic and pathway decisions, not player learning. The timing replay measures weapon scheduling, not coaching benefit. Existing browser history is preserved and not replaced with test fixtures.

## Test commands and results

The final captured Node regression log accompanies this delivery. Final result: **92 tests passed, 0 failed**, including 18 ability-matrix checks and 11 new QA checks (9.00 seconds reported by the test runner). Original audit start: 63/63 passed. Archived engine command: passed all three original assessment layouts, policy-adaptation branches and replay finding. Syntax checks passed for changed/new JavaScript files.

```powershell
node --experimental-loader ./tests/three-loader.mjs --test ./tests/*.test.mjs
node tests/check.cjs
node --experimental-loader ./tests/three-loader.mjs tests/profile-world.mjs
node --experimental-loader ./tests/three-loader.mjs tests/profile-simulation.mjs
```

No analysis key is needed for the regression suite. The endpoint tests use a local HTTP server and mocked provider. Experimental loader warnings are from Node and are not game failures.

## Files changed in this audit

- `dist/benchmark.js`, `coach-model.js`, `coaching-report.js`: assessment pairing/protocol, malformed session fallback and teaching/measurement explanations.
- `dist/coach-dashboard.js`, `evaluation.js`: graphics preferences, controlled comparison and reporting.
- `dist/review-model.js`, `gameplay-review.js`: profile-scoped review/report CRUD, quality propagation and practice/measurement text.
- `dist/tactical-match/src/core/graphics.js`, `frame-stats.js`, `profiler.js`, `timing.js`: three presets, frame statistics, diagnostics/export and fire scheduling.
- `dist/tactical-match/src/main.js`, `gfx/sky/index.js`: preset application, full-frame draw accounting and coached roster guard.
- `dist/tactical-match/src/ai/bots.js`, `game/coach.js`, `game/rounds.js`, `game/abilities.js`, `weapons/weapons.js`: retained route evidence, changed tactic application, roster cleanup, controlled comparison setup, one-enemy smoke opportunity and timing.
- `dist/valo-range/js/game.js`: active profile key on new range session bridge.
- `tests/ability-matrix.test.mjs`, `qa-audit.test.mjs`, `profile-simulation.mjs`, `review.test.mjs`: lifecycle matrix, QA/regressions, timing replay and provider/storage checks.
- `README.md`, `QA_REPORT.md`, `PERFORMANCE_REPORT.md`, `DEMO_GUIDE.md`: corrected usage, evidence and rehearsal instructions.

## Remaining release blockers / limitations

1. Complete the native Chrome/Edge gameplay, ability-visual and UI pass on the target laptop. Browser control was blocked; this audit does not mark those checks passed.
2. Collect fresh rendered-game frame distributions and a long-run allocation/geometry check. OS GPU names are not hardware-acceleration verification.
3. Record a genuine v3 baseline/retest and enough fixed/adaptive rounds if the presentation will cite player improvements. No causal effectiveness claim is currently supported.
4. Rehearse the exact three-minute guide before saying the live demo is stable. If genuine evidence is absent, use the guide's honest fallback.
5. Live YouTube embedding, codec previews and model quality need network/browser checks. The core demonstration can remain offline with no provider key.

The existing game, licenses, assets, agent selection and ability systems are preserved. The review remains a draft until the outstanding live checks are complete.
