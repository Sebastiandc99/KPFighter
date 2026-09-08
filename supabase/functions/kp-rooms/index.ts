// Public room bootstrap with rate limits. Room access uses verified, short-lived Auth JWTs.
// The service key exists only in Supabase's server environment.
const url = Deno.env.get('SUPABASE_URL')!;
const adminKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || Deno.env.get('SUPABASE_ANON_KEY');
const browserKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhaWRhbGFvanJrcGxua3VjbXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4Nzc4NjQsImV4cCI6MjEwNDQ1Mzg2NH0.sfOvTWmVzFDFMDjG24UxK3jJDJc99FispoQE1p00Z8M";
const origin = 'https://sebastiandc99.github.io';
const cors = {'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Cache-Control':'no-store'};
const reply = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers:{...cors,'Content-Type':'application/json'}});
async function api(path:string, method='GET', body?:unknown, token=adminKey) {
 if(!url || !adminKey || !anonKey)throw new Error('KPR-CONFIG');
 const key=token===adminKey?adminKey:anonKey;
 const headers:Record<string,string>={apikey:key,'Content-Type':'application/json',Prefer:'return=representation'};
 if(!token.startsWith('sb_'))headers.Authorization='Bearer '+token;
 const r=await fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json().catch(()=>null);
 if(!r.ok){const step=path.includes('rate_limit')?'LIMIT':path.includes('cleanup')?'CLEANUP':path.includes('/admin/')?'PLAYER':path.includes('/token')?'SESSION':path.includes('/user')?'AUTH':'ROOM';throw new Error('KPR-'+step+'-'+r.status);}
 return data;
}
async function limit(req:Request, action:string) {
 const ip=req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || 'unknown';
 const raw=new TextEncoder().encode(adminKey+ip+new Date().toISOString().slice(0,13));
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
 return await api('/rest/v1/rpc/kp_online_rate_limit','POST',{p_key:action+':'+hash,p_max:action==='bootstrap'?40:150,p_seconds:3600});
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
 if(req.headers.get('origin') && req.headers.get('origin')!==origin)return reply({error:'Origen no permitido.'},403);
 // Public API key authorizes only room bootstrap, never table access or administration.
 if(![anonKey,browserKey].includes(req.headers.get('apikey')||'') && ![anonKey,browserKey].includes((req.headers.get('authorization')||'').replace(/^Bearer /,'')))return reply({error:'Aplicación no autorizada.'},401);
 if(Number(req.headers.get('content-length')||0)>2048)return reply({error:'Solicitud inválida.'},400);
 let createdUser:string|null=null;
 try {
  const text=await req.text();if(text.length>2048)return reply({error:'Solicitud inválida.'},400);
  const body=JSON.parse(text);
  if(body.action==='leave') {
   const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
   const user=await api('/auth/v1/user','GET',undefined,token);
   if(!user?.id)return reply({error:'Sesión inválida.'},401);
   await api('/rest/v1/kp_online_rooms?or=(host_id.eq.'+user.id+',guest_id.eq.'+user.id+')','PATCH',{closed:true});
   return reply({ok:true});
  }
  if(!['create','join'].includes(body.action))return reply({error:'Acción inválida.'},400);
  if(body.version!==1)return reply({error:'Recargá el juego para usar la versión actual.'},409);
  if(!await limit(req,'bootstrap'))return reply({error:'Demasiados intentos. Probá más tarde.'},429);
  const code=String(body.code||'').trim().toUpperCase();
  if(body.action==='join' && !/^KP[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/.test(code))return reply({error:'El código no existe. Revisalo y volvé a intentar.'},404);
  await api('/rest/v1/rpc/kp_online_cleanup','POST',{});
  if(body.action==='join'){
   const rows=await api('/rest/v1/kp_online_rooms?code=eq.'+code+'&closed=eq.false&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=id,guest_id');
   if(!rows.length)return reply({error:'La sala no existe o ya venció.'},404);
   if(rows[0].guest_id)return reply({error:'La sala ya tiene dos jugadores.'},409);
  }
  const password=crypto.randomUUID()+crypto.randomUUID();
  const email=crypto.randomUUID()+'@players.kpfighter.invalid';
  const user=await api('/auth/v1/admin/users','POST',{email,password,email_confirm:true,app_metadata:{kp_ephemeral:true}});
  createdUser=user.id;
  const session=await api('/auth/v1/token?grant_type=password','POST',{email,password},anonKey);
  let room;
  if(body.action==='create') {
   const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
   for(let attempt=0;attempt<5;attempt++){
    const bytes=crypto.getRandomValues(new Uint8Array(4));
    const code='KP'+Array.from(bytes,b=>alphabet[b%alphabet.length]).join('');
    try{room=(await api('/rest/v1/kp_online_rooms','POST',{code,host_id:user.id}))[0];break;}catch(e){if(attempt===4)throw e;}
   }
  } else room=(await api('/rest/v1/rpc/kp_online_join','POST',{p_code:code,p_user:user.id}))[0];
  if(!room){await api('/auth/v1/admin/users/'+user.id,'DELETE');createdUser=null;return reply({error:'La sala ya tiene dos jugadores o dejó de estar disponible.'},409);}
  return reply({id:room.id,code:room.code,role:body.action==='create'?'host':'guest',expires:room.expires_at,token:session.access_token});
 } catch(error) {
  if(createdUser)await api('/auth/v1/admin/users/'+createdUser,'DELETE').catch(()=>{});
  const code=error instanceof Error && /^KPR-[A-Z]+(?:-[0-9]{3})?$/.test(error.message)?error.message:'KPR-CONNECTION';
  return reply({error:'No se pudo conectar con las salas. Volvé a intentar. ('+code+')'},503);
 }
});
