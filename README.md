# CLUTCHUP Local

CLUTCHUP is an offline first-person tactical coach. It runs on your Windows device and stores results in the browser profile you use to play.

## Start playing

Double-click **Start CLUTCHUP.cmd**. Alternatively, from this folder run `node serve.cjs` and open [CLUTCHUP](http://127.0.0.1:4174/#home) in desktop Chrome or Edge. Keep the server window open. No installation, build step, or API key is needed if Node is already installed. Use the same browser and address to keep access to your saved results.

1. Select **Start assessment**, then **Play vs Bots**. Click the game if it needs to recapture the mouse. Escape releases it; the round continues.
2. Defend either site on Harbor. Use **WASD** to move, **Shift** to walk, **Ctrl** to crouch, **Space** to jump, left mouse to shoot, **R** to reload, **1–4** to switch equipment, and **B** to buy in the buy zone. **F** interacts with the objective. **V** switches to the last weapon.
3. At the end of a round, choose **Continue** to see the next recommendation. You can keep playing the match; the first completed round of each launch counts for the automatic training pathway.
4. In the attacker exercise, carry the device to the marked area of either site, stop, and hold **F** to plant. In defense, hold **F** beside the planted device to defuse. Both sides can also win by elimination where the round rules allow it.
5. In **Progress**, expand the round to see measurements and opponent decisions, or export JSON. **Personalized Training** also includes lesson-specific Beginner Academy exercises.

Choose **Low**, **Medium**, or **High** Harbor graphics in Settings; the preset applies on the next launch. Medium is the rehearsal starting point, pending target-hardware verification. Settings in the game include controls and sensitivity. The optional Riot ID is a local profile label. No Riot account or history is connected.

## What runs

- **Harbor** is the first full coaching map, reused from the bundled Tiny Strike game. Both spawns, A and B, a central customs hall, side lanes, rotation links, ramps, collision and the live minimap are in the same scene. This is an original tactical layout with a two-site structure. Open Custom Practice to play either side. The CLUTCHUP dashboard launches Harbor with one player against one opponent. Existing archive pages can still be opened directly.
- **Opponents** use the existing Tiny Strike waypoint graph, route and objective logic, limited vision, smoke occlusion, sound and contact memory. They hold, patrol, investigate, engage, strafe, attack and defend objectives. In the coaching mode a wounded opponent can take a reachable covered waypoint when one is available. Core AI remains rules-based.
- **The coach** measures firearm hits and hit zones, shot timing against movement, crosshair height when an enemy is within the aim sampling window, damage, kills, time in multiple clear sightlines, utility throws and local objective actions. There is no sample before a relevant event happens. Sightlines indicate geometry and smoke clearance within 45 m, not whether an enemy was aiming at you. Aim height is sampled at 5 Hz during visible contacts near the aim window; it is a proxy, not full-match crosshair tracking.
- **The training path** uses repeated measured evidence to select a lesson. Failures receive support, two comparable standard successes unlock challenge, and challenge success offers the original three-trial reassessment. Comparisons are descriptive and retain raw sample counts; combat randomness and sample size matter.
- **Agent utility** is available in Harbor alongside buyable grenades. Choose Kestrel (Duelist), Morrow (Controller), Relay (Initiator), or Bastion (Sentinel) before pressing Play vs Bots. Cast with **C**, **Q**, **E**, and **X**. Rebind all four slots under the in-game Settings. Aim at a reachable surface for placement. Look away or take cover from a flash. Dash while grounded. Smoke blocks sight for as long as its orb is visible. The HUD shows charges, cooldown, and active effects. Standard charges refill each round. Each ultimate has one charge for the match.
- **Bots and coaching** respond to utility through vision checks, flashes, recon sightings, sightline protection, and route changes. Teams share recent recon snapshots and space out objective casts. In **Personalized Training**, use the utility exercise to practice timing a cast for your own approach or your crossing. Round reports timestamp casts and show measured contacts, cover, disruption, and dash exposure changes. Failed placements consume no charge. A cast without recorded contact may still have deterred an opponent.
- **Gameplay Analysis** accepts local uploads and YouTube watch, short, Shorts, and live links. YouTube playback uses the official embedded player. Select a section up to 90 seconds, save an observation at a timestamp, and start the assigned Harbor 1v1. Saved URLs, sections, and manual notes stay in browser storage and are included in the progress export. YouTube video frames are never read by CLUTCHUP.
- **Local uploads** accept full MP4/WebM/browser-decodable MOV recordings, including multi-gigabyte files. There is no application-level 100 MB or 15-minute cap. The browser reads a local file URL; the entire recording is not loaded into JavaScript or sent to the server. The whole duration is selected by default. Overview previews work without a key; optional AI analysis samples successive parts across the selected range after consent.
- **Custom Practice** preserves VALOTRAINER and the original workspace. New range sessions share the progress store; aim drills are reported separately because their scores are not comparable to an objective round. The Ascent B, Corrode B, Summit B and Ascent STL reference views require optional local assets; these files are not distributed in this repository. The original North Terminal and legacy results remain available in the original workspace.

The research-kit GLB/OBJ is an approximate B-site blockout. The STL is a relief with no game collision or navigation data. The Corrode and Summit Blender assets provided usable geometry for the previously cropped B-site studies; these exports do not validate a complete map. The research catalog's unverified numeric fields were not used as gameplay calibration.

## Review YouTube gameplay

1. Open **Gameplay Analysis → YouTube Link**. Paste a `youtube.com/watch?v=…`, `youtu.be/…`, `youtube.com/shorts/…`, or `youtube.com/live/…` link. Supported timestamp links cue playback near that time. Live streams need a usable timeline to select a section.
2. Enter start and end in seconds or in `m:ss`. Use the current playback position, seek, restart, or replay the selected section. A section can be up to 90 seconds.
3. Save an observation inside the section. Edit or delete it from its card. A supported aim, movement, peeking, positioning or utility observation offers a corresponding Harbor 1v1. Game sense, economy, and teamwork notes remain available for manual review.
4. Use **Clear video** to close the player. Use **Delete review** to remove a saved link, section and its notes. The original creator stays attributed by the embedded player and by title or channel when the player supplies that information.

YouTube reports only manual observations. Browser restrictions, private or removed videos, and creator embed restrictions can prevent playback. Use **Open on YouTube** when playback there is available.

## Review an authorized upload

Choose the full recording in Gameplay Analysis -> Upload File. The selected range defaults to the complete video; **Use full video** restores it after editing. File support depends on browser codec support and practical decoding/storage limits rather than an application size or duration cap. The default maximum file size is 0 (no application-imposed cap). If you configured a lower cap, set it back to 0 under **Video resource settings**. A 4.19 GB (3.90 GiB), 34-minute VALORANT H.264 MP4 was selected and sampled through the end in desktop Edge with a simulated analysis provider. Your browser still needs to support the recording’s codec.

Before analysis, save your Riot name, tagline and confirmed in-game display name under the active local profile. For your own continuous VALORANT recording on Windows, choose **Scan gameplay states** to run local English HUD recognition. The scan needs no analysis key and keeps cropped HUD images on localhost. It establishes the local player from the buy prompt and nearby player HUD cues, tracks spectator names separately, and holds death until a supported new round. Strongly supported gameplay is green. Dead and spectating are orange, buy phase is blue, round ended is purple and unclear intervals are gray. For AI coaching, configure the analysis provider and opt in before choosing **Analyze full video**. Only supported gameplay is sent for coaching. Use a manual correction when playback resolves a genuine ambiguity.

The processing window defaults to 90 seconds and can be set to 30 or 60 seconds in Video resource settings. Local HUD cues are sampled about every three seconds, with up to six supplemental reads near suspected transitions in each window. With explicit consent, up to 16 sampled JPEGs per window are eligible for coaching after passing the identity gate and local HUD checks. Systems without local HUD scanning can still use the provider-only perspective review, which can request up to eight additional transition frames per window. Visible names may appear in sent images. Your entered identity and file metadata remain local. Provider charges may apply. See [Spectator detection report](SPECTATOR_DETECTION_REPORT.md) for validation and sampling limits.

The gameplay timeline shows state, supporting evidence, readable spectator name and the first sample that detected each event. Unverified gaps remain Unknown. Expand an interval, jump to playback and edit the exact correction boundaries. Manual labels save separately from automatic evidence. Run analysis again after confirming your own play to generate newly eligible findings. Re-selecting the same file metadata and range restores saved corrections; completed windows within the current review reuse cached metadata until a relevant change.

Progress shows completed parts. **Pause after this part** finishes the current part, and **Stop analysis** cancels in-progress work. To continue from completed parts, use **Resume analysis** in the same tab with the same file, time range, identity and resource settings. Errors or cancellation preserve a clearly labeled partial report. Completed and partial reports save automatically when browser storage is available, and Export report JSON provides a local copy without video or frames. History stays under the active profile and selected player identity; recurring weaknesses require supported evidence across at least two recording identities. Counts are evidence summaries, not performance scores or claims of improvement. Delete individual reports or the active profile's identity history with the corresponding controls. Maximum selected file size and sampled-image resolution are configurable. The YouTube workflow remains manual and does not read YouTube frames.

See [PLAYER_IDENTITY_REPORT.md](PLAYER_IDENTITY_REPORT.md) for architecture, synthetic fixture metrics, limitations and the 23-minute recording walkthrough. Actual VALORANT HUD-recognition accuracy and browser decoding/memory use remain unverified.

## Solo coaching workflow

Run **AI Assessment → Run baseline** before practice. The coach uses observations from all three completed trials to select a lesson. **Run repeat assessment** uses the same three starts, single opponent, fixed pistols and reaction delay, with buying and utility disabled. The opponent's normal combat randomness and your choices can still vary. Progress compares your profile's complete baseline and retest and includes raw sample counts.

In training, the first round starts with a 24-second lesson-specific guided bot demonstration. The bot follows collision-validated Harbor waypoints for the selected lesson, aims at head-height markers, clears successive entrances, and demonstrates a cover reset or utility timing. The utility lesson uses smoke, recon, or slow from the selected agent kit. Temporary teaching objects are removed and the opponent is restored before live practice. The challenge stage drops the visual aid.

Completed 1v1 rounds record movement modes, continuous distance, committed approach lanes, player-opened peeks and prolonged stationary exposure. Progress shows your recent observations. History is stored on this device and associated with the active local profile label. When at least three rounds in the same side and lesson establish a preferred lane, the opponent can select a different approach or defender patrol. With sufficient same-angle peek evidence, a defender may take a reachable position to watch that area. Exposure history can move a patrol toward site cover. The round report logs the applied choice, its evidence and, for initial plans, the previous assignment. The opponent uses these past observations to select from authored tactics and still uses ordinary sight and sound for live combat.

The coached duel keeps the selected agent and uses a lesson-specific Harbor approach. After a miss it can grant a longer bot reaction delay. After two target-meeting rounds under the same setup it can increase challenge and turn off the aim guide. Progress compares comparable rounds and records adaptations. Bot decisions still vary. Start **AI Assessment** to train without a video, an API key, or a Riot account.

To repeat the large-file browser check, start CLUTCHUP locally and launch a dedicated Edge instance with a fresh profile and remote debugging on port 9341. Run `node tests/large-video-browser.mjs "path-to-your-local-fixture.mp4" http://127.0.0.1:4174 9341` with an MP4 over 4 GB and 15 minutes. The check uses real browser decoding and a simulated provider. It keeps the recording and all sampled frames on the test machine.

## Optional analysis provider

Set `CLUTCHUP_ANALYSIS_API_KEY` in the environment used to start `node serve.cjs` and restart the server. `CLUTCHUP_ANALYSIS_MODEL` optionally overrides the default vision model. CLUTCHUP uses OpenAI's Responses API and keeps the key on the server. Do not place the key in browser settings or source files. Authorized image analysis may incur API charges. The provider sees only sampled frames and timestamps, so findings are limited to what is visible in those frames.

## Source and checks

- `dist/gameplay-review.js`, `dist/review-model.js`, and `clip-analysis.cjs` implement video review, drill selection, and the optional analysis endpoint.
- `dist/index.html`, `coach.css`, `coach-dashboard.js`, `coach-model.js`: dashboard, lesson selection, session schema and clip sampler.
- `dist/player-habits.js`, `dist/benchmark.js`, and `dist/tactical-match/src/game/demonstration.js`: telemetry, authored tactic selection, standardized trial records, and the guided bot sequence.
- `dist/tactical-match/src/game/coach.js`: live measurements, lesson HUD, enemy withdrawal and session reporting. The existing engine supplies movement, player and bot collision, physics, objective states and combat.
- `dist/tactical-match/src/ai/bots.js`, `world/map.js`, `game/rounds.js`, `combat/combat.js`: connect the in-match system to bot and combat events, reject disconnected path requests, and enable local attacking.
- `dist/valo-range/js/game.js`: range results bridge and local patrols in the partial study scenes.

From this folder, run:

```powershell
node --experimental-loader ./tests/three-loader.mjs --test ./tests/*.test.mjs
```

The tests cover map structure, waypoint traversal with collision, bot navigation and recovery, combat hitboxes, ability keys and remapping, barrier detours, recon visibility and expiry, and coaching rules. The original game packages retain their licenses and asset credits: Tiny Strike (ISC) under `dist/tactical-match/` and VALOTRAINER (MIT) under `dist/valo-range/`. The Harbor game assets and browser dependencies are bundled. The local server requires Node.js.

## Limits

The opponent does not implement all thirteen behaviors as separate states. The habit model uses coarse lanes and peek cells. It does not estimate reaction timing, intent, full map clearing, clutch decision quality, or teamwork. Adaptation uses evidence thresholds and authored tactics. The Academy includes live peeking and utility lessons. Bot utility decisions cover objective smoke, flash, reconnaissance, and slows. Bots share recon contacts and a team casting interval. AI ultimates and planned multi-ability combinations are outside the current implementation. The report measures visible effects and supports practice on the same side and site. It cannot determine whether an empty area had been deliberately avoided because of utility. Continuous video and audio event recognition are outside this build. The vision workflow supports frame-backed aim, corner, cover, utility and limited movement observations with abstention when samples are ambiguous. Shot acquisition and recoil tracking, confirmed missed-shot patterns, route and rotation judgment, objective consequences, full economy, trading and clutch analysis lack validated visual detectors. Demonstrations are authored waypoint sequences, not an autonomous tactical teacher. Utility demonstrations cover selected smoke, recon and slow abilities; complete agent-specific combinations and fully deterministic combat remain open. Authorized Riot integration and additional complete coaching maps remain open. Browser site data can be cleared to remove saved sessions and profile settings.


## Phase 2 coaching and diagnostics

Weakness recommendations require threshold-crossing measurements in at least two independent assessment trials or attempts. Crosshair height is sampled during visible engagements, including high and low aim. The field report records near-cover time, exposed time, contact openings and sightline breaks after damage. These are observable proxies for decisions, not an estimate of player intent. Progress isolates each local profile and explains observations, consequences, corrections and comparable changes.

Follow the **Continue** link at the end of the evaluated round: guided practice, supported retry if needed, two comparable standard successes, challenge, then the original three-trial reassessment. The coach chooses the next lesson from reassessment evidence. You still press Play vs Bots and choose an agent for training; assessment agent and equipment are fixed. Continue playing while incomplete assessment trials advance automatically. Protocol v3 separates the current head-height measurements, firing timing and opponent policy from older baselines; record a fresh baseline after updating.

To profile, append `&profile=1` to a tactical-match URL. The overlay shows the latest 1,800 frames, wall-clock FPS, p95 frame duration, CPU render submission, bot/player/coach updates, visibility rays, collision, pathfinding, geometry count and JS heap where supported. It does not measure GPU execution time. Run the repeatable world microbenchmark with:

```powershell
node --experimental-loader ./tests/three-loader.mjs tests/profile-world.mjs
```

See [PHASE2-REPORT.md](PHASE2-REPORT.md) for changes, measured results, verification coverage and remaining limits.


## QA audit and hackathon rehearsal

The audit adds per-ability lifecycle coverage, fixes stale assessment pairing, profile-scopes video reviews/reports, preserves route adaptation evidence, and corrects frame-dependent continuous firing cadence. The primary experience remains one human and one opponent. New range results also use the active local label; historical unlabelled data belongs to Local.

**Start a fresh protocol v3 baseline after updating.** Older results remain in history but are not mixed into current assessment comparisons. The diagnostic overlay now includes average frame time, 1% lows, p95/p99/max intervals, spikes, draw/triangle counts and local JSON export. These are instrumentation, not a claim of target-hardware performance.

Progress includes a fixed/adaptive comparison with matched customs starts, controller, pistols and reaction settings. Alternate conditions and collect at least two real rounds each. Pre-aimed openings, aim-height samples, moving shots, exposure, objectives and repeated exposure are recorded. Empty states do not contain fabricated scores. The comparison is descriptive and cannot by itself prove coaching caused improvement.

- [QA_REPORT.md](QA_REPORT.md): verified fixes, test coverage and outstanding browser checks.
- [PERFORMANCE_REPORT.md](PERFORMANCE_REPORT.md): actual CPU/timing results, preset details and a laptop benchmark procedure.
- [DEMO_GUIDE.md](DEMO_GUIDE.md): preparation and the exact three-minute presentation sequence.

Native browser control was unavailable during this audit, so live input, all new UI visuals, a fresh 2560 x 1600 frame capture and the complete timed rehearsal remain required before stage sign-off. Live model quality was not verified; local mocked-provider tests cover authorization and failures. The core coaching demonstration works without a provider key by design.
