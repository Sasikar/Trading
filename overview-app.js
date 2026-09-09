/* NASDAQ_LIVE_RETRY2 */
/* NASDAQ_LIVE_LABEL_V1 */
/* NASDAQ_STATIC_V2 */
(function(){
const $=id=>document.getElementById(id);
const fmt=(n,d)=>n==null||!isFinite(n)?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:d!=null?d:(n>=1000?0:2)});
const money=n=>n==null?'—':'$'+fmt(n,n>=1000?0:2);
const TF={'4h':{interval:'4h',label:'4H',limit:100,swing:50,volAvg:20,fibBars:40,macdBars:40,rightOff:8,barSp:5},'1d':{interval:'1d',label:'1D',limit:120,swing:60,volAvg:20,fibBars:40,macdBars:50,rightOff:10,barSp:6},'1w':{interval:'1w',label:'1W',limit:80,swing:26,volAvg:20,fibBars:26,macdBars:40,rightOff:8,barSp:12},'1M':{interval:'1M',label:'1M',limit:48,swing:18,volAvg:12,fibBars:18,macdBars:24,rightOff:6,barSp:14}};
let currentTF='trend',fibChart,fibSeries,fibVol,fibLines=[],macdChart,macdLineS,sigLineS,histS,structW1Chart,structW1Series,structW1Lines=[],sigChart,sigCandle,sigEma50,sigEma200;
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
    const bases=[];
    try{ bases.push(new URL('data/btc-monthly.json', location.href).href); }catch(e){}
    bases.push('./data/btc-monthly.json','data/btc-monthly.json');
    for(const u of bases){ raw=await jget(u); if(raw&&raw.length) break; }

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
  let mapped=slice.map(k=>[k[0]*1000,+k[1],+k[2],+k[3],+k[4],+k[6]]);
  // Optional: Binance taker-buy volume for CVD (field index 6). Ignore failures.
  try{
    const biv={'4h':'4h','1d':'1d','1w':'1w','1h':'1h'}[interval];
    if(biv){
      const bj=await jget('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval='+biv+'&limit='+Math.min(limit,500));
      if(bj&&bj.length){
        const byTs={};
        for(const r of bj){ byTs[+r[0]]=+r[9]; } // taker buy base
        mapped=mapped.map(k=>{
          const tb=byTs[k[0]];
          return (tb!=null && isFinite(tb)) ? [k[0],k[1],k[2],k[3],k[4],k[5],tb] : k;
        });
      }
    }
  }catch(e){}
  return mapped;
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
  const bases=[];
  try{ bases.push(new URL('data/btc-monthly.json', location.href).href); }catch(e){}
  bases.push('./data/btc-monthly.json','data/btc-monthly.json');
  for(const u of bases){
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

function pivots(H,L,C){const P=(H+L+C)/3;return{P,R1:2*P-L,S1:2*P-H,R2:P+(H-L),S2:P-(H-L),R3:H+2*(P-L),S3:L-2*(H-P)};}
function renderLadder(spot,rows,id){const maxD=Math.max(...rows.map(r=>Math.abs(spot-r.price)),1);const el=$(id);if(!el)return;el.innerHTML=rows.map(r=>{const dist=spot-r.price,pct=(dist/spot)*100,barW=Math.min(100,Math.abs(dist)/maxD*100);return '<div class="lvl '+r.kind+'"><span class="tag">'+r.key+'</span><div><div class="price">'+money(r.price)+'</div><div class="bar-wrap"><div class="bar" style="width:'+barW+'%"></div></div></div><span class="dist">'+(dist>=0?'+':'')+fmt(dist,0)+'</span></div>';}).join('');}
const FIB=[{r:0,label:'0%'},{r:0.236,label:'23.6%'},{r:0.382,label:'38.2%'},{r:0.5,label:'50%'},{r:0.618,label:'61.8%'},{r:0.786,label:'78.6%'},{r:1,label:'100%'}];
function destroyFib(){if(fibChart){try{fibChart.remove();}catch(e){}fibChart=null;fibSeries=null;fibVol=null;fibLines=[];}}
function destroyMacd(){if(macdChart){try{macdChart.remove();}catch(e){}macdChart=null;macdLineS=null;sigLineS=null;histS=null;}}
function ensureFib(){const el=$('fib-tv');if(!el||typeof LightweightCharts==='undefined')return null;if(fibChart)return fibChart;fibChart=LightweightCharts.createChart(el,{layout:{background:{type:'solid',color:'#080d13'},textColor:'#9aa6b5'},grid:{vertLines:{color:'#121820'},horzLines:{color:'#121820'}},rightPriceScale:{borderColor:'#1c2430'},timeScale:{borderColor:'#1c2430',timeVisible:true},crosshair:{mode:1},width:el.clientWidth,height:el.clientHeight||260});fibSeries=fibChart.addCandlestickSeries({upColor:'#62e3a0',downColor:'#ff6f7c',borderUpColor:'#62e3a0',borderDownColor:'#ff6f7c',wickUpColor:'#62e3a0',wickDownColor:'#ff6f7c'});fibVol=fibChart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'vol'});fibChart.priceScale('vol').applyOptions({scaleMargins:{top:0.8,bottom:0}});return fibChart;}
function ensureMacd(){const el=$('macd-tv');if(!el||typeof LightweightCharts==='undefined')return null;if(macdChart)return macdChart;macdChart=LightweightCharts.createChart(el,{layout:{background:{type:'solid',color:'#080d13'},textColor:'#9aa6b5'},grid:{vertLines:{color:'#121820'},horzLines:{color:'#121820'}},rightPriceScale:{borderColor:'#1c2430'},timeScale:{borderColor:'#1c2430',timeVisible:true},crosshair:{mode:1},width:el.clientWidth,height:el.clientHeight||200});histS=macdChart.addHistogramSeries({priceFormat:{type:'price',precision:0,minMove:1},priceScaleId:'right'});macdLineS=macdChart.addLineSeries({color:'#6eb6ff',lineWidth:2,priceScaleId:'right'});sigLineS=macdChart.addLineSeries({color:'#e6c878',lineWidth:2,lineStyle:2,priceScaleId:'right'});return macdChart;}
function ema(arr,n){const o=[],k=2/(n+1);let prev=null;for(let i=0;i<arr.length;i++){if(arr[i]==null){o.push(null);continue;}if(prev==null){let s=0,c=0;for(let j=0;j<=i;j++)if(arr[j]!=null){s+=arr[j];c++;}if(c<n){o.push(null);continue;}prev=s/c;o.push(prev);continue;}prev=arr[i]*k+prev*(1-k);o.push(prev);}return o;}
function calcRSI(closes,period=14){if(closes.length<period+1)return null;let gains=0,losses=0;for(let i=closes.length-period;i<closes.length;i++){const d=closes[i]-closes[i-1];if(d>=0)gains+=d;else losses-=d;}const ag=gains/period,al=losses/period;if(al===0)return 100;return 100-(100/(1+ag/al));}
function calcMACDSeries(closes,times){const e12=ema(closes,12),e26=ema(closes,26);const macdLine=closes.map((_,i)=>(e12[i]!=null&&e26[i]!=null)?e12[i]-e26[i]:null);const signal=ema(macdLine.map(v=>v==null?0:v),9);const hist=[],ml=[],sl=[];for(let i=0;i<closes.length;i++){if(macdLine[i]==null||signal[i]==null||times[i]==null)continue;const h=macdLine[i]-signal[i];hist.push({time:times[i],value:h,color:h>=0?'rgba(98,227,160,.55)':'rgba(255,111,124,.55)'});ml.push({time:times[i],value:macdLine[i]});sl.push({time:times[i],value:signal[i]});}const last=hist.length?hist[hist.length-1]:null,prev=hist.length>1?hist[hist.length-2]:null;return{hist,ml,sl,lastHist:last?last.value:null,prevHist:prev?prev.value:null,lastMacd:ml.length?ml[ml.length-1].value:null,lastSig:sl.length?sl[sl.length-1].value:null};}

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



/** CVD from OHLC+vol. Prefer taker-buy (k[6]) when present; else body-weighted signed volume. */
function calcCVD(kl){
  let cvd=0;
  const out=[];
  for(const k of kl){
    const o=+k[1], h=+k[2], l=+k[3], c=+k[4], v=+k[5]||0;
    let delta=0;
    if(k.length>6 && k[6]!=null && isFinite(+k[6])){
      const buy=+k[6];
      const sell=Math.max(0, v-buy);
      delta=buy-sell; // true-ish delta
    } else if(h>l){
      // body weight in [-1,1] × volume
      delta=((c-o)/(h-l))*v;
    } else {
      delta=c>=o?v:-v;
    }
    cvd+=delta;
    out.push({delta, cvd, buy:delta>=0});
  }
  return out;
}
function fmtCVD(x){
  if(x==null||!isFinite(x)) return '—';
  const a=Math.abs(x);
  const s=x>=0?'+':'-';
  if(a>=1e6) return s+(a/1e6).toFixed(2)+'M';
  if(a>=1e3) return s+(a/1e3).toFixed(1)+'K';
  return s+a.toFixed(0);
}

async function loadTF(tfKey){const cfg=TF[tfKey]||TF['1d'];['tf-name','macd-tf-name','sr-tf-name'].forEach(id=>{if($(id))$(id).textContent=cfg.label;});try{const [kl,spot]=await Promise.all([fetchKlines(cfg.interval,cfg.limit),fetchPrice()]);if(!kl||!kl.length||spot==null)throw new Error('nodata');const swing=kl.slice(-cfg.swing);let hi=-Infinity,lo=Infinity;for(const k of swing){hi=Math.max(hi,+k[2]);lo=Math.min(lo,+k[3]);}const range=hi-lo||1;const levels=FIB.map(({r,label})=>({key:label,price:lo+range*r,kind:(r===0.382||r===0.5||r===0.618)?'fib-key':'fib',r})).sort((a,b)=>b.price-a.price);$('fib-spot').textContent=money(spot);$('fib-meta').textContent='BTC · '+cfg.label;let nearest=levels[0],nd=Math.abs(spot-levels[0].price);levels.forEach(l=>{const d=Math.abs(spot-l.price);if(d<nd){nd=d;nearest=l;}});$('fib-bias').textContent='Near '+nearest.key;renderLadder(spot,levels,'fib-ladder');destroyFib();ensureFib();const slice=kl.slice(-cfg.fibBars);const candles=slice.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4]}));fibSeries.setData(candles);fibVol.setData(slice.map(k=>({time:Math.floor(k[0]/1000),value:+k[5],color:(+k[4]>=+k[1])?'rgba(98,227,160,.35)':'rgba(255,111,124,.35)'})));levels.forEach(l=>{const k=l.kind==='fib-key';fibLines.push(fibSeries.createPriceLine({price:l.price,color:k?'#e6c878':'#6eb6ff',lineWidth:k?2:1,lineStyle:k?0:2,axisLabelVisible:true,title:l.key}));});const pad=range*0.06;fibSeries.applyOptions({autoscaleInfoProvider:()=>({priceRange:{minValue:lo-pad,maxValue:hi+pad}})});const n=candles.length;fibChart.timeScale().applyOptions({rightOffset:cfg.rightOff,barSpacing:cfg.barSp,fixLeftEdge:false,fixRightEdge:false});fibChart.timeScale().setVisibleLogicalRange({from:Math.max(-0.5,n-35),to:n-1+cfg.rightOff});$('fib-source').textContent='LIVE · '+cfg.label;const closes=kl.map(k=>+k[4]),times=kl.map(k=>Math.floor(k[0]/1000)),vols=kl.map(k=>+k[5]);const pack=calcMACDSeries(closes,times);destroyMacd();ensureMacd();const ms=Math.min(pack.hist.length,cfg.macdBars);histS.setData(pack.hist.slice(-ms));macdLineS.setData(pack.ml.slice(-ms));sigLineS.setData(pack.sl.slice(-ms));const h=pack.lastHist,m=pack.lastMacd,s=pack.lastSig;const f=v=>(v==null?'—':((v>=0?'+':'')+v.toFixed(0)));$('macd-note').textContent='HIST '+f(h)+' · LINE '+f(m)+' · SIG '+f(s);$('macd-source').textContent='LIVE · '+cfg.label;const rsi=calcRSI(closes,14);if(rsi!=null){$('rsi-val').textContent=rsi.toFixed(1);$('rsi-sub').textContent=rsi>=70?'OB':rsi<=30?'OS':'Mid';$('rsi-tag').textContent=rsi>=70?'OVERBOUGHT':rsi<=30?'OVERSOLD':'NEUTRAL';$('rsi-tag').className='tag '+(rsi>=70?'tag-bear':rsi<=30?'tag-bull':'tag-neut');}const lastV=vols[vols.length-1],avgN=Math.min(cfg.volAvg,vols.length-1),avg=vols.slice(-(avgN+1),-1).reduce((a,b)=>a+b,0)/Math.max(1,avgN),vRatio=avg?lastV/avg:1;$('vol-val').textContent=vRatio.toFixed(2)+'×';$('vol-sub').textContent='vs avg';$('vol-tag').textContent=vRatio>=1.4?'HIGH':vRatio<=0.7?'THIN':'OK';$('vol-tag').className='tag '+(vRatio>=1.4?'tag-bull':vRatio<=0.7?'tag-bear':'tag-neut');
const cvdSeries=calcCVD(kl);
if(cvdSeries.length){
  const last=cvdSeries[cvdSeries.length-1];
  const prev=cvdSeries.length>5?cvdSeries[cvdSeries.length-6]:cvdSeries[0];
  const slope=last.cvd-(prev?prev.cvd:0);
  const d=last.delta;
  if($('cvd-val')){
    $('cvd-val').textContent=fmtCVD(last.cvd);
    $('cvd-val').style.color=slope>=0?'#62e3a0':'#ff6f7c';
    $('cvd-sub').textContent='cum · last '+cvdSeries.length+' bars';
    const buyBias=slope>0&&d>=0, sellBias=slope<0&&d<=0;
    $('cvd-tag').textContent=buyBias?'BUY PRESSURE':sellBias?'SELL PRESSURE':(slope>=0?'CVD↑':'CVD↓');
    $('cvd-tag').className='tag '+(buyBias?'tag-bull':sellBias?'tag-bear':'tag-neut');
    if($('cvd-source'))$('cvd-source').textContent='LIVE · '+(cfg&&cfg.label?cfg.label:'');
  }
  if($('cvd-delta')){
    $('cvd-delta').textContent=fmtCVD(d);
    $('cvd-delta').style.color=d>=0?'#62e3a0':'#ff6f7c';
    $('cvd-delta-sub').textContent=d>=0?'buy-leaning candle':'sell-leaning candle';
    $('cvd-delta-tag').textContent=d>=0?'BUY Δ':'SELL Δ';
    $('cvd-delta-tag').className='tag '+(d>=0?'tag-bull':'tag-bear');
  }
}if(kl.length>=2){const prev=kl[kl.length-2];const piv=pivots(+prev[2],+prev[3],+prev[4]);renderLadder(spot,[{key:'R3',price:piv.R3,kind:'r'},{key:'R2',price:piv.R2,kind:'r'},{key:'R1',price:piv.R1,kind:'r'},{key:'P',price:piv.P,kind:'p'},{key:'S1',price:piv.S1,kind:'s'},{key:'S2',price:piv.S2,kind:'s'},{key:'S3',price:piv.S3,kind:'s'}],'sr-ladder');$('sr-spot').textContent=money(spot);$('sr-meta').textContent='BTC · '+cfg.label;$('sr-bias').textContent=spot>piv.P?'ABOVE P':'BELOW P';$('sr-source').textContent='OKX · '+cfg.label;}}catch(e){console.warn(e);$('fib-source').textContent='OFFLINE';}}
function emaArr(closes,n){const o=[],k=2/(n+1);let prev=null;for(let i=0;i<closes.length;i++){if(prev==null){if(i<n-1){o.push(null);continue;}let s=0;for(let j=i-n+1;j<=i;j++)s+=closes[j];prev=s/n;o.push(prev);continue;}prev=closes[i]*k+prev*(1-k);o.push(prev);}return o;}
function trendFromCloses(closes){if(closes.length<200)return{dir:'NEUTRAL',detail:'need 200'};const e50=emaArr(closes,50),e200=emaArr(closes,200);const c=closes[closes.length-1],a=e50[e50.length-1],b=e200[e200.length-1];if(a==null||b==null)return{dir:'NEUTRAL',detail:'EMA'};let dir='NEUTRAL';if(c>a&&c>b)dir='BULLISH';else if(c<a&&c<b)dir='BEARISH';const f=x=>Math.round(x).toLocaleString('en-US');return{dir,detail:'C '+f(c)+' · 50 '+f(a)+' · 200 '+f(b)};}
function colorDir(dir){return dir==='BULLISH'?'#62e3a0':dir==='BEARISH'?'#ff6f7c':'#e6c878';}
function macdMomentum(closes,times){const pack=calcMACDSeries(closes,times);const h=pack.lastHist,m=pack.lastMacd,s=pack.lastSig,ph=pack.prevHist;let dir='FADING';if(m!=null&&s!=null&&h!=null){if(m>s&&h>0)dir='BULLISH';else if(m<s&&h<0)dir='BEARISH';}const fresh=ph!=null&&h!=null&&((ph<0&&h>=0)||(ph>=0&&h<0));const f=v=>(v==null?'—':((v>=0?'+':'')+Number(v).toFixed(0)));return{dir,label:dir+(fresh?' (fresh cross)':''),detail:'HIST '+f(h)+' · LINE '+f(m)+' · SIG '+f(s)};}
async function loadMarketStructure(direction,klDaily){const statusEl=$('ms-status'),subEl=$('ms-sub');const set=(id,v,h)=>{if($(id))$(id).textContent=v;if(h&&$(id+'-h'))$(id+'-h').textContent=h;};try{const rows=Array.isArray(klDaily)&&klDaily.length>16?klDaily.slice(0,-1):[];if(rows.length>=15){const trs=[];for(let i=1;i<rows.length;i++){const h=+rows[i][2],l=+rows[i][3],pc=+rows[i-1][4];trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));}const atr=trs.slice(-14).reduce((a,b)=>a+b,0)/14;const mark=+rows[rows.length-1][4];const bull=direction==='BULLISH';const inv=bull?mark-1.5*atr:mark+1.5*atr;const pct=Math.abs(inv-mark)/mark*100;set('ms-atr',money(inv)+' · '+pct.toFixed(1)+'%',(bull?'below':'above')+' mark');}else set('ms-atr','Data Unavailable');}catch(e){set('ms-atr','Data Unavailable');}set('ms-liq','Data Unavailable','no estimated levels');let book=null,fetchedAt=null;try{const res=await fetch('/api/orderbook?instId=BTC-USDT&sz=50',{cache:'no-store',credentials:'same-origin'});if(res.ok){book=await res.json();fetchedAt=Date.now();}}catch(e){}if(!book||!book.bids||!book.asks||!book.bids.length){statusEl.className='struct-status unav';statusEl.textContent='⚪ Unavailable';subEl.textContent='Orderbook missing.';set('ms-spread','Data Unavailable');set('ms-bid','Data Unavailable');set('ms-conc','Data Unavailable');set('ms-fresh','Data Unavailable');return;}const ageMs=Date.now()-(fetchedAt||(book.ts?+book.ts:Date.now()));if(ageMs>60000){statusEl.className='struct-status unav';statusEl.textContent='⚪ Unavailable';subEl.textContent='Book stale >60s.';set('ms-fresh',(ageMs/1000).toFixed(1)+'s','stale');set('ms-spread','Data Unavailable');set('ms-bid','Data Unavailable');set('ms-conc','Data Unavailable');return;}set('ms-fresh',(ageMs/1000).toFixed(2)+'s',ageMs>5000?'ok':'fresh');const bestBid=+book.bids[0][0],bestAsk=+book.asks[0][0],mid=(bestBid+bestAsk)/2,spreadBps=((bestAsk-bestBid)/mid)*10000;const key='ms_spread_samples_v1';let samples=[];try{samples=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){}samples.push({t:Date.now(),bps:spreadBps});while(samples.length>40)samples.shift();try{localStorage.setItem(key,JSON.stringify(samples));}catch(e){}const nums=samples.map(x=>x.bps).filter(x=>isFinite(x)).sort((a,b)=>a-b);const med=nums.length>=5?nums[Math.floor(nums.length/2)]:null;const wide=med!=null?spreadBps>3*med:spreadBps>5;set('ms-spread',spreadBps.toFixed(2)+' bps',(wide?'Wide':'Normal')+(med!=null?' vs med '+med.toFixed(2):''));let bid2=0,ask2=0,bid05=0,ask05=0;for(const [p,sz] of book.bids){const price=+p,n=price*+sz,pct=(mid-price)/mid*100;if(pct<=2)bid2+=n;if(pct<=0.5)bid05+=n;}for(const [p,sz] of book.asks){const price=+p,n=price*+sz,pct=(price-mid)/mid*100;if(pct<=2)ask2+=n;if(pct<=0.5)ask05+=n;}const total2=bid2+ask2,bull=direction==='BULLISH',side=total2>0?((bull?bid2:ask2)/total2)*100:null;if(side==null)set('ms-bid','Data Unavailable');else set('ms-bid',side.toFixed(1)+'%',(bull?'Bid':'Ask')+(side<40?' · thin':''));const conc=total2>0?((bid05+ask05)/total2)*100:null;if(conc==null)set('ms-conc','Data Unavailable');else set('ms-conc',conc.toFixed(1)+'%','not support guarantee');const warnings=[];if(wide)warnings.push('wide spread');if(side!=null&&side<40)warnings.push(bull?'thin bid':'thin ask');let status='Protected',cls='prot',icon='🟢';if(warnings.length>=2||(side!=null&&side<40&&wide)){status='Vulnerable';cls='vuln';icon='🔴';}else if(warnings.length===1){status='Caution';cls='caut';icon='🟡';}statusEl.className='struct-status '+cls;statusEl.textContent=icon+' '+status;subEl.textContent=(warnings.length?'Warnings: '+warnings.join(', ')+'. ':'No book warnings. ')+'Observable only.';}

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


async function loadTrend(){try{const [klD,klW,kl4]=await Promise.all([fetchKlines('1d',220),fetchKlines('1w',220),fetchKlines('4h',120)]);const dT=trendFromCloses(klD.map(k=>+k[4])),wT=trendFromCloses(klW.map(k=>+k[4]));$('tr-1d').textContent=dT.dir;$('tr-1d').style.color=colorDir(dT.dir);$('tr-1w').textContent=wT.dir;$('tr-1w').style.color=colorDir(wT.dir);$('tr-1d-det').textContent=dT.detail;$('tr-1w-det').textContent=wT.detail;const dMom=macdMomentum(klD.map(k=>+k[4]),klD.map(k=>Math.floor(k[0]/1000)));const wMom=macdMomentum(klW.map(k=>+k[4]),klW.map(k=>Math.floor(k[0]/1000)));if($('tr-1d-mom')){$('tr-1d-mom').textContent=dMom.label;$('tr-1d-mom').style.color=colorDir(dMom.dir==='FADING'?'NEUTRAL':dMom.dir);}if($('tr-1w-mom')){$('tr-1w-mom').textContent=wMom.label;$('tr-1w-mom').style.color=colorDir(wMom.dir==='FADING'?'NEUTRAL':wMom.dir);}if($('tr-1d-macd'))$('tr-1d-macd').textContent=dMom.detail;if($('tr-1w-macd'))$('tr-1w-macd').textContent=wMom.detail;const closes=kl4.map(k=>+k[4]),times=kl4.map(k=>Math.floor(k[0]/1000)),vols=kl4.map(k=>+k[5]);const pack=calcMACDSeries(closes,times);const h=pack.lastHist,m=pack.lastMacd,s=pack.lastSig,ph=pack.prevHist;let macdDir='NONE';if(ph!=null&&ph<0&&h>=0)macdDir='BULLISH';else if(ph!=null&&ph>=0&&h<0)macdDir='BEARISH';else if(h>0)macdDir='BULLISH';else if(h<0)macdDir='BEARISH';const rsi=calcRSI(closes,14);const lastV=vols[vols.length-1];const avg=vols.slice(-31,-1).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(30,vols.length-1));const vRatio=avg?lastV/avg:1;$('tr-4h').textContent=macdDir==='NONE'?'NO CROSS':macdDir;$('tr-4h').style.color=colorDir(macdDir==='NONE'?'NEUTRAL':macdDir);if($('tr-4h-vol')){$('tr-4h-vol').textContent=vRatio.toFixed(2)+'×';}
const cvd4=calcCVD(kl4);
if(cvd4.length){
  const last=cvd4[cvd4.length-1];
  const prev=cvd4.length>5?cvd4[cvd4.length-6]:cvd4[0];
  const slope=last.cvd-(prev?prev.cvd:0);
  if($('tr-4h-cvd')){$('tr-4h-cvd').textContent=fmtCVD(last.cvd);$('tr-4h-cvd').style.color=slope>=0?'#62e3a0':'#ff6f7c';}
  if($('tr-4h-delta')){$('tr-4h-delta').textContent=fmtCVD(last.delta);$('tr-4h-delta').style.color=last.delta>=0?'#62e3a0':'#ff6f7c';}
  const bias=slope>0&&last.delta>=0?'BUY':(slope<0&&last.delta<=0?'SELL':(slope>=0?'CVD↑':'CVD↓'));
  if($('tr-4h-cvd-bias')){$('tr-4h-cvd-bias').textContent=bias;$('tr-4h-cvd-bias').style.color=bias==='BUY'||bias==='CVD↑'?'#62e3a0':(bias==='SELL'||bias==='CVD↓'?'#ff6f7c':'#e6c878');}
}
$('tr-macd-det').textContent='HIST '+(h==null?'—':((h>=0?'+':'')+h.toFixed(0)));$('tr-rsi-det').textContent='RSI '+(rsi!=null?rsi.toFixed(1):'—')+' · Vol '+vRatio.toFixed(2)+'×';let score='NO SIGNAL — WAIT',scoreColor='#8491a1',sub='Wait for clearer 4H bias.';const bull4=macdDir==='BULLISH',bear4=macdDir==='BEARISH';const dBullE=dT.dir==='BULLISH',wBullE=wT.dir==='BULLISH',dBearE=dT.dir==='BEARISH',wBearE=wT.dir==='BEARISH';const dBullM=dMom.dir==='BULLISH',wBullM=wMom.dir==='BULLISH';if(bull4){if(dBullE&&wBullE&&dBullM&&wBullM){score='STRONG CONFIRMATION';scoreColor='#62e3a0';sub='Full alignment.';}else if(dBullE&&wBullE){score='MODERATE CONFIRMATION';scoreColor='#e6c878';const soft=[];if(!dBullM)soft.push('1D MACD '+dMom.dir.toLowerCase());if(!wBullM)soft.push('1W MACD '+wMom.dir.toLowerCase());sub='HTF EMAs bullish, but '+(soft.join(' + ')||'MACD soft')+'.';}else if(dBearE||wBearE){score='WEAK — COUNTER-TREND BOUNCE';scoreColor='#ff6f7c';sub='Against HTF EMA.';}else{score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub='HTF mixed.';}}else if(bear4){if(dBearE&&wBearE){score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub='Bearish HTF.';}else if(dBullE||wBullE){score='WEAK — COUNTER-TREND BOUNCE';scoreColor='#62e3a0';sub='Against HTF EMA.';}else{score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub='Mixed.';}}if(vRatio<0.3&&score.indexOf('STRONG')===0){score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub+=' · thin volume.';}$('tr-score').textContent=score;$('tr-score').style.color=scoreColor;$('tr-score-sub').textContent=sub;try{renderStretch(calcStretchScore(klD),{dir:dT.dir,mom:dMom.dir});}catch(err){console.warn('stretch',err);renderStretch({score:0,max:8,label:'Error',items:[]},{dir:dT&&dT.dir,mom:dMom&&dMom.dir});}let stretchDir='NEUTRAL';if(dT.dir==='BULLISH'&&wT.dir==='BULLISH')stretchDir='BULLISH';else if(dT.dir==='BEARISH'&&wT.dir==='BEARISH')stretchDir='BEARISH';else if(dT.dir==='BULLISH'||wT.dir==='BULLISH')stretchDir='BULLISH';else if(dT.dir==='BEARISH'||wT.dir==='BEARISH')stretchDir='BEARISH';await loadMarketStructure(stretchDir,klD);$('trend-source').textContent='LIVE · 1D · 1W · 4H';}catch(e){console.warn(e);if($('trend-source'))$('trend-source').textContent='OFFLINE';if($('tr-score'))$('tr-score').textContent='DATA OFFLINE';if($('tr-score-sub'))$('tr-score-sub').textContent=String(e&&e.message||e);}}

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


function destroyStructW1(){
  if(structW1Chart){
    try{structW1Chart.remove();}catch(e){}
    structW1Chart=null;structW1Series=null;structW1Lines=[];
  }
}
function ensureStructW1(){
  const el=$('struct-w1-tv');
  if(!el||typeof LightweightCharts==='undefined') return null;
  if(structW1Chart) return structW1Chart;
  structW1Chart=LightweightCharts.createChart(el,{
    layout:{background:{type:'solid',color:'#080d13'},textColor:'#9aa6b5'},
    grid:{vertLines:{color:'#121820'},horzLines:{color:'#121820'}},
    rightPriceScale:{borderColor:'#1c2430'},
    timeScale:{borderColor:'#1c2430',timeVisible:true,secondsVisible:false},
    crosshair:{mode:1},
    width:el.clientWidth,
    height:el.clientHeight||280
  });
  structW1Series=structW1Chart.addCandlestickSeries({
    upColor:'#62e3a0',downColor:'#ff6f7c',
    borderUpColor:'#62e3a0',borderDownColor:'#ff6f7c',
    wickUpColor:'#62e3a0',wickDownColor:'#ff6f7c'
  });
  return structW1Chart;
}

/** Lite TV chart: weekly candles + pivot LH/LL + protected HL/LH lines explaining 1W structure label */
function renderStructW1Chart(klW, wStruct){
  const cap=$('struct-w1-caption');
  const leg=$('struct-w1-legend');
  if(!klW||!klW.length||!wStruct||!wStruct.available){
    if(cap) cap.textContent='Weekly structure unavailable';
    if(leg) leg.textContent='';
    destroyStructW1();
    return;
  }
  const lookback=52;
  const slice=klW.slice(-lookback);
  const left=3, right=3;
  const highs=slice.map(k=>+k[2]), lows=slice.map(k=>+k[3]);
  const {pivH, pivL}=pivotsFromOHLC(highs, lows, left, right);

  const wB=structureRowLabel(wStruct);
  if(cap){
    cap.textContent=wB.t+(wStruct.detail?(' · '+wStruct.detail):'');
    cap.style.color=wB.c;
  }

  destroyStructW1();
  if(!ensureStructW1()||!structW1Series) return;

  const candles=slice.map(k=>({
    time:Math.floor(k[0]/1000),
    open:+k[1], high:+k[2], low:+k[3], close:+k[4]
  }));
  structW1Series.setData(candles);

  // Markers on last significant pivot highs/lows (LH / LL story)
  const markers=[];
  const lastH=pivH.slice(-3);
  const lastL=pivL.slice(-3);
  lastH.forEach((p,idx)=>{
    const t=candles[p.i]&&candles[p.i].time;
    if(t==null) return;
    markers.push({
      time:t, position:'aboveBar',
      color: idx===lastH.length-1?'#e6a050':'#8491a1',
      shape:'arrowDown',
      text: idx===0&&lastH.length>=2?'PH':(idx===lastH.length-1?'LH?':'H')
    });
  });
  lastL.forEach((p,idx)=>{
    const t=candles[p.i]&&candles[p.i].time;
    if(t==null) return;
    markers.push({
      time:t, position:'belowBar',
      color: idx===lastL.length-1?'#e6a050':'#8491a1',
      shape:'arrowUp',
      text: idx===0&&lastL.length>=2?'PL':(idx===lastL.length-1?'LL?':'L')
    });
  });
  // Clarify labels when LH+LL confirmed
  if(wStruct.lh&&lastH.length>=2){
    const a=lastH[lastH.length-2], b=lastH[lastH.length-1];
    if(candles[a.i]) markers.push({time:candles[a.i].time, position:'aboveBar', color:'#ff6f7c', shape:'circle', text:'H1'});
    if(candles[b.i]) markers.push({time:candles[b.i].time, position:'aboveBar', color:'#ff6f7c', shape:'circle', text:'LH'});
  }
  if(wStruct.ll&&lastL.length>=2){
    const a=lastL[lastL.length-2], b=lastL[lastL.length-1];
    if(candles[a.i]) markers.push({time:candles[a.i].time, position:'belowBar', color:'#ff6f7c', shape:'circle', text:'L1'});
    if(candles[b.i]) markers.push({time:candles[b.i].time, position:'belowBar', color:'#ff6f7c', shape:'circle', text:'LL'});
  }
  // Dedupe by time+position keep last
  const mkMap={};
  markers.forEach(m=>{mkMap[m.time+'|'+m.position]=m;});
  structW1Series.setMarkers(Object.values(mkMap).sort((a,b)=>a.time-b.time));

  structW1Lines=[];
  if(wStruct.protectedHL!=null){
    structW1Lines.push(structW1Series.createPriceLine({
      price:wStruct.protectedHL, color:'#62e3a0', lineWidth:2, lineStyle:2,
      axisLabelVisible:true, title:'Prot HL'
    }));
  }
  if(wStruct.protectedLH!=null){
    structW1Lines.push(structW1Series.createPriceLine({
      price:wStruct.protectedLH, color:'#ff6f7c', lineWidth:2, lineStyle:2,
      axisLabelVisible:true, title:'Prot LH'
    }));
  }

  const n=candles.length;
  structW1Chart.timeScale().applyOptions({rightOffset:4, barSpacing:8});
  structW1Chart.timeScale().setVisibleLogicalRange({from:Math.max(-0.5,n-40), to:n+2});

  if(leg){
    const bits=[];
    if(wStruct.lh&&wStruct.ll) bits.push('LH + LL = lower high and lower low pivots → DETERIORATING (not yet BROKEN unless closes lose Prot HL).');
    else if(wStruct.hh&&wStruct.hl) bits.push('HH + HL = higher high and higher low → INTACT bullish structure.');
    else bits.push('Mixed pivots — see markers vs protected levels.');
    if(wStruct.protectedHL!=null) bits.push('Green line = protected higher-low (support thesis).');
    if(wStruct.protectedLH!=null) bits.push('Red line = protected lower-high (resistance thesis).');
    if(wStruct.hardBreakDown) bits.push('Two completed weekly closes below Prot HL → BROKEN.');
    else if(wStruct.closeBelowHL) bits.push('Last completed week closed below Prot HL.');
    else if(wStruct.wickBelowHL) bits.push('Wick under Prot HL only — warning, not close break.');
    leg.textContent=bits.join(' ');
  }
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
    try{renderStructW1Chart(klW, wStruct);}catch(err){console.warn('struct chart',err);}
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
    try{
      renderStructW1Chart(klW, wStruct);
      requestAnimationFrame(function(){
        const el=$('struct-w1-tv');
        if(structW1Chart&&el){structW1Chart.applyOptions({width:el.clientWidth||el.parentElement.clientWidth});structW1Chart.timeScale().fitContent();}
      });
    }catch(err){console.warn('struct chart',err);}
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
const MACRO_M1UP_KEY='macro_m1up_hist_v1';
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
  /* FINAL REGIME LOGIC
     6M+1Y = HTF guardrail | 1M+3M = early detector
     Escalation needs persistent deterioration.
     De-escalation needs SUSTAINED recovery that repairs 1M/3M — not a one-month counter-trend rally.
  */
  opts=opts||{};
  const m1DnHist=Array.isArray(opts.m1DnHist)?opts.m1DnHist.slice(-3):[];
  const m1UpHist=Array.isArray(opts.m1UpHist)?opts.m1UpHist.slice(-3):[];
  const y=ev.y1||{}, m6=ev.m6||{}, m3=ev.m3||{}, m1=ev.m1||{};
  const yAvail=!!y.available, m6Avail=!!m6.available, m3Avail=!!m3.available, m1Avail=!!m1.available;
  const closes=Array.isArray(opts.m1Closes)?opts.m1Closes:null;

  let seqLower=0, seqDn=false, offPeak=false, seqDeterioration=false;
  let seqHigher=0, seqUp=false;
  if(closes&&closes.length>=4){
    const n=closes.length;
    for(let i=n-3;i<n;i++){
      if(closes[i]<closes[i-1]*0.998) seqLower++;
      if(closes[i]>closes[i-1]*1.002) seqHigher++;
    }
    seqDn=seqLower>=2;
    seqUp=seqHigher>=2;
    const peak=Math.max.apply(null, closes.slice(-12));
    const last=closes[n-1];
    offPeak=peak>0&&((last-peak)/peak)<=-0.12;
    seqDeterioration=seqDn&&offPeak;
  }

  const yBroken=yAvail&&(y.hardBreak||y.grade==='BROKEN');
  const yIntact=yAvail&&!yBroken&&(y.grade==='INTACT'||y.grade==='IMPROVING'||y.bias==='BULLISH'||(y.hh&&y.hl));
  const m6Broken=m6Avail&&(m6.hardBreak||m6.grade==='BROKEN');
  const m6Intact=m6Avail&&!m6Broken&&(m6.grade==='INTACT'||(m6.hh&&m6.hl)||m6.bias==='BULLISH');
  const m6Soft=m6Avail&&(m6.grade==='WEAKENING'||m6.grade==='DAMAGED'||m6Broken);
  const htfAlive=!m6Broken&&!yBroken;
  const htfStrong=m6Intact&&(yIntact||!yAvail);

  const m1SwingDn=m1Avail&&(m1.bias==='BEARISH'||m1.lh||m1.ll||m1.grade==='DAMAGED'||m1.grade==='BROKEN'||m1.grade==='WEAKENING');
  const m1Damaged=m1Avail&&(m1.grade==='DAMAGED'||m1.grade==='BROKEN'||(m1.lh&&m1.ll)||m1.hardBreak);
  const m1SwingBull=m1Avail&&(m1.bias==='BULLISH'||m1.hl||m1.grade==='INTACT'||m1.grade==='IMPROVING')&&!m1Damaged;
  const m1Dn=m1SwingDn||seqDeterioration;
  // Structural repair: swing no longer LH/LL damaged + not in sequence deterioration
  const m1Repaired=m1SwingBull&&!m1Damaged&&!seqDeterioration;

  const m3Up=m3Avail&&(m3.bias==='BULLISH'||m3.hl||m3.grade==='INTACT'||m3.grade==='IMPROVING');
  const m3Dn=m3Avail&&(m3.bias==='BEARISH'||m3.lh||m3.grade==='DAMAGED'||m3.grade==='WEAKENING'||m3.grade==='BROKEN');
  const m3Mixed=m3Avail&&(m3.grade==='MIXED'||(!m3Up&&!m3Dn));
  const m3Damaged=m3Avail&&(m3.grade==='DAMAGED'||m3.grade==='BROKEN'||(m3.lh&&m3.ll));
  const m3Repaired=m3Up&&!m3Damaged;

  const histDn=m1DnHist.filter(Boolean).length;
  const m1Persist=(histDn+(m1Dn?1:0))>=2 || (seqDn&&offPeak&&histDn>=1);

  // Sustained recovery: 2 of last 3 months constructive (m1Up hist) + current repair
  const histUp=m1UpHist.filter(Boolean).length;
  const m1UpNow=m1Repaired||(seqUp&&!seqDeterioration&&m1SwingBull);
  const recoveryPersist=(histUp+(m1UpNow?1:0))>=2;
  // One strong month alone is a counter-trend rally — NOT enough to exit contraction
  const recoveryProbe=m1UpNow&&m3Repaired; // current snapshot looks better
  const recoverySustained=recoveryPersist&&m3Repaired&&!m1Persist&&!seqDeterioration;
  const recoverySeq=recoverySustained; // used below — sustained only

  const earlyDeterioration=m1Persist&&(m3Mixed||m3Dn||m3Damaged)&&htfAlive;
  const deepDeterioration=m1Persist&&(m3Damaged||m3Dn)&&(m1Damaged||seqDeterioration||offPeak);

  let severeDecline=false;
  if(closes&&closes.length>=13){
    const n=closes.length;
    const dd=closes[n-13]>0?((closes[n-1]-closes[n-13])/closes[n-13]):0;
    if(dd<=-0.40&&seqLower>=2) severeDecline=true;
  }

  const accel=!!ev.parabolic;
  let state='Chop / Unclear';
  let regime='NEUTRAL', phase='CHOP', conf='MEDIUM', cycle='UNRESOLVED';

  // --- Base classification ---
  if((m6Broken||yBroken)&&(m1Dn||m3Dn||deepDeterioration)){
    state='Bear market';
    regime='BEARISH'; phase='BEAR MARKET'; conf='HIGH'; cycle='BROKEN';
  } else if(deepDeterioration||(severeDecline&&m1Persist&&(m3Dn||m3Damaged||m3Mixed))){
    state='Bear pressure';
    regime='BEARISH'; phase='BEAR PRESSURE'; conf='HIGH'; cycle='CONTRACTION';
  } else if(earlyDeterioration){
    state='Caution';
    regime='BEARISH'; phase='CAUTION'; conf='MEDIUM'; cycle='TRANSITION';
  } else if(accel&&m6Intact&&m3Up&&htfAlive&&!seqDeterioration){
    // Parabolic qualifies even if 1M swing still lagging "DAMAGED" after a huge run
    state='Overextended'; regime='BULLISH'; phase='PARABOLIC'; conf='HIGH'; cycle='PARABOLIC';
  } else if(m6Intact&&m3Up&&m1Repaired&&!m1Persist&&htfAlive){
    state='Bull market'; regime='BULLISH'; phase='EXPANSION'; conf='HIGH'; cycle='EXPANSION';
  } else if((recoverySustained||(m6Intact&&m3Up&&seqUp))&&htfAlive&&!seqDeterioration){
    state='Recovering'; regime='BULLISH'; phase='RECOVERY'; conf='HIGH'; cycle='RECOVERY';
  } else if(htfStrong&&!m1Persist){
    if(m1Repaired||m3Up||!seqDn){ state='Bull market'; regime='BULLISH'; phase='EXPANSION'; conf='MEDIUM'; cycle='EXPANSION'; }
    else { state='Chop / Unclear'; regime='NEUTRAL'; phase='CHOP'; conf='MEDIUM'; cycle='TRANSITION'; }
  } else if(m1Repaired&&m3Up&&htfAlive){
    state='Turning up'; regime='BULLISH'; phase='TURNING UP'; conf='MEDIUM'; cycle='TRANSITION';
  }

  // --- Hysteresis / ladder ---
  if(prev){
    const p=String(prev);
    const has=function(){for(let i=0;i<arguments.length;i++){if(p.indexOf(arguments[i])>=0)return true;}return false;};
    const inExp=has('EXPANSION','Bull market','PARABOLIC','Overextended','HOT');
    const inBearBias=has('BEARISH BIAS','Caution','WARN');
    const inContraction=has('CONTRACTION','Bear pressure','PRESS');
    const inBroken=has('CYCLE BROKEN','Bear market')&&!has('Bear pressure'); // full bear only
    const inRec=has('RECOVERY','Recovering')&&!has('ACCUMULATION'); // macro only
    const inBullBias=has('BULLISH BIAS','Turning up','UP');
    const inNeutral=has('NEUTRAL','Chop','Unclear','MIX');

    // Escalation from EXP
    if(inExp){
      if(accel&&m6Intact&&m3Up&&!m1Persist&&!seqDeterioration){
        state='Overextended'; regime='BULLISH'; phase='PARABOLIC'; conf='HIGH'; cycle='PARABOLIC';
      } else if(!m1Persist&&htfStrong&&!m3Damaged){
        state='Bull market'; regime='BULLISH'; phase='EXPANSION'; conf='HIGH'; cycle='EXPANSION';
      }
      if(m1Persist&&(m3Mixed||m3Dn||m3Damaged)&&htfAlive){
        state='Caution'; regime='BEARISH'; phase='CAUTION'; conf='MEDIUM'; cycle='TRANSITION';
      }
      if(deepDeterioration||(severeDecline&&m1Persist)){
        state='Bear pressure'; regime='BEARISH'; phase='BEAR PRESSURE'; conf='HIGH'; cycle='CONTRACTION';
      }
    }

    // BEARISH BIAS
    if(inBearBias){
      if(deepDeterioration||m6Soft||severeDecline||(m1Persist&&(m3Damaged||m3Dn))){
        state='Bear pressure'; regime='BEARISH'; phase='BEAR PRESSURE'; conf='HIGH'; cycle='CONTRACTION';
      } else if(recoverySustained){
        // sustained repair → bullish bias / neutral, not instant EXP
        state='Turning up'; regime='BULLISH'; phase='TURNING UP'; conf='MEDIUM'; cycle='TRANSITION';
      } else if(recoveryProbe&&!m1Persist){
        // one good month: ease to NEUTRAL only, still defensive
        state='Chop / Unclear'; regime='NEUTRAL'; phase='CHOP'; conf='MEDIUM'; cycle='TRANSITION';
      } else if(m1Persist&&(m3Mixed||m3Dn)&&!recoverySustained){
        state='Caution'; regime='BEARISH'; phase='CAUTION'; conf='MEDIUM'; cycle='TRANSITION';
      }
    }

    // CONTRACTION — stepwise de-escalation only
    // Exception: when 6M is clearly INTACT + 3M bullish + multi-month higher closes,
    // 1M swing "DAMAGED" from stale pivots must NOT lock CON for years (2020-21 bug).
    if(inContraction){
      if(m6Broken||yBroken){
        state='Bear market'; regime='BEARISH'; phase='BEAR MARKET'; conf='HIGH'; cycle='BROKEN';
      } else if(m6Intact&&m3Up&&seqUp&&!seqDeterioration&&histUp>=1){
        // HTF-confirmed bull recovery from contraction
        if(accel){
          state='Overextended'; regime='BULLISH'; phase='PARABOLIC'; conf='HIGH'; cycle='PARABOLIC';
        } else if(m6Intact&&m3Up&&(m1Repaired||seqUp)){
          state='Recovering'; regime='BULLISH'; phase='RECOVERY'; conf='HIGH'; cycle='RECOVERY';
        }
      } else if(recoverySustained&&m3Repaired){
        state='Turning up'; regime='BULLISH'; phase='TURNING UP'; conf='MEDIUM'; cycle='TRANSITION';
      } else if(recoveryProbe&&!recoverySustained&&!m6Intact){
        // Counter-trend only when HTF not confirmed intact
        state='Bear pressure'; regime='BEARISH'; phase='BEAR PRESSURE'; conf='MEDIUM'; cycle='CONTRACTION';
      } else if(m6Intact&&m3Up&&!seqDeterioration&&seqHigher>=1){
        state='Turning up'; regime='BULLISH'; phase='TURNING UP'; conf='MEDIUM'; cycle='TRANSITION';
      } else if(!m6Intact&&(m1Dn||m1Persist||m3Dn||m3Damaged)){
        state='Bear pressure'; regime='BEARISH'; phase='BEAR PRESSURE'; conf='MEDIUM'; cycle='CONTRACTION';
      }
    }

    // From BEARISH BIAS after leaving contraction: next step to RECOVERY/EXP needs more persistence
    if(inBullBias||(inBearBias&&recoverySustained)){
      if(recoverySustained&&m6Intact&&m3Repaired&&m1Repaired&&recoveryPersist){
        state='Recovering'; regime='BULLISH'; phase='RECOVERY'; conf='HIGH'; cycle='RECOVERY';
      }
    }

    // RECOVERY → EXPANSION / PARABOLIC
    if(inRec){
      if(m1Persist&&(m3Dn||m3Damaged)&&!m6Intact){
        state='Caution'; regime='BEARISH'; phase='CAUTION'; conf='MEDIUM'; cycle='TRANSITION';
      } else if(accel&&m6Intact&&m3Up){
        state='Overextended'; regime='BULLISH'; phase='PARABOLIC'; conf='HIGH'; cycle='PARABOLIC';
      } else if(m6Intact&&m3Up&&(m1Repaired||seqUp)&&!m1Persist){
        if(accel){ state='Overextended'; regime='BULLISH'; phase='PARABOLIC'; conf='HIGH'; cycle='PARABOLIC'; }
        else { state='Bull market'; regime='BULLISH'; phase='EXPANSION'; conf='HIGH'; cycle='EXPANSION'; }
      } else {
        state='Recovering'; regime='BULLISH'; phase='RECOVERY'; conf='MEDIUM'; cycle='RECOVERY';
      }
    }

    if(inBroken){
      if(m6Broken||yBroken){
        state='Bear market'; regime='BEARISH'; phase='BEAR MARKET'; conf='HIGH'; cycle='BROKEN';
      } else if(recoverySustained){
        state='Turning up'; regime='BULLISH'; phase='TURNING UP'; conf='MEDIUM'; cycle='TRANSITION';
      } else {
        state='Bear pressure'; regime='BEARISH'; phase='BEAR PRESSURE'; conf='HIGH'; cycle='CONTRACTION';
      }
    }

    if(inNeutral&&recoverySustained&&htfAlive){
      state='Turning up'; regime='BULLISH'; phase='TURNING UP'; conf='MEDIUM'; cycle='TRANSITION';
    }

    if(p.indexOf('PARABOLIC')>=0&&m6Intact&&m3Repaired&&m1Repaired&&!m1Persist){
      if(accel){ state='Overextended'; regime='BULLISH'; phase='PARABOLIC'; conf='HIGH'; cycle='PARABOLIC'; }
      else { state='Bull market'; regime='BULLISH'; phase='EXPANSION'; conf='HIGH'; cycle='EXPANSION'; }
    }
  }

  const missing=[];
  if(!m6Avail) missing.push('6M');
  if(!m3Avail) missing.push('3M');
  if(!m1Avail) missing.push('1M');
  if(!yAvail) missing.push('1Y');
  if(missing.indexOf('6M')>=0&&missing.indexOf('3M')>=0) conf='LOW';
  else if(!yAvail) conf=conf==='HIGH'?'MEDIUM':conf;
  if(missing.indexOf('1M')>=0&&missing.indexOf('3M')>=0&&missing.indexOf('6M')>=0){
    state='Chop / Unclear'; regime='NEUTRAL'; phase='INSUFFICIENT DATA'; conf='LOW';
  }

  return {
    state,regime,phase,conf,cycle,missing,
    m1Dn:!!m1Dn,
    m1Up:!!m1UpNow,
    severeDecline:!!severeDecline,
    recoverySustained:!!recoverySustained,
    recoveryProbe:!!recoveryProbe
  };
}

function detectParabolicAccel(m1kl){
  /* Rare multi-month melt-up on COMPLETED candles.
     Two paths (either qualifies):
     A) Relative acceleration: recent 3m >> prior 3m (onset of parabolic)
     B) Absolute strength: extreme 3m gain while near highs (sustained parabolic leg)
     Path B exists so 2020-21 style continued melt-ups still qualify after g0 is already large.
  */
  if(!m1kl||m1kl.length<8) return false;
  const closes=m1kl.map(k=>+k[4]);
  const n=closes.length;
  const r=function(a,b){return b===0?0:(a-b)/Math.abs(b);};
  const g1=r(closes[n-1],closes[n-4]);
  const g0=r(closes[n-4],closes[n-7]);
  const win=closes.slice(-12);
  const mx=Math.max.apply(null,win);
  const nearHigh=closes[n-1]>=mx*0.97;
  let up=0;
  for(let i=n-3;i<n;i++){ if(closes[i]>closes[i-1]) up++; }
  if(up<2||!nearHigh) return false;
  const relativeAccel=g1>0.25&&g1>g0+0.12; // onset
  const absoluteParabolic=g1>0.45; // sustained extreme leg (~45%+ in ~3 months)
  // 6m strength also supports sustained parabolic (covers long 2020-21 runs)
  const g6=r(closes[n-1], closes[Math.max(0,n-7)]);
  const sustainedRun=g6>0.80&&g1>0.20; // >80% in ~6m with still-positive recent 3m
  return !!(relativeAccel||absoluteParabolic||sustainedRun);
}

function explainMacro(r, ev){
  const ph=String(r.phase||''), st=String(r.state||'');
  if(ph==='INSUFFICIENT DATA') return 'Not enough completed macro candles yet. Missing data is not bullish or bearish.';
  if(ph==='PARABOLIC'||st.indexOf('Overextended')>=0) return 'Overextended: rare multi-month melt-up while structure still holds. Not a short-term trade signal by itself.';
  if(ph==='EXPANSION'||st.indexOf('Bull market')>=0) return 'Bull market: broader cycle is advancing. Normal monthly pullbacks usually stay inside this regime.';
  if(ph==='RECOVERY'||st.indexOf('Recovering')>=0) return 'Recovering: structure is repairing after damage. Full bull market not fully confirmed yet.';
  if(ph.indexOf('BULLISH BIAS')>=0||ph==='TURNING UP'||st.indexOf('Turning up')>=0) return 'Turning up: early improvement on faster horizons. Still a transition, not a full bull label.';
  if(ph.indexOf('BEARISH BIAS')>=0||ph==='CAUTION'||st.indexOf('Caution')>=0) return 'Caution: early defensive warning from 1M/3M deterioration. Not a confirmed bear market.';
  if(ph==='CONTRACTION'||ph==='BEAR PRESSURE'||st.indexOf('Bear pressure')>=0) return 'Bear pressure: deeper, persistent weakness. Stronger than Caution; still not automatic full cycle death.';
  if(ph.indexOf('CYCLE BROKEN')>=0||ph==='BEAR MARKET'||st.indexOf('Bear market')>=0) return 'Bear market: higher-timeframe structure has failed on completed candles. Strongest bearish regime.';
  if(ph==='CHOP'||st.indexOf('Chop')>=0) return 'Chop / unclear: mixed evidence; no strong bull or bear regime.';
  return 'Mixed macro evidence; treating regime as unresolved.';
}

function macroGradeBadge(g){
  if(g==='INTACT'||g==='IMPROVING') return {t:'🟢 '+g, c:'#62e3a0'};
  if(g==='BROKEN') return {t:'🔴 '+g, c:'#ff6f7c'};
  if(g==='DAMAGED'||g==='WEAKENING') return {t:'🟠 '+g, c:'#e6a050'};
  if(g==='WARNING') return {t:'🟡 WICK WARNING', c:'#e6c878'};
  return {t:'🟡 '+(g||'MIXED'), c:'#e6c878'};
}


function macroStateStyle(state){
  /* Calendar tiles: HOT BULL REC UP MIX CAUTION PRESS BEAR only */
  const s=String(state||'');
  if(s.indexOf('Overextended')>=0||s.indexOf('PARABOLIC')>=0)
    return {bg:'#0d3d28', fg:'#7dffb5', short:'HOT', band:'#2ee67a'};
  if(s.indexOf('Bull market')>=0||s.indexOf('EXPANSION')>=0)
    return {bg:'#0c2f22', fg:'#62e3a0', short:'BULL', band:'#3bcf86'};
  if(s.indexOf('Recovering')>=0||s.indexOf('RECOVERY')>=0)
    return {bg:'#0a2820', fg:'#4fcf96', short:'REC', band:'#3aa876'};
  if(s.indexOf('Turning up')>=0||s.indexOf('BULLISH BIAS')>=0)
    return {bg:'#0a221c', fg:'#8fd4b0', short:'UP', band:'#6bc49a'};
  if(s.indexOf('Chop')>=0||s.indexOf('Unclear')>=0||s.indexOf('NEUTRAL')>=0||s.indexOf('INSUFFICIENT')>=0)
    return {bg:'#1a1f24', fg:'#9aa3ad', short:'MIX', band:'#6b7280'};
  if(s.indexOf('Caution')>=0||s.indexOf('BEARISH BIAS')>=0)
    return {bg:'#2a181c', fg:'#f0b0b6', short:'CAUTION', band:'#d48a92'};
  if(s.indexOf('Bear pressure')>=0||s.indexOf('CONTRACTION')>=0)
    return {bg:'#2c1014', fg:'#ff6f7c', short:'PRESS', band:'#e23d4c'};
  if(s.indexOf('Bear market')>=0||s.indexOf('CYCLE BROKEN')>=0||(s.indexOf('REGIME')>=0&&s.indexOf('BROKEN')>=0))
    return {bg:'#3a0c12', fg:'#ff4d5e', short:'BEAR', band:'#c41e2e'};
  return {bg:'#1a1f24', fg:'#9aa3ad', short:'—', band:'#6b7280'};
}
function macroTileLabel(r){
  /* Display-only: strong green month inside defensive HTF state = counter-trend bounce */
  const short=(r.style&&r.style.short)||String(r.state||'');
  const mom=r.momPct;
  const defensive=short==='PRESS'||short==='CAUTION'||short==='BEAR';
  if(defensive&&mom!=null&&isFinite(mom)&&mom>15){
    return {label:short+' · bounce', bounce:true};
  }
  return {label:short, bounce:false};
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
  /* Walk completed months from 2018+; no look-ahead. Same engine as live Macro. */
  displayN=displayN||120;
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
  const m1UpHist=[];
  // From 2018 onward (data starts ~2018-05). Light warmup only.
  let startIdx=0;
  for(let i=0;i<completed.length;i++){
    const ym=ymFromTs(completed[i][0]);
    if(ym.y>=2018){ startIdx=Math.max(0, i); break; }
  }
  // need a few bars for swings; if series begins mid-2018, start after 4 months if available
  startIdx=Math.min(startIdx+4, Math.max(0, completed.length-8));
  // but never skip past 2018-01 target — re-anchor to first 2018 month if we overshot
  for(let i=0;i<completed.length;i++){
    const ym=ymFromTs(completed[i][0]);
    if(ym.y>=2018){ startIdx=Math.min(startIdx, Math.max(0,i)); break; }
  }
  if(completed.length-startIdx>displayN) startIdx=completed.length-displayN;
  for(let i=startIdx;i<completed.length;i++){
    const k=completed[i];
    const ym=ymFromTs(k[0]);
    const snap=monthsUpTo(completed, ym.y, ym.m);
    if(snap.length<4) continue;
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
    const result=mapMacroState({y1:sY,m6:s6,m3:s3,m1:s1,parabolic}, prev, {m1DnHist:m1DnHist.slice(), m1UpHist:m1UpHist.slice(), m1Closes});
    m1DnHist.push(!!result.m1Dn);
    if(m1DnHist.length>3) m1DnHist.shift();
    m1UpHist.push(!!result.m1Up);
    if(m1UpHist.length>3) m1UpHist.shift();
    prev=result.state;
    const closePx=+k[4];
    let momPct=null;
    if(i>0){
      const prevClose=+completed[i-1][4];
      if(prevClose>0) momPct=((closePx-prevClose)/prevClose)*100;
    }
    results.push({
      y:ym.y, m:ym.m, key:ym.key,
      label:['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][ym.m-1],
      state:result.state, regime:result.regime, phase:result.phase, conf:result.conf, cycle:result.cycle,
      y1:sY, m6:s6, m3:s3, m1:s1,
      close:closePx,
      momPct:momPct,
      explain:explainMacro(result,{y1:sY,m6:s6,m3:s3,m1:s1}),
      style:macroStateStyle(result.state)
    });
  }
  // keep last displayN
  return results.slice(-displayN);
}

/* ========== TWO-SCORE MACRO (Regime + Risk) — replaces ladder engine display ========== */


/** Post-process monthly Regime scores (Risk untouched).
 * 1 Raw (from data)  2 Rate-limit if Adj_prev < -0.70  3 Tentative label  4 BEAR-exit gate
 */
function applyMacroPostProcess(history){
  const MAX_DELTA=0.15;
  const out=[];
  let prevAdj=null, prev2Adj=null, prevState=null;
  for(let i=0;i<history.length;i++){
    const row=Object.assign({}, history[i]);
    const raw=row.regime_score;
    const risk=row.risk_score;
    if(raw==null||!isFinite(raw)){
      row.raw_regime=null; row.adj_regime=null;
      row.regime_label='INSUFFICIENT';
      row.deep=false; row.gated=false;
      row.risk_label=riskLabelFromScore(risk);
      out.push(row);
      continue;
    }
    // Stage 2: rate-limit
    let adj=raw;
    if(prevAdj!=null && prevAdj < -0.70){
      adj=Math.min(raw, prevAdj + MAX_DELTA);
    }
    row.raw_regime=raw;
    row.adj_regime=adj;
    row.regime_score=adj; // display/history consume Adj only
    // Stage 3: tentative label
    let tentative=regimeLabelFromScore(adj);
    const deep=adj < -0.70;
    row.deep=deep;
    // Stage 4: BEAR-exit gate
    let gated=false;
    if(prevState==='BEARISH' && tentative!=='BEARISH'){
      const rising2=(prevAdj!=null && prev2Adj!=null && adj>prevAdj && prevAdj>prev2Adj);
      if(!(adj > -0.20 && rising2)){
        tentative='BEARISH';
        gated=true;
      }
    }
    row.gated=gated;
    row.regime_label=tentative;
    row.risk_label=riskLabelFromScore(risk);
    out.push(row);
    prev2Adj=prevAdj;
    prevAdj=adj;
    prevState=tentative;
  }
  return out;
}


function regimeLabelFromScore(v){
  if(v==null||!isFinite(v)) return 'INSUFFICIENT';
  if(v>0.20) return 'BULLISH';
  if(v<-0.20) return 'BEARISH';
  return 'NEUTRAL';
}
function riskLabelFromScore(v){
  if(v==null||!isFinite(v)) return 'INSUFFICIENT';
  if(v>=0.70) return 'PARABOLIC';
  if(v>=0.40) return 'EXTENDED';
  return 'NORMAL';
}

function twoScoreStyle(regimeLabel, riskLabel){
  const r=String(regimeLabel||'');
  if(r==='BULLISH') return {bg:'#0c2f22', fg:'#62e3a0', short:'BULL', band:'#3bcf86'};
  if(r==='BEARISH') return {bg:'#2c1014', fg:'#ff6f7c', short:'BEAR', band:'#e23d4c'};
  if(r==='NEUTRAL') return {bg:'#1a1f24', fg:'#9aa3ad', short:'NEU', band:'#6b7280'};
  return {bg:'#1a1f24', fg:'#66717d', short:'—', band:'#6b7280'};
}
function riskFg(riskLabel){
  const k=String(riskLabel||'');
  if(k==='PARABOLIC') return '#ffb84d';
  if(k==='EXTENDED') return '#e6c878';
  if(k==='NORMAL') return '#8491a1';
  return '#66717d';
}
function explainTwoScore(row){
  const R=row.regime_label, K=row.risk_label;
  const rs=row.regime_score, ks=row.risk_score;
  let t='';
  if(R==='BULLISH') t='Regime BULLISH: overall trend constructive (score > +0.20). ';
  else if(R==='BEARISH') t='Regime BEARISH: overall trend defensive (score < −0.20). ';
  else if(R==='NEUTRAL') t='Regime NEUTRAL: no clear trend bias (|score| ≤ 0.20). ';
  else t='Insufficient history for regime. ';
  if(K==='PARABOLIC') t+='Risk PARABOLIC: blow-off / extension risk elevated (≥0.70).';
  else if(K==='EXTENDED') t+='Risk EXTENDED: stretched vs history (0.40–0.69).';
  else if(K==='NORMAL') t+='Risk NORMAL: extension risk low (0–0.39).';
  if(rs!=null&&ks!=null) t+=' Scores: regime '+rs.toFixed(2)+', risk '+ks.toFixed(2)+'.';
  return t;
}
function renderMacroHistory(rows){
  const root=$('mac-history');
  if(!root) return;
  if(!rows||!rows.length){
    root.innerHTML='<div class="mac-hist-empty">No two-score history loaded.</div>';
    return;
  }
  const band=rows.map(r=>{
    const st=twoScoreStyle(r.regime_label, r.risk_label);
    return '<span class="mac-band-cell" style="background:'+st.band+'" title="'+r.month+' '+r.regime_label+' · '+r.risk_label+'"></span>';
  }).join('');
  const byYear={};
  for(const r of rows){
    const y=parseInt(r.month.slice(0,4),10);
    if(!byYear[y]) byYear[y]=[];
    byYear[y].push(r);
  }
  let grid='';
  const mon=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  for(const y of Object.keys(byYear).map(Number).sort((a,b)=>a-b)){
    grid+='<div class="mac-hist-year">'+y+'</div><div class="mac-hist-grid">';
    for(const r of byYear[y]){
      const m=parseInt(r.month.slice(5),10);
      const st=twoScoreStyle(r.regime_label, r.risk_label);
      const raw=r.raw_regime!=null?r.raw_regime:r.regime_score;
      const adj=r.adj_regime!=null?r.adj_regime:r.regime_score;
      const rs=raw==null?'—':(raw>=0?'+':'')+Number(raw).toFixed(2);
      const ks=r.risk_score==null?'—':Number(r.risk_score).toFixed(2);
      const riskL=r.risk_label==='INSUFFICIENT'?'—':(r.risk_label||'—').slice(0,4);
      const isOverrideActive=(raw!=null&&adj!=null&&Math.abs(Number(raw)-Number(adj))>1e-9)||!!r.gated;
      const gateMark=isOverrideActive?'*':'';
      const isProj=!!r.projected;
      const cellCls='mac-hist-cell'+(isProj?' mac-hist-proj':'');
      const projTag=isProj?'<div class="mac-hist-proj-tag">PROJ</div>':'';
      grid+='<button type="button" class="'+cellCls+'" data-key="'+r.month+'" style="background:'+st.bg+';border-color:'+st.band+'33'+(isProj?';opacity:.85;border-style:dashed':'')+'">'
        +'<div class="mac-hist-mon">'+mon[m-1]+'</div>'
        +projTag
        +'<div class="mac-hist-dot" style="color:'+st.fg+'">●</div>'
        +'<div class="mac-hist-short" style="color:'+st.fg+'">'+st.short+gateMark+'</div>'
        +'<div class="mac-hist-risk" style="color:'+riskFg(r.risk_label)+'">'+riskL+'</div>'
        +'<div class="mac-hist-scores">'+rs+' / '+ks+'</div>'
        +'</button>';
    }
    grid+='</div>';
  }
  // streak of current regime label
  const last=rows[rows.length-1];
  let streak=1;
  for(let i=rows.length-2;i>=0;i--){
    if(rows[i].regime_label===last.regime_label) streak++;
    else break;
  }
  const streakLine=(last.regime_label||'—')+' · '+(last.risk_label||'—')+' · '+streak+' mo'
    +(last.regime_score!=null?' · R '+(last.regime_score>=0?'+':'')+last.regime_score.toFixed(2):'')
    +(last.risk_score!=null?' · K '+last.risk_score.toFixed(2):'');

  
  const refBar=
    '<div class="mac-ref-sticky" id="mac-ref-sticky">'
    +'<div class="mac-ref-title">VALUE REFERENCE · always visible while scrolling</div>'
    +'<div class="mac-ref-row"><span class="mac-ref-lab">REGIME</span>'
    +'<span class="mac-ref-chip bull">BULL &gt; +0.20</span>'
    +'<span class="mac-ref-chip neu">NEU ±0.20</span>'
    +'<span class="mac-ref-chip bear">BEAR &lt; −0.20</span></div>'
    +'<div class="mac-ref-row"><span class="mac-ref-lab">RISK</span>'
    +'<span class="mac-ref-chip norm">NORM 0–0.39</span>'
    +'<span class="mac-ref-chip exte">EXTE 0.40–0.69</span>'
    +'<span class="mac-ref-chip para">PARA ≥ 0.70</span></div>'
    +'<div class="mac-ref-hint">Card face = RAW R / K. State uses Adj under the hood. * = rate-limit or BEAR-exit active · tap card for Raw vs Adj.</div>'
    +'</div>';

  root.innerHTML=
    '<div class="mac-hist-head"><div class="mac-hist-title">📊 MACRO HISTORY</div><div class="mac-hist-sub">TWO-SCORE · 2012+ history · dashed PROJ = pattern-only next ~3y</div></div>'
    +refBar
    +'<div class="mac-hist-streak">'+streakLine+'</div>'
    +'<div class="mac-band" aria-hidden="true">'+band+'</div>'
    +grid
    +'<div class="mac-hist-detail" id="mac-hist-detail"><div class="mac-hist-detail-placeholder">Tap a month for scores</div></div>';

  const detail=$('mac-hist-detail');
  const map={};
  for(const r of rows) map[r.month]=r;
  root.querySelectorAll('.mac-hist-cell').forEach(btn=>{
    btn.addEventListener('click',()=>{
      root.querySelectorAll('.mac-hist-cell').forEach(b=>b.classList.remove('on'));
      btn.classList.add('on');
      const r=map[btn.getAttribute('data-key')];
      if(!r||!detail) return;
      const st=twoScoreStyle(r.regime_label, r.risk_label);
      const adj=r.adj_regime!=null?r.adj_regime:r.regime_score;
      const raw=r.raw_regime!=null?r.raw_regime:r.regime_score;
      const rs=adj==null?'—':(adj>=0?'+':'')+Number(adj).toFixed(3);
      const raws=raw==null?'—':(raw>=0?'+':'')+Number(raw).toFixed(3);
      const ks=r.risk_score==null?'—':Number(r.risk_score).toFixed(3);
      let flags=[];
      if(r.deep) flags.push('DEEP');
      if(r.gated) flags.push('BEAR-EXIT BLOCKED');
      const projNote=r.projected?'<div class="mac-det-explain" style="color:#e6c878">PATTERN PROJECTION only — not engine output, not a forecast.</div>':'';
      detail.innerHTML=
        '<div class="mac-det-title">'+r.month+(r.close!=null?' · $'+Math.round(r.close).toLocaleString('en-US'):'')+(r.projected?' · PROJ':'')+'</div>'
        +projNote
        +'<div class="mac-det-state" style="color:'+st.fg+'">'+r.regime_label+' · '+r.risk_label+(flags.length?' · '+flags.join(' · '):'')+'</div>'
        +'<div class="mac-det-rows">'
        +'<div><span>ADJ REGIME</span><b>'+rs+'</b></div>'
        +'<div><span>RAW REGIME</span><b>'+raws+'</b></div>'
        +'<div><span>RISK SCORE</span><b>'+ks+'</b></div>'
        +'</div>'
        +'<div class="mac-det-explain">'+explainTwoScore(r)+'</div>';
    });
  });
}

async function loadMacro(){
  try{
    const url='data/macro-two-score-monthly.json?v=20260906';
    const res=await fetch(url,{cache:'no-store'});
    if(!res.ok) throw new Error('two-score fetch '+res.status);
    const all=await res.json();
    // display history from 2018+ for grid density; keep full in detail
    // chronological post-process on full series (Adj + BEAR-exit gate)
    const sorted=all.slice().sort(function(a,b){return String(a.month).localeCompare(String(b.month));});
    const allN=applyMacroPostProcess(sorted);
    let rows=allN.filter(r=>r.month>='2012-01' && r.adj_regime!=null);
    // Append pattern projection (next ~3y) — not live scores
    try{
      const pr=await fetch('data/macro-pattern-projection.json?v=20260906',{cache:'no-store'});
      if(pr.ok){
        const pj=await pr.json();
        const lastM=rows.length?rows[rows.length-1].month:'';
        for(const p of pj){
          if(lastM && p.month<=lastM) continue;
          rows.push(Object.assign({},p,{projected:true,raw_regime:p.regime_score,adj_regime:p.regime_score}));
        }
      }
    }catch(e){console.warn('projection',e);}
    const latest=allN.filter(r=>r.adj_regime!=null).slice(-1)[0]||rows.filter(r=>!r.projected).slice(-1)[0];
    renderMacroHistory(rows);

    if(latest){
      const st=twoScoreStyle(latest.regime_label, latest.risk_label);
      const combo=latest.regime_label+' · '+latest.risk_label;
      if($('mac-state')){$('mac-state').textContent=combo;$('mac-state').style.color=st.fg;}
      if($('mac-regime'))$('mac-regime').textContent=latest.regime_label+(latest.regime_score!=null?' ('+(latest.regime_score>=0?'+':'')+latest.regime_score.toFixed(2)+')':'');
      if($('mac-phase'))$('mac-phase').textContent=latest.risk_label+(latest.risk_score!=null?' ('+latest.risk_score.toFixed(2)+')':'');
      const la=latest.adj_regime!=null?latest.adj_regime:latest.regime_score;
      if($('mac-conf'))$('mac-conf').textContent=(la!=null?(la>=0?'+':'')+la.toFixed(2):'—')+' / '+(latest.risk_score!=null?latest.risk_score.toFixed(2):'—');
      let exp=explainTwoScore(latest);
      if(latest.gated) exp+=' BEAR-exit gate held prior BEAR (need Adj>-0.20 and 2 rising months).';
      if(latest.deep) exp+=' Deep flag: Adj < −0.70.';
      if(latest.raw_regime!=null && latest.adj_regime!=null && Math.abs(latest.raw_regime-latest.adj_regime)>1e-6)
        exp+=' Raw '+((latest.raw_regime>=0?'+':'')+latest.raw_regime.toFixed(2))+' rate-limited to Adj '+((latest.adj_regime>=0?'+':'')+latest.adj_regime.toFixed(2))+'.';
      if($('mac-explain'))$('mac-explain').textContent=exp;
    }
    // evidence strip: simple legend
    if($('mac-evidence')){
      $('mac-evidence').innerHTML='';
    }
  }catch(e){
    console.warn('loadMacro two-score', e);
    if($('mac-state'))$('mac-state').textContent='DATA UNAVAILABLE';
    if($('mac-explain'))$('mac-explain').textContent='Could not load two-score macro history.';
  }
}



function emaSeries(closes, period){
  const out=new Array(closes.length).fill(null);
  if(closes.length<period) return out;
  let k=2/(period+1), e=0;
  for(let i=0;i<period;i++) e+=closes[i];
  e/=period; out[period-1]=e;
  for(let i=period;i<closes.length;i++){ e=closes[i]*k+e*(1-k); out[i]=e; }
  return out;
}
function rsiSeries(closes, period){
  const out=new Array(closes.length).fill(null);
  if(closes.length<=period) return out;
  let avgG=0, avgL=0;
  for(let i=1;i<=period;i++){
    const d=closes[i]-closes[i-1];
    if(d>=0) avgG+=d; else avgL-=d;
  }
  avgG/=period; avgL/=period;
  out[period]=avgL===0?100:100-(100/(1+avgG/avgL));
  for(let i=period+1;i<closes.length;i++){
    const d=closes[i]-closes[i-1];
    const g=d>0?d:0, l=d<0?-d:0;
    avgG=(avgG*(period-1)+g)/period;
    avgL=(avgL*(period-1)+l)/period;
    out[i]=avgL===0?100:100-(100/(1+avgG/avgL));
  }
  return out;
}
function atrSeries(kl, period){
  const out=new Array(kl.length).fill(null);
  if(kl.length<=period) return out;
  const tr=[];
  for(let i=0;i<kl.length;i++){
    const h=+kl[i][2], l=+kl[i][3], c=+kl[i][4];
    const pc=i?+kl[i-1][4]:c;
    tr.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  let s=0;
  for(let i=0;i<period;i++) s+=tr[i];
  out[period-1]=s/period;
  for(let i=period;i<tr.length;i++){
    out[i]=(out[i-1]*(period-1)+tr[i])/period;
  }
  return out;
}
function smaSeries(arr, period){
  const out=new Array(arr.length).fill(null);
  let s=0;
  for(let i=0;i<arr.length;i++){
    s+=arr[i];
    if(i>=period) s-=arr[i-period];
    if(i>=period-1) out[i]=s/period;
  }
  return out;
}
function macdAt(closes, i){
  if(i<35) return {macd:null, signal:null};
  const e12=emaSeries(closes.slice(0,i+1),12);
  const e26=emaSeries(closes.slice(0,i+1),26);
  const line=[];
  for(let j=0;j<=i;j++){
    if(e12[j]==null||e26[j]==null) line.push(null);
    else line.push(e12[j]-e26[j]);
  }
  const valid=line.map(v=>v==null?0:v);
  // signal EMA9 of macd line — rough on full prefix
  const sig=emaSeries(line.map(v=>v==null?0:v),9);
  return {macd:line[i], signal:sig[i]};
}
function inDateMode(tsMs, mode, isS, isE, oosS, oosE){
  const d=new Date(tsMs);
  const y=d.getUTCFullYear(), m=d.getUTCMonth()+1, day=d.getUTCDate();
  const key=y+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  if(mode==='all') return true;
  if(mode==='is') return key>=isS && key<=isE;
  if(mode==='oos') return key>=oosS && key<=oosE;
  return true;
}
function evaluateSignalBar(kl, i, ema50, ema200, rsi, volSma, atr){
  if(i<30||ema50[i]==null||ema200[i]==null||atr[i]==null) return null;
  const closes=kl.map(k=>+k[4]), highs=kl.map(k=>+k[2]), lows=kl.map(k=>+k[3]), vols=kl.map(k=>+k[5]);
  const longRegime=ema50[i]>ema200[i];
  const shortRegime=ema50[i]<ema200[i];
  // RSI: cross in last 3 bars OR supportive level
  let rsiLong=false, rsiShort=false;
  for(let j=Math.max(1,i-2);j<=i;j++){
    if(rsi[j]==null||rsi[j-1]==null) continue;
    if(rsi[j-1]<40 && rsi[j]>=40) rsiLong=true;
    if(rsi[j-1]>60 && rsi[j]<=60) rsiShort=true;
  }
  if(rsi[i]!=null && rsi[i]>=45 && rsi[i]<=70) rsiLong=true;
  if(rsi[i]!=null && rsi[i]<=55 && rsi[i]>=30) rsiShort=true;
  const m=macdAt(closes, i);
  const macdLong=m.macd!=null&&m.signal!=null&&m.macd>m.signal;
  const macdShort=m.macd!=null&&m.signal!=null&&m.macd<m.signal;
  const volOk=volSma[i]!=null && vols[i]>volSma[i];
  let hi20=-Infinity, lo20=Infinity;
  for(let j=i-20;j<i;j++){ if(j>=0){ hi20=Math.max(hi20,highs[j]); lo20=Math.min(lo20,lows[j]); } }
  const brkLong=closes[i]>hi20;
  const brkShort=closes[i]<lo20;
  const longConds=[rsiLong, macdLong, volOk, brkLong];
  const shortConds=[rsiShort, macdShort, volOk, brkShort];
  const longScore=longConds.filter(Boolean).length;
  const shortScore=shortConds.filter(Boolean).length;
  let side=null, score=0, conds=null;
  if(longRegime && longScore>=3){ side='LONG'; score=longScore; conds={rsi:rsiLong,macd:macdLong,vol:volOk,brk:brkLong}; }
  else if(shortRegime && shortScore>=3){ side='SHORT'; score=shortScore; conds={rsi:rsiShort,macd:macdShort,vol:volOk,brk:brkShort}; }
  return {
    side, score, conds, longRegime, shortRegime,
    longScore, shortScore, longConds, shortConds,
    atr:atr[i], close:closes[i],
    ema50:ema50[i], ema200:ema200[i],
    rsi:rsi[i], time:kl[i][0]
  };
}
function runSignalBacktest(kl, mode, isS, isE, oosS, oosE){
  const closes=kl.map(k=>+k[4]), vols=kl.map(k=>+k[5]);
  const ema50=emaSeries(closes,50), ema200=emaSeries(closes,200);
  const rsi=rsiSeries(closes,14), atr=atrSeries(kl,14), volSma=smaSeries(vols,20);
  let equity=10000, peak=equity, maxDd=0;
  let wins=0, losses=0, trades=0;
  let pos=null;
  const signals=[];
  const closedTrades=[];
  for(let i=200;i<kl.length-1;i++){
    const ts=kl[i][0];
    // Always manage open positions for realism; only open new ones in selected range
    const ev=evaluateSignalBar(kl, i, ema50, ema200, rsi, volSma, atr);
    if(pos){
      const hi=+kl[i][2], lo=+kl[i][3], cl=+kl[i][4];
      let exit=null, reason='';
      const held=i-pos.entryI;
      // regime flip exit (close)
      if(pos.side==='LONG' && ema50[i]!=null && ema200[i]!=null && ema50[i]<ema200[i]){
        exit=cl; reason='REGIME';
      } else if(pos.side==='SHORT' && ema50[i]!=null && ema200[i]!=null && ema50[i]>ema200[i]){
        exit=cl; reason='REGIME';
      } else if(pos.side==='LONG'){
        if(lo<=pos.sl){ exit=pos.sl; reason='SL'; }
        else if(hi>=pos.tp){ exit=pos.tp; reason='TP'; }
        else if(held>=15){ exit=cl; reason='TIME'; }
      } else {
        if(hi>=pos.sl){ exit=pos.sl; reason='SL'; }
        else if(lo<=pos.tp){ exit=pos.tp; reason='TP'; }
        else if(held>=15){ exit=cl; reason='TIME'; }
      }
      if(exit!=null){
        const gross=pos.side==='LONG'?(exit-pos.entry)*pos.qty:(pos.entry-exit)*pos.qty;
        const fees=0.001*(pos.entry*pos.qty+exit*pos.qty);
        const pnl=gross-fees;
        const retPct=(pos.side==='LONG'?(exit-pos.entry)/pos.entry:(pos.entry-exit)/pos.entry)*100;
        const retPctNet=pos.entry*pos.qty>0?(pnl/(pos.entry*pos.qty))*100:retPct;
        equity+=pnl;
        trades++;
        if(pnl>0) wins++; else losses++;
        peak=Math.max(peak,equity);
        maxDd=Math.max(maxDd, peak>0?(peak-equity)/peak:0);
        closedTrades.push({
          side:pos.side, score:pos.score, entry:pos.entry, exit:exit, reason:reason,
          entryTime:pos.entryTime, exitTime:kl[i][0],
          pnl:pnl, retPct:retPct, retPctNet:retPctNet, qty:pos.qty, conds:pos.conds
        });
        pos=null;
      }
    }
    if(!inDateMode(ts, mode, isS, isE, oosS, oosE)) continue;
    if(!ev) continue;
    if(!pos && ev.side){
      const nextOpen=+kl[i+1][1];
      const atrV=ev.atr;
      if(!(atrV>0)) continue;
      const riskPerUnit=1.5*atrV;
      const qty=(equity*0.015)/riskPerUnit;
      if(!(qty>0)) continue;
      const sl=ev.side==='LONG'?nextOpen-riskPerUnit:nextOpen+riskPerUnit;
      const tp=ev.side==='LONG'?nextOpen+3*atrV:nextOpen-3*atrV;
      pos={side:ev.side, entry:nextOpen, sl, tp, qty, entryI:i+1, entryTime:kl[i+1][0], score:ev.score, conds:ev.conds};
      signals.push({
        time:kl[i+1][0], side:ev.side, score:ev.score, entry:nextOpen, sl, tp,
        conds:ev.conds, confirmTime:kl[i][0]
      });
    }
  }
  // mark open trade if any
  if(pos){
    closedTrades.push({
      side:pos.side, score:pos.score, entry:pos.entry, exit:null, reason:'OPEN',
      entryTime:pos.entryTime, exitTime:null,
      pnl:null, retPct:null, retPctNet:null, qty:pos.qty, conds:pos.conds, open:true
    });
  }
  const winRate=trades?wins/trades:0;
  const ret=(equity-10000)/10000;
  return {equity, ret, trades, wins, losses, winRate, maxDd, signals, closedTrades, last:evaluateSignalBar(kl, kl.length-1, ema50, ema200, rsi, volSma, atr)};
}
function destroySigChart(){
  if(sigChart){ try{sigChart.remove();}catch(e){} sigChart=null; sigCandle=sigEma50=sigEma200=null; }
}
function ensureSigChart(){
  const el=$('sig-tv');
  if(!el||typeof LightweightCharts==='undefined') return null;
  if(sigChart) return sigChart;
  sigChart=LightweightCharts.createChart(el,{
    layout:{background:{type:'solid',color:'#080d13'},textColor:'#9aa6b5'},
    grid:{vertLines:{color:'#121820'},horzLines:{color:'#121820'}},
    rightPriceScale:{borderColor:'#1c2430'},
    timeScale:{borderColor:'#1c2430',timeVisible:true},
    crosshair:{mode:1}, width:el.clientWidth, height:el.clientHeight||280
  });
  sigCandle=sigChart.addCandlestickSeries({upColor:'#62e3a0',downColor:'#ff6f7c',borderUpColor:'#62e3a0',borderDownColor:'#ff6f7c',wickUpColor:'#62e3a0',wickDownColor:'#ff6f7c'});
  sigEma50=sigChart.addLineSeries({color:'#6eb6ff',lineWidth:2});
  sigEma200=sigChart.addLineSeries({color:'#e6c878',lineWidth:2});
  return sigChart;
}
function renderSigChart(kl, signals){
  destroySigChart();
  if(!ensureSigChart()) return;
  const slice=kl.slice(-120);
  const closes=kl.map(k=>+k[4]);
  const e50=emaSeries(closes,50), e200=emaSeries(closes,200);
  const start=kl.length-slice.length;
  const candles=slice.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4]}));
  sigCandle.setData(candles);
  const l50=[], l200=[];
  for(let i=start;i<kl.length;i++){
    const t=Math.floor(kl[i][0]/1000);
    if(e50[i]!=null) l50.push({time:t, value:e50[i]});
    if(e200[i]!=null) l200.push({time:t, value:e200[i]});
  }
  sigEma50.setData(l50); sigEma200.setData(l200);
  const markers=[];
  const recent=signals.filter(s=>s.time>=slice[0][0]).slice(-30);
  recent.forEach(s=>{
    markers.push({
      time:Math.floor(s.time/1000),
      position:s.side==='LONG'?'belowBar':'aboveBar',
      color:s.side==='LONG'?'#62e3a0':'#ff6f7c',
      shape:s.side==='LONG'?'arrowUp':'arrowDown',
      text:s.side==='LONG'?'L'+s.score:'S'+s.score
    });
  });
  sigCandle.setMarkers(markers);
  sigChart.timeScale().fitContent();
  if($('sig-chart-cap')) $('sig-chart-cap').textContent='Blue EMA50 · Gold EMA200 · arrows = entries (next-bar open)';
}
async function loadSignal(){
  try{
    const kl=await fetchKlines('1d', 900);
    if(!kl||kl.length<220) throw new Error('need more daily bars');
    const mode=($('sig-mode')&&$('sig-mode').value)||'oos';
    const isS=($('sig-is-start')&&$('sig-is-start').value)||'2020-01-01';
    const isE=($('sig-is-end')&&$('sig-is-end').value)||'2023-12-31';
    const oosS=($('sig-oos-start')&&$('sig-oos-start').value)||'2025-01-01';
    const oosE=($('sig-oos-end')&&$('sig-oos-end').value)||'2026-12-31';
    const bt=runSignalBacktest(kl, mode, isS, isE, oosS, oosE);
    const live=bt.last;
    if(live){
      const regime=live.longRegime?'BULL (EMA50>200)':(live.shortRegime?'BEAR (EMA50<200)':'FLAT');
      if($('sig-regime')) $('sig-regime').textContent=regime;
      const scoreShow=live.longRegime?live.longScore+'/4':(live.shortRegime?live.shortScore+'/4':live.longScore+'/4');
      if($('sig-score')) $('sig-score').textContent=scoreShow;
      let state='NO TRADE', col='#8491a1', exp='Need trend regime + at least 3 of 4 conditions on daily close.';
      if(live.side==='LONG'){ state='LONG SETUP'; col='#62e3a0'; exp='Long regime + score '+live.score+'/4. Entry on next bar open. SL 1.5×ATR TP 3×ATR.'; }
      else if(live.side==='SHORT'){ state='SHORT SETUP'; col='#ff6f7c'; exp='Short regime + score '+live.score+'/4. Entry on next bar open. SL 1.5×ATR TP 3×ATR.'; }
      else {
        state='WAIT';
        exp='Regime '+regime+'. Long score '+live.longScore+'/4 · Short score '+live.shortScore+'/4.';
      }
      if($('sig-state')){ $('sig-state').textContent=state; $('sig-state').style.color=col; }
      if($('sig-explain')) $('sig-explain').textContent=exp;
      const useLong=live.longRegime||(!live.shortRegime);
      const c=useLong?{rsi:live.longConds[0],macd:live.longConds[1],vol:live.longConds[2],brk:live.longConds[3]}
        :{rsi:live.shortConds[0],macd:live.shortConds[1],vol:live.shortConds[2],brk:live.shortConds[3]};
      const labels=useLong?[
        ['Momentum RSI','Cross above 40 (3 bars)',c.rsi],
        ['MACD','Line > Signal',c.macd],
        ['Volume','Vol > 20 SMA',c.vol],
        ['Breakout','Close > 20HH',c.brk]
      ]:[
        ['Momentum RSI','Cross below 60 (3 bars)',c.rsi],
        ['MACD','Line < Signal',c.macd],
        ['Volume','Vol > 20 SMA',c.vol],
        ['Breakout','Close < 20LL',c.brk]
      ];
      if($('sig-conds')){
        $('sig-conds').innerHTML=labels.map(x=>'<div class="sig-cond '+(x[2]?'on':'off')+'"><div class="k">'+x[0]+'</div><div class="v">'+(x[2]?'✓ ':'✗ ')+x[1]+'</div></div>').join('');
      }
      if($('sig-levels') && live.atr){
        const px=live.close, a=live.atr;
        const slL=px-1.5*a, tpL=px+3*a, slS=px+1.5*a, tpS=px-3*a;
        $('sig-levels').innerHTML='Ref close '+money(px)+' · ATR(14) '+a.toFixed(0)
          +'<br>If LONG next open≈: SL ~'+money(slL)+' · TP ~'+money(tpL)
          +'<br>If SHORT next open≈: SL ~'+money(slS)+' · TP ~'+money(tpS)
          +'<br>Size rule: qty = (equity × 1.5%) / (1.5 × ATR)';
      }
    }
    if($('sig-bt')){
      $('sig-bt').innerHTML=
        '<div class="m"><div class="k">TRADES</div><div class="v">'+bt.trades+'</div></div>'
        +'<div class="m"><div class="k">WIN RATE</div><div class="v">'+(bt.winRate*100).toFixed(0)+'%</div></div>'
        +'<div class="m"><div class="k">RETURN</div><div class="v" style="color:'+(bt.ret>=0?'#62e3a0':'#ff6f7c')+'">'+(bt.ret*100).toFixed(1)+'%</div></div>'
        +'<div class="m"><div class="k">MAX DD</div><div class="v">'+(bt.maxDd*100).toFixed(1)+'%</div></div>';
    }
    if($('sig-list')){
      const closed=(bt.closedTrades||[]).filter(t=>!t.open && t.exit!=null);
      const openT=(bt.closedTrades||[]).filter(t=>t.open);
      const rows=closed.slice(-15).reverse();
      const rangeLbl=mode==='is'?(isS+' → '+isE):(mode==='oos'?(oosS+' → '+oosE):'all history');
      let html='<div class="sig-hist-head">SIGNAL HISTORY · last '+rows.length+' closed (of '+closed.length+') · '+rangeLbl+'</div>';
      html+='<div class="sig-hist-note">Exits: SL / TP / REGIME flip / TIME (max 15 bars). One position at a time.</div>';
      html+='<div class="sig-hist-cols"><span>Side</span><span>Entry → Exit</span><span>Return</span></div>';
      if(!rows.length && !openT.length){
        html+='<div class="row">No closed trades in selected date range</div>';
      } else {
        html+=rows.map(t=>{
          const de=new Date(t.entryTime).toISOString().slice(0,10);
          const dx=new Date(t.exitTime).toISOString().slice(0,10);
          const ret=t.retPct;
          const retStr=(ret>=0?'+':'')+ret.toFixed(2)+'%';
          const col=ret>=0?'#62e3a0':'#ff6f7c';
          return '<div class="row sig-hist-row">'
            +'<span class="'+(t.side==='LONG'?'buy':'sell')+'">'+t.side+' '+t.score+'/4 · '+t.reason+'</span>'
            +'<span>'+de+' → '+dx+'<br><span class="sig-hist-px">'+money(t.entry)+' → '+money(t.exit)+'</span></span>'
            +'<span style="color:'+col+';font-weight:900">'+retStr+'</span>'
            +'</div>';
        }).join('');
        if(openT.length){
          const t=openT[0];
          const de=new Date(t.entryTime).toISOString().slice(0,10);
          html+='<div class="row sig-hist-row open"><span class="'+(t.side==='LONG'?'buy':'sell')+'">'+t.side+' '+t.score+'/4 · OPEN</span><span>'+de+' → —<br><span class="sig-hist-px">'+money(t.entry)+'</span></span><span style="color:#e6c878">—</span></div>';
        }
      }
      $('sig-list').innerHTML=html;
    }
    renderSigChart(kl, bt.signals);
    if($('sig-source')) $('sig-source').textContent='LIVE · 1D · mode '+mode.toUpperCase();
  }catch(e){
    console.warn('loadSignal',e);
    if($('sig-source')) $('sig-source').textContent='OFFLINE';
    if($('sig-state')) $('sig-state').textContent='DATA UNAVAILABLE';
    if($('sig-explain')) $('sig-explain').textContent=String(e&&e.message||e);
  }
}
function showSignal(on){
  const panels=$('tf-panels'), trend=$('trend-panel'), sp=$('struct-panel'), mp=$('macro-panel'), sg=$('signal-panel');
  if(on){
    if(panels){panels.classList.add('hidden');panels.style.display='none';}
    if(trend){trend.classList.remove('on');trend.style.display='none';}
    if(sp){sp.classList.remove('on');sp.style.display='none';}
    if(mp){mp.classList.remove('on');mp.style.display='none';}
    if(sg){sg.classList.add('on');sg.style.display='block';}
  } else {
    if(sg){sg.classList.remove('on');sg.style.display='none';}const _mg=$('memegate-panel');if(_mg)_mg.style.display='none';
  }
}


function showMacro(on){
  const panels=$('tf-panels'), trend=$('trend-panel'), sp=$('struct-panel'), mp=$('macro-panel'), sg=$('signal-panel');
  if(on){
    if(panels){panels.classList.add('hidden');panels.style.display='none';}
    if(trend){trend.classList.remove('on');trend.style.display='none';}
    if(sp){sp.classList.remove('on');sp.style.display='none';}
    if(sg){sg.classList.remove('on');sg.style.display='none';}const _mg=$('memegate-panel');if(_mg)_mg.style.display='none';
    if(mp){mp.classList.add('on');mp.style.display='block';}
  } else {
    if(mp){mp.classList.remove('on');mp.style.display='none';}
  }
}


function showStruct(on){
  const panels=$('tf-panels'), trend=$('trend-panel'), sp=$('struct-panel'), mp=$('macro-panel'), sg=$('signal-panel');
  if(on){
    if(panels){panels.classList.add('hidden');panels.style.display='none';}
    if(trend){trend.classList.remove('on');trend.style.display='none';}
    if(mp){mp.classList.remove('on');mp.style.display='none';}
    if(sg){sg.classList.remove('on');sg.style.display='none';}const _mg=$('memegate-panel');if(_mg)_mg.style.display='none';
    if(sp){sp.classList.add('on');sp.style.display='block';}
  } else {
    if(sp){sp.classList.remove('on');sp.style.display='none';}
  }
}


/* ===== MemeGate — downstream permission layer (does not alter BTC engine) =====
Formulas (live, initial params — not claimed optimal):

clamp(x) = max(-1, min(1, x))

HTF Structure (20%):
  sW,sD from swingStructure()
  raw = 0.6*sW + 0.4*sD
  sW/sD map: hardBreakDown=-1; confirmedBreakDown=-0.7; LH+LL=-0.25; HH+HL=+0.85; else 0

BTC Trend (20%):
  1D trendFromCloses: BULLISH=+0.7, BEARISH=-0.7, else 0
  4H vs EMA50/200: both above +0.3, both below -0.3, mixed 0
  trend = clamp(1D + 4H overlay)

4H Momentum (15%) / 1D Momentum (10%):
  MACD line>signal & hist>0 → +0.8
  line<signal & hist<0 → -0.8
  else 0
  +0.2 if fresh hist cross with direction

RSI 4H (10%):
  base = clamp((RSI-50)/25)   // 25→-1, 50→0, 75→+1
  if RSI>78: base -= 0.25*(RSI-78)/12   // modest exhaustion
  if RSI<22: base += 0.15               // washout, not auto ON

Volume 4H (10%):
  r = lastVol / avg(prev 20)
  score = clamp((r-1)/0.8)             // 0.2x→neg, 1.8x→+1
  if price falling (close<open) and r>1.3: score *= -1  // dump volume

CVD (10%):
  lastΔ sign + CVD slope over last 6 bars
  score = clamp( 0.5*sign(Δ) + 0.5*sign(slope) * min(1, |slope|/ref) )

BTC.D (used as dampener, not 5% additive):
  DominanceModifier ∈ [-1,+1]
  BTC↑ & D rising/strong outperform vs ETH → negative (concentration)
  BTC↑ & ETH/BTC rising → positive (risk expand)
  BTC↓ & D rising → strongly negative
  BTC↓ & D/alts falling → 0 (not auto bullish for memes)

FinalMemeScore = clamp( BaseScore * (1 + 0.35 * DominanceModifier) )
  BaseScore = Σ w_i * s_i   (weights below)
  DampingFactor = 0.35 (initial)

Gate: ON >= +0.35 and no veto; OFF <= -0.35 or veto; else WAIT

Veto: 1D hardBreakDown OR (>=3 of trend/4H mom/1D mom/CVD/structure) <= -0.55

Confidence ≠ |score|:
  agreement = 1 - stdev(component scores)/1.2
  completeness = #finite / #components
  distance = min(1, |score-threshold|/0.35)
  conf = 100 * clamp01(0.45*agreement + 0.25*completeness + 0.30*distance)
*/
const MG_W={struct:0.20,trend:0.20,m4:0.15,m1:0.10,rsi:0.10,vol:0.10,cvd:0.10};
const MG_DAMP=0.35, MG_ON=0.35, MG_OFF=-0.35;

function mgClamp(x,a,b){a=a==null?-1:a;b=b==null?1:b;return Math.max(a,Math.min(b,x));}
function mgSign(x){return x>0?1:x<0?-1:0;}
function mgStructScore(s){
  if(!s) return 0;
  if(s.hardBreakDown) return -1;
  if(s.confirmedBreakDown) return -0.7;
  const det=String(s.detail||'');
  if(/HH/.test(det)&&/HL/.test(det)) return 0.85;
  if(/LH/.test(det)&&/LL/.test(det)) return -0.25;
  if(/intact/i.test(det)) return 0.35;
  return 0;
}
function mgMomScore(pack){
  if(!pack||pack.lastMacd==null||pack.lastSig==null||pack.lastHist==null) return 0;
  let s=0;
  if(pack.lastMacd>pack.lastSig&&pack.lastHist>0) s=0.8;
  else if(pack.lastMacd<pack.lastSig&&pack.lastHist<0) s=-0.8;
  const fresh=pack.prevHist!=null&&((pack.prevHist<0&&pack.lastHist>=0)||(pack.prevHist>=0&&pack.lastHist<0));
  if(fresh) s=mgClamp(s+0.2*mgSign(pack.lastHist));
  return s;
}
async function fetchBtcDominance(){
  const out={d:null,btcRet7:null,ethBtcRet7:null,note:'snapshot'};
  try{
    const g=await jget('https://api.coingecko.com/api/v3/global');
    const d=g&&g.data&&g.data.market_cap_percentage&&g.data.market_cap_percentage.btc;
    if(d!=null) out.d=+d;
  }catch(e){}
  try{
    const b=await jget('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false');
    const e=await jget('https://api.coingecko.com/api/v3/coins/ethereum?localization=false&tickers=false&community_data=false&developer_data=false');
    const br=b&&b.market_data&&b.market_data.price_change_percentage_7d_in_currency;
    const er=e&&e.market_data&&e.market_data.price_change_percentage_7d_in_currency;
    if(br&&br.usd!=null) out.btcRet7=+br.usd;
    if(br&&br.usd!=null&&er&&er.usd!=null){
      // ETH/BTC ~ ethUsdRet - btcUsdRet (log approx)
      out.ethBtcRet7=+er.usd-+br.usd;
    }
  }catch(e){}
  return out;
}
function mgDomModifier(dom){
  const btcUp=dom.btcRet7!=null?dom.btcRet7>0:null;
  const ethBtcUp=dom.ethBtcRet7!=null?dom.ethBtcRet7>0:null;
  let m=0, regime='n/a';
  if(btcUp===true&&ethBtcUp===false){m=-0.55;regime='BTC↑ + alts lag (concentration)';}
  else if(btcUp===true&&ethBtcUp===true){m=0.45;regime='BTC↑ + ETH/BTC↑ (risk expand)';}
  else if(btcUp===true){m=0.10;regime='BTC↑ · D context limited';}
  else if(btcUp===false&&ethBtcUp===false){m=-0.35;regime='BTC↓ + ETH/BTC↓ (broad risk-off)';}
  else if(btcUp===false&&ethBtcUp===true){m=-0.15;regime='BTC↓ · not auto-bullish for memes';}
  else {m=0;regime='BTC.D context incomplete';}
  // extreme D level is context only — not a standalone veto
  if(dom.d!=null&&dom.d>=62){m=mgClamp(m-0.15);regime+=' · D elevated';}
  if(dom.d!=null&&dom.d<=45){m=mgClamp(m+0.05);}
  return {mod:mgClamp(m),regime};
}

function showMemeGate(on){
  const panels=$('tf-panels'),trend=$('trend-panel'),sp=$('struct-panel'),mp=$('macro-panel'),sg=$('signal-panel'),mg=$('memegate-panel');
  if(panels){panels.classList.add('hidden');panels.style.display='none';}
  if(trend){trend.classList.remove('on');trend.style.display='none';}
  if(sp){sp.classList.remove('on');sp.style.display='none';}
  if(mp){mp.classList.remove('on');mp.style.display='none';}
  if(sg){sg.classList.remove('on');sg.style.display='none';}const _mg=$('memegate-panel');if(_mg)_mg.style.display='none';
  if(mg){mg.style.display=on?'block':'none';}
}

async function loadMemeGate(){
  const box=$('mg-rows'); if(!box) return;
  try{
    const [kl4,klD,klW,dom]=await Promise.all([
      fetchKlines('4h',120), fetchKlines('1d',220), fetchKlines('1w',120), fetchBtcDominance()
    ]);
    const sD=swingStructure(klD,80,'1D');
    const sW=swingStructure(klW,52,'1W');
    const struct=mgClamp(0.6*mgStructScore(sW)+0.4*mgStructScore(sD));
    const dTrend=trendFromCloses(klD.map(k=>+k[4]));
    const c4=kl4.map(k=>+k[4]);
    const e50=emaArr(c4,50), e200=emaArr(c4,200);
    const last=c4[c4.length-1], a=e50[e50.length-1], b=e200[e200.length-1];
    let t4=0;
    if(a!=null&&b!=null&&last!=null){
      if(last>a&&last>b) t4=0.3; else if(last<a&&last<b) t4=-0.3;
    }
    const t1=dTrend.dir==='BULLISH'?0.7:dTrend.dir==='BEARISH'?-0.7:0;
    const trend=mgClamp(t1+t4);
    const m4=mgMomScore(calcMACDSeries(c4,kl4.map(k=>Math.floor(k[0]/1000))));
    const m1=mgMomScore(calcMACDSeries(klD.map(k=>+k[4]),klD.map(k=>Math.floor(k[0]/1000))));
    const rsi=calcRSI(c4,14);
    let rsiS=0;
    if(rsi!=null){
      rsiS=mgClamp((rsi-50)/25);
      if(rsi>78) rsiS=mgClamp(rsiS-0.25*(rsi-78)/12);
      if(rsi<22) rsiS=mgClamp(rsiS+0.15);
    }
    const vols=kl4.map(k=>+k[5]||0);
    const lastV=vols[vols.length-1];
    const avg=vols.slice(-21,-1).reduce((s,x)=>s+x,0)/Math.max(1,Math.min(20,vols.length-1));
    const vRatio=avg?lastV/avg:1;
    let volS=mgClamp((vRatio-1)/0.8);
    const lastBar=kl4[kl4.length-1];
    if(lastBar&&+lastBar[4]<+lastBar[1]&&vRatio>1.3) volS=mgClamp(-Math.abs(volS));
    const cvd=calcCVD(kl4);
    let cvdS=0;
    if(cvd.length){
      const lastC=cvd[cvd.length-1];
      const prev=cvd.length>5?cvd[cvd.length-6]:cvd[0];
      const slope=lastC.cvd-prev.cvd;
      const ref=Math.max(1, Math.abs(prev.cvd)*0.05+1);
      cvdS=mgClamp(0.5*mgSign(lastC.delta)+0.5*mgSign(slope)*Math.min(1,Math.abs(slope)/ref));
    }
    const base=MG_W.struct*struct+MG_W.trend*trend+MG_W.m4*m4+MG_W.m1*m1+MG_W.rsi*rsiS+MG_W.vol*volS+MG_W.cvd*cvdS;
    const dm=mgDomModifier(dom);
    let finalS=mgClamp(base*(1+MG_DAMP*dm.mod));
    const comps=[struct,trend,m4,m1,rsiS,volS,cvdS];
    const vetoStruct=!!(sD&&sD.hardBreakDown);
    const strongNeg=comps.filter(x=>x<=-0.55).length>=3;
    const veto=vetoStruct||strongNeg;
    let gate='WAIT', klass='wait', label='🟡 BTC MEME GATE: WAIT';
    if(veto||finalS<=MG_OFF){gate='OFF';klass='off';label='🔴 BTC MEME GATE: MEME OFF';}
    else if(finalS>=MG_ON){gate='ON';klass='on';label='🟢 BTC MEME GATE: MEME ON';}
    const mean=comps.reduce((s,x)=>s+x,0)/comps.length;
    const std=Math.sqrt(comps.reduce((s,x)=>s+(x-mean)*(x-mean),0)/comps.length);
    const agree=mgClamp(1-std/1.2,0,1);
    const complete=1;
    const dist=Math.min(1, Math.abs(finalS-(gate==='WAIT'?0:(gate==='ON'?MG_ON:MG_OFF)))/0.35);
    const conf=Math.round(100*mgClamp(0.45*agree+0.25*complete+0.30*dist,0,1));
    const rows=[
      ['1W Structure',mgStructScore(sW),(sW&&sW.detail)||'—'],
      ['1D Structure',mgStructScore(sD),(sD&&sD.detail)||'—'],
      ['HTF Structure (20%)',struct, (sW&&sW.hardBreakDown?'1W broken ':'')+(sD&&sD.hardBreakDown?'1D broken':'blend')],
      ['BTC Trend (20%)',trend,dTrend.dir+(a!=null?(' · 4H vs EMA50/200'):'')],
      ['4H Momentum (15%)',m4,m4>0.2?'improving/positive':m4<-0.2?'deteriorating':'flat'],
      ['1D Momentum (10%)',m1,m1>0.2?'positive':m1<-0.2?'negative':'flat'],
      ['RSI 4H (10%)',rsiS,rsi==null?'n/a':('RSI '+rsi.toFixed(1))],
      ['Volume 4H (10%)',volS,vRatio.toFixed(2)+'× vs avg'],
      ['CVD (10%)',cvdS,cvdS>0?'buy-leaning':cvdS<0?'sell-leaning':'mixed'],
      ['BTC.D modifier',dm.mod,dm.regime+(dom.d!=null?(' · D '+dom.d.toFixed(1)+'%'):'')],
    ];
    box.innerHTML=rows.map(([n,sc,st])=>{
      const col=sc>0.15?'#62e3a0':sc<-0.15?'#ff6f7c':'#e6c878';
      return '<tr><td>'+n+'</td><td class="sc" style="color:'+col+'">'+(sc>=0?'+':'')+sc.toFixed(2)+'</td><td>'+st+'</td></tr>';
    }).join('');
    const g=$('mg-gate'); if(g){g.textContent=label;g.className='gate '+klass;}
    if($('mg-score'))$('mg-score').textContent=(finalS>=0?'+':'')+finalS.toFixed(2);
    if($('mg-conf'))$('mg-conf').textContent=conf+'%';
    if($('mg-dom'))$('mg-dom').textContent=dom.d!=null?(dom.d.toFixed(1)+'%'):'n/a';
    if($('mg-source'))$('mg-source').textContent='LIVE · engine reuse';
    const missing=[];
    if(m4<0.2) missing.push('4H momentum confirmation');
    if(volS<0.1) missing.push('volume confirmation');
    if(cvdS<=0) missing.push('CVD buy pressure');
    if(trend<0.2) missing.push('clear BTC trend');
    if(struct<0.2) missing.push('clean HTF structure');
    if(dm.mod<0) missing.push('friendlier BTC.D / alt-risk backdrop');
    let why='';
    if(gate==='ON') why='BTC HTF structure is not in confirmed breakdown, trend/momentum mix is constructive enough after BTC.D dampening, and no risk veto fired. Conditions permit considering meme risk — not buying a specific coin.';
    else if(gate==='OFF') why=vetoStruct?'Confirmed 1D structural breakdown vetoed meme risk.':(strongNeg?'Multiple major components are simultaneously weak.':'Final score is at or below the OFF threshold after BTC.D context.');
    else why='Score is in the mixed band. Some BTC pieces may be fine, but confirmation is not strong enough to permit new meme exposure.';
    if($('mg-why'))$('mg-why').textContent=why;
    if($('mg-miss'))$('mg-miss').textContent=gate==='ON'?'None required for permission — individual meme setup still required.':(missing.slice(0,4).join(' · ')||'Closer agreement among structure, momentum, and CVD.');
    if($('mg-inv'))$('mg-inv').textContent='Invalidation: 1D hard breakdown, or final score ≤ −0.35, or ≥3 major components ≤ −0.55.';
    if($('mg-act'))$('mg-act').textContent=gate==='ON'?'Meme risk permitted — individual meme confirmation still required.':(gate==='OFF'?'No new meme exposure.':'No new meme entries yet.');
    if($('mg-formulas'))$('mg-formulas').textContent=
      'FORMULAS (initial params)\\n'+
      'BaseScore = 0.20·Struct + 0.20·Trend + 0.15·Mom4H + 0.10·Mom1D + 0.10·RSI + 0.10·Vol + 0.10·CVD\\n'+
      'Final = clamp(Base · (1 + 0.35·DominanceModifier), -1, +1)\\n'+
      'ON if Final≥+0.35 and no veto · WAIT if |Final|<0.35 · OFF if Final≤−0.35 or veto\\n'+
      'Veto: 1D hardBreakDown OR ≥3 components ≤ −0.55\\n'+
      'Confidence ≠ |score| · uses agreement + completeness + distance-to-threshold\\n'+
      'Backtest/ablation/OOS not run in this live layer — verdict: INCONCLUSIVE until tested.';
  }catch(e){
    if($('mg-why'))$('mg-why').textContent='MemeGate load failed: '+(e&&e.message||e);
    if($('mg-source'))$('mg-source').textContent='ERROR';
  }
}


function showTrend(on){const panels=$('tf-panels'),trend=$('trend-panel'),sp=$('struct-panel'),mp=$('macro-panel'),sg=$('signal-panel');if(panels){panels.classList.toggle('hidden',!!on);panels.style.display=on?'none':'';}if(trend){trend.classList.toggle('on',!!on);trend.style.display=on?'block':'none';}if(sp&&on){sp.classList.remove('on');sp.style.display='none';}if(mp&&on){mp.classList.remove('on');mp.style.display='none';}if(sg&&on){sg.classList.remove('on');sg.style.display='none';}}
document.querySelectorAll('#tf-tabs .tab').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('#tf-tabs .tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const tf=btn.getAttribute('data-tf');if(tf==='trend'){showMacro(false);showStruct(false);showSignal(false);showTrend(true);loadTrend();}else if(tf==='struct'){showMacro(false);showTrend(false);showSignal(false);showStruct(true);loadStructural();}else if(tf==='macro'){showTrend(false);showStruct(false);showSignal(false);showMacro(true);loadMacro();}else if(tf==='signal'){showTrend(false);showStruct(false);showMacro(false);showMemeGate(false);showSignal(true);loadSignal();}else if(tf==='memegate'){showTrend(false);showStruct(false);showMacro(false);showSignal(false);showMemeGate(true);loadMemeGate();}else{showMemeGate(false);showMacro(false);showStruct(false);showSignal(false);showTrend(false);currentTF=tf;const panels=$('tf-panels');if(panels){panels.classList.remove('hidden');panels.style.display='';}loadTF(currentTF);}});});
// Signal date controls
['sig-mode','sig-is-start','sig-is-end','sig-oos-start','sig-oos-end'].forEach(id=>{
  const el=$(id); if(el) el.addEventListener('change',()=>{if((document.querySelector('#tf-tabs .tab.active')&&document.querySelector('#tf-tabs .tab.active').getAttribute('data-tf')==='signal')) loadSignal();});
});
window.addEventListener('resize',()=>{if(fibChart){const el=$('fib-tv');if(el)fibChart.applyOptions({width:el.clientWidth});}if(macdChart){const el=$('macd-tv');if(el)macdChart.applyOptions({width:el.clientWidth});}if(structW1Chart){const el=$('struct-w1-tv');if(el)structW1Chart.applyOptions({width:el.clientWidth});}if(sigChart){const el=$('sig-tv');if(el)sigChart.applyOptions({width:el.clientWidth});}});

async function tick(){await loadMarket();
try{
  const q=new URLSearchParams(location.search).get('tab');
  if(q==='memegate'){
    document.querySelectorAll('#tf-tabs .tab').forEach(b=>b.classList.remove('active'));
    const btn=document.querySelector('#tf-tabs .tab[data-tf="memegate"]');
    if(btn) btn.classList.add('active');
    showTrend(false);showStruct(false);showMacro(false);showSignal(false);showMemeGate(true);
    await loadMemeGate(); return;
  }
}catch(e){}
if(currentTF==='trend'){showTrend(true);await loadTrend();}else{showTrend(false);await loadTF(currentTF);}}tick();setInterval(()=>loadMarket(),60000);setInterval(()=>{const act=document.querySelector('#tf-tabs .tab.active');const at=act&&act.getAttribute('data-tf');if(at==='trend')loadTrend();else if(at==='struct')loadStructural();else if(at==='macro')loadMacro();else if(at==='signal')loadSignal();else if(at==='memegate')loadMemeGate();else loadTF(currentTF);},60000);
})();
