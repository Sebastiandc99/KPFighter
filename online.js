/* KP Fighter online transport. Realtime v1 protocol; no administrative credentials. */
(function(root){
 'use strict';
 const now=()=>performance.now();
 const HOLDS=['left','right','down','guard'];
 const ACTIONS=['jump','punch','kick','special','ability','evade'];
 const cleanHold=h=>Object.fromEntries(HOLDS.map(k=>[k,h?.[k]===true]));
 class RealtimeWire {
  constructor(config,room,onMessage,onFailure){Object.assign(this,{config,room,onMessage,onFailure});this.ref=0;this.joins={};this.ready=false;}
  connect(){return new Promise((resolve,reject)=>{
   const ws=this.ws=new WebSocket(this.config.url.replace('https:','wss:')+'/realtime/v1/websocket?apikey='+encodeURIComponent(this.config.key)+'&vsn=1.0.0');
   const timeout=setTimeout(()=>{reject(Error('No se pudo conectar. Revisá tu conexión.'));this.close();},12000);
   let joined=0;
   ws.onopen=()=>{for(const role of ['host','guest']){const topic='realtime:kp:'+this.room.id+':'+role;const ref=String(++this.ref);this.joins[topic]=ref;ws.send(JSON.stringify({topic,event:'phx_join',ref,join_ref:ref,payload:{config:{private:true,broadcast:{ack:false,self:false},presence:{enabled:false},postgres_changes:[]},access_token:this.room.token}}));}};
   ws.onmessage=e=>{
    if(typeof e.data!=='string'||e.data.length>180000)return;
    let m;try{m=JSON.parse(e.data);}catch(_){return;}
    if(m.event==='phx_reply'&&this.joins[m.topic]===m.ref){
     if(m.payload.status!=='ok'){clearTimeout(timeout);reject(Error('No se pudo entrar a la sala privada.'));this.close();return;}
     if(++joined===2){clearTimeout(timeout);this.ready=true;this.heartbeat=setInterval(()=>this.raw('phoenix','heartbeat',{}),20000);resolve();}
    }
    if(m.event==='broadcast'&&m.topic.endsWith(':'+(this.room.role==='host'?'guest':'host'))&&m.payload?.event==='kp')this.onMessage(m.payload.payload);
    if(m.event==='phx_error')this.onFailure();
   };
   ws.onerror=()=>{if(!this.ready){clearTimeout(timeout);reject(Error('No se pudo abrir la conexión online.'));}};
   ws.onclose=()=>{clearTimeout(timeout);clearInterval(this.heartbeat);if(!this.closed)this.onFailure();};
  });}
  raw(topic,event,payload){if(this.ws?.readyState===1)this.ws.send(JSON.stringify({topic,event,payload,ref:String(++this.ref),join_ref:this.joins[topic]}));}
  send(data){if(!this.ready||this.ws?.readyState!==1||this.ws.bufferedAmount>180000)return false;this.raw('realtime:kp:'+this.room.id+':'+this.room.role,'broadcast',{type:'broadcast',event:'kp',payload:data});return true;}
  close(){this.closed=true;this.ready=false;clearInterval(this.heartbeat);this.ws?.close();}
 }
 class KPOnline {
  constructor(config,adapter){this.config=config;this.a=adapter;this.generation=0;this.active=false;this.events=[];this.eventId=0;this.renderInterval=80;}
  get guest(){return this.active&&this.room?.role==='guest';}
  status(text){this.a.status(text);}
  async enter(action,code){
   this.leave(false);const gen=++this.generation;this.status('Conectando…');this.a.busy(true);
   let allocated;
   try{
    const response=await fetch(this.config.url+'/functions/v1/kp-rooms',{method:'POST',headers:{apikey:this.config.key,Authorization:'Bearer '+this.config.key,'Content-Type':'application/json'},body:JSON.stringify({action,code,version:1}),signal:AbortSignal.timeout(18000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo conectar.');allocated=data;
    if(gen!==this.generation){this.closeRoom(data);return;}
    this.room=data;this.active=true;this.started=false;this.peer=false;this.ready=false;this.remoteReady=false;this.kind='sergio';this.remoteKind='blotta';this.seq=0;this.lastFrame=0;this.lastInputSeq=0;this.inputSeq=0;this.actionId=0;this.ack=0;this.actions=[];this.holds=cleanHold({});this.events=[];this.eventId=0;this.lastEvent=0;this.snapshotId=0;this.remoteSnapshot=0;this.inputAt=now();this.born=now();this.lastPeer=now();this.lastHello=0;this.lastInput=0;this.lastPing=0;this.lastSnapshot=0;this.pauseCommand=null;this.pauseSeq=0;this.remotePauseSeq=0;
    this.wire=new RealtimeWire(this.config,data,m=>this.receive(m,'relay'),()=>{if(this.active&&!this.direct)this.status('Conectando…');});
    await this.wire.connect();if(gen!==this.generation){this.wire.close();return;}
    this.a.room(data.code);this.status(data.role==='host'?'Esperando oponente…':'Esperando rival…');this.timer=setInterval(()=>this.tick(),40);this.tick();
   }catch(e){if(allocated)this.closeRoom(allocated);if(gen===this.generation){this.leave(false);this.status(e.message||'No se pudo conectar.');}}
   finally{if(gen===this.generation)this.a.busy(false);}
  }
  closeRoom(room){if(!room)return;fetch(this.config.url+'/functions/v1/kp-rooms',{method:'POST',headers:{apikey:this.config.key,Authorization:'Bearer '+room.token,'Content-Type':'application/json'},body:JSON.stringify({action:'leave'}),keepalive:true}).catch(()=>{});}
  leave(notify=true){
   if(this.leaving)return;this.leaving=true;
   if(notify&&this.active)this.send({type:'bye'});
   ++this.generation;this.active=false;clearInterval(this.timer);this.pc?.close();this.dc?.close();this.wire?.close();this.closeRoom(this.room);this.room=null;this.pc=null;this.dc=null;this.wire=null;this.direct=false;this.peer=false;this.events=[];this.leaving=false;this.a.busy(false);
  }
  fail(text){if(!this.active)return;this.leave();this.a.disconnected(text);}
  send(message,relay=false){
   if(!this.active)return;const m={...message,v:1};
   if(!relay&&this.direct&&this.dc?.readyState==='open'&&this.dc.bufferedAmount<100000){try{this.dc.send(JSON.stringify(m));return;}catch(_){this.direct=false;}}
   this.wire?.send(m);
  }
  choose(kind){if(this.ready)return;this.kind=kind;this.sendLobby();}
  confirm(){if(!this.active||!this.peer||this.ready)return;this.ready=true;this.sendLobby();this.a.selection(this.remoteKind,this.remoteReady,true);this.tryStart();}
  sendLobby(){this.send({type:'hello',kind:this.kind,ready:this.ready,started:this.started});}
  tryStart(){if(!this.guest&&this.ready&&this.remoteReady&&!this.started){this.started=true;this.a.start(this.kind,this.remoteKind);this.sendFrame();}}
  input(holds,action){
   if(!this.active)return;this.holds=cleanHold(holds);
   if(this.guest){if(ACTIONS.includes(action))this.actions.push({id:++this.actionId,action,holds:{...this.holds}});this.actions=this.actions.slice(-16);this.sendInput();}
  }
  sendInput(){this.lastInput=now();this.send({type:'input',seq:++this.inputSeq,holds:this.holds,actions:this.actions,pause:this.pauseCommand});}
  pause(wanted){if(!this.active)return;if(this.guest){this.pauseCommand={id:++this.pauseSeq,wanted};this.sendInput();}else this.a.pause(wanted);}
  audio(type,name,voice){if(this.active&&!this.guest&&this.started){this.events.push({id:++this.eventId,type,name,voice});this.events=this.events.slice(-60);}}
  sendFrame(){if(!this.started||this.guest)return;this.send({type:'frame',seq:++this.snapshotId,ack:this.ack,pauseAck:this.remotePauseSeq,frame:this.a.capture(),events:this.events});this.lastSnapshot=now();}
  tick(){
   if(!this.active)return;const t=now();
   if(Date.parse(this.room.expires)<Date.now()){this.fail('La sala venció. Creá una nueva para seguir jugando.');return;}
   if(this.direct&&t-this.lastPeer>1800)this.direct=false;
   if(this.peer&&t-this.lastPeer>8000){this.fail('Rival desconectado. Podés volver al menú principal.');return;}
   if(!this.peer&&t-this.born>120000){this.fail('No se conectó un rival. Podés crear otra sala.');return;}
   if(this.guest&&this.started&&t-this.lastFrame>8000){this.fail('Se perdió la conexión con la partida.');return;}
   if(!this.started&&t-this.lastHello>600){this.sendLobby();this.lastHello=t;}
   if(this.guest&&t-this.lastInput>100)this.sendInput();
   if(!this.guest&&this.started){if(t-this.inputAt>350)this.a.remoteInput(cleanHold({}));if(t-this.lastSnapshot>(this.direct?33:83))this.sendFrame();}
   if(t-this.lastPing>1200){this.send({type:'ping',at:t});this.lastPing=t;}
  }
  receive(m,via){
   if(!this.active||!m||m.v!==1||typeof m.type!=='string')return;
   this.lastPeer=now();
   if(m.type==='bye'){this.fail('Rival desconectado. Podés volver al menú principal.');return;}
   if(m.type==='ping'){this.send({type:'pong',at:m.at});return;}
   if(m.type==='pong'){const ping=Math.round(now()-m.at);if(ping>=0&&ping<10000)this.status('Rival conectado · PING: '+ping+' ms');return;}
   if(m.type==='rtc'){if(via==='relay')this.receiveRTC(m).catch(()=>{this.direct=false;});return;}
   if(m.type==='hello'){
    if(!this.a.validKind(m.kind))return;
    if(!this.peer){this.peer=true;this.a.openSelection(this.guest?2:1);this.status('Rival conectado.');if(!this.guest)this.startRTC().catch(()=>{});}
    this.remoteKind=m.kind;this.remoteReady=m.ready===true;this.a.selection(this.remoteKind,this.remoteReady,this.ready);this.tryStart();return;
   }
   if(m.type==='input'&&!this.guest){
    if(!Number.isSafeInteger(m.seq)||m.seq<=this.lastInputSeq)return;this.lastInputSeq=m.seq;this.inputAt=now();this.a.remoteInput(cleanHold(m.holds));
    if(Array.isArray(m.actions))for(const cmd of m.actions.slice(0,16))if(Number.isSafeInteger(cmd.id)&&cmd.id>this.ack&&ACTIONS.includes(cmd.action)){this.ack=cmd.id;this.a.remoteInput(cleanHold(cmd.holds));if(this.started)this.a.remoteAction(cmd.action);}
    this.a.remoteInput(cleanHold(m.holds));
    if(m.pause&&Number.isSafeInteger(m.pause.id)&&m.pause.id>this.remotePauseSeq&&typeof m.pause.wanted==='boolean'){this.remotePauseSeq=m.pause.id;this.a.pause(m.pause.wanted);}return;
   }
   if(m.type==='frame'&&this.guest){
    if(!Number.isSafeInteger(m.seq)||m.seq<=this.remoteSnapshot||!this.a.validFrame(m.frame))return;
    this.remoteSnapshot=m.seq;this.renderInterval=Math.max(25,Math.min(140,now()-this.lastFrame));this.lastFrame=now();
    if(!this.started){this.started=true;this.peer=true;this.a.start(m.frame.match.playerKind,m.frame.match.cpuKind);}
    this.actions=this.actions.filter(c=>c.id>m.ack);if(this.pauseCommand&&m.pauseAck>=this.pauseCommand.id)this.pauseCommand=null;
    this.a.apply(m.frame);
    if(Array.isArray(m.events))for(const event of m.events.slice(-60))if(Number.isSafeInteger(event.id)&&event.id>this.lastEvent){this.lastEvent=event.id;this.a.sound(event);}
   }
  }
  createPeer(){
   if(this.pc)return this.pc;if(typeof RTCPeerConnection==='undefined')throw Error('relay');
   const pc=this.pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});this.ice=[];
   pc.onicecandidate=e=>{if(e.candidate)this.send({type:'rtc',ice:e.candidate.toJSON()},true);};
   pc.ondatachannel=e=>this.attachData(e.channel);
   pc.onconnectionstatechange=()=>{if(['failed','disconnected','closed'].includes(pc.connectionState))this.direct=false;};return pc;
  }
  attachData(dc){this.dc=dc;dc.onopen=()=>{this.direct=true;};dc.onclose=()=>{this.direct=false;};dc.onerror=()=>{this.direct=false;};dc.onmessage=e=>{if(typeof e.data==='string'&&e.data.length<180000){try{this.receive(JSON.parse(e.data),'direct');}catch(_){this.direct=false;}}};}
  async startRTC(){const pc=this.createPeer();this.attachData(pc.createDataChannel('fight',{ordered:false,maxRetransmits:0}));await pc.setLocalDescription(await pc.createOffer());this.send({type:'rtc',sdp:pc.localDescription.toJSON()},true);}
  async receiveRTC(m){
   const pc=this.createPeer();
   if(m.sdp&&['offer','answer'].includes(m.sdp.type)&&typeof m.sdp.sdp==='string'&&m.sdp.sdp.length<30000){
    if((this.guest&&m.sdp.type!=='offer')||(!this.guest&&m.sdp.type!=='answer'))return;
    await pc.setRemoteDescription(m.sdp);for(const c of this.ice.splice(0))await pc.addIceCandidate(c);
    if(m.sdp.type==='offer'){await pc.setLocalDescription(await pc.createAnswer());this.send({type:'rtc',sdp:pc.localDescription.toJSON()},true);}
   }else if(m.ice){if(pc.remoteDescription)await pc.addIceCandidate(m.ice);else if(this.ice.length<30)this.ice.push(m.ice);}
  }
 }
 root.KPOnline=KPOnline;
 if(typeof module!=='undefined')module.exports={KPOnline,RealtimeWire,cleanHold};
})(typeof window==='undefined'?globalThis:window);
