// Deploy behind HTTPS. No token or book content is logged or persisted by this service.
import http from 'node:http';
import crypto from 'node:crypto';

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PUBLIC_URL, ALLOWED_ORIGINS = 'http://tauri.localhost,https://tauri.localhost,tauri://localhost,http://localhost:3000', PORT='8788', HOST='127.0.0.1' } = process.env;
if(!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET||!PUBLIC_URL)throw new Error('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and PUBLIC_URL');
const callback=new URL('callback',PUBLIC_URL.endsWith('/')?PUBLIC_URL:PUBLIC_URL+'/').href;
const sessions=new Map();
const random=()=>crypto.randomBytes(32).toString('base64url');
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const timer=setInterval(()=>{for(const [id,s] of sessions)if(s.expires<Date.now())sessions.delete(id)},60000);timer.unref();
http.createServer(async(req,res)=>{
  try{
    const origin=req.headers.origin;
    if(origin){if(!ALLOWED_ORIGINS.split(',').includes(origin))return json(res,403,{error:'Origin denied'});res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{service:'papery-auth',clientId:GOOGLE_CLIENT_ID,callback});
    if(req.method==='POST'&&url.pathname==='/session'){
      if(!origin)return json(res,403,{error:'Origin required'});
      if(sessions.size>500)return json(res,429,{error:'Try later'});
      let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)return json(res,413,{error:'Too large'});}
      if(JSON.parse(body).clientId!==GOOGLE_CLIENT_ID)return json(res,400,{error:'Client mismatch'});
      const id=random(),secret=random(),verifier=random(),state=random();
      sessions.set(id,{secret,verifier,state,expires:Date.now()+300000});
      const params=new URLSearchParams({client_id:GOOGLE_CLIENT_ID,redirect_uri:callback,response_type:'code',scope:'https://www.googleapis.com/auth/drive.appdata',state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'consent'});
      return json(res,200,{id,secret,authorizeUrl:`https://accounts.google.com/o/oauth2/v2/auth?${params}`});
    }
    if(req.method==='GET'&&url.pathname==='/callback'){
      const state=url.searchParams.get('state');
      if(!state)return json(res,400,{error:'Missing state'});
      const pair=[...sessions.entries()].find(([,s])=>typeof s.state==='string'&&s.state===state);
      if(!pair||pair[1].expires<Date.now())return json(res,400,{error:'Expired state'});
      const [id,session]=pair;session.state=null;
      if(url.searchParams.has('error')){sessions.delete(id);return json(res,400,{error:'Authorization declined'});}
      const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:url.searchParams.get('code')||'',client_id:GOOGLE_CLIENT_ID,client_secret:GOOGLE_CLIENT_SECRET,redirect_uri:callback,grant_type:'authorization_code',code_verifier:session.verifier}),signal:AbortSignal.timeout(15000)});
      if(!response.ok){sessions.delete(id);return json(res,400,{error:'Authorization failed'});}
      const token=await response.json();session.token={access_token:token.access_token,expires_in:token.expires_in};
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});
      return res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Papery 已连接</title><body style="font:18px system-ui;padding:48px;line-height:1.8"><h1>Google 授权已完成</h1><p>请返回 Papery 阅读器继续同步。可以关闭此页面。</p></body>');
    }
    if(req.method==='GET'&&url.pathname.startsWith('/session/')){
      const id=url.pathname.slice(9),session=sessions.get(id);
      const received=Buffer.from(req.headers.authorization||''),expected=Buffer.from(`Bearer ${session?.secret||''}`);
      if(!session||session.expires<Date.now()||received.length!==expected.length||!crypto.timingSafeEqual(received,expected))return json(res,401,{error:'Expired session'});
      if(!session.token)return json(res,202,{pending:true});
      sessions.delete(id);return json(res,200,session.token);
    }
    json(res,404,{error:'Not found'});
  }catch{json(res,500,{error:'Request failed'});}
}).listen(Number(PORT),HOST,()=>console.log(`Papery authorization service listening on ${HOST}:${PORT}`));
