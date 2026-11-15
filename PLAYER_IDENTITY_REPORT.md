# CLUTCHUP: persistent player identity and spectator review

## Result and verification status

Gameplay Analysis now stores a confirmed player identity under the active local profile, inspects sampled HUD evidence before requesting performance analysis, and provides an editable identity timeline. Coaching and player history use confirmed User intervals only. Spectator, Unknown and Excluded intervals do not contribute personal findings or Harbor lesson selection.

**133 automated tests passed**, including the existing Harbor, ability, assessment, coaching, branding and video regressions. New coverage includes 20 labeled synthetic HUD-extraction fixtures, provider validation, timeline corrections, profile isolation, cancellation and dashboard event flows with a simulated 30-minute video.

This is a conservative, sampled review system, not a validated continuous player tracker. No representative labeled gameplay recording or live provider run was evaluated. The available in-app browser could not connect to the Windows loopback test server; real-browser visuals, video codec compatibility, actual decoded-memory consumption and end-to-end HUD extraction quality remain unverified. The fixture media seek/canvas and model responses are explicitly simulated. No personal recording or real frames were transmitted during implementation.

## How identity is determined

1. The user enters Riot name, tagline and in-game display name, and explicitly confirms them. This is a local selection, not Riot authentication. Editing is supported. Readable scoreboard names returned by the HUD inspection can fill the display name, but must be confirmed and saved before they replace the active identity. Manual entry works when no HUD name can be read.
2. Each processing window samples four short sequences of four nearby frames. The provider first receives an identity-only prompt and strict output schema. It reports visible perspective names, HUD cues, ambiguity, confidence and evidence. It does not receive the locally entered Riot ID, selected identity object, filename, file size or modification date.
3. The client matches that extracted evidence against the selected display name. User requires a confirmed local identity, an exact normalized name match, high extraction confidence, first-person HUD and an explicit cue tying that named player to their own play. A weapon or ordinary first-person camera alone is insufficient.
4. Spectator requires a different readable, unambiguous name, high confidence and visible spectator HUD or player switching controls. A matching name inside spectator HUD is not accepted as proof of own play.
5. Death, camera/HUD changes, spectator transitions, round transitions, scoreboard overlays, missing HUD, unreadable names, conflicting cues, duplicate names or insufficient evidence produce Unknown. A scoreboard or kill-feed name alone never establishes perspective.
6. Classification applies only to the actual sampled sequence, typically about 1.65 seconds. All intervening gaps remain Unknown. The selected identity persists between windows; perspective confirmation does not.

The provider can still misread pixels or overstate confidence. The high-confidence label is an extraction field, not calibrated model accuracy. Many ordinary own-perspective frames lack explicit identity cues and will remain Unknown. Replay inspection and manual confirmation are expected parts of this workflow.

## Architecture and stored evidence

- `dist/player-identity.js`: profile-scoped identity storage, normalized identity keys, conservative classification, timestamped automatic evidence/events, separate manual corrections, complete timeline construction, personal-finding gate and derived player history.
- `identity-analysis.cjs`: identity-only provider prompt, structured schema and strict reference/name/cue validation. Mixed sequences, duplicate references, out-of-range references and invalid evidence are rejected.
- `clip-analysis.cjs`: retains the authorized local endpoint and existing performance validation, adds identity/performance phases and accepts 4/8/12/16-frame requests so only eligible sequences need a coaching request. API keys remain on the server.
- `dist/identity-pipeline.js`: performs identity inspection, up to two targeted transition probes, then coaching on eligible User sequences. It reuses those captured frames for coaching.
- `dist/full-video-analysis.js`: sequential configurable 30/60/90-second windows, original timestamps, progress, cancellation and partial coverage.
- `dist/identity-review-ui.js`: identity setup/editing, scoreboard selection, resource controls, timeline, corrections, transition evidence, supported history and deletion.
- `dist/gameplay-review.js`: integrates the new workflow, frame cache, completed-window cache, automatic report persistence and eligibility filtering into existing Gameplay Analysis.
- `dist/coach.css`: distinct User, Spectator, Unknown and Excluded timeline accents.
- `serve.cjs`: optional `CLUTCHUP_PORT` permits another local test instance; default remains 4174.
- `tests/identity-fixtures.mjs`, `tests/player-identity.test.mjs`, `tests/identity-ui.test.mjs`, `tests/review-dom-fixture.mjs`: labeled synthetic observations, model/API validation and simulated dashboard/media event flows.
- `README.md` and this report document setup, privacy, operation and limits.

An identity review contains version, match ID, selected identity, local file metadata, selected bounds, timestamped automatic classifications, observed events, manual corrections, processed-window metadata and correction revision. Reports retain absolute finding timestamps, confidence, evidence, interpretation, correction, sampled coverage and resource settings. No images or decoded video are persisted in this structure.

Observed deaths, switches, spectator transitions, HUD changes, round beginnings/endings and returns to own perspective retain evidence and sample timestamps. These are observed sequence locations, not frame-accurate event boundaries. Missing events are not inferred across unsampled gaps.

## Timeline and manual review

The timeline fills the entire selected range, including Unknown gaps. Each interval exposes start/end, classification, confidence, source, evidence, and visible name when available. Expand an interval to inspect evidence, jump to playback, or prefill its correction range. Edit the exact start/end and choose User, Spectator, Unknown or Excluded with an explanation of what you checked.

Manual corrections are stored separately from automatic evidence; the latest overlapping manual correction controls that range. Conflicting overlapping automatic observations become Unknown. Changing a boundary does not rewrite an automatic prediction or present a manual label as AI output. Manual corrections save locally immediately, even before a provider scan. Unknown and Excluded labels can override prior User confirmation.

Re-selecting the same file metadata and range restores a saved identity timeline for the same selected player. Saved reports also offer **Use this identity timeline for reanalysis**. This preserves corrections and match ID. Identical name/size/modification-date metadata is a convenience match, not a cryptographic file identity: verify the original recording yourself.

Newly confirmed ranges require another scan before they generate new coaching. Existing findings are filtered again after every classification correction, so relabeling a range as Spectator or Excluded immediately removes its personal-coaching contribution. Older reports without identity evidence are retained but excluded from personal coaching and memory until the original recording is reanalyzed.

## Long-video processing and resources

There is no application duration cap for local finite-length recordings; 30-minute and longer ranges are accepted. The video uses a browser-local object URL and sequential seeks. The pipeline never reads the whole file into a JavaScript byte array or loads a complete decoded frame sequence.

Resource settings allow a maximum selected file size in decimal GB (`0` delegates to browser limits), 30/60/90-second processing windows and frame edges of 480/720/1080/1440 pixels. A changed limit invalidates the current working cache and stops active analysis. Browser decoding support, available memory and storage still impose practical limits.

Each window retains at most 16 periodic JPEG samples plus eight targeted samples. Possible transitions trigger at most two extra four-frame probes roughly one second after the suspicious sequence. Probes do not expand classifications to surrounding unsampled footage. Transitions entirely between samples can be missed.

JPEG quality is reduced when necessary; each encoded image must stay below 230,000 characters. A frame still over budget stops with a lower-resolution retry instruction. The server retains its 3.9 MB body limit and under-240,000-character per-image limit. Identity inspection receives at most 16 frames per request; a probe receives four. At most six requests per window are possible: one periodic identity request, two probe identity requests, and up to three performance requests for eligible sequences. Most Unknown-only windows make no performance request.

Active-window frames are reused for identity and performance and released after that window. The initial overview is reused when its timestamps exactly match the next window, otherwise released. Completed windows retain metadata/findings, not images. Repeating a scan in the same mounted review skips completed windows until corrections, identity, resource settings or file/range changes invalidate the cache. Reopening a saved report preserves labels but can require fresh image extraction and provider calls; images are deliberately not stored.

The maximum retained sampled-image payload per active window is below 5.52 million characters (24 x 230,000), plus transient request serialization, canvas, browser decoder/GPU buffers and metadata. This is a payload bound, not a measured browser heap or process-memory ceiling. Browser decoder allocations and garbage collection were not measured. Metadata grows with windows/evidence. Existing storage keeps at most 30 video reports per local profile, subject to browser quota; failed writes surface an export instruction.

The 30-minute fixture verifies 20 sequential 90-second windows, absolute timestamps, one selected identity, bounded batches and saved history. A separate test verifies 30/60/90-second window configurations. Simulated seeks and provider calls do not predict real decoding time, throughput or API cost.

## Personal coaching and player memory

Performance requests contain only complete four-frame sequences whose entire span is confirmed User. A finding contributes to the report only when its complete referenced timestamp span remains User after corrections. This filters strengths, weaknesses, lesson choice and saved player memory. Spectated teammate actions cannot enter through an Unknown or Spectator sequence in this client workflow.

Supported categories remain the existing frame-backed aim/crosshair, peeking, cover/positioning, utility and limited movement observations. Temporal claims still require same-sequence evidence; broader tactical decisions are not invented when these samples lack context. This phase preserves the Harbor 1v1 lesson and practice-plan links and the existing assessment/training engine.

Persistent memory derives from profile-scoped saved report evidence for the same normalized Riot-name/tag/display-name selection. Reports contain match IDs, confirmed intervals, observations, confidence/evidence and training corrections; Harbor recommendations are derived from the supported topics. The history view lists prior supported topics and counts. Counts describe sampled evidence, not overall performance.

Recurring weakness recommendations require medium-confidence non-strength evidence from at least two distinct recording metadata identities. Identical file reanalysis and repeated findings from one sequence are deduplicated. They do not create independent corroboration. The application does not claim improvement, calculate overall scores or compare sparse sample counts as skill measurements. Changing a display name creates a different local identity key until the user selects the previous identity again.

## Accuracy measurements

The following results measure **only deterministic classification of 20 synthetic HUD-extraction objects**, not the provider's ability to read actual VALORANT frames and not full-video accuracy. Fixture expectations include known own/spectator perspectives with deliberately missing cues, so abstention reduces recall.

| Measure | Observed fixture result |
| --- | --- |
| Confirmed User precision | 2 / 2 = 100% |
| Confirmed User recall | 2 / 5 = 40% |
| Spectator false-positive rate | 0 / 16 non-spectator cases = 0% |
| Unknown classification rate | 17 / 20 = 85% |
| Manual corrections in automatic classification set | 0 |
| Corrections in separate boundary/override test | 2 |

The three automatic non-Unknown results are two User and one Spectator. The cases cover normal own play, return to own perspective, death, spectating, teammate switches, next-round and round-end transitions, disappearing HUD, scoreboards, cuts, ambiguous names, missing/unreadable HUD, conflicting signals and insufficient cues. Separate tests exercise long/multiple windows, manual User confirmation, exclusion, relabeling as Spectator and blocked coaching.

Reproduce all checks with:

```powershell
node --experimental-loader ./tests/three-loader.mjs --test ./tests/*.test.mjs
```

Result: **133 passed, 0 failed, 0 skipped**. The complete run took about 6.9 seconds on this implementation host; that is automated-test runtime, not video-processing performance. Syntax checks and `git diff --check` also pass. Existing coaching and Harbor regressions remain green.

For a real accuracy evaluation, manually label continuous User/Spectator/Unknown ground truth and actual event boundaries in representative recordings, compare automatic intervals before applying manual corrections, and report time-weighted precision/recall, spectator false positives, Unknown duration and correction counts separately. No such recording accuracy percentages are asserted here.

## Privacy and deletion

Riot entry, selected identity and file metadata stay in local profile storage. The user must check the explicit frame-provider consent before any inspection or coaching request. That disclosure names the 16 periodic frames and up to eight transition frames per window and warns that names may be visible in pixels. The provider receives sampled JPEGs, sequence IDs and original timestamps, with `store:false`; its own processing policies still apply. The entire recording and audio are never sent by this pipeline.

Keys remain in server environment settings. Requests require the local origin, JSON, authorization and resource validation. Cancellation propagates to the active provider request. Revoking consent, changing files/identity/resources, deleting history or unmounting prevents further work. In-flight history deletion cannot recreate a deleted report when an aborted request returns.

Delete individual reports with **Delete report**. **Delete identity and its analysis history** removes this active profile's saved identity and video-analysis records after confirmation, keeping other profiles and Harbor training progress. Exports or copies saved outside the browser must be deleted separately. Clearing browser site storage also removes local data.

## Test a 23-minute recording

1. Start this checkout with `Start CLUTCHUP.cmd`, or `node serve.cjs`, and open the displayed local address. Restart an older running server before checking changes. If the default port is occupied, set `CLUTCHUP_PORT` to an unused port before starting another instance. Browser storage is per origin/port, so use a consistent address for your history.
2. Select your local profile in Settings. In Gameplay Analysis > Upload File, enter Riot name, tagline and exact display name, confirm and save. No Riot API is needed.
3. Open Video resource settings. Start with a 90-second window and 720-pixel frame edge. Leave maximum GB at zero or above the recording's size. Higher resolution can improve HUD readability but increases request payload and decode work.
4. Select the MP4/WebM/browser-supported MOV. The entire duration is selected; 23 minutes produces 16 default windows. Check playback and the overview. Raw video stays local.
5. Without a provider key, playback, manual identity timeline corrections and saved local reviews work. For automated HUD inspection, configure `CLUTCHUP_ANALYSIS_API_KEY` in the server's environment and restart. The optional model setting is `CLUTCHUP_ANALYSIS_MODEL`. Do not put keys in the browser or repository.
6. Read the frame disclosure, authorize if you agree, then press Analyze full video. Inspect progress; Stop analysis or withdrawing consent cancels remaining work. A completed or partial report saves locally when storage is available; Export report JSON is also available.
7. Expand timeline intervals and replay death, spectator switches, round starts/ends and returns to own play. Expect extensive Unknown gaps. Use exact boundaries and evidence to mark verified User, Spectator or Excluded ranges. Never confirm a whole range as User unless you checked all of it.
8. Run analysis again after confirming Unknown ranges. Open only supported personal findings and use the relevant Harbor practice link. Save/export and reopen to verify identity evidence and corrections survived.
9. Re-select the original file and matching range to restore the saved timeline. Verify another local profile cannot see its history. Test individual-report deletion and, only when desired, identity-history deletion.

For an annotated accuracy study, record ground truth and count manual corrections before changing any automatic labels. Manual confirmation improves review coverage but is not automatic recognition accuracy.
