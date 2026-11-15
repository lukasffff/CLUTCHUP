// A small DOM/media fixture for event-flow tests. No real browser, pixels or
// codec quality are simulated; canvas and seek results are explicitly fake.
const voids=new Set(['input','img','br','hr','meta','link']);
export class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attributes={};this.dataset={};this.listeners=new Map();this._value='';this._text='';this._time=0;this.hidden=false;this.checked=false;this.disabled=false;this.files=[];this.duration=1800;this.videoWidth=1920;this.videoHeight=1080;}
 append(...nodes){for(const node of nodes){if(node==null)continue;node.parentNode=this;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('');}
 set innerHTML(html){this.replaceChildren();const stack=[this];for(const token of html.match(/<[^>]+>|[^<]+/g)||[]){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const n=new Element(tag);for(const match of token.slice(tag.length+1,-1).matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))n.setAttribute(match[1],match[2]??match[3]??match[4]??'');stack.at(-1).append(n);if(!voids.has(tag))stack.push(n);}else{const n=new Element('#text');n.textContent=token;stack.at(-1).append(n);}}}
 setAttribute(key,value){this.attributes[key]=String(value);if(key==='value')this.value=value;if(key==='hidden'||key==='disabled'||key==='checked')this[key]=true;if(key==='class')this.className=value;if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
 getAttribute(key){return this.attributes[key]??null;}
 removeAttribute(key){delete this.attributes[key];if(key==='src')this._src='';}
 get elements(){return Object.fromEntries(this.querySelectorAll('[name]').map(n=>[n.attributes.name,n]));}
 get value(){if(this.tagName==='select'&&!this._value){const opts=this.querySelectorAll('option');return (opts.find(o=>'selected' in o.attributes)||opts[0])?.value||'';}return this._value;}
 set value(v){this._value=String(v);}
 matches(selector){if(selector.startsWith('#'))return this.attributes.id===selector.slice(1);if(selector.startsWith('.'))return (this.className||'').split(' ').includes(selector.slice(1));if(selector.startsWith('[')){const [,key,value]=selector.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/)||[];return key in this.attributes&&(value===undefined||this.attributes[key]===value);}return this.tagName===selector;}
 querySelectorAll(selector){const selectors=selector.split(',').map(s=>s.trim());const all=[];const visit=n=>{for(const c of n.children){if(selectors.some(s=>{const parts=s.split(/\s+(?![^\[]*\])/);if(parts.length===1)return c.matches(s);if(!c.matches(parts.at(-1)))return false;let p=c.parentNode;while(p){if(p.matches(parts[0]))return true;p=p.parentNode;}return false;}))all.push(c);visit(c);}};visit(this);return all;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 add(option){this.append(option);}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type){for(const fn of [...(this.listeners.get(type)||[])])fn();}
 set currentTime(at){this._time=at;queueMicrotask(()=>this.emit('seeked'));}
 get currentTime(){return this._time;}
 set src(value){this._src=value;if(this.tagName==='video')queueMicrotask(()=>this.emit('loadedmetadata'));}
 get src(){return this._src;}
 getContext(){return {drawImage(){},clearRect(){},getImageData(x,y,width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};}};}
 toBlob(callback){callback(new Blob(['fixture'],{type:'image/png'}));}
 toDataURL(){return 'data:image/jpeg;base64,/9j/AAAB';}
 pause(){} load(){} focus(){} remove(){} click(){return this.onclick?.({preventDefault(){},currentTarget:this});}
}
export function installDOM(fetchImpl){
 const previous=Object.fromEntries(['document','window','localStorage','Option','fetch'].map(k=>[k,globalThis[k]]));
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 globalThis.document={createElement:tag=>new Element(tag),addEventListener(){},removeEventListener(){}};
 globalThis.window={confirm:()=>true,addEventListener(){},removeEventListener(){}};
 globalThis.Option=function(text,value){const o=new Element('option');o.value=value;o.textContent=text;return o;};
 globalThis.fetch=fetchImpl;
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=()=> 'blob:fixture';URL.revokeObjectURL=()=>{};
 return ()=>{Object.assign(globalThis,previous);URL.createObjectURL=create;URL.revokeObjectURL=revoke;};
}
