/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../public/assets/aistudio/Inkpad___Handwritten_Notes__7__e420adc2.html');
const destPath = path.join(__dirname, '../index.html');

let content = fs.readFileSync(srcPath, 'utf8');

// Normalise line endings so the anchor replacements below always match,
// no matter which OS / editor the source HTML came from.
content = content.replace(/\r\n?/g, '\n');

/**
 * Replace an anchor and fail loudly if it is missing.
 * Silent no-op replacements used to drop the auth UI without any error.
 */
function mustReplace(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[injectCloudSync] anchor not found: ${label}`);
  }
  return source.replace(needle, replacement);
}

// 1. Add PWA meta tags & cloudSync module to <head>
const pwaHead = `
<meta name="theme-color" content="#2f6df6">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Inkpad">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<script type="module" src="/src/cloudSync.ts"></script>
`;
content = mustReplace(content, '</head>', `${pwaHead}</head>`, '</head>');

// 2. Add auth modal styling to <style>
const authStyles = `
#auth-md{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;z-index:99}
#auth-md.on{display:flex}
#auth-md .box{background:var(--sf);border-radius:18px;padding:22px;width:min(92vw,360px);display:flex;flex-direction:column;gap:12px;box-shadow:0 12px 32px rgba(0,0,0,.28);border:1px solid var(--bd)}
#auth-md input{font:inherit;padding:9px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);width:100%}
`;
content = mustReplace(content, '</style>', `${authStyles}</style>`, '</style>');

// 2b. Responsive hardening (see also steps 7c/7d for the JS half).
// In the compact bar the overflow button is `position:sticky` inside the
// horizontally scrolling tool strip, so it permanently sits on top of the last
// one or two tools. Reserve a lane for it instead: the strip is inset by the
// button width and the button is pinned inside that lane, so nothing is ever
// hidden underneath it.
const responsiveStyles = `
html[data-bar=compact] #tb{padding-right:44px}
html[data-bar=compact] #tb #more{position:absolute;right:0;top:0;bottom:0;order:0;margin:0;width:44px;height:auto;display:flex;align-items:center;justify-content:center;border:0;border-left:1px solid var(--bd);border-radius:0 13px 13px 0;box-shadow:none;background:var(--sf);z-index:3}
html[data-bar=compact] #bar{padding-right:0}
`;
content = mustReplace(content, '</style>', `${responsiveStyles}</style>`, '</style> (responsive)');

// 2c. Styles for the Home panels: stylus/pen mapping and cloud backup.
const panelStyles = `
#pen-md,#cloud-md{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:99;padding:16px}
#pen-md.on,#cloud-md.on{display:flex}
#pen-md .box,#cloud-md .box{background:var(--sf);border-radius:18px;padding:20px;width:min(94vw,430px);max-height:88vh;overflow:auto;display:flex;flex-direction:column;gap:12px;box-shadow:0 12px 32px rgba(0,0,0,.28);border:1px solid var(--bd)}
#pen-md .row,#cloud-md .row{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px}
#pen-md .row select,#cloud-md select{font:inherit;font-size:13px;background:var(--bg);color:var(--tx);border:1px solid var(--bd);border-radius:8px;padding:6px 8px;max-width:170px}
#pen-md h4{margin:2px 0 0;font-size:12px;font-weight:600;color:var(--mu);text-transform:uppercase;letter-spacing:.04em}
#pen-pad{height:92px;border:1px dashed var(--bd);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;color:var(--mu);font-size:12px;touch-action:none;background:var(--bg);user-select:none;-webkit-user-select:none;cursor:crosshair}
#pen-pad b{font-size:20px;color:var(--tx);font-weight:600}
.pen-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:12px;color:var(--mu)}
.pen-meta i{color:var(--tx);font-style:normal;font-weight:600}
#pen-bar{height:6px;border-radius:3px;background:var(--bd);overflow:hidden}
#pen-bar>i{display:block;height:100%;width:0;background:var(--ac);transition:width .08s linear}
.pen-hint{font-size:11.5px;color:var(--mu);line-height:1.5}
#guest-banner{display:flex;align-items:flex-start;gap:10px;background:color-mix(in srgb,var(--ac) 9%,var(--sf));border:1px solid color-mix(in srgb,var(--ac) 35%,var(--bd));border-radius:12px;padding:10px 12px;margin-bottom:16px;font-size:12.5px;line-height:1.45}
#guest-banner .grow{flex:1}
#guest-banner button{font-size:12px;padding:5px 10px;flex:none}
#cloud-files{max-height:150px;overflow:auto;border:1px solid var(--bd);border-radius:10px;font-size:12px}
#cloud-files div{display:flex;justify-content:space-between;gap:8px;padding:6px 9px;border-bottom:1px solid var(--bd)}
#cloud-files div:last-child{border-bottom:0}
#cloud-files span{color:var(--mu);flex:none}
`;
content = mustReplace(content, '</style>', `${panelStyles}</style>`, '</style> (panels)');

// 3. Update #nav with cloud status and login/user controls
const navOld = `<nav id="nav"><b>Inkpad</b><a data-f="all" data-n="Documents" class="on">📚 Documents</a><a data-f="fav" data-n="Favorites">★ Favorites</a><a data-f="trash" data-n="Trash">🗑 Trash</a></nav>`;
const navNew = `<nav id="nav">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:0 8px">
    <b style="font-size:22px;margin:0;padding:0">Inkpad</b>
    <span id="cloud-status" style="font-size:11px;color:var(--mu);font-weight:600">💻 Guest</span>
  </div>
  <a data-f="all" data-n="Documents" class="on">📚 Documents</a>
  <a data-f="fav" data-n="Favorites">★ Favorites</a>
  <a data-f="trash" data-n="Trash">🗑 Trash</a>
  <div style="margin-top:auto;display:flex;flex-direction:column;gap:6px;padding:4px">
    <button id="pwa-btn" style="display:none;width:100%;font-size:12px;padding:6px;border-color:var(--ac);color:var(--ac)" onclick="window.__inkpad_cloud&&window.__inkpad_cloud.promptInstall()">📲 Install App</button>
    <button id="auth-login-btn" style="width:100%;font-size:12px;font-weight:600;padding:7px 10px" onclick="window.__inkpad_cloud&&window.__inkpad_cloud.openAuth('signin')">🔐 Sign In / Up</button>
    <div id="user-info-box" style="display:none;flex-direction:column;gap:2px;font-size:12px;padding:4px">
      <span id="user-display-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mu);font-weight:600"></span>
      <button style="font-size:11px;padding:2px 0;text-align:left;border:0;background:transparent;color:var(--ac);cursor:pointer" onclick="window.__inkpad_cloud&&window.__inkpad_cloud.signOut()">Sign Out</button>
    </div>
  </div>
</nav>`;
content = mustReplace(content, navOld, navNew, '#nav block');

// 4. Add #auth-md dialog markup right after #md
const authModalHtml = `
<div id="auth-md">
  <div class="box">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <b id="auth-title" style="font-size:18px">Sign In to Inkpad</b>
      <button class="ic" style="font-size:16px;padding:2px 6px" onclick="window.__inkpad_cloud&&window.__inkpad_cloud.closeAuth()">✕</button>
    </div>
    <div id="auth-err" style="display:none;color:#e5383b;font-size:12px;padding:6px 10px;background:rgba(229,56,59,.1);border-radius:8px"></div>
    <div id="auth-msg" style="display:none;color:#2a9d4f;font-size:12px;padding:6px 10px;background:rgba(42,157,79,.1);border-radius:8px"></div>
    <button id="auth-google-btn" style="display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600;padding:8px;cursor:pointer" onclick="authDoGoogle()">
      <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
      Continue with Google
    </button>
    <div id="auth-divider" style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--mu)"><span style="flex:1;height:1px;background:var(--bd)"></span>or email<span style="flex:1;height:1px;background:var(--bd)"></span></div>
    <input type="email" id="auth-email" placeholder="Email" aria-label="Email">
    <input type="password" id="auth-pass" placeholder="Password (min 6 chars)" aria-label="Password">
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="window.__inkpad_cloud&&window.__inkpad_cloud.closeAuth()">Cancel</button>
      <button id="auth-submit-btn" class="on" onclick="authDoSubmit()">Sign In</button>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px">
      <button class="ic" id="auth-toggle-btn" style="padding:0;text-decoration:underline" onclick="authToggleMode()">Need an account? Sign Up</button>
      <button class="ic" id="auth-reset-btn" style="padding:0;text-decoration:underline" onclick="authModeReset()">Forgot password?</button>
    </div>
  </div>
</div>
`;
content = mustReplace(content, '<div id="md">', `${authModalHtml}\n<div id="md">`, '<div id="md">');

// 5. Update save() function to sync to cloud
const oldSave = `function save(){if(nb)nb.upd=Date.now();clearTimeout(tmr);tmr=setTimeout(()=>{try{localStorage.setItem("inkpad",JSON.stringify(lib))}catch(e){}},300)}`;
const newSave = `function save(){if(nb)nb.upd=Date.now();clearTimeout(tmr);tmr=setTimeout(()=>{try{localStorage.setItem("inkpad",JSON.stringify(lib))}catch(e){}if(window.__inkpad_cloud)window.__inkpad_cloud.onSave(nb)},300)}`;
content = mustReplace(content, oldSave, newSave, 'save()');

// 6. Expose lib and showLib to window for external cloud hydration
const libInitOld = `try{lib=JSON.parse(localStorage.getItem("inkpad")||"[]")}catch(e){lib=[]}`;
const libInitNew = `try{lib=JSON.parse(localStorage.getItem("inkpad")||"[]")}catch(e){lib=[]};window.lib=lib;window.showLib=showLib;`;
content = mustReplace(content, libInitOld, libInitNew, 'lib init');

// 7. Connect delete and empty-trash with cloud sync
const deleteOld = `bt.onclick=e=>{e.stopPropagation();n.del=n.del?0:1;save();showLib()};`;
const deleteNew = `bt.onclick=e=>{e.stopPropagation();n.del=n.del?0:1;save();showLib();if(n.del&&window.__inkpad_cloud)window.__inkpad_cloud.onDelete(n.id);};`;
content = mustReplace(content, deleteOld, deleteNew, 'card delete');

const emptyTrashOld = `$("#et").onclick=()=>{lib=lib.filter(n=>!n.del);save();showLib()};`;
const emptyTrashNew = `$("#et").onclick=()=>{const toDel=lib.filter(n=>n.del);lib=lib.filter(n=>!n.del);save();showLib();if(window.__inkpad_cloud)toDel.forEach(n=>window.__inkpad_cloud.onDelete(n.id));};`;
content = mustReplace(content, emptyTrashOld, emptyTrashNew, 'empty trash');

// 7b. The engine declares a top-level `function open(n)` to open a notebook.
// Because it lives in a classic <script>, it replaces the browser's native
// window.open, which is exactly what Firebase's signInWithPopup needs to show
// the Google account chooser. Rename it so Google sign-in keeps working.
const openRename = /(?<![A-Za-z0-9_.$])open(?=\(n\)|\{)/g;
const openHits = (content.match(openRename) || []).length;
if (openHits !== 3) {
  throw new Error(`[injectCloudSync] expected 3 engine "open" references, found ${openHits}`);
}
content = content.replace(openRename, 'openNotebook');
if (!content.includes('function openNotebook(n){nb=n;')) {
  throw new Error('[injectCloudSync] engine open() rename failed');
}

// 7c. Device class: the engine treats any window with a short edge under 820px
// as a tablet, so a 1366x768 or 1280x800 laptop was laid out like an iPad. Only
// call something a tablet when the primary pointer is actually coarse.
const devOld = `DEV=m<600?'phone':((co&&m<1100)||m<820)?'tablet':'desktop';`;
const devNew = `DEV=m<600?'phone':(co?(m<1100?'tablet':'desktop'):'desktop');`;
content = mustReplace(content, devOld, devNew, 'device class detection');

// 7d. Page fit: the engine only fitted the page to the available height on
// desktop or in portrait, so in landscape the paper was ~2.2x taller than the
// stage and half of every page sat below the fold. Fit the whole page in every
// orientation; the zoom controls still go up to 3x for close-up writing.
const fitOld = `let b=aw;if(DEV==='desktop'||document.documentElement.dataset.ori==='portrait')b=Math.min(aw,Math.max(260,ah*W/H));`;
const fitNew = `let b=Math.min(aw,Math.max(260,ah*W/H));`;
content = mustReplace(content, fitOld, fitNew, 'page fit rule');

// 7e. Pen buttons: the engine hardcodes the eraser end to "eraser" and allows
// only Eraser/Lasso/Nothing on the barrel button. Route every pen button
// through penBtn() so the Home panel can map them to any Inkpad tool, and also
// accept pointerType "eraser" (some Android drivers report it).
const penBtnOld = `if(e.pointerType==="pen"){penInfo(e);const bt=(e.buttons&32||e.button===5)?'er':((e.buttons&2||e.button===2)&&SIDE!=='none')?SIDE:'';if(bt&&tool!==bt){pt0=tool;tool=bt;syncTools()}}`;
const penBtnNew = `if(e.pointerType==="pen"||e.pointerType==="eraser"){penInfo(e);const bt=penBtn(e);if(bt&&tool!==bt){pt0=tool;tool=bt;syncTools()}}`;
content = mustReplace(content, penBtnOld, penBtnNew, 'pen button mapping');

// 7f. The engine's own settings dialog gets the full tool list and writes to the
// shared pen config, so both places stay in sync.
const penSelOld = `[['er','Eraser'],['sel','Lasso'],['none','Nothing']].forEach(([v,t])=>{const o=el('option',0,t);o.value=v;s3.append(o)});s3.value=SIDE;s3.onchange=()=>{SIDE=s3.value;saveSet()};`;
const penSelNew = `PEN_TOOLS.forEach(([v,t])=>{const o=el('option',0,t);o.value=v;s3.append(o)});s3.value=PENCFG.side;s3.onchange=()=>{SIDE=s3.value;saveSet();penCfgSet('side',s3.value)};`;
content = mustReplace(content, penSelOld, penSelNew, 'engine pen settings select');

// 7g. Tell the cloud layer when the device store is full, so it can offer a
// backup instead of losing the notebook silently.
const saveCatchOld = `try{localStorage.setItem("inkpad",JSON.stringify(lib))}catch(e){}if(window.__inkpad_cloud)window.__inkpad_cloud.onSave(nb)`;
const saveCatchNew = `try{localStorage.setItem("inkpad",JSON.stringify(lib))}catch(e){if(window.__inkpad_storageFull)window.__inkpad_storageFull()}if(window.__inkpad_cloud)window.__inkpad_cloud.onSave(nb)`;
content = mustReplace(content, saveCatchOld, saveCatchNew, 'save() storage hook');

// 8. Add client-side script for auth modal interactions
const authScript = `
let authMode = 'signin';
function authShowErr(msg){const e=document.getElementById('auth-err');if(e){e.textContent=msg;e.style.display=msg?'block':'none';}}
function authShowMsg(msg){const m=document.getElementById('auth-msg');if(m){m.textContent=msg;m.style.display=msg?'block':'none';}}
function authSetMode(m){
  authMode=m;authShowErr('');authShowMsg('');
  const t=document.getElementById('auth-title');
  const g=document.getElementById('auth-google-btn');
  const d=document.getElementById('auth-divider');
  const p=document.getElementById('auth-pass');
  const sub=document.getElementById('auth-submit-btn');
  const tog=document.getElementById('auth-toggle-btn');
  const res=document.getElementById('auth-reset-btn');
  if(m==='signin'){
    if(t)t.textContent='Sign In to Inkpad';
    if(g)g.style.display='flex';if(d)d.style.display='flex';if(p)p.style.display='block';
    if(sub)sub.textContent='Sign In';
    if(tog){tog.textContent='Need an account? Sign Up';tog.style.display='inline';}
    if(res)res.style.display='inline';
  }else if(m==='signup'){
    if(t)t.textContent='Create Inkpad Account';
    if(g)g.style.display='flex';if(d)d.style.display='flex';if(p)p.style.display='block';
    if(sub)sub.textContent='Create Account';
    if(tog){tog.textContent='Already have an account? Sign In';tog.style.display='inline';}
    if(res)res.style.display='none';
  }else if(m==='reset'){
    if(t)t.textContent='Reset Password';
    if(g)g.style.display='none';if(d)d.style.display='none';if(p)p.style.display='none';
    if(sub)sub.textContent='Send Recovery Link';
    if(tog){tog.textContent='Back to Sign In';tog.style.display='inline';}
    if(res)res.style.display='none';
  }
}
window.__auth_setMode = authSetMode;
function authToggleMode(){authSetMode(authMode==='signin'?'signup':'signin');}
function authModeReset(){authSetMode('reset');}
async function authDoGoogle(){
  try{authShowErr('');await window.__inkpad_cloud.signInWithGoogle();window.__inkpad_cloud.closeAuth();}catch(err){authShowErr(err&&err.message||'Google sign in failed');}
}
async function authDoSubmit(){
  const em=document.getElementById('auth-email').value.trim();
  const ps=document.getElementById('auth-pass').value;
  if(!em){authShowErr('Please enter an email.');return;}
  try{
    authShowErr('');
    if(authMode==='signin'){
      if(!ps){authShowErr('Please enter your password.');return;}
      await window.__inkpad_cloud.signInWithEmail(em,ps);
      window.__inkpad_cloud.closeAuth();
    }else if(authMode==='signup'){
      if(ps.length<6){authShowErr('Password must be at least 6 characters.');return;}
      await window.__inkpad_cloud.signUpWithEmail(em,ps);
      window.__inkpad_cloud.closeAuth();
    }else if(authMode==='reset'){
      await window.__inkpad_cloud.resetPassword(em);
      authShowMsg('Password recovery email sent!');
    }
  }catch(err){
    const c=err&&err.code;
    if(c==='auth/wrong-password'||c==='auth/user-not-found'||c==='auth/invalid-credential')authShowErr('Invalid email or password.');
    else if(c==='auth/email-already-in-use')authShowErr('This email is already registered.');
    else authShowErr((err&&err.message)||'Authentication error.');
  }
}
`;
// 8b. Stylus / pen support: button mapping to Inkpad tools, pressure and palm
// controls, and a live detector so third-party pens (XP-Pen, Huion, Wacom,
// Apple Pencil, S Pen) can be verified without guessing.
const penScript = `
var PEN_TOOLS=[['pen','Pen'],['hl','Highlight'],['er','Eraser'],['sel','Lasso select'],['line','Line'],['rect','Rectangle'],['ell','Oval'],['text','Text'],['laser','Laser pointer'],['none','Nothing']];
var PENCFG={eraser:'er',side:'er',side2:'none'};
var PENLIVE={seen:0,type:'-',pr:0,prMin:1,prMax:0,tilt:0,btn:'none',eraser:0,side:0,side2:0};
function penCfgLoad(){
  var o=null;try{o=JSON.parse(localStorage.getItem('inkpad-pen')||'null')}catch(e){o=null}
  if(!o||typeof o!=='object')o={};
  if(o.eraser)PENCFG.eraser=o.eraser;
  if(o.side)PENCFG.side=o.side;
  if(o.side2)PENCFG.side2=o.side2;
  if(!('side' in o)){try{var s=JSON.parse(localStorage.getItem('inkpad-set')||'{}');if(s.side)PENCFG.side=s.side}catch(e){}}
}
function penCfgSave(){try{localStorage.setItem('inkpad-pen',JSON.stringify(PENCFG))}catch(e){}}
function penCfgSet(k,v){
  PENCFG[k]=v;penCfgSave();
  if(k==='side'){try{var s=JSON.parse(localStorage.getItem('inkpad-set')||'{}');s.side=v;localStorage.setItem('inkpad-set',JSON.stringify(s))}catch(e){}}
}
function penBtn(e){
  if(e.pointerType!=='pen'&&e.pointerType!=='eraser')return '';
  if((e.buttons&32)||e.button===5||e.pointerType==='eraser')return PENCFG.eraser==='none'?'':PENCFG.eraser;
  if((e.buttons&2)||e.button===2)return PENCFG.side==='none'?'':PENCFG.side;
  if((e.buttons&4)||e.button===1)return PENCFG.side2==='none'?'':PENCFG.side2;
  return '';
}
function penMeta(){
  var m=document.getElementById('pen-meta');if(!m)return;
  var prs=PENLIVE.prMax-PENLIVE.prMin>.08;
  var kind=PENLIVE.type==='pen'?'stylus':PENLIVE.type==='eraser'?'eraser':PENLIVE.type==='touch'?'finger':PENLIVE.seen?'mouse':'waiting';
  m.innerHTML='<div>Device <i>'+kind+'</i></div>'+
    '<div>Pressure <i>'+(PENLIVE.type==='pen'?(prs?'variable':'not reported'):'-')+'</i></div>'+
    '<div>Tilt <i>'+(PENLIVE.tilt?'yes':'no')+'</i></div>'+
    '<div>Last button <i>'+PENLIVE.btn+'</i></div>'+
    '<div>Eraser end <i>'+(PENLIVE.eraser?'detected':'not seen')+'</i></div>'+
    '<div>Barrel <i>'+(PENLIVE.side?'detected':(PENLIVE.side2?'second only':'not seen'))+'</i></div>';
  var bar=document.querySelector('#pen-bar>i');
  if(bar)bar.style.width=Math.round(Math.max(0,Math.min(1,PENLIVE.pr))*100)+'%';
}
function penPad(){
  var pad=document.getElementById('pen-pad');if(!pad)return;
  function note(e){
    PENLIVE.seen=1;PENLIVE.type=e.pointerType||'-';
    var p=(typeof e.pressure==='number')?e.pressure:0;
    if(e.type!=='pointerup'&&p>0){PENLIVE.pr=p;if(p<PENLIVE.prMin)PENLIVE.prMin=p;if(p>PENLIVE.prMax)PENLIVE.prMax=p}
    PENLIVE.tilt=Math.max(Math.abs(e.tiltX||0),Math.abs(e.tiltY||0));
    if((e.buttons&32)||e.button===5)PENLIVE.eraser=1;
    if((e.buttons&2)||e.button===2)PENLIVE.side=1;
    if((e.buttons&4)||e.button===1)PENLIVE.side2=1;
    PENLIVE.btn=e.type==='pointerup'?'none':(e.button===0?'tip':e.button===5?'eraser':e.button===2?'barrel':e.button===1?'barrel 2':'b'+e.button);
    penMeta();
    var s=pad.querySelector('span');
    if(s&&e.type!=='pointerup')s.textContent='pressure '+p.toFixed(2)+'  ·  tilt '+PENLIVE.tilt+'°';
  }
  ['pointerdown','pointermove','pointerup','pointercancel'].forEach(function(t){pad.addEventListener(t,note)});
  pad.addEventListener('contextmenu',function(e){e.preventDefault()});
  pad.addEventListener('pointerdown',function(e){try{pad.setPointerCapture(e.pointerId)}catch(err){}});
}
function penFill(sel,val){
  var s=document.getElementById(sel);if(!s)return;
  s.innerHTML='';
  PEN_TOOLS.forEach(function(p){var o=document.createElement('option');o.value=p[0];o.textContent=p[1];s.appendChild(o)});
  s.value=val;
}
function openPenPanel(){
  var md=document.getElementById('pen-md');
  if(!md){
    md=document.createElement('div');md.id='pen-md';
    md.innerHTML='<div class="box">'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<b style="font-size:17px">Stylus &amp; pen</b>'+
        '<button class="ic" id="pen-close" style="font-size:16px;padding:2px 6px" aria-label="Close">✕</button>'+
      '</div>'+
      '<div id="pen-pad"><b>Try your pen here</b><span>Draw on this pad, or press a barrel button</span></div>'+
      '<div class="pen-meta" id="pen-meta"></div>'+
      '<div id="pen-bar"><i></i></div>'+
      '<h4>Button mapping</h4>'+
      '<div class="row"><span>Eraser end</span><select id="pen-eraser"></select></div>'+
      '<div class="row"><span>Barrel button</span><select id="pen-side"></select></div>'+
      '<div class="row"><span>Second barrel button</span><select id="pen-side2"></select></div>'+
      '<h4>Pressure &amp; palm</h4>'+
      '<div class="row"><span>Pressure response</span><select id="pen-prs"><option value=".6">Soft</option><option value="1">Normal</option><option value="1.7">Firm</option><option value="off">Off (speed only)</option></select></div>'+
      '<div class="row"><span>Palm rejection (pen only)</span><input type="checkbox" id="pen-po"></div>'+
      '<div class="pen-hint">The pen tip always draws with the current tool. The eraser end and barrel buttons can be mapped to any tool, and the previous tool returns as soon as you lift the pen. XP-Pen, Huion and Wacom only send pressure and button data to the browser when Windows Ink / pointer events is enabled in their driver.</div>'+
      '<div style="display:flex;justify-content:flex-end"><button id="pen-done" class="on">Done</button></div>'+
    '</div>';
    document.body.appendChild(md);
    document.getElementById('pen-close').onclick=function(){md.classList.remove('on')};
    document.getElementById('pen-done').onclick=function(){md.classList.remove('on')};
    md.addEventListener('pointerdown',function(e){if(e.target===md)md.classList.remove('on')});
    penPad();
    document.getElementById('pen-eraser').onchange=function(){penCfgSet('eraser',this.value)};
    document.getElementById('pen-side').onchange=function(){penCfgSet('side',this.value)};
    document.getElementById('pen-side2').onchange=function(){penCfgSet('side2',this.value)};
    document.getElementById('pen-prs').onchange=function(){
      var p=document.getElementById('prs');
      if(p){p.value=this.value;p.dispatchEvent(new Event('change'))}
    };
    document.getElementById('pen-po').onchange=function(){
      var c=document.getElementById('po');
      if(c){c.checked=this.checked;c.dispatchEvent(new Event('change'))}
    };
  }
  penFill('pen-eraser',PENCFG.eraser);
  penFill('pen-side',PENCFG.side);
  penFill('pen-side2',PENCFG.side2);
  var prs=document.getElementById('prs');if(prs)document.getElementById('pen-prs').value=prs.value;
  var po=document.getElementById('po');if(po)document.getElementById('pen-po').checked=po.checked;
  penMeta();
  md.classList.add('on');
}
function penNavBtn(){
  if(document.getElementById('pen-btn'))return;
  var nav=document.getElementById('nav');if(!nav)return;
  var b=document.createElement('button');
  b.id='pen-btn';b.type='button';b.textContent='✒️ Stylus & pen';
  b.style.cssText='text-align:left;background:transparent;border:0;border-radius:10px;padding:9px 12px;font:inherit;cursor:pointer;color:inherit';
  b.onclick=openPenPanel;
  var links=nav.querySelectorAll('a[data-f]');
  var anchor=links.length?links[links.length-1]:null;
  if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(b,anchor.nextSibling);
  else nav.appendChild(b);
}
penCfgLoad();
penNavBtn();
(function(){var c=document.getElementById('cv');if(c)c.addEventListener('contextmenu',function(e){e.preventDefault()})})();
`;

content = mustReplace(content, 'showLib();\n</script>', `${authScript}\n${penScript}\nshowLib();\n</script>`, 'auth client script');

// Final gate: every auth piece must be present in the generated file.
const requiredMarkers = [
  ['auth modal markup', 'id="auth-md"'],
  ['google button', 'id="auth-google-btn"'],
  ['email + password inputs', 'id="auth-email"'],
  ['auth client script', 'function authDoSubmit()'],
  ['cloud sync bridge', 'window.__inkpad_cloud'],
  ['cloud sync module', 'src="/src/cloudSync.ts"'],
  ['notebook save hook', 'window.__inkpad_cloud.onSave(nb)'],
  ['window.lib exposure', 'window.lib=lib;window.showLib=showLib;'],
  ['native window.open preserved', 'function openNotebook(n){nb=n;'],
  ['pen button mapping', 'const bt=penBtn(e);'],
  ['pen settings panel', "id='pen-md'"],
  ['pen config store', "localStorage.setItem('inkpad-pen'"],
  ['storage-full hook', 'window.__inkpad_storageFull'],
];
for (const [label, marker] of requiredMarkers) {
  if (!content.includes(marker)) {
    throw new Error(`[injectCloudSync] generated index.html is missing ${label}`);
  }
}

fs.writeFileSync(destPath, content, 'utf8');
console.log('Successfully generated index.html with exact original engine + cloud sync & PWA!');
console.log('Verified: email sign in/up, password reset, Google sign in and cloud sync hooks are all present.');
