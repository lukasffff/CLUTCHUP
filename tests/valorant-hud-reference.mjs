// Local labeled images are supplied on disk. No fixture pixels are committed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {readFileSync} from 'node:fs';
import {identityTimeline} from '../dist/player-identity.js';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { HUD_ATLAS, HUD_REGIONS, hudObservation } from '../dist/valorant-hud.js';
import worker from '../hud-ocr.cjs';

const [screenshots, footage, browserReport] = process.argv.slice(2);
if (!screenshots) throw Error('Provide the screenshot directory, and optionally a directory of labeled footage frames.');
const references = [
  ['095135', {death:true,spectating:false,buy:false,result:null}],
  ['095056', {death:false,spectating:false,buy:true,result:null}],
  ['095303', {death:true,spectating:true,buy:false,result:'lost',spectatorName:'BigChase'}],
  ['095234', {death:true,spectating:true,buy:false,result:'won',spectatorName:'NolimitGabe'}]
].map(([id,expected])=>[resolve(screenshots,'Screenshot 2026-11-15 '+id+'.png'),expected]);
const footageLabels = [
  [25,{buy:false,death:false,spectating:false,result:null}],
  [40,{buy:false,death:false,spectating:false,result:null}],
  [75,{buy:false,death:false,spectating:false,result:null}],
  [100,{buy:true,spectating:false}],
  [120,{buy:false,spectating:false,result:null}],
  [140,{buy:false,spectating:false,result:null}],
  [160,{death:true,spectating:true}],
  [180,{death:true,spectating:true}],
  [220,{buy:true,spectating:false}],
  [240,{buy:false,spectating:false,result:null}],
  [260,{buy:false,spectating:false,result:null}],
  [300,{buy:false,spectating:false,result:null}],
  [400,{death:true,result:'lost'}],
  [1000,{death:false,spectating:false,result:'won'}],
  [1400,{buy:true,spectating:false}],
  [1600,{death:true,spectating:true}]
];
const fixtures=footage?[...references,...footageLabels.map(([at,expected])=>[resolve(footage,'frame-'+at+'.png'),expected])]:references;
const cropScript=String.raw`
Add-Type -AssemblyName System.Drawing
$inputData = [Console]::ReadLine() | ConvertFrom-Json
$img = [Drawing.Image]::FromFile($inputData.file)
$atlas = [Drawing.Bitmap]::new($inputData.atlas.width,$inputData.atlas.height)
$graphics = [Drawing.Graphics]::FromImage($atlas)
$graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
foreach ($reg in $inputData.regions) {
    $x,$y,$w,$h=$reg.source
    $tx,$ty,$tw,$th=$reg.tile
    $r=[Drawing.RectangleF]::new(($x*$img.Width),($y*$img.Height),($w*$img.Width),($h*$img.Height))
    $scale=[Math]::Min($tw/$r.Width,$th/$r.Height)
    $d=[Drawing.RectangleF]::new($tx,$ty,($r.Width*$scale),($r.Height*$scale))
    $graphics.DrawImage($img,$d,$r,[Drawing.GraphicsUnit]::Pixel)
}
$stream=[IO.MemoryStream]::new()
$atlas.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
[Console]::WriteLine([Convert]::ToBase64String($stream.ToArray()))
`;
const encoded=Buffer.from(cropScript,'utf16le').toString('base64');
const read=worker.makeReader();
let count=0, exact=0, ocrMs=0;
const errors=[];
try {
  for(const [file,expected] of fixtures) {
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',encoded],{
      input:JSON.stringify({file,atlas:HUD_ATLAS,regions:Object.entries(HUD_REGIONS).filter(([name])=>name!=='scoreboard').map(([,region])=>region)})+'\n',
      encoding:'utf8',maxBuffer:4_000_000,windowsHide:true
    });
    assert.equal(result.status,0,result.stderr);
    const image=Buffer.from(result.stdout.trim(),'base64');
    assert.ok(image.length>500);
    const before=performance.now();
    const words=await read(image);
    ocrMs+=performance.now()-before;
    const actual=hudObservation(words,0);
    const mismatches=Object.keys(expected).filter(key=>expected[key]!==actual[key]);
    count++;
    if(!mismatches.length)exact++;
    for(const key of mismatches)errors.push({file,key,expected:expected[key],actual:actual[key]});
    console.log(file.split(/[\/\\]/).at(-1), JSON.stringify({actual,mismatches}));
  }
  console.log(JSON.stringify({count,exact,averageOcrMs:Math.round(ocrMs/count),errors}));
  if(browserReport) {
    const report=JSON.parse(readFileSync(browserReport,'utf8'));
    const timeline=identityTimeline(report.identityReview);
    // Independently reviewed checkpoints from the recording and the death
    // sequence contact sheet. A timeout or miss is reported as Unknown.
    const labels={25:'unknown',40:'unknown',75:'unknown',100:'buy',120:'user',140:'user',
      150:'user',152:'user',154:'user',156:'dead',158:'dead',160:'spectator',162:'spectator',
      164:'spectator',166:'spectator',180:'spectator',220:'buy',240:'user',260:'user',280:'user',
      300:'user',400:'ended',1000:'ended',1400:'buy',1600:'spectator'};
    const checks=Object.entries(labels).map(([at,expected])=>({
      at:Number(at),expected,actual:timeline.find(row=>row.start<=+at&&row.end>+at)?.state||'unknown'
    }));
    const correct=checks.filter(check=>check.actual===check.expected).length;
    const userHits=checks.filter(check=>check.actual==='user'&&check.expected==='user').length;
    const userFalsePositives=checks.filter(check=>check.actual==='user'&&check.expected!=='user').length;
    console.log(JSON.stringify({temporal:{correct,total:checks.length,userHits,userFalsePositives,
      mismatches:checks.filter(check=>check.actual!==check.expected)}}));
    assert.equal(userFalsePositives,0,'A labeled non-user checkpoint received personal attribution');
  }
  process.exit(errors.some(error=>error.file.includes('Screenshot '))?1:0);
} catch(error) {
  console.error(error);
  process.exit(1);
}
