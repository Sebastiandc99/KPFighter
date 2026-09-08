/* Adapter: host runs the existing engine; guest renders authoritative frames. */
'use strict';
const onlineVoices=new Map();
const onlineEl=id=>document.getElementById(id);
function openOnlineMenu(){
 mainMenu();gameMode='online';state='online';document.body.classList.add('online-mode');
 onlineEl('onlineOptions').hidden=false;onlineEl('joinRoomForm').hidden=true;onlineEl('roomDetails').hidden=true;
 onlineEl('onlineMessage').textContent='Creá una sala o ingresá el código de tu rival.';
 onlineEl('onlineStatus').hidden=true;onlineEl('onlineRival').hidden=true;showScreen(ui.onlineScreen);ensureAudio();
}
function configureOnlineControls(){
 document.body.classList.add('online-mode');document.body.classList.remove('versus-mode','two-touch');
 onlineEl('touchControls2').hidden=true;onlineEl('rightRole').textContent='2P';onlineEl('onlineStatus').hidden=false;
 const mine=online.guest?cpu:player, ability=stats[mine.kind].ability;
 ui.abilityBtn.hidden=ability!=='slam';onlineEl('abilityHelp').hidden=!ability;
 for(const id of ['abilityLabel','abilityKeyLabel'])onlineEl(id).textContent=ability==='slam'?'APLASTAR':'HUMO';
 onlineEl('abilityIcon').textContent=ability==='slam'?'▼':'☁';
 onlineEl('evadeLabel1').textContent=['blotta','galante'].includes(mine.kind)?'HUMO':'RODAR';
 onlineEl('evadeBtn1').setAttribute('aria-label',['blotta','galante'].includes(mine.kind)?'Humo sin gastar energía':'Rodar sin gastar energía');
 onlineEl('onlineEndActions').hidden=true;
}
function captureOnlineFrame(){
 const clone=value=>JSON.parse(JSON.stringify(value,(key,v)=>['attackSound','sound'].includes(key)?undefined:typeof v==='number'?Math.round(v*1000)/1000:v));
 const matchKeys=['id','round','playerWins','cpuWins','complete','repeat','scores','winner','playerKind','cpuKind','endShown','campaignRun'];
 return {state,match:Object.fromEntries(matchKeys.filter(k=>match[k]!==undefined).map(k=>[k,match[k]])),
  fighters:fighters.map(clone),projectiles:projectiles.map(p=>clone({...p,owner:p.owner===player?0:1})),
  particles:clone(particles.slice(-60)),effects:clone(effects.slice(-32)),afterimages:clone(afterimages.slice(-12)),
  roundTime,cameraX,stageChoice,stageTime,introElapsed,resultElapsed,hitStop,screenShake,pauseFrom,
  announcement:ui.announcement.classList.contains('show')?ui.announcement.textContent:'',
  result:{visible:!ui.resultPanel.hidden,kicker:ui.resultKicker.textContent,title:ui.resultTitle.textContent,score:onlineEl('finalScore').textContent,
   notice:onlineEl('roundNotice').textContent,noticeVisible:!onlineEl('roundNotice').hidden}};
}
function validOnlineFrame(f){
 return f&&['intro','playing','paused','roundOver','finished'].includes(f.state)&&f.match&&[1,2,3].includes(f.match.round)
 &&stats[f.match.playerKind]&&stats[f.match.cpuKind]&&Array.isArray(f.fighters)&&f.fighters.length===2
 &&f.fighters.every(p=>stats[p.kind]&&['x','y','vx','vy','health','power'].every(k=>Number.isFinite(p[k]))&&p.health>=0&&p.health<=100)
 &&Array.isArray(f.projectiles)&&f.projectiles.length<80&&Array.isArray(f.particles)&&f.particles.length<=60
 &&Array.isArray(f.effects)&&f.effects.length<=32&&Array.isArray(f.afterimages)&&f.afterimages.length<=12&&stages[f.stageChoice];
}
function applyOnlineFrame(f){
 const previousState=state, previousRound=match.round, beforeEnd=match.endShown;
 Object.assign(match,f.match);
 if(previousRound!==f.match.round || (previousState==='roundOver'&&f.state==='intro')){startRound();onlineVoices.clear();}
 for(let i=0;i<2;i++){
  const target=fighters[i],oldX=target.x,oldY=target.y;
  Object.assign(target,f.fighters[i]);target.prevX=oldX;target.prevY=oldY;
 }
 state=f.state;roundTime=f.roundTime;cameraX=f.cameraX;stageChoice=f.stageChoice;stageTime=f.stageTime;
 introElapsed=f.introElapsed;resultElapsed=f.resultElapsed;hitStop=f.hitStop;screenShake=f.screenShake;pauseFrom=f.pauseFrom;
 projectiles=f.projectiles.map(p=>({...p,owner:fighters[p.owner]}));particles=f.particles;effects=f.effects;afterimages=f.afterimages;
 ui.resultPanel.hidden=!f.result.visible;ui.resultKicker.textContent=f.result.kicker;ui.resultTitle.textContent=f.result.title;
 onlineEl('finalScore').textContent=f.result.score;onlineEl('roundNotice').textContent=f.result.notice;onlineEl('roundNotice').hidden=!f.result.noticeVisible;
 announce(f.announcement);setPauseUI(state==='paused');
 if(previousState!==state){
  if(state==='paused'){stopRoundVoice();suspendCombatSounds();pauseMusic();clearHeld();}
  else if(state==='playing'){stopRoundVoice();syncMusic();}
  else if(state==='roundOver'||state==='finished'){
   stopAllCombatSounds();stopRoundVoice();onlineVoices.clear();
   if(f.announcement==='K.O.'){koVoice={elapsed:0,waited:0,started:false,source:null,gain:null};loadKOAudio();syncKOAudio();}
   if(state==='finished')stopMusic();
  }
 }
 if(state==='intro')syncRoundVoice();
 if(match.endShown&&!beforeEnd)showGameOver();
 onlineEl('cpuResultNote').hidden=true;onlineEl('onlineEndActions').hidden=!match.endShown;
 updateHud();
}
function updateOnlineGuest(dt){
 if(!['intro','playing','paused','roundOver','finished'].includes(state))return;
 if(state==='paused')return;
 advanceMusic(dt);advanceCombatSounds(dt);
 for(const [id,voice] of onlineVoices)if(voice.elapsed>3 || (voice.remoteStopAt && voice.elapsed>=voice.remoteStopAt)){stopCombatSound(voice,true);onlineVoices.delete(id);}
 if(koVoice){koVoice.elapsed+=dt;if(koVoice.elapsed>=KO_AUDIO.duration)stopKOAudio();else syncKOAudio();}
}
function onlineSound(event){
 if(event.type==='sfx'&&typeof event.name==='string')sfx(event.name);
 if(event.type==='combat'&&COMBAT_AUDIO[event.name]&&!onlineVoices.has(event.voice)){
  onlineVoices.set(event.voice,startCombatSound(event.name));
 }
 if(event.type==='stop'){const v=onlineVoices.get(event.voice);if(v){if(v.elapsed<.1)v.remoteStopAt=.1;else {stopCombatSound(v);onlineVoices.delete(event.voice);}}}
}
online=new window.KPOnline(window.KP_ONLINE_CONFIG,{
 status:text=>{onlineEl('onlineMessage').textContent=text;onlineEl('onlineStatus').textContent=(online?.active?(online.guest?'TÚ: 2P · ':'TÚ: 1P · '):'')+text;},
 busy:busy=>{for(const id of ['createRoomBtn','joinRoomBtn','connectRoomBtn'])onlineEl(id).disabled=busy;},
 room:code=>{onlineEl('onlineOptions').hidden=true;onlineEl('joinRoomForm').hidden=true;onlineEl('roomDetails').hidden=false;onlineEl('roomCode').textContent=code;},
 openSelection:slot=>{selectionPlayer=slot;gameMode='online';openSelection();onlineEl('onlineRival').hidden=false;ui.confirmBtn.disabled=false;},
 selection:(kind,ready,mine)=>{onlineEl('onlineRival').textContent='RIVAL: '+stats[kind].name+(ready?' · LISTO':' · ELIGIENDO…');ui.confirmBtn.disabled=mine;ui.confirmBtn.textContent=mine?'ESPERANDO RIVAL…':'CONFIRMAR PERSONAJE';},
 start:(host,guest)=>{gameMode='online';playerChoice=host;opponentChoice=guest;startGame(host,guest);},
 remoteInput:h=>{Object.assign(held2,h);if(cpu)updateHuman(cpu,held2);},
 remoteAction:action=>performAction(action,2,true),
 pause:wanted=>{if((state==='paused')!==wanted)togglePause(true);},
 advance:t=>{if(t-lastTime>=80){advanceGameClock(t);updateHud();}},
 validKind:kind=>Object.hasOwn(stats,kind),capture:captureOnlineFrame,validFrame:validOnlineFrame,apply:applyOnlineFrame,sound:onlineSound,
 disconnected:text=>{
  if(state==='finished'&&match.complete){onlineEl('onlineStatus').textContent=text;return;}
  stopAllCombatSounds();stopRoundVoice();clearHeld();setPauseUI(false);state='online';selectMusic('title');
  onlineEl('onlineOptions').hidden=true;onlineEl('joinRoomForm').hidden=true;onlineEl('roomDetails').hidden=true;onlineEl('onlineMessage').textContent=text;showScreen(ui.onlineScreen);
 }
});
for(const id of ['titleOnlineBtn','onlineBtn'])onlineEl(id).addEventListener('click',()=>{requestMobileLandscape();openOnlineMenu();});
onlineEl('createRoomBtn').addEventListener('click',()=>online.enter('create'));
onlineEl('joinRoomBtn').addEventListener('click',()=>{onlineEl('joinRoomForm').hidden=false;onlineEl('roomInput').focus();});
onlineEl('joinRoomForm').addEventListener('submit',event=>{event.preventDefault();online.enter('join',onlineEl('roomInput').value);});
onlineEl('copyRoomBtn').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(onlineEl('roomCode').textContent);onlineEl('onlineMessage').textContent='Código copiado. Esperando oponente…';}catch(_){onlineEl('onlineMessage').textContent='Compartí el código que aparece arriba.';}});
onlineEl('onlineBackBtn').addEventListener('click',mainMenu);
onlineEl('onlineEndMenuBtn').addEventListener('click',mainMenu);
onlineEl('onlineEndRankingBtn').addEventListener('click',()=>showRanking());
window.addEventListener('pagehide',()=>{if(online.active)online.leave();});
