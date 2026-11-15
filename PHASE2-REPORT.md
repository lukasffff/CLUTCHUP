# CLUTCHUP Phase 2 implementation and verification

Repository: lukasffff/CLUTCHUP. Base commit: 2475a0210e1722127acbf8e78bfdbbc12f2ca6c0.
Tested locally on Windows, November 14, 2026 (America/New_York).

## Changes and fixes

- Recurring weakness selection now needs measurements above the coaching threshold in at least two independent trials/attempts. Small samples and observations from other profiles do not supply votes.
- Standard training requires two comparable successes before challenge. A successful challenge now offers the original three-trial reassessment rather than skipping directly to another lesson. The field Continue link supplies the selected lesson and assistance settings.
- Crosshair measurements now sample visible contacts at 5 Hz instead of only at shots, and include aim above head height. Protocol v2 prevents comparisons against the older sampling/bot policy. Existing history remains saved; take a fresh v2 baseline.
- Profiles no longer share dashboard history or comparable training attempts. The original shared store and storage-error handling remain.
- Added measured near-cover time, exposed time, contact openings and sightline resets within three seconds of damage. Reports explicitly distinguish these proxies from intent or proof of protection.
- Reports explain recorded strengths, observed mistakes, why they matter, corrections, opponent adaptations and comparable changes. Ratios retain sample counts; no claim of improvement is made without comparable data.
- Cover practice uses observable sightline breaks in the actual 1v1. Repeated assessment openings without resets or prolonged stationary exposures can select it; the multi-enemy metric remains available for older/multi-opponent data.
- Bot turns and strafing use the last observed position and observed target height between perception updates. An unseen player's live movement or crouch state is not used for that aim snapshot. Actual shots still validate visibility, smoke and barriers.
- Opponents can seek reachable cover after damage, for a reload, or after sustained visible contact, briefly hold, then slowly clear a nearby new angle toward the observed contact. New noise, damage, blindness, objective urgency or timeout interrupt the maneuver. Normal ability hazard avoidance still runs.
- Opponents can choose another authored approach after two recorded losses on the same route. Existing lane and repeated-peek adaptations remain and log their evidence.
- Empty bot weapons now reload even while holding cover. Burst pauses continue to expire. Body movement/animation still reflects actual displacement after collision.
- Six authored teaching sequences replace the shared corner demo: head height, stop-then-shoot, successive angle clearing, cover/repositioning, utility timing and basic objective decisions. Each uses the real bot, map navigation, collision, camera, head-height markers and aim lines. Utility uses an appropriate smoke/recon/slow from the selected agent. Practice, measured feedback and reassessment use the existing live game.
- Hid the pointer-release/buy overlays and ability panel during demonstrations; restored normal HUD for practice. Existing agent selection, controls, hit/damage feedback and abilities are preserved.
- Added bounds rejection before mesh triangle raycasts, preserving original hit mesh, distance and surfaces, including dynamic stationary barriers.
- Added bounded simulation substeps (at most 1/60 s), wall-time FPS measurement and an opt-in CPU/memory diagnostic overlay. Long suspend gaps cap catch-up at 250 ms. Movement, cooldowns and round timers consume elapsed simulation time rather than a clipped single render delta.

## Performance measurements

The default high-quality Harbor game already ran close to 60 FPS in this environment. No severe rendering slowdown was reproduced, so graphics were not reduced automatically.

| Measurement | Original | Updated | Interpretation |
| --- | ---: | ---: | --- |
| 390 Harbor visibility rays, initial separate runs, median of 9 batches | 6.254 ms | 2.164 ms | Sensitive to warm-up/process load; not an FPS comparison |
| 390 rays, original and updated implementation in the same warmed benchmark | 3.279 ms | 2.110 ms | About 36% less CPU time; repeatable comparison script included |
| 800 collision moves, same warmed benchmark | unchanged code | 0.602 ms | Not a confirmed bottleneck |
| 1,600 path requests, same warmed benchmark | unchanged code | 1.047 ms | Not a confirmed bottleneck |
| Browser short sample | 59.8 FPS, p95 17.6 ms | 60.0 FPS, p95 17.6 ms | Different round/lesson windows; demonstrates smooth local play, not a causal FPS gain |

Original browser sample: render submission 4.244 ms, bots 0.138 ms, player 0.047 ms, coach 0.011 ms, raycasts 0.048 ms/frame; it spans live and freeze frames. Updated live cover practice sample: render 4.525 ms, bots 0.095 ms, player 0.058 ms, coach 0.011 ms, rays 0.013 ms, collision 0.022 ms/frame, 0.3 rays/frame, 92 geometries, JS heap 91.3 MB. Different bot actions make individual system timings non-comparable. Demo snapshot heap was 126.8 MB and later live heap 91.3 MB; garbage collection varies. This is bounded object/heap monitoring, not a complete allocation trace or proof of no leaks. Render timings are CPU submission time, not GPU time. Other hardware, maps, resolutions and frame caps need testing.

## Tests and observed results

Before changes: all 55 existing tests passed with localhost access. The sandbox initially blocked the local HTTP endpoint test; rerunning with local access resolved that environmental failure.

Updated checks cover:

- Existing map/nav/collision traversal, bot recovery, combat hitboxes, abilities/remapping, barrier routing, recon, assessment persistence, reports and video-review endpoint checks.
- Full mesh versus filtered ray equivalence for every Harbor waypoint pair, ignored/added/removed barriers and a map switch.
- Every teaching sequence traverses actual Harbor collision, reaches all four staged positions, moves more than five metres, and restores actor pose and temporary scene objects. Utility effects are triggered in the relevant sequences.
- Synthetic input-driven learning cycle through the actual TacticalCoach shot recorder and persistence: three-trial baseline, repeated measured moving-fire weakness, explanation, failed practice, support, standard successes, adaptation to challenge, challenge success, matched reassessment, measured improvement and next lesson. Demonstration execution is verified separately against real map collision.
- Elapsed movement/cooldown integration at 10/20/30/60/144 FPS and bounded recovery from a suspend gap.
- Cover maneuver memory/interruptions and exclusion from standardized assessments, burst pause recovery, reload while holding, and route change after repeated losses.
- Browser smoke check: baseline 1v1 starts, bot damages/eliminates the stationary player and rounds save/advance; the 24-second cover demo runs unobstructed and transitions to live practice. Agent selection and charges appear correctly. The running game produced no application errors in the inspected console; the in-app browser warned that pointer lock was rejected.

Final regression result: 63 tests passed, 0 failed (7.48 seconds reported by the Node test runner). Run:

```powershell
node --experimental-loader ./tests/three-loader.mjs --test ./tests/*.test.mjs
node --experimental-loader ./tests/three-loader.mjs tests/profile-world.mjs
```

## Files modified or added

- `dist/coach-model.js`, `dist/benchmark.js`, `dist/coaching-report.js`: recurring evidence, progression, v2 assessment aggregation and evidence-based feedback.
- `dist/coach-dashboard.js`, `dist/player-habits.js`: profile isolation, report display, Academy cover entry and route-loss adaptation.
- `dist/tactical-match/src/game/coach.js`, `game/demonstration.js`: live telemetry, cover maneuvers, continuation links and lesson-specific demonstrations.
- `dist/tactical-match/src/ai/bots.js`: observed aim snapshots, reloading, shot visibility scheduling and maneuver integration.
- `dist/tactical-match/src/world/map.js`: ray bounds filtering.
- `dist/tactical-match/src/main.js`, `core/timing.js`, `core/profiler.js`: simulation timing and diagnostics.
- `tests/phase2.test.mjs`, `tests/profile-world.mjs`, `tests/world-fixture.mjs`, and updated bot-navigation, coach-model, player-habits and review tests.
- `README.md`, this report: launch, validation and limits.

## How to test the updated game

1. Download/check out the Phase 2 branch or extract the provided runnable ZIP. Keep the bundled `dist` assets together.
2. Double-click `Start CLUTCHUP.cmd`, or run `node serve.cjs` in the extracted repository. Open http://127.0.0.1:4174 in desktop Chrome or Edge. No dependency installation or build step is required.
3. Use a fresh browser profile/local profile label for a clean experiment; existing results are preserved. Go to AI Assessment and Run baseline. Finish all three trials. Aim/shoot/move normally; do not leave the player idle if you want actionable coaching evidence.
4. Follow Continue for the selected lesson. Watch the bot, then practice. End-of-round feedback offers the next attempt with support/challenge selected automatically. You can review raw measurements in Progress.
5. After two standard successes and a challenge success, Continue launches the comparable three-trial reassessment. Finish all three. Progress shows before/after counts and the next recommendation.
6. To test a specific teaching sequence, open Personalized Training and pick an Academy lesson. To inspect performance, append `&profile=1` to the game URL.

## Known limitations and remaining verification

- The complete human-controlled baseline-to-reassessment playthrough has NOT been manually completed. The in-app test browser rejects pointer lock; aiming/moving as a human needs desktop Chrome/Edge. The cycle is automated with synthetic measured shots, while separate browser checks verify live rounds and the teaching transition. Automated success is not evidence of human learning.
- The bot remains a rule-based waypoint opponent. Cover/repeek maneuvers require an observed contact and a suitable reachable nearby waypoint; this is not a general corner-planning or professional tactical FPS AI. Routes still use the authored graph.
- Teaching is authored bot movement and visible aim/utility, not autonomous explanation of arbitrary gameplay. It does not teach every agent ability/ultimate combination or prove a successful objective plant in the demonstration.
- Decision quality is represented by recorded choices (moving fire, exposure, utility effects and resets), not a validated model of intent, teamwork or full angle coverage. A marker/aim line and sequence does not prove the player cleared all angles.
- Longer human gameplay, weapon feel, multiple hardware/resolution tiers, sustained memory behavior and exhaustive agent ability interactions still require playtesting. No universal stable-60-FPS claim is made.
- Assessments have matched starts/equipment/policy but retain combat randomness. Samples and threshold rules are useful practice signals, not statistical proof. Older v1 baselines are deliberately not paired with v2 reassessments.
