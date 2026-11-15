import {comparePolicies} from './evaluation.js';
import { graphicsQuality } from './tactical-match/src/core/graphics.js';
import { coachingReport } from './coaching-report.js';
import { compareBenchmarks, runStats } from './benchmark.js';
import { LANES, profileKey, summarizeHabits } from './player-habits.js';
import { mountReview } from './gameplay-review.js';
import { readReviews, readReports } from './review-model.js';
import { STORE, PROFILE, read, lessons, next, sessionURL, findings, metrics, passed, utilityAdvice, utilityEffective, comparableDuel } from './coach-model.js';

const page = document.querySelector('#page');
const percent = x => x == null ? '—' : Math.round(x*100) + '%';
const esc = x => String(x ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
const names = { assessment:'Assessment', training:'Training exercise', reassessment:'Reassessment', practice:'Custom practice' };
const svg = '<svg role="img" aria-label="Harbor schematic: A and B routes connected through middle" viewBox="0 0 300 168"><rect x="14" y="12" width="272" height="141" rx="14" fill="#14272c" stroke="#315458"/><path d="M150 133L150 88 150 30M150 133L56 110V55H245V110L150 133M56 88H245" fill="none" stroke="#487876" stroke-width="3"/><circle fill="#afffd2" cx="150" cy="133" r="6"/><circle fill="#afffd2" cx="150" cy="30" r="6"/><g fill="#ffd49a" font-family="system-ui" font-size="18" font-weight="700"><circle cx="55" cy="55" r="14" fill="#244844"/><circle cx="245" cy="55" r="14" fill="#244844"/><text x="49" y="61">B</text><text x="239" y="61">A</text></g></svg>';
const demos = {
  duelcover:['Reposition behind hard cover after contact','Break contact','<rect x="85" y="40" width="50" height="70" fill="#508d80"/><path d="M65 30L50 125H165" stroke="#abffd0" fill="none" stroke-width="4"/>'],
  peek:['Pre-aim the corner before clearing the lane','Clear the angle','<path d="M83 139V72h88" fill="none" stroke="#508d80" stroke-width="12"/><circle cx="50" cy="109" r="7" fill="#abffd0"/><path d="M52 105L135 58" fill="none" stroke="#abffd0" stroke-width="2" stroke-dasharray="5 4"/><circle cx="139" cy="56" r="7" fill="#ffcf8a"/>'],
  utility:['Aim at an approach and deploy before moving','Screen one angle','<circle cx="125" cy="70" r="32" fill="#53546d"/><circle cx="45" cy="112" r="6" fill="#abffd0"/><path d="M48 109L190 30" stroke="#ffcf8a" stroke-width="2" stroke-dasharray="4 4"/>'],
  movement:['Release movement','Fire from cover','<path d="M30 78H114M96 63l18 15-18 15" stroke="#abffd0" stroke-width="4" fill="none"/><path d="M132 54v50" stroke="#ffcf8a" stroke-width="6"/><circle cx="176" cy="78" r="4" fill="#abffd0"/>'],
  cover:['Break two sightlines into separate fights','Peek one angle','<path d="M52 121L108 58M52 121L186 44" stroke="#ffcf8a" stroke-width="2" stroke-dasharray="5 4"/><rect x="82" y="75" width="68" height="18" rx="3" fill="#508d80"/><circle cx="52" cy="121" r="7" fill="#abffd0"/><g fill="#ffcf8a"><circle cx="108" cy="58" r="7"/><circle cx="186" cy="44" r="7"/></g>'],
  aim:['Keep the crosshair on the head line','Match the guide','<path d="M18 50h184" stroke="#abffd0" stroke-dasharray="5 4"/><circle cx="100" cy="50" r="11" fill="#ffcf8a"/><rect x="82" y="66" width="36" height="44" rx="6" fill="#508d80"/>'],
  objective:['Move from cover to the marked plant area','Use either site','<rect x="113" y="34" width="75" height="77" rx="8" fill="#284843" stroke="#abffd0"/><text x="144" y="80" fill="#ffcf8a" font-size="22" font-family="system-ui">A</text><path d="M24 99h56l32-20" stroke="#abffd0" stroke-width="4" fill="none"/>']
};
let cleanupReview;
let activeHistory = [];
function card(title, copy, extra = '') { return '<article class="card"><h2>'+esc(title)+'</h2><p>'+esc(copy)+'</p>'+extra+'</article>'; }
function button(spec, label) {
  return '<a class="button" href="'+esc(sessionURL({...spec,quality:graphicsQuality(read('clutchup.quality',null),read('clutchup.low',false)?'low':'high')}))+'">'+esc(label)+' →</a>';
}
function head(title, text, kicker='FIELD COACH') { return '<div class="kicker">'+kicker+'</div><h1>'+title+'</h1><p>'+text+'</p>'; }
function weakness(data) {
  const f = findings(data);
  if (f.length) return '<ul>'+f.map(x=>'<li>'+esc(lessons[x.id].title)+': '+percent(x.value)+'</li>').join('')+'</ul>';
  return '<p>No lesson threshold was exceeded in metrics with enough observations.</p>';
}
function utilityReport(data) {
  if (!data.utilityCasts) return '';
  const advice = utilityAdvice(data);
  const entries = data.utilityCasts.map(cast => {
    const target = cast.enemies.length ? cast.enemies.join(', ') : 'none recorded';
    const effect = cast.type === 'dash' ? 'Moved ' + cast.distance + ' m. Clear enemy lines ' + cast.contactBefore + ' → ' + cast.contactAfter + '.'
      : 'Enemy effects: ' + target + '. ' + (cast.allies.length ? 'Allies affected: ' + cast.allies.join(', ') + '. ' : '') +
        (!cast.observed ? 'Effect was still active at round end.' : '');
    return '<li>' + esc(cast.at.toFixed(1) + ' s · ' + cast.name + ' · ' + cast.objective + '. ' + effect) + '</li>';
  });
  return '<h3>Agent utility</h3>' + (entries.length ? '<ul>' + entries.join('') + '</ul>' : '<p>No agent ability was used.</p>') +
    (data.utilityCasts.some(utilityEffective) ? '<p>At least one use had a measured tactical effect.</p>' : '') +
    (advice ? '<p>' + esc(advice) + '</p>' : '');
}

function benchmarkCard(history, key) {
  const { before, after } = compareBenchmarks(history, key);
  const complete = before ? 'Baseline recorded. Practice before replaying the same three trials.' : 'Start with three fixed trials in Harbor. Finish all three to record a baseline.';
  let comparison = '';
  if (before && after) {
    const old = runStats(before), current = runStats(after);
    const stat = (a,b) => a+'/'+b;
    comparison = '<dl><dt>Hits / shots</dt><dd>'+stat(old.hits,old.shots)+' → '+stat(current.hits,current.shots)+'</dd>'+
      '<dt>Low aim samples / observed</dt><dd>'+stat(old.belowHead,old.aimSamples)+' → '+stat(current.belowHead,current.aimSamples)+'</dd>'+
      '<dt>Unready openings / observed</dt><dd>'+stat(old.unreadyPeeks,old.peeks)+' → '+stat(current.unreadyPeeks,current.peeks)+'</dd>'+
      '<dt>Cover resets</dt><dd>'+old.coverResets+' → '+current.coverResets+'</dd><dt>Rounds won</dt><dd>'+old.wins+'/3 → '+current.wins+'/3</dd></dl>'+
      '<p>Same trials, side, pistol, starting positions and bot policy. Combat still has random variation. Treat small differences cautiously.</p>';
  }
  return card('Before and after', complete,
    button({phase:'assessment'},'Run baseline')+' '+(before ? button({phase:'reassessment'},'Run repeat assessment') : '')+comparison);
}

function policyCard(history,key) {
 const result=comparePolicies(history,key);
 const rows=['fixed','adaptive'].map(policy=>{
  const r=result[policy];
  if(!r)return '<p>'+policy+': no recorded comparison rounds.</p>';
  return '<p>'+policy+' - '+r.attempts+' attempts; pre-aimed openings '+r.correctOpenings+'/'+r.peeks+
   '; head-height samples '+Math.max(0,r.aimSamples-r.belowHead-r.aboveHead)+'/'+r.aimSamples+
   '; moving shots '+r.movingShots+'/'+r.shots+'; exposed '+r.exposedSeconds.toFixed(1)+'/'+r.aliveSeconds.toFixed(1)+
   ' s; plants/defuses '+r.plants+'/'+r.defuses+'; prolonged stationary exposures '+r.repeatedExposure+'.</p>';
 }).join('');
 return card('Fixed versus adaptive opponent','Matched Harbor customs starts, controller, pistols, no buying, same reaction delay. Fixed disables historical route/peek choices; both retain reactive combat and abilities.',
  button({phase:'practice',evaluation:'fixed'},'Play fixed comparison')+' '+button({phase:'practice',evaluation:'adaptive'},'Play adaptive comparison')+
  rows+'<p>'+(result.ready?'Descriptive results only; alternate condition order and repeat. These counts do not establish that coaching caused improvement.':'Collect at least two rounds in each condition before comparing.')+
  ' Pre-aimed openings measure orientation at contact, not proof of clearing every angle.</p>');
}

function historyCard(history, key) {
  const stats = summarizeHabits(history,key);
  if (!stats.rounds) return card('Your movement profile','Complete a coached 1v1 to start tracking your route and peek habits.');
  const lane = Object.entries(stats.votes).sort((a,b)=>b[1]-a[1])[0];
  const summary = lane[1] ? LANES[lane[0]]+' was your first committed approach in '+lane[1]+' of '+stats.observed+' recorded approaches.' : 'No qualifying lane crossing yet.';
  const detail = stats.repeat ? '<p>Most repeated peek cell: '+stats.repeat.count+' openings across '+stats.repeat.rounds+' rounds.</p>' : '';
  return card('Your movement profile',summary,detail+'<p>'+stats.unready+' player-opened peeks without pre-aim; '+stats.overexposures+' prolonged stationary exposures across '+stats.rounds+' recent rounds. The opponent adapts only within the same side and lesson.</p>');
}

function report(row, baseline, priorDuel) {
  const d = row.data, m = metrics(d);
  const narrative = coachingReport(row, activeHistory);
  const goal = row.lesson && lessons[row.lesson];
  const stats = { 'Shot accuracy':percent(m.accuracy), 'Head hits / hits':percent(m.headshots), 'Moving or airborne shots':percent(m.moving),
    'Time in ≥2 clear enemy sightlines':d.multiSeconds+' s / '+d.aliveSeconds+' s', 'Crosshair samples outside head height':((d.belowHead||0)+(d.aboveHead||0))+' / '+d.aimSamples,
    ...(row.duel ? {'Angle openings':d.peeks, 'Openings aimed away':d.unreadyPeeks, 'Sightline breaks':d.coverResets} : {}),
    'Eliminations':d.kills,'Damage taken':d.damageTaken,'Plants / defuses':d.plants+' / '+d.defuses,'Grenades thrown':d.utility,'Agent abilities used':d.utilityCasts?.length ?? '—' };
  let compare = '';
  if (!row.benchmark && row.phase === 'reassessment' && baseline) {
    const old = metrics(baseline.data);
    compare = '<p>Baseline → reassessment: accuracy '+percent(old.accuracy)+' → '+percent(m.accuracy)+
      '; moving shots '+percent(old.moving)+' → '+percent(m.moving)+'; multi-angle exposure '+percent(old.exposure)+' → '+percent(m.exposure)+
      '. Bot settings match; match events and opponents’ choices vary.</p>';
  }
  if (priorDuel) {
    const before = metrics(priorDuel.data);
    compare += '<p>Previous comparable 1v1 → this round. Accuracy '+percent(before.accuracy)+' → '+percent(m.accuracy)+
      '; hits '+priorDuel.data.hits+' → '+d.hits+'; practice target '+(passed(row.lesson,priorDuel.data)?'met':'pending')+
      ' → '+(passed(row.lesson,d)?'met':'pending')+'. Bot choices can vary within the same settings.</p>';
  }
  const h = row.habits;
  const movement = h ? '<p>Route: '+esc(h.route.map(lane=>LANES[lane]).join(' → ') || 'No committed approach')+'. Distance: '+h.distance+' m. Movement: '+esc(Object.entries(h.seconds).map(([mode,n])=>mode+' '+n.toFixed(1)+' s').join(', '))+'. Player-opened peeks: '+h.peeks.reduce((sum,cell)=>sum+cell.count,0)+'. Prolonged stationary exposure: '+h.overexposures+'.</p>' : '';
  const utility = utilityReport(d);
  const strengths = Object.entries(lessons).filter(([key])=>!(row.duel && key==='cover') && passed(key,d)).map(([,l])=>l.title);
  return '<details><summary>'+esc(names[row.phase])+(row.duel ? ' · 1v1' : '')+' · Harbor · round '+row.round+' · '+(row.won?'Win':'Loss')+' · '+esc(row.outcome)+'</summary>'+
    '<p>Training objective: '+esc(goal?.goal || 'Play the round and collect a sample of observable actions.')+'</p>'+
    '<dl>'+Object.entries(stats).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>'+
    '<h3>Coaching feedback</h3><p>'+esc(narrative.evidence.join(' '))+'</p><p>What went well: '+esc(narrative.strengths.join(', ') || 'More observations are needed to establish a strength.')+'</p>'+narrative.observations.map(item=>'<p>'+esc(item.text+' '+item.why+' Try: '+item.action+' '+item.training+' Measured target: '+item.measure)+'</p>').join('')+'<p>'+esc(narrative.improvement)+'</p><p>Next: '+esc(narrative.next.explanation)+'</p><h3>What to work on</h3>'+weakness(d)+'<p>Targets met: '+esc(strengths.join(', ') || 'None recorded at the lesson thresholds.')+'</p>'+
    (goal?'<p>Exercise: '+(passed(row.lesson,d)?'target met.':'target not met.')+'</p>':'') +compare+movement+utility+
    '<p>Opponent actions sampled: '+esc(Object.entries(row.botStates || {}).map(([k,v])=>k+' ('+v+')').join(', ') || 'No samples')+'</p>'+
    '<ul>'+(row.adaptations || []).map(a=>'<li>'+a.at.toFixed(1)+' s · '+esc(a.message)+'</li>').join('')+'</ul></details>';
}
function render() {
  cleanupReview?.();
  cleanupReview = null;
  const hash = location.hash.slice(1);
  const route = hash === 'play' ? 'practice' : ['assessment','analysis','training','progress','practice','settings'].includes(hash) ? hash : 'home';
  document.querySelectorAll('nav a').forEach(a => a.hash===('#'+route) ? a.setAttribute('aria-current','page') : a.removeAttribute('aria-current'));
  const activeKey = profileKey(read(PROFILE, {}));
  const all = read(STORE, []).filter(row => (row.playerKey || 'local') === activeKey);
  activeHistory = all;
  const matches = all.filter(r=>r.source==='tactical');
  const assessed = matches.filter(r=>r.evaluated && ['assessment','reassessment'].includes(r.phase));
  const latest = assessed[0];
  const profile = read(PROFILE, {riot:'',path:'beginner'});
  const key = profileKey(profile);
  const rec = next(all.filter(row => !row.playerKey || row.playerKey === key));
  const progress = matches.filter((r)=>r.evaluated && r.phase==='training' && passed(r.lesson,r.data));
  if (route === 'home') {
    page.innerHTML = '<section class="hero"><div>'+head('Train for the next round.','Play live tactical rounds on Harbor. CLUTCHUP measures how you fight and uses those observations to select your next exercise.','CLUTCHUP COACHING')+
      button(rec,matches.length?'Continue training':'Start assessment')+'</div>'+svg+'</section><div class="grid">'+
      card('Player profile', (profile.riot || 'Local player')+' · '+(progress.length ? progress.length+' coaching exercise(s) passed' : 'Foundation level'))+
      card('Recommended next',rec.lesson ? lessons[rec.lesson].title+'. '+rec.explanation : rec.explanation)+
      card('Recent progress',matches.length ? matches.length+' tactical rounds recorded on this device.' : 'Play your first assessment to start building a record.')+
      card('Observed weaknesses',latest?'From the latest assessment round.':'Awaiting your first assessment.',latest?weakness(latest.data):'')+'</div>';
  } else if (route==='assessment') {
    page.innerHTML = head('AI Assessment','The coach reads what happened in a real Harbor round and recommends a lesson. The key measurements are shot timing, head height at the shot and exposure to multiple enemies.')+
      benchmarkCard(matches,key)+
      (latest?'<section class="card"><h2>Latest assessment</h2>'+report(latest,assessed.find(r=>r.phase==='assessment'&&r.created<latest.created))+'</section>':'');
  } else if (route==='training') {
    page.innerHTML = head('Personalized Training','Play the recommendation, see your round report, then repeat the assessment to compare performance.')+
      card(rec.lesson?lessons[rec.lesson].title:names[rec.phase],rec.explanation,button(rec,'Continue training'))+
      '<h2>Beginner Academy</h2><p>Watch a bot demonstrate head height, peeking, angle clearing, cover, and smoke, then face the same bot in a live 1v1.</p><div class="grid">'+
      Object.entries(lessons).filter(([id]) => demos[id]).map(([id, lesson])=>{const d=demos[id];return card(lesson.title,lesson.focus,
        '<svg class="diagram" role="img" aria-label="'+d[0]+'" viewBox="0 0 220 145">'+d[2]+'</svg><p>'+esc(lesson.goal)+'</p>'+
        '<p>'+ (progress.some(r=>r.lesson===id) ? 'Target met in a saved round.' : 'Completion target pending.')+'</p>'+button({phase:'training',lesson:id,duel:id==='peek'},'Practice lesson'));}).join('')+'</div>';
  } else if (route==='progress') {
    page.innerHTML = head('Progress','See the evidence behind each recommendation and compare a reassessment with an earlier baseline.')+
      '<p><button id="export" class="subtle">Export JSON</button></p>'+benchmarkCard(matches,key)+policyCard(matches,key)+historyCard(matches,key)+'<section class="card"><h2>Tactical history</h2>'+
      (matches.length?matches.slice(0,25).map(r=>report(r,assessed.find(x=>x.phase==='assessment'&&x.created<r.created),matches.find(x=>x.created<r.created&&comparableDuel(x,r)))).join(''):'<p>Play a round to see results here.</p>')+'</section>'+
      '<section class="card"><h2>Range practice</h2>'+
      (all.some(r=>r.source==='range')?'<ul>'+all.filter(r=>r.source==='range').slice(0,8).map(r=>'<li>'+esc(r.mode)+' · '+r.data.score+' points · '+r.data.hits+'/'+r.data.shots+' hits/shots</li>').join('')+'</ul>':'<p>No new range sessions yet. Earlier results are available in the original workspace.</p>')+'</section>'+
      card('Recommended next',rec.explanation,button(rec,'Continue training'));
    page.querySelector('#export').onclick = () => {
      const url=URL.createObjectURL(new Blob([JSON.stringify({version:2,sessions:all,videoReviews:readReviews(),videoReports:readReports()},null,2)],{type:'application/json'}));
      const a=document.createElement('a'); a.href=url; a.download='clutchup-progress.json'; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    };
  } else if (route==='practice') {
    page.innerHTML = head('Custom Practice','Choose a side to play solo against one adaptive opponent on Harbor.')+
      '<div class="grid">'+card('Harbor · Defend','Protect A and B, rotate through customs, and defuse if the attackers plant.',button({phase:'practice'},'Play defense'))+
      card('Harbor · Attack','Carry the device through one of the approach lanes. Hold F to plant in either site.',button({phase:'practice',side:'t'},'Play attack'))+'</div>';
  } else if (route==='settings') {
    page.innerHTML = head('Settings','Profile and launch preferences are stored on this device.')+
      '<form class="card"><label>Riot ID (optional local label)<br><input id="riot" maxlength="35" pattern="[^#]+#[^#]+" autocomplete="off" placeholder="Player#TAG" value="'+esc(profile.riot)+'"></label>'+
      '<p>This label is unverified. No Riot account or match history is connected.</p><label>Harbor graphics <select id="quality">'+['low','medium','high'].map(value=>'<option value="'+value+'" '+(value===graphicsQuality(read('clutchup.quality',null),read('clutchup.low',false)?'low':'high')?'selected':'')+'>'+value[0].toUpperCase()+value.slice(1)+'</option>').join('')+'</select></label><p>Applied next launch. Low reduces resolution, shadows and effects; Medium uses reduced shadows without ambient occlusion; High enables full effects.</p>'+
      '<button>Save settings</button><p aria-live="polite" id="saved"></p></form>';
    page.querySelector('form').onsubmit = e => { e.preventDefault(); const status=page.querySelector('#saved'); try {
      localStorage.setItem(PROFILE,JSON.stringify({...profile,riot:page.querySelector('#riot').value.trim()}));
      localStorage.setItem('clutchup.low',JSON.stringify(page.querySelector('#quality').value==='low'));
      localStorage.setItem('clutchup.quality',JSON.stringify(page.querySelector('#quality').value));
      status.textContent='Saved on this device.'; } catch { status.textContent='Browser storage is unavailable.'; } };
  } else {
    cleanupReview = mountReview(page);
  }
}
window.addEventListener('hashchange',render);
render();
