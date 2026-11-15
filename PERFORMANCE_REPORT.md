# ClutchIQ performance audit

Audit date: November 15, 2026. Starting revision: 4ff104b.

## Measurement status

The OS diagnostic reports an Intel Core i9-14900HX, NVIDIA GeForce RTX 4060 Laptop GPU, and Intel UHD Graphics. The 2560 x 1600 display is user-reported. This does not establish which GPU the browser is using.

**No new rendered-game benchmark was captured in this audit.** Desktop Edge accessibility failed, and Computer Use then stopped because it could not confidently determine the browser URL. No further browser input or substitute browser automation was attempted. Browser acceleration, native pointer lock, new-preset visual quality, draw counts, shadows in motion, actual average frame time, 1% low FPS, and long-run memory behavior remain unverified on this revision.

The prior Phase 2 browser smoke test recorded 60.0 FPS and a 17.6 ms p95 frame interval during a short Harbor cover-practice window. That is a historical result for 4ff104b in the in-app browser, not a new 2560 x 1600 desktop benchmark or a sustained-60-FPS guarantee. No historical 1% low is available.

## CPU measurements actually run during this audit

`node --experimental-loader ./tests/three-loader.mjs tests/profile-world.mjs`

The script constructs Harbor using the real world code and runs nine warmed batches per measurement. Its original-ray function is the pre-Phase-2 implementation, not a second rendering build.

| Workload | Measured median batch time |
| --- | ---: |
| 390 visibility rays, original full mesh traversal | 2.7853 ms |
| 390 visibility rays, existing bounds-filtered implementation | 1.9029 ms |
| 1,600 path queries | 0.9286 ms |
| 800 capsule movement/collision calls | 0.5180 ms |

The bounds-filtered ray workload took about 32% less CPU time in this run. It was already implemented before this audit. These batches do not measure GPU execution, whole-game frame rate, or human input latency. No new rendering optimization was justified by these measurements.

## Confirmed firing-timing defect and replay

The previous player scheduler reset each shot deadline to `now + interval`, discarding the fractional remainder every frame. The corrected scheduler advances the previous deadline while firing continuously and resets it after an interruption. It does not accumulate a catch-up burst after a released trigger. Bot cooldowns also retain their elapsed remainder.

`node --experimental-loader ./tests/three-loader.mjs tests/profile-simulation.mjs`

This is a synthetic ten-second, unlimited-ammunition timing replay through the actual rifle trigger method. It is not player performance or a rendered-game benchmark.

| Render FPS supplied to simulation | Previous scheduler: shots | Corrected scheduler: shots |
| --- | ---: | ---: |
| 20 | 96 | 100 |
| 30 | 96 | 100 |
| 50 | 93 | 100 |
| 60 | 96 | 100 |
| 75 | 94 | 100 |
| 120 | 96 | 100 |
| 144 | 96 | 100 |
| 165 | 98 | 100 |

Bounded collision/simulation steps still consume elapsed play time at up to 1/60 s per step. Catch-up after a long suspended tab remains capped at 250 ms. Tests cover movement/cooldown elapsed-time integration, actual controller movement/look/crouch/jump, firing cadence and interruption recovery. They do not replace a native mouse-feel test. Assessment protocol v3 prevents mixing pre-change measurements with the corrected firing policy.

## Graphics presets

The settings page and training/video-review launch paths now preserve Low, Medium and High. Existing Low preferences migrate through the old flag. Changing the preset applies on the next game launch; it does not reset progress.

| Setting | Low | Medium | High |
| --- | --- | --- | --- |
| Pixel ratio cap | 1.0 with 0.75 render scale | 1.25 | 2.0 |
| Shadow map | 1024 squared | 2048 squared | 3072 squared |
| Sky environment width | 512 | 1024 | 2048 |
| Procedural texture scale | 0.5 | 0.75 | 1.0 |
| HDR post processing | off | on, FXAA | on, automatic AA |
| Screen-space ambient occlusion | off | off | on |

Quality changes leave map collision/navigation and gameplay timing intact. Preset selection, URL propagation and configuration are automated-tested; visual rendering and performance of the three new tiers await browser verification.

## Profiling and memory instrumentation

Append `&profile=1` to a tactical-match URL. The opt-in overlay retains at most 1,800 frames and exposes Reset capture and Export profile controls. It reports average FPS/frame time, p95/p99/max intervals, counts over 33.333 and 50 ms, CPU system times, draw calls, triangles, geometry/textures and JS heap when the browser exposes it. Draw statistics accumulate across rendering passes and sky updates. Render timing is CPU submission, not GPU execution. CPU sub-system timings overlap nested ray/collision calls and must not be summed as independent costs.

1% low FPS is defined as 1000 divided by the mean duration of the slowest ceil(N * 0.01) measured frames. Unit tests verify this calculation on known frame intervals. Export is bounded and local. Reset clears the stale summary as well as samples.

Ability matrix tests verify that effect scene objects, smoke volumes and barrier colliders disappear after expiration/round reset. Roster rebuilding now disposes owned rig materials and releases mixer bindings before dropping actors. Static/shared asset templates are retained deliberately. These are specific cleanup checks, not proof of no long-duration CPU/GPU memory leaks. A full allocation trace was not captured.

## Reproduce the missing hardware benchmark

1. Run `node serve.cjs`; open the game in desktop Edge or Chrome on the laptop.
2. Inspect `edge://gpu` or `chrome://gpu` and record the active renderer and Graphics Feature Status. Do not infer acceleration from the mere presence of the RTX card.
3. Use the intended 2560 x 1600 display mode and record browser zoom, CSS viewport, device pixel ratio and the selected preset. Keep other workload conditions consistent.
4. Launch `http://127.0.0.1:4174/tactical-match/?coach=practice&map=harbor&quality=medium&profile=1`. Allow assets/shaders to warm up. Start the match, enter live play, release the pointer briefly to press Reset capture, then resume.
5. Capture at least 30 seconds each of movement, sustained engagement and overlapping utility. Export the profile before changing condition. Repeat for low/high with the same route and camera behavior.
6. Record average, 1% low, p95/p99/max, spikes, draw/triangle counts and heap before/after repeated rounds. Distinguish loading/menu/freeze periods from live gameplay. The rolling buffer covers 30 seconds at 60 FPS, less at higher FPS.
7. For leak checks, warm up, record geometry/textures and heap, replay ten rounds with utility, and compare after effects expire. A high-water heap sample alone is not a leak. Use browser allocation/GPU tools when a sustained increase is reproduced.
8. Run the three-minute rehearsal. Sign off stable 60 FPS only after the actual target-hardware capture and native-input playtest pass.
