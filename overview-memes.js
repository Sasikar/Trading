(()=>{
  if(document.getElementById('overview-memes')) return;
  const wrap=document.createElement('section');
  wrap.id='overview-memes';
  wrap.innerHTML=`<style>
  #overview-memes{margin:8px 0 24px;padding:18px;border:1px solid #263341;border-radius:18px;background:linear-gradient(145deg,#121b25,#090d13);box-shadow:0 20px 60px #0005}
  #overview-memes .om-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:13px;gap:12px}
  #overview-memes h2{font-size:20px;margin:0}.om-sub{font-size:10px;color:#8491a1;margin-top:5px}.om-src{font-size:8px;color:#62e3a0;letter-spacing:.08em;white-space:nowrap}
  #overview-memes .om-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
  #overview-memes .om-card{background:#080d13;border:1px solid #ffffff0a;border-radius:12px;padding:12px;min-width:0}
  #overview-memes .om-top{display:flex;justify-content:space-between;gap:6px}.om-name{font-size:11px;font-weight:850}.om-rank{font-size:8px;color:#697585}.om-price{font-size:15px;font-weight:900;margin-top:10px}.om-change{font-size:9px;font-weight:850;margin-top:4px}.om-up{color:#62e3a0}.om-down{color:#ff6f7c}.om-muted{color:#8491a1}
  @media(max-width:900px){#overview-memes .om-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:520px){#overview-memes{padding:14px}#overview-memes .om-grid{grid-template-columns:1fr 1fr}.om-price{font-size:14px}}
  </style><div class="om-head"><div><h2>🔥 Top 10 trending meme coins</h2><div class="om-sub">Momentum watchlist · sorted by current 24h move</div></div><span class="om-src" id="om-source">LOADING</span></div><div class="om-grid" id="om-grid"></div>`;
  const anchor=document.querySelector('.market-hero');
  if(anchor) anchor.insertAdjacentElement('afterend',wrap); else document.body.appendChild(wrap);
  const ids=['dogecoin','shiba-inu','pepe','bonk','dogwifcoin','floki','pudgy-penguins','official-trump','book-of-meme','spx6900'];
  const names={dogecoin:'DOGE', 'shiba-inu':'SHIB', pepe:'PEPE', bonk:'BONK', dogwifcoin:'WIF', floki:'FLOKI', 'pudgy-penguins':'PENGU', 'official-trump':'TRUMP', 'book-of-meme':'BOME', spx6900:'SPX6900'};
  const money=n=>n==null?'—':n>=1?n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}):n>=.01?'$'+n.toFixed(4):'$'+n.toFixed(8);
  async function load(){
    const grid=document.getElementById('om-grid');
    try{
      const u='https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids='+ids.join(',')+'&order=market_cap_desc&per_page=10&page=1&sparkline=false&price_change_percentage=24h';
      const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error('API '+r.status);
      const a=await r.json();
      a.sort((x,y)=>(y.price_change_percentage_24h_in_currency||y.price_change_percentage_24h||-999)-(x.price_change_percentage_24h_in_currency||x.price_change_percentage_24h||-999));
      grid.innerHTML=a.slice(0,10).map((c,i)=>{const ch=c.price_change_percentage_24h_in_currency??c.price_change_percentage_24h??0;return `<div class="om-card"><div class="om-top"><span class="om-name">${names[c.id]||c.symbol.toUpperCase()}</span><span class="om-rank">#${i+1}</span></div><div class="om-price">${money(c.current_price)}</div><div class="om-change ${ch>=0?'om-up':'om-down'}">${ch>=0?'+':''}${ch.toFixed(2)}% · 24H</div></div>`}).join('');
      document.getElementById('om-source').textContent='COINGECKO · LIVE';
    }catch(e){document.getElementById('om-source').textContent='LIVE DATA RETRY';grid.innerHTML='<div class="om-muted" style="grid-column:1/-1;padding:12px">Meme coin data is temporarily unavailable. Retry in a moment.</div>'}
  }
  load(); setInterval(load,120000);
})();
