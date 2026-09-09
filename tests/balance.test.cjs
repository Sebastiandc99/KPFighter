const {test}=require('node:test');
const assert=require('node:assert/strict');
const {game}=require('./engine-harness.cjs');
const values={jairo:[8,98,26,7],paula:[8,92,27,7],facu:[9,95,25,8],padrino:[9,102,25,6],galante:[8,120,23,3],sergio:[10,116,22,4],blotta:[11,90,24,9],tunki:[8,122,25,2],marechal:[8,88,28,7],flor:[10,92,24,9]};
test('all ten fighters match the supplied table and spend the same power as before',()=>{
 const g=game();
 for(const [kind,expected] of Object.entries(values)){
  assert.deepEqual(Array.from(g.run(`['normalDamage','resistance','powerDamage','agility'].map(k=>stats['${kind}'][k])`)),expected);
  g.run(`gameMode='versus';startGame('${kind}','sergio');state='playing';player.power=100;attack(player,'special')`);
  assert.equal(g.run('player.power'),65);
  assert.equal(g.run('powerDamage(player)'),expected[2]/2);
 }
});
test('identical hits remove less life from heavy fighters, including blocked projectiles',()=>{
 const results={};
 for(const kind of Object.keys(values)){
  const g=game();g.run(`gameMode='versus';startGame('sergio','${kind}');state='playing';hit(cpu,10,0,0,player)`);
  results[kind]=g.run('cpu.health');
  assert.equal(results[kind],Math.round((100-Math.round(1000000/values[kind][1])/1000)*1000)/1000);
  g.run('cpu.health=100;cpu.invuln=0;cpu.action="idle";cpu.guarding=true;cpu.facing=-1;hit(cpu,20,0,0,player,{sourceX:player.x,projectile:true})');
  assert.ok(g.run('cpu.health')>98.8);
 }
 assert.ok(results.tunki>results.galante&&results.galante>results.sergio&&results.sergio>results.blotta&&results.blotta>results.marechal);
});
test('Blotta and Flor recover and travel faster than Tunki; move definitions remain immutable',()=>{
 const results={};
 for(const kind of ['blotta','flor','facu','sergio','galante','tunki']){
  const g=game();g.run(`startGame('${kind}','sergio');state='playing';player.x=200;cpu.x=900;attack(player,'punch')`);
  const recovery=g.run('player.moveSpec.recovery');g.tick(1);g.key('KeyD');const x=g.run('player.x');g.tick(.4);
  results[kind]={recovery,distance:g.run('player.x')-x};assert.equal(g.run('MOVES.punch.recovery'),.18);
 }
 for(const fast of ['blotta','flor']){assert.ok(results[fast].distance>results.tunki.distance*1.3);assert.ok(results[fast].recovery<results.tunki.recovery*.8);}
 assert.ok(results.facu.distance>results.galante.distance);
});
test('agility changes jump duration while preserving height and controls on both players',()=>{
 const result={};
 for(const kind of ['flor','blotta','tunki']){
  const g=game();g.run(`gameMode='versus';startGame('${kind}','${kind}');state='playing'`);g.key('KeyW');g.key('ArrowUp');
  const peak=[448,448];let seconds=0;
  while(seconds<2&&!g.run('player.grounded')){g.tick(1/120);seconds+=1/120;peak[0]=Math.min(peak[0],g.run('player.y'));peak[1]=Math.min(peak[1],g.run('cpu.y'));}
  assert.ok(g.run('player.grounded&&cpu.grounded'));assert.ok(Math.abs(peak[0]-peak[1])<.01);assert.ok(448-peak[0]>165);assert.equal(g.run('player.health+cpu.health'),200);
  result[kind]=seconds;
 }
 assert.ok(result.tunki>result.flor*1.2&&result.tunki>result.blotta*1.2);
});
test('heavy rolls take longer without losing their escape distance or costing energy',()=>{
 const result={};
 for(const kind of ['flor','tunki']){
  const g=game();g.run(`gameMode='versus';startGame('${kind}','sergio');state='playing';player.x=150;cpu.x=900;player.power=0;evade(player)`);
  assert.equal(g.run('player.power'),0);const duration=g.run('player.actionDuration');let elapsed=0;
  while(elapsed<1&&g.run('player.action')==='roll'){g.tick(1/120);elapsed+=1/120;}
  result[kind]={duration,distance:g.run('player.x')-150};assert.equal(g.run('player.action'),'idle');
 }
 assert.ok(result.tunki.duration>result.flor.duration*1.2);assert.ok(Math.abs(result.tunki.distance-result.flor.distance)<8);
});
test('Facu mustache reaches the visible edge in either direction and returns to the moving owner',()=>{
 for(const camera of [-180,0,180])for(const direction of [-1,1]){
  const g=game();g.run(`startGame('facu','blotta');state='playing';cameraX=${camera};player.x=${camera+(direction>0?100:860)};player.facing=${direction};cpu.invuln=99;spawnBoomerang(player)`);
  g.run('for(let i=0;i<100;i++)updateBoomerang(projectiles[0],STEP)');assert.equal(g.run('projectiles[0].returning'),false);
  let edgeReached=false;
  for(let i=0;i<250&&!g.run('projectiles[0].returning');i++){
   g.run('updateBoomerang(projectiles[0],STEP)');
   const leading=g.run(`projectiles[0].x+${direction}*projectiles[0].radius`);
   if(Math.abs(leading-(camera+(direction>0?960:0)))<.01)edgeReached=true;
  }
  assert.ok(edgeReached,`${camera}:${direction}`);assert.equal(g.run('projectiles[0].returning'),true);
  g.run('player.x+=40;for(let i=0;i<500&&projectiles.length;i++)updateBoomerang(projectiles[0],STEP)');assert.equal(g.run('projectiles.length'),0);assert.equal(g.run('player.mustacheAway'),false);
 }
});
