import {readPlayerIdentity,savePlayerIdentity,deletePlayerIdentity,correctIdentity,identityTimeline,identityMemory} from './player-identity.js';
import {formatTime,parseTime,readReports,removeSaved,REPORTS,drillFor} from './review-model.js';

const node=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
const button=(text,click)=>{const n=node('button',text);n.type='button';n.onclick=click;return n;};
const labels={user:'User gameplay',spectator:'Spectating',unknown:'Unknown',excluded:'Excluded'};

export function renderIdentityTimeline(review,target,{change=()=>{},jump=()=>{},canJump=false}={}) {
 target.replaceChildren(node('h3','Player identity timeline'));
 target.append(node('p','Selected player: '+review.identity.displayName+'. Automatic evidence covers only sampled sequences. Unknown gaps require your confirmation. Manual labels remain separate from AI evidence.'));
 const timeline=identityTimeline(review),summary=node('p');
 summary.textContent=Object.entries(labels).map(([state,label])=>label+': '+formatTime(timeline.filter(r=>r.state===state).reduce((sum,r)=>sum+r.end-r.start,0))).join(' · ')+' · Manual corrections: '+review.corrections.length;
 target.append(summary);
 const list=node('div');list.className='identity-timeline';
 for(const interval of timeline) {
  const detail=node('details'),heading=node('summary',formatTime(interval.start)+' – '+formatTime(interval.end)+' · '+labels[interval.state]+' · '+interval.confidence+' · '+interval.source);
  detail.dataset.identityState=interval.state;
  const jumpButton=button('Jump to '+formatTime(interval.start),()=>jump(interval.start));jumpButton.disabled=!canJump;
  detail.append(heading,node('p',interval.evidence),node('p',interval.visibleName?'Visible player: '+interval.visibleName:'No readable perspective name.'),jumpButton,
   button('Edit this range',()=>{form.elements.start.value=String(interval.start);form.elements.end.value=String(interval.end);form.elements.state.value=interval.state;form.elements.evidence.focus();}));
  list.append(detail);
 }
 target.append(list);
 const form=node('form');form.className='identity-correction';
 form.innerHTML='<h4>Correct classification or boundaries</h4><div class="review-row"><label>Start <input name="start" required></label><label>End <input name="end" required></label><label>Classification <select name="state"><option value="user">User gameplay</option><option value="spectator">Spectating</option><option value="unknown">Unknown</option><option value="excluded">Excluded</option></select></label></div><label>Evidence you checked in playback <textarea name="evidence" required maxlength="1000"></textarea></label><button type="submit">Save manual correction</button>';
 const status=node('p');status.setAttribute('role','status');
 form.elements.start.value=String(review.start);form.elements.end.value=String(review.end);
 form.onsubmit=event=>{event.preventDefault();try{correctIdentity(review,{start:parseTime(form.elements.start.value),end:parseTime(form.elements.end.value),state:form.elements.state.value,evidence:form.elements.evidence.value});change();}catch(error){status.textContent=error.message;}};
 target.append(form,status);
 const events=node('details');events.append(node('summary','Observed transitions ('+review.events.length+')'));
 for(const event of review.events)events.append(node('p',formatTime(event.at)+' · '+event.type+' · '+event.confidence+' · '+event.evidence));
 target.append(events);
}

export function mountIdentitySetup(target,{change=()=>{},forget=()=>{},resourceChange=()=>{}}={}) {
 target.innerHTML='<h2>Your player identity</h2><p>Riot ID, selected name and video metadata stay under this local profile. No Riot API is required. Readable scoreboard names can fill the display name; confirm the selection yourself.</p><form data-identity-setup><div class="review-row"><label>Riot name <input name="riotName" maxlength="64" required></label><label>Tagline <input name="tagline" maxlength="16" required></label><label>In-game display name <input name="displayName" maxlength="64" required></label></div><label><input name="confirmed" type="checkbox" required> I confirm this is my in-game identity.</label><button type="submit">Save identity</button></form><p data-identity-status role="status"></p><div data-scoreboard-names></div><details><summary>Video resource settings</summary><label>Maximum selected file size in GB (0 = browser limit) <input data-max-gb type="number" min="0" step="0.1" value="0"></label><label>Processing window <select data-window><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="90" selected>90 seconds</option></select></label><label>Maximum frame edge <select data-edge><option value="480">480 px</option><option value="720" selected>720 px</option><option value="1080">1080 px</option><option value="1440">1440 px</option></select></label><p>At most 24 JPEG samples per window: 16 periodic frames plus up to two four-frame transition probes. Large frames are compressed to the request limit. Smaller windows increase provider calls.</p></details><div data-identity-memory></div>';
 const form=target.querySelector('form'),status=target.querySelector('[data-identity-status]');
 let identity=readPlayerIdentity();
 function fill(){for(const name of ['riotName','tagline','displayName'])form.elements[name].value=identity?.[name]||'';form.elements.confirmed.checked=!!identity?.confirmed;}
 function memory(){const box=target.querySelector('[data-identity-memory]');box.replaceChildren();if(!identity)return;const m=identityMemory(readReports(),identity);box.append(node('h3','Supported player history'),node('p',m.matches+' saved match records for this identity. '+m.comparison));for(const match of m.history){const topics=[...new Set(match.observations.map(o=>o.topic))];box.append(node('p','Match '+match.matchId.slice(0,8)+': '+match.observations.length+' supported observations'+(topics.length?' ('+topics.join(', ')+')':'')+'. Counts reflect sampled evidence, not a performance score.'));}for(const weakness of m.weaknesses){box.append(node('p',weakness.topic+': '+weakness.evidence.length+' supported sequences across at least two recordings.'));for(const evidence of weakness.evidence)box.append(node('p',evidence.matchId.slice(0,8)+' · '+formatTime(evidence.at)+' · '+evidence.evidence));const drill=drillFor({topic:weakness.topic,at:weakness.evidence[0].at,evidence:weakness.evidence[0].evidence});if(drill)box.append(node('p','Recommended practice: '+weakness.topic+'. Open a supported report below to launch its Harbor lesson.'));}}
 form.onsubmit=event=>{event.preventDefault();try{identity=savePlayerIdentity({riotName:form.elements.riotName.value,tagline:form.elements.tagline.value,displayName:form.elements.displayName.value,confirmed:form.elements.confirmed.checked});status.textContent='Identity saved locally. Perspective still needs evidence in each sampled sequence.';memory();change(identity);}catch(error){status.textContent=error.message;}};
 target.append(button('Delete identity and its analysis history',()=>{if(!window.confirm('Delete this local profile’s identity and all its video-analysis history? Other profiles and training progress are kept.'))return;const reports=readReports();let ok=true;for(const report of reports)ok=removeSaved(report.id,REPORTS)&&ok;ok=deletePlayerIdentity()&&ok;identity=null;fill();memory();forget();change(null);status.textContent=ok?'Local identity history deleted.':'Some records could not be deleted; check browser storage.';}));
 fill();memory();
 for(const selector of ['[data-max-gb]','[data-window]','[data-edge]'])target.querySelector(selector).onchange=resourceChange;
 return {getIdentity:()=>identity,refreshMemory:memory,resources:()=>{const maxGB=Number(target.querySelector('[data-max-gb]').value);if(!Number.isFinite(maxGB)||maxGB<0)throw Error('Enter a nonnegative file-size limit.');return {maxGB,windowSeconds:Number(target.querySelector('[data-window]').value),edge:Number(target.querySelector('[data-edge]').value)};},scoreboard(observations){const box=target.querySelector('[data-scoreboard-names]'),names=[...new Set(observations.flatMap(o=>o.scoreboardNames||[]))];for(const name of names){if([...box.querySelectorAll('button')].some(b=>b.textContent===name))continue;box.append(button(name,()=>{form.elements.displayName.value=name;form.elements.confirmed.checked=false;status.textContent='Scoreboard selection is unconfirmed. Check Riot identity and save to use this name.';}));}},clearScoreboard(){target.querySelector('[data-scoreboard-names]').replaceChildren();}};
}
