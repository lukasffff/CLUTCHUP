export const HUD_ATLAS = { width: 1192, height: 698 };
// Source fractions accommodate the letterboxed screenshot references and
// ordinary 16:9 captures. Destination tiles keep small HUD text legible.
export const HUD_REGIONS = {
  banner: { source: [.34,.123,.32,.25], tile: [0,0,570,240] },
  report: { source: [.782,.277,.211,.585], tile: [650,0,540,696] },
  spectator: { source: [0,.755,.195,.20], tile: [0,246,397,228] },
  shop: { source: [.44,.181,.123,.172], tile: [403,246,241,228] },
  health: { source: [.286,.901,.086,.098], tile: [0,481,165,216] },
  player: { source: [.368,.913,.235,.086], tile: [169,481,310,92] },
  scoreboard: { source: [.28,.27,.44,.412], tile: [171,575,308,120] },
  clock: { source: [.472,.007,.056,.126], tile: [485,481,160,216] }
};

export function drawHudAtlas(image, canvas, width, height) {
  const {width: atlasWidth,height: atlasHeight}=HUD_ATLAS;
  canvas.width=atlasWidth;
  canvas.height=atlasHeight;
  const context=canvas.getContext('2d');
  if(!context) throw Error('The browser could not allocate a HUD sampling canvas.');
  for(const { source:[x,y,w,h], tile:[tx,ty,tw,th] } of Object.values(HUD_REGIONS)) {
    const scale=Math.min(tw/(w*width),th/(h*height));
    context.drawImage(image,x*width,y*height,w*width,h*height,tx,ty,w*width*scale,h*height*scale);
  }
}

// Charge bars form short horizontal teal runs separated by dark gaps. Search
// the entire ability crop vertically so minor scaling shifts stay tolerated.
export function hasAbilityBars({data,width,height}) {
  let matchingRows=0;
  for(let y=0;y<height;y++) {
    const runs=[];
    let start=-1;
    for(let x=0;x<=width;x++) {
      const i=(y*width+x)*4;
      const [r,g,b]=[data[i],data[i+1],data[i+2]];
      const teal=x<width && g>=145 && b>=114 && g-r>32 && g>=b-8 && g-b<105;
      if(teal && start<0)start=x;
      if(!teal && start>=0) {
        const length=x-start;
        if(length>=width*.07 && length<=width*.22)runs.push([start,x]);
        start=-1;
      }
    }
    const aligned=runs.some(([left],i)=>i>0 && left-runs[i-1][0]>=width*.17 && left-runs[i-1][0]<=width*.41);
    matchingRows=aligned?matchingRows+1:0;
    if(matchingRows>=3)return true;
  }
  return false;
}

// The active HUD retains aligned ability glyphs after charges are spent.
export function hasAbilityIcons({data,width,height}) {
  const centers=[.187,.434,.683,.934];
  let hits=0,gaps=0;
  const highlighted=(center,radius)=>{
    let pixels=0;
    for(let y=0;y<height*.5;y++) {
      for(let x=Math.floor(width*(center-radius));x<width*(center+radius);x++) {
        const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
        if(Math.min(r,g,b)>=199 && Math.max(r,g,b)-Math.min(r,g,b)<39)pixels++;
      }
    }
    return pixels;
  };
  for(const center of centers)if(highlighted(center,.045)>=32)hits++;
  for(const center of [.31,.56,.81])if(highlighted(center,.045)>=24)gaps++;
  return hits>=3 && gaps===0;
}

// Scoreboard overlays put the two team colors in broad stacked rows.
export function hasScoreboardRows({data,width,height}) {
  let tealRows=0,redRows=0,firstRed=height,lastTeal=-1;
  for(let y=0;y<height;y++) {
    let teal=0,red=0;
    for(let x=Math.floor(width*.16);x<width*.84;x++) {
      const i=(y*width+x)*4;
      const r=data[i],g=data[i+1],b=data[i+2];
      if(g-r>=25 && b-r>=11 && g>55)teal++;
      if(r-g>=25 && r-b>=21 && r>80)red++;
    }
    if(teal>width*.43){tealRows++;lastTeal=y;}
    if(red>width*.43){redRows++;firstRed=Math.min(firstRed,y);}
  }
  return tealRows>=7 && redRows>=7 && firstRed>=lastTeal-5;
}

export function hudObservation(words, at, abilityBars=false, scoreboardRows=false) {
  function tileWords(name) {
    const [x,y,w,h]=HUD_REGIONS[name].tile;
    return words.filter(word=>word.x>=x && word.x<x+w && word.y>=y && word.y<y+h);
  }
  const normalized=word=>word.text.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}:]/gu,'');
  const text=items=>items.map(normalized).join(' ');
  const bannerWords=tileWords('banner'), banner=text(bannerWords);
  // Result headlines are substantially larger than supporting text and map signs.
  const resultWords=bannerWords.filter(word=>word.height>=27 && word.x>145 && word.x<395);
  const won=resultWords.some(word=>normalized(word)==='WON');
  const lost=resultWords.some(word=>normalized(word)==='LOST');
  const result=won===lost?null:won?'won':'lost';
  const reason=banner.match(/\b(TEAM ELIMINATED|SPIKE DEFUSED|SPIKE DETONATED|TIME EXPIRED|FLAWLESS|THRIFTY)\b/)?.[0]||'';
  const buy=/\bBUY\s*PHASE\b/.test(banner);
  const shopText=text(tileWords('shop'));
  const shop=buy && [banner,shopText].some(row=>/\bPRESS\s+(?:\w\s+)?TO\s+BUY\b/.test(row));
  const round=buy?Number(banner.match(/\bR[O0]UND\s*(\d{1,2}|I)\b/)?.[1]?.replace('I','1'))||null:null;
  const report=text(tileWords('report'));
  const death=/\bCOMBAT\s*REPORT\b/.test(report) && /\bKILLED\s*(?:BY|YOU)\b/.test(report);
  const left=tileWords('spectator');
  const switching=left.find((word,i)=>normalized(word)==='SWITCH' && normalized(left[i+1]||{text:''})==='PLAYER');
  const nameWords=switching?left.filter(word=>word.height>=switching.height && word.y+word.height<switching.y+2 &&
    word.y+word.height>switching.y-43 && word.x>=switching.x-65 && word.x<switching.x+165):[];
  const spectatorName=nameWords.map(word=>word.text).join(' ').slice(0,64);
  const clock=text(tileWords('clock'));
  const timer=clock.match(/\b(\d)\s*:\s*(\d{2})\b/);
  const clockSeconds=timer&&+timer[2]<60?+timer[1]*60+ +timer[2]:null;
  const score=timer?clock.match(/\b(\d{1,2})\s+\d:\d{2}\s+(\d{1,2})\b/)?.slice(1).map(Number):null;
  const player=tileWords('player');
  const health=tileWords('health').some(word=>word.height>=18 && /^(?:100|[1-9]\d?)$/.test(normalized(word).replace(/[IL]/g,'1').replace(/O/g,'0')));
  const keys=new Set(player.map(normalized).filter(word=>/^[CQEX]$/.test(word)));
  return {at,buy,shop,round,result,reason,death,spectating:!!switching,spectatorName,clockSeconds,
    score:score?score[0]+score[1]:null,playerHud:health&&(abilityBars||keys.size>=2||Number.isFinite(clockSeconds)),
    scoreboard:scoreboardRows || /\b(?:ULTIMATE|CREDITS|LOADOUT)\b/.test(banner) && /\b(?:KDA|PING|CREDITS|ULTIMATE)\b/.test(banner)};
}
