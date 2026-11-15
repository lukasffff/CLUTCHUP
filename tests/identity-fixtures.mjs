// Synthetic, manually authored HUD-extraction outputs, NOT real image labels.
export const identity={riotName:'Example',tagline:'TEST',displayName:'Example',confirmed:true};
const own={mode:'self',visibleName:'Example',confidence:'high',ambiguous:false,signals:['self_identity','first_person_hud'],evidence:'Explicit own-player cue and readable name.',scoreboardNames:[]};
const spectator={mode:'spectator',visibleName:'Teammate',confidence:'high',ambiguous:false,signals:['spectator_hud','switch_prompt'],evidence:'Readable teammate name and spectator controls.',scoreboardNames:[]};
const f=(name,expected,base,patch={})=>({name,expected,observation:{...base,...patch}});
export const fixtures=[
 f('normal own first person','user',own),
 f('return to own perspective with explicit cue','user',own,{signals:[...own.signals,'own_perspective_return']}),
 f('own perspective with unreadable name','user',own,{visibleName:'',signals:['first_person_hud','unreadable_name']}),
 f('death overlay','unknown',own,{signals:[...own.signals,'death']}),
 f('spectating named teammate','spectator',spectator),
 f('switching between teammates','unknown',spectator,{signals:[...spectator.signals,'camera_change']}),
 f('next round transition with own player','user',own,{signals:[...own.signals,'round_start']}),
 f('spectator HUD disappears','spectator',spectator,{signals:['missing_hud']}),
 f('scoreboard opens','unknown',own,{signals:['scoreboard'],scoreboardNames:['Example','Teammate']}),
 f('video cut','unknown',own,{signals:[...own.signals,'camera_change']}),
 f('ambiguous duplicate names','unknown',own,{ambiguous:true}),
 f('missing HUD','unknown',own,{signals:['missing_hud']}),
 f('unreadable spectator name','spectator',spectator,{visibleName:'',signals:['spectator_hud','unreadable_name']}),
 f('conflicting own and spectator labels','unknown',own,{signals:[...own.signals,'spectator_hud']}),
 f('kill feed name only','unknown',own,{signals:[]}),
 f('low confidence own name','user',own,{confidence:'low'}),
 f('spectator name lacks spectator controls','spectator',spectator,{signals:['first_person_hud']}),
 f('different player in first person without spectator proof','unknown',own,{visibleName:'Teammate'}),
 f('round ends','unknown',own,{signals:[...own.signals,'round_end']}),
 f('selected name inside spectator HUD','unknown',spectator,{visibleName:'Example'})
];
