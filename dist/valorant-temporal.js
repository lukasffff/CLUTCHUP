export const GAME_STATES = Object.freeze({
  UNKNOWN:'UNKNOWN', BUY_PHASE:'BUY_PHASE', USER_PLAYING:'USER_PLAYING',
  USER_DEAD:'USER_DEAD', SPECTATING:'SPECTATING', ROUND_ENDED:'ROUND_ENDED'
});
const {UNKNOWN,BUY_PHASE,USER_PLAYING,USER_DEAD,SPECTATING,ROUND_ENDED}=GAME_STATES;
const rows = {UNKNOWN:'unknown',BUY_PHASE:'buy',USER_PLAYING:'user',USER_DEAD:'dead',SPECTATING:'spectator',ROUND_ENDED:'ended'};
const PERIOD = 3;
const MAX_GAP = 3.1;

export function hudSampleTimes({start,end}) {
  const count=Math.ceil((end-start)/PERIOD);
  return Array.from({length:count+1},(_,i)=>Math.min(end-.0001,start+i*PERIOD))
    .filter((at,i,all)=>at>=start&&(i===0||at-all[i-1]>.01));
}

function signature({buy,death,spectating,result,spectatorName}) {
  return JSON.stringify([buy,death,spectating,result,spectatorName||'']);
}

export function transitionTimes(samples) {
  const changes=samples.slice(1).map((current,i)=>({current,previous:samples[i]}))
    .filter(({current,previous})=>current.at-previous.at>.5 && signature(current)!==signature(previous))
    .map(change=>({...change,priority:change.current.result!==change.previous.result&&change.current.result?4:
      change.current.death&&!change.previous.death?3:change.current.buy!==change.previous.buy?2:
      change.current.spectating!==change.previous.spectating?1:0}))
    .sort((a,b)=>b.priority-a.priority);
  return changes.slice(0,3).flatMap(({current,previous})=>[1/3,2/3].map(r=>previous.at+(current.at-previous.at)*r));
}

export async function sampleGameplayWindow(section,read,signal) {
  const sample=async at=>{signal?.throwIfAborted();return read(at,signal);};
  const observations=[];
  for(const at of hudSampleTimes(section)) observations.push(await sample(at));
  for(const at of transitionTimes(observations)) observations.push(await sample(at));
  return observations.sort((a,b)=>a.at-b.at);
}

function discontinuity(previous,sample) {
  if(!previous) return false;
  if(sample.at-previous.at>MAX_GAP || sample.at<=previous.at) return true;
  if(Number.isFinite(previous.score) && Number.isFinite(sample.score) &&
     (sample.score<previous.score || sample.score>previous.score+1)) return true;
  if(!sample.buy && !previous.buy && !sample.result && !previous.result &&
      Number.isFinite(previous.clockSeconds) && Number.isFinite(sample.clockSeconds)) {
    const elapsed=sample.at-previous.at;
    return sample.clockSeconds>previous.clockSeconds+5 ||
      previous.clockSeconds-sample.clockSeconds>elapsed+5;
  }
  return false;
}

// Life, camera and round result are independent. Only consecutive positive
// samples establish an interval of a supported perspective.
export function gameplayRounds(events) {
  const rounds=new Map();
  for(const event of events) {
    if(!['round_start','round_end','round_boundary_inferred'].includes(event.type))continue;
    if(!rounds.has(event.roundId))rounds.set(event.roundId,{id:event.roundId,number:event.round,start:null,end:null});
    const round=rounds.get(event.roundId);
    if(event.type==='round_start')round.start=event.at;
    else Object.assign(round,{end:event.at,outcome:event.result||null,life:event.life,
      spectating:event.spectating??null,spectatorName:event.visibleName||'',inferredEnd:event.type==='round_boundary_inferred'});
  }
  return [...rounds.values()];
}

export function reduceGameplay(previousState,observations,identity,{start,end}) {
  const state=previousState ? structuredClone(previousState) : {
    phase:UNKNOWN, last:null, lastPhase:UNKNOWN, roundNumber:null, serial:0, life:'unknown',
    ended:false, anchored:false, inBuy:false, activeSeen:false, spectatorName:'', pendingName:'', roundStart:null
  };
  const events=[], automatic=[];
  const displayName=identity?.confirmed?identity.displayName:'';
  for(const sample of observations) {
    if(!Number.isFinite(sample.at)||sample.at<start||sample.at>end||(state.last&&sample.at<=state.last.at)) continue;
    const previous=state.last;
    const event=(type,details={})=>{
      const earliest=previous&&sample.at-previous.at<=MAX_GAP?previous.at:null;
      events.push({type,at:sample.at,earliest,round:state.roundNumber,roundId:state.serial,
        confidence:'high',source:'local-hud',life:state.life,...details});
    };
    const cut=discontinuity(previous,sample);
    if(cut) {
      if(!previous?.buy || sample.clockSeconds===null || sample.clockSeconds<65)state.anchored=false;
      state.lastPhase=UNKNOWN;
      if(previous) event('hud_discontinuity',{confidence:'uncertain',evidence:'Round clock, score, or sampling continuity changed.'});
    }
    const scoreAdvanced=Number.isFinite(previous?.score)&&Number.isFinite(sample.score)&&sample.score===previous.score+1;
    if(scoreAdvanced && !sample.result && !sample.buy) {
      state.anchored=false;
      state.lastPhase=UNKNOWN;
    }
    const cleanBuy=sample.buy&&!sample.spectating&&!sample.result;
    const elapsed=state.roundStart===null?Infinity:sample.at-state.roundStart;
    const higherRound=sample.round && state.roundNumber && sample.round>state.roundNumber;
    const sameRound=sample.round && state.roundNumber && sample.round<=state.roundNumber;
    const newRound=cleanBuy && (sample.shop||sample.round||previous?.buy) && (!sample.death||sample.shop) &&
      (!state.serial ||
        (!sameRound && ((higherRound && (elapsed>=20 || state.ended)) || ((!state.inBuy || elapsed>=75) && elapsed>=33 &&
          (state.ended||scoreAdvanced||(sample.shop&&(state.activeSeen||state.life==='dead')))))));
    if(newRound) {
      if(state.serial&&!state.ended)event('round_boundary_inferred',{confidence:'inferred',evidence:'A new buy phase establishes that the prior round ended.'});
      state.serial++;
      state.roundStart=sample.at;
      state.roundNumber=sample.round||null;
      state.life='unknown';
      state.ended=false;
      state.spectatorName='';
      state.pendingName='';
      state.activeSeen=false;
      state.anchored=false;
      event('round_start',{evidence:'Centered BUY PHASE banner.'});
    }
    if(cleanBuy&&!state.ended && state.life!=='dead') {
      state.inBuy=true;
      if(sample.shop && displayName)state.anchored=true;
    } else if (!sample.buy && (sample.result||sample.spectating||
      (sample.playerHud&&!sample.scoreboard&&(elapsed>=25||sample.clockSeconds>=65)))) {
      state.inBuy=false;
    }
    const actionableDeath=sample.death && !cleanBuy && !sample.scoreboard &&
      (!sample.playerHud||sample.spectating) && (state.activeSeen||sample.spectating||elapsed>=32);
    if(actionableDeath && state.life!=='dead') {
      state.life='dead';
      state.anchored=false;
      event('death',{evidence:'Right-side combat report identifies a killing blow.'});
    }
    if(sample.spectating) {
      state.anchored=false;
      const name=sample.spectatorName;
      if(!previous?.spectating) {
        event('spectator_view',{visibleName:name,evidence:'Bottom-left SWITCH PLAYER control.'});
        state.spectatorName=name||'';
      } else if(name && name===state.pendingName && name!==state.spectatorName) {
        if(state.spectatorName)event('spectator_switch',{visibleName:name,evidence:'Two nearby samples show the new spectator name.'});
        state.spectatorName=name;
      }
      state.pendingName=name||'';
    }
    if(sample.result && !state.ended) {
      state.ended=true;
      const life=state.life==='dead'?'dead':state.anchored&&sample.playerHud&&!sample.spectating?'alive':'unknown';
      event('round_end',{result:sample.result,visibleName:sample.spectatorName,life,lastKnownLife:state.life,
        spectating:sample.spectating,evidence:sample.result.toUpperCase()+(sample.reason?' · '+sample.reason:'')});
    }
    let phase=UNKNOWN;
    if(state.ended)phase=ROUND_ENDED;
    else if(cleanBuy)phase=BUY_PHASE;
    else if(sample.spectating)phase=SPECTATING;
    else if(state.life==='dead')phase=USER_DEAD;
    else if(!cut && !scoreAdvanced && state.anchored && !state.inBuy && sample.playerHud && !sample.death && !sample.scoreboard)phase=USER_PLAYING;
    if(phase===USER_PLAYING) {
      state.activeSeen=true;
      if(state.lastPhase===USER_PLAYING)state.life='alive';
    }
    if(previous && !cut && phase!==UNKNOWN && phase===state.lastPhase) {
      const visibleName=phase===USER_PLAYING?displayName:state.spectatorName;
      const evidence={
        USER_PLAYING:'Local purchase prompt anchored this round. Nearby samples show the active player HUD.',
        SPECTATING:'Nearby samples show spectator controls.',
        USER_DEAD:'The combat report established death in this round.',
        BUY_PHASE:'Nearby samples show the buy phase.',
        ROUND_ENDED:'A centered round result was observed. Waiting for a new buy phase.'
      }[phase];
      automatic.push({id:'hud:'+previous.at+':'+sample.at,start:previous.at,end:sample.at,state:rows[phase],
        gameplayState:phase,visibleName,confidence:'high',source:'local-hud',evidence});
    }
    state.lastPhase=phase;
    state.phase=phase;
    state.last=sample;
  }
  return {state,events,automatic};
}
