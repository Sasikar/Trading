/* MACRO TIMEFRAME FIX — true calendar-aligned 3M/6M/1Y construction. */
(function(){
  const ORIGINAL='./overview-app.js?v=20260905-macro1';

  function patchMacroSeriesSource(src){
    const re=/async function fetchMacroSeries\(\)\{[\s\S]*?\n\}/;
    const replacement=`function aggregateMacroCalendar(kl, monthsPerBar, label){
  if(!kl||!kl.length) return [];
  const buckets=new Map();
  for(const k of kl){
    const ts=+k[0];
    if(!Number.isFinite(ts)) continue;
    const d=new Date(ts);
    const y=d.getUTCFullYear();
    const m=d.getUTCMonth();
    let startMonth;
    if(monthsPerBar===12) startMonth=0;
    else if(monthsPerBar===6) startMonth=m<6?0:6;
    else if(monthsPerBar===3) startMonth=Math.floor(m/3)*3;
    else continue;
    const key=y+'-'+String(startMonth+1).padStart(2,'0');
    if(!buckets.has(key)) buckets.set(key,[]);
    buckets.get(key).push(k);
  }
  const out=[];
  for(const [key,rows] of [...buckets.entries()].sort((a,b)=>a[0].localeCompare(b[0]))){
    rows.sort((a,b)=>a[0]-b[0]);
    const first=rows[0], last=rows[rows.length-1];
    const expected=monthsPerBar;
    if(rows.length!==expected) continue; // never create partial higher-TF candles
    const firstDate=new Date(first[0]);
    const lastDate=new Date(last[0]);
    const expectedLastMonth=firstDate.getUTCMonth()+expected-1;
    if(firstDate.getUTCFullYear()!==lastDate.getUTCFullYear() && monthsPerBar!==12) continue;
    if(lastDate.getUTCMonth()!==expectedLastMonth) continue;
    let h=-Infinity,l=Infinity,v=0;
    for(const k of rows){ h=Math.max(h,+k[2]); l=Math.min(l,+k[3]); v+=(+k[5]||0); }
    out.push([first[0],+first[1],h,l,+last[4],v]);
  }
  return out;
}

async function fetchMacroSeries(){
  /* Native 1M history + calendar-aligned 3M/6M/1Y. Completed higher-TF candles only. */
  const m1=await fetchKlines('1M', 240);
  const completedM1=m1.filter(k=>{
    const d=new Date(+k[0]);
    const n=new Date();
    return d.getUTCFullYear()<n.getUTCFullYear() || d.getUTCMonth()<n.getUTCMonth();
  });
  const m3=aggregateMacroCalendar(completedM1,3,'3M');
  const m6=aggregateMacroCalendar(completedM1,6,'6M');
  const y1=aggregateMacroCalendar(completedM1,12,'1Y');
  return {m1:completedM1,m3,m6,y1};
}`;
    if(!re.test(src)) throw new Error('MACRO fetchMacroSeries block not found');
    return src.replace(re,replacement);
  }

  fetch(ORIGINAL,{cache:'no-store',credentials:'same-origin'})
    .then(r=>{if(!r.ok)throw new Error('overview-app.js '+r.status);return r.text();})
    .then(src=>patchMacroSeriesSource(src))
    .then(src=>{
      const blob=new Blob([src+'\n//# sourceURL=overview-app-macro-fixed.js'],{type:'text/javascript'});
      const s=document.createElement('script');
      s.src=URL.createObjectURL(blob);
      s.onload=()=>setTimeout(()=>URL.revokeObjectURL(s.src),1000);
      s.onerror=()=>console.error('Macro fixed overview script failed to execute');
      document.head.appendChild(s);
    })
    .catch(e=>console.error('Macro timeframe fix failed:',e));
})();
