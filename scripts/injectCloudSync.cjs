/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, '../public/assets/aistudio/Inkpad___Handwritten_Notes__7__e420adc2.html');
const destPath = path.join(__dirname, '../index.html');

let content = fs.readFileSync(srcPath, 'utf8');

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
content = content.replace('</head>', `${pwaHead}</head>`);

// 2. Add auth modal styling to <style>
const authStyles = `
#auth-md{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);display:none;align-items:center;justify-content:center;z-index:99}
#auth-md.on{display:flex}
#auth-md .box{background:var(--sf);border-radius:18px;padding:22px;width:min(92vw,360px);display:flex;flex-direction:column;gap:12px;box-shadow:0 12px 32px rgba(0,0,0,.28);border:1px solid var(--bd)}
#auth-md input{font:inherit;padding:9px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);width:100%}
`;
content = content.replace('</style>', `${authStyles}</style>`);

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
content = content.replace(navOld, navNew);

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
content = content.replace('<div id="md">', `${authModalHtml}\n<div id="md">`);

// 5. Update save() function to sync to cloud
const oldSave = `function save(){if(nb)nb.upd=Date.now();clearTimeout(tmr);tmr=setTimeout(()=>{try{localStorage.setItem("inkpad",JSON.stringify(lib))}catch(e){}},300)}`;
const newSave = `function save(){if(nb)nb.upd=Date.now();clearTimeout(tmr);tmr=setTimeout(()=>{try{localStorage.setItem("inkpad",JSON.stringify(lib))}catch(e){}if(window.__inkpad_cloud)window.__inkpad_cloud.onSave(nb)},300)}`;
content = content.replace(oldSave, newSave);

// 6. Expose lib and showLib to window for external cloud hydration
const libInitOld = `try{lib=JSON.parse(localStorage.getItem("inkpad")||"[]")}catch(e){lib=[]}`;
const libInitNew = `try{lib=JSON.parse(localStorage.getItem("inkpad")||"[]")}catch(e){lib=[]};window.lib=lib;window.showLib=showLib;`;
content = content.replace(libInitOld, libInitNew);

// 7. Connect delete and empty-trash with cloud sync
const deleteOld = `bt.onclick=e=>{e.stopPropagation();n.del=n.del?0:1;save();showLib()};`;
const deleteNew = `bt.onclick=e=>{e.stopPropagation();n.del=n.del?0:1;save();showLib();if(n.del&&window.__inkpad_cloud)window.__inkpad_cloud.onDelete(n.id);};`;
content = content.replace(deleteOld, deleteNew);

const emptyTrashOld = `$("#et").onclick=()=>{lib=lib.filter(n=>!n.del);save();showLib()};`;
const emptyTrashNew = `$("#et").onclick=()=>{const toDel=lib.filter(n=>n.del);lib=lib.filter(n=>!n.del);save();showLib();if(window.__inkpad_cloud)toDel.forEach(n=>window.__inkpad_cloud.onDelete(n.id));};`;
content = content.replace(emptyTrashOld, emptyTrashNew);

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
content = content.replace('showLib();\n</script>', `${authScript}\nshowLib();\n</script>`);

fs.writeFileSync(destPath, content, 'utf8');
console.log('Successfully generated index.html with exact original engine + cloud sync & PWA!');
