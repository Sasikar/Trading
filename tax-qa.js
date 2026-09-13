(()=>{
const owner='Sasikar', repo='Trading';
const TOKEN_KEY='trading_tax_github_token';
const QA_PATH='data/tax-qa.json';
const NOTES_PATH='data/tax-notes.json';

const tokenEl=document.getElementById('token');
const q=document.getElementById('question');
const a=document.getElementById('answer');
const mic=document.getElementById('mic');
const save=document.getElementById('save');
const clear=document.getElementById('clear');
const history=document.getElementById('history');
const status=document.getElementById('status');

const noteText=document.getElementById('note-text');
const noteSave=document.getElementById('note-save');
const noteClear=document.getElementById('note-clear');
const noteHistory=document.getElementById('note-history');
const noteStatus=document.getElementById('note-status');

let token=localStorage.getItem(TOKEN_KEY)||localStorage.getItem('trading_github_token')||'';
if(tokenEl) tokenEl.value=token;

let items=[], fileSha='';
let notes=[], notesSha='';

const api=(path)=>'https://api.github.com/repos/'+owner+'/'+repo+'/contents/'+path;
const msg=(t)=>{ if(status) status.textContent=t; };
const nmsg=(t)=>{ if(noteStatus) noteStatus.textContent=t; };

function b64encode(str){
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(b64){
  return decodeURIComponent(escape(atob((b64||'').replace(/\s/g,''))));
}

/* tabs */
document.querySelectorAll('.subtabs button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.subtabs button').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    const id=btn.getAttribute('data-panel');
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('on'));
    const panel=document.getElementById('panel-'+id);
    if(panel) panel.classList.add('on');
  });
});

/* ----- Tax QA ----- */
const render=()=>{
  history.innerHTML='';
  if(!items.length){ history.innerHTML='<div class="qa">No Q&A saved yet.</div>'; return; }
  items.forEach(x=>{
    const el=document.createElement('article'); el.className='qa';
    const d=document.createElement('div'); d.className='date'; d.textContent=new Date(x.t).toLocaleString();
    const qq=document.createElement('div'); qq.className='q'; qq.textContent='Q: '+x.q;
    const aa=document.createElement('div'); aa.className='a'; aa.textContent='A: '+x.a;
    el.append(d,qq,aa); history.appendChild(el);
  });
};

const load=async()=>{
  token=(tokenEl&&tokenEl.value.trim())||token;
  try{
    const r=await fetch(api(QA_PATH)+'?ref=master',{headers:token?{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}:{Accept:'application/vnd.github+json'},cache:'no-store'});
    if(r.status===404){ items=[]; fileSha=''; render(); msg(token?'Ready to create permanent history.':'Enter your GitHub token first.'); return; }
    if(!r.ok) throw Error(r.status);
    const j=await r.json();
    fileSha=j.sha;
    items=JSON.parse(b64decode(j.content));
    if(!Array.isArray(items)) items=[];
    render();
    msg('Permanent history loaded from GitHub.');
  }catch(e){
    render();
    msg(token?'Could not load GitHub history. Check token access.':'Enter your GitHub token to load permanent history.');
  }
};

const saveQ=async()=>{
  const qt=q.value.trim(), at=a.value.trim();
  if(!qt||!at){ msg('Enter both the question and answer.'); return; }
  token=(tokenEl&&tokenEl.value.trim())||'';
  if(!token){ msg('Enter your GitHub token first.'); return; }
  localStorage.setItem(TOKEN_KEY,token);
  const old=items;
  items=[{q:qt,a:at,t:Date.now()},...items];
  save.disabled=true; msg('Saving permanently to GitHub…');
  try{
    // refresh sha
    try{
      const gr=await fetch(api(QA_PATH)+'?ref=master',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},cache:'no-store'});
      if(gr.ok){ const gj=await gr.json(); fileSha=gj.sha; }
      else if(gr.status===404) fileSha='';
    }catch(e){}
    const body={message:'Update Tax QA history',content:b64encode(JSON.stringify(items,null,2)),branch:'master'};
    if(fileSha) body.sha=fileSha;
    const r=await fetch(api(QA_PATH),{method:'PUT',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw Error(await r.text());
    const j=await r.json();
    fileSha=j.content&&j.content.sha;
    q.value=''; a.value='';
    render(); msg('Saved permanently to GitHub.');
  }catch(e){
    items=old; msg('Save failed. Check token has Contents: Read and write permission.');
  }finally{ save.disabled=false; }
};

save.onclick=saveQ;
clear.onclick=()=>{ q.value=''; a.value=''; msg(''); };
if(tokenEl) tokenEl.onchange=()=>{ token=tokenEl.value.trim(); localStorage.setItem(TOKEN_KEY,token); load(); loadNotes(); };

const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!SR){ mic.onclick=()=>msg('Voice input is not supported by this browser. Try Chrome on Android.'); }
else{
  const r=new SR(); r.lang='en-IN'; r.interimResults=true; r.continuous=false; let base='';
  r.onstart=()=>{ mic.classList.add('listening'); msg('Listening… speak naturally.'); base=q.value.trim(); };
  r.onresult=e=>{ let finalText='', interim=''; for(let i=e.resultIndex;i<e.results.length;i++){ const t=e.results[i][0].transcript; if(e.results[i].isFinal) finalText+=t; else interim+=t; } if(finalText) q.value=(base?(base+' '):'')+finalText; q.dataset.interim=interim; };
  r.onerror=e=>msg('Voice input error: '+e.error);
  r.onend=()=>{ mic.classList.remove('listening'); if(q.dataset.interim){ q.value+=(q.value?' ':'')+q.dataset.interim; q.dataset.interim=''; } msg('Voice captured. Review and save.'); };
  mic.onclick=()=>{ try{ r.start(); }catch(e){} };
}

/* ----- Notes ----- */
const renderNotes=()=>{
  noteHistory.innerHTML='';
  if(!notes.length){ noteHistory.innerHTML='<div class="note-card">No notes yet.</div>'; return; }
  notes.forEach((x,i)=>{
    const el=document.createElement('article'); el.className='note-card';
    const d=document.createElement('div'); d.className='date'; d.textContent=new Date(x.t).toLocaleString();
    const body=document.createElement('div'); body.className='body'; body.textContent=x.text||'';
    const del=document.createElement('button'); del.className='del'; del.type='button'; del.textContent='Delete';
    del.onclick=()=>deleteNote(i);
    el.append(d,body,del); noteHistory.appendChild(el);
  });
};

const loadNotes=async()=>{
  token=(tokenEl&&tokenEl.value.trim())||token;
  try{
    const r=await fetch(api(NOTES_PATH)+'?ref=master',{headers:token?{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}:{Accept:'application/vnd.github+json'},cache:'no-store'});
    if(r.status===404){ notes=[]; notesSha=''; renderNotes(); nmsg(token?'Ready to save notes.':'Enter token, then submit a note.'); return; }
    if(!r.ok) throw Error(r.status);
    const j=await r.json();
    notesSha=j.sha;
    const data=JSON.parse(b64decode(j.content));
    notes=Array.isArray(data)?data:(data&&data.notes)||[];
    renderNotes();
    nmsg('Notes loaded from GitHub · '+notes.length);
  }catch(e){
    // public raw fallback
    try{
      const r=await fetch(NOTES_PATH+'?t='+Date.now(),{cache:'no-store'});
      if(r.ok){
        const data=await r.json();
        notes=Array.isArray(data)?data:(data&&data.notes)||[];
        renderNotes();
        nmsg('Notes loaded (public) · '+notes.length);
        return;
      }
    }catch(e2){}
    renderNotes();
    nmsg(token?'Could not load notes.':'Enter GitHub token to load/save notes.');
  }
};

const saveNotesFile=async(nextNotes, message)=>{
  token=(tokenEl&&tokenEl.value.trim())||'';
  if(!token) throw new Error('Enter your GitHub token first.');
  localStorage.setItem(TOKEN_KEY,token);
  // refresh sha
  try{
    const gr=await fetch(api(NOTES_PATH)+'?ref=master',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},cache:'no-store'});
    if(gr.ok){ const gj=await gr.json(); notesSha=gj.sha; }
    else if(gr.status===404) notesSha='';
  }catch(e){}
  const payload={ updated:new Date().toISOString(), count:nextNotes.length, notes:nextNotes };
  const body={ message: message||('Tax notes update ('+nextNotes.length+')'), content:b64encode(JSON.stringify(payload,null,2)), branch:'master' };
  if(notesSha) body.sha=notesSha;
  const r=await fetch(api(NOTES_PATH),{method:'PUT',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(await r.text());
  const j=await r.json();
  notesSha=j.content&&j.content.sha;
  notes=nextNotes;
};

const submitNote=async()=>{
  const text=(noteText.value||'').trim();
  if(!text){ nmsg('Write a note first.'); return; }
  noteSave.disabled=true; nmsg('Saving note to GitHub…');
  const old=notes.slice();
  const next=[{ text, t:Date.now() }, ...notes];
  try{
    await saveNotesFile(next, 'Add tax note');
    noteText.value='';
    renderNotes();
    nmsg('Note saved · data/tax-notes.json');
  }catch(e){
    notes=old;
    nmsg('Save failed: '+(e&&e.message||e));
  }finally{ noteSave.disabled=false; }
};

const deleteNote=async(i)=>{
  if(!confirm('Delete this note?')) return;
  const old=notes.slice();
  const next=notes.filter((_,idx)=>idx!==i);
  nmsg('Deleting…');
  try{
    await saveNotesFile(next, 'Delete tax note');
    renderNotes();
    nmsg('Deleted · '+notes.length+' left');
  }catch(e){
    notes=old;
    nmsg('Delete failed: '+(e&&e.message||e));
  }
};

noteSave.onclick=submitNote;
noteClear.onclick=()=>{ noteText.value=''; nmsg(''); };

load();
loadNotes();
})();
