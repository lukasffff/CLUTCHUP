import { profileKey } from './player-habits.js';
export const REVIEWS = 'clutchup.video-reviews.v1';
export const REPORTS = 'clutchup.video-reports.v1';
export const MAX_SECTION = 90;

export const TOPICS = Object.freeze({
  aim: 'Low crosshair placement',
  peek: 'Poor peeking or angle clearing',
  cover: 'Positioning or exposure',
  utility: 'Utility timing',
  movement: 'Movement and shooting',
  sense: 'Game sense and objective decisions',
  economy: 'Economy',
  teamwork: 'Teamwork'
});

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);

export function parseYouTubeLink(text) {
  const trimmed = text.trim();
  let url;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : 'https://' + trimmed); }
  catch { throw Error('Enter a valid YouTube link.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw Error('Enter a valid YouTube link without a username, password or port.');
  }
  const host = url.hostname;
  if (host !== 'youtu.be' && !youtubeHosts.has(host)) throw Error('Enter a link from youtube.com or youtu.be.');
  const path = url.pathname;
  let id;
  if (host === 'youtu.be') id = /^\/([^/]+)\/?$/.exec(path)?.[1];
  else if (path === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
  else id = /^\/(?:shorts|live)\/([^/]+)\/?$/.exec(path)?.[1];
  if (id == null) throw Error('Use a YouTube watch, short link, Shorts or live video URL.');
  if (!VIDEO_ID.test(id)) throw Error('This link does not contain a valid 11-character YouTube video ID.');
  const when = url.searchParams.get('t') ?? url.searchParams.get('start') ?? new URLSearchParams(url.hash.slice(1)).get('t');
  return { id, url: 'https://www.youtube.com/watch?v=' + id, sourceURL: url.href, startAt: parseLinkTime(when) };
}

function parseLinkTime(value) {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number.isSafeInteger(+value) ? +value : null;
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
  if (!parts) return null;
  const seconds = Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

export const formatTime = seconds => {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const rounded = Math.round(seconds * 10) / 10;
  const minutes = Math.floor(rounded / 60);
  return minutes + ':' + (rounded % 60).toFixed(1).padStart(4, '0');
};

export function parseTime(value) {
  const text = String(value).trim();
  if (/^\d+(?:\.\d{1,3})?$/.test(text)) return Number(text);
  if (!/^\d+:[0-5]\d(?:\.[0-9]{1,3})?$/.test(text)) return NaN;
  const [minutes, seconds] = text.split(':').map(Number);
  return 60 * minutes + seconds;
}

export function validVideoSection(start, end, duration) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw Error('Enter a start and a later end in seconds or m:ss.');
  }
  if (!Number.isFinite(duration) || end > duration + 1e-7) throw Error('Both timestamps must fit within the available video.');
  return { start, end };
}

export function validSection(start,end,duration) {
  const section=validVideoSection(start,end,duration);
  if(end-start>MAX_SECTION+1e-7)throw Error('Select a section of 90 seconds or less.');
  return section;
}

export function youtubeError(code) {
  return ({
    2: 'YouTube rejected this video ID.',
    5: 'YouTube could not play this video in your browser.',
    100: 'This video is unavailable. It may be private or deleted.',
    101: 'The video owner disabled embedded playback.',
    150: 'The video owner disabled embedded playback.',
    153: 'YouTube could not identify the embed. Open CLUTCHUP through its local server in a browser that allows the referrer.'
  })[code] || 'YouTube reported a playback error. Try again or open the video on YouTube.';
}

export function drillFor(observation) {
  if (!Object.hasOwn(TOPICS, observation?.topic)) return null;
  if (!Number.isFinite(observation.at) || observation.at < 0 || !observation.evidence?.trim()) return null;
  if (observation.strength || ['sense', 'economy', 'teamwork'].includes(observation.topic)) return null;
  const lesson = observation.topic === 'cover' ? 'duelcover' : observation.topic;
  return { phase: 'training', lesson, duel: true, site: lesson === 'aim' ? 'A' : ['peek','movement'].includes(lesson) ? undefined : 'B' };
}

export const CLIP_FRAMES = 16;

export function reviewTimestamps(duration, start = 0) {
  if (!(Number.isFinite(duration) && duration > 0)) return [];
  const step = Math.min(.55, duration / 18);
  return [.15, .38, .62, .85].flatMap((fraction, group) =>
    [-1.5, -.5, .5, 1.5].map(offset => ({ at: start + duration * fraction + offset * step, group })));
}

export function validateClip(file) {
  if (!Number.isSafeInteger(file?.size) || file.size <= 0) throw Error('Choose a nonempty video file.');
  if (!/\.(mp4|webm|mov)$/i.test(file.name) || (file.type && !file.type.startsWith('video/'))) {
    throw Error('Choose an MP4, WebM, or MOV video.');
  }
}

export function removeSaved(id, key = REVIEWS, storage) {
  try {
    const target = storage ?? localStorage;
    const active = reviewProfile(target);
    const all = readAllItems(key,target);
    target.setItem(key, JSON.stringify(all.filter(item => item.id !== id || (item.playerKey || 'local') !== active)));
    return true;
  } catch { return false; }
}

export function updateNote(notes, index, finding, section) {
  if (index !== null && !notes[index]) throw Error('Choose an existing observation to change.');
  if (!finding) return notes.filter((_, i) => i !== index);
  if (!Object.hasOwn(TOPICS, finding.topic) || !finding.evidence.trim()) throw Error('Choose a topic and describe what you saw.');
  if (!Number.isFinite(finding.at) || finding.at < section.start || finding.at > section.end) {
    throw Error('The observation timestamp must be within the selected section.');
  }
  const note = { at: finding.at, topic: finding.topic, evidence: finding.evidence.trim().slice(0, 1200), source: 'manual' };
  return index === null ? [...notes, note] : notes.map((old, i) => i === index ? note : old);
}

export const readReviews = storage => readItems(REVIEWS, storage);
export const readReports = storage => readItems(REPORTS, storage);
export const saveReview = (review, storage) => saveItem(REVIEWS, review, storage);
export const saveReport = (report, storage) => saveItem(REPORTS, report, storage);

function reviewProfile(storage) {
  try { return profileKey(JSON.parse((storage ?? localStorage).getItem('clutchup.profile'))); }
  catch { return 'local'; }
}
function readItems(key, storage) {
  const active = reviewProfile(storage);
  return readAllItems(key,storage).filter(item => (item.playerKey || 'local') === active);
}
function readAllItems(key, storage) {
  try {
    const data = JSON.parse((storage ?? localStorage).getItem(key));
    return Array.isArray(data) ? data.filter(item => item && typeof item === 'object') : [];
  } catch { return []; }
}

function saveItem(key, item, storage) {
  try {
    const target = storage ?? localStorage;
    const active = reviewProfile(target);
    const data = readAllItems(key, target);
    const own = data.filter(prior => (prior.playerKey || 'local') === active && prior.id !== item.id);
    const other = data.filter(prior => (prior.playerKey || 'local') !== active);
    target.setItem(key, JSON.stringify([{...item,playerKey:active}, ...own].slice(0,30).concat(other)));
    return true;
  } catch { return false; }
}
