(function(){
const $=id=>document.getElementById(id);
const fmt=(n,d)=>n==null||!isFinite(n)?'—':Number(n).toLocaleString('en-US',{maximumFractionDigits:d!=null?d:(n>=1000?0:2)});
const money=n=>n==null?'—':'$'+fmt(n,n>=1000?0:2);
const TF={'4h':{interval:'4h',label:'4H',limit:100,swing:50,volAvg:20,fibBars:40,macdBars:40,rightOff:8,barSp:5},'1d':{interval:'1d',label:'1D',limit:120,swing:60,volAvg:20,fibBars:40,macdBars:50,rightOff:10,barSp:6},'1w':{interval:'1w',label:'1W',limit:80,swing:26,volAvg:20,fibBars:26,macdBars:40,rightOff:8,barSp:12},'1M':{interval:'1M',label:'1M',limit:48,swing:18,volAvg:12,fibBars:18,macdBars:24,rightOff:6,barSp:14}};
let currentTF='1d',fibChart,fibSeries,fibVol,fibLines=[],macdChart,macdLineS,sigLineS,histS;
async function jget(url){
  try{
    const r=await fetch(url,{cache:'no-store',credentials:'omit'});
    if(!r.ok) return null;
    return await r.json();
  }catch(e){return null;}
}
async function loadMarket(){
  /* Stable path like 1 day ago: Kraken → CoinGecko → worker proxy */
  try{
    let any=false;
    try{
      const j=await jget('https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD');
      if(j&&j.result){
        const b=j.result.XXBTZUSD||j.result.XBTUSD;
        const e=j.result.XETHZUSD||j.result.ETHUSD;
        if(b){
          const last=+b.c[0], open=+b.o, ch=open?((last-open)/open)*100:0;
          $('btc-price').textContent=money(last);
          $('btc-change').innerHTML='<span class="'+(ch>=0?'up':'down')+'">'+(ch>=0?'▲ ':'▼ ')+Math.abs(ch).toFixed(2)+'% · 24h</span>';
          any=true;
        }
        if(e){
          const last=+e.c[0], open=+e.o, ch=open?((last-open)/open)*100:0;
          $('eth-price').textContent=money(last);
          $('eth-change').innerHTML='<span class="'+(ch>=0?'up':'down')+'">'+(ch>=0?'▲ ':'▼ ')+Math.abs(ch).toFixed(2)+'% · 24h</span>';
          any=true;
        }
        if(any&&$('market-source'))$('market-source').textContent='KRAKEN · LIVE';
      }
    }catch(e){}
    if(!any){
      try{
        const d=await jget('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
        if(d&&d.bitcoin){
          $('btc-price').textContent=money(d.bitcoin.usd);
          const ch=d.bitcoin.usd_24h_change||0;
          $('btc-change').innerHTML='<span class="'+(ch>=0?'up':'down')+'">'+(ch>=0?'▲ ':'▼ ')+Math.abs(ch).toFixed(2)+'% · 24h</span>';
          any=true;
        }
        if(d&&d.ethereum){
          $('eth-price').textContent=money(d.ethereum.usd);
          const ch=d.ethereum.usd_24h_change||0;
          $('eth-change').innerHTML='<span class="'+(ch>=0?'up':'down')+'">'+(ch>=0?'▲ ':'▼ ')+Math.abs(ch).toFixed(2)+'% · 24h</span>';
          any=true;
        }
        if(any&&$('market-source'))$('market-source').textContent='COINGECKO · LIVE';
      }catch(e){}
    }
    if(!any){
      const [b,e]=await Promise.all([jget('/api/okx/ticker?instId=BTC-USDT'),jget('/api/okx/ticker?instId=ETH-USDT')]);
      if(b&&b.data&&b.data[0]){
        const t=b.data[0];const open=+t.open24h||+t.last;const ch=open?((+t.last-open)/open)*100:0;
        $('btc-price').textContent=money(+t.last);
        $('btc-change').innerHTML='<span class="'+(ch>=0?'up':'down')+'">'+(ch>=0?'▲ ':'▼ ')+Math.abs(ch).toFixed(2)+'% · 24h</span>';
        any=true;
      }
      if(e&&e.data&&e.data[0]){
        const t=e.data[0];const open=+t.open24h||+t.last;const ch=open?((+t.last-open)/open)*100:0;
        $('eth-price').textContent=money(+t.last);
        $('eth-change').innerHTML='<span class="'+(ch>=0?'up':'down')+'">'+(ch>=0?'▲ ':'▼ ')+Math.abs(ch).toFixed(2)+'% · 24h</span>';
        any=true;
      }
      if(any&&$('market-source'))$('market-source').textContent='PROXY · LIVE';
    }
    try{
      // Static nasdaq.json first (works even if Worker APIs are down), then live /api/yf
      let ndx=await jget('./nasdaq.json?v='+Date.now());
      const live=await jget('/api/yf?symbol=%5EIXIC');
      if(live&&live.price!=null) ndx=live;
      if(ndx&&ndx.price!=null){
        $('ndx-price').textContent=fmt(ndx.price,0);
        const np=ndx.pct!=null?ndx.pct:(ndx.change_pct||0);
        $('ndx-change').innerHTML='<span class="'+(np>=0?'up':'down')+'">'+(np>=0?'▲ ':'▼ ')+Math.abs(Number(np)).toFixed(2)+'% · day</span>';
      } else if($('ndx-price')){
        $('ndx-price').textContent='—';
        if($('ndx-change'))$('ndx-change').textContent='unavailable';
      }
    }catch(e){}
    try{
      let fg=await jget('https://api.alternative.me/fng/?limit=1');
      if(!fg) fg=await jget('/api/fng?limit=1');
      if(fg&&fg.data&&fg.data[0]){
        $('fg-price').textContent=+fg.data[0].value;
        $('fg-change').textContent=fg.data[0].value_classification||'';
      }
    }catch(e){}
    if($('market-source')&&String($('market-source').textContent||'').indexOf('LIVE')<0){
      $('market-source').textContent=any?'LIVE':'OFFLINE';
    }
  }catch(e){if($('market-source'))$('market-source').textContent='OFFLINE';}
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
async function fetchKlines(interval,limit){
  const bar={ '4h':'4H','1d':'1D','1w':'1W','1M':'1M'}[interval]||interval;
  try{
    const iv={ '4h':240,'1d':1440,'1w':10080,'1M':21600,'1h':60 }[interval]||1440;
    const j=await jget('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval='+iv);
    const rows=(j&&j.result&&(j.result.XXBTZUSD||j.result.XBTUSD))||[];
    if(rows.length){
      const slice=rows.slice(-Math.min(limit,rows.length));
      return slice.map(k=>[k[0]*1000,+k[1],+k[2],+k[3],+k[4],+k[6]]);
    }
  }catch(e){}
  const r=await fetch('/api/okx/candles?instId=BTC-USDT&bar='+bar+'&limit='+limit,{cache:'no-store'});
  if(!r.ok)throw new Error('candles '+r.status);
  const j=await r.json();
  return (j.data||[]).slice().reverse().map(k=>[+k[0],+k[1],+k[2],+k[3],+k[4],+k[5]]);
}
async function fetchPrice(){
  try{
    const j=await jget('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
    const b=j&&j.result&&(j.result.XXBTZUSD||j.result.XBTUSD);
    if(b) return +b.c[0];
  }catch(e){}
  try{
    const r=await fetch('/api/okx/ticker?instId=BTC-USDT',{cache:'no-store'});
    if(!r.ok)return null;
    const j=await r.json();
    return j.data&&j.data[0]?+j.data[0].last:null;
  }catch(e){return null;}
}
async function loadTF(tfKey){const cfg=TF[tfKey]||TF['1d'];['tf-name','macd-tf-name','sr-tf-name'].forEach(id=>{if($(id))$(id).textContent=cfg.label;});try{const [kl,spot]=await Promise.all([fetchKlines(cfg.interval,cfg.limit),fetchPrice()]);if(!kl||!kl.length||spot==null)throw new Error('nodata');const swing=kl.slice(-cfg.swing);let hi=-Infinity,lo=Infinity;for(const k of swing){hi=Math.max(hi,+k[2]);lo=Math.min(lo,+k[3]);}const range=hi-lo||1;const levels=FIB.map(({r,label})=>({key:label,price:lo+range*r,kind:(r===0.382||r===0.5||r===0.618)?'fib-key':'fib',r})).sort((a,b)=>b.price-a.price);$('fib-spot').textContent=money(spot);$('fib-meta').textContent='BTC · '+cfg.label;let nearest=levels[0],nd=Math.abs(spot-levels[0].price);levels.forEach(l=>{const d=Math.abs(spot-l.price);if(d<nd){nd=d;nearest=l;}});$('fib-bias').textContent='Near '+nearest.key;renderLadder(spot,levels,'fib-ladder');destroyFib();ensureFib();const slice=kl.slice(-cfg.fibBars);const candles=slice.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4]}));fibSeries.setData(candles);fibVol.setData(slice.map(k=>({time:Math.floor(k[0]/1000),value:+k[5],color:(+k[4]>=+k[1])?'rgba(98,227,160,.35)':'rgba(255,111,124,.35)'})));levels.forEach(l=>{const k=l.kind==='fib-key';fibLines.push(fibSeries.createPriceLine({price:l.price,color:k?'#e6c878':'#6eb6ff',lineWidth:k?2:1,lineStyle:k?0:2,axisLabelVisible:true,title:l.key}));});const pad=range*0.06;fibSeries.applyOptions({autoscaleInfoProvider:()=>({priceRange:{minValue:lo-pad,maxValue:hi+pad}})});const n=candles.length;fibChart.timeScale().applyOptions({rightOffset:cfg.rightOff,barSpacing:cfg.barSp,fixLeftEdge:false,fixRightEdge:false});fibChart.timeScale().setVisibleLogicalRange({from:Math.max(-0.5,n-35),to:n-1+cfg.rightOff});$('fib-source').textContent='OKX · '+cfg.label;const closes=kl.map(k=>+k[4]),times=kl.map(k=>Math.floor(k[0]/1000)),vols=kl.map(k=>+k[5]);const pack=calcMACDSeries(closes,times);destroyMacd();ensureMacd();const ms=Math.min(pack.hist.length,cfg.macdBars);histS.setData(pack.hist.slice(-ms));macdLineS.setData(pack.ml.slice(-ms));sigLineS.setData(pack.sl.slice(-ms));const h=pack.lastHist,m=pack.lastMacd,s=pack.lastSig;const f=v=>(v==null?'—':((v>=0?'+':'')+v.toFixed(0)));$('macd-note').textContent='HIST '+f(h)+' · LINE '+f(m)+' · SIG '+f(s);$('macd-source').textContent='OKX · '+cfg.label;const rsi=calcRSI(closes,14);if(rsi!=null){$('rsi-val').textContent=rsi.toFixed(1);$('rsi-sub').textContent=rsi>=70?'OB':rsi<=30?'OS':'Mid';$('rsi-tag').textContent=rsi>=70?'OVERBOUGHT':rsi<=30?'OVERSOLD':'NEUTRAL';$('rsi-tag').className='tag '+(rsi>=70?'tag-bear':rsi<=30?'tag-bull':'tag-neut');}const lastV=vols[vols.length-1],avgN=Math.min(cfg.volAvg,vols.length-1),avg=vols.slice(-(avgN+1),-1).reduce((a,b)=>a+b,0)/Math.max(1,avgN),vRatio=avg?lastV/avg:1;$('vol-val').textContent=vRatio.toFixed(2)+'×';$('vol-sub').textContent='vs avg';$('vol-tag').textContent=vRatio>=1.4?'HIGH':vRatio<=0.7?'THIN':'OK';$('vol-tag').className='tag '+(vRatio>=1.4?'tag-bull':vRatio<=0.7?'tag-bear':'tag-neut');if(kl.length>=2){const prev=kl[kl.length-2];const piv=pivots(+prev[2],+prev[3],+prev[4]);renderLadder(spot,[{key:'R3',price:piv.R3,kind:'r'},{key:'R2',price:piv.R2,kind:'r'},{key:'R1',price:piv.R1,kind:'r'},{key:'P',price:piv.P,kind:'p'},{key:'S1',price:piv.S1,kind:'s'},{key:'S2',price:piv.S2,kind:'s'},{key:'S3',price:piv.S3,kind:'s'}],'sr-ladder');$('sr-spot').textContent=money(spot);$('sr-meta').textContent='BTC · '+cfg.label;$('sr-bias').textContent=spot>piv.P?'ABOVE P':'BELOW P';$('sr-source').textContent='OKX · '+cfg.label;}}catch(e){console.warn(e);$('fib-source').textContent='OFFLINE';}}
function emaArr(closes,n){const o=[],k=2/(n+1);let prev=null;for(let i=0;i<closes.length;i++){if(prev==null){if(i<n-1){o.push(null);continue;}let s=0;for(let j=i-n+1;j<=i;j++)s+=closes[j];prev=s/n;o.push(prev);continue;}prev=closes[i]*k+prev*(1-k);o.push(prev);}return o;}
function trendFromCloses(closes){if(closes.length<200)return{dir:'NEUTRAL',detail:'need 200'};const e50=emaArr(closes,50),e200=emaArr(closes,200);const c=closes[closes.length-1],a=e50[e50.length-1],b=e200[e200.length-1];if(a==null||b==null)return{dir:'NEUTRAL',detail:'EMA'};let dir='NEUTRAL';if(c>a&&c>b)dir='BULLISH';else if(c<a&&c<b)dir='BEARISH';const f=x=>Math.round(x).toLocaleString('en-US');return{dir,detail:'C '+f(c)+' · 50 '+f(a)+' · 200 '+f(b)};}
function colorDir(dir){return dir==='BULLISH'?'#62e3a0':dir==='BEARISH'?'#ff6f7c':'#e6c878';}
function macdMomentum(closes,times){const pack=calcMACDSeries(closes,times);const h=pack.lastHist,m=pack.lastMacd,s=pack.lastSig,ph=pack.prevHist;let dir='FADING';if(m!=null&&s!=null&&h!=null){if(m>s&&h>0)dir='BULLISH';else if(m<s&&h<0)dir='BEARISH';}const fresh=ph!=null&&h!=null&&((ph<0&&h>=0)||(ph>=0&&h<0));const f=v=>(v==null?'—':((v>=0?'+':'')+Number(v).toFixed(0)));return{dir,label:dir+(fresh?' (fresh cross)':''),detail:'HIST '+f(h)+' · LINE '+f(m)+' · SIG '+f(s)};}
async function loadMarketStructure(direction,klDaily){const statusEl=$('ms-status'),subEl=$('ms-sub');const set=(id,v,h)=>{if($(id))$(id).textContent=v;if(h&&$(id+'-h'))$(id+'-h').textContent=h;};try{const rows=Array.isArray(klDaily)&&klDaily.length>16?klDaily.slice(0,-1):[];if(rows.length>=15){const trs=[];for(let i=1;i<rows.length;i++){const h=+rows[i][2],l=+rows[i][3],pc=+rows[i-1][4];trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));}const atr=trs.slice(-14).reduce((a,b)=>a+b,0)/14;const mark=+rows[rows.length-1][4];const bull=direction==='BULLISH';const inv=bull?mark-1.5*atr:mark+1.5*atr;const pct=Math.abs(inv-mark)/mark*100;set('ms-atr',money(inv)+' · '+pct.toFixed(1)+'%',(bull?'below':'above')+' mark');}else set('ms-atr','Data Unavailable');}catch(e){set('ms-atr','Data Unavailable');}set('ms-liq','Data Unavailable','no estimated levels');let book=null,fetchedAt=null;try{const res=await fetch('/api/orderbook?instId=BTC-USDT&sz=50',{cache:'no-store'});if(res.ok){book=await res.json();fetchedAt=Date.now();}}catch(e){}if(!book||!book.bids||!book.asks||!book.bids.length){statusEl.className='struct-status unav';statusEl.textContent='⚪ Unavailable';subEl.textContent='Orderbook missing.';set('ms-spread','Data Unavailable');set('ms-bid','Data Unavailable');set('ms-conc','Data Unavailable');set('ms-fresh','Data Unavailable');return;}const ageMs=Date.now()-(book.ts?+book.ts:fetchedAt);if(ageMs>5000){statusEl.className='struct-status unav';statusEl.textContent='⚪ Unavailable';subEl.textContent='Book stale >5s.';set('ms-fresh',(ageMs/1000).toFixed(1)+'s','stale');set('ms-spread','Data Unavailable');set('ms-bid','Data Unavailable');set('ms-conc','Data Unavailable');return;}set('ms-fresh',(ageMs/1000).toFixed(2)+'s','ok');const bestBid=+book.bids[0][0],bestAsk=+book.asks[0][0],mid=(bestBid+bestAsk)/2,spreadBps=((bestAsk-bestBid)/mid)*10000;const key='ms_spread_samples_v1';let samples=[];try{samples=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){}samples.push({t:Date.now(),bps:spreadBps});while(samples.length>40)samples.shift();try{localStorage.setItem(key,JSON.stringify(samples));}catch(e){}const nums=samples.map(x=>x.bps).filter(x=>isFinite(x)).sort((a,b)=>a-b);const med=nums.length>=5?nums[Math.floor(nums.length/2)]:null;const wide=med!=null?spreadBps>3*med:spreadBps>5;set('ms-spread',spreadBps.toFixed(2)+' bps',(wide?'Wide':'Normal')+(med!=null?' vs med '+med.toFixed(2):''));let bid2=0,ask2=0,bid05=0,ask05=0;for(const [p,sz] of book.bids){const price=+p,n=price*+sz,pct=(mid-price)/mid*100;if(pct<=2)bid2+=n;if(pct<=0.5)bid05+=n;}for(const [p,sz] of book.asks){const price=+p,n=price*+sz,pct=(price-mid)/mid*100;if(pct<=2)ask2+=n;if(pct<=0.5)ask05+=n;}const total2=bid2+ask2,bull=direction==='BULLISH',side=total2>0?((bull?bid2:ask2)/total2)*100:null;if(side==null)set('ms-bid','Data Unavailable');else set('ms-bid',side.toFixed(1)+'%',(bull?'Bid':'Ask')+(side<40?' · thin':''));const conc=total2>0?((bid05+ask05)/total2)*100:null;if(conc==null)set('ms-conc','Data Unavailable');else set('ms-conc',conc.toFixed(1)+'%','not support guarantee');const warnings=[];if(wide)warnings.push('wide spread');if(side!=null&&side<40)warnings.push(bull?'thin bid':'thin ask');let status='Protected',cls='prot',icon='🟢';if(warnings.length>=2||(side!=null&&side<40&&wide)){status='Vulnerable';cls='vuln';icon='🔴';}else if(warnings.length===1){status='Caution';cls='caut';icon='🟡';}statusEl.className='struct-status '+cls;statusEl.textContent=icon+' '+status;subEl.textContent=(warnings.length?'Warnings: '+warnings.join(', ')+'. ':'No book warnings. ')+'Observable only.';}
async function loadTrend(){try{const [klD,klW,kl4]=await Promise.all([fetchKlines('1d',220),fetchKlines('1w',220),fetchKlines('4h',120)]);const dT=trendFromCloses(klD.map(k=>+k[4])),wT=trendFromCloses(klW.map(k=>+k[4]));$('tr-1d').textContent=dT.dir;$('tr-1d').style.color=colorDir(dT.dir);$('tr-1w').textContent=wT.dir;$('tr-1w').style.color=colorDir(wT.dir);$('tr-1d-det').textContent=dT.detail;$('tr-1w-det').textContent=wT.detail;const dMom=macdMomentum(klD.map(k=>+k[4]),klD.map(k=>Math.floor(k[0]/1000)));const wMom=macdMomentum(klW.map(k=>+k[4]),klW.map(k=>Math.floor(k[0]/1000)));if($('tr-1d-mom')){$('tr-1d-mom').textContent=dMom.label;$('tr-1d-mom').style.color=colorDir(dMom.dir==='FADING'?'NEUTRAL':dMom.dir);}if($('tr-1w-mom')){$('tr-1w-mom').textContent=wMom.label;$('tr-1w-mom').style.color=colorDir(wMom.dir==='FADING'?'NEUTRAL':wMom.dir);}if($('tr-1d-macd'))$('tr-1d-macd').textContent=dMom.detail;if($('tr-1w-macd'))$('tr-1w-macd').textContent=wMom.detail;const closes=kl4.map(k=>+k[4]),times=kl4.map(k=>Math.floor(k[0]/1000)),vols=kl4.map(k=>+k[5]);const pack=calcMACDSeries(closes,times);const h=pack.lastHist,m=pack.lastMacd,s=pack.lastSig,ph=pack.prevHist;let macdDir='NONE';if(ph!=null&&ph<0&&h>=0)macdDir='BULLISH';else if(ph!=null&&ph>=0&&h<0)macdDir='BEARISH';else if(h>0)macdDir='BULLISH';else if(h<0)macdDir='BEARISH';const rsi=calcRSI(closes,14);const lastV=vols[vols.length-1];const avg=vols.slice(-31,-1).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(30,vols.length-1));const vRatio=avg?lastV/avg:1;$('tr-4h').textContent=macdDir==='NONE'?'NO CROSS':macdDir;$('tr-4h').style.color=colorDir(macdDir==='NONE'?'NEUTRAL':macdDir);if($('tr-4h-vol')){$('tr-4h-vol').textContent=vRatio.toFixed(2)+'×';}$('tr-macd-det').textContent='HIST '+(h==null?'—':((h>=0?'+':'')+h.toFixed(0)));$('tr-rsi-det').textContent='RSI '+(rsi!=null?rsi.toFixed(1):'—')+' · Vol '+vRatio.toFixed(2)+'×';let score='NO SIGNAL — WAIT',scoreColor='#8491a1',sub='Wait for clearer 4H bias.';const bull4=macdDir==='BULLISH',bear4=macdDir==='BEARISH';const dBullE=dT.dir==='BULLISH',wBullE=wT.dir==='BULLISH',dBearE=dT.dir==='BEARISH',wBearE=wT.dir==='BEARISH';const dBullM=dMom.dir==='BULLISH',wBullM=wMom.dir==='BULLISH';if(bull4){if(dBullE&&wBullE&&dBullM&&wBullM){score='STRONG CONFIRMATION';scoreColor='#62e3a0';sub='Full alignment.';}else if(dBullE&&wBullE){score='MODERATE CONFIRMATION';scoreColor='#e6c878';const soft=[];if(!dBullM)soft.push('1D MACD '+dMom.dir.toLowerCase());if(!wBullM)soft.push('1W MACD '+wMom.dir.toLowerCase());sub='HTF EMAs bullish, but '+(soft.join(' + ')||'MACD soft')+'.';}else if(dBearE||wBearE){score='WEAK — COUNTER-TREND BOUNCE';scoreColor='#ff6f7c';sub='Against HTF EMA.';}else{score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub='HTF mixed.';}}else if(bear4){if(dBearE&&wBearE){score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub='Bearish HTF.';}else if(dBullE||wBullE){score='WEAK — COUNTER-TREND BOUNCE';scoreColor='#62e3a0';sub='Against HTF EMA.';}else{score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub='Mixed.';}}if(vRatio<0.3&&score.indexOf('STRONG')===0){score='MODERATE CONFIRMATION';scoreColor='#e6c878';sub+=' · thin volume.';}$('tr-score').textContent=score;$('tr-score').style.color=scoreColor;$('tr-score-sub').textContent=sub;if($('st-score')){$('st-score').textContent='Stretch Score';$('st-label').textContent='See Trend + Structure cards';}let stretchDir='NEUTRAL';if(dT.dir==='BULLISH'&&wT.dir==='BULLISH')stretchDir='BULLISH';else if(dT.dir==='BEARISH'&&wT.dir==='BEARISH')stretchDir='BEARISH';else if(dT.dir==='BULLISH'||wT.dir==='BULLISH')stretchDir='BULLISH';else if(dT.dir==='BEARISH'||wT.dir==='BEARISH')stretchDir='BEARISH';await loadMarketStructure(stretchDir,klD);$('trend-source').textContent='OKX · 1D · 1W · 4H';}catch(e){console.warn(e);if($('trend-source'))$('trend-source').textContent='OFFLINE';}}
function showTrend(on){const panels=$('tf-panels'),trend=$('trend-panel');if(panels){panels.classList.toggle('hidden',!!on);panels.style.display=on?'none':'';}if(trend){trend.classList.toggle('on',!!on);trend.style.display=on?'block':'none';}}
document.querySelectorAll('#tf-tabs .tab').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('#tf-tabs .tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const tf=btn.getAttribute('data-tf');if(tf==='trend'){showTrend(true);loadTrend();}else{showTrend(false);currentTF=tf;loadTF(currentTF);}});});
window.addEventListener('resize',()=>{if(fibChart){const el=$('fib-tv');if(el)fibChart.applyOptions({width:el.clientWidth});}if(macdChart){const el=$('macd-tv');if(el)macdChart.applyOptions({width:el.clientWidth});}});
async function tick(){await loadMarket();await loadTF(currentTF);}tick();setInterval(()=>loadMarket(),60000);setInterval(()=>{if(document.querySelector('#tf-tabs .tab.active[data-tf="trend"]'))loadTrend();else loadTF(currentTF);},60000);
})();
