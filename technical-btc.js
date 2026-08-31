(function(){
const $=id=>document.getElementById(id);
function ema(arr,period){const k=2/(period+1);let e=arr[0];const out=[e];for(let i=1;i<arr.length;i++){e=arr[i]*k+e*(1-k);out.push(e)}return out}
function sma(arr,period){const out=[];for(let i=0;i<arr.length;i++){if(i<period-1){out.push(null);continue}let s=0;for(let j=i-period+1;j<=i;j++)s+=arr[j];out.push(s/period)}return out}
function stdev(arr,period){const out=[];for(let i=0;i<arr.length;i++){if(i<period-1){out.push(null);continue}const slice=arr.slice(i-period+1,i+1);const m=slice.reduce((a,b)=>a+b,0)/period;const v=slice.reduce((a,b)=>a+(b-m)*(b-m),0)/period;out.push(Math.sqrt(v))}return out}
function rsi(a){let gains=0,losses=0;for(let i=1;i<a.length;i++){const d=a[i]-a[i-1];if(d>=0)gains+=d;else losses-=d}const n=a.length-1;if(!n)return 50;const ag=gains/n,al=losses/n;if(al===0)return 100;return 100-(100/(1+ag/al))}
function macdCalc(closes){const e12=ema(closes,12),e26=ema(closes,26);const line=closes.map((_,i)=>e12[i]-e26[i]);const sig=ema(line,9);const hist=line.map((v,i)=>v-sig[i]);return{line,sig,hist}}
function stochCalc(highs,lows,closes,kPeriod=14,dPeriod=3){const k=[];for(let i=0;i<closes.length;i++){if(i<kPeriod-1){k.push(null);continue}const hh=Math.max(...highs.slice(i-kPeriod+1,i+1));const ll=Math.min(...lows.slice(i-kPeriod+1,i+1));k.push(hh===ll?50:((closes[i]-ll)/(hh-ll))*100)}const d=sma(k.map(x=>x==null?50:x),dPeriod);return{k,d}}
function atrCalc(highs,lows,closes,period=14){const tr=[];for(let i=0;i<closes.length;i++){if(i===0){tr.push(highs[i]-lows[i]);continue}const a=highs[i]-lows[i],b=Math.abs(highs[i]-closes[i-1]),c=Math.abs(lows[i]-closes[i-1]);tr.push(Math.max(a,b,c))}return sma(tr,period)}
function adxCalc(highs,lows,closes,period=14){const plusDM=[],minusDM=[],tr=[];for(let i=0;i<closes.length;i++){if(i===0){plusDM.push(0);minusDM.push(0);tr.push(highs[i]-lows[i]);continue}const up=highs[i]-highs[i-1],down=lows[i-1]-lows[i];plusDM.push(up>down&&up>0?up:0);minusDM.push(down>up&&down>0?down:0);const a=highs[i]-lows[i],b=Math.abs(highs[i]-closes[i-1]),c=Math.abs(lows[i]-closes[i-1]);tr.push(Math.max(a,b,c))}const atr=sma(tr,period);const pDI=[],mDI=[];for(let i=0;i<tr.length;i++){const sP=plusDM.slice(Math.max(0,i-period+1),i+1).reduce((a,b)=>a+b,0);const sM=minusDM.slice(Math.max(0,i-period+1),i+1).reduce((a,b)=>a+b,0);const a=atr[i]||1;pDI.push(100*sP/(a*period));mDI.push(100*sM/(a*period))}const dx=pDI.map((p,i)=>{const d=p+mDI[i];return d?100*Math.abs(p-mDI[i])/d:0});const adx=sma(dx,period);return{adx,pDI,mDI}}
function badge(el,sig){if(!el)return;el.textContent=sig;el.className='sig-badge '+(sig==='BUY'?'sig-buy':sig==='SELL'?'sig-sell':'sig-hold')}
function rsiSignal(v){if(v<=30)return 'BUY';if(v>=70)return 'SELL';return 'HOLD'}
async function loadTechnical(){try{
const [h1,h4,hd]=await Promise.all([
fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=120',{cache:'no-store'}).then(r=>r.json()),
fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=80',{cache:'no-store'}).then(r=>r.json()),
fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=220',{cache:'no-store'}).then(r=>r.json())
]);
const ohlc=a=>({o:a.map(x=>+x[1]),h:a.map(x=>+x[2]),l:a.map(x=>+x[3]),c:a.map(x=>+x[4]),v:a.map(x=>+x[5])});
const a1=ohlc(h1),a4=ohlc(h4),ad=ohlc(hd);
const r1=rsi(a1.c.slice(-16)),r4=rsi(a4.c.slice(-16)),rd=rsi(ad.c.slice(-16));
$('t-rsi1h').textContent=r1.toFixed(1);badge($('t-rsi1h-b'),rsiSignal(r1));
$('t-rsi4h').textContent=r4.toFixed(1);badge($('t-rsi4h-b'),rsiSignal(r4));
$('t-rsi1d').textContent=rd.toFixed(1);badge($('t-rsi1d-b'),rsiSignal(rd));
const m=macdCalc(a1.c);const ml=m.line[m.line.length-1],ms=m.sig[m.sig.length-1],mh=m.hist[m.hist.length-1],mhPrev=m.hist[m.hist.length-2];
$('t-macd').textContent=(mh>=0?'+':'')+mh.toFixed(1);badge($('t-macd-b'),(mh>0&&mhPrev<=0)||(ml>ms&&mh>0)?'BUY':(mh<0&&mhPrev>=0)||(ml<ms&&mh<0)?'SELL':'HOLD');
const st=stochCalc(a1.h,a1.l,a1.c);const sk=st.k[st.k.length-1],sd=st.d[st.d.length-1];
$('t-stoch').textContent=sk.toFixed(0)+' / '+sd.toFixed(0);badge($('t-stoch-b'),sk<20&&sd<20?'BUY':sk>80&&sd>80?'SELL':'HOLD');
const mid=sma(a1.c,20),sdv=stdev(a1.c,20);const last=a1.c.length-1,price=a1.c[last],bbu=mid[last]+2*sdv[last],bbl=mid[last]-2*sdv[last],bbpct=((price-bbl)/(bbu-bbl))*100;
$('t-bb').textContent=bbpct.toFixed(0)+'%';badge($('t-bb-b'),price<=bbl?'BUY':price>=bbu?'SELL':'HOLD');
const e9=ema(a1.c,9),e21=ema(a1.c,21);const e9n=e9[last],e21n=e21[last],e9p=e9[last-1],e21p=e21[last-1];
$('t-ema').textContent=(e9n>e21n?'Bull':'Bear');badge($('t-ema-b'),e9n>e21n&&e9p<=e21p?'BUY':e9n<e21n&&e9p>=e21p?'SELL':e9n>e21n?'BUY':'SELL');
const s50=sma(ad.c,50),s200=sma(ad.c,200);const i=ad.c.length-1,s50n=s50[i],s200n=s200[i];
$('t-sma').textContent=s50n>s200n?'Golden':'Death';badge($('t-sma-b'),s50n>s200n?'BUY':'SELL');
const ax=adxCalc(a4.h,a4.l,a4.c);const adxv=ax.adx[ax.adx.length-1],pdi=ax.pDI[ax.pDI.length-1],mdi=ax.mDI[ax.mDI.length-1];
$('t-adx').textContent=adxv.toFixed(0);badge($('t-adx-b'),adxv>=25?(pdi>mdi?'BUY':'SELL'):'HOLD');
const atr=atrCalc(a1.h,a1.l,a1.c);const atrv=atr[atr.length-1],atrpct=price?atrv*100/price:0;
$('t-atr').textContent=atrpct.toFixed(2)+'%';badge($('t-atr-b'),atrpct>2.5?'SELL':'HOLD');
const volSma=sma(a1.v,20);const volNow=a1.v[last],volAvg=volSma[last]||1,volRatio=volNow/volAvg;
$('t-vol').textContent=volRatio.toFixed(2)+'x';badge($('t-vol-b'),volRatio>1.5&&a1.c[last]>a1.c[last-1]?'BUY':volRatio>1.5&&a1.c[last]<a1.c[last-1]?'SELL':'HOLD');
let fund=0;try{const fj=await fetch('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',{cache:'no-store'}).then(r=>r.json());fund=+fj.lastFundingRate*100}catch(e){}
$('t-fund').textContent=fund.toFixed(4)+'%';badge($('t-fund-b'),fund>0.05?'SELL':fund<-0.02?'BUY':'HOLD');
const votes={BUY:0,SELL:0,HOLD:0};
for(const id of ['t-rsi1h-b','t-rsi4h-b','t-rsi1d-b','t-macd-b','t-stoch-b','t-bb-b','t-ema-b','t-sma-b','t-adx-b','t-vol-b','t-fund-b']){const el=$(id);if(!el)continue;const t=el.textContent;if(votes[t]!=null)votes[t]++}
const total=votes.BUY+votes.SELL+votes.HOLD||1;const score=Math.round((votes.BUY*100+votes.HOLD*50)/total);
$('cons-score').textContent=score+'/100';$('cons-score').className='cons-score '+(score>=60?'up':score<=40?'down':'neutral');
$('cons-label').textContent=score>=60?'BTC BIAS · BUY':score<=40?'BTC BIAS · SELL':'BTC BIAS · MIXED';
$('cons-sub').textContent=votes.BUY+' buy · '+votes.HOLD+' hold · '+votes.SELL+' sell across 11 signals';
$('tech-source').textContent='BINANCE · LIVE';
}catch(e){if($('tech-source'))$('tech-source').textContent='TECH OFFLINE';console.warn(e)}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{loadTechnical();setInterval(loadTechnical,120000)});
else{loadTechnical();setInterval(loadTechnical,120000)}
})();
