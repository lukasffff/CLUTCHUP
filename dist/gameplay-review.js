import {analyzeVideo} from './full-video-analysis.js';
import {readPlayerIdentity,createIdentityReview,identityKey,personalFindings} from './player-identity.js';
import {analyzeIdentityWindow,verifyLocalCoachingGroups} from './identity-pipeline.js';
import {drawHudAtlas,hudObservation,hasAbilityBars,hasAbilityIcons,hasScoreboardRows,HUD_REGIONS} from './valorant-hud.js';
import {gameplayRounds,reduceGameplay,sampleGameplayWindow} from './valorant-temporal.js';
import {mountIdentitySetup,renderIdentityTimeline} from './identity-review-ui.js';
import { read, lessons, sessionURL } from './coach-model.js';
import {
  TOPICS, MAX_SECTION, parseYouTubeLink, youtubeError, parseTime, formatTime,
  validSection, validVideoSection, drillFor, readReviews, saveReview, updateNote, removeSaved, REPORTS,
  reviewTimestamps, validateClip, readReports, saveReport, CLIP_FRAMES
} from './review-model.js';

const NOTICE = 'Automated visual analysis unavailable for this source.';
let youtubeAPI;

function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeAPI) return youtubeAPI;
  youtubeAPI = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => failed(), 12000);
    const previous = window.onYouTubeIframeAPIReady;
    const cleanup = () => {
      clearTimeout(timeout);
      if (window.onYouTubeIframeAPIReady === ready) window.onYouTubeIframeAPIReady = previous;
    };
    const failed = () => {
      cleanup();
      script.remove();
      reject(Error(navigator.onLine ? 'Could not load YouTube. Check your connection or browser settings and retry.'
        : 'You are offline. Saved notes and local uploads are still available.'));
    };
    const ready = () => {
      cleanup();
      resolve(window.YT);
      if (typeof previous === 'function') previous();
    };
    window.onYouTubeIframeAPIReady = ready;
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.addEventListener('error', failed, { once: true });
    document.head.append(script);
  }).catch(error => { youtubeAPI = null; throw error; });
  return youtubeAPI;
}

function waitMedia(video, event, action, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, loaded);
      video.removeEventListener('error', failed);
      signal?.removeEventListener('abort',aborted);
    };
    const loaded = () => { cleanup(); resolve(); };
    const failed = () => {
      cleanup();
      reject(Error(video.error?.code === 4
        ? 'This browser does not support the recording format or codec. Try desktop Chrome or Edge with an H.264 MP4.'
        : 'The browser could not decode the recording. Check that the file is readable and try a 480 px frame edge if sampling fails.'));
    };
    const aborted=()=>{cleanup();reject(new DOMException('Video sampling stopped.','AbortError'));};
    const timer = setTimeout(() => {
      cleanup();
      reject(Error(event === 'seeked'
        ? 'Seeking timed out. Keep the recording on a local disk, close other video tabs, and retry.'
        : 'Reading video metadata timed out. Try again from a local disk and check the recording opens in your browser.'));
    }, 60000);
    if(signal?.aborted){aborted();return;}
    signal?.addEventListener('abort',aborted,{once:true});
    video.addEventListener(event, loaded);
    video.addEventListener('error', failed);
    try { action(); } catch { failed(); }
  });
}

const element = (tag, text) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
};

export function mountReview(root) {
  root.innerHTML = `
    <h1>Analyze Your Gameplay</h1>
    <p>Upload your gameplay or review a YouTube video to identify what to practice next.</p>
    <div class="review-tabs" role="tablist" aria-label="Video source">
      <button id="tab-upload" role="tab" aria-controls="review-upload">Upload File</button>
      <button id="tab-youtube" role="tab" aria-controls="review-youtube">YouTube Link</button>
    </div>
    <section id="review-upload" class="card" role="tabpanel" aria-labelledby="tab-upload">
      <section data-player-identity></section>
      <div class="review-row"><label>Upload Video File <input id="clip" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"></label><button type="button" class="subtle" data-clear-upload>Clear upload</button></div>
      <p>Select your own continuous VALORANT recording for personal coaching. MP4, WebM and browser-supported MOV files can be scanned in full. Playback stays on this device.</p>
      <video playsinline controls preload="metadata" hidden></video><p id="clipStatus" role="status"></p>
      <form data-local-section class="review-row" hidden><label>Video start <input name="clipStart" required placeholder="0:00"></label><label>Video end <input name="clipEnd" required placeholder="1:30"></label><button type="submit">Preview range</button><button type="button" data-entire-video>Use full video</button></form>
      <div class="film"></div>
      <section data-live-identity></section>
      <div data-vision hidden>
        <p data-vision-status role="status"></p>
        <label><input type="checkbox" id="review-consent"> I authorize sending sampled JPEGs to the configured provider for coaching. When local HUD scanning is unavailable, sampled frames may also be sent for perspective verification. Frames may contain visible player names. My entered Riot ID, file metadata and full recording stay local. Provider charges may apply.</label>
        <button type="button" id="run-vision" disabled>Analyze full video</button><button type="button" id="pause-vision" hidden>Pause after this part</button><button type="button" id="stop-vision" hidden>Stop analysis</button>
        <p>Resume in this tab with the same file, range, identity and resource settings to reuse completed parts.</p>
        <div data-ai-results></div>
      </div>
      <p>Saved reports contain findings and clip details on this device. The video and its frames are never saved here.</p>
      <h2>Saved analysis reports</h2><div data-report-list></div><div data-saved-report></div>
    </section>
    <section id="review-youtube" class="card" role="tabpanel" aria-labelledby="tab-youtube" hidden>
      <form data-yt-form class="review-row">
        <label>Paste YouTube URL <input name="link" type="text" inputmode="url" spellcheck="false" maxlength="4096" required placeholder="https://www.youtube.com/watch?v=…"></label>
        <button type="submit">Load video</button>
        <button type="button" class="subtle" data-clear-video>Clear video</button>
      </form>
      <p data-yt-status role="status"></p>
      <div data-embed class="review-embed" hidden></div>
      <div data-yt-player hidden>
        <p data-credit></p><a data-watch target="_blank" rel="noopener">Open on YouTube</a>
        <div class="review-row">
          <button type="button" data-play disabled>Play</button>
          <button type="button" class="subtle" data-restart disabled>Restart</button>
          <label>Seek <input data-seek type="range" min="0" max="0" step=".1" disabled></label>
          <output data-clock>0:00.0</output>
        </div>
      </div>
      <p>${NOTICE} <button type="button" class="subtle" data-switch-upload>Upload an authorized video file</button></p>
      <div data-range hidden>
        <h2>Review section</h2>
        <p>Enter seconds or m:ss. Choose up to 90 seconds.</p><p data-section-duration></p>
        <form data-range-form>
          <div class="review-row">
            <label>Analysis start <input name="start" required placeholder="0:00" inputmode="decimal"></label>
            <button type="button" class="subtle" data-stamp="start">Use current time</button>
            <label>Analysis end <input name="end" required placeholder="1:30" inputmode="decimal"></label>
            <button type="button" class="subtle" data-stamp="end">Use current time</button>
          </div>
          <div class="review-row">
            <button type="submit">Save section</button>
            <button type="button" class="subtle" data-jump="start">Jump to start</button>
            <button type="button" class="subtle" data-jump="end">Jump to end</button>
            <button type="button" class="subtle" data-play-section>Play selected section</button>
          </div>
        </form>
        <p data-range-status role="status"></p>
        <h2>Manual observations</h2>
        <form data-note-form>
          <div class="review-row">
            <label>Timestamp <input name="at" required placeholder="0:00" inputmode="decimal"></label>
            <button type="button" class="subtle" data-stamp="at">Use current time</button>
            <label>Observation type <select name="topic"></select></label>
          </div>
          <label>What can you see at this moment? <textarea name="evidence" rows="2" maxlength="1200" required></textarea></label>
          <button type="submit">Save observation</button>
          <button type="button" class="subtle" data-cancel-edit hidden>Cancel edit</button>
        </form>
        <p data-note-status role="status"></p>
        <div data-notes></div>
      </div>
      <h2>Saved reviews</h2><p>Only links, selected times, and your notes are saved on this device.</p>
      <div data-review-list></div>
    </section>`;

  const $ = selector => root.querySelector(selector);
  const range = $('[data-range-form]').elements;
  const note = $('[data-note-form]').elements;
  const video = $('video');
  const uploadStatus = $('#clipStatus');
  const visionStatus = $('[data-vision-status]');
  const ytStatus = $('[data-yt-status]');
  const seek = $('[data-seek]');
  const play = $('[data-play]');
  const watch = $('[data-watch]');
  const durationOutput = $('[data-clock]');
  const embed = $('[data-embed]');
  const consent = $('#review-consent');
  const analyze = $('#run-vision');
  const aiResults = $('[data-ai-results]');
  let player, ready = false, current = null, blobURL, selectedEnd = null, duration = 0;
  let generation = 0, disposed = false, playerTimer, uploadGeneration = 0, frames = [];
  let analyzing = false, visionAvailable = false, request, pauseRequested = false;
  let manuallySeeking = false, activeTab = 'upload', poll, editingNote = null;
  let fileInfo, pendingReport, sampledSection, linkSeek = null;
  let identityReview=null, localHudAvailable=false;
  const hudWindows=new WeakMap();
  const completedWindows=new Map();
  const localSection = $('[data-local-section]');
  const identitySetup=mountIdentitySetup($('[data-player-identity]'),{
    change:()=>{request?.abort();uploadGeneration++;analyzing=false;video.controls=true;identityReview=null;completedWindows.clear();ensureIdentityReview();syncVision();},
    resourceChange:()=>{request?.abort();uploadGeneration++;analyzing=false;video.controls=true;completedWindows.clear();frames=[];syncVision();},
    forget:()=>{request?.abort();pendingReport=null;aiResults.replaceChildren();$('[data-saved-report]').replaceChildren();renderReports();}
  });
  function ensureIdentityReview() {
    const identity=identitySetup.getIdentity();
    if(!identity||!fileInfo||!sampledSection){$('[data-live-identity]').replaceChildren();return;}
    if(!identityReview||identityKey(identityReview.identity)!==identityKey(identity)||identityReview.start!==sampledSection.start||identityReview.end!==sampledSection.end) {
      const saved=readReports().find(report=>report.identityReview?.version===1&&identityKey(report.identityReview.identity)===identityKey(identity)&&report.file?.name===fileInfo.name&&report.file?.size===fileInfo.size&&report.file?.lastModified===fileInfo.lastModified&&report.start===sampledSection.start&&report.end===sampledSection.end);
      identityReview=saved?.identityReview||createIdentityReview(identity,fileInfo,sampledSection.start,sampledSection.end);
    }
    renderIdentityTimeline(identityReview,$('[data-live-identity]'),{canJump:!video.hidden&&!analyzing,jump:at=>{video.currentTime=at;},change:()=>{
      request?.abort();uploadGeneration++;analyzing=false;video.controls=true;completedWindows.clear();
      const previous=readReports().find(r=>r.id===identityReview.matchId);
      const report={id:identityReview.matchId,created:Date.now(),source:'local-perspective-review',file:{...fileInfo},...sampledSection,findings:[],...previous,identityReview};
      const stored=saveReport(report);renderReports();identitySetup.refreshMemory();ensureIdentityReview();syncVision();
      visionStatus.textContent=stored?'Manual correction saved locally. Run analysis to inspect newly confirmed user frames.':'Correction is in memory only: browser storage is unavailable. Run analysis and export the report to keep it.';
    }});
  }

  for (const [value, name] of Object.entries(TOPICS)) note.topic.add(new Option(name, value));

  function switchTab(tab, focus = false) {
    activeTab = tab;
    for (const source of ['upload', 'youtube']) {
      const active = source === tab;
      $('[id="tab-' + source + '"]').setAttribute('aria-selected', active);
      $('[id="tab-' + source + '"]').tabIndex = active ? 0 : -1;
      $('[id="review-' + source + '"]').hidden = !active;
    }
    if (tab === 'upload' && ready) player.pauseVideo();
    if (tab === 'youtube') video.pause();
    syncPolling();
    if (focus) $('#tab-' + tab).focus();
  }

  for (const source of ['upload', 'youtube']) {
    const tab = $('#tab-' + source);
    tab.onclick = () => switchTab(source);
    tab.onkeydown = event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        switchTab(event.key === 'Home' ? 'upload' : event.key === 'End' ? 'youtube' : source === 'upload' ? 'youtube' : 'upload', true);
      }
    };
  }
  $('[data-switch-upload]').onclick = () => switchTab('upload', true);
  switchTab('upload');

  function drillLink(observation) {
    const plan = drillFor(observation);
    if (!plan) return null;
    const link = element('a', 'Start 1v1 · ' + lessons[plan.lesson].title);
    link.className = 'button';
    link.href = sessionURL({ ...plan, quality:read('clutchup.quality',read('clutchup.low',false)?'low':'high') });
    return link;
  }

  function appendFinding(target, finding, manual, noteIndex) {
    const article = element('article');
    article.className = 'review-finding';
    article.append(element('h3', formatTime(finding.at) + ' · ' + TOPICS[finding.topic]),
      element('p', (manual ? 'Manual observation' : finding.strength ? 'Strength' : 'Area to practice') + ' · ' + (finding.confidence || (manual ? 'entered by player' : 'uncertainty not recorded'))),
      element('p', finding.correctionByPlayer ? 'Player correction — ' + finding.correctionByPlayer : finding.evidence));
    if (!manual) {
      if (finding.timestamps?.length > 1) article.append(element('p', 'Evidence times — ' + finding.timestamps.map(formatTime).join(', ')));
      if (finding.meaning) article.append(element('p', 'Why it matters — ' + finding.meaning));
      if (finding.correction && !finding.strength) article.append(element('p', 'Try next — ' + finding.correction));
      if (finding.correctionByPlayer) article.append(element('p', 'Original model observation — ' + finding.evidence));
    }
    const jump = element('button', 'Jump to ' + formatTime(finding.at));
    jump.type = 'button';
    jump.className = 'subtle';
    jump.disabled = manual ? !ready : video.hidden;
    jump.onclick = () => manual ? jumpTo(finding.at) : video.currentTime = finding.at;
    article.append(jump);
    const training = manual || finding.confidence === 'medium' ? drillLink(finding) : null;
    if (training) {
      const lesson=lessons[drillFor(finding).lesson];
      article.append(training,element('p','Practice plan: watch the bot demonstrate this skill, then face the same opponent. '+lesson.focus),element('p','Measured target: '+lesson.goal));
    }
    if (manual) {
      const edit = action('Edit note', () => editNote(noteIndex));
      const remove = action('Delete note', () => {
        resetNote();
        current.notes = updateNote(current.notes, noteIndex, null);
        persist($('[data-note-status]'), 'Observation deleted.');
        renderNotes();
      });
      article.append(edit, remove);
    }
    target.append(article);
    return article;
  }

  function action(text, fn) {
    const button = element('button', text);
    button.type = 'button';
    button.className = 'subtle';
    button.onclick = fn;
    return button;
  }

  function resetNote() {
    editingNote = null;
    note.evidence.value = '';
    $('[data-note-form] [type=submit]').textContent = 'Save observation';
    $('[data-cancel-edit]').hidden = true;
  }
  $('[data-cancel-edit]').onclick = resetNote;

  function editNote(index) {
    const observation = current.notes[index];
    if (!observation) return;
    editingNote = index;
    note.at.value = String(observation.at);
    note.topic.value = observation.topic;
    note.evidence.value = observation.evidence;
    $('[data-note-form] [type=submit]').textContent = 'Save changes';
    $('[data-cancel-edit]').hidden = false;
    note.evidence.focus();
  }

  function renderNotes() {
    const holder = $('[data-notes]');
    holder.replaceChildren();
    const notes = current?.notes || [];
    for (let index = notes.length - 1; index >= 0; index--) appendFinding(holder, notes[index], true, index);
  }

  function renderSaved() {
    const list = $('[data-review-list]');
    list.replaceChildren();
    const saved = readReviews();
    if (!saved.length) list.append(element('p', 'Saved YouTube sections and notes will appear here.'));
    for (const item of saved) {
      const button = element('button', (item.title || item.videoId) + ' · ' + item.notes.length + ' observation(s)');
      button.type = 'button';
      button.className = 'subtle';
      button.onclick = () => {
        $('[data-yt-form]').elements.link.value = item.sourceURL || item.url;
        void openVideo(item);
      };
      const row = element('div');
      row.className = 'review-row';
      row.append(button, action('Delete review', () => {
        if (!window.confirm('Delete this saved review and its notes?')) return;
        if (!removeSaved(item.id)) { ytStatus.textContent = 'Could not update browser storage.'; return; }
        if (current?.id === item.id) clearVideo();
        renderSaved();
      }));
      list.append(row);
    }
  }

  function persist(status, message) {
    const saved = saveReview(current);
    status.textContent = saved ? message : 'Browser storage is unavailable. This review is only available while this page stays open.';
    if (saved) renderSaved();
  }

  function displaySection() {
    if (!current?.duration) return;
    $('[data-range]').hidden = false;
    range.start.value = String(current.start);
    range.end.value = String(current.end);
    note.at.value = String(current.start);
    updateDuration();
    renderNotes();
  }

  function setPlaybackControls() {
    play.disabled = !ready;
    $('[data-restart]').disabled = !ready;
    seek.disabled = !ready || !duration;
    root.querySelectorAll('[data-stamp], [data-jump], [data-play-section]').forEach(button => { button.disabled = !ready; });
    renderNotes();
  }

  function destroyPlayer() {
    clearTimeout(playerTimer);
    stopPolling();
    ready = false;
    selectedEnd = null;
    try { player?.destroy(); } catch { /* The iframe may already have been removed. */ }
    player = null;
    embed.replaceChildren();
    embed.hidden = true;
  }

  async function openVideo(item, startAt = null) {
    const run = ++generation;
    destroyPlayer();
    current = item;
    linkSeek = startAt;
    duration = item.duration || 0;
    $('[data-range]').hidden = true;
    $('[data-note-status]').textContent = '';
    $('[data-range-status]').textContent = '';
    resetNote();
    seek.max = String(duration);
    seek.value = 0;
    durationOutput.textContent = '0:00.0';
    play.textContent = 'Play';
    const credit = $('[data-credit]');
    credit.textContent = item.title ? item.title + (item.author ? ' · ' + item.author : '') : 'YouTube video · ' + item.videoId;
    $('[data-yt-player]').hidden = false;
    watch.href = item.url;
    displaySection();
    setPlaybackControls();
    if (!navigator.onLine) {
      ytStatus.textContent = 'You are offline. Connect to the internet to play the YouTube video.';
      return;
    }
    ytStatus.textContent = 'Loading YouTube player…';
    try {
      const api = await loadYouTube();
      if (disposed || run !== generation) return;
      const frame = document.createElement('iframe');
      const params = new URLSearchParams({ enablejsapi: '1', playsinline: '1', origin: location.origin });
      frame.title = 'YouTube gameplay video';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.src = 'https://www.youtube.com/embed/' + item.videoId + '?' + params;
      embed.append(frame);
      embed.hidden = false;
      playerTimer = setTimeout(() => {
        if (run === generation) ytStatus.textContent = 'The YouTube player did not respond. Check your connection or open the video on YouTube.';
      }, 14000);
      let playbackFailed = false;
      player = new api.Player(frame, {
        events: {
          onReady(event) {
            if (run !== generation || playbackFailed) return;
            clearTimeout(playerTimer);
            ready = true;
            setPlaybackControls();
            const d = event.target.getDuration();
            ytStatus.textContent = d > 0 ? '' : 'Press Play to load video timing. If duration remains unavailable, review the video on YouTube.';
            queueMicrotask(() => { tick(); syncPolling(); });
          },
          onStateChange(event) {
            if (run !== generation || !ready) return;
            play.textContent = event.data === 1 ? 'Pause' : 'Play';
            tick();
            syncPolling();
          },
          onError(event) {
            if (run !== generation) return;
            clearTimeout(playerTimer);
            playbackFailed = true;
            ready = false;
            selectedEnd = null;
            stopPolling();
            ytStatus.textContent = youtubeError(event.data);
            setPlaybackControls();
          },
          onAutoplayBlocked() {
            if (run === generation) ytStatus.textContent = 'Playback was blocked by your browser. Press Play inside the YouTube player.';
          }
        }
      });
    } catch (error) {
      if (!disposed && run === generation) ytStatus.textContent = error.message;
    }
  }

  function tick() {
    if (!ready || !player) return;
    const seconds = player.getCurrentTime();
    const total = player.getDuration();
    if (Number.isFinite(total) && total > 0 && total !== duration) {
      duration = total;
      seek.max = String(total);
      seek.disabled = false;
      if (current.duration == null) {
        current.duration = total;
        current.start = linkSeek !== null && linkSeek < total ? linkSeek : 0;
        current.end = Math.floor(Math.min(current.start + MAX_SECTION, total) * 1000) / 1000;
        displaySection();
      } else current.duration = total;
      if (ytStatus.textContent.startsWith('Press Play to load video timing.')) ytStatus.textContent = '';
    }
    if (linkSeek !== null && duration > 0) {
      const timestamp = linkSeek;
      linkSeek = null;
      if (timestamp < duration) jumpTo(timestamp);
      else ytStatus.textContent = 'The linked timestamp is beyond the available video. Review starts at the beginning.';
    }
    const metadata = player.getVideoData?.();
    if (metadata?.title) {
      current.title = metadata.title;
      current.author = metadata.author || '';
      const credit = current.title + (current.author ? ' · ' + current.author : '');
      if ($('[data-credit]').textContent !== credit) $('[data-credit]').textContent = credit;
    }
    if (!Number.isFinite(seconds)) return;
    durationOutput.textContent = formatTime(seconds) + ' / ' + formatTime(duration || NaN);
    if (!manuallySeeking) seek.value = String(seconds);
    if (selectedEnd && seconds < selectedEnd.end) selectedEnd.started = true;
    if (selectedEnd?.started && seconds >= selectedEnd.end) {
      selectedEnd = null;
      player.pauseVideo();
    }
  }

  function stopPolling() {
    clearInterval(poll);
    poll = null;
  }
  function syncPolling() {
    stopPolling();
    if (!ready || activeTab !== 'youtube' || document.hidden) return;
    if (!duration || player.getPlayerState() === 1 || player.getPlayerState() === 3) poll = setInterval(tick, 135);
  }
  document.addEventListener('visibilitychange', syncPolling);
  const offline = () => {
    if (!current) return;
    if (ready) player.pauseVideo();
    stopPolling();
    ytStatus.textContent = 'You are offline. Connect to the internet to play the YouTube video.';
  };
  window.addEventListener('offline', offline);
  function jumpTo(seconds) {
    if (!ready) return;
    selectedEnd = null;
    player.seekTo(seconds, true);
    durationOutput.textContent = formatTime(seconds) + ' / ' + formatTime(duration || NaN);
    seek.value = String(seconds);
  }

  $('[data-yt-form]').onsubmit = event => {
    event.preventDefault();
    try {
      const { id, url, sourceURL, startAt } = parseYouTubeLink(event.currentTarget.elements.link.value);
      const saved = readReviews().find(item => item.videoId === id);
      void openVideo(saved ? { ...saved, sourceURL } : { id, videoId: id, url, sourceURL, notes: [] }, startAt);
    } catch (error) { ytStatus.textContent = error.message; }
  };
  function clearVideo() {
    generation++;
    destroyPlayer();
    current = null;
    duration = 0;
    linkSeek = null;
    $('[data-yt-form]').elements.link.value = '';
    $('[data-yt-player]').hidden = true;
    $('[data-range]').hidden = true;
    ytStatus.textContent = '';
    resetNote();
  }
  $('[data-clear-video]').onclick = clearVideo;
  $('[data-restart]').onclick = () => {
    if (!ready) return;
    jumpTo(0);
    player.playVideo();
  };

  play.onclick = () => {
    if (!ready) return;
    selectedEnd = null;
    if (player.getPlayerState() === 1) player.pauseVideo();
    else player.playVideo();
  };
  seek.oninput = () => {
    manuallySeeking = true;
    durationOutput.textContent = formatTime(+seek.value) + ' / ' + formatTime(duration);
  };
  seek.onchange = () => { manuallySeeking = false; jumpTo(+seek.value); };
  seek.onblur = () => { manuallySeeking = false; };
  for (const control of root.querySelectorAll('[data-stamp]')) {
    control.onclick = () => {
      if (!ready) return;
      const input = control.dataset.stamp === 'at' ? note.at : range[control.dataset.stamp];
      input.value = String(Math.floor(player.getCurrentTime() * 1000) / 1000);
      updateDuration();
    };
  }

  function getRange() {
    return validSection(parseTime(range.start.value), parseTime(range.end.value), current?.duration);
  }
  function updateDuration() {
    const output = $('[data-section-duration]');
    try { const { start, end } = getRange(); output.textContent = 'Selected duration: ' + formatTime(end - start); }
    catch { output.textContent = 'Selected duration: —'; }
  }
  range.start.oninput = range.end.oninput = updateDuration;
  $('[data-range-form]').onsubmit = event => {
    event.preventDefault();
    const status = $('[data-range-status]');
    try {
      Object.assign(current, getRange());
      persist(status, 'Section saved on this device.');
    } catch (error) { status.textContent = error.message; }
  };
  for (const button of root.querySelectorAll('[data-jump]')) {
    button.onclick = () => {
      try { jumpTo(getRange()[button.dataset.jump]); }
      catch (error) { $('[data-range-status]').textContent = error.message; }
    };
  }
  $('[data-play-section]').onclick = () => {
    if (!ready) return;
    try {
      const { start, end } = getRange();
      jumpTo(start);
      selectedEnd = { end, started: false };
      player.playVideo();
    } catch (error) { $('[data-range-status]').textContent = error.message; }
  };
  $('[data-note-form]').onsubmit = event => {
    event.preventDefault();
    const status = $('[data-note-status]');
    try {
      const section = getRange();
      if (current.notes.length >= 100 && editingNote === null) throw Error('This review already has 100 observations.');
      const observation = { at: parseTime(note.at.value), topic: note.topic.value, evidence: note.evidence.value };
      const notes = updateNote(current.notes, editingNote, observation, section);
      Object.assign(current, section, { notes });
      resetNote();
      persist(status, drillFor(observation) ? 'Manual observation saved. Your 1v1 drill is ready.' :
        'Manual observation saved. This topic does not have a supported 1v1 drill.');
      renderNotes();
    } catch (error) { status.textContent = error.message; }
  };

  function reportControls(report, target, saved) {
    const heading = element('h3', report.file.name);
    target.replaceChildren(heading, element('p', 'Report ' + report.id.slice(0, 8) + ' · ' +
      formatTime(report.start) + '–' + formatTime(report.end) + ' · ' + new Date(report.created).toLocaleString()));
    target.append(element('p', 'Automated observations from sampled local footage. Replay the clip to check each claim.'));
    if(report.coverage)target.append(element('p',(report.coverage.complete?'Complete sampled coverage':'Partial sampled coverage')+' - '+report.coverage.completedBatches+'/'+report.coverage.totalBatches+' parts; analyzed through '+formatTime(report.coverage.analyzedUntil)+'. Unsampled moments are not reviewed.'));
    const eligible=report.identityReview?personalFindings(report.findings,report.identityReview,{includeDismissed:true}):[];
    if(!report.identityReview)target.append(element('p','This older report has no perspective verification. Its findings are excluded from personal coaching and player memory. Reanalyze the original recording with a confirmed identity.'));
    const groups = new Map();
    for (const finding of eligible) {
      if (!finding.strength && finding.confidence === 'medium' && !finding.dismissed) {
        if (!groups.has(finding.topic)) groups.set(finding.topic, new Set());
        groups.get(finding.topic).add(finding.group);
      }
    }
    const ordered = report.findings.map((finding, index) => ({ finding, index })).filter(({finding})=>eligible.includes(finding)).sort((a,b) =>
      (groups.get(b.finding.topic)?.size || 0) - (groups.get(a.finding.topic)?.size || 0) || a.finding.at - b.finding.at);
    const keyFinding = ordered.find(({finding}) => finding.confidence === 'medium' && !finding.dismissed && drillFor(finding));
    if (keyFinding) target.append(drillLink(keyFinding.finding));
    if (!ordered.length) target.append(element('p', report.coverage && !report.coverage.complete ? 'No findings were returned from completed parts.' : 'The sampled frames did not contain clear evidence for a supported finding.'));
    const sameFile = fileInfo?.name === report.file.name && fileInfo?.size === report.file.size &&
      fileInfo?.lastModified === report.file.lastModified;
    if(report.identityReview) {
      const timeline=element('section');target.append(timeline);
      renderIdentityTimeline(report.identityReview,timeline,{canJump:sameFile&&!video.hidden&&!analyzing,jump:at=>{video.currentTime=at;},change:()=>{
        request?.abort();uploadGeneration++;analyzing=false;video.controls=true;syncVision();
        completedWindows.clear();
        if(sameFile && identityKey(report.identityReview.identity)===identityKey(identitySetup.getIdentity()) && sampledSection?.start===report.start && sampledSection?.end===report.end)identityReview=report.identityReview;
        if(saved&&!saveReport(report)){target.append(element('p','Correction could not be saved. Export this report to keep it.'));return;}
        if(!saved)pendingReport=report;
        reportControls(report,target,saved);identitySetup.refreshMemory();ensureIdentityReview();
      }});
      if(sameFile&&identityKey(report.identityReview.identity)===identityKey(identitySetup.getIdentity()))target.append(action('Use this identity timeline for reanalysis',()=>{
        request?.abort();completedWindows.clear();identityReview=report.identityReview;
        localSection.elements.clipStart.value=String(report.start);localSection.elements.clipEnd.value=String(report.end);
        void sampleLocalSection();
      }));
    }
    if (!sameFile) target.append(element('p', 'Choose the original clip again to enable timestamp jumps.'));
    for (const { finding, index } of ordered) {
      if (finding.dismissed) {
        target.append(action('Restore finding at ' + formatTime(finding.at), () => correct(index, { dismissed: false })));
        continue;
      }
      const card = appendFinding(target, finding, false);
      card.querySelector('button').disabled = !sameFile || video.hidden;
      const correction = document.createElement('details');
      const summary = element('summary', 'Correct or dismiss this finding');
      const field = element('textarea');
      field.maxLength = 500;
      field.value = finding.correctionByPlayer || finding.evidence;
      field.setAttribute('aria-label', 'Correct observation at ' + formatTime(finding.at));
      correction.append(summary, field, action('Save correction', () => {
        if (field.value.trim()) correct(index, { correctionByPlayer: field.value.trim() });
      }), action('Dismiss finding', () => correct(index, { dismissed: true })));
      card.append(correction);
    }
    if (!saved) target.append(action('Save report on this device', () => {
      if (saveReport(report)) { reportControls(report, target, true); renderReports(); identitySetup.refreshMemory(); }
      else visionStatus.textContent = 'Browser storage is unavailable. Export the report to keep it.';
    }));
    target.append(action('Export report JSON', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type:'application/json'}));
      const link = element('a');
      link.href = url;
      link.download = 'clutchup-review-' + report.id.slice(0, 8) + '.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }));
    function correct(index, fields) {
      const updated = { ...report, findings: report.findings.map((item, i) => i === index ? { ...item, ...fields } : item) };
      if (saved && !saveReport(updated)) {
        target.append(element('p', 'Could not save the correction in this browser.'));
        return;
      }
      if (!saved) pendingReport = updated;
      reportControls(updated, target, saved);
    }
  }
  function renderReports() {
    const list = $('[data-report-list]');
    list.replaceChildren();
    const reports = readReports();
    if (!reports.length) list.append(element('p', 'Saved reports will appear here.'));
    for (const report of reports) {
      const row = element('div');
      row.className = 'review-row';
      row.append(action('Open ' + report.file.name + ' · ' + report.id.slice(0, 8), () => {
        $('[data-saved-report]').dataset.report = report.id;
        reportControls(report, $('[data-saved-report]'), true);
      }), action('Delete report', () => {
        if (!window.confirm('Delete this saved analysis report?')) return;
        if (!removeSaved(report.id, REPORTS)) { list.append(element('p', 'Could not update browser storage.')); return; }
        if(identityReview?.matchId===report.id){request?.abort();uploadGeneration++;analyzing=false;video.controls=true;identityReview=null;completedWindows.clear();ensureIdentityReview();syncVision();}
        if ($('[data-saved-report]').dataset.report === report.id) $('[data-saved-report]').replaceChildren();
        if (pendingReport?.id === report.id) { pendingReport = null; aiResults.replaceChildren(); }
        renderReports();
        identitySetup.refreshMemory();
      }));
      list.append(row);
    }
  }

  function syncVision() {
    $('#stop-vision').hidden = !analyzing;
    const pause = $('#pause-vision');
    pause.hidden = !analyzing;
    pause.disabled = pauseRequested;
    pause.textContent = pauseRequested ? 'Pausing after this part…' : 'Pause after this part';
    if (sampledSection) {
      const resumable = pendingReport?.identityReview === identityReview && pendingReport?.coverage && !pendingReport.coverage.complete && completedWindows.size > 0;
      const full=sampledSection.start===0 && sampledSection.end===video.duration;
      analyze.textContent = resumable ? 'Resume analysis' : localHudAvailable && !(visionAvailable && consent.checked)
        ? 'Scan gameplay states' : full ? 'Analyze full video' : 'Analyze selected range';
    }
    analyze.disabled = !(localHudAvailable || (consent.checked && visionAvailable)) || !sampledSection || !readPlayerIdentity()?.confirmed || analyzing;
  }
  consent.onchange = ()=>{if(!consent.checked && analyzing)request?.abort();syncVision();};
  const capabilities = url => fetch(url).then(response=>response.ok?response.json():null).catch(()=>null);
  void Promise.all([capabilities('/api/clip-analysis'),capabilities('/api/local-hud')]).then(([provider,hud])=>{
    if(disposed)return;
    visionAvailable=provider?.enabled===true;
    localHudAvailable=hud?.available===true;
    visionStatus.textContent=localHudAvailable
      ? 'Scan gameplay states with local Windows HUD recognition. '+(visionAvailable?'Opt in to also generate coaching from supported gameplay.':'Configure an analysis provider to also generate coaching.')
      : visionAvailable?'Opt in to verify perspective and analyze sampled gameplay.':'Playback and previews are available. HUD scanning or a configured analysis provider is required for automated review.';
    syncVision();
  });

  function resetUpload() {
    uploadGeneration++;
    request?.abort();
    analyzing = false;
    pauseRequested = false;
    frames = [];
    identityReview=null;completedWindows.clear();identitySetup.clearScoreboard();$('[data-live-identity]').replaceChildren();
    sampledSection = null;
    localSection.hidden = true;
    aiResults.replaceChildren();
    $('[data-saved-report]').replaceChildren();
    pendingReport = null;
    syncVision();
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.hidden = true;
    video.controls = true;
    $('.film').replaceChildren();
    $('[data-vision]').hidden = true;
    consent.checked = false;
    if (blobURL) URL.revokeObjectURL(blobURL);
    blobURL = null;
    fileInfo = null;
    uploadStatus.textContent = '';
  }
  $('[data-clear-upload]').onclick = () => { $('#clip').value = ''; resetUpload(); };
  $('#clip').onchange = async () => {
    const file = $('#clip').files[0];
    if (!file) return;
    resetUpload();
    const run = uploadGeneration;
    try {
      validateClip(file);
      const {maxGB}=identitySetup.resources();
      if(maxGB&&file.size>maxGB*1e9)throw Error('This recording is '+(file.size/1e9).toFixed(2)+' GB. Raise the file-size limit or enter 0 in Video resource settings.');
      fileInfo = { name: file.name, size: file.size, lastModified: file.lastModified };
      uploadStatus.textContent = 'Reading video…';
      blobURL = URL.createObjectURL(file);
      request=new AbortController();
      await waitMedia(video, 'loadedmetadata', () => { video.src = blobURL; },request.signal);
      if (disposed || run !== uploadGeneration) return;
      const total = video.duration;
      if (!Number.isFinite(total) || total <= 0 || !video.videoWidth) {
        throw Error('Choose a readable finite-length video supported by your browser.');
      }
      localSection.elements.clipStart.value = '0';
      localSection.elements.clipEnd.value = String(total);
      localSection.hidden = false;
      video.hidden = false;
      await sampleLocalSection();
    } catch (error) {
      if (!disposed && run === uploadGeneration) {
        resetUpload();
        uploadStatus.textContent = error.message;
      }
    }
  };

  $('[data-entire-video]').onclick=()=>{localSection.elements.clipStart.value='0';localSection.elements.clipEnd.value=String(video.duration);void sampleLocalSection();};
  $('#stop-vision').onclick=()=>request?.abort();
  $('#pause-vision').onclick=()=>{pauseRequested=true;syncVision();};
  for(const input of [localSection.elements.clipStart,localSection.elements.clipEnd])input.oninput=()=>{if(analyzing)request?.abort();frames=[];sampledSection=null;syncVision();};
  localSection.onsubmit = event => { event.preventDefault(); void sampleLocalSection(); };
  async function captureSection(section,run,signal,preview=false,timestamps=null,cache=null) {
    const canvas=document.createElement('canvas');
    const sampled=[];
    try {
      const scale=Math.min(1,identitySetup.resources().edge/Math.max(video.videoWidth,video.videoHeight));
      canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
      canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
      const context=canvas.getContext('2d');
      if(!context)throw Error('The browser could not allocate a sampling canvas. Choose a smaller maximum frame edge and close other video tabs.');
      for(const [index,{at,group}] of (timestamps||reviewTimestamps(section.end-section.start,section.start)).entries()) {
        signal?.throwIfAborted();
        if(disposed || run!==uploadGeneration)throw new DOMException('Video changed.','AbortError');
        if(cache?.has(at)){sampled.push({...cache.get(at),group});continue;}
        uploadStatus.textContent='Sampling '+formatTime(at)+' - frame '+(index+1)+' / '+CLIP_FRAMES;
        if(Math.abs(video.currentTime-at)>.0001)await waitMedia(video,'seeked',()=>{video.currentTime=at;},signal);
        signal?.throwIfAborted();
        if(disposed || run!==uploadGeneration)throw new DOMException('Video changed.','AbortError');
        try {context.drawImage(video,0,0,canvas.width,canvas.height);}
        catch {throw Error('Could not sample this frame. Try a 480 px frame edge or close other video tabs, then resume.');}
        let image=canvas.toDataURL('image/jpeg',.72);
        for(const quality of [.5,.32,.2]){if(image.length<230000)break;image=canvas.toDataURL('image/jpeg',quality);}
        if(!image.startsWith('data:image/jpeg;base64,'))throw Error('The browser could not encode this frame. Choose a 480 px frame edge and retry.');
        if(image.length>=230000)throw Error('A frame exceeds the request limit. Choose a smaller maximum frame edge and retry.');
        const frame={at,group,image};sampled.push(frame);cache?.set(at,frame);
        if(preview) {
          const figure=element('figure'),img=element('img'),caption=element('figcaption');
          img.alt='Frame at '+formatTime(at);img.src=image;
          const jump=element('button',formatTime(at));jump.className='subtle';jump.onclick=()=>{video.currentTime=at;};
          caption.append(jump);figure.append(img,caption);$('.film').append(figure);
        }
      }
      return sampled;
    } finally {canvas.width=canvas.height=0;}
  }

  async function sampleLocalSection() {
    let section;
    try {section=validVideoSection(parseTime(localSection.elements.clipStart.value),parseTime(localSection.elements.clipEnd.value),video.duration);}
    catch(error){uploadStatus.textContent=error.message;return;}
    const run=++uploadGeneration;
    request?.abort();request=new AbortController();
    analyzing=false;frames=[];sampledSection=null;syncVision();
    aiResults.replaceChildren();$('.film').replaceChildren();
    video.pause();video.controls=false;
    try {
      frames=await captureSection(section,run,request.signal,true);
      sampledSection=section;video.currentTime=section.start;
      ensureIdentityReview();
      $('[data-vision]').hidden=false;
      uploadStatus.textContent='Overview previews for '+formatTime(section.start)+' to '+formatTime(section.end)+'. Analysis visits '+Math.ceil((section.end-section.start)/identitySetup.resources().windowSeconds)+' parts in successive batches. Only sampled moments are reviewed, not continuous footage.';
      syncVision();
    } catch(error) {if(!disposed && run===uploadGeneration)uploadStatus.textContent=error.message;}
    finally {if(!disposed && run===uploadGeneration)video.controls=true;}
  }

  analyze.onclick=async()=>{
    if(analyze.disabled || !sampledSection)return;
    ensureIdentityReview();
    if(!identityReview)return;
    const run=uploadGeneration,section={...sampledSection},source={...fileInfo};
    const tracker=identityReview;let limits;
    try{limits=identitySetup.resources();if(limits.maxGB&&source.size>limits.maxGB*1e9)throw Error('This recording exceeds your configured file-size limit. Raise the limit or enter 0 in Video resource settings.');}
    catch(error){visionStatus.textContent=error.message;return;}
    const useCoaching=consent.checked && visionAvailable;
    const runHud=localHudAvailable;
    const priorFindings=runHud&&!useCoaching?readReports().find(report=>report.id===tracker.matchId)?.findings:undefined;
    let localCache=hudWindows.get(tracker);
    if(runHud && !localCache)hudWindows.set(tracker,localCache=new Map());
    let temporal=null;
    let scannedReview={...tracker,automatic:[],events:[],processed:[]};
    let activeFrames=new Map(frames.map(frame=>[frame.at,frame]));
    frames=[];$('.film').replaceChildren();
    request?.abort();request=new AbortController();
    pauseRequested=false;analyzing=true;syncVision();aiResults.replaceChildren();video.pause();video.controls=false;ensureIdentityReview();
    async function send(phase,frames,section,signal) {
      if(!consent.checked)throw new DOMException('Analysis permission withdrawn.','AbortError');
      visionStatus.textContent=(phase==='identity'?'Inspecting perspective':'Reviewing confirmed user play')+' at '+formatTime(section.start);
      const response=await fetch('/api/clip-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({authorized:true,phase,frames,section}),signal});
      const body=await response.json();if(!response.ok)throw Error(body.error||'Analysis could not run.');
      return phase==='identity'?body.observations:body.findings;
    }
    const hudCanvas=runHud?document.createElement('canvas'):null;
    async function readHud(at,signal) {
      signal.throwIfAborted();
      if(Math.abs(video.currentTime-at)>.00001)await waitMedia(video,'seeked',()=>{video.currentTime=at;},signal);
      signal.throwIfAborted();
      drawHudAtlas(video,hudCanvas,video.videoWidth,video.videoHeight);
      const context=hudCanvas.getContext('2d');
      const abilityPixels=context.getImageData(...HUD_REGIONS.player.tile);
      const bars=hasAbilityBars(abilityPixels)||hasAbilityIcons(abilityPixels);
      const scoreboard=hasScoreboardRows(context.getImageData(...HUD_REGIONS.scoreboard.tile));
      context.clearRect(...HUD_REGIONS.scoreboard.tile);
      const png=await new Promise(resolve=>hudCanvas.toBlob(resolve,'image/png'));
      if(!png)throw Error('The browser could not encode the HUD sample.');
      const response=await fetch('/api/local-hud',{method:'POST',headers:{'Content-Type':'image/png'},body:png,signal});
      const data=await response.json();
      if(!response.ok||!Array.isArray(data.words)) {
        if(response.status===503 && data.error?.includes('OCR language pack'))localHudAvailable=false;
        throw Error(data.error||'Local HUD recognition failed.');
      }
      return hudObservation(data.words,at,bars,scoreboard);
    }
    try {
      const result=await analyzeVideo({
        ...section,signal:request.signal,windowSeconds:limits.windowSeconds,shouldPause:()=>pauseRequested,
        capture:async(window,signal)=>{
          const key=window.start+':'+window.end+':'+tracker.revision+(runHud?':hud:'+useCoaching:'');
          if(!useCoaching || completedWindows.has(key))return [];
          const expected=reviewTimestamps(window.end-window.start,window.start);
          if(!expected.every(t=>activeFrames.has(t.at)))activeFrames.clear();
          return captureSection(window,run,signal,false,expected,activeFrames);
        },
        analyze:async(frames,window,signal)=>{
          const key=window.start+':'+window.end+':'+tracker.revision+(runHud?':hud:'+useCoaching:'');
          if(runHud) {
            const hudKey=window.start+':'+window.end;
            if(!localCache.has(hudKey))localCache.set(hudKey,await sampleGameplayWindow(window,readHud,signal));
            const scored=reduceGameplay(temporal,localCache.get(hudKey),tracker.identity,window);
            temporal=scored.state;
            scannedReview={...scannedReview,automatic:[...scannedReview.automatic,...scored.automatic],
              events:[...scannedReview.events,...scored.events],processed:[...scannedReview.processed,{...window,revision:tracker.revision}]};
            const findings=completedWindows.get(key) ?? await (async()=>{
              if(!useCoaching)return [];
              const observed=localCache.get(hudKey);
              const eligible=await verifyLocalCoachingGroups(frames,scannedReview,
                (at,signal)=>observed.find(row=>Math.abs(row.at-at)<.001) ?? readHud(at,signal),signal);
              if(!eligible.length)return [];
              const supported=await send('performance',eligible,window,signal);
              return supported.flatMap(finding=>{
                const first=eligible.find(frame=>frame.group===finding.group);
                if(!first)return [];
                return [{...finding,group:first.at.toFixed(6),sequenceStart:first.at}];
              });
            })();
            signal.throwIfAborted();
            Object.assign(tracker,scannedReview,{rounds:gameplayRounds(scannedReview.events)});
            completedWindows.set(key,findings);activeFrames.clear();
            return findings;
          }
          if(completedWindows.has(key))return completedWindows.get(key);
          const findings=await analyzeIdentityWindow({frames,section:window,review:tracker,signal,
            captureProbe:(timestamps,signal)=>captureSection(window,run,signal,false,timestamps,activeFrames),
            onEvidence:observations=>identitySetup.scoreboard(observations),send});
          completedWindows.set(key,findings);activeFrames.clear();return findings;
        },
        onProgress:({index,total,section,stage})=>{visionStatus.textContent=(stage==='sampling'?'Sampling':'Analyzing')+' part '+(index+1)+' / '+total+' ('+formatTime(section.start)+' - '+formatTime(section.end)+')';}
      });
      if(disposed || run!==uploadGeneration)return;
      pendingReport={id:tracker.matchId,created:Date.now(),source:runHud&&!useCoaching?'local-hud-scan':'authorized-local-video',file:source,...section,findings:priorFindings||result.findings,coverage:result.coverage,identityReview:tracker,resourceLimits:limits};
      const stored=saveReport(pendingReport);
      if(stored){renderReports();identitySetup.refreshMemory();}
      visionStatus.textContent=result.coverage.complete?(runHud&&!useCoaching?'Local gameplay-state scan finished across the selected video.':'Sampled analysis finished across the selected video. Review each finding against the footage.'):
        (result.paused ? 'Analysis paused after the current part.' : result.error || 'Analysis stopped.')+' Completed '+result.coverage.completedBatches+' / '+result.coverage.totalBatches+' parts.';
      visionStatus.textContent+=stored?' Report saved locally.':' Browser storage could not save this report; export JSON to keep it.';
      reportControls(pendingReport,aiResults,stored);ensureIdentityReview();
    } catch(error) {if(!disposed && run===uploadGeneration)visionStatus.textContent=error.message;}
    finally {activeFrames.clear();if(!disposed && run===uploadGeneration){analyzing=false;pauseRequested=false;video.controls=true;syncVision();ensureIdentityReview();}}
  };

  renderSaved();
  renderReports();
  return () => {
    disposed = true;
    generation++;
    uploadGeneration++;
    stopPolling();
    document.removeEventListener('visibilitychange', syncPolling);
    window.removeEventListener('offline', offline);
    destroyPlayer();
    request?.abort();
    video.pause();
    video.removeAttribute('src');
    video.load();
    frames = [];
    if (blobURL) URL.revokeObjectURL(blobURL);
  };
}
