const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {game}=require('./engine-harness.cjs');
function client(role){
 const g=game();g.sandbox.setInterval=()=>1;g.sandbox.clearInterval=()=>{};g.sandbox.clearTimeout=()=>{};
 g.sandbox.fetch=async()=>({ok:true,json:async()=>({})});
 for(const file of ['online-config.js','online.js','online-game.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),g.sandbox);
 g.run(`online.active=true;online.room={role:'${role}',id:'test',expires:'2099-01-01'};online.started=false;online.peer=true;online.ready=false;online.remoteReady=false;online.kind='sergio';online.remoteKind='jairo';online.ack=0;online.inputSeq=0;online.lastInputSeq=0;online.actionId=0;online.actions=[];online.holds={left:false,right:false,down:false,guard:false};online.remoteSnapshot=0;online.snapshotId=0;online.lastEvent=0;online.pauseSeq=0;online.remotePauseSeq=0;online.born=0;online.lastPeer=0;online.lastFrame=0;online.lastHello=0;online.lastInput=0;online.lastPing=0;online.lastSnapshot=0;online.inputAt=0;gameMode='online';selectionPlayer=${role==='host'?1:2};openSelection();`);
 return g;
}
function pair(){const host=client('host'),guest=client('guest');let drop=false;
 host.sandbox.sendPeer=m=>{if(!drop)guest.run('online.receive('+JSON.stringify(m)+',"relay")');};
 guest.sandbox.sendPeer=m=>{if(!drop)host.run('online.receive('+JSON.stringify(m)+',"relay")');};
 for(const g of [host,guest])g.run('online.wire={send:m=>sendPeer({...m,v:1}),close(){}}');
 return {host,guest,drop:v=>{drop=v;},start(a='jairo',b='paula'){
  host.run(`chooseFighter('${a}',false);confirmFighter()`);guest.run(`chooseFighter('${b}',false);confirmFighter()`);
  host.run('online.sendFrame()');
 },frame(){host.run('online.sendFrame()');}};
}
test('online choices are independent, both must confirm, and identical characters work',()=>{
 const p=pair();p.host.run('chooseFighter("jairo",false);confirmFighter()');assert.equal(p.host.run('online.started'),false);
 p.guest.run('chooseFighter("jairo",false);confirmFighter()');p.frame();
 assert.equal(p.host.run('player.kind+":"+cpu.kind'),'jairo:jairo');assert.equal(p.guest.run('player.kind+":"+cpu.kind'),'jairo:jairo');
 assert.equal(p.guest.run('online.started'),true);assert.equal(p.guest.nodes.get('touchControls2').hidden,true);
});
test('guest inputs move only player two; host key refresh preserves remote holds',()=>{
 const p=pair();p.start();p.host.run('state="playing"');p.frame();
 p.guest.key('KeyA');p.host.key('KeyD');assert.equal(p.host.run('held2.left'),true);
 p.host.tick(.2);p.frame();assert.ok(p.host.run('cpu.x')<725);assert.ok(p.host.run('player.x')>235);
 assert.ok(Math.abs(p.host.run('cpu.x')-p.guest.run('cpu.x'))<.001);
 p.guest.key('KeyA','keyup');assert.equal(p.host.run('held2.left'),false);
 p.guest.key('Digit7');assert.equal(p.host.run('cpu.action'),'idle');
});
test('network attacks are acknowledged once, hold modifiers survive, host alone applies damage',()=>{
 const p=pair();p.start('sergio','jairo');p.host.run('state="playing";player.x=300;cpu.x=500;cpu.power=100');p.frame();
 p.guest.key('KeyS');p.guest.key('KeyL');assert.equal(p.host.run('cpu.specialStyle'),'crash');
 const power=p.host.run('cpu.power');p.guest.run('online.sendInput();online.sendInput()');assert.equal(p.host.run('cpu.power'),power);
 p.host.tick(.5);p.frame();assert.equal(p.guest.run('projectiles[0].style'),'crash');
 const y=p.guest.run('projectiles[0].bars[0].y');p.guest.tick(.8);assert.equal(p.guest.run('projectiles[0].bars[0].y'),y);
 p.host.tick(1.2);p.frame();assert.ok(p.host.run('player.health')<100);assert.equal(p.host.run('player.health'),p.guest.run('player.health'));
});
test('touch controls map to the guest fighter and free smoke uses that fighter',()=>{
 const p=pair();p.start('sergio','blotta');p.host.run('state="playing";cpu.power=0');p.frame();
 const e={pointerId:1,preventDefault(){}};p.guest.taps[5].listeners.pointerdown(e);assert.equal(p.host.run('cpu.action'),'teleport');assert.equal(p.host.run('player.action'),'idle');assert.equal(p.host.run('cpu.power'),0);
 assert.equal(p.guest.nodes.get('evadeLabel1').textContent,'HUMO');
});
test('KO, next round, final winner, GAME OVER and pause are authoritative on both devices',()=>{
 const p=pair();p.start();p.host.run('state="playing"');p.frame();
 p.guest.key('Space');p.frame();assert.equal(p.host.run('state'),'paused');assert.equal(p.guest.run('state'),'paused');
 p.guest.key('Space');p.frame();assert.equal(p.host.run('state'),'playing');
 p.host.run('hit(cpu,100,0,0,player)');p.frame();assert.equal(p.guest.run('state'),'roundOver');assert.equal(p.guest.run('cpu.health'),0);assert.equal(p.guest.nodes.get('announcement').textContent,'K.O.');
 p.host.tick(2.8);p.frame();assert.equal(p.guest.run('match.round'),2);assert.equal(p.guest.run('cpu.health'),100);
 p.host.run('state="playing";hit(cpu,100,0,0,player)');p.host.tick(2.3);p.frame();
 assert.equal(p.guest.run('match.winner'),0);assert.equal(p.guest.nodes.get('resultKicker').textContent,'GAME OVER');assert.equal(p.guest.nodes.get('winnerForm').hidden,true);assert.equal(p.host.nodes.get('winnerForm').hidden,false);
});
test('dropped inputs retry without duplicate hits and stale frames cannot rewind health',()=>{
 const p=pair();p.start('sergio','sergio');p.host.run('state="playing";player.x=300;cpu.x=360');p.frame();
 p.drop(true);p.guest.key('KeyJ');assert.equal(p.host.run('cpu.action'),'idle');p.drop(false);p.guest.run('online.sendInput()');assert.equal(p.host.run('cpu.action'),'punch');
 p.host.tick(.2);p.frame();const hp=p.guest.run('player.health');
 const f=p.host.run('captureOnlineFrame()');f.fighters[0].health=100;p.guest.run('online.receive('+JSON.stringify({v:1,type:'frame',seq:1,frame:f})+',"relay")');assert.equal(p.guest.run('player.health'),hp);
});
test('lost connection clears controls and returns an exit screen; local modes remain available',()=>{
 const p=pair();p.start();p.host.run('state="playing"');p.frame();p.guest.key('KeyD');
 p.guest.run('performance.now=()=>9000;online.tick()');assert.equal(p.guest.run('online.active'),false);assert.equal(p.guest.run('state'),'online');assert.equal(p.guest.run('held.right'),false);
 p.guest.run('mainMenu();startMode("solo");beginGame()');assert.equal(p.guest.run('campaign.opponents.length'),9);
 p.guest.run('mainMenu();startMode("versus");startGame("sergio","jairo");state="playing"');p.guest.key('Digit7');assert.equal(p.guest.run('cpu.action'),'punch');
});
test('all character powers, projectiles and effects serialize without shared engine objects',()=>{
 for(const kind of ['sergio','blotta','tunki','marechal','facu','flor','galante','padrino','paula','jairo']){
  const p=pair();p.start(kind,'sergio');p.host.run('state="playing";player.power=100;attack(player,"special")');p.host.tick(.4);p.frame();
  assert.equal(p.guest.run('player.specialStyle'),p.host.run('player.specialStyle'));p.guest.run('draw()');
  assert.equal(p.guest.run('projectiles.length'),p.host.run('projectiles.length'));
 }
});
