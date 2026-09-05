/* NASDAQ_LIVE_RETRY2 */
/* NASDAQ_LIVE_LABEL_V1 */
/* NASDAQ_STATIC_V2 */
(function(){
const $=id=>document.getElementById(id);
const fmt=(n,d)=>n==null||!isFinite(n)?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:d!=null?d:(n>=1000?0:2)});
const money=n=>n==null?'—':'$'+fmt(n,n>=1000?0:2);
const TF={'4h':{interval:'4h',label:'4H',limit:100,swing:50,volAvg:20,fibBars:40,macdBars:40,rightOff:8,barSp:5},'1d':{interval:'1d',label:'1D',limit:120,swing:60,volAvg:20,fibBars:40,macdBars:50,rightOff:10,barSp:6},'1w':{interval:'1w',label:'1W',limit:80,swing:26,volAvg:20,fibBars:26,macdBars:40,rightOff:8,barSp:12},'1M':{interval:'1M',label:'1M',limit:48,swing:18,volAvg:12,fibBars:18,macdBars:24,rightOff:6,barSp:14}};
let currentTF='trend',fibChart,fibSeries,fibVol,fibLines=[],macdChart,macdLineS,sigLineS,histS;
async function jget(url){
  try{
    // static JSON same-origin; external APIs omit credentials
    const abs=/^https?:\/\//i.test(url);
    const r=await fetch(url,{cache:'no-store',credentials:abs?'omit':'same-origin'});
    if(!r.ok) return null;
    const ct=(r.headers.get('content-type')||'');
    if(ct.includes('text/html')) return null;
    return await r.json();
  }catch(e){return null;}
}
async function loadMarket(){
  /* GitHub Pages only — browser-direct APIs + static JSON. No Worker /api/*. */
  const set=(id,txt,col)=>{const el=$(id);if(!el)return;el.textContent=txt;if(col)el.style.color=col;};
  let any=false;
  // BTC / ETH — Kraken primary, CoinGecko fallback
  try{
    let btc=null,eth=null,src='';
    try{
      const j=await jget('https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD');
      const r=j&&j.result||{};
      const b=r.XXBTZUSD||r.XBTUSD; const e=r.XETHZUSD||r.ETHUSD;
      if(b){btc={price:+b.c[0], pct:((+b.c[0]-+b.o)/+b.o)*100};}
      if(e){eth={price:+e.c[0], pct:((+e.c[0]-+e.o)/+e.o)*100};}
      if(btc||eth) src='Kraken';
    }catch(e){}
    if(!btc||!eth){
      try{
        const d=await jget('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
        if(!btc&&d&&d.bitcoin) btc={price:+d.bitcoin.usd, pct:+d.bitcoin.usd_24h_change};
        if(!eth&&d&&d.ethereum) eth={price:+d.ethereum.usd, pct:+d.ethereum.usd_24h_change};
        if(!src) src='CoinGecko';
        else src=src+'+CG';
      }catch(e){}
    }
    if(btc){set('btc-price', money(btc.price)); set('btc-change', (btc.pct>=0?'+':'')+btc.pct.toFixed(2)+'%', btc.pct>=0?'#62e3a0':'#ff6f7c'); any=true;}
    else set('btc-price','—');
    if(eth){set('eth-price', money(eth.price)); set('eth-change', (eth.pct>=0?'+':'')+eth.pct.toFixed(2)+'%', eth.pct>=0?'#62e3a0':'#ff6f7c'); any=true;}
    else set('eth-price','—');
    if($('market-source')) $('market-source').textContent=src||'OFFLINE';
  }catch(e){console.warn('btc/eth',e);}

  // NASDAQ — static snapshot first (Pages-stable)
  try{
    let snap=null;
    try{ snap=await jget('./nasdaq.json'); }catch(e){ try{snap=await jget('/nasdaq.json');}catch(e2){} }
    if(snap&&snap.price!=null){
      const pct=snap.pct!=null?+snap.pct:(snap.change_pct!=null?+snap.change_pct:null);
      set('ndx-price', money(+snap.price));
      if(pct!=null) set('ndx-change', (pct>=0?'+':'')+(+pct).toFixed(2)+'%', pct>=0?'#62e3a0':'#ff6f7c');
      const age=snap.updated?Math.max(0, Date.now()-Number(snap.updated)):null;
      const ageTxt=age==null?'':(age<3600000?(age/60000).toFixed(0)+'m':(age/3600000).toFixed(1)+'h');
      if($('ndx-src')) $('ndx-src').textContent='SNAPSHOT'+(ageTxt?' · '+ageTxt:'');
      any=true;
    } else {
      set('ndx-price','—');
      if($('ndx-src')) $('ndx-src').textContent='UNAVAILABLE';
    }
  }catch(e){console.warn('nasdaq',e); set('ndx-price','—');}

  // Fear & Greed — browser-direct
  try{
    let fg=null;
    try{ fg=await jget('https://api.alternative.me/fng/?limit=1'); }catch(e){}
    const row=fg&&fg.data&&fg.data[0];
    if(row){
      const v=+row.value; const lab=row.value_classification||'';
      set('fg-price', String(v));
      set('fg-change', lab, v>=55?'#62e3a0':(v<=45?'#ff6f7c':'#e6c878'));
      any=true;
    } else {
      set('fg-price','—'); set('fg-change','Unavailable');
    }
  }catch(e){console.warn('fng',e); set('fg-price','—'); set('fg-change','Unavailable');}

  if($('mkt-status')) $('mkt-status').textContent=any?'LIVE / SNAPSHOT':'OFFLINE';
}

async function fetchKlines(interval,limit){
  /* Browser-direct: Kraken for 4h/1d/1w. True 1M from static data/btc-monthly.json — never 21600. */
  if(interval==='1M'){
    let raw=null;
    for(const u of ['./data/btc-monthly.json','data/btc-monthly.json']){
      raw=await jget(u); if(raw&&raw.length) break;
    }
    if(!raw||!raw.length) throw new Error('btc-monthly.json empty');
    const rows=raw.map(r=>[r.ts||Date.parse(r.time+'-01T00:00:00Z'),+r.open,+r.high,+r.low,+r.close,+(r.volume||0)])
      .filter(k=>Number.isFinite(k[0])).sort((a,b)=>a[0]-b[0]);
    // drop forming month
    const now=new Date(), cy=now.getUTCFullYear(), cm=now.getUTCMonth()+1;
    const done=rows.filter(k=>{const d=new Date(k[0]); return !(d.getUTCFullYear()===cy&&d.getUTCMonth()+1===cm);});
    return done.slice(-Math.min(limit,done.length));
  }
  const iv={ '4h':240,'1d':1440,'1w':10080,'1h':60 }[interval];
  if(!iv) throw new Error('unsupported interval '+interval);
  const j=await jget('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval='+iv);
  const rows=(j&&j.result&&(j.result.XXBTZUSD||j.result.XBTUSD))||[];
  if(!rows.length) throw new Error('kraken empty '+interval);
  const slice=rows.slice(-Math.min(limit,rows.length));
  return slice.map(k=>[k[0]*1000,+k[1],+k[2],+k[3],+k[4],+k[6]]);
}
function ymUTC(ts){
  const d=new Date(+ts);
  return {y:d.getUTCFullYear(), m:d.getUTCMonth()+1}; // m=1..12
}
function completedMonthlyOnly(kl){
  /* Drop the currently forming calendar month (UTC). */
  if(!kl||!kl.length) return [];
  const now=new Date();
  const cy=now.getUTCFullYear(), cm=now.getUTCMonth()+1;
  return kl.filter(k=>{
    const {y,m}=ymUTC(k[0]);
    return !(y===cy && m===cm);
  });
}
function bucketOHLC(months){
  /* months: array of [ts,o,h,l,c,v] sorted oldest-first, all complete */
  if(!months||!months.length) return null;
  let h=-Infinity,l=Infinity,v=0;
  for(const k of months){h=Math.max(h,+k[2]);l=Math.min(l,+k[3]);v+=(+k[5]||0);}
  return [months[0][0], +months[0][1], h, l, +months[months.length-1][4], v];
}
function calendar3M(m1){
  /* Complete quarters only: Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec */
  const by={};
  for(const k of m1){
    const {y,m}=ymUTC(k[0]);
    const q=Math.floor((m-1)/3); // 0..3
    const key=y+'-Q'+q;
    if(!by[key]) by[key]={y,q,months:[]};
    by[key].months.push(k);
  }
  const out=[];
  const keys=Object.keys(by).sort();
  for(const key of keys){
    const b=by[key];
    if(b.months.length!==3) continue; // incomplete quarter excluded
    b.months.sort((a,c)=>a[0]-c[0]);
    const c=bucketOHLC(b.months);
    if(c) out.push(c);
  }
  return out;
}
function calendar6M(m1){
  /* Complete halves only: H1 Jan-Jun, H2 Jul-Dec */
  const by={};
  for(const k of m1){
    const {y,m}=ymUTC(k[0]);
    const h=m<=6?1:2;
    const key=y+'-H'+h;
    if(!by[key]) by[key]={y,h,months:[]};
    by[key].months.push(k);
  }
  const out=[];
  for(const key of Object.keys(by).sort()){
    const b=by[key];
    if(b.months.length!==6) continue; // incomplete half excluded
    b.months.sort((a,c)=>a[0]-c[0]);
    const c=bucketOHLC(b.months);
    if(c) out.push(c);
  }
  return out;
}
function calendar1Y(m1){
  /* Complete calendar years only: Jan-Dec */
  const by={};
  for(const k of m1){
    const {y,m}=ymUTC(k[0]);
    if(!by[y]) by[y]={months:[]};
    by[y].months.push(k);
  }
  const out=[];
  for(const y of Object.keys(by).map(Number).sort((a,b)=>a-b)){
    const months=by[y].months;
    if(months.length!==12) continue; // incomplete year excluded
    months.sort((a,c)=>a[0]-c[0]);
    const c=bucketOHLC(months);
    if(c) out.push(c);
  }
  return out;
}
async function fetchMacroSeries(){
  /* Pages-only: true monthly from data/btc-monthly.json — never Worker, never Kraken 21600. */
  let raw=[];
  for(const u of ['./data/btc-monthly.json','/data/btc-monthly.json','data/btc-monthly.json']){
    try{
      const r=await fetch(u,{cache:'no-store'});
      if(!r.ok) continue;
      const j=await r.json();
      if(Array.isArray(j)&&j.length){ raw=j; break; }
    }catch(e){}
  }
  if(!raw.length) throw new Error('btc-monthly.json missing/empty');
  // normalize → [ts,o,h,l,c,v]
  let m1raw=[];
  for(const row of raw){
    const ts=row.ts!=null?+row.ts:(row.time?Date.parse(String(row.time)+'-01T00:00:00Z'):NaN);
    if(!Number.isFinite(ts)) continue;
    m1raw.push([ts, +row.open, +row.high, +row.low, +row.close, +(row.volume||0)]);
  }
  // dedupe by UTC year-month
  const by={};
  for(const k of m1raw){
    const {y,m}=ymUTC(k[0]);
    by[y+'-'+String(m).padStart(2,'0')]=k;
  }
  m1raw=Object.keys(by).sort().map(k=>by[k]);
  const m1=completedMonthlyOnly(m1raw);
  if(m1.length<5) throw new Error('macro need ≥5 completed months');
  return {m1, m3:calendar3M(m1), m6:calendar6M(m1), y1:calendar1Y(m1)};
}
async function fetchPrice(){
  try{
    const j=await jget('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
    const b=j&&j.result&&(j.result.XXBTZUSD||j.result.XBTUSD);
    if(b) return +b.c[0];
  }catch(e){}
  try{
    const d=await jget('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    if(d&&d.bitcoin) return +d.bitcoin.usd;
  }catch(e){}
  return null;
}
async function loadMarketStructure(direction,klDaily){const statusEl=$('ms-status'),subEl=$('ms-sub');const set=(id,v,h)=>{if($(id))$(id).textContent=v;if(h&&$(id+'-h'))$(id+'-h').textContent=h;};try{const rows=Array.isArray(klDaily)&&klDaily.length>16?klDaily.slice(0,-1):[];if(rows.length>=15){const trs=[];for(let i=1;i<rows.length;i++){const h=+rows[i][2],l=+rows[i][3],pc=+rows[i-1][4];trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));}const atr=trs.slice(-14).reduce((a,b)=>a+b,0)/14;const mark=+rows[rows.length-1][4];const bull=direction==='BULLISH';const inv=bull?mark-1.5*atr:mark+1.5*atr;const pct=Math.abs(inv-mark)/mark*100;set('ms-atr',money(inv)+' · '+pct.toFixed(1)+'%',(bull?'below':'above')+' mark');}else set('ms-atr','Data Unavailable');}catch(e){set('ms-atr','Data Unavailable');}set('ms-liq','Data Unavailable','no estimated levels');let book=null,fetchedAt=null;
/* Orderbook unavailable on GitHub Pages (no Worker proxy) */
if(!book||!book.bids||!book.asks||!book.bids.length){if(statusEl){statusEl.className='struct-status unav';statusEl.textContent='⚪ Unavailable';}if(subEl)subEl.textContent='Orderbook unavailable on static Pages.';set('ms-spread','Data Unavailable');set('ms-bid','Data Unavailable');set('ms-conc','Data Unavailable');set('ms-fresh','Data Unavailable');return;}
const ageMs=Date.now()-(fetchedAt||(book.ts?+book.ts:Date.now()));
if(ageMs>300000){if(statusEl){statusEl.className='struct-status unav';statusEl.textContent='⚪ Unavailable';}if(subEl)subEl.textContent='Book stale >5m.';set('ms-fresh',(ageMs/1000).toFixed(1)+'s','stale');set('ms-spread','Data Unavailable');set('ms-bid','Data Unavailable');set('ms-conc','Data Unavailable');return;}set('ms-fresh',(ageMs/1000).toFixed(2)+'s',ageMs>5000?'ok':'fresh');const bestBid=+book.bids[0][0],bestAsk=+book.asks[0][0],mid=(bestBid+bestAsk)/2,spreadBps=((bestAsk-bestBid)/mid)*10000;const key='ms_spread_samples_v1';let samples=[];try{samples=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){}samples.push({t:Date.now(),bps:spreadBps});while(samples.length>40)samples.shift();try{localStorage.setItem(key,JSON.stringify(samples));}catch(e){}const nums=samples.map(x=>x.bps).filter(x=>isFinite(x)).sort((a,b)=>a-b);const med=nums.length>=5?nums[Math.floor(nums.length/2)]:null;const wide=med!=null?spreadBps>3*med:spreadBps>5;set('ms-spread',spreadBps.toFixed(2)+' bps',(wide?'Wide':'Normal')+(med!=null?' vs med '+med.toFixed(2):''));let bid2=0,ask2=0,bid05=0,ask05=0;for(const [p,sz] of book.bids){const price=+p,n=price*+sz,pct=(mid-price)/mid*100;if(pct<=2)bid2+=n;if(pct<=0.5)bid05+=n;}for(const [p,sz] of book.asks){const price=+p,n=price*+sz,pct=(price-mid)/mid*100;if(pct<=2)ask2+=n;if(pct<=0.5)ask05+=n;}const total2=bid2+ask2,bull=direction==='BULLISH',side=total2>0?((bull?bid2:ask2)/total2)*100:null;if(side==null)set('ms-bid','Data Unavailable');else set('ms-bid',side.toFixed(1)+'%',(bull?'Bid':'Ask')+(side<40?' · thin':''));const conc=total2>0?((bid05+ask05)/total2)*100:null;if(conc==null)set('ms-conc','Data Unavailable');else set('ms-conc',conc.toFixed(1)+'%','not support guarantee');const warnings=[];if(wide)warnings.push('wide spread');if(side!=null&&side<40)warnings.push(bull?'thin bid':'thin ask');let status='Protected',cls='prot',icon='🟢';if(warnings.length>=2||(side!=null&&side<40&&wide)){status='Vulnerable';cls='vuln';icon='🔴';}else if(warnings.length===1){status='Caution';cls='caut';icon='🟡';}statusEl.className='struct-status '+cls;statusEl.textContent=icon+' '+status;subEl.textContent=(warnings.length?'Warnings: '+warnings.join(', ')+'. ':'No book warnings. ')+'Observable only.';}

function smaArr(arr,period){const out=[];for(let i=0;i<arr.length;i++){if(i<period-1){out.push(null);continue;}let s=0;for(let j=i-period+1;j<=i;j++)s+=arr[j];out.push(s/period);}return out;}
function stdArr(arr,period){const out=[];for(let i=0;i<arr.length;i++){if(i<period-1){out.push(null);continue;}const slice=arr.slice(i-period+1,i+1);const m=slice.reduce((a,b)=>a+b,0)/period;const v=slice.reduce((a,b)=>a+(b-m)*(b-m),0)/period;out.push(Math.sqrt(v));}return out;}
function calcStretchScore(klDaily){
  /* Daily closed candles. Score 0–8 + direction: BULLISH stretch (up-side) or BEARISH stretch (down-side). */
  const rows=Array.isArray(klDaily)?klDaily.slice():[];
  if(rows.length<30) return {score:0,max:8,label:'Insufficient data',direction:'NEUTRAL',dirLabel:'—',items:[]};
  const closes=rows.map(k=>+k[4]), highs=rows.map(k=>+k[2]), lows=rows.map(k=>+k[3]), vols=rows.map(k=>+k[5]);
  const n=closes.length;
  const rsiSeries=[];
  for(let i=0;i<n;i++){
    if(i<14){rsiSeries.push(null);continue;}
    let gains=0,losses=0;
    for(let j=i-13;j<=i;j++){const d=closes[j]-closes[j-1];if(d>=0)gains+=d;else losses-=d;}
    const rs=losses===0?100:gains/losses;rsiSeries.push(100-100/(1+rs));
  }
  const rsi=rsiSeries[n-1];
  const sma=smaArr(closes,20), sd=stdArr(closes,20);
  const mid=sma[n-1], band=sd[n-1];
  const upper=mid!=null&&band!=null?mid+2*band:null;
  const lower=mid!=null&&band!=null?mid-2*band:null;
  const price=closes[n-1];
  const swing=rows.slice(-60);
  let hi=-Infinity,lo=Infinity;
  for(const k of swing){hi=Math.max(hi,+k[2]);lo=Math.min(lo,+k[3]);}
  const range=hi-lo||1;
  const fib786=lo+range*0.786, fib236=lo+range*0.236, fib50=lo+range*0.5;
  let cons=1;const up=closes[n-1]>=closes[n-2];
  for(let i=n-2;i>=1;i--){const u=closes[i]>=closes[i-1];if(u===up)cons++;else break;}
  const v5=vols.slice(-5).reduce((a,b)=>a+b,0)/5;
  const vPrev=vols.slice(-10,-5).reduce((a,b)=>a+b,0)/5;
  const volLower=v5<vPrev;
  const volAvg=vols.slice(-21,-1).reduce((a,b)=>a+b,0)/20;
  const items=[];
  const rsiExt=(rsi!=null&&(rsi>=70||rsi<=30))?1:0;
  items.push({name:'RSI extreme (≥70 / ≤30)',pts:rsiExt,note:rsi!=null?('RSI '+rsi.toFixed(1)):('n/a')});
  const nearExt=(price>=fib786||price<=fib236)?1:0;
  items.push({name:'Price into Fib extreme zone',pts:nearExt,note:nearExt?(price>=fib786?'near 78.6% upper':'near 23.6% lower'):'mid fib'});
  const bbExt=(upper!=null&&lower!=null&&(price>=upper||price<=lower))?1:0;
  items.push({name:'Bollinger Band extension',pts:bbExt,note:bbExt?(price>=upper?'above upper band':'below lower band'):'inside bands'});
  const consPts=cons>=5?1:0;
  items.push({name:'Consecutive candles ≥5',pts:consPts,note:cons+' '+(up?'up':'down')});
  const volPts=volLower?1:0;
  items.push({name:'Volume into extremes',pts:volPts,note:volLower?'pivot vol lower':'pivot vol higher'});
  const thin=volAvg&&vols[n-1]<0.5*volAvg?1:0;
  items.push({name:'Thin volume vs 20d avg',pts:thin,note:volAvg?(vols[n-1]/volAvg).toFixed(2)+'×':'n/a'});
  let div=0;
  if(n>25&&rsiSeries[n-1]!=null&&rsiSeries[n-6]!=null){
    const priceHH=closes[n-1]>closes[n-6], rsiLH=rsiSeries[n-1]<rsiSeries[n-6];
    const priceLL=closes[n-1]<closes[n-6], rsiHL=rsiSeries[n-1]>rsiSeries[n-6];
    if((priceHH&&rsiLH)||(priceLL&&rsiHL)) div=1;
  }
  items.push({name:'RSI divergence (soft)',pts:div,note:div?'diverging':'aligned'});
  const extPct=mid?(Math.abs(price-mid)/mid)*100:0;
  const extPts=extPct>=4?1:0;
  items.push({name:'Distance from 20D mid ≥4%',pts:extPts,note:extPct.toFixed(1)+'%'+(price>=mid?' above':' below')});
  items.push({name:'OI spike (feed)',pts:0,na:true,note:'Data Unavailable'});
  items.push({name:'Funding extreme (feed)',pts:0,na:true,note:'Data Unavailable'});
  items.push({name:'Liq cascade flag (feed)',pts:0,na:true,note:'Data Unavailable'});
  const score=items.filter(x=>!x.na).reduce((a,x)=>a+x.pts,0);
  const max=items.filter(x=>!x.na).length;

  // Direction: which side is stretched?
  let bullVotes=0, bearVotes=0;
  if(price>=fib50) bullVotes++; else bearVotes++;
  if(mid!=null){ if(price>=mid) bullVotes++; else bearVotes++; }
  if(rsi!=null){ if(rsi>=55) bullVotes++; else if(rsi<=45) bearVotes++; }
  if(price>=fib786) bullVotes+=2;
  if(price<=fib236) bearVotes+=2;
  if(upper!=null&&price>=upper) bullVotes+=2;
  if(lower!=null&&price<=lower) bearVotes+=2;
  if(up) bullVotes++; else bearVotes++;
  // Side of extension only — NOT a trade direction flip
  let side='MID';
  if(bullVotes>bearVotes+1) side='UPSIDE';
  else if(bearVotes>bullVotes+1) side='DOWNSIDE';
  else if(bullVotes>bearVotes) side='UPSIDE';
  else if(bearVotes>bullVotes) side='DOWNSIDE';

  let intensity='NONE';
  if(score>=7) intensity='HIGH';
  else if(score>=4) intensity='ELEVATED';
  else if(score>=2) intensity='MILD';

  // Stretch = how extended; risk framing (never "flip to bearish")
  let dirLabel='◆ MID-RANGE';
  if(side==='UPSIDE') dirLabel='▲ UPSIDE EXTENSION';
  else if(side==='DOWNSIDE') dirLabel='▼ DOWNSIDE EXTENSION';

  let label='No meaningful stretch';
  if(intensity==='HIGH') label=side==='UPSIDE'?'High upside stretch · chase risk elevated':side==='DOWNSIDE'?'High downside stretch · bounce risk elevated':'High stretch · late entry risk';
  else if(intensity==='ELEVATED') label=side==='UPSIDE'?'Elevated upside stretch · pullback risk':'Elevated downside stretch · squeeze risk';
  else if(intensity==='MILD') label=side==='UPSIDE'?'Mild upside extension':'Mild downside extension';

  return {score,max,label,direction:side,dirLabel,intensity,side,items,price,mid,rsi};
}
function renderStretch(result, trendCtx){
  if(!$('st-score'))return;
  const r=result||{score:0,max:8,label:'—',direction:'MID',dirLabel:'—',intensity:'NONE',items:[]};
  const card=$('stretch-card')||document.querySelector('.stretch-card');
  const side=(r.side||r.direction||'MID').toUpperCase();
  const intensity=(r.intensity||'NONE').toUpperCase();
  if(card){
    card.classList.remove('dir-bull','dir-bear','dir-neutral','lvl-high','lvl-elevated','lvl-mild','lvl-none','side-up','side-down','side-mid');
    card.classList.add(side==='UPSIDE'?'side-up':side==='DOWNSIDE'?'side-down':'side-mid');
    card.classList.add(intensity==='HIGH'?'lvl-high':intensity==='ELEVATED'?'lvl-elevated':intensity==='MILD'?'lvl-mild':'lvl-none');
  }
  $('st-score').textContent=r.score+' / '+(r.max||8);
  if($('st-dir')){
    $('st-dir').textContent=r.dirLabel||'—';
    $('st-dir').className='st-dir '+(side==='UPSIDE'?'up':side==='DOWNSIDE'?'down':'neu');
  }
  if($('st-label'))$('st-label').textContent=r.label||'—';

  // Interpretation: stretch is RISK ON TOP OF trend — never flips trend
  let interp='Informational only — does not change Confirmation Score.';
  const tDir=(trendCtx&&trendCtx.dir)||'';
  const tMom=(trendCtx&&trendCtx.mom)||'';
  if(r.score>=2){
    if(tDir==='BULLISH'||tMom==='BULLISH'){
      if(side==='UPSIDE'&&r.score>=4) interp='Bullish trend context · elevated pullback / chase risk — prefer wait or scale, not FOMO.';
      else if(side==='UPSIDE') interp='Bullish context with mild upside extension — still trend-aligned, avoid late chase.';
      else if(side==='DOWNSIDE') interp='Bullish context + downside extension — possible dip area; confirmation still rules.';
      else interp='Bullish context · stretch mid-range.';
    } else if(tDir==='BEARISH'||tMom==='BEARISH'){
      if(side==='DOWNSIDE'&&r.score>=4) interp='Bearish trend context · elevated bounce / short-cover risk — avoid chasing dumps.';
      else if(side==='DOWNSIDE') interp='Bearish context with mild downside extension — trend-aligned, avoid late panic sells.';
      else if(side==='UPSIDE') interp='Bearish context + upside extension — possible relief rally risk into trend.';
      else interp='Bearish context · stretch mid-range.';
    } else {
      if(side==='UPSIDE'&&r.score>=4) interp='No clear HTF trend · high upside stretch — chasing is risky both ways.';
      else if(side==='DOWNSIDE'&&r.score>=4) interp='No clear HTF trend · high downside stretch — knife-catch risk.';
      else interp='Mixed/neutral trend · stretch is extension only, not a signal to flip.';
    }
  }
  if($('st-interp'))$('st-interp').textContent=interp;
  else {
    const note=document.querySelector('.stretch-note');
    if(note) note.textContent=interp;
  }

  const list=$('st-list');
  if(!list)return;
  list.innerHTML=(r.items||[]).map(it=>{
    const cls=it.na?'na':(it.pts?'on':'off');
    const mark=it.na?'n/a':(it.pts?'✓ '+it.pts+'/1':'✗ 0/1');
    return '<div class="stretch-row '+cls+'"><span class="name">'+it.name+(it.note?' · '+it.note:'')+'</span><span class="pts">'+mark+'</span></div>';
  }).join('');
}

async function loadTrend(){try{const [klD,klW,kl4]=await Promise.all([fetchKlines('1d',220),fetchKlines('1w',220),fetchKlines('4h',120)]);const dT=trendFromCloses(klD.map(k=>+k[4])),wT=trendFromCloses(klW.map(k=>+k[4]));$('tr-1d').textContent=dT.dir;$('tr-1d').style.color=colorDir(dT.dir);$('tr-1w').textContent=wT.dir;$('tr-1w').style.color=colorDir(wT.dir);$('tr-1d-det').textContent=dT.detail;$('tr-1w-det').textContent=wT.detail;const dMom=macdMomentum(klD.map(k=>+k[4]),klD.map(k=>Math.floor(k[0]/1000)));const wMom=macdMomentum(klW.map(k=>+k[4]),klW.map(k=>Math.floor(k[0]/1000)));if($('tr-1d-mom')){$('tr-1d-mom').textContent=dMom.label;$('tr-1d-mom').style.color=colorDir(dMom.dir==='FADING'?'NEUTRAL':dMom.dir);}if($('tr-1w-mom')){$('tr-1w-mom').textContent=wMom.label;$('tr-1w-mom').style.color=colorDir(wMom.dir==='FADING'?'NEUTRAL':wMom.dir);}if($('tr-1d-macd'))$('tr-1d-macd').textContent=dMom.detail;if($('tr-1w-macd'))$('tr-1w-macd').textContent=wMom.detail;const closes=kl4.map(k=>+k[4]),times=kl4.map(k=>Math.floor(k[0]/1000)),vols=kl4.map(k=>+k[5]);const pack=calcMACDSeries(closes,times);const h=pack.lastHist,m=pack.lastMacd,s=pack.lastSig,ph=pack.prevHist;let macdDir='NONE';if(ph!=null&&ph<0&&h>=0)macdDir='BULLISH';else if(ph!=null&&ph>=0&&h<0)macdDir='BEARISH';else if(h>0)macdDir='BULLISH';else if(h<0)macdDir='BEARISH';const rsi=calcRSI(closes,14);const lastV=vols[vols.length-1];const avg=vols.slice(-31,-1).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(30,vols.length-1));const vRatio=avg?lastV/avg:1;$('tr-4h').textContent=macdDir==='NONE'?'NO CROSS':macdDir;$('tr-4h').style.color=colorDir(macdDir==='NONE'?'NEUTRAL':macdDir);if($('tr-4h-vol')){$('tr-4h-vol').textContent=vRatio.toFixed(2)+'×';}$('tr-macd-det').textContent='HIST '+(h==null?'—':((h>=0?'+':'')+h.toFixed(0)));$('tr-rsi-det').textContent='RSI '+(rsi!=null?rsi.toFixed(1):'—')+' · Vol '+vRatio.toFixed(2)+'×';let score='NO SIGNAL — WAIT',scoreColor='#8491a1',sub='Wait for clearer 4H bias.';const bull4=macdDir==='BULLISH',bear4=macdDir==='BEARISH';const dBullE=dT.dir==='BULLISH',wBullE=wT.dir==='BULLISH',dBearE=dT.dir==='BEARISH',wBearE=wT.dir==='BEARISH';const dBullM=dMom.dir==='BULLISH',wBullM=wMom.dir==='BULLISH';if(bull4){if(dBullE&&wBullE&&dBullM&&wBullM){score='STRONG CONFIRMATION';scoreColor='#62e3a0';sub='Full alignment.';}else if(dBullE&&wBullE){score='MODERATE CONFIRMATION';scoreColor='#e6c878';const soft=[];if(!dBullM)soft.push('1D MACD '+dMom.dir.toLowerCase());if(!wBullM)soft.push('1W MACD '+wMom.dir.toLowerCase());sub='HTF EMAs bullish, but '+(soft.join(' + ')||'MACD soft')+'.';}else if(dBearE||wBearE){score='WEAK — COUNTER-TREND BOUNCE';scoreColor='#ff6f7c';sub='Against HTF EMA.';}else{score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub='HTF mixed.';}}else if(bear4){if(dBearE&&wBearE){score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub='Bearish HTF.';}else if(dBullE||wBullE){score='WEAK — COUNTER-TREND BOUNCE';scoreColor='#62e3a0';sub='Against HTF EMA.';}else{score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub='Mixed.';}}if(vRatio<0.3&&score.indexOf('STRONG')===0){score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub+=' · thin volume.';}$('tr-score').textContent=score;$('tr-score').style.color=scoreColor;$('tr-score-sub').textContent=sub;try{renderStretch(calcStretchScore(klD),{dir:dT.dir,mom:dMom.dir});}catch(err){console.warn('stretch',err);renderStretch({score:0,max:8,label:'Error',items:[]},{dir:dT&&dT.dir,mom:dMom&&dMom.dir});}let stretchDir='NEUTRAL';if(dT.dir==='BULLISH'&&wT.dir==='BULLISH')stretchDir='BULLISH';else if(dT.dir==='BEARISH'&&wT.dir==='BEARISH')stretchDir='BEARISH';else if(dT.dir==='BULLISH'||wT.dir==='BULLISH')stretchDir='BULLISH';else if(dT.dir==='BEARISH'||wT.dir==='BEARISH')stretchDir='BEARISH';await loadMarketStructure(stretchDir,klD);$('trend-source').textContent='LIVE · 1D · 1W · 4H';}catch(e){console.warn(e);if($('trend-source'))$('trend-source').textContent='OFFLINE';if($('tr-score'))$('tr-score').textContent='DATA OFFLINE';if($('tr-score-sub'))$('tr-score-sub').textContent=String(e&&e.message||e);}}

/* ===== Structural Trend engine (independent of Trend tab) ===== */
const STRUCT_WEIGHTS={
  wStruct:0.30, dStruct:0.25, wEma:0.15, dEma:0.10,
  wMom:0.08, dMom:0.05, vol:0.04, h4:0.03
};
const STRUCT_STATE_KEY='structural_trend_state_v1';

function pivotsFromOHLC(highs, lows, left, right){
  const pivH=[], pivL=[];
  for(let i=left;i<highs.length-right;i++){
    let isH=true, isL=true;
    for(let j=i-left;j<=i+right;j++){
      if(j===i) continue;
      if(highs[j]>highs[i]) isH=false;
      if(lows[j]<lows[i]) isL=false;
    }
    if(isH) pivH.push({i,p:highs[i]});
    if(isL) pivL.push({i,p:lows[i]});
  }
  return {pivH, pivL};
}

function swingStructure(kl, lookback, tf){
  /* Meaningful structure: wider pivots for HTF; close-based breaks not wicks.
     Returns bias, protected HL/LH, confirmedCloseBreak (not wick-only). */
  if(!kl||kl.length<Math.min(lookback, 20)){
    return {bias:'NEUTRAL',detail:'insufficient data',available:false,
      protectedHL:null,protectedLH:null,wickBelowHL:false,closeBelowHL:false,
      wickAboveLH:false,closeAboveLH:false,hh:false,hl:false,lh:false,ll:false};
  }
  const slice=kl.slice(-lookback);
  const opens=slice.map(k=>+k[1]), highs=slice.map(k=>+k[2]), lows=slice.map(k=>+k[3]), closes=slice.map(k=>+k[4]);
  // Wider pivots on weekly = more "major"; daily medium; avoid 2-bar micro noise
  const left=tf==='1w'?3:2, right=tf==='1w'?3:2;
  const {pivH, pivL}=pivotsFromOHLC(highs, lows, left, right);

  // Prefer older protected higher-low: last two significant lows
  const lastL=pivL.slice(-3);
  const lastH=pivH.slice(-3);
  let hh=false,hl=false,lh=false,ll=false;
  if(lastH.length>=2){
    const a=lastH[lastH.length-2].p, b=lastH[lastH.length-1].p;
    if(b>a*1.001) hh=true;
    if(b<a*0.999) lh=true;
  }
  if(lastL.length>=2){
    const a=lastL[lastL.length-2].p, b=lastL[lastL.length-1].p;
    if(b>a*1.001) hl=true;
    if(b<a*0.999) ll=true;
  }

  // Protected structural low = prior confirmed swing low (not the forming tip)
  // Prefer the second-to-last major low when last low is very recent (last 2 bars)
  let protectedHL=null;
  if(lastL.length>=2){
    const newest=lastL[lastL.length-1], prev=lastL[lastL.length-2];
    const nearEdge=newest.i>=slice.length-3;
    protectedHL=nearEdge?prev.p:newest.p;
    // If we have HL sequence, the higher of the two recent lows is the protected HL
    if(hl) protectedHL=Math.max(prev.p, nearEdge?prev.p:newest.p);
  } else if(lastL.length===1){
    protectedHL=lastL[0].p;
  }

  let protectedLH=null;
  if(lastH.length>=2){
    const newest=lastH[lastH.length-1], prev=lastH[lastH.length-2];
    const nearEdge=newest.i>=slice.length-3;
    protectedLH=nearEdge?prev.p:newest.p;
    if(lh) protectedLH=Math.min(prev.p, nearEdge?prev.p:newest.p);
  } else if(lastH.length===1){
    protectedLH=lastH[0].p;
  }

  const lastClose=closes[closes.length-1];
  const lastLow=lows[closes.length-1];
  const lastHigh=highs[closes.length-1];
  // Prior closed bar for persistence (ignore pure wick on current incomplete bar when possible)
  const closedIdx=closes.length>=2?closes.length-2:closes.length-1;
  const closedClose=closes[closedIdx];
  const closedLow=lows[closedIdx];

  let wickBelowHL=false, closeBelowHL=false, persistBelowHL=false;
  if(protectedHL!=null){
    wickBelowHL=lastLow<protectedHL*0.998;
    // closeBelowHL: last FULLY CLOSED candle only (never the forming bar)
    closeBelowHL=closedClose<protectedHL*0.998;
    // hardBreakDown: TWO most recent COMPLETED closes below HL — never count the current incomplete candle
    if(closes.length>=3 && closedIdx>=1){
      const completed1=closes[closedIdx];
      const completed0=closes[closedIdx-1];
      persistBelowHL=completed1<protectedHL*0.998 && completed0<protectedHL*0.998;
    } else {
      persistBelowHL=false;
    }
  }
  let wickAboveLH=false, closeAboveLH=false;
  if(protectedLH!=null){
    wickAboveLH=lastHigh>protectedLH*1.002;
    closeAboveLH=closedClose>protectedLH*1.002;
  }

  let bias='NEUTRAL';
  if(hh&&hl) bias='BULLISH';
  else if(lh&&ll) bias='BEARISH';
  else if(hl&&!ll) bias='BULLISH';
  else if(lh&&!hh) bias='BEARISH';
  else if(protectedHL!=null&&lastClose>protectedHL&&hh) bias='BULLISH';
  else if(protectedLH!=null&&lastClose<protectedLH&&ll) bias='BEARISH';

  // Confirmed structural break flags (close-based, not wick)
  const confirmedBreakDown=closeBelowHL; // daily/weekly close below protected HL
  const hardBreakDown=persistBelowHL;    // multiple closes

  let detail='';
  if(hh&&hl) detail='HH + HL intact';
  else if(lh&&ll) detail='LH + LL intact';
  else if(hl) detail='HL forming / holding';
  else if(lh) detail='LH forming';
  else detail='mixed pivots';
  if(wickBelowHL&&!closeBelowHL) detail+=' · wick below HL (warning only)';
  else if(hardBreakDown) detail+=' · confirmed closes below HL';
  else if(closeBelowHL) detail+=' · close below HL';

  return {
    bias, hh, hl, lh, ll, detail, available:true,
    protectedHL, protectedLH,
    wickBelowHL, closeBelowHL, persistBelowHL,
    wickAboveLH, closeAboveLH,
    confirmedBreakDown, hardBreakDown,
    price:lastClose, support:protectedHL, resistance:protectedLH
  };
}

function scoreLeg(bias){
  if(bias==='BULLISH') return 1;
  if(bias==='BEARISH') return -1;
  return 0;
}

function volumeAsConfirmation(klD, dStruct){
  /* Volume confirms price structure — never an independent direction by itself. */
  if(!klD||klD.length<25) return {bias:'NEUTRAL', note:'n/a', available:false};
  const vols=klD.map(k=>+k[5]), closes=klD.map(k=>+k[4]), opens=klD.map(k=>+k[1]);
  const last=vols[vols.length-1], avg=vols.slice(-21,-1).reduce((a,b)=>a+b,0)/20;
  const r=avg?last/avg:1;
  const upCandle=closes[closes.length-1]>=opens[opens.length-1];
  const note=r.toFixed(2)+'× vs 20D';
  if(r<1.15) return {bias:'NEUTRAL', note:note+' · normal', available:true};
  // elevated volume: confirm the candle/structure direction
  if(dStruct&&dStruct.confirmedBreakDown&&!upCandle) return {bias:'BEARISH', note:note+' · sell breakdown', available:true};
  if(dStruct&&dStruct.hl&&upCandle&&closes[closes.length-1]>(dStruct.protectedHL||0)) return {bias:'BULLISH', note:note+' · HL defense / reclaim', available:true};
  if(upCandle&&r>=1.2) return {bias:'BULLISH', note:note+' · upside participation', available:true};
  if(!upCandle&&r>=1.2) return {bias:'BEARISH', note:note+' · downside participation', available:true};
  return {bias:'NEUTRAL', note:note+' · elevated but mixed', available:true};
}

function mapStructuralState(score, evidence, prevState){
  const w=evidence.wStruct, d=evidence.dStruct;
  const wOk=w.available&&w.bias==='BULLISH';
  const dOk=d.available&&d.bias==='BULLISH';
  const wBear=w.available&&w.bias==='BEARISH';
  const dBear=d.available&&d.bias==='BEARISH';
  const wEmaB=evidence.wEma.dir==='BULLISH';
  const dEmaB=evidence.dEma.dir==='BULLISH';
  const wEmaR=evidence.wEma.dir==='BEARISH';
  const dEmaR=evidence.dEma.dir==='BEARISH';
  const momWeak=evidence.dMom.dir==='BEARISH'||evidence.dMom.dir==='FADING'||evidence.h4==='BEARISH';
  const momBull=evidence.dMom.dir==='BULLISH'||evidence.wMom.dir==='BULLISH';

  // HARD GATES from structure (close-based)
  const dailyCloseBreak=!!d.closeBelowHL;
  const dailyHardBreak=!!d.hardBreakDown;
  const weeklyCloseBreak=!!w.closeBelowHL;
  const weeklyHardBreak=!!w.hardBreakDown;
  const wickOnlyWarn=(d.wickBelowHL&&!d.closeBelowHL)||(w.wickBelowHL&&!w.closeBelowHL);

  // Support status for UI
  let supportStatus='HOLDING';
  if(!w.available&&!d.available) supportStatus='UNAVAILABLE';
  else if(weeklyHardBreak||(weeklyCloseBreak&&dailyHardBreak)) supportStatus='HTF LOST';
  else if(dailyHardBreak||dailyCloseBreak) supportStatus='DAILY BROKEN';
  else if(wickOnlyWarn) supportStatus='WICK WARNING';
  else supportStatus='HOLDING';

  let state='🟡 BULLISH — PULLBACK';
  let regime='BULLISH', phase='PULLBACK', conf='MEDIUM';

  // --- Hierarchy: weekly intact + daily intact → never TREND BROKEN ---
  if(wOk&&dOk&&!dailyCloseBreak&&!weeklyCloseBreak){
    if(wEmaB&&dEmaB&&!momWeak&&score>=0.35){
      state='🟢 BULLISH — STRONG TREND'; regime='BULLISH'; phase='STRONG TREND'; conf='HIGH';
    } else if(momWeak||evidence.h4==='BEARISH'||score<0.35){
      state='🟡 BULLISH — PULLBACK'; regime='BULLISH'; phase='PULLBACK'; conf='HIGH';
    } else {
      state='🟢 BULLISH — STRONG TREND'; regime='BULLISH'; phase='STRONG TREND'; conf='HIGH';
    }
  } else if(wOk&&!weeklyCloseBreak&&(dailyCloseBreak||dailyHardBreak||dBear)){
    // Weekly thesis intact, daily damaged
    state='🟠 BULLISH — STRUCTURE AT RISK'; regime='BULLISH'; phase='STRUCTURE AT RISK'; conf='MEDIUM';
  } else if(wOk&&!weeklyCloseBreak&&supportStatus==='HOLDING'&&(momWeak||!dOk)){
    state='🟡 BULLISH — PULLBACK'; regime='BULLISH'; phase='PULLBACK'; conf='HIGH';
  } else if(weeklyHardBreak&&dailyHardBreak&&(wBear||wEmaR)&&(dBear||dEmaR)){
    // Genuine HTF thesis break: weekly+daily confirmed closes + bearish alignment
    state='🔴 BEARISH — TREND BROKEN'; regime='BEARISH'; phase='TREND BROKEN'; conf='HIGH';
  } else if(weeklyCloseBreak||(dailyHardBreak&&wBear)){
    state='🟠 BEARISH — DOWNTREND'; regime='BEARISH'; phase='DOWNTREND'; conf='MEDIUM';
  } else if(dBear||dailyCloseBreak||score<=-0.15){
    state='🟡 BEARISH — CORRECTION'; regime='BEARISH'; phase='CORRECTION'; conf='MEDIUM';
  } else if((prevState&&String(prevState).indexOf('BEARISH')>=0)&&(d.hl||dOk||momBull)){
    state='🟢 BULLISH — RECOVERY / ACCUMULATION'; regime='BULLISH'; phase='RECOVERY / ACCUMULATION'; conf='MEDIUM';
  } else if(wOk){
    state='🟡 BULLISH — PULLBACK'; regime='BULLISH'; phase='PULLBACK'; conf='MEDIUM';
  }

  // Recovery path when score improving from bearish prev
  if(prevState&&String(prevState).indexOf('BEARISH')>=0&&(d.hl||dOk)&&!weeklyHardBreak&&score>=0){
    state='🟢 BULLISH — RECOVERY / ACCUMULATION'; regime='BULLISH'; phase='RECOVERY / ACCUMULATION'; conf='MEDIUM';
  }

  // Hysteresis guards
  if(prevState){
    const prev=String(prevState);
    // Never wick-only → TREND BROKEN
    if(state.indexOf('TREND BROKEN')>=0){
      if(!(weeklyHardBreak&&dailyHardBreak)){
        if(weeklyCloseBreak||dailyHardBreak){
          state='🟠 BEARISH — DOWNTREND'; regime='BEARISH'; phase='DOWNTREND'; conf='MEDIUM';
        } else if(wOk){
          state='🟠 BULLISH — STRUCTURE AT RISK'; regime='BULLISH'; phase='STRUCTURE AT RISK'; conf='MEDIUM';
        } else {
          state='🟡 BEARISH — CORRECTION'; regime='BEARISH'; phase='CORRECTION'; conf='MEDIUM';
        }
      }
    }
    // Bearish → not instantly STRONG
    if(state.indexOf('STRONG TREND')>=0&&prev.indexOf('BEARISH')>=0){
      state='🟢 BULLISH — RECOVERY / ACCUMULATION'; regime='BULLISH'; phase='RECOVERY / ACCUMULATION'; conf='MEDIUM';
    }
    // STRONG → not jump to DOWNTREND without daily break
    if(state.indexOf('DOWNTREND')>=0&&prev.indexOf('STRONG TREND')>=0&&!dailyHardBreak&&!weeklyCloseBreak){
      state='🟠 BULLISH — STRUCTURE AT RISK'; regime='BULLISH'; phase='STRUCTURE AT RISK'; conf='MEDIUM';
    }
    // Stay in PULLBACK on wick-only noise
    if(wickOnlyWarn&&prev.indexOf('BULLISH')>=0&&state.indexOf('BEARISH')>=0&&!dailyCloseBreak){
      state='🟡 BULLISH — PULLBACK'; regime='BULLISH'; phase='PULLBACK'; conf='HIGH';
    }
  }

  const missing=[];
  if(!w.available) missing.push('1W structure');
  if(!d.available) missing.push('1D structure');
  if(missing.length) conf=missing.length>=2?'LOW':'MEDIUM';

  return {state,regime,phase,conf,missing,supportStatus,wickOnlyWarn,dailyCloseBreak,weeklyCloseBreak,weeklyHardBreak,dailyHardBreak};
}

function explainStructural(r, evidence){
  const w=evidence.wStruct, d=evidence.dStruct;
  if(r.phase==='PULLBACK'){
    return 'Weekly and major daily structure remain intact. Short-term momentum may be weak or 4H bearish, but no confirmed higher-timeframe structural break (close-based) has occurred. Temporary dumps/wicks do not flip the thesis.';
  }
  if(r.phase==='STRUCTURE AT RISK'){
    return 'Important daily structure has weakened or closed below a protected higher-low, but the higher-timeframe weekly bullish thesis has not yet been decisively invalidated.';
  }
  if(r.phase==='TREND BROKEN'){
    return 'Confirmed higher-timeframe structural failure (weekly and daily close-based breaks with bearish alignment) has invalidated the previous bullish thesis. This is not a single-wick or single-candle event.';
  }
  if(r.phase==='STRONG TREND'){
    return 'Weekly and daily structure are bullish with HTF trend alignment. No confirmed structural breakdown. Short-term noise is subordinate to the intact thesis.';
  }
  if(r.phase==='RECOVERY / ACCUMULATION'){
    return 'Stabilization after bearish pressure: higher-low formation and/or improving daily structure without requiring a finished strong bull trend yet.';
  }
  if(r.phase==='DOWNTREND'){
    return 'Bearish structure is establishing with confirmed breaks and failing reclaims. Not necessarily full thesis death, but downside regime is active.';
  }
  if(r.phase==='CORRECTION'){
    return 'Bearish pressure is present and daily structure is weakening, but a full long-term trend break is not fully confirmed yet.';
  }
  const bits=[];
  if(w.available) bits.push('Weekly structure '+w.bias.toLowerCase()+' ('+w.detail+')');
  if(d.available) bits.push('daily structure '+d.bias.toLowerCase()+' ('+d.detail+')');
  if(r.wickOnlyWarn) bits.push('wick-only probe of support treated as warning, not a break');
  if(r.missing&&r.missing.length) bits.push('confidence reduced — missing: '+r.missing.join(', '));
  return bits.join('. ')+(bits.length?'.':'Structural assessment complete.');
}


function structureRowLabel(s){
  /* UI only: BROKEN iff confirmed hardBreakDown; LH+LL alone is DETERIORATING. */
  if(!s||!s.available) return {t:'🟡 MIXED / N/A', c:'#8491a1'};
  const det=s.detail||'';
  if(s.hardBreakDown) return {t:'🔴 BROKEN · '+det, c:'#ff6f7c'};
  if(s.wickBelowHL&&!s.closeBelowHL) return {t:'🟡 WARNING · WICK ONLY · '+det, c:'#e6c878'};
  if(s.lh&&s.ll) return {t:'🟠 DETERIORATING · LH + LL', c:'#e6a050'};
  if(s.bias==='BEARISH'||s.lh||s.closeBelowHL) return {t:'🟡 WEAKENING · '+det, c:'#e6c878'};
  if(s.hh&&s.hl) return {t:'🟢 INTACT · HH + HL', c:'#62e3a0'};
  if(s.bias==='BULLISH'||s.hl) return {t:'🟢 INTACT · '+det, c:'#62e3a0'};
  return {t:'🟡 MIXED · '+det, c:'#e6c878'};
}

function badgeStruct(bias, okText, badText, midText){
  if(bias==='BULLISH') return {t:'🟢 '+(okText||'INTACT'), c:'#62e3a0'};
  if(bias==='BEARISH') return {t:'🔴 '+(badText||'BROKEN'), c:'#ff6f7c'};
  return {t:'🟡 '+(midText||'MIXED'), c:'#e6c878'};
}

async function loadStructural(){
  try{
    const [klD,klW,kl4]=await Promise.all([
      fetchKlines('1d',220),
      fetchKlines('1w',220),
      fetchKlines('4h',120)
    ]);
    const wStruct=swingStructure(klW, 52, '1w');
    const dStruct=swingStructure(klD, 90, '1d');
    const wEma=trendFromCloses((klW||[]).map(k=>+k[4]));
    const dEma=trendFromCloses((klD||[]).map(k=>+k[4]));
    const wMom=macdMomentum((klW||[]).map(k=>+k[4]),(klW||[]).map(k=>Math.floor(k[0]/1000)));
    const dMom=macdMomentum((klD||[]).map(k=>+k[4]),(klD||[]).map(k=>Math.floor(k[0]/1000)));
    let h4='NEUTRAL';
    if(kl4&&kl4.length>30){
      const pack=calcMACDSeries(kl4.map(k=>+k[4]),kl4.map(k=>Math.floor(k[0]/1000)));
      if(pack.lastHist!=null) h4=pack.lastHist>0?'BULLISH':pack.lastHist<0?'BEARISH':'NEUTRAL';
    }
    const volC=volumeAsConfirmation(klD, dStruct);

    const W=STRUCT_WEIGHTS;
    let score=
      scoreLeg(wStruct.available?wStruct.bias:'NEUTRAL')*W.wStruct +
      scoreLeg(dStruct.available?dStruct.bias:'NEUTRAL')*W.dStruct +
      scoreLeg(wEma.dir)*W.wEma +
      scoreLeg(dEma.dir)*W.dEma +
      scoreLeg(wMom.dir==='FADING'?'NEUTRAL':wMom.dir)*W.wMom +
      scoreLeg(dMom.dir==='FADING'?'NEUTRAL':dMom.dir)*W.dMom +
      scoreLeg(volC.bias)*W.vol +
      scoreLeg(h4)*W.h4;

    let prev=null;
    try{prev=localStorage.getItem(STRUCT_STATE_KEY);}catch(e){}
    const evidence={wStruct,dStruct,wEma,dEma,wMom,dMom,h4,vol:volC};
    const result=mapStructuralState(score, evidence, prev);
    try{localStorage.setItem(STRUCT_STATE_KEY, result.state);}catch(e){}

    const color=result.regime==='BULLISH'?(result.phase.indexOf('RISK')>=0?'#e6a050':'#62e3a0'):result.phase.indexOf('BROKEN')>=0?'#ff6f7c':'#e6c878';
    if($('stt-state')){$('stt-state').textContent=result.state;$('stt-state').style.color=color;}
    if($('stt-regime'))$('stt-regime').textContent=result.regime;
    if($('stt-phase'))$('stt-phase').textContent=result.phase;
    if($('stt-conf'))$('stt-conf').textContent=result.conf;
    if($('stt-explain'))$('stt-explain').textContent=explainStructural(result, evidence);

    const wB=structureRowLabel(wStruct);
    const dB=structureRowLabel(dStruct);
    const htf=badgeStruct(wEma.dir);
    let sup;
    if(result.supportStatus==='UNAVAILABLE') sup={t:'🟡 UNAVAILABLE',c:'#8491a1'};
    else if(result.supportStatus==='HTF LOST') sup={t:'🔴 HTF LOST (close)',c:'#ff6f7c'};
    else if(result.supportStatus==='DAILY BROKEN') sup={t:'🟠 DAILY CLOSE BREAK',c:'#e6a050'};
    else if(result.supportStatus==='WICK WARNING') sup={t:'🟡 WICK WARNING ONLY',c:'#e6c878'};
    else sup={t:'🟢 HOLDING',c:'#62e3a0'};
    if(dStruct.protectedHL){sup.t+=' · HL '+Math.round(dStruct.protectedHL).toLocaleString('en-US');}

    const mom=badgeStruct(dMom.dir==='FADING'?'NEUTRAL':dMom.dir,'SUPPORTIVE','WEAKENING','FADING');
    if(dMom.dir==='BEARISH'){mom.t='🟡 WEAKENING';mom.c='#e6c878';}
    const h4b=badgeStruct(h4,'BULLISH','BEARISH','NEUTRAL');
    const volBias=volC.bias;
    const volColor=volBias==='BULLISH'?'#62e3a0':volBias==='BEARISH'?'#ff6f7c':'#e6c878';
    const volIcon=volBias==='BULLISH'?'🟢':volBias==='BEARISH'?'🔴':'🟡';

    const rows=[
      ['1W STRUCTURE', wB.t+' · '+(wStruct.detail||''), wB.c],
      ['1D STRUCTURE', dB.t+' · '+(dStruct.detail||''), dB.c],
      ['MAJOR SUPPORT', sup.t, sup.c],
      ['HTF TREND (EMA)', htf.t+' · '+(wEma.detail||''), htf.c],
      ['MOMENTUM (1D)', mom.t+' · '+(dMom.detail||''), mom.c],
      ['4H CONFIRMATION', h4b.t+' · secondary only', h4b.c],
      ['VOLUME (confirms price)', volIcon+' '+volC.note, volColor],
      ['WEIGHTED SCORE', (score>=0?'+':'')+score.toFixed(2)+' (−1…+1)', score>=0.2?'#62e3a0':score<=-0.2?'#ff6f7c':'#e6c878']
    ];
    if($('stt-evidence')){
      $('stt-evidence').innerHTML=rows.map(r=>'<div class="st-ev-row"><span class="k">'+r[0]+'</span><span class="v" style="color:'+r[2]+'">'+r[1]+'</span></div>').join('');
    }
    if($('struct-source'))$('struct-source').textContent='LIVE · close-based breaks · hysteresis on';
  }catch(e){
    console.warn(e);
    if($('struct-source'))$('struct-source').textContent='OFFLINE';
    if($('stt-state'))$('stt-state').textContent='DATA UNAVAILABLE';
    if($('stt-explain'))$('stt-explain').textContent='Could not load structural inputs: '+String(e&&e.message||e)+'. Missing data is not treated as bullish or bearish.';
  }
}


/* ===== MACRO cycle engine (independent of Trend + Structural Trend) ===== */
const MACRO_STATE_KEY='macro_cycle_state_v1';
const MACRO_M1DN_KEY='macro_m1dn_hist_v1';
const MACRO_LAST_MONTH_KEY='macro_last_completed_month_v1';

function macroSwing(kl, lookback, label){
  /* Sparse HTF (6M/1Y) needs min 5 bars + adaptive pivots so structure can form. */
  if(!kl||kl.length<5){
    return {available:false,label,bias:'NEUTRAL',detail:'insufficient data',
      protectedHL:null,protectedLH:null,wickWarn:false,closeBreak:false,hardBreak:false,
      hh:false,hl:false,lh:false,ll:false,price:null};
  }
  const slice=kl.slice(-Math.min(lookback, kl.length));
  const highs=slice.map(k=>+k[2]), lows=slice.map(k=>+k[3]), closes=slice.map(k=>+k[4]);
  const left=slice.length<18?1:2, right=left;
  const pivH=[],pivL=[];
  for(let i=left;i<highs.length-right;i++){
    let isH=true,isL=true;
    for(let j=i-left;j<=i+right;j++){ if(j===i)continue; if(highs[j]>highs[i])isH=false; if(lows[j]<lows[i])isL=false; }
    if(isH)pivH.push({i,p:highs[i]});
    if(isL)pivL.push({i,p:lows[i]});
  }
  const lastL=pivL.slice(-3), lastH=pivH.slice(-3);
  let hh=false,hl=false,lh=false,ll=false;
  if(lastH.length>=2){const a=lastH[lastH.length-2].p,b=lastH[lastH.length-1].p; if(b>a*1.002)hh=true; if(b<a*0.998)lh=true;}
  if(lastL.length>=2){const a=lastL[lastL.length-2].p,b=lastL[lastL.length-1].p; if(b>a*1.002)hl=true; if(b<a*0.998)ll=true;}
  let protectedHL=null,protectedLH=null;
  if(lastL.length>=2){
    const newest=lastL[lastL.length-1], prev=lastL[lastL.length-2];
    protectedHL=(newest.i>=slice.length-2)?prev.p:newest.p;
    if(hl) protectedHL=Math.max(prev.p, protectedHL);
  } else if(lastL.length===1) protectedHL=lastL[0].p;
  if(lastH.length>=2){
    const newest=lastH[lastH.length-1], prev=lastH[lastH.length-2];
    protectedLH=(newest.i>=slice.length-2)?prev.p:newest.p;
    if(lh) protectedLH=Math.min(prev.p, protectedLH);
  } else if(lastH.length===1) protectedLH=lastH[0].p;

  const closedIdx=closes.length-1; // completed-only macro series
  const closedClose=closes[closedIdx];
  const lastLow=lows[lows.length-1];
  let wickWarn=false, closeBreak=false, hardBreak=false;
  if(protectedHL!=null){
    wickWarn=lastLow<protectedHL*0.995;
    closeBreak=closedClose<protectedHL*0.995;
    if(closes.length>=3&&closedIdx>=1){
      hardBreak=closes[closedIdx]<protectedHL*0.995 && closes[closedIdx-1]<protectedHL*0.995;
    }
  }
  // Sparse HTF: if pivots lacked pairs, use last 3 COMPLETED closes
  if(!hh&&!hl&&!lh&&!ll&&closes.length>=4&&closedIdx>=2){
    const c2=closes[closedIdx], c1=closes[closedIdx-1], c0=closes[closedIdx-2];
    if(c2>c1*1.001&&c1>c0*1.001){ hl=true; hh=true; }
    else if(c2<c1*0.999&&c1<c0*0.999){ lh=true; ll=true; }
    else if(c2>c1*1.001){ hl=true; }
    else if(c2<c1*0.999){ lh=true; }
  }
  let bias='NEUTRAL';
  if(hh&&hl) bias='BULLISH';
  else if(lh&&ll) bias='BEARISH';
  else if(hl&&!ll) bias='BULLISH';
  else if(lh&&!hh) bias='BEARISH';
  let detail='mixed';
  if(hh&&hl) detail='HH + HL';
  else if(lh&&ll) detail='LH + LL';
  else if(hl) detail='HL forming';
  else if(lh) detail='LH forming';
  if(hardBreak) detail+=' · persistent close break';
  else if(closeBreak) detail+=' · close break';
  else if(wickWarn) detail+=' · wick warning';
  let grade='MIXED';
  if(hardBreak) grade='BROKEN';
  else if(lh&&ll) grade='DAMAGED';
  else if(hh&&hl) grade='INTACT';
  else if(hl||bias==='BULLISH') grade='IMPROVING';
  else if(lh||bias==='BEARISH') grade='WEAKENING';
  if(wickWarn&&!closeBreak&&grade==='INTACT') grade='WARNING';
  return {available:true,label,bias,detail,grade,protectedHL,protectedLH,wickWarn,closeBreak,hardBreak,hh,hl,lh,ll,price:closes[closes.length-1]};
}

function mapMacroState(ev, prev, opts){
  /* opts: {m1DnHist:[bool,bool,bool]} last 3 completed months' m1Dn at the time (oldest→newest) */
  opts=opts||{};
  const m1DnHist=Array.isArray(opts.m1DnHist)?opts.m1DnHist.slice(-3):[];
  const y=ev.y1, m6=ev.m6, m3=ev.m3, m1=ev.m1;
  const yAvailable=!!(y&&y.available);
  const yBroken=yAvailable&&y.hardBreak;
  const yOk=yAvailable&&(y.bias==='BULLISH'||y.grade==='INTACT'||y.grade==='IMPROVING')&&!y.hardBreak;
  const m6Bear=m6.available&&(m6.bias==='BEARISH'||m6.grade==='DAMAGED'||m6.grade==='BROKEN'||m6.lh);
  const m6Bull=m6.available&&(m6.bias==='BULLISH'||m6.grade==='INTACT'||(m6.hh&&m6.hl));
  const m6Damaged=m6.available&&(m6.hardBreak||m6.grade==='BROKEN');
  const m6Soft=m6.available&&(m6.grade==='WEAKENING'||m6.grade==='DAMAGED'||m6.grade==='BROKEN'||m6.hardBreak);
  const m3Up=m3.available&&(m3.bias==='BULLISH'||m3.hl||m3.grade==='IMPROVING'||m3.grade==='INTACT');
  const m3Dn=m3.available&&(m3.bias==='BEARISH'||m3.lh||m3.grade==='DAMAGED'||m3.grade==='WEAKENING');
  const m1Up=m1.available&&(m1.bias==='BULLISH'||m1.hl||m1.grade==='IMPROVING'||m1.grade==='INTACT');
  const m1Dn=m1.available&&(m1.bias==='BEARISH'||m1.lh||m1.grade==='DAMAGED'||m1.grade==='WEAKENING');
  const recoverySeq=m1Up&&m3Up;
  const deteriorateSeq=m1Dn&&m3Dn;
  const accel=!!ev.parabolic;
  const m1DnCount=m1DnHist.filter(Boolean).length;
  const m1DnPersist=m1DnCount>=2; // 2 of last 3 completed months

  // Trailing 12M decline from completed monthly closes only (no lookahead)
  let severeDecline=false;
  const closes=opts.m1Closes;
  if(Array.isArray(closes)&&closes.length>=13){
    const n=closes.length;
    const last=closes[n-1], ago=closes[n-13];
    const dd=ago>0?((last-ago)/ago):0;
    let lower=0;
    for(let i=n-3;i<n;i++){ if(closes[i]<closes[i-1]) lower++; }
    if(dd<=-0.40&&lower>=2) severeDecline=true;
  }

  let state='🟡 TRANSITION — NEUTRAL';
  let regime='NEUTRAL', phase='NEUTRAL', conf='MEDIUM', cycle='UNRESOLVED';

  // Base directional read (no sticky expansion yet)
  if(yBroken&&(m6Damaged||m6Bear)&&(m3Dn||m1Dn)){
    state='🔴 BEARISH — REGIME / CYCLE BROKEN'; regime='BEARISH'; phase='REGIME / CYCLE BROKEN'; conf='HIGH'; cycle='BROKEN';
  } else if(m6Bull&&m3Up&&m1Up&&!m6Damaged&&!yBroken){
    if(accel){ state='🟢 BULLISH — PARABOLIC'; regime='BULLISH'; phase='PARABOLIC'; conf='HIGH'; cycle='PARABOLIC'; }
    else { state='🟢 BULLISH — EXPANSION'; regime='BULLISH'; phase='EXPANSION'; conf='HIGH'; cycle='EXPANSION'; }
  } else if(recoverySeq&&!m6Damaged&&!yBroken&&(m6Bull||m6.grade==='IMPROVING'||m6.grade==='MIXED'||!m6.available)){
    if(m6Bull&&m3Up&&m1Up){ state='🟢 BULLISH — RECOVERY'; regime='BULLISH'; phase='RECOVERY'; conf='HIGH'; cycle='RECOVERY'; }
    else { state='🟡 TRANSITION — BULLISH BIAS'; regime='BULLISH'; phase='TRANSITION — BULLISH BIAS'; conf='MEDIUM'; cycle='TRANSITION'; }
  } else if(m6Bear&&recoverySeq&&!yBroken){
    state='🟡 TRANSITION — BULLISH BIAS'; regime='BULLISH'; phase='TRANSITION — BULLISH BIAS'; conf='HIGH'; cycle='TRANSITION';
  } else if(m6Bull&&deteriorateSeq&&!yBroken){
    state='🟠 TRANSITION — BEARISH BIAS'; regime='BEARISH'; phase='TRANSITION — BEARISH BIAS'; conf='MEDIUM'; cycle='TRANSITION';
  } else if((m6Bear||m6Damaged||m6Soft)&&(m3Dn||m1Dn)&&!yBroken){
    state='🟠 BEARISH — CONTRACTION'; regime='BEARISH'; phase='CONTRACTION'; conf='MEDIUM'; cycle='CONTRACTION';
  } else if(recoverySeq&&!yBroken){
    state='🟡 TRANSITION — BULLISH BIAS'; regime='BULLISH'; phase='TRANSITION — BULLISH BIAS'; conf='MEDIUM'; cycle='TRANSITION';
  } else if(deteriorateSeq||m1DnPersist){
    state='🟠 TRANSITION — BEARISH BIAS'; regime='BEARISH'; phase='TRANSITION — BEARISH BIAS'; conf='MEDIUM'; cycle='TRANSITION';
  } else if(m6Bull&&(m1Up||m3Up)&&!yBroken){
    state='🟢 BULLISH — EXPANSION'; regime='BULLISH'; phase='EXPANSION'; conf=yAvailable?'HIGH':'MEDIUM'; cycle='EXPANSION';
  } else if(m6Bear&&(m1Dn||m3Dn)){
    state='🟠 BEARISH — CONTRACTION'; regime='BEARISH'; phase='CONTRACTION'; conf='MEDIUM'; cycle='CONTRACTION';
  }

  // === EXPANSION EXIT LADDER (replaces sticky hysteresis) ===
  if(prev){
    const p=String(prev);
    const inExpansion=p.indexOf('EXPANSION')>=0||p.indexOf('PARABOLIC')>=0;
    const inBearBias=p.indexOf('BEARISH BIAS')>=0;
    const inContraction=p.indexOf('CONTRACTION')>=0;
    const inBroken=p.indexOf('CYCLE BROKEN')>=0;

    if(inExpansion){
      // Step 1: EXPANSION → BEARISH BIAS when 1M bearish persists 2/3 months
      if(m1DnPersist||(m1Dn&&m1DnHist.length>=2&&m1DnHist.slice(-2).every(Boolean))){
        state='🟠 TRANSITION — BEARISH BIAS'; regime='BEARISH'; phase='TRANSITION — BEARISH BIAS'; conf='MEDIUM'; cycle='TRANSITION';
      } else if(m1Dn&&!m3Dn&&!m6Damaged){
        // single weak month: stay expansion (noise)
        state='🟢 BULLISH — EXPANSION'; regime='BULLISH'; phase='EXPANSION'; conf='HIGH'; cycle='EXPANSION';
      }
      // Step 2 can also fire same month if 3M confirms
      if((state.indexOf('BEARISH BIAS')>=0||m1DnPersist)&&(m3Dn||m6Soft)){
        state='🟠 BEARISH — CONTRACTION'; regime='BEARISH'; phase='CONTRACTION'; conf='MEDIUM'; cycle='CONTRACTION';
      }
    }
    if(inBearBias||state.indexOf('BEARISH BIAS')>=0){
      // BEARISH BIAS → CONTRACTION
      if((m3Dn&&(m1Dn||m1DnPersist))||m6Soft||m6Damaged){
        state='🟠 BEARISH — CONTRACTION'; regime='BEARISH'; phase='CONTRACTION'; conf='MEDIUM'; cycle='CONTRACTION';
      }
    }
    // CONTRACTION → BROKEN only on hard structural failure
    if(inContraction||state.indexOf('CONTRACTION')>=0){
      if(yBroken||(m6Damaged&&m6.hardBreak)||(m6.hardBreak&&yBroken)){
        if(yBroken||m6.hardBreak){
          if(yBroken&&(m6Damaged||m6Bear)){
            state='🔴 BEARISH — REGIME / CYCLE BROKEN'; regime='BEARISH'; phase='REGIME / CYCLE BROKEN'; conf='HIGH'; cycle='BROKEN';
          }
        }
      }
    }
    // Severity valve: ≥40% trailing 12M decline + 2/3 lower closes → at least CONTRACTION (never BROKEN alone)
    if(severeDecline&&!yBroken&&!(m6.hardBreak&&yBroken)){
      if(state.indexOf('EXPANSION')>=0||state.indexOf('PARABOLIC')>=0||state.indexOf('BULLISH BIAS')>=0||state.indexOf('NEUTRAL')>=0||state.indexOf('BEARISH BIAS')>=0){
        state='🟠 BEARISH — CONTRACTION'; regime='BEARISH'; phase='CONTRACTION'; conf='HIGH'; cycle='CONTRACTION';
      }
    }
    // Upward recovery hysteresis (unchanged intent)
    if(inBroken&&(state.indexOf('EXPANSION')>=0||state.indexOf('PARABOLIC')>=0)){
      state='🟡 TRANSITION — BULLISH BIAS'; regime='BULLISH'; phase='TRANSITION — BULLISH BIAS'; conf='MEDIUM'; cycle='TRANSITION';
    }
    if(inContraction&&state.indexOf('EXPANSION')>=0){
      state='🟢 BULLISH — RECOVERY'; regime='BULLISH'; phase='RECOVERY'; conf='MEDIUM'; cycle='RECOVERY';
    }
    if(inContraction&&state.indexOf('PARABOLIC')>=0){
      state='🟢 BULLISH — RECOVERY'; regime='BULLISH'; phase='RECOVERY'; conf='MEDIUM'; cycle='RECOVERY';
    }
    // Stay in CONTRACTION until recovery sequence or structural broken — no bounce to NEUTRAL
    if(inContraction&&state.indexOf('NEUTRAL')>=0&&!recoverySeq){
      state='🟠 BEARISH — CONTRACTION'; regime='BEARISH'; phase='CONTRACTION'; conf='MEDIUM'; cycle='CONTRACTION';
    }
    if(inBearBias&&state.indexOf('NEUTRAL')>=0&&(m1Dn||m1DnPersist||m3Dn)){
      state='🟠 TRANSITION — BEARISH BIAS'; regime='BEARISH'; phase='TRANSITION — BEARISH BIAS'; conf='MEDIUM'; cycle='TRANSITION';
    }
    // Parabolic persistence
    if(p.indexOf('PARABOLIC')>=0&&m6Bull&&m3Up&&m1Up&&!m6Damaged&&!yBroken){
      if(accel){ state='🟢 BULLISH — PARABOLIC'; regime='BULLISH'; phase='PARABOLIC'; conf='HIGH'; cycle='PARABOLIC'; }
      else if(!m1DnPersist){ state='🟢 BULLISH — EXPANSION'; regime='BULLISH'; phase='EXPANSION'; conf='HIGH'; cycle='EXPANSION'; }
    }
  } else if(severeDecline&&!yBroken){
    state='🟠 BEARISH — CONTRACTION'; regime='BEARISH'; phase='CONTRACTION'; conf='HIGH'; cycle='CONTRACTION';
  }

  const missing=[];
  if(!m6.available) missing.push('6M');
  if(!m3.available) missing.push('3M');
  if(!m1.available) missing.push('1M');
  if(!yAvailable) missing.push('1Y');
  if(missing.indexOf('6M')>=0&&missing.indexOf('3M')>=0) conf='LOW';
  else if(!yAvailable) conf=conf==='HIGH'?'MEDIUM':conf;
  if(missing.indexOf('1M')>=0&&missing.indexOf('3M')>=0&&missing.indexOf('6M')>=0){
    state='🟡 TRANSITION — NEUTRAL'; regime='NEUTRAL'; phase='INSUFFICIENT DATA'; conf='LOW';
  }
  return {state,regime,phase,conf,cycle,missing,m1Dn:!!m1Dn,severeDecline:!!severeDecline};
}

function detectParabolicAccel(m1kl){
  /* Price acceleration across multiple COMPLETED monthly candles — rare. */
  if(!m1kl||m1kl.length<8) return false;
  const closes=m1kl.map(k=>+k[4]);
  const n=closes.length;
  // last 3 completed months vs prior 3 — strong multi-month advance
  const r=function(a,b){return b===0?0:(a-b)/Math.abs(b);};
  const g1=r(closes[n-1],closes[n-4]); // ~3m change ending last complete
  const g0=r(closes[n-4],closes[n-7]); // prior ~3m
  // New highs persistence: last close near max of last 12
  const win=closes.slice(-12);
  const mx=Math.max.apply(null,win);
  const nearHigh=closes[n-1]>=mx*0.97;
  // Acceleration: recent 3m gain clearly stronger than prior 3m and elevated
  const accel=g1>0.25&&g1>g0+0.12&&nearHigh;
  // Also require not a single spike: at least 2 of last 3 months green
  let up=0;
  for(let i=n-3;i<n;i++){ if(closes[i]>closes[i-1]) up++; }
  return !!(accel&&up>=2);
}

function explainMacro(r, ev){
  if(r.phase==='INSUFFICIENT DATA') return 'Not enough completed macro candles to assess the giant cycle. Missing data is not treated as bullish or bearish.';
  if(r.phase==='PARABOLIC') return 'Bullish expansion has entered an accelerated phase across multiple completed months. Structure remains intact; this is rare and not a short-term trade signal.';
  if(r.phase==='EXPANSION') return 'Broader BTC macro cycle is structurally advancing. Protected macro lows hold; normal monthly corrections do not flip this regime.';
  if(r.phase==='RECOVERY') return 'Macro cycle is repairing after damage. Multi-timeframe improvement is present; full expansion is not yet confirmed.';
  if(r.phase.indexOf('BULLISH BIAS')>=0) return 'Bullish macro transition developing: 1M/3M improving while slower context (e.g. 6M) may still look damaged. Does not wait for 6M to formally flip.';
  if(r.phase.indexOf('BEARISH BIAS')>=0) return 'Bearish macro transition developing: recent lower highs / weakening 1M–3M while the largest regime is not fully invalidated.';
  if(r.phase==='CONTRACTION') return 'Macro cycle contracting with persistent weaker structure on intermediate horizons. Not necessarily full 1Y cycle death.';
  if(r.phase.indexOf('CYCLE BROKEN')>=0) return 'Confirmed higher-timeframe macro failure on completed candles. A single crash or wick is not enough for this state.';
  return 'Macro evidence is mixed; treating regime as unresolved transition.';
}

function macroGradeBadge(g){
  if(g==='INTACT'||g==='IMPROVING') return {t:'🟢 '+g, c:'#62e3a0'};
  if(g==='BROKEN') return {t:'🔴 '+g, c:'#ff6f7c'};
  if(g==='DAMAGED'||g==='WEAKENING') return {t:'🟠 '+g, c:'#e6a050'};
  if(g==='WARNING') return {t:'🟡 WICK WARNING', c:'#e6c878'};
  return {t:'🟡 '+(g||'MIXED'), c:'#e6c878'};
}


function macroStateStyle(state){
  /* History UI: green / gray / red only — no yellow/orange. */
  const s=String(state||'');
  if(s.indexOf('PARABOLIC')>=0) return {bg:'#0d3d28', fg:'#7dffb5', short:'PAR', band:'#2ee67a'};
  if(s.indexOf('EXPANSION')>=0) return {bg:'#0c2f22', fg:'#62e3a0', short:'EXP', band:'#3bcf86'};
  if(s.indexOf('RECOVERY')>=0) return {bg:'#0a2820', fg:'#4fcf96', short:'REC', band:'#3aa876'};
  if(s.indexOf('BULLISH BIAS')>=0) return {bg:'#0a221c', fg:'#8fd4b0', short:'BULL', band:'#6bc49a'};
  if(s.indexOf('NEUTRAL')>=0||s.indexOf('INSUFFICIENT')>=0) return {bg:'#1a1f24', fg:'#9aa3ad', short:'NEU', band:'#6b7280'};
  if(s.indexOf('BEARISH BIAS')>=0) return {bg:'#2a1418', fg:'#f0a0a8', short:'BEAR', band:'#e07a84'};
  if(s.indexOf('CONTRACTION')>=0) return {bg:'#2c1014', fg:'#ff6f7c', short:'CON', band:'#e23d4c'};
  if(s.indexOf('CYCLE BROKEN')>=0||s.indexOf('BROKEN')>=0) return {bg:'#3a0c12', fg:'#ff4d5e', short:'BROKE', band:'#c41e2e'};
  return {bg:'#1a1f24', fg:'#9aa3ad', short:'—', band:'#6b7280'};
}
function ymFromTs(ts){
  const d=new Date(+ts);
  return {y:d.getUTCFullYear(), m:d.getUTCMonth()+1, key:d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')};
}
function monthsUpTo(m1all, y, m){
  /* Completed months with (year,month) <= (y,m) inclusive. */
  return (m1all||[]).filter(k=>{
    const ym=ymFromTs(k[0]);
    return ym.y<y || (ym.y===y && ym.m<=m);
  });
}
function buildMacroHistory(m1all, displayN){
  /* Walk completed months; no look-ahead. Same engine as live Macro. */
  displayN=displayN||24;
  if(!m1all||m1all.length<8) return [];
  // ensure sorted oldest-first
  const all=m1all.slice().sort((a,b)=>a[0]-b[0]);
  // drop any incomplete current calendar month
  const now=new Date();
  const cy=now.getUTCFullYear(), cm=now.getUTCMonth()+1;
  let completed=all.filter(k=>{const ym=ymFromTs(k[0]); return !(ym.y===cy&&ym.m===cm);});
  // one row per calendar month
  const dedup={};
  for(const k of completed){ const ym=ymFromTs(k[0]); dedup[ym.key]=k; }
  completed=Object.keys(dedup).sort().map(k=>dedup[k]);
  if(completed.length<8) return [];

  const results=[];
  let prev=null;
  const m1DnHist=[]; // sequential, no lookahead
  const startIdx=Math.max(12, completed.length-displayN-6);
  for(let i=startIdx;i<completed.length;i++){
    const k=completed[i];
    const ym=ymFromTs(k[0]);
    const snap=monthsUpTo(completed, ym.y, ym.m);
    if(snap.length<6) continue;
    const m1=snap;
    const m3=calendar3M(m1);
    const m6=calendar6M(m1);
    const y1=calendar1Y(m1);
    const sY=macroSwing(y1, 16, '1Y');
    const s6=macroSwing(m6, 20, '6M');
    const s3=macroSwing(m3, 24, '3M');
    const s1=macroSwing(m1, 30, '1M');
    const parabolic=detectParabolicAccel(m1);
    const m1Closes=m1.map(x=>+x[4]);
    const result=mapMacroState({y1:sY,m6:s6,m3:s3,m1:s1,parabolic}, prev, {m1DnHist:m1DnHist.slice(), m1Closes});
    m1DnHist.push(!!result.m1Dn);
    if(m1DnHist.length>3) m1DnHist.shift();
    prev=result.state;
    results.push({
      y:ym.y, m:ym.m, key:ym.key,
      label:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][ym.m-1],
      state:result.state, regime:result.regime, phase:result.phase, conf:result.conf, cycle:result.cycle,
      y1:sY, m6:s6, m3:s3, m1:s1,
      explain:explainMacro(result,{y1:sY,m6:s6,m3:s3,m1:s1}),
      style:macroStateStyle(result.state)
    });
  }
  // keep last displayN
  return results.slice(-displayN);
}
function renderMacroHistory(rows){
  const root=$('mac-history');
  if(!root) return;
  if(!rows||!rows.length){
    root.innerHTML='<div class="mac-hist-empty">Not enough completed monthly history.</div>';
    return;
  }
  // band
  const band=rows.map(r=>'<span class="mac-band-cell" style="background:'+r.style.band+'" title="'+r.key+' '+r.state+'"></span>').join('');
  // group by year
  const byYear={};
  for(const r of rows){
    if(!byYear[r.y]) byYear[r.y]=[];
    byYear[r.y].push(r);
  }
  let grid='';
  for(const y of Object.keys(byYear).map(Number).sort((a,b)=>a-b)){
    grid+='<div class="mac-hist-year">'+y+'</div><div class="mac-hist-grid">';
    for(const r of byYear[y]){
      grid+='<button type="button" class="mac-hist-cell" data-key="'+r.key+'" style="background:'+r.style.bg+';border-color:'+r.style.band+'33">'
        +'<div class="mac-hist-mon">'+r.label+'</div>'
        +'<div class="mac-hist-dot" style="color:'+r.style.fg+'">●</div>'
        +'<div class="mac-hist-short" style="color:'+r.style.fg+'">'+r.style.short+'</div>'
        +'</button>';
    }
    grid+='</div>';
  }
  root.innerHTML=
    '<div class="mac-hist-head"><div class="mac-hist-title">📊 MACRO HISTORY</div><div class="mac-hist-sub">24 MONTHS · ENGINE OUTPUT</div></div>'
    +'<div class="mac-band" aria-hidden="true">'+band+'</div>'
    +grid
    +'<div class="mac-hist-detail" id="mac-hist-detail"><div class="mac-hist-detail-placeholder">Tap a month for engine snapshot</div></div>';

  // detail on tap
  const detail=$('mac-hist-detail');
  const map={};
  for(const r of rows) map[r.key]=r;
  root.querySelectorAll('.mac-hist-cell').forEach(btn=>{
    btn.addEventListener('click',()=>{
      root.querySelectorAll('.mac-hist-cell').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      const r=map[btn.getAttribute('data-key')];
      if(!r||!detail) return;
      const g=function(s){
        if(!s||!s.available) return 'N/A';
        return (s.grade||s.bias||'—')+' · '+(s.detail||'');
      };
      detail.innerHTML=
        '<div class="mac-det-title">'+r.label+' '+r.y+'</div>'
        +'<div class="mac-det-state" style="color:'+r.style.fg+'">'+r.state+'</div>'
        +'<div class="mac-det-rows">'
        +'<div><span>1Y</span><b>'+g(r.y1)+'</b></div>'
        +'<div><span>6M</span><b>'+g(r.m6)+'</b></div>'
        +'<div><span>3M</span><b>'+g(r.m3)+'</b></div>'
        +'<div><span>1M</span><b>'+g(r.m1)+'</b></div>'
        +'<div><span>CONFIDENCE</span><b>'+r.conf+'</b></div>'
        +'</div>'
        +'<div class="mac-det-explain">'+r.explain+'</div>';
    });
  });
}


async function loadMacro(){
  try{
    const series=await fetchMacroSeries();
    const y1=macroSwing(series.y1, 16, '1Y');
    const m6=macroSwing(series.m6, 20, '6M');
    const m3=macroSwing(series.m3, 24, '3M');
    const m1=macroSwing(series.m1, 30, '1M');
    const parabolic=detectParabolicAccel(series.m1);
    let prev=null, m1DnHist=[];
    try{prev=localStorage.getItem(MACRO_STATE_KEY);}catch(e){}
    try{m1DnHist=JSON.parse(localStorage.getItem(MACRO_M1DN_KEY)||'[]'); if(!Array.isArray(m1DnHist)) m1DnHist=[];}catch(e){m1DnHist=[];}
    const m1Closes=(series.m1||[]).map(x=>+x[4]);
    const result=mapMacroState({y1,m6,m3,m1,parabolic}, prev, {m1DnHist:m1DnHist.slice(), m1Closes});
    // Update m1Dn history only when a new completed month appears
    try{
      const lastM=series.m1&&series.m1.length?ymUTC(series.m1[series.m1.length-1][0]):null;
      const key=lastM?(lastM.y+'-'+lastM.m):'';
      const prevKey=localStorage.getItem(MACRO_LAST_MONTH_KEY)||'';
      if(key&&key!==prevKey){
        m1DnHist.push(!!result.m1Dn);
        while(m1DnHist.length>3) m1DnHist.shift();
        localStorage.setItem(MACRO_M1DN_KEY, JSON.stringify(m1DnHist));
        localStorage.setItem(MACRO_LAST_MONTH_KEY, key);
        // re-evaluate with updated hist for this new month
        const result2=mapMacroState({y1,m6,m3,m1,parabolic}, prev, {m1DnHist:m1DnHist.slice(), m1Closes});
        Object.assign(result, result2);
      }
    }catch(e){}
    try{
      const histRows=buildMacroHistory(series.m1, 24);
      renderMacroHistory(histRows);
      try{ window.__macroHistory=histRows; }catch(e){}
    }catch(he){ console.warn('macro history', he); }
    try{localStorage.setItem(MACRO_STATE_KEY, result.state);}catch(e){}

    const color=result.phase==='PARABOLIC'?'#9af0c4':result.regime==='BULLISH'?'#62e3a0':result.regime==='BEARISH'?(result.phase.indexOf('BROKEN')>=0?'#ff6f7c':'#e6a050'):'#e6c878';
    if($('mac-state')){$('mac-state').textContent=result.state;$('mac-state').style.color=color;}
    if($('mac-regime'))$('mac-regime').textContent=result.regime;
    if($('mac-phase'))$('mac-phase').textContent=result.cycle;
    if($('mac-conf'))$('mac-conf').textContent=result.conf;
    if($('mac-explain'))$('mac-explain').textContent=explainMacro(result,{y1,m6,m3,m1});

    // Support / resistance from 6M/1Y protected levels
    const support=m6.protectedHL||y1.protectedHL||m3.protectedHL;
    const resist=m6.protectedLH||y1.protectedLH||m3.protectedLH;
    let supT='🟡 UNAVAILABLE', supC='#8491a1';
    if(support!=null){
      if(y1.hardBreak||m6.hardBreak){supT='🔴 LOST · '+Math.round(support).toLocaleString('en-US');supC='#ff6f7c';}
      else if(m6.wickWarn&&!m6.closeBreak){supT='🟡 WICK WARN · '+Math.round(support).toLocaleString('en-US');supC='#e6c878';}
      else {supT='🟢 HOLDING · '+Math.round(support).toLocaleString('en-US');supC='#62e3a0';}
    }
    let resT='🟡 UNAVAILABLE', resC='#8491a1';
    if(resist!=null){
      const px=m1.price||m3.price||m6.price;
      if(px!=null&&px>resist){resT='🟢 RECLAIMED · '+Math.round(resist).toLocaleString('en-US');resC='#62e3a0';}
      else {resT='🟡 OVERHEAD · '+Math.round(resist).toLocaleString('en-US');resC='#e6c878';}
    }

    const rows=[
      ['1Y STRUCTURE', macroGradeBadge(y1.grade).t+' · '+(y1.detail||''), macroGradeBadge(y1.grade).c],
      ['6M STRUCTURE', macroGradeBadge(m6.grade).t+' · '+(m6.detail||''), macroGradeBadge(m6.grade).c],
      ['3M STRUCTURE', macroGradeBadge(m3.grade).t+' · '+(m3.detail||''), macroGradeBadge(m3.grade).c],
      ['1M STRUCTURE', macroGradeBadge(m1.grade).t+' · '+(m1.detail||''), macroGradeBadge(m1.grade).c],
      ['MACRO SUPPORT', supT, supC],
      ['MACRO RESISTANCE', resT, resC],
      ['CYCLE PHASE', result.cycle, color],
      ['BIAS', result.regime, color],
      ['CONFIDENCE', result.conf, '#8491a1']
    ];
    if($('mac-evidence')){
      $('mac-evidence').innerHTML=rows.map(r=>'<div class="st-ev-row"><span class="k">'+r[0]+'</span><span class="v" style="color:'+r[2]+'">'+r[1]+'</span></div>').join('');
    }
    if($('macro-source'))$('macro-source').textContent='LIVE · 1M/3M/6M/1Y · closed candles';
  }catch(e){
    console.warn(e);
    if($('macro-source'))$('macro-source').textContent='OFFLINE';
    if($('mac-state'))$('mac-state').textContent='DATA UNAVAILABLE';
    if($('mac-explain'))$('mac-explain').textContent='Could not load macro inputs: '+String(e&&e.message||e);
  }
}

function showMacro(on){
  const panels=$('tf-panels'), trend=$('trend-panel'), sp=$('struct-panel'), mp=$('macro-panel');
  if(on){
    if(panels){panels.classList.add('hidden');panels.style.display='none';}
    if(trend){trend.classList.remove('on');trend.style.display='none';}
    if(sp){sp.classList.remove('on');sp.style.display='none';}
    if(mp){mp.classList.add('on');mp.style.display='block';}
  } else {
    if(mp){mp.classList.remove('on');mp.style.display='none';}
  }
}


function showStruct(on){
  const panels=$('tf-panels'), trend=$('trend-panel'), sp=$('struct-panel'), mp=$('macro-panel');
  if(on){
    if(panels){panels.classList.add('hidden');panels.style.display='none';}
    if(trend){trend.classList.remove('on');trend.style.display='none';}
    if(mp){mp.classList.remove('on');mp.style.display='none';}
    if(sp){sp.classList.add('on');sp.style.display='block';}
  } else {
    if(sp){sp.classList.remove('on');sp.style.display='none';}
  }
}

function showTrend(on){const panels=$('tf-panels'),trend=$('trend-panel'),sp=$('struct-panel'),mp=$('macro-panel');if(panels){panels.classList.toggle('hidden',!!on);panels.style.display=on?'none':'';}if(trend){trend.classList.toggle('on',!!on);trend.style.display=on?'block':'none';}if(sp&&on){sp.classList.remove('on');sp.style.display='none';}if(mp&&on){mp.classList.remove('on');mp.style.display='none';}}
document.querySelectorAll('#tf-tabs .tab').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('#tf-tabs .tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const tf=btn.getAttribute('data-tf');if(tf==='trend'){showMacro(false);showStruct(false);showTrend(true);loadTrend();}else if(tf==='struct'){showMacro(false);showTrend(false);showStruct(true);loadStructural();}else if(tf==='macro'){showTrend(false);showStruct(false);showMacro(true);loadMacro();}else{showMacro(false);showStruct(false);showTrend(false);currentTF=tf;const panels=$('tf-panels');if(panels){panels.classList.remove('hidden');panels.style.display='';}loadTF(currentTF);}});});
window.addEventListener('resize',()=>{if(fibChart){const el=$('fib-tv');if(el)fibChart.applyOptions({width:el.clientWidth});}if(macdChart){const el=$('macd-tv');if(el)macdChart.applyOptions({width:el.clientWidth});}});
async function tick(){await loadMarket();if(currentTF==='trend'){showTrend(true);await loadTrend();}else{showTrend(false);await loadTF(currentTF);}}tick();setInterval(()=>loadMarket(),60000);setInterval(()=>{const act=document.querySelector('#tf-tabs .tab.active');const at=act&&act.getAttribute('data-tf');if(at==='trend')loadTrend();else if(at==='struct')loadStructural();else if(at==='macro')loadMacro();else loadTF(currentTF);},60000);
})();
