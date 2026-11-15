# VALORANT gameplay and spectator detection

## Use the scanner

Open **Gameplay Analysis → Upload File**, save your local Riot identity, and select your own continuous VALORANT recording. **Scan gameplay states** uses the Windows English OCR engine on the local machine. Playback and the state timeline work without AI credentials. A configured provider and separate consent enable coaching on supported gameplay.

The timeline uses green for player gameplay, orange for death and spectating, blue for buy phase, purple for round end and gray for Unknown. Expand a state interval for its evidence and jump to the relevant timestamp. Manual corrections are optional. Unknown intervals are skipped automatically.

## Detection

The browser seeks within the selected file through a blob URL and crops proportional HUD regions into one bounded image. The local Node server passes that image to a persistent Windows OCR worker. The browser checks the geometry and color of ability bars, active ability icons and candidate scoreboard rows. The worker reads HUD text. Player names are read from the spectator overlay when available and kept separate from the profile identity. A second consistent name read confirms a spectator switch. Neither a kill-feed name nor a plain weapon view establishes viewpoint.

- The right-side combat report requires both **COMBAT REPORT** and a killing-blow cue such as **KILLED BY** or **KILLED YOU**. A visible active HUD, scoreboard, early buy-phase timing and the current round help screen out stale reports. Detected death blocks self-attribution until supported next-round evidence.
- The left-side **SWITCH PLAYER** prompt identifies spectating even when its player name is unreadable. A different readable name identifies the observed camera, including when a result banner is also present.
- Centered **BUY PHASE** marks preparation. Readable round numbers help distinguish rounds. The purchase prompt anchors the local viewpoint within the round. Nearby active-HUD samples are required before crediting gameplay.
- Centered **WON** or **LOST** records an outcome. Supporting labels such as **TEAM ELIMINATED** and **SPIKE DEFUSED** are read when OCR supports them. Camera, round outcome and the local player's life evidence are recorded independently.
- A readable top-center timer and continuity checks help flag discontinuities. A cut or implausible timer jump can invalidate local viewpoint evidence.

The reducer carries state through each window. Common paths are `UNKNOWN → BUY_PHASE → USER_PLAYING`, `USER_PLAYING → USER_DEAD → SPECTATING → ROUND_ENDED`, and `USER_PLAYING → ROUND_ENDED → BUY_PHASE`. Persistent report text triggers at most one death per tracked round. Each detected event records the first sample that supported it. The previous sample is shown for context. If a buy phase establishes a new round after a missed result, the preceding round closure is marked inferred. Original video timestamps are retained. Interval boundaries describe sampled support and can differ from the exact time of a game event.

The default 90-second window is sampled about every three seconds. The scanner revisits up to three suspected transition gaps, taking two additional crops per gap. It processes one bounded crop at a time. Pause waits for the current window. Stop cancels outstanding browser work. Resume within the same review reuses observations and completed work. Reports save timestamps, states, provenance and findings locally. No images are retained in reports.

A local coaching request must contain four samples fully inside an eligible gameplay interval. The scanner checks those individual samples again, vetoes any detected spectator, death, buy, result or scoreboard cues, and requires two positive active-HUD readings. The existing provider request caps and opt-in remain in place. The provider-only fallback retains the earlier perspective-verification workflow on unsupported platforms.

## Real-image verification

The four reference images were matched by filename because the attachment order differs from the order in the written examples.

| Source screenshot | Expected and observed |
| --- | --- |
| `095135` | Player death with combat report |
| `095056` | Buy phase and local purchase prompt |
| `095303` | Loss and team elimination with combat report, while spectating BigChase |
| `095234` | Victory with combat report, while spectating NolimitGabe. The outcome was detected even though OCR missed the defuse caption. |

The validation tools take local paths. The four images and the recording remain outside Git. The labeled fixtures cover source HUD layouts from the references and a 1080p H.264 recording on Sunset, including multiple viewpoints, agents, weapons, captions and overlay states. The build uses Windows OCR and deterministic visual and temporal checks. No custom classifier was trained. The corpus does not support a general accuracy claim across maps, languages, HUD scales or other capture setups.

### Results on this machine

| Check | Measured result |
| --- | --- |
| Repository tests | 143 passed. The legacy assessment and adaptation smoke check also passed. |
| Real HUD cues | All 4 screenshots and 16 labeled frames matched their specified cue labels. This checks visible cues in selected images. |
| Actual timeline checkpoints | 14 of 25 states matched human review. All 11 mismatches abstained as Unknown. |
| Personal attribution | 2 of 9 labeled active-play checkpoints were credited. None of the 16 other checkpoints received personal attribution. |
| Full browser scan | Edge scanned a 4.19 GB, 34:39.827 H.264 recording in 24 windows. Pause and resume completed successfully. No provider requests were made. |
| Throughput | Measured full runs took 2:32 and 3:52 on this device. The last run submitted 842 bounded HUD crops totaling 638 MB over localhost. A separate native OCR check averaged about 78 ms per labeled image, including startup. |
| Memory | Edge reported approximately 5 MB peak sampled JavaScript heap in the last run. The measurement excludes native decoder, canvas, GPU and OCR worker allocations. |
| State coverage | About 4:59 of active user play, 4:27 spectating, 0:14 dead, 1:58 in buy phase, 3:52 in round end and 19:10 Unknown. |

The timeline missed active-play checkpoints from 2:30 to 2:34 and at 4:00, 4:20, 4:40 and 5:00. It also abstained at one labeled death checkpoint, one spectator checkpoint, and two buy-phase checkpoints. There were no wrong confident classifications among the 25 checkpoints. This sample cannot estimate the false-positive rate across all frames. Tracking active gameplay remains the main accuracy gap.

The first full scan counted 32 round starts and 27 deaths. Reviewing its event timestamps exposed old reports visible during the next buy phase. After the round and death guards changed, the detector emitted 19 round starts and 13 deaths. These are detector counts. The full recording's events were not exhaustively annotated.

## Limits

The selected profile labels the owner's continuous recording. The app does not authenticate the identity of the person recording, and a video edited to join multiple players' perspectives can defeat continuity checks. Clips starting mid-round may remain Unknown until the first supported local buy and active HUD. Cropping, a hidden HUD, very fast overlays, OCR errors, and spending all utility can reduce coverage. Short events can fall between samples. Score-only transitions, localized captions, revives, special modes, and robust replay-cut detection are not validated. A result banner alone never establishes survival. Full provider coaching quality was not measured with live credentials.

## Files

- Local scanner and layout in `dist/valorant-hud.js`, `hud-ocr.cjs`, and `hud-ocr.ps1`
- Temporal and coaching integration in `dist/valorant-temporal.js`, `dist/identity-pipeline.js`, `dist/player-identity.js`, and `dist/gameplay-review.js`
- Dashboard and local server in `dist/identity-review-ui.js`, `dist/coach.css`, `serve.cjs`, and `README.md`
- Tests in `tests/valorant-temporal.test.mjs`, `tests/identity-ui.test.mjs`, `tests/review-dom-fixture.mjs`, `tests/large-video-browser.mjs`, `tests/valorant-hud-reference.mjs`, and `tests/valorant-scan-browser.mjs`

Run `node --experimental-loader ./tests/three-loader.mjs --test ./tests/*.test.mjs` for the repository suite. Run `node tests/valorant-hud-reference.mjs <screenshots-folder> [frames-folder] [browser-report.json]` for the real-image check. It expects the original screenshot filenames and the manually labeled `frame-<second>.png` files extracted from the local recording. Run `node tests/valorant-scan-browser.mjs <local-recording> <localhost-app-url> <isolated-Edge-debug-port>` for the full browser check. Set `CLUTCHUP_HUD_REPORT` to a writable path to export the browser test report for checkpoint scoring.
