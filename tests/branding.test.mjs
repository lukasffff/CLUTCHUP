import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import migration from '../dist/storage-migration.js';

test('all current source, documentation, page branding and launcher names use CLUTCHUP',()=>{
 const previous='clutch'+String.fromCharCode(105,113);
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 for(const file of files) {
  if(!existsSync(file))continue;
  assert.ok(!file.toLowerCase().includes(previous),file);
  assert.ok(!readFileSync(file).toString('utf8').toLowerCase().includes(previous),file);
 }
 for(const file of ['dist/index.html','dist/legacy.html']) {
  const html=readFileSync(file,'utf8');
  assert.ok(html.replace(/<[^>]*>/g,'').includes('CLUTCHUP'),file);
  assert.ok(!html.replace(/<[^>]*>/g,'').includes(previous.toUpperCase()),file);
 }
 assert.ok(existsSync('Start CLUTCHUP.cmd'));
});

test('branding migration preserves old progress, profiles, reports and settings without overwriting newer values',()=>{
 const prior='clutch'+String.fromCharCode(105,113),values=new Map();
 const storage={get length(){return values.size;},key:index=>[...values.keys()][index],getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const suffixes=['.session.v2','.profile','.video-reviews.v1','.video-reports.v1','.quality','.agent','-tactical-bindings-v2'];
 for(const suffix of suffixes)storage.setItem(prior+suffix,JSON.stringify({saved:suffix}));
 storage.setItem('clutchup.quality','"medium"');
 assert.equal(migration.migrateBrandStorage(storage),true);
 for(const suffix of suffixes) {
  assert.ok(values.has(prior+suffix),'prior data remains recoverable');
  assert.equal(storage.getItem('clutchup'+suffix),suffix==='.quality'?'"medium"':storage.getItem(prior+suffix));
 }
 assert.equal(migration.migrateBrandStorage(storage),true,'migration can run again safely');
 assert.equal(migration.migrateBrandStorage(null),false);
 assert.equal(migration.migrateBrandStorage({length:1,key:()=>prior+'.profile',getItem:()=>null,setItem(){throw Error('quota');}}),false);
});
