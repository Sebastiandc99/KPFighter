const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/kp-rooms/index.ts'),'utf8'));
function server(modern=true,override){
 const calls=[];let handler;
 const publicKey=modern?'sb_publishable_test':'anon-jwt',secret=modern?'sb_secret_test':'service-jwt';
 const env={SUPABASE_URL:'https://example.supabase.co',...(modern?{SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:publicKey}),SUPABASE_SECRET_KEYS:JSON.stringify({default:secret})}:{SUPABASE_ANON_KEY:publicKey,SUPABASE_SERVICE_ROLE_KEY:secret})};
 vm.runInNewContext(source,{Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn},Request,Response,TextEncoder,crypto,
 fetch:async(url,options)=>{calls.push({url,...options});const custom=override?.(url,options);if(custom)return custom;
 const data=url.includes('rate_limit')?true:url.includes('cleanup')?null:url.includes('/admin/users')?{id:'player'}:url.includes('/token')?{access_token:'session-jwt'}:url.endsWith('/auth/v1/user')?{id:'player'}:[{id:'room',code:'KPTEST',expires_at:'2099-01-01'}];
 return Response.json(data);}});
 return {calls,publicKey,secret,request:(body,token)=>handler(new Request('https://example.supabase.co/functions/v1/kp-rooms',{method:'POST',headers:{apikey:publicKey,origin:'https://sebastiandc99.github.io',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)})),handler};
}
for(const modern of [true,false])test('room service uses correct server headers with '+(modern?'modern':'legacy')+' keys',async()=>{
 const s=server(modern);const response=await s.request({action:'create',version:1});assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.role,'host');assert.equal(data.token,'session-jwt');assert.ok(!JSON.stringify(data).includes(s.secret));
 const admin=s.calls.find(c=>c.url.includes('/admin/users'));assert.equal(admin.headers.apikey,s.secret);
 assert.equal(admin.headers.Authorization,modern?undefined:'Bearer '+s.secret);
 const auth=s.calls.find(c=>c.url.includes('/token'));assert.equal(auth.headers.apikey,s.publicKey);
 assert.equal(auth.headers.Authorization,modern?undefined:'Bearer '+s.publicKey);
});
test('room bootstrap rejects invalid keys and origins without privileged work',async()=>{
 const s=server();for(const headers of [{apikey:'bad'},{apikey:s.publicKey,origin:'https://other.example'}]){
 const r=await s.handler(new Request('https://example.supabase.co',{method:'POST',headers,body:'{"action":"create","version":1}'}));assert.ok([401,403].includes(r.status));}
 assert.equal(s.calls.length,0);
});
test('missing and full rooms do not allocate players',async()=>{
 for(const rows of [[],[{id:'room',guest_id:'someone'}]]){
 const s=server(true,url=>url.includes('/kp_online_rooms?')?Response.json(rows):undefined);
 const r=await s.request({action:'join',code:'KP2345',version:1});assert.equal(r.status,rows.length?409:404);assert.ok(!s.calls.some(c=>c.url.includes('/admin/')));}
});
test('leave verifies player token before closing only that players rooms',async()=>{
 const s=server();assert.equal((await s.request({action:'leave'},'player-token')).status,200);
 assert.equal(s.calls[0].headers.Authorization,'Bearer player-token');assert.ok(s.calls[1].url.endsWith('or=(host_id.eq.player,guest_id.eq.player)'));assert.equal(s.calls[1].method,'PATCH');
 const bad=server(true,url=>url.endsWith('/auth/v1/user')?Response.json({error:'invalid'},{status:401}):undefined);
 await bad.request({action:'leave'},'bad-token');assert.equal(bad.calls.length,1);
});
test('rate limits and upstream diagnostics never expose credentials',async()=>{
 const s=server(true,url=>url.includes('rate_limit')?Response.json(false):undefined);assert.equal((await s.request({action:'create',version:1})).status,429);assert.equal(s.calls.length,1);
 const broken=server(true,()=>Response.json({secret:'sensitive-upstream-detail'},{status:503}));
 const r=await broken.request({action:'create',version:1});const text=await r.text();assert.equal(r.status,503);assert.match(text,/KPR-LIMIT-503/);assert.ok(!text.includes('sensitive-upstream-detail'));assert.ok(!text.includes(broken.secret));
});
