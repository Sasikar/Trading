import { connect, launch, type Browser } from "@cloudflare/playwright";
import { DurableObject } from "cloudflare:workers";

interface Env { BROWSER: Fetcher; BROWSER_SESSION: DurableObjectNamespace; DB: D1Database; }
const KOINLY_LOGIN="https://app.koinly.io/login", KOINLY_TRANSACTIONS="https://app.koinly.io/transactions";
const SESSION_KEY="koinly_storage_state", BROWSER_KEY="koinly_browser_session", LOGIN_TOKEN_KEY="koinly_login_token";

export default { async fetch(request:Request,env:Env):Promise<Response>{ try {
 if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors()});
 const u=new URL(request.url); if(u.pathname==="/health") return json({ok:true,service:"trading-koinly-worker"});
 const s=env.BROWSER_SESSION.getByName("koinly-private-session"), t=request.headers.get("x-login-token")||"";
 if(u.pathname==="/login") return s.fetch(new Request(`${u.origin}/session/login`));
 if(u.pathname==="/complete-login") return s.fetch(new Request(`${u.origin}/session/complete-login`,{method:"POST",headers:{"x-login-token":t}}));
 if(u.pathname==="/sync") return s.fetch(new Request(`${u.origin}/session/sync`,{method:"POST",headers:{"x-login-token":t}}));
 if(u.pathname==="/transactions") return s.fetch(new Request(`${u.origin}/session/transactions`,{headers:{"x-login-token":t}}));
 return new Response("Not found",{status:404,headers:cors()});
 }catch(e){return json({status:"worker_error",message:e instanceof Error?e.message:String(e)},500)}} } satisfies ExportedHandler<Env>;

export class BrowserSession extends DurableObject<Env>{ private browser?:Browser;
 async fetch(request:Request):Promise<Response>{try{const p=new URL(request.url).pathname;
  if(p==="/session/login")return await this.startManualLogin(); if(p==="/session/complete-login")return await this.completeManualLogin(request); if(p==="/session/sync")return await this.syncTransactions(request); if(p==="/session/transactions")return await this.getTransactions(request);
  return new Response("Not found",{status:404,headers:cors()});}catch(e){return json({status:"browser_session_error",message:e instanceof Error?e.message:String(e)},500)}}

 private async startManualLogin(){
  const sid=await this.ctx.storage.get<string>(BROWSER_KEY), tok=await this.ctx.storage.get<string>(LOGIN_TOKEN_KEY);
  if(sid&&tok){try{return await this.liveViewExisting(sid,tok)}catch{await this.ctx.storage.delete(BROWSER_KEY);}}
  // If a saved authenticated storage state exists, don't launch another browser merely to log in.
  if(await this.ctx.storage.get<string>(SESSION_KEY)) return json({status:"already_logged_in",login_token:tok,message:"Koinly session is already saved. Tap Sync Latest."});
  const token=tok||crypto.randomUUID();
  try{const {browser,page}=await this.getFreshBrowser(); await page.goto(KOINLY_LOGIN,{waitUntil:"domcontentloaded",timeout:30000});
   const cdp=await page.context().newCDPSession(page), {devtoolsFrontendUrl}=await cdp.send("Cloudflare.getLiveView",{mode:"tab",expiresInMs:3600000});
   await this.ctx.storage.put(BROWSER_KEY,browser.sessionId()); await this.ctx.storage.put(LOGIN_TOKEN_KEY,token); await browser.disconnect(); this.browser=undefined;
   return json({status:"login_required",login_token:token,message:"Sign in to Koinly in Live View, then tap Complete Login.",live_view_url:devtoolsFrontendUrl});
  }catch(e){return json({status:"browser_launch_error",message:e instanceof Error?e.message:String(e)},429)}
 }
 private async liveViewExisting(sid:string,tok:string){this.browser=await connect(this.env.BROWSER,sid);const page=this.browser.contexts()[0]?.pages()[0]??await this.browser.newPage();const cdp=await page.context().newCDPSession(page);const {devtoolsFrontendUrl}=await cdp.send("Cloudflare.getLiveView",{mode:"tab",expiresInMs:3600000});await this.browser.disconnect();this.browser=undefined;return json({status:"login_required",login_token:tok,message:"Existing Koinly browser session found. Finish login, then tap Complete Login.",live_view_url:devtoolsFrontendUrl});}
 private async completeManualLogin(req:Request){if(!(await this.validToken(req)))return json({status:"unauthorized"},401);const sid=await this.ctx.storage.get<string>(BROWSER_KEY);if(!sid){if(await this.ctx.storage.get<string>(SESSION_KEY))return json({status:"logged_in",message:"Koinly session is already saved. Sync Latest is ready."});return json({status:"no_login_session",message:"No pending browser login. Tap Connect Koinly once to start one."},409)}
  try{this.browser=await connect(this.env.BROWSER,sid);const page=this.browser.contexts()[0]?.pages()[0]??await this.browser.newPage();await page.goto(KOINLY_TRANSACTIONS,{waitUntil:"domcontentloaded",timeout:30000});
   if(page.url().includes("/login")){const cdp=await page.context().newCDPSession(page),{devtoolsFrontendUrl}=await cdp.send("Cloudflare.getLiveView",{mode:"tab",expiresInMs:3600000});await this.browser.disconnect();this.browser=undefined;return json({status:"login_required",login_token:await this.ctx.storage.get<string>(LOGIN_TOKEN_KEY),message:"Finish Google login in Live View, then tap Complete Login again.",live_view_url:devtoolsFrontendUrl},401)}
   await this.ctx.storage.put(SESSION_KEY,JSON.stringify(await page.context().storageState()));await this.ctx.storage.delete(BROWSER_KEY);await this.browser.close();this.browser=undefined;return json({status:"logged_in",message:"Koinly session saved. Sync Latest is ready."});
  }catch(e){try{await this.browser?.close()}catch{}this.browser=undefined;return json({status:"login_session_error",message:e instanceof Error?e.message:String(e)},500)}
 }
 private async syncTransactions(req:Request){if(!(await this.validToken(req)))return json({status:"unauthorized"},401);try{const st=await this.ctx.storage.get<string>(SESSION_KEY);if(!st)return json({status:"no_saved_session",message:"Complete Koinly Login first."},409);const {browser,page}=await this.getBrowserWithState(JSON.parse(st));await page.goto(KOINLY_TRANSACTIONS,{waitUntil:"domcontentloaded",timeout:30000});if(page.url().includes("/login")){const cdp=await page.context().newCDPSession(page),{devtoolsFrontendUrl}=await cdp.send("Cloudflare.getLiveView",{mode:"tab",expiresInMs:3600000});await this.ctx.storage.put(BROWSER_KEY,browser.sessionId());await browser.disconnect();this.browser=undefined;return json({status:"login_required",message:"Koinly session expired. Log in again in Live View, then tap Complete Login.",live_view_url:devtoolsFrontendUrl})}const rows=await page.locator("table tbody tr").evaluateAll((els:Element[])=>els.map(el=>({text:(el.textContent||"").replace(/\s+/g," ").trim()})));if(!rows.length){await browser.close();this.browser=undefined;return json({status:"needs_selector_check",message:"Koinly loaded, but no transaction rows were detected."},422)}const at=new Date().toISOString();for(const row of rows){const id=await sha256(row.text);await this.env.DB.prepare("INSERT OR REPLACE INTO koinly_transactions (id,timestamp,raw_json,synced_at) VALUES (?,?,?,?)").bind(id,at,JSON.stringify(row),at).run()}await this.ctx.storage.put(SESSION_KEY,JSON.stringify(await page.context().storageState()));await browser.close();this.browser=undefined;return json({status:"ok",count:rows.length,synced_at:at})}catch(e){try{await this.browser?.close()}catch{}this.browser=undefined;return json({status:"browser_session_error",message:e instanceof Error?e.message:String(e)},500)}}
 private async getTransactions(req:Request){if(!(await this.validToken(req)))return json({status:"unauthorized"},401);const r=await this.env.DB.prepare("SELECT id,timestamp,raw_json,synced_at FROM koinly_transactions ORDER BY timestamp DESC LIMIT 250").all();return json(r.results??[])}
 private async validToken(req:Request){const e=await this.ctx.storage.get<string>(LOGIN_TOKEN_KEY);return !!e&&req.headers.get("x-login-token")===e}
 private async getFreshBrowser(){this.browser=await launch(this.env.BROWSER,{keep_alive:600000});return{browser:this.browser,page:await this.browser.newPage()}}
 private async getBrowserWithState(state:unknown){this.browser=await launch(this.env.BROWSER,{keep_alive:600000});const c=await this.browser.newContext({storageState:state});return{browser:this.browser,page:await c.newPage()}}
}
async function sha256(i:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(i));return[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function cors(){return{"access-control-allow-origin":"*","access-control-allow-headers":"content-type,x-login-token","access-control-allow-methods":"GET,POST,OPTIONS"}}
function json(v:unknown,status=200){return new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json; charset=utf-8",...cors()}})}