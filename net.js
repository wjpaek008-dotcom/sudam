/* 수담 온라인 대전 — 방 만들기 · 번호로 들어가기 · 열린 방 목록 · 수 주고받기 */
(function(){
'use strict';
const NET = window.NET = {};
const LS = { get(k,d){ try{ const v=localStorage.getItem('sudam.net.'+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } }, set(k,v){ try{ localStorage.setItem('sudam.net.'+k, JSON.stringify(v)); }catch(e){} } };
let uid = LS.get('uid', null); if (!uid){ uid = 'u'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); LS.set('uid', uid); }
NET.uid = uid;
NET.name = () => LS.get('name', '');
const BASE = (function(){ const s = document.currentScript && document.currentScript.src; return s ? s.replace(/net\.js(\?.*)?$/, '') : './'; })();

// ---------- 저장소 (Firebase 또는 시험용 로컬) ----------
let B = null;
function loadScript(src){ return new Promise((res, rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('load '+src)); document.head.appendChild(s); }); }
async function ensure(){
  if (B) return B;
  if (!window.SUDAM_FB){ try{ await loadScript(BASE+'config.js?v='+Date.now()); }catch(e){} }
  if (window.SUDAM_FB && !window.SUDAM_MOCK){
    if (!window.firebase){ await loadScript(BASE+'vendor/firebase-app-compat.js'); await loadScript(BASE+'vendor/firebase-database-compat.js'); }
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(window.SUDAM_FB);
    const db = app.database();
    B = {
      kind:'fb',
      get: p => db.ref(p).get().then(s=>s.val()),
      set: (p,v) => db.ref(p).set(v),
      update: (p,v) => db.ref(p).update(v),
      tx: (p,f) => db.ref(p).transaction(cur=>{ const r=f(cur); return r; }, null, false).then(r=>({ ok:r.committed, val:r.snapshot.val() })),
      on: (p,cb) => { const r=db.ref(p), h=s=>cb(s.val()); r.on('value', h); return ()=>r.off('value', h); },
      onDisc: (p,v) => db.ref(p).onDisconnect().set(v),
      recent: (p, since) => db.ref(p).orderByChild('t').startAt(since).limitToLast(40).get().then(s=>s.val()),
      onRecent: (p, since, cb) => { const q=db.ref(p).orderByChild('t').startAt(since).limitToLast(40), h=s=>cb(s.val()); q.on('value', h); return ()=>q.off('value', h); },
      online: cb => { const r=db.ref('.info/connected'), h=s=>cb(!!s.val()); r.on('value', h); return ()=>r.off('value', h); }
    };
    return B;
  }
  if (window.SUDAM_MOCKURL){ B = httpBackend(window.SUDAM_MOCKURL); return B; }
  if (window.SUDAM_MOCK){ B = mockBackend(); return B; }
  throw new Error('noconfig');
}
// 시험용: 로컬 시험 서버 (실제 서버처럼 비동기·동시 접속)
function httpBackend(U){
  const j = r => r.json();
  const get = p => fetch(U+'/get?p='+encodeURIComponent(p)).then(j);
  const post = (path, body) => fetch(U+path, { method:'POST', body:JSON.stringify(body) }).then(j);
  const subs = new Set();
  setInterval(()=>{ for (const s of subs) get(s.p).then(r=>{ const v = s.q ? s.q(r.v) : r.v; const k=JSON.stringify(v); if (k!==s.last){ s.last=k; s.cb(v); } }); }, 250);
  const filt = since => v => { if (!v) return null; const o={}; for (const k in v) if ((v[k].t||0)>=since) o[k]=v[k]; return o; };
  const discs = []; window.addEventListener('pagehide', ()=>{ const kv={}; for (const [p,v] of discs) kv[p]=v; navigator.sendBeacon(U+'/set', JSON.stringify({kv})); });
  return {
    kind:'http',
    get: p => get(p).then(r=>r.v),
    set: (p,v) => post('/set', { kv:{ [p]:v } }),
    update: (p,v) => { const kv={}; for (const k in v) kv[p+'/'+k]=v[k]; return post('/set', { kv }); },
    tx: async (p,f) => { for (let i=0;i<20;i++){ const r = await get(p); const n = f(r.v==null?null:JSON.parse(JSON.stringify(r.v))); if (n===undefined) return { ok:false, val:r.v }; const c = await post('/cas', { p, ver:r.ver, v:n }); if (c.ok) return { ok:true, val:c.v }; } return { ok:false, val:null }; },
    on: (p,cb) => { const s={p,cb,last:undefined}; subs.add(s); return ()=>subs.delete(s); },
    onDisc: async (p,v) => { discs.push([p,v]); },
    recent: (p, since) => get(p).then(r=>filt(since)(r.v)),
    onRecent: (p, since, cb) => { const s={p,cb,last:undefined,q:filt(since)}; subs.add(s); return ()=>subs.delete(s); },
    online: cb => { setTimeout(()=>cb(true),0); return ()=>{}; }
  };
}
// 시험용: 같은 브라우저의 여러 창끼리 (localStorage + BroadcastChannel)
function mockBackend(){
  const KEY='sudam.mockdb', ch = new BroadcastChannel('sudam-mock'), subs = new Set();
  const read = ()=>{ try{ return JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ return {}; } };
  const parts = p => p.split('/').filter(Boolean);
  const getAt = (t,p)=>{ let o=t; for (const k of parts(p)){ if (o==null) return null; o=o[k]; } return o==null?null:JSON.parse(JSON.stringify(o)); };
  const setAt = (t,p,v)=>{ const ks=parts(p); let o=t; for (let i=0;i<ks.length-1;i++){ if (o[ks[i]]==null||typeof o[ks[i]]!=='object') o[ks[i]]={}; o=o[ks[i]]; } if (v==null) delete o[ks[ks.length-1]]; else o[ks[ks.length-1]]=JSON.parse(JSON.stringify(v)); };
  const write = t=>{ localStorage.setItem(KEY, JSON.stringify(t)); ch.postMessage(1); fire(); };
  function fire(){ const t=read(); for (const s of subs){ const v=s.q ? s.q(getAt(t,s.p)) : getAt(t,s.p); const j=JSON.stringify(v); if (j!==s.last){ s.last=j; setTimeout(()=>s.cb(v),0); } } }
  ch.onmessage = fire;
  const discs = []; window.addEventListener('pagehide', ()=>{ const t=read(); for (const [p,v] of discs) setAt(t,p,v); localStorage.setItem(KEY, JSON.stringify(t)); ch.postMessage(1); });
  const filt = since => v => { if (!v) return null; const o={}; for (const k in v) if ((v[k].t||0)>=since) o[k]=v[k]; return o; };
  return {
    kind:'mock',
    get: async p => getAt(read(),p),
    set: async (p,v) => { const t=read(); setAt(t,p,v); write(t); },
    update: async (p,v) => { const t=read(); for (const k in v) setAt(t, p+'/'+k, v[k]); write(t); },
    tx: async (p,f) => { const t=read(); const r=f(getAt(t,p)); if (r===undefined) return { ok:false, val:getAt(t,p) }; setAt(t,p,r); write(t); return { ok:true, val:getAt(read(),p) }; },
    on: (p,cb) => { const s={p,cb,last:undefined}; subs.add(s); fire(); return ()=>subs.delete(s); },
    onDisc: async (p,v) => { discs.push([p,v]); },
    recent: async (p, since) => filt(since)(getAt(read(),p)),
    onRecent: (p, since, cb) => { const s={p,cb,last:undefined,q:filt(since)}; subs.add(s); fire(); return ()=>subs.delete(s); },
    online: cb => { setTimeout(()=>cb(true),0); return ()=>{}; }
  };
}

// ---------- 방 ----------
const rp = (g,c) => 'rooms/'+g+'/'+c;
NET.ensure = ensure;
NET.available = async ()=>{ try{ await ensure(); return true; }catch(e){ return false; } };
NET.create = async (g, o) => { // o: { pub, max, opts, seat, name }
  const be = await ensure();
  for (let k=0;k<12;k++){
    const code = String(1000 + ((Math.random()*9000)|0));
    const room = { code, g, pub: !!o.pub, max: o.max||2, t: Date.now(), host: uid, status:'wait', opts: o.opts||{}, seats: { ['s'+o.seat]: { uid, name: o.name } }, seq: 0, st: '' };
    const r = await be.tx(rp(g,code), cur => (cur && cur.t > Date.now()-6*3600e3) ? undefined : room);
    if (r.ok) return code;
  }
  throw new Error('방을 만들지 못했어요');
};
// 빈 자리 차지 (pick: 원하는 자리 순서 함수)
NET.join = async (g, code, name, pickSeat) => {
  const be = await ensure();
  let why = '';
  const r = await be.tx(rp(g,code), cur=>{
    why = '';
    if (!cur){ why='없는 방 번호예요'; return cur; }
    cur.seats = cur.seats || {};
    for (const k in cur.seats) if (cur.seats[k].uid===uid){ cur.seats[k].name = name; return cur; } // 다시 들어옴
    if (cur.status!=='wait'){ why='이미 시작했거나 끝난 방이에요'; return undefined; }
    const used = Object.keys(cur.seats).map(k=>+k.slice(1));
    const seat = pickSeat(cur, used); if (seat==null){ why='방이 꽉 찼어요'; return undefined; }
    cur.seats['s'+seat] = { uid, name };
    if (cur.max===2 && Object.keys(cur.seats).length===2) cur.status = 'play';
    return cur;
  });
  if (!r.ok || !r.val){ throw new Error(why || '들어가지 못했어요'); }
  return r.val;
};
NET.mySeat = room => { for (const k in (room&&room.seats)||{}) if (room.seats[k].uid===uid) return +k.slice(1); return null; };
NET.watch = async (g, code, cb) => { const be = await ensure(); return be.on(rp(g,code), cb); };
NET.update = async (g, code, v) => (await ensure()).update(rp(g,code), v);
// 내 수 반영: seq가 그대로일 때만 (동시에 두는 것 막기)
NET.commit = async (g, code, seq, mutate) => {
  const be = await ensure();
  const r = await be.tx(rp(g,code), cur=>{ if (!cur) return cur; if ((cur.seq||0)!==seq) return undefined; const n = mutate(cur); if (n===undefined) return undefined; n.seq = seq+1; n.mt = Date.now(); return n; });
  return r.ok;
};
NET.presence = async (g, code) => { const be = await ensure(); const p = rp(g,code)+'/on/'+uid; await be.set(p, true); await be.onDisc(p, false);
  return be.online(c=>{ if (c){ be.set(p, true); be.onDisc(p, false); } }); };
NET.leavePresence = async (g, code) => { try{ (await ensure()).set(rp(g,code)+'/on/'+uid, false); }catch(e){} };
NET.findRoom = async code => { const be = await ensure(); for (const g of ['omok','baduk','janggi','tile']){ const r = await be.get(rp(g,code)); if (r && r.t > Date.now()-24*3600e3 && r.status!=='closed') return g; } return null; };
NET.since = () => Date.now() - 3*3600e3;
NET.watchList = async (g, cb) => { const be = await ensure(); return be.onRecent('rooms/'+g, NET.since(), v=>cb(v ? Object.values(v) : [])); };

// ---------- 화면 (대기실) ----------
const css = `
.nt-dim{position:fixed;inset:0;background:rgba(30,20,10,.5);display:none;align-items:flex-end;justify-content:center;z-index:60;font-family:inherit}
.nt-dim.on{display:flex}
.nt-sheet{width:100%;max-width:520px;max-height:92dvh;overflow:auto;background:var(--nt-bg,var(--paper,#F3EAD7));color:var(--nt-ink,var(--ink,#2A1E14));border-radius:22px 22px 0 0;padding:18px 16px 26px;display:flex;flex-direction:column;gap:12px;box-shadow:0 -10px 30px rgba(0,0,0,.25)}
@media (min-width:900px){.nt-dim{align-items:center}.nt-sheet{border-radius:22px}}
.nt-sheet h2{margin:0;font-size:20px;font-family:var(--serif,inherit);font-weight:900}
.nt-row{display:flex;align-items:center;gap:8px}.nt-between{justify-content:space-between}
.nt-x{width:40px;height:40px;border-radius:12px;border:1px solid var(--nt-line,var(--line,#d6c6a6));background:var(--nt-card,var(--card,#fff));font-size:16px;cursor:pointer;color:inherit}
.nt-tabs{display:flex;gap:6px}
.nt-tabs button,.nt-chips button{flex:1 1 0;min-height:44px;border-radius:12px;border:1px solid var(--nt-line,var(--line,#d6c6a6));background:var(--nt-card,var(--card,#fff));color:inherit;font:inherit;font-size:14px;cursor:pointer;padding:4px}
.nt-tabs button[aria-pressed=true],.nt-chips button[aria-pressed=true]{background:var(--nt-ink,var(--ink,#2A1E14));color:var(--nt-bg,var(--paper,#fff));border-color:transparent;font-weight:700}
.nt-chips{display:flex;gap:6px}
.nt-lbl{font-size:13px;opacity:.7}
.nt-btn{height:52px;border-radius:14px;border:0;font:inherit;font-size:16px;font-weight:700;cursor:pointer;background:var(--nt-ink,var(--ink,#2A1E14));color:var(--nt-bg,var(--paper,#fff));width:100%}
.nt-btn.plain{background:var(--nt-card,var(--card,#fff));color:inherit;border:1px solid var(--nt-line,var(--line,#d6c6a6));font-weight:500}
.nt-btn:disabled{opacity:.45}
.nt-in{height:52px;border-radius:14px;border:1px solid var(--nt-line,var(--line,#d6c6a6));background:var(--nt-card,var(--card,#fff));color:inherit;font:inherit;font-size:18px;padding:0 14px;width:100%;box-sizing:border-box}
.nt-code{font-size:46px;font-weight:900;letter-spacing:10px;text-align:center;font-family:var(--serif,inherit)}
.nt-card{background:var(--nt-card,var(--card,#fff));border:1px solid var(--nt-line,var(--line,#d6c6a6));border-radius:14px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.nt-list{display:flex;flex-direction:column;gap:8px}
.nt-room{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;border:1px solid var(--nt-line,var(--line,#d6c6a6));background:var(--nt-card,var(--card,#fff));color:inherit;font:inherit;text-align:left;cursor:pointer;width:100%}
.nt-room b{font-size:15px}.nt-room small{display:block;font-size:12px;opacity:.7}
.nt-muted{font-size:13px;opacity:.7;text-align:center}
.nt-err{font-size:13px;color:#A8322D;min-height:18px}
.nt-dot{width:8px;height:8px;border-radius:50%;background:#2F6B3A;display:inline-block}
.nt-dot.off{background:#bbb}
.nt-bar{display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 10px;border-radius:10px;background:var(--nt-card,var(--card,#fff));border:1px solid var(--nt-line,var(--line,#d6c6a6))}
`;
let ui = null, cfgG = null, stopList = null, stopWait = null;
function el(h){ const d=document.createElement('div'); d.innerHTML=h.trim(); return d.firstChild; }
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mountUI(){
  if (ui) return;
  ui = el('<div class="nt-dim" role="dialog" aria-modal="true" aria-label="온라인 대전"><div class="nt-sheet" id="ntSheet"></div></div>');
  document.body.appendChild(ui);
  ui.addEventListener('click', e=>{ if (e.target===ui && !NET._waiting) NET.close(); });
}
NET.close = ()=>{ if (stopList){ stopList(); stopList=null; } if (stopWait){ stopWait(); stopWait=null; } NET._waiting=false; if (ui) ui.classList.remove('on'); };
function sheet(h){ const s = document.getElementById('ntSheet'); s.innerHTML = h; return s; }
let tab = 'make';
/* c: { game, title, max, seats(opts)->[{v,label}], optsHTML, bindOpts(root), getOpts(), seatPick(room, used), onStart(room, seat), minStart } */
NET.open = async (c, joinCode) => {
  cfgG = c; mountUI(); ui.classList.add('on');
  sheet('<div class="nt-muted" style="padding:30px 0">연결하는 중…</div>');
  try{ await ensure(); }
  catch(e){ sheet(head()+'<div class="nt-card"><b>온라인 대전 준비 중이에요</b><span class="nt-muted" style="text-align:left">아직 온라인 서버 설정이 안 됐어요. 설정이 끝나면 여기서 바로 대전할 수 있어요.</span></div>'); bindHead(); return; }
  if (!NET.name()){ askName(()=> joinCode ? doJoin(joinCode) : render()); return; }
  if (joinCode) doJoin(joinCode); else render();
};
function head(){ return '<div class="nt-row nt-between"><h2>온라인 대전 · '+esc(cfgG.title)+'</h2><button class="nt-x" data-nt-close aria-label="닫기">✕</button></div>'; }
function bindHead(){ const b=document.querySelector('[data-nt-close]'); if (b) b.onclick=()=>{ if (NET._waitCode){ leaveWaiting(); } NET.close(); }; }
function askName(next){
  sheet(head()+'<span class="nt-lbl">대전에서 보일 내 이름 (닉네임)</span><input class="nt-in" id="ntName" maxlength="10" placeholder="예: 형" value="'+esc(NET.name())+'"><div class="nt-err" id="ntErr"></div><button class="nt-btn" id="ntNameOk">확인</button>');
  bindHead();
  const go = ()=>{ const v=document.getElementById('ntName').value.trim(); if (!v){ document.getElementById('ntErr').textContent='이름을 입력해 주세요'; return; } LS.set('name', v.slice(0,10)); next(); };
  document.getElementById('ntNameOk').onclick = go; document.getElementById('ntName').onkeydown = e=>{ if (e.key==='Enter') go(); };
  setTimeout(()=>document.getElementById('ntName').focus(), 50);
}
function render(){
  if (stopList){ stopList(); stopList=null; }
  let h = head()+'<div class="nt-tabs" id="ntTabs"><button data-t="make">방 만들기</button><button data-t="code">번호로 들어가기</button><button data-t="list">열린 방</button></div>';
  if (tab==='make'){
    h += (cfgG.optsHTML||'')+'<span class="nt-lbl">방 공개</span><div class="nt-chips" id="ntPub"><button data-v="1">공개<br><small>열린 방 목록에 보임</small></button><button data-v="0">비공개<br><small>번호 아는 사람만</small></button></div><div class="nt-err" id="ntErr"></div><button class="nt-btn" id="ntMake">방 만들기</button>';
  } else if (tab==='code'){
    h += '<span class="nt-lbl">친구에게 받은 방 번호 4자리</span><input class="nt-in" id="ntCode" inputmode="numeric" maxlength="4" placeholder="0000" style="text-align:center;letter-spacing:8px;font-size:26px"><div class="nt-err" id="ntErr"></div><button class="nt-btn" id="ntJoin">들어가기</button>';
  } else {
    h += '<div class="nt-list" id="ntList"><div class="nt-muted">찾는 중…</div></div><div class="nt-err" id="ntErr"></div>';
  }
  h += '<div class="nt-muted">내 이름: <b>'+esc(NET.name())+'</b> · <a href="#" id="ntRename" style="color:inherit">바꾸기</a></div>';
  sheet(h); bindHead();
  document.querySelectorAll('#ntTabs button').forEach(b=>{ b.setAttribute('aria-pressed', String(b.dataset.t===tab)); b.onclick=()=>{ tab=b.dataset.t; render(); }; });
  document.getElementById('ntRename').onclick = e=>{ e.preventDefault(); askName(render); };
  if (tab==='make'){
    if (cfgG.bindOpts) cfgG.bindOpts(document.getElementById('ntSheet'));
    let pub = LS.get('pub', 1);
    const sp = ()=>document.querySelectorAll('#ntPub button').forEach(b=>{ b.setAttribute('aria-pressed', String(+b.dataset.v===pub)); b.onclick=()=>{ pub=+b.dataset.v; LS.set('pub',pub); sp(); }; }); sp();
    document.getElementById('ntMake').onclick = async ()=>{
      const btn = document.getElementById('ntMake'); btn.disabled = true;
      try{ const o = cfgG.getOpts(); const code = await NET.create(cfgG.game, { pub:!!pub, max:o.max||cfgG.max||2, opts:o.opts, seat:o.seat, name:NET.name() }); waiting(code); }
      catch(e){ document.getElementById('ntErr').textContent = '방을 만들지 못했어요. 인터넷 연결을 확인해 주세요.'; btn.disabled=false; }
    };
  } else if (tab==='code'){
    const inp = document.getElementById('ntCode'); setTimeout(()=>inp.focus(),50);
    const go = ()=>{ const v=inp.value.replace(/\D/g,''); if (v.length!==4){ document.getElementById('ntErr').textContent='4자리 숫자를 넣어주세요'; return; } doJoin(v); };
    document.getElementById('ntJoin').onclick = go; inp.onkeydown = e=>{ if (e.key==='Enter') go(); };
  } else {
    NET.watchList(cfgG.game, rooms=>{
      const L = document.getElementById('ntList'); if (!L) return;
      const open = rooms.filter(r=>r && r.pub && r.status==='wait' && r.t > NET.since() && Object.keys(r.seats||{}).length < (r.max||2) && r.host!==uid).sort((a,b)=>b.t-a.t);
      L.innerHTML = open.length ? open.map(r=>{ const names=Object.values(r.seats||{}).map(s=>esc(s.name)).join(', '); return '<button class="nt-room" data-c="'+esc(r.code)+'"><span style="flex-grow:1"><b>'+names+'</b> 님의 방<small>'+esc(cfgG.describe ? cfgG.describe(r.opts||{}) : '')+' · '+Object.keys(r.seats||{}).length+'/'+(r.max||2)+'명</small></span><b>'+esc(r.code)+'</b></button>'; }).join('')
        : '<div class="nt-card"><span class="nt-muted">지금 열린 방이 없어요.<br>방을 만들고 친구를 불러보세요.</span></div>';
      L.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>doJoin(b.dataset.c));
    }).then(s=>{ stopList = s; });
  }
}
async function doJoin(code){
  sheet(head()+'<div class="nt-muted" style="padding:24px 0">'+esc(code)+'번 방에 들어가는 중…</div>'); bindHead();
  try{
    const room = await NET.join(cfgG.game, code, NET.name(), cfgG.seatPick || ((r, used)=>{ for (let s=0;s<(r.max||2);s++) if (!used.includes(s)) return s; return null; }));
    const seat = NET.mySeat(room);
    if (room.status==='wait' && (room.max||2)>2){ waiting(code); return; }
    NET.close(); cfgG.onStart(room, seat);
  }catch(e){ tab='code'; render(); const er=document.getElementById('ntErr'); if (er) er.textContent = e.message==='noconfig' ? '온라인 설정이 아직 없어요' : (e.message||'들어가지 못했어요'); }
}
function shareURL(code){ const u = new URL(location.href); u.search=''; u.hash=''; u.searchParams.set('room', code); return u.toString(); }
function waiting(code){
  NET._waiting = true; NET._waitCode = code;
  const g = cfgG;
  sheet(head()+'<div class="nt-muted">방 번호를 친구에게 알려주세요</div><div class="nt-code">'+esc(code)+'</div>'+
    '<div class="nt-row"><button class="nt-btn plain" id="ntShare">카톡 등으로 초대</button><button class="nt-btn plain" id="ntCopy">번호 복사</button></div>'+
    '<div class="nt-card" id="ntPeople"></div><div class="nt-err" id="ntErr"></div><button class="nt-btn" id="ntStart" hidden>지금 시작</button><button class="nt-btn plain" id="ntCancel">방 닫기</button>');
  bindHead();
  document.getElementById('ntShare').onclick = async ()=>{ const url = shareURL(code), text = '수담 '+g.title+' 한 판 해요! 방 번호 '+code;
    if (navigator.share){ try{ await navigator.share({ title:'수담 '+g.title, text, url }); }catch(e){} }
    else { try{ await navigator.clipboard.writeText(text+'\n'+url); document.getElementById('ntErr').textContent='초대 문구를 복사했어요. 카톡에 붙여넣으세요.'; }catch(e){} } };
  document.getElementById('ntCopy').onclick = async ()=>{ try{ await navigator.clipboard.writeText(code); document.getElementById('ntErr').textContent='번호를 복사했어요'; }catch(e){ document.getElementById('ntErr').textContent='번호: '+code; } };
  document.getElementById('ntCancel').onclick = ()=>{ leaveWaiting(); NET.close(); };
  NET.watch(g.game, code, room=>{
    if (!room){ return; }
    const seats = Object.keys(room.seats||{}).map(k=>({ s:+k.slice(1), ...room.seats[k] })).sort((a,b)=>a.s-b.s);
    const P = document.getElementById('ntPeople');
    if (P) P.innerHTML = '<span class="nt-lbl">들어온 사람 '+seats.length+'/'+(room.max||2)+'</span>'+seats.map(s=>'<div class="nt-row"><span class="nt-dot"></span><b>'+esc(s.name)+'</b><span class="nt-muted" style="margin-left:auto">'+esc(g.seatName ? g.seatName(s.s, room) : '')+(s.uid===uid?' · 나':'')+'</span></div>').join('')+(seats.length<(room.max||2)?'<span class="nt-muted" style="text-align:left">상대를 기다리는 중…</span>':'');
    const isHost = room.host===uid, sb = document.getElementById('ntStart');
    if (sb){ sb.hidden = !(isHost && (room.max||2)>2 && room.status==='wait' && seats.length>=(g.minStart||2));
      sb.onclick = async ()=>{ sb.disabled=true; await NET.update(g.game, code, { status:'play' }); }; }
    if (room.status==='play'){ const seat = NET.mySeat(room); NET._waiting=false; NET._waitCode=null; NET.close(); g.onStart(room, seat); }
    if (room.status==='closed'){ NET._waiting=false; NET._waitCode=null; NET.close(); }
  }).then(s=>{ stopWait = s; });
}
async function leaveWaiting(){
  const code = NET._waitCode, g = cfgG; NET._waiting=false; NET._waitCode=null; if (!code) return;
  try{ const be = await ensure(); await be.tx(rp(g.game, code), cur=>{ if (!cur) return cur; if (cur.status!=='wait') return undefined;
    if (cur.host===uid){ cur.status='closed'; return cur; }
    for (const k in cur.seats||{}) if (cur.seats[k].uid===uid) delete cur.seats[k]; return cur; }); }catch(e){}
}
// 링크로 들어온 경우 (?room=1234)
NET.linkCode = () => { const m = /[?&]room=(\d{4})/.exec(location.search); return m ? m[1] : null; };
NET.clearLink = () => { try{ const u=new URL(location.href); u.searchParams.delete('room'); history.replaceState(null,'',u.toString()); }catch(e){} };

// 게임 화면 위 작은 연결 표시줄
NET.statusBar = (host, room, seatName) => {
  if (!host) return;
  const seats = Object.keys((room&&room.seats)||{}).map(k=>({ s:+k.slice(1), ...room.seats[k] })).sort((a,b)=>a.s-b.s);
  host.innerHTML = '<span>방 '+esc(room.code)+'</span>'+seats.map(s=>{ const on = !room.on || room.on[s.uid]!==false; return '<span class="nt-row" style="gap:4px"><span class="nt-dot'+(on?'':' off')+'"></span>'+esc(s.name)+(s.uid===uid?'(나)':'')+'</span>'; }).join('<span style="opacity:.4">·</span>');
};
NET.css = css;
(function(){ const st = document.createElement('style'); st.textContent = css; (document.head||document.documentElement).appendChild(st); })();
})();
