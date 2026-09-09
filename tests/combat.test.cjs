const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {game}=require("./engine-harness.cjs");
// Independent fixture from the supplied balance table; health remains a percentage.
const balanceReference={jairo:[8,98,26],paula:[8,92,27],facu:[9,95,25],padrino:[9,102,25],galante:[8,120,23],sergio:[10,116,22],blotta:[11,90,24],tunki:[8,122,25],marechal:[8,88,28],flor:[10,92,24]};
const afterHit=(g,damage,target='cpu')=>Math.round((100-Math.round(damage*100000/balanceReference[g.run(target+'.kind')][1])/1000)*1000)/1000;
const afterPower=(g,multiplier=1)=>afterHit(g,balanceReference[g.run('player.kind')][2]*.5*multiplier);
const afterNormal=(g,base)=>afterHit(g,base*balanceReference[g.run('player.kind')][0]/10);

test("neutral jump has its own pose and never inflicts a kick", () => {
  const g = game();
  g.run("player.x = 300; cpu.x = 365;");
  g.key("KeyW");
  assert.equal(g.run("player.action"), "idle");
  assert.equal(g.run("poseFor(player)"), 10);
  assert.ok(g.run("player.vy") < 0);
  g.tick(1);
  assert.equal(g.run("cpu.health"), 100);
  assert.equal(g.run("player.grounded"), true);
  g.tick(.2);
  assert.equal(g.run("player.grounded"), true);
});

test("kick requires an attack input and connects during its active frames", () => {
  const g = game();
  g.run("player.x = 300; cpu.x = 390;");
  g.key("KeyK");
  g.tick(.08);
  assert.equal(g.run("cpu.health"), 100);
  g.tick(.26);
  assert.ok(g.run("cpu.health") < 100);
});

test("crouching lowers the hurt box and evades a high energy projectile", () => {
  const g = game();
  const normal = g.run("hurtBox(player).top");
  g.key("KeyS");
  assert.ok(g.run("hurtBox(player).top") > normal + 40);
  assert.equal(g.run("poseFor(player)"), 8);
  g.run('cpu.x = 405; player.x = 250; spawnProjectile(cpu, "ki");');
  g.tick(.5);
  assert.equal(g.run("player.health"), 100);
  g.key("KeyS", "keyup");
  assert.equal(g.run("player.crouching"), false);
});

test("guard blocks frontal melee while an unguarded hit deals damage", () => {
  const g = game();
  g.run("player.x = 300; cpu.x = 375; player.facing = 1;");
  g.key("KeyI");
  assert.equal(g.run("player.guarding"), true);
  g.run('hit(player, 10, -170, 0, cpu, {sourceX: cpu.x, low:false})');
  assert.equal(g.run("player.health"), 100);
  g.tick(.2);
  g.key("KeyI", "keyup");
  g.run('hit(player, 10, -170, 0, cpu, {sourceX: cpu.x, low:false})');
  assert.equal(g.run("player.health"), afterHit(g,10,"player"));
});

test("low attacks bypass standing guard but crouching guard blocks them", () => {
  for (const crouched of [false, true]) {
    const g = game();
    g.run("player.x = 300; cpu.x = 375; player.facing = 1;");
    if (crouched) g.key("ArrowDown");
    g.key("ShiftLeft");
    g.run('hit(player, 9, -170, 0, cpu, {sourceX: cpu.x, low:true})');
    assert.equal(g.run("player.health"), crouched ? 100 : afterHit(g,9,"player"));
  }
});

test("Blotta vanishes and leaves smoke at both positions without spending power", () => {
  const g = game();
  g.run('startGame("blotta"); state = "playing"; player.power = 65;');
  const startX = g.run("player.x");
  g.key("KeyH");
  g.tick(.2);
  assert.equal(g.run("isVanished(player)"), true);
  assert.ok(g.run("particles.some(p => p.smoke)"));
  const hp = g.run("player.health");
  g.run("hit(player, 10, -170, 0, cpu)");
  assert.equal(g.run("player.health"), hp);
  g.tick(.16);
  assert.ok(Math.abs(g.run("player.x") - startX) > 100);
  assert.ok(g.run("player.x >= 65 && player.x <= 895"));
  assert.ok(g.run("particles.filter(p => p.smoke).length") > 20);
  assert.ok(g.run("player.power") >= 65);
  g.tick(.4);
  assert.equal(g.run("isVanished(player)"), false);
  assert.equal(g.run('attack(player, "teleport")'), true);
});

test("Space toggles pause without attacking and freezes intro and teleport", () => {
  const g = game();
  g.run('startGame("blotta");');
  g.tick(.5);
  g.key("Space");
  const intro = g.run("introElapsed");
  g.tick(1);
  assert.equal(g.run("introElapsed"), intro);
  g.key("Space");
  g.tick(3.6);
  assert.equal(g.run("state"), "playing");
  g.key("KeyH");
  g.tick(.2);
  g.key("Space");
  const snapshot = g.run("JSON.stringify([player.x, player.actionTime, roundTime, particles])");
  g.tick(2);
  assert.equal(g.run("JSON.stringify([player.x, player.actionTime, roundTime, particles])"), snapshot);
  g.key("Space", "keydown", true);
  assert.equal(g.run("state"), "paused");
  g.key("Space");
  g.tick(.5);
  assert.equal(g.run("state"), "playing");
  assert.equal(g.run("player.action"), "idle");
});

test("touch supports movement and jumping together, and releases canceled holds", () => {
  const g = game();
  function event(id) { return { pointerId: id, pointerType: "touch", preventDefault() {} }; }
  const right = g.holds[1];
  right.listeners.pointerdown(event(1));
  g.taps[0].listeners.pointerdown(event(2));
  assert.ok(g.run("player.vx") > 0);
  assert.equal(g.run("poseFor(player)"), 10);
  right.listeners.pointercancel(event(1));
  assert.equal(g.run("held.right"), false);
  g.holds[3].listeners.pointerdown(event(3));
  g.holds[3].listeners.lostpointercapture(event(3));
  assert.equal(g.run("held.guard"), false);
});

test("movement speed stays consistent at 30, 60 and 144 Hz", () => {
  const positions = [30, 60, 144].map(hz => {
    const g = game();
    g.key("KeyD");
    for (let frame = 1; frame <= hz; frame++) g.run("loop(" + frame * 1000 / hz + ")");
    return g.run("player.x");
  });
  assert.ok(Math.max(...positions) - Math.min(...positions) < 3, positions.join(", "));
});

test("an input buffered near recovery executes and damage stops at round end", () => {
  const g = game();
  g.key("KeyJ");
  g.tick(.24);
  g.key("KeyK");
  g.tick(.13);
  assert.equal(g.run("player.action"), "kick");
  g.run('cpu.health = 5; hit(cpu, 10, 120, 0, player);');
  assert.equal(g.run("state"), "roundOver");
  g.tick(1);
  assert.equal(g.nodes.get("resultPanel").hidden, true);
  const hp = g.run("player.health");
  g.run("hit(player, 20, -170, 0, cpu)");
  assert.equal(g.run("player.health"), hp);
  assert.equal(g.run("cpu.health"), 0);
});

test("all character matchups finish simulated fights with AI and rendering enabled", () => {
  for (const kind of ["sergio", "blotta", "tunki", "marechal", "facu", "flor", "galante", "padrino", "paula", "jairo"]) {
   for (const rival of ["sergio", "blotta", "tunki", "marechal", "facu", "flor", "galante", "padrino", "paula", "jairo"].filter(other => other !== kind)) {
    const g = game();
    g.run('startGame("' + kind + '"); state = "playing"; aiEnabled = true;');
    g.run('cpu.kind = match.cpuKind = "' + rival + '";');
    for (let frame = 1; frame <= 195 * 60 && g.run("state") !== "finished"; frame++) {
      if (frame % 17 === 0) g.key("KeyJ");
      if (frame % 47 === 0) g.key("KeyK");
      if (frame % 139 === 0) g.key("KeyL");
      if (frame % 251 === 0) g.key("KeyH");
      g.run("loop(" + frame * 1000 / 60 + ")");
    }
    assert.equal(g.run("state"), "finished");
    assert.ok(g.run("fighters.every(f => Number.isFinite(f.x) && Number.isFinite(f.y) && f.health >= 0 && f.health <= 100)"));
    assert.ok(g.run("particles.length <= 220 && afterimages.length < 20 && effects.length <= 48"));
   }
  }
});

test("La Tunki is selectable with keyboard and appears in the expanded roster", () => {
  const g = game();
  g.run('openSelection(); chooseFighter("blotta", false);');
  g.key("ArrowRight");
  assert.equal(g.run("playerChoice"), "tunki");
  assert.equal(g.nodes.get("selectionName").textContent, "LA TUNKI");
  assert.ok(g.nodes.get("pick-tunki").classList.contains("selected"));
  g.key("Enter");
  assert.equal(g.run("state"), "stage");
  g.key("Enter");
  assert.equal(g.run("player.kind"), "tunki");
  assert.notEqual(g.run("cpu.kind"), "tunki");
  assert.equal(g.nodes.get("abilityLabel").textContent, "APLASTAR");
});

test("Tunki's flower projectile spends energy once and damages the opponent once", () => {
  const g = game();
  g.run('startGame("tunki"); state = "playing"; player.x = 300; cpu.x = 520;');
  g.key("KeyL");
  assert.equal(g.run("player.power"), 5);
  g.tick(.21);
  assert.equal(g.run("projectiles[0].style"), "flowers");
  assert.equal(g.run("poseFor(player)"), 4);
  g.tick(.75);
  assert.equal(g.run("cpu.health"), afterPower(g));
  assert.equal(g.run("projectiles.length"), 0);
  assert.equal(g.run('attack(cpu, "slam")'), false);
});

test("Tunki's neutral jump does no damage; deliberate slam dives and hits once", () => {
  const g = game();
  g.run('startGame("tunki"); state = "playing"; player.x = 300; cpu.x = 410;');
  g.key("KeyW");
  g.tick(1.2);
  assert.equal(g.run("cpu.health"), 100);
  g.run("player.x = 300; cpu.x = 410;");
  g.key("KeyH");
  g.tick(.08);
  assert.equal(g.run("cpu.health"), 100);
  assert.equal(g.run("player.action"), "slam");
  g.tick(.2);
  assert.equal(g.run("player.grounded"), false);
  g.tick(1.1);
  assert.equal(g.run("cpu.health"), afterPower(g,1.4));
  assert.equal(g.run("player.grounded"), true);
  assert.equal(g.run("player.action"), "idle");
});

test("Tunki can trigger an airborne slam by touch, and Space freezes the descent", () => {
  const g = game();
  g.run('startGame("tunki"); state = "playing";');
  g.key("KeyW");
  g.tick(.22);
  g.taps[4].listeners.pointerdown({ pointerId: 4, preventDefault() {} });
  g.tick(.16);
  assert.equal(g.run("player.slamDiving"), true);
  g.key("Space");
  const y = g.run("player.y");
  g.tick(.5);
  assert.equal(g.run("player.y"), y);
  g.key("Space");
  g.tick(.7);
  assert.equal(g.run("player.grounded"), true);
  assert.equal(g.run("player.action"), "idle");
});

test("standing guard blocks a slam, crouch guard does not, and distance evades it", () => {
  for (const crouched of [false, true]) {
    const g = game();
    g.run('startGame("tunki"); state = "playing"; player.x = 300; cpu.x = 385; cpu.facing = -1; cpu.guarding = true; cpu.crouching = ' + crouched + ';');
    g.run('hit(cpu, 18, 290, -180, player, {sourceX: player.x, overhead: true});');
    assert.equal(g.run("cpu.health"), crouched ? afterHit(g,18) : 100);
  }
  const g = game();
  g.run('startGame("tunki"); state = "playing";');
  g.key("KeyH");
  g.tick(1.3);
  assert.equal(g.run("cpu.health"), 100);
});

test("phones keep a horizontal cabinet when portrait orientation cannot be locked", async () => {
  const g = game();
  g.run('navigator.maxTouchPoints = 5; window.innerWidth = 390; window.innerHeight = 844; syncViewport();');
  assert.ok(g.nodes.get("body").classList.contains("phone-portrait"));
  g.run('document.documentElement = {requestFullscreen: async () => {throw Error("unsupported")}}; window.screen = {orientation: {lock: async () => {throw Error("unsupported")}}};');
  await g.run("requestMobileLandscape()");
  assert.ok(g.nodes.get("body").classList.contains("phone-portrait"));
  g.run('window.innerWidth = 844; window.innerHeight = 390; syncViewport();');
  assert.equal(g.nodes.get("body").classList.contains("phone-portrait"), false);
  assert.equal(g.run("state"), "playing");
});

test("high-density rendering keeps game positions and Blotta's speech aligned", () => {
  const g = game();
  g.run('startGame("blotta"); canvas.clientWidth = 1200; window.devicePixelRatio = 2; syncViewport(); positionSpeech();');
  assert.equal(g.run("canvas.width"), 1920);
  assert.equal(g.run("canvas.height"), 1080);
  assert.equal(g.run("player.x"), 235);
  assert.ok(Math.abs(parseFloat(g.nodes.get("speechBubble").style.left) - 235 / 960 * 100) < .001);
  g.run("draw()");
});

test("Marechal can be selected with keyboard or touch and uses basic controls", () => {
  const g = game();
  g.run('openSelection(); chooseFighter("tunki", false);');
  g.key("ArrowRight");
  assert.equal(g.run("playerChoice"), "marechal");
  assert.equal(g.nodes.get("selectionName").textContent, "MARECHAL");
  g.key("Enter");
  g.key("Enter");
  assert.equal(g.run("player.kind"), "marechal");
  assert.notEqual(g.run("cpu.kind"), "marechal");
  assert.equal(g.nodes.get("abilityBtn").hidden, true);
  g.run('state = "playing";');
  g.key("KeyW");
  assert.equal(g.run("poseFor(player)"), 10);
  g.tick(1);
  assert.equal(g.run("cpu.health"), 100);
  g.key("KeyS");
  assert.equal(g.run("poseFor(player)"), 8);
  g.key("KeyI");
  assert.equal(g.run("player.guarding"), true);
  g.run('openSelection(); chooseFighter("sergio", false);');
  g.nodes.get("pick-marechal").listeners.click();
  g.nodes.get("confirmBtn").listeners.click();
  g.nodes.get("stageConfirmBtn").listeners.click();
  assert.equal(g.run("player.kind"), "marechal");
});

test("Marechal's hand lightning travels straight and spends power once on PC and touch", () => {
  for (const touch of [false, true]) {
    const g = game();
    g.run('startGame("marechal"); state = "playing"; player.x = 300; cpu.x = 580;');
    if (touch) g.taps[3].listeners.pointerdown({pointerId: 8, preventDefault() {}});
    else g.key("KeyL");
    assert.equal(g.run("player.power"), 5);
    g.tick(.21);
    assert.equal(g.run("projectiles[0].style"), "lightning");
    assert.equal(g.run("poseFor(player)"), 4);
    const y = g.run("projectiles[0].y");
    g.tick(.1);
    assert.equal(g.run("projectiles[0].y"), y);
    g.tick(.5);
    assert.equal(g.run("cpu.health"), afterPower(g));
    assert.equal(g.run("projectiles.length"), 0);
    assert.equal(g.run('attack(player, "special")'), false);
  }
});

test("Marechal's lightning can be blocked or ducked like other high projectiles", () => {
  for (const defense of ["guard", "crouch"]) {
    const g = game();
    g.run('startGame("marechal"); state = "playing"; player.x = 300; cpu.x = 520; cpu.facing = -1;');
    g.run(defense === "guard" ? 'cpu.guarding = true;' : 'cpu.crouching = true;');
    g.key("KeyL");
    g.tick(.8);
    assert.equal(g.run("cpu.health"), defense === "guard" ? afterHit(g,1) : 100);
  }
});

test("stance transitions interpolate, backward steps reverse, and attacks settle into rest", () => {
  for (const kind of ["sergio", "blotta", "tunki", "marechal", "facu", "flor", "galante", "padrino", "paula", "jairo"]) {
    const g = game();
    g.run('startGame("' + kind + '"); state = "playing";');
    g.key("KeyS");
    g.tick(1 / 120);
    assert.ok(g.run("player.animation.mix > 0 && player.animation.mix < 1"));
    assert.equal(g.run("player.animation.pose"), 8);
    g.tick(.1);
    assert.equal(g.run("player.animation.mix"), 1);
    g.key("KeyS", "keyup");
    g.run("player.walkPhase = 2;");
    g.key("KeyA");
    g.tick(.1);
    assert.ok(g.run("player.walkPhase < 2 && player.walkPhase >= 0"));
    g.key("KeyA", "keyup");
    g.tick(.3);
    g.key("KeyK");
    g.tick(.55);
    assert.notEqual(g.run("poseFor(player)"), g.run("POSES[player.kind].kick"));
    g.tick(.3);
    assert.equal(g.run("player.animation.pose"), 0);
    assert.equal(g.run("player.animation.mix"), 1);
    assert.ok(g.run("Object.values(player.animation.motion).every(Number.isFinite)"));
    const before = g.run("JSON.stringify([player.animation.motion, player.animation.mix, player.walkPhase])");
    g.key("Space");
    g.tick(.5);
    assert.equal(g.run("JSON.stringify([player.animation.motion, player.animation.mix, player.walkPhase])"), before);
  }
});

test("render interpolation blends transforms without advancing the simulation", () => {
  const g = game();
  g.key("KeyD");
  g.tick(.15);
  g.key("KeyW");
  g.tick(.05);
  g.run("renderAlpha = .5;");
  assert.ok(g.run("Math.abs(renderedFighter(player).x - (player.prevX + player.x) / 2) < 1e-9"));
  assert.ok(g.run("Math.abs(renderedFighter(player).motion.rotation - (player.animation.prevMotion.rotation + player.animation.motion.rotation) / 2) < 1e-9"));
  const snapshot = g.run("JSON.stringify([player.x, player.y, player.actionTime, player.animation])");
  g.run("draw(); draw(); draw();");
  assert.equal(g.run("JSON.stringify([player.x, player.y, player.actionTime, player.animation])"), snapshot);
});

test("round voice starts once per round, pauses, resumes from its offset and obeys mute", () => {
  const g = game();
  g.run(`
    var voiceLog = [];
    sfx = () => {};
    audioCtx = { state: "running", destination: {}, createBufferSource() {
      return {connect() {}, disconnect() {}, start(when, offset) {voiceLog.push({event: "start", offset});}, stop() {voiceLog.push({event: "stop"});}};
    }};
    ROUND_AUDIO[1].buffer = {duration: 4.272};
    muted = false;
    startGame("blotta");
  `);
  g.tick(1.05);
  assert.equal(g.run("voiceLog.length"), 0);
  g.tick(.35);
  assert.equal(g.run('voiceLog.filter(e => e.event === "start").length'), 1);
  assert.equal(g.nodes.get("announcement").textContent, "ROUND 1");
  g.tick(.3);
  g.key("Space");
  const offset = g.run("introElapsed - INTRO.voice");
  g.tick(.4);
  assert.equal(g.run("roundVoiceSource"), null);
  g.key("Space");
  assert.ok(Math.abs(g.run("voiceLog.at(-1).offset") - offset) < 1e-8);
  g.nodes.get("soundBtn").listeners.click();
  assert.equal(g.run("roundVoiceSource"), null);
  g.tick(.2);
  g.nodes.get("soundBtn").listeners.click();
  assert.ok(g.run("voiceLog.at(-1).offset") > offset);
  g.tick(1.45);
  assert.equal(g.nodes.get("announcement").textContent, "¡PELEA!");
  g.tick(.7);
  assert.equal(g.run("state"), "playing");
  assert.equal(g.run("roundVoiceSource"), null);
  const starts = g.run('voiceLog.filter(e => e.event === "start").length');
  g.run('startGame("marechal");');
  g.tick(1.4);
  assert.equal(g.run('voiceLog.filter(e => e.event === "start").length'), starts + 1);
  assert.ok(g.run("voiceLog.at(-1).offset < STEP * 1.1"));
});

test("stage selection follows the fighter screen and supports keyboard, touch and back", () => {
  const g = game();
  g.run('openSelection(); chooseFighter("marechal", false);');
  g.key("Enter");
  assert.equal(g.run("state"), "stage");
  assert.equal(g.nodes.get("selectScreen").classList.contains("active"), false);
  assert.ok(g.nodes.get("stageScreen").classList.contains("active"));
  g.key("ArrowRight");
  assert.equal(g.run("stageChoice"), "mine");
  g.key("Escape");
  assert.equal(g.run("state"), "select");
  assert.equal(g.run("playerChoice"), "marechal");
  g.nodes.get("confirmBtn").listeners.click();
  g.nodes.get("stage-newmont").listeners.click();
  assert.equal(g.nodes.get("stagePreview").src, "assets/stage-plant-v2.webp");
  g.nodes.get("stageConfirmBtn").listeners.click();
  assert.equal(g.run("state"), "intro");
  assert.equal(g.run("player.kind"), "marechal");
  assert.equal(g.run("stageChoice"), "newmont");
  assert.equal(g.nodes.get("stageScreen").classList.contains("active"), false);
  assert.ok(g.nodes.get("gameScreen").classList.contains("active"));
});

test("two wins end the match 2–0 and show registration before another game", () => {
  const g = game();
  g.run('chooseStage("mine", false); startGame("sergio", "blotta"); state = "playing";');
  g.key("KeyD");
  g.run('cpu.health = 1; hit(cpu, 10, 100, 0, player);');
  assert.equal(g.run("state"), "roundOver");
  assert.equal(g.run("match.playerWins"), 1);
  assert.ok(g.nodes.get("left-round-0").classList.contains("won"));
  g.key("KeyJ");
  assert.equal(g.run("player.queuedAction"), null);
  g.tick(2.7);
  assert.equal(g.run("state"), "intro");
  assert.equal(g.run("match.round"), 2);
  assert.equal(g.run("cpu.kind"), "blotta");
  assert.equal(g.run("stageChoice"), "mine");
  assert.equal(g.run("player.health + cpu.health"), 200);
  assert.equal(g.run("player.power + cpu.power"), 80);
  assert.equal(g.run("roundTime"), 60);
  assert.equal(g.run("player.x"), 235);
  assert.equal(g.run("cpu.x"), 725);
  assert.equal(g.run("held.right"), false);
  assert.equal(g.run("projectiles.length + effects.length + afterimages.length"), 0);
  g.tick(g.run("ROUND_AUDIO[match.round].timing.end") + .05);
  g.run('cpu.health = 1; hit(cpu, 10, 100, 0, player);');
  assert.equal(g.run("state"), "finished");
  assert.equal(g.run("match.playerWins"), 2);
  g.tick(3);
  assert.equal(g.run("match.round"), 2);
  assert.equal(g.nodes.get("resultPanel").hidden, false);
  assert.equal(g.nodes.get("resultKicker").textContent, "GAME OVER");
  assert.equal(g.nodes.get("winnerForm").hidden, false);
  g.run('startGame(playerChoice, cpu.kind);');
  assert.equal(g.run("match.round"), 1);
  assert.equal(g.run("match.playerWins + match.cpuWins"), 0);
  assert.equal(g.run("cpu.kind"), "blotta");
  assert.equal(g.run("stageChoice"), "mine");
});

test("a split score reaches round three and the CPU can win the match 2–1", () => {
  const g = game();
  g.run('finishRound(player, "K.O.");');
  g.tick(5.5);
  g.run('finishRound(cpu, "K.O.");');
  assert.equal(g.run("match.playerWins"), 1);
  assert.equal(g.run("match.cpuWins"), 1);
  g.tick(2.7);
  assert.equal(g.run("match.round"), 3);
  g.tick(g.run("ROUND_AUDIO[match.round].timing.end") + .05);
  g.run('finishRound(cpu, "K.O.");');
  assert.equal(g.run("state"), "finished");
  assert.equal(g.run("match.cpuWins"), 2);
  g.tick(3);
  assert.equal(g.run("match.round"), 3);
});

test("timeout awards the healthier fighter and ties replay without awarding a win", () => {
  const g = game();
  g.run("roundTime = STEP; player.health = 40; cpu.health = 25;");
  g.tick(1 / 120);
  assert.equal(g.run("match.playerWins"), 1);
  g.tick(5.5);
  g.run("roundTime = STEP; player.health = cpu.health = 40;");
  g.tick(1 / 120);
  assert.equal(g.run("match.playerWins + match.cpuWins"), 1);
  assert.equal(g.run("match.repeat"), true);
  g.tick(2.7);
  assert.equal(g.run("match.round"), 2);
  assert.equal(g.run("player.health + cpu.health"), 200);
});

test("simultaneous lethal hits draw the round and pause freezes the interval", () => {
  const g = game();
  g.run('player.x = 300; cpu.x = 355; player.health = cpu.health = 1; attack(player, "punch"); attack(cpu, "punch");');
  g.tick(.12);
  assert.equal(g.run("player.health + cpu.health"), 0);
  assert.equal(g.run("match.playerWins + match.cpuWins"), 0);
  assert.equal(g.run("state"), "roundOver");
  g.key("Space");
  const snapshot = g.run("JSON.stringify([resultElapsed, match, effects])");
  g.tick(4);
  assert.equal(g.run("JSON.stringify([resultElapsed, match, effects])"), snapshot);
  g.key("Space");
  g.tick(2.7);
  assert.equal(g.run("state"), "intro");
  assert.equal(g.run("match.round"), 1);
});

test("all fighters jump higher, remain in view and land without dealing automatic damage", () => {
  for (const kind of ["sergio", "blotta", "tunki", "marechal", "facu", "flor", "galante", "padrino", "paula", "jairo"]) {
    const g = game();
    g.run('startGame("' + kind + '"); state = "playing"; var minY = FLOOR;');
    g.key("KeyW");
    g.run("for (let i=0; i<160; i++) { update(STEP); minY = Math.min(minY, player.y); }");
    const ratio = g.run("(FLOOR - minY) / (stats[player.kind].jump ** 2 / 3300)");
    assert.ok(ratio > 1.5 && ratio < 1.6, kind + ": " + ratio);
    assert.ok(g.run("minY - stats[player.kind].height * FIGHTER_SCALE > 70"));
    assert.equal(g.run("player.grounded"), true);
    assert.equal(g.run("cpu.health"), 100);
  }
});

test("each round uses its own recording and the decider displays FINAL ROUND", () => {
  const g = game();
  g.run(`
    var voices = [];
    sfx = () => {};
    audioCtx = {state: "running", destination: {}, createBufferSource() {
      return {connect() {}, disconnect() {}, start() {voices.push(this.buffer.id);}, stop() {}};
    }};
    muted = false;
    ROUND_AUDIO[1].buffer = {duration: 2.691, id: 1};
    ROUND_AUDIO[2].buffer = {duration: 2.377, id: 2};
    ROUND_AUDIO[3].buffer = {duration: 2.586, id: 3};
    startGame("sergio");
  `);
  g.tick(4);
  assert.equal(g.run("voices.join(',')"), "1");
  g.run('finishRound(player, "K.O.");');
  g.tick(5.5);
  assert.equal(g.run("voices.join(',')"), "1,2");
  g.run('finishRound(cpu, "K.O.");');
  g.tick(3.3);
  assert.equal(g.run("match.round"), 3);
  assert.equal(g.run("voices.join(',')"), "1,2,3");
  assert.equal(g.nodes.get("announcement").textContent, "FINAL ROUND");
  assert.match(g.nodes.get("roundLabel").textContent, /^FINAL ROUND/);
});

test("round titles and FIGHT follow each recording's speech cues, including after pause", () => {
  for (const round of [1, 2, 3]) {
    const g = game();
    g.run("match.round = " + round + "; startRound();");
    const timing = g.run("ROUND_AUDIO[match.round].timing");
    const title = g.run("ROUND_AUDIO[match.round].title");
    g.tick(timing.title - .02);
    assert.equal(g.nodes.get("announcement").classList.contains("show"), false);
    g.tick(.04);
    assert.equal(g.nodes.get("announcement").textContent, title);
    g.key("Space");
    g.tick(.5);
    g.key("Space");
    assert.equal(g.nodes.get("announcement").textContent, title);
    g.tick(timing.fight - g.run("introElapsed") - .02);
    assert.notEqual(g.nodes.get("announcement").textContent, "¡PELEA!");
    g.tick(.04);
    assert.equal(g.nodes.get("announcement").textContent, "¡PELEA!");
    assert.equal(g.run("state"), "intro");
    g.tick(timing.end - g.run("introElapsed") + .02);
    assert.equal(g.run("state"), "playing");
  }
});

test("automatic round changes preserve the render clock within a fixed-step frame", () => {
  const g = game();
  g.run('finishRound(player, "K.O."); resultElapsed = 2.645; loop(20);');
  assert.equal(g.run("state"), "intro");
  assert.equal(g.run("match.round"), 2);
  assert.ok(g.run("accumulator >= 0 && accumulator < STEP"));
  assert.ok(g.run("renderAlpha >= 0 && renderAlpha <= 1"));
});

function enableCombatAudio(g) {
  g.run(`
    var combatLog = [];
    sfx = () => {};
    audioCtx = { state: "running", destination: {},
      createGain() { return { gain: {value: 1}, connect() { return this; }, disconnect() {} }; },
      createBufferSource() {
        return { connect() { return this; }, disconnect() {},
          start(when, offset) { combatLog.push({event: "start", name: this.buffer.name, offset, source: this}); },
          stop() { combatLog.push({event: "stop", name: this.buffer.name, source: this}); }
        };
      }
    };
    Object.entries(COMBAT_AUDIO).forEach(([name, cue]) => { cue.buffer = {name, duration: 3}; });
    muted = false;
  `);
}

test("all four fighters uppercut with down+punch on keyboard and touch, launch once and return to crouch", () => {
  for (const kind of ["sergio", "blotta", "tunki", "marechal", "facu", "flor", "galante", "padrino", "paula", "jairo"]) {
    for (const input of ["keyboard", "touch"]) {
      const g = game();
      g.run(`startGame('${kind}', '${kind === "blotta" ? "marechal" : "blotta"}'); state = "playing"; player.x = 300; cpu.x = 370;`);
      if (input === "keyboard") { g.key("KeyS"); g.key("KeyJ"); }
      else {
        g.holds[2].listeners.pointerdown({pointerId: 1, pointerType: "touch", preventDefault() {}});
        g.taps[1].listeners.pointerdown({pointerId: 2, pointerType: "touch", preventDefault() {}});
      }
      assert.equal(g.run("player.action"), "uppercut");
      assert.equal(g.run("player.power"), 40);
      g.tick(.075);
      assert.equal(g.run("cpu.health"), 100);
      assert.equal(g.run("poseFor(player)"), 12);
      g.tick(.08);
      assert.equal(g.run("cpu.health"), afterNormal(g,5));
      assert.ok(g.run("cpu.vy < 0 && !cpu.grounded"));
      g.tick(.8);
      assert.equal(g.run("cpu.health"), afterNormal(g,5));
      assert.equal(g.run("player.action"), "idle");
      assert.equal(g.run("poseFor(player)"), 8);
    }
  }
});

test("uppercut can catch an airborne rival, respects front guard, and is not an automatic jump attack", () => {
  const g = game();
  g.run('player.x = 300; cpu.x = 370; cpu.y = FLOOR - 180; cpu.grounded = false;');
  g.key("ArrowDown"); g.key("KeyJ");
  g.run('player.actionTime = player.actionDuration - MOVES.uppercut.startup - MOVES.uppercut.active * .8;');
  assert.ok(g.run("attackContact(player, cpu) !== null"));
  for (const down of [false, true]) {
    const h = game();
    h.run(`player.x = 300; cpu.x = 370; cpu.facing = -1; cpu.guarding = true; cpu.crouching = ${down};`);
    h.key("KeyS"); h.key("KeyJ"); h.tick(.25);
    assert.equal(h.run("cpu.health"), 100);
    assert.equal(h.run("cpu.grounded"), true);
  }
  g.run('startGame("sergio"); state = "playing";');
  g.key("KeyW"); g.key("KeyS"); g.key("KeyJ");
  assert.equal(g.run("player.action"), "punch");
});

test("melee voices use each supplied clip, skip initial silence and stop on whiff recovery", () => {
  for (const [kind, input, crouch, sound] of [
    ["sergio", "KeyJ", false, "belly"], ["sergio", "KeyJ", true, "general"],
    ["blotta", "KeyJ", false, "general"], ["tunki", "KeyJ", false, "general"],
    ["marechal", "KeyJ", false, "general"], ["sergio", "KeyK", false, "general"]
  ]) {
    const g = game();
    g.run(`startGame('${kind}'); state = "playing";`);
    enableCombatAudio(g);
    if (crouch) g.key("KeyS");
    g.key(input);
    assert.equal(g.run("combatLog[0].name"), sound);
    assert.equal(g.run("combatLog[0].offset"), g.run(`COMBAT_AUDIO.${sound}.start`));
    assert.equal(g.run("combatSounds.size"), 1);
    g.tick(.8);
    assert.equal(g.run("combatSounds.size"), 0);
    assert.equal(g.run('combatLog.filter(e => e.event === "stop").length'), 1);
  }
});

test("blocking and interrupted melee stop the owning sound immediately", () => {
  const g = game(); enableCombatAudio(g);
  g.run('player.x = 300; cpu.x = 370; cpu.facing = -1; cpu.guarding = true;');
  g.key("KeyJ"); g.tick(.12);
  assert.equal(g.run("cpu.health"), 100);
  assert.equal(g.run("combatSounds.size"), 0);
  assert.equal(g.run("player.attackSound"), null);
  const h = game(); enableCombatAudio(h);
  h.key("KeyJ");
  h.run('hit(player, 8, -150, 0, cpu);');
  assert.equal(h.run("player.action"), "hit");
  assert.equal(h.run("combatSounds.size"), 0);
});

test("power audio begins during execution, continues after casting, and stops on collision or block", () => {
  for (const kind of ["sergio", "marechal"]) {
    for (const block of [false, true]) {
      const g = game();
      g.run(`startGame('${kind}', 'blotta'); state = "playing"; player.x = 100; cpu.x = 750; cpu.facing = -1; cpu.guarding = ${block};`);
      enableCombatAudio(g);
      g.key("KeyL");
      assert.equal(g.run("combatLog.length"), 1);
      assert.equal(g.run("projectiles.length"), 0);
      g.tick(.15);
      g.tick(.4);
      assert.equal(g.run("player.action"), "idle");
      assert.equal(g.run("combatSounds.size"), 1);
      assert.equal(g.run("combatLog[0].name"), kind === "sergio" ? "meat" : "lightning");
      g.tick(1.4);
      assert.equal(g.run("projectiles.length"), 0);
      assert.equal(g.run("combatSounds.size"), 0);
      assert.equal(g.run("cpu.health"), block ? afterHit(g,1) : kind === "sergio" ? afterHit(g,10) : afterPower(g));
    }
  }
});

test("projectile sound ends at either stage edge, expiry or floor and voices remain independent", () => {
  for (const direction of [-1, 1]) {
    const g = game(); enableCombatAudio(g);
    g.run(`player.facing = ${direction}; spawnProjectile(player, 'lightning'); projectiles[0].x = ${direction > 0 ? 1125 : -165};`);
    g.tick(1 / 120);
    assert.equal(g.run("projectiles.length"), 0);
    assert.equal(g.run("combatSounds.size"), 0);
  }
  const g = game(); enableCombatAudio(g);
  g.run('spawnProjectile(player, "lightning"); spawnProjectile(player, "meat"); projectiles[0].life = 0;');
  g.tick(1 / 120);
  assert.equal(g.run("projectiles.length"), 1);
  assert.equal(g.run("combatSounds.size"), 1);
  assert.equal(g.run("[...combatSounds][0].name"), "meat");
  assert.ok(g.run("[...combatSounds][0].source !== null"));
  g.run('projectiles[0].y = FLOOR;'); g.tick(1 / 120);
  assert.equal(g.run("combatSounds.size"), 0);
});

test("combat voices freeze on pause/blur and resume from the correct position after mute", () => {
  const g = game(); enableCombatAudio(g);
  g.run('spawnProjectile(player, "lightning"); cpu.crouching = true;');
  g.tick(.2);
  const elapsed = g.run("projectiles[0].sound.elapsed");
  g.key("Space"); g.tick(1);
  assert.equal(g.run("projectiles[0].sound.elapsed"), elapsed);
  assert.equal(g.run("projectiles[0].sound.source"), null);
  g.key("Space");
  assert.ok(Math.abs(g.run("combatLog.at(-1).offset") - elapsed - .035) < 1e-8);
  g.nodes.get("soundBtn").listeners.click();
  assert.equal(g.run("projectiles[0].sound.source"), null);
  g.tick(.15);
  g.nodes.get("soundBtn").listeners.click();
  assert.ok(g.run("combatLog.at(-1).offset") > elapsed + .17);
  g.nodes.get("window").listeners.blur();
  assert.equal(g.run("state"), "paused");
  assert.equal(g.run("projectiles[0].sound.source"), null);
  g.key("Space"); g.tick(2);
  assert.equal(g.run("combatSounds.size"), 0);
});

test("round end and selection clear all combat voices and late audio cannot revive old attacks", () => {
  const g = game(); enableCombatAudio(g);
  g.run('spawnProjectile(player, "meat"); attack(cpu, "kick"); finishRound(player, "K.O.");');
  assert.equal(g.run("combatSounds.size"), 0);
  g.run('startRound(); state = "playing"; spawnProjectile(player, "lightning"); openSelection();');
  assert.equal(g.run("combatSounds.size"), 0);
  g.run('startGame("blotta"); state = "playing"; COMBAT_AUDIO.general.buffer = null;');
  g.key("KeyJ"); g.tick(.5);
  const count = g.run("combatLog.length");
  g.run('COMBAT_AUDIO.general.buffer = {name: "general", duration: 1}; syncCombatSounds();');
  assert.equal(g.run("combatLog.length"), count);
});

test('mode selection requires both human picks, allows mirror matches and disables CPU AI', () => {
  const g=game(); g.run('openModeSelection()'); assert.equal(g.run('state'),'mode');
  g.run('startMode("versus"); chooseFighter("marechal",false); confirmFighter()');
  assert.equal(g.run('selectionPlayer'),2); assert.equal(g.run('state'),'select');
  g.run('chooseFighter("marechal",false); confirmFighter()'); assert.equal(g.run('state'),'stage');
  g.run('startGame(playerChoice); state="playing"; aiEnabled=true');
  assert.equal(g.run('cpu.kind'),'marechal');
  const x=g.run('cpu.x'); g.tick(1); assert.equal(g.run('cpu.x'),x); assert.equal(g.run('cpu.action'),'idle');
  g.key('KeyD'); g.key('ArrowLeft'); g.tick(.2);
  assert.ok(g.run('player.vx>0 && cpu.vx<0'));
  g.key('KeyJ'); g.key('Digit8'); assert.equal(g.run('player.action'),'punch'); assert.equal(g.run('cpu.action'),'kick');
});

test('both phone players hold and attack simultaneously with independent pointer cancellation', () => {
  const g=game(); g.run('gameMode="versus"');
  const ev=id=>({pointerId:id,pointerType:'touch',preventDefault(){}});
  g.holds[2].listeners.pointerdown(ev(1)); g.holds2[2].listeners.pointerdown(ev(2));
  g.taps[1].listeners.pointerdown(ev(3)); g.taps2[1].listeners.pointerdown(ev(4));
  assert.equal(g.run('player.action'),'uppercut'); assert.equal(g.run('cpu.action'),'uppercut');
  g.holds[2].listeners.pointercancel(ev(1));
  assert.equal(g.run('held.down'),false); assert.equal(g.run('held2.down'),true);
  g.key('Space'); const snapshot=g.run('JSON.stringify([player,cpu,projectiles,roundTime,stageTime])');
  g.tick(2); g.taps2[3].listeners.pointerdown(ev(5));
  assert.equal(g.run('JSON.stringify([player,cpu,projectiles,roundTime,stageTime])'),snapshot);
  assert.equal(g.nodes.get('pauseMenu').hidden,false);
  g.nodes.get('quitBtn').listeners.click(); assert.equal(g.run('state'),'title'); assert.equal(g.run('projectiles.length'),0);
  assert.equal(g.nodes.get('pauseMenu').hidden,true);
});

test('score rewards actual damage, survives rounds and registers the second player winner', async () => {
  const g=game(); g.run('gameMode="versus"; hit(player,10,-10,0,cpu,{sourceX:cpu.x})');
  assert.equal(g.run('match.scores[1]'),Math.round((100-afterHit(g,10,'player'))*10)); assert.equal(g.run('match.scores[0]'),0);
  g.run('finishRound(cpu,"K.O.")'); const score=g.run('match.scores[1]'); g.tick(2.8);
  assert.equal(g.run('match.scores[1]'),score); assert.notEqual(g.nodes.get('resultKicker').textContent,'GAME OVER');
  g.run('state="playing"; finishRound(cpu,"K.O.")'); g.tick(2.3);
  assert.equal(g.nodes.get('resultKicker').textContent,'GAME OVER'); assert.equal(g.nodes.get('winnerForm').hidden,false);
  let posted; g.sandbox.fetch=async (url,options)=>{
    if(options.method==='POST') { posted=JSON.parse(options.body); return {ok:true,json:async()=>({})}; }
    return {ok:true,json:async()=>url.includes('?after=')?{entries:[{id:'older',name:'Otro',score:1,createdAt:1,mode:'solo'}],next:null}:{entries:[{...posted,createdAt:2}],next:'page2'}};
  };
  g.nodes.get('winnerName').value=' Seba  2 '; await g.run('saveWinner({preventDefault(){}})');
  assert.equal(posted.name,'Seba 2'); assert.equal(posted.score,g.run('match.scores[1]'));
  assert.equal(posted.character,g.run('cpu.kind')); assert.equal(g.run('state'),'ranking');
  assert.equal(g.nodes.get('rankingRows').children.length,2);
  assert.equal(g.nodes.get('rankingRows').children[0].children[2].children[0].textContent,'Seba 2');
});

test('failed ranking save preserves name and can retry once without duplicated submission', async () => {
  const g=game(); g.run('match.playerWins=1; finishRound(player,"K.O.")'); g.tick(2.3);
  g.nodes.get('winnerName').value='<Seba>';
  g.sandbox.fetch=async()=>{throw new Error('offline')}; await g.run('saveWinner({preventDefault(){}})');
  assert.equal(g.nodes.get('winnerName').value,'<Seba>'); assert.equal(g.run('match.saved'),false);
  let submissions=0;
  g.sandbox.fetch=async(url,options)=>{if(options.method==='POST') submissions++;return {ok:true,json:async()=>({entries:[],next:null})}};
  await Promise.all([g.run('saveWinner({preventDefault(){}})'),g.run('saveWinner({preventDefault(){}})')]);
  assert.equal(submissions,1); assert.equal(g.run('state'),'ranking');
});

test('point-blank powers start during casting and retain an audible transient through immediate impact', () => {
  for(const kind of ['marechal','sergio','tunki']) {
    const g=game(); enableCombatAudio(g);
    g.run(`startGame('${kind}','blotta'); state='playing'; audioCtx.currentTime=0; player.x=300; cpu.x=360; attack(player,'special')`);
    assert.equal(g.run('combatLog.filter(e=>e.event==="start").length'),1);
    g.tick(.3); assert.ok(g.run('cpu.health<100')); assert.equal(g.run('projectiles.length'),0);
    assert.equal(g.run('soundTails.size'),1);
    g.key('Space'); assert.equal(g.run('soundTails.size'),0);
  }
});

test('selection music loops through stages and fight music survives rounds, pauses and stops at match end', () => {
  const g=game(); enableCombatAudio(g);
  g.run(`audioCtx.currentTime=0; EXTRA_AUDIO.selection.buffer={name:'selection',duration:20}; EXTRA_AUDIO.music.forEach((m,i)=>m.buffer={name:'fight'+i,duration:120}); startMode('solo')`);
  assert.equal(g.run('musicSource.loop'),true); assert.equal(g.run('musicTrack.usage'),'selection');
  const source=g.run('musicSource'); g.run('confirmFighter()'); assert.equal(g.run('musicSource'),source);
  g.run('startGame(playerChoice); state="playing"'); assert.equal(g.run('musicTrack.usage'),'fight');
  g.run('audioCtx.currentTime=4; togglePause()'); assert.equal(g.run('musicSource'),null); assert.equal(g.run('musicElapsed'),4);
  g.run('audioCtx.currentTime=40; togglePause()'); assert.equal(g.run('combatLog.at(-1).offset'),4);
  const fight=g.run('musicSource'); g.run('finishRound(player,"K.O.")'); assert.equal(g.run('musicSource'),fight);
  g.run('state="playing"; finishRound(player,"K.O.")'); assert.equal(g.run('musicSource'),null);
});


test('ranking uses arcade positions and score-before-name without truncating names', async () => {
  const g=game();
  assert.equal(g.run('[1,2,3,4,11,12,13,21,22,23,111].map(rankingPosition).join(",")'),'1ST,2ND,3RD,4TH,11TH,12TH,13TH,21ST,22ND,23RD,111TH');
  g.sandbox.fetch=async()=>({ok:true,json:async()=>({entries:[{id:'entry1',name:'Sebastián completo',score:50000,createdAt:1}],next:null})});
  await g.run('showRanking()');
  const cells=g.nodes.get('rankingRows').children[0].children;
  assert.equal(cells.length,3);
  assert.equal(cells[0].children[0].textContent,'1ST');
  assert.equal(cells[1].children[0].textContent,'50000');
  assert.equal(cells[2].children[0].textContent,'Sebastián completo');
  assert.ok(cells[2].classList.contains('long-name'));
});

test('CPU uses a low kick against standing guard and a longer kick outside punch reach', () => {
  const g=game();
  g.run('startGame("flor","sergio");state="playing";Math.random=()=>.5; player.x=300; cpu.x=375; player.guarding=true; aiClock=0; updateAI(STEP)');
  assert.equal(g.run('cpu.action'),'kick'); assert.equal(g.run('cpu.lowAttack'),true);
  const h=game();
  h.run('startGame("flor","sergio");state="playing";Math.random=()=>.2; player.x=300; cpu.x=405; aiClock=0; updateAI(STEP)');
  assert.equal(h.run('cpu.action'),'kick');
  assert.equal(h.run('cpu.health'),100); assert.equal(h.run('MOVES.kick.damage'),4);
});


test('all damaging powers exceed every normal melee attack', () => {
  const g=game();
  const maxNormal=g.run('Math.max(MOVES.punch.damage,MOVES.kick.damage,MOVES.lowKick.damage,MOVES.uppercut.damage)');
  for(const style of ['ki','lightning','flowers','bottle','meat']) {
    g.run('spawnProjectile(player,'+JSON.stringify(style)+')');
    assert.ok(g.run('projectiles.at(-1).damage')>maxNormal,style);
  }
  assert.ok(g.run('MOVES.slam.damage')>maxNormal);
});

test('Facu can be selected by either player, including mirror matches',()=>{
 const g=game();g.run('startMode("versus"); chooseFighter("facu",false); confirmFighter(); chooseFighter("facu",false); confirmFighter(); startGame(playerChoice); state="playing"');
 assert.equal(g.run('player.kind+":"+cpu.kind'),'facu:facu');
 g.key('KeyL');g.key('Digit9');g.tick(.22);
 assert.equal(g.run('projectiles.length'),2);assert.ok(g.run('player.mustacheAway && cpu.mustacheAway'));
});

test('Facu throws once, visibly loses his mustache and catches it after moving and jumping',()=>{
 const g=game();g.run('startGame("facu","sergio"); state="playing"; player.x=200; cpu.x=880');enableCombatAudio(g);
 const withMustache=g.run('spriteFrame(renderedFighter(player))');g.key('KeyL');
 assert.equal(g.run('combatLog.filter(e=>e.event==="start" && e.name==="boomerang").length'),1);
 g.tick(.23);assert.equal(g.run('player.mustacheAway'),true);
 assert.notEqual(g.run('spriteFrame(renderedFighter(player))'),withMustache);
 g.tick(.3);g.run('player.power=100; player.specialCooldown=0');
 assert.equal(g.run('attack(player,"special")'),false);assert.equal(g.run('player.power'),100);
 g.key('KeyA');g.key('KeyW');g.tick(3.8);
 assert.equal(g.run('player.mustacheAway'),false);assert.equal(g.run('projectiles.length'),0);
 assert.equal(g.run('combatSounds.size'),0);
});

test('boomerang returns on close hit or block, deals damage once and survives pause correctly',()=>{
 for(const guarded of [false,true]){
  const g=game();g.run('startGame("facu","blotta"); state="playing"; player.x=300; cpu.x=369; cpu.facing=-1');
  if(guarded)g.run('cpu.guardTime=2; cpu.guarding=true');
  g.key('KeyL');g.tick(.34);
  assert.equal(g.run('cpu.health'),guarded?afterHit(g,1):afterPower(g));
  g.key('Space');const snapshot=g.run('JSON.stringify([projectiles.map(p=>[p.x,p.y,p.age,p.returning]),player.mustacheAway,roundTime])');
  g.tick(1);assert.equal(g.run('JSON.stringify([projectiles.map(p=>[p.x,p.y,p.age,p.returning]),player.mustacheAway,roundTime])'),snapshot);
  g.key('Space');g.tick(1.5);assert.equal(g.run('cpu.health'),guarded?afterHit(g,1):afterPower(g));assert.equal(g.run('player.mustacheAway'),false);
 }
});

test('Facu recovers the mustache at either edge and clears it on KO and exit',()=>{
 for(const x of [-125,1085]){
  const g=game();g.run(`startGame('facu','blotta');state='playing'; player.x=${x}; cpu.x=${x<480?200:760}; player.facing=${x<480?-1:1}; spawnProjectile(player,'boomerang')`);
  g.tick(.5);assert.equal(g.run('projectiles.length'),0);assert.equal(g.run('player.mustacheAway'),false);
 }
 const g=game();g.run('startGame("facu","blotta");state="playing";spawnProjectile(player,"boomerang");finishRound(player,"K.O.")');
 assert.equal(g.run('player.mustacheAway'),false);assert.equal(g.run('projectiles.length'),0);
 g.run('mainMenu()');assert.equal(g.run('combatSounds.size'),0);
});

test('Flor is selectable by both players and hockey works on touch with pause and cleanup',()=>{
 const g=game();g.run('startMode("versus");chooseFighter("flor",false);confirmFighter();chooseFighter("flor",false);confirmFighter();startGame(playerChoice);state="playing";player.x=180;cpu.x=800');
 assert.equal(g.run('player.kind+":"+cpu.kind'),'flor:flor');
 enableCombatAudio(g);g.key('KeyL');g.key('Digit9');g.tick(.23);
 assert.equal(g.run('projectiles.filter(p=>p.style==="hockey").length'),2);
 assert.equal(g.run('combatLog.filter(e=>e.event==="start"&&e.name==="hockey").length'),2);
 g.key('Space');const before=g.run('JSON.stringify(projectiles.map(p=>[p.x,p.y,p.life]))');g.tick(.5);
 assert.equal(g.run('JSON.stringify(projectiles.map(p=>[p.x,p.y,p.life]))'),before);
 g.key('Space');g.tick(2);assert.equal(g.run('projectiles.length'),0);assert.equal(g.run('combatSounds.size'),0);
});
test('Flor hockey deals special damage once, blocks and starts audio at point blank',()=>{
 for(const guard of [false,true]){
  const g=game();g.run('startGame("flor","blotta");state="playing";player.x=300;cpu.x=360;cpu.facing=-1');enableCombatAudio(g);
  if(guard)g.run('cpu.guardTime=2;cpu.guarding=true');
  g.key('KeyL');assert.equal(g.run('combatLog.filter(e=>e.event==="start"&&e.name==="hockey").length'),1);
  g.tick(.5);assert.equal(g.run('cpu.health'),guard?afterHit(g,1):afterPower(g));assert.equal(g.run('projectiles.length'),0);
 }
 const g=game();g.run('startGame("flor","sergio");state="playing";player.x=200;cpu.x=800');
 g.taps[3].listeners.pointerdown({pointerId:44,preventDefault(){}});g.tick(.23);
 assert.equal(g.run('projectiles[0].style'),'hockey');assert.ok(g.run('stats.flor.height < stats.facu.height'));
});

test('free roll escapes both corners through rivals, costs no power, pauses and cannot attack while rolling',()=>{
 for(const x of [55,905]){
  const g=game();g.run(`startGame('flor','sergio');state='playing';player.x=${x};cpu.x=${x<480?110:850};player.power=0;player.specialCooldown=5`);
  g.key('KeyO');assert.equal(g.run('player.action'),'roll');assert.equal(g.run('player.power'),0);
  const hp=g.run('player.health');g.run('hit(player,20,100,0,cpu)');assert.equal(g.run('player.health'),hp);
  g.tick(.1);g.key('Space');const before=g.run('JSON.stringify([player.x,player.actionTime,player.animation.motion])');g.tick(1);
  assert.equal(g.run('JSON.stringify([player.x,player.actionTime,player.animation.motion])'),before);
  g.key('Space');g.key('KeyJ');assert.equal(g.run('player.action'),'roll');g.tick(.42);
  assert.ok(g.run(x<480?'player.x>cpu.x':'player.x<cpu.x'));assert.equal(g.run('cpu.health'),100);
  g.run('player.queuedAction=null;player.action="idle";player.actionTime=0');assert.equal(g.run('evade(player)'),true);
 }
});
test('both touch players evade independently and Blotta smoke ignores power cooldown',()=>{
 const g=game();g.run('gameMode="versus";startGame("sergio","blotta");state="playing";player.power=cpu.power=0;cpu.specialCooldown=5');
 const e={pointerId:1,preventDefault(){}};g.taps[5].listeners.pointerdown(e);g.taps2[5].listeners.pointerdown({...e,pointerId:2});
 assert.equal(g.run('player.action'),'roll');assert.equal(g.run('cpu.action'),'teleport');assert.equal(g.run('cpu.power'),0);
 g.tick(.72);assert.equal(g.run('evade(cpu)'),true);assert.equal(g.run('cpu.action'),'teleport');
 g.run('mainMenu()');assert.equal(g.run('fighters.length'),0);assert.equal(g.run('campaign'),null);
});
test('solo tournament visits every different rival, grows difficulty and carries score to its final GAME OVER',()=>{
 const g=game();g.run('gameMode="solo";playerChoice="flor";beginGame()');const seen=[];let score=0;let previousReaction=1;
 for(let i=0;i<9;i++){
  seen.push(g.run('cpu.kind'));assert.notEqual(seen[i],'flor');assert.equal(g.run('campaign.index'),i);
  assert.ok(g.run('difficulty().reaction')<previousReaction);previousReaction=g.run('difficulty().reaction');
  assert.equal(g.run('match.scores[0]'),score);
  g.run('state="playing";match.playerWins=1;finishRound(player,"K.O.")');score=g.run('match.scores[0]');
  assert.ok(score>0);
  if(i<8){g.tick(.9);assert.notEqual(g.nodes.get('resultKicker').textContent,'GAME OVER');g.key('Space');g.tick(3);assert.equal(g.run('campaign.index'),i);g.key('Space');g.tick(1.9);assert.equal(g.run('state'),'intro');}
 }
 assert.equal(new Set(seen).size,9);g.tick(2.3);assert.equal(g.nodes.get('resultKicker').textContent,'GAME OVER');
 assert.equal(g.run('campaign.completed'),true);assert.equal(g.nodes.get('winnerForm').hidden,false);
 assert.equal(g.run('campaign.score'),score);
});
test('a defeated solo player can record accumulated progress and automatically sees the global ranking',async()=>{
 const g=game();g.run('gameMode="solo";playerChoice="facu";beginGame();state="playing";addScore(player,100);match.playerWins=1;finishRound(player,"K.O.")');g.tick(2.8);
 const carried=g.run('match.scores[0]');g.run('state="playing";addScore(player,100)');assert.equal(g.run('match.scores[0]'),carried+125);
 g.run('match.cpuWins=1;finishRound(cpu,"K.O.")');g.tick(4);assert.equal(g.run('state'),'finished');assert.equal(g.nodes.get('winnerForm').hidden,false);
 let posted;g.sandbox.fetch=async(url,options)=>{if(options.method==='POST'){posted=JSON.parse(options.body);return {ok:true,json:async()=>({})};}return {ok:true,json:async()=>({entries:[{...posted,createdAt:1}],next:null})};};
 g.nodes.get('winnerName').value='Seba';await g.run('saveWinner({preventDefault(){}})');
 assert.equal(posted.character,'facu');assert.equal(posted.score,g.run('match.scores[0]'));assert.equal(g.run('state'),'ranking');
});

test('jump kick aims down in both directions, hits a lower rival once and misses above',()=>{
 for(const direction of [1,-1]){
  const g=game();g.run(`startGame('flor','sergio');state='playing';player.x=480;player.facing=${direction};cpu.x=480+${direction}*65;player.y=FLOOR-85;player.grounded=false;player.vy=0`);
  g.key('KeyK');assert.equal(g.run('player.kickStyle'),'airKick');g.run('player.actionTime=player.actionDuration-.15');
  assert.equal(g.run('poseFor(player)'),13);assert.ok(g.run('attackContact(player,cpu)?.overhead'));
  g.run('cpu.y=FLOOR-260');assert.equal(g.run('attackContact(player,cpu)'),null);
  g.run('cpu.y=FLOOR');g.tick(.14);assert.equal(g.run('cpu.health'),afterNormal(g,4));g.tick(.5);assert.equal(g.run('cpu.health'),afterNormal(g,4));
 }
});
test('back plus kick creates a grounded spinning volley relative to facing for both players',()=>{
 for(const direction of [1,-1]){
  const g=game();g.run(`gameMode='versus';startGame('facu','flor');state='playing';player.x=480;player.facing=${direction};cpu.x=480+${direction}*80;cpu.facing=${-direction}`);
  g.key(direction===1?'KeyA':'KeyD');g.key('KeyK');assert.equal(g.run('player.kickStyle'),'volley');assert.equal(g.run('player.grounded'),true);
  g.key(direction===1?'ArrowRight':'ArrowLeft');g.key('Digit8');assert.equal(g.run('cpu.kickStyle'),'volley');assert.equal(g.run('cpu.grounded'),true);
  g.run('player.actionTime=player.actionDuration-.2');assert.equal(g.run('poseFor(player)'),14);assert.equal(g.run('player.moveSpec.damage'),4);
 }
});
test('air kick takes precedence over back, low kicks stay low, and touch supports both new kicks',()=>{
 const g=game();g.run('startGame("sergio","blotta");state="playing"');
 const e={pointerId:11,preventDefault(){}};g.holds[0].listeners.pointerdown(e);g.taps[0].listeners.pointerdown({...e,pointerId:12});g.taps[2].listeners.pointerdown({...e,pointerId:13});
 assert.equal(g.run('player.kickStyle'),'airKick');g.key('Space');const before=g.run('JSON.stringify([player.x,player.y,player.actionTime])');g.tick(.5);assert.equal(g.run('JSON.stringify([player.x,player.y,player.actionTime])'),before);
 g.key('Space');g.tick(1.5);g.holds[0].listeners.pointerdown(e);g.taps[2].listeners.pointerdown({...e,pointerId:14});assert.equal(g.run('player.kickStyle'),'volley');
 g.tick(.8);g.holds[2].listeners.pointerdown({...e,pointerId:15});g.taps[2].listeners.pointerdown({...e,pointerId:16});assert.equal(g.run('player.lowAttack'),true);assert.equal(g.run('player.kickStyle'),null);
});

test('KO voice starts with the winning KO caption, skips silence and plays only once',()=>{
 const g=game();enableCombatAudio(g);g.run('KO_AUDIO.buffer={name:"ko",duration:1.56};finishRound(player,"K.O.")');
 assert.equal(g.nodes.get('announcement').textContent,'K.O.');assert.equal(g.run('combatLog.filter(e=>e.name==="ko"&&e.event==="start").length'),1);
 assert.equal(g.run('combatLog.find(e=>e.name==="ko"&&e.event==="start").offset'),.179);
 g.run('finishRound(player,"K.O.")');g.tick(1.3);assert.equal(g.run('koVoice'),null);assert.equal(g.nodes.get('announcement').classList.contains('show'),false);
 assert.equal(g.run('combatLog.filter(e=>e.name==="ko"&&e.event==="start").length'),1);
});
test('KO pauses with its caption, resumes from its offset, obeys mute and clears on exit',()=>{
 const g=game();enableCombatAudio(g);g.run('KO_AUDIO.buffer={name:"ko",duration:1.56};finishRound(cpu,"K.O.")');g.tick(.3);g.key('Space');
 const offset=g.run('koVoice.elapsed');g.tick(1);assert.equal(g.run('koVoice.elapsed'),offset);assert.equal(g.run('koVoice.source'),null);
 g.key('Space');assert.equal(g.nodes.get('announcement').classList.contains('show'),true);assert.ok(g.run('combatLog.filter(e=>e.name==="ko"&&e.event==="start").at(-1).offset')>.47);
 g.nodes.get('soundBtn').listeners.click();assert.equal(g.run('koVoice.source'),null);g.tick(.2);g.nodes.get('soundBtn').listeners.click();assert.ok(g.run('combatLog.filter(e=>e.name==="ko"&&e.event==="start").at(-1).offset')>.67);
 g.run('mainMenu()');assert.equal(g.run('koVoice'),null);
});
test('KO is absent on time or draws and final-round knockout still plays it',()=>{
 for(const reason of ['TIEMPO','K.O.']){const g=game();enableCombatAudio(g);g.run('KO_AUDIO.buffer={name:"ko",duration:1.56}');g.run(reason==='TIEMPO'?'finishRound(player,"TIEMPO")':'finishRound(null,"K.O.")');assert.equal(g.run('koVoice'),null);}
 const g=game();enableCombatAudio(g);g.run('KO_AUDIO.buffer={name:"ko",duration:1.56};match.playerWins=1;finishRound(player,"K.O.")');assert.equal(g.run('state'),'finished');assert.ok(g.run('koVoice.source'));g.tick(1.3);assert.equal(g.run('koVoice'),null);
});

test('KO waits for decoding and then starts at the beginning of the voice',()=>{
 const g=game();enableCombatAudio(g);g.run('finishRound(player,"K.O.")');g.tick(.5);
 assert.equal(g.run('koVoice.elapsed'),0);
 g.run('KO_AUDIO.buffer={name:"ko",duration:1.56};syncKOAudio()');
 assert.equal(g.run('combatLog.find(e=>e.name==="ko"&&e.event==="start").offset'),.179);
 g.tick(1.3);assert.equal(g.run('koVoice'),null);
});

test('embedded KO matches the supplied recording and failed decoding can retry',async()=>{
 const g=game();enableCombatAudio(g);
 assert.deepEqual(Buffer.from(g.run('KO_AUDIO_BASE64'),'base64'),fs.readFileSync(path.join(__dirname,'../assets/ko.mp3')));
 g.run('var attempts=0;var atob=()=>"abc";audioCtx.decodeAudioData=()=>{attempts++;return attempts===1?Promise.reject(Error("decode failed")):Promise.resolve({name:"ko",duration:1.56})};loadKOAudio()');
 await g.run('KO_AUDIO.loading');assert.equal(g.run('KO_AUDIO.loading'),null);
 g.run('loadKOAudio()');await g.run('KO_AUDIO.loading');
 assert.equal(g.run('attempts'),2);assert.equal(g.run('KO_AUDIO.buffer.name'),'ko');
});

test('cornered CPU rolls or uses Blotta smoke through the rival, including from guard',()=>{
 for(const kind of ['sergio','blotta','galante'])for(const side of [-1,1])for(const guarding of [false,true]){
  const g=game();g.run(`startGame('flor','${kind}');state='playing';cpu.x=${side<0?'FIGHTER_LEFT+5':'FIGHTER_RIGHT-5'};player.x=cpu.x-(${side})*75;cpu.power=0;cpu.guardTime=${guarding?.5:0};cpu.action='${guarding?'block':'idle'}';cpu.actionTime=${guarding?.2:0};Math.random=()=>0;updateAI(STEP)`);
  assert.equal(g.run('cpu.action'),['blotta','galante'].includes(kind)?'teleport':'roll');
  assert.equal(g.run('cpu.power'),0);
  g.tick(.55);assert.ok(g.run(side<0?'cpu.x>player.x':'cpu.x<player.x'));
  assert.ok(g.run('cpu.aiEscapeCooldown>0'));
 }
});

test('camera follows both sides of the wider stage, holds on pause and resets for rounds',()=>{
 for(const side of [-1,1]){
  const g=game();g.run(`gameMode='versus';player.x=${side<0?0:820};cpu.x=player.x+100;player.prevX=player.x;cpu.prevX=cpu.x;`);
  g.tick(.5);assert.ok(g.run(`cameraX*${side}>50`));
  assert.ok(g.run('fighters.every(f=>f.x-cameraX>=50&&f.x-cameraX<=VIEW_WIDTH-50)'));
  assert.ok(g.run('cameraX>=STAGE_LEFT&&cameraX<=STAGE_RIGHT-VIEW_WIDTH'));
  g.key('Space');const before=g.run('cameraX');g.tick(.5);assert.equal(g.run('cameraX'),before);
  g.run('startRound()');assert.equal(g.run('cameraX'),0);
 }
});

test('fighters reach new stage edges without leaving camera or separating beyond one view',()=>{
 const g=game();g.run('player.x=FIGHTER_LEFT+5;cpu.x=player.x+100;player.vx=-1000;integrateBody(player,1);updateCamera(1)');
 assert.equal(g.run('player.x'),g.run('FIGHTER_LEFT'));assert.equal(g.run('cameraX'),g.run('STAGE_LEFT'));
 g.run('player.x=FIGHTER_RIGHT-100;cpu.x=FIGHTER_RIGHT-5;cpu.vx=1000;integrateBody(cpu,1);updateCamera(1)');
 assert.equal(g.run('cpu.x'),g.run('FIGHTER_RIGHT'));assert.equal(g.run('cameraX'),g.run('STAGE_RIGHT-VIEW_WIDTH'));
 g.run('player.vx=-2000;integrateBody(player,1);updateCamera(1)');
 assert.ok(g.run('cpu.x-player.x<=MAX_FIGHTER_DISTANCE'));
 assert.ok(g.run('fighters.every(f=>f.x-cameraX>=50&&f.x-cameraX<=VIEW_WIDTH-50)'));
});

test('Galante is selectable for both players, slower than Facu and renders every standard pose',()=>{
 const g=game();g.run('startMode("versus");chooseFighter("galante",false);confirmFighter();chooseFighter("galante",false);confirmFighter();startGame(playerChoice)');
 assert.equal(g.run('player.kind+":"+cpu.kind'),'galante:galante');
 assert.ok(g.run('stats.galante.speed<stats.facu.speed'));
 g.run('for(let pose=0;pose<=14;pose++)spriteFrame({kind:"galante",pose});draw()');
 g.run('introElapsed=1;draw()');g.key('Space');const t=g.run('introElapsed');g.tick(.5);assert.equal(g.run('introElapsed'),t);
});
test('Galante whip reaches both ends, hits once, plays audio and allows guard or airborne evasion',()=>{
 for(const direction of [-1,1])for(const defense of ['none','guard','jump']){
  const g=game();g.run(`startGame('galante','sergio');state='playing';player.x=${direction>0?'FIGHTER_LEFT+5':'FIGHTER_RIGHT-5'};cpu.x=player.x+(${direction})*MAX_FIGHTER_DISTANCE;player.facing=${direction};cpu.facing=${-direction}`);
  if(defense==='guard')g.run('cpu.guardTime=2;cpu.guarding=true');
  if(defense==='jump')g.run('cpu.y=FLOOR-220;cpu.grounded=false;cpu.vy=-100');
  enableCombatAudio(g);g.key('KeyL');assert.equal(g.run('player.specialStyle'),'whip');
  assert.equal(g.run('combatLog.filter(e=>e.event==="start"&&e.name==="whip").length'),1);
  g.tick(.23);assert.equal(g.run('cpu.health'),defense==='guard'?afterHit(g,1):defense==='jump'?100:afterPower(g));
  g.tick(.4);assert.equal(g.run('cpu.health'),defense==='guard'?afterHit(g,1):defense==='jump'?100:afterPower(g));
  assert.equal(g.run('projectiles.length'),0);
 }
});
test('Galante touch smoke is free, crosses the rival, pauses, and retains standard attacks',()=>{
 const g=game();g.run('startGame("galante","sergio");state="playing";player.power=0;player.specialCooldown=1;player.x=300;cpu.x=380');
 g.taps[5].listeners.pointerdown({pointerId:81,preventDefault(){}});assert.equal(g.run('player.action'),'teleport');assert.equal(g.run('player.power'),0);
 g.tick(.2);g.key('Space');const x=g.run('player.x');g.tick(.3);assert.equal(g.run('player.x'),x);g.key('Space');g.tick(.55);assert.ok(g.run('player.x>cpu.x'));
 g.key('KeyJ');assert.equal(g.run('player.action'),'punch');g.tick(.5);g.key('KeyK');assert.equal(g.run('player.action'),'kick');
});

test('selection supports vertical grid navigation and random choice for either player',()=>{
 const g=game();g.run('startMode("versus");chooseFighter("sergio",false)');
 g.key('ArrowDown');assert.equal(g.run('playerChoice'),'flor');g.key('ArrowUp');assert.equal(g.run('playerChoice'),'sergio');
 g.run('Math.random=()=>.99;chooseFighter("random",false)');assert.equal(g.run('playerChoice'),'jairo');g.run('confirmFighter();Math.random=()=>0;chooseFighter("random",false)');assert.equal(g.run('opponentChoice'),'sergio');
 assert.equal(g.run('stats.galante.height'),g.run('stats.sergio.height'));assert.equal(g.run('stats.galante.size'),g.run('stats.sergio.size'));
 g.run('startGame("blotta","sergio");beginIntro()');assert.equal(g.nodes.get('speechBubble').hidden,true);
});

test('El Padrino supports both selections, standard poses and a free normal roll on touch',()=>{
 const g=game();g.run('startMode("versus");chooseFighter("padrino",false);confirmFighter();chooseFighter("padrino",false);confirmFighter();startGame(playerChoice);state="playing"');
 assert.equal(g.run('player.kind+":"+cpu.kind'),'padrino:padrino');
 g.run('for(let pose=0;pose<15;pose++)spriteFrame({kind:"padrino",pose});draw();player.power=cpu.power=0;player.specialCooldown=cpu.specialCooldown=4');
 g.taps[5].listeners.pointerdown({pointerId:91,preventDefault(){}});g.taps2[5].listeners.pointerdown({pointerId:92,preventDefault(){}});
 assert.equal(g.run('player.action+":"+cpu.action'),'roll:roll');assert.equal(g.run('player.power+cpu.power'),0);
 assert.equal(g.run('attack(player,"teleport")'),false);g.tick(.2);g.key('Space');const x=g.run('player.x');g.tick(.3);assert.equal(g.run('player.x'),x);
});
test('Padrino dachshund flies both ways, hits once, respects guard and uses the supplied bark',()=>{
 for(const direction of [-1,1])for(const distance of [85,470])for(const guarding of [false,true]){
  const g=game();g.run(`startGame('padrino','sergio');state='playing';player.power=100;player.x=${direction>0?180:730};cpu.x=player.x+${direction*distance};player.facing=${direction};cpu.facing=${-direction};cpu.guardTime=${guarding?3:0};cpu.guarding=${guarding}`);
  enableCombatAudio(g);g.key('KeyL');assert.equal(g.run('player.specialStyle'),'dog');assert.equal(g.run('player.power'),65);
  assert.equal(g.run('combatLog.filter(e=>e.event==="start"&&e.name==="dog").length'),1);
  g.tick(.32);if(distance>100){assert.equal(g.run('projectiles[0].style'),'dog');assert.equal(g.run('Math.sign(projectiles[0].vx)'),direction);g.run('draw()');}
  g.tick(1.1);assert.equal(g.run('cpu.health'),guarding?afterHit(g,1):afterPower(g));assert.equal(g.run('projectiles.length'),0);
  g.tick(.3);assert.equal(g.run('cpu.health'),guarding?afterHit(g,1):afterPower(g));
  g.run('stopAllCombatSounds()');assert.equal(g.run('combatSounds.size+soundTails.size'),0);
 }
});
test('Padrino bark retains an audible close-hit tail and stops on pause',()=>{
 const g=game();g.run('startGame("padrino","sergio");state="playing";player.x=300;cpu.x=385');enableCombatAudio(g);g.key('KeyL');g.tick(.35);
 assert.equal(g.run('cpu.health'),afterPower(g));assert.equal(g.run('soundTails.size'),1);g.key('Space');assert.equal(g.run('soundTails.size'),0);
 assert.ok(fs.statSync(path.join(__dirname,'../assets/padrino-bark-v1.wav')).size>10000);
});

test('title music loops only on title and mode, stays continuous, and switches on fighter selection',()=>{
 const g=game();enableCombatAudio(g);
 g.run(`EXTRA_AUDIO.title.buffer={name:'title',duration:26};EXTRA_AUDIO.selection.buffer={name:'selection',duration:20};mainMenu()`);
 assert.equal(g.run('state'),'title');assert.equal(g.run('musicTrack.usage'),'title');assert.equal(g.run('musicSource.loop'),true);
 const title=g.run('musicSource');g.run('openModeSelection()');assert.equal(g.run('state'),'mode');assert.equal(g.run('musicSource'),title);
 g.run('chooseMode("versus")');assert.equal(g.run('musicSource'),title);
 g.run('startMode("versus")');assert.equal(g.run('musicTrack.usage'),'selection');assert.notEqual(g.run('musicSource'),title);
 assert.ok(g.run('combatLog.some(e=>e.event==="stop"&&e.source===combatLog.find(e=>e.name==="title"&&e.event==="start").source)'));
 g.run('mainMenu()');assert.equal(g.run('musicTrack.usage'),'title');g.run('stopMusic();state="playing";musicTrack=EXTRA_AUDIO.title;syncMusic()');assert.equal(g.run('musicSource'),null);
});

test('failed selection preload retries and delayed decoding never replaces title music',async()=>{
 const g=game();enableCombatAudio(g);
 g.run('EXTRA_AUDIO.title.buffer={name:"title",duration:26};mainMenu();audioCtx.decodeAudioData=async()=>({name:"selection",duration:88})');
 let requests=0;g.sandbox.fetch=async()=>{requests++;if(requests===1)throw Error('temporary network failure');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)}};
 await g.run('loadMusic(EXTRA_AUDIO.selection)');assert.equal(g.run('EXTRA_AUDIO.selection.loading'),null);
 assert.equal(g.run('musicTrack.usage'),'title');g.run('syncMusic()');assert.equal(requests,1);
 g.run('EXTRA_AUDIO.selection.retryAt=0;startMode("solo")');await g.run('EXTRA_AUDIO.selection.loading');
 assert.equal(requests,2);assert.equal(g.run('musicSource.buffer.name'),'selection');
 const selection=g.run('musicSource');g.run('openStageSelection()');assert.equal(g.run('musicSource'),selection);
 g.run('mainMenu();EXTRA_AUDIO.selection.buffer=null;EXTRA_AUDIO.selection.retryAt=0');await g.run('loadMusic(EXTRA_AUDIO.selection)');
 assert.equal(g.run('musicSource.buffer.name'),'title');g.run('startMode("solo")');assert.equal(g.run('musicSource.buffer.name'),'selection');
});

test('Paula supports both players, all poses, normal roll and water charge then release',()=>{
 const g=game();g.run('startMode("versus");chooseFighter("paula",false);confirmFighter();chooseFighter("paula",false);confirmFighter();startGame(playerChoice);state="playing";for(let pose=0;pose<16;pose++)spriteFrame({kind:"paula",pose});draw()');
 assert.equal(g.run('player.kind+":"+cpu.kind'),'paula:paula');
 g.run('player.power=cpu.power=0');g.taps[5].listeners.pointerdown({pointerId:97,preventDefault(){}});g.taps2[5].listeners.pointerdown({pointerId:98,preventDefault(){}});
 assert.equal(g.run('player.action+":"+cpu.action'),'roll:roll');assert.equal(g.run('player.power+cpu.power'),0);
 g.tick(.8);g.run('player.power=100;attack(player,"special")');assert.equal(g.run('poseFor(player)'),11);g.tick(.27);assert.equal(g.run('poseFor(player)'),4);g.run('draw()');
});
test('Paula water reaches distant enemies both ways, hits once, is blockable and plays supplied splash at close range',()=>{
 for(const direction of [-1,1])for(const distance of [85,500])for(const guard of [false,true]){
  const g=game();g.run(`startGame('paula','sergio');state='playing';player.x=${direction>0?150:760};cpu.x=player.x+${direction*distance};player.facing=${direction};cpu.facing=${-direction};cpu.guardTime=${guard?3:0};cpu.guarding=${guard};player.power=100`);
  enableCombatAudio(g);g.key('KeyL');assert.equal(g.run('player.specialStyle'),'water');assert.equal(g.run('player.power'),65);
  assert.equal(g.run('combatLog.filter(e=>e.event==="start"&&e.name==="water").length'),1);g.tick(.3);
  if(distance>100){assert.equal(g.run('projectiles[0].style'),'water');assert.equal(g.run('projectiles[0].vy'),0);g.run('draw()');}
  g.tick(1);assert.equal(g.run('cpu.health'),guard?afterHit(g,1):afterPower(g));assert.equal(g.run('projectiles.length'),0);g.tick(.2);assert.equal(g.run('cpu.health'),guard?afterHit(g,1):afterPower(g));
 }
});
test('water flight and sound pause together and jumping can evade the stream',()=>{
 const g=game();g.run('startGame("paula","sergio");state="playing";player.x=160;cpu.x=600');enableCombatAudio(g);
 g.key('KeyL');g.tick(.3);const x=g.run('projectiles[0].x');g.key('Space');g.tick(.4);assert.equal(g.run('projectiles[0].x'),x);assert.equal(g.run('projectiles[0].sound.source'),null);
 g.key('Space');g.run('jump(cpu)');g.tick(.65);assert.equal(g.run('cpu.health'),100);g.run('mainMenu()');assert.equal(g.run('combatSounds.size+soundTails.size'),0);
});

test('water audio plays once, fades on impact and never loops after a late resume',()=>{
 const g=game();g.run('startGame("paula","sergio");state="playing";player.x=300;cpu.x=385');enableCombatAudio(g);
 g.run('audioCtx.currentTime=0');g.key('KeyL');assert.equal(g.run('player.attackSound.source.loop'),false);
 g.run('var waterFade=[];player.attackSound.gain.gain.setValueAtTime=(v,t)=>waterFade.push([v,t]);player.attackSound.gain.gain.linearRampToValueAtTime=(v,t)=>waterFade.push([v,t])');
 g.tick(.3);assert.equal(g.run('waterFade.at(-1)[0]'),0);assert.ok(g.run('waterFade.at(-1)[1]>=.18'));g.run('stopAllCombatSounds()');assert.equal(g.run('soundTails.size'),0);
 g.run('var endedWater={name:"water",elapsed:4,source:null};combatSounds.add(endedWater);syncCombatSounds()');assert.equal(g.run('endedWater.source'),null);
});

test('Jairo has standard movement, both selectable powers and independent keyboard/touch inputs',()=>{
 const g=game();g.run('gameMode="versus";startGame("jairo","jairo");state="playing";player.power=cpu.power=100;for(let pose=0;pose<16;pose++)spriteFrame({kind:"jairo",pose});draw()');
 g.key('KeyL');assert.equal(g.run('player.specialStyle'),'critical');assert.equal(g.run('player.power'),65);
 g.holds2[2].listeners.pointerdown({pointerId:23,preventDefault(){}});
 g.taps2[3].listeners.pointerdown({pointerId:24,preventDefault(){}});
 assert.equal(g.run('cpu.specialStyle'),'crash');assert.equal(g.run('cpu.power'),55);assert.equal(g.run('poseFor(cpu)'),11);
 g.run('player.action="idle";player.actionTime=0;player.power=0;player.specialCooldown=9');g.key('KeyO');assert.equal(g.run('player.action'),'roll');
 g.run('cpu.action="idle";cpu.actionTime=0;cpu.power=44;cpu.specialCooldown=0');assert.equal(g.run('attack(cpu,"special")'),false);
});

test('critical line reaches both directions once, briefly locks unguarded targets and respects guard',()=>{
 for(const direction of [-1,1])for(const guard of [false,true]) {
  const g=game();g.run(`startGame('jairo','sergio');state='playing';player.x=${direction>0?150:850};cpu.x=player.x+${direction*650};player.facing=${direction};cpu.facing=${-direction};cpu.guardTime=3;cpu.guarding=${guard}`);
  enableCombatAudio(g);g.key('KeyL');g.tick(.6);g.run('draw()');
  assert.equal(g.run('cpu.health'),guard?afterHit(g,1):afterPower(g));
  if(!guard){assert.equal(g.run('cpu.action'),'hit');assert.equal(g.run('jump(cpu)'),false);assert.equal(g.run('attack(cpu,"punch")'),false);}
  g.tick(1);assert.equal(g.run('cpu.health'),guard?afterHit(g,1):afterPower(g));assert.notEqual(g.run('cpu.action'),'hit');
  assert.equal(g.run('combatLog.filter(e=>e.event==="start"&&e.name==="critical"&&e.offset===0).length'),1);
 }
});

test('critical line can be avoided by crouching or rolling and is audible at point blank range',()=>{
 for(const dodge of ['crouch','roll']) {
  const g=game();g.run('startGame("jairo","sergio");state="playing";player.x=300;cpu.x=385;player.facing=1');
  if(dodge==='crouch')g.run('cpu.crouchTime=2;cpu.crouching=true');else g.run('evade(cpu)');
  g.key('KeyL');g.tick(.4);assert.equal(g.run('cpu.health'),100);
 }
 const g=game();g.run('startGame("jairo","sergio");state="playing";player.x=300;cpu.x=385');enableCombatAudio(g);g.key('KeyL');g.tick(.3);
 assert.equal(g.run('cpu.health'),afterPower(g));assert.ok(g.run('combatSounds.size')>0);
});

test('falling schedule bars target a fixed location, deal bounded damage, respect guard and pause',()=>{
 for(const guard of [false,true]) {
  const g=game();g.run(`startGame('jairo','sergio');state='playing';player.x=200;cpu.x=700;player.power=100;cpu.facing=-1;cpu.guarding=${guard};cpu.guardTime=3`);
  enableCombatAudio(g);g.key('KeyS');g.key('KeyL');g.tick(.5);assert.equal(g.run('projectiles[0].style'),'crash');g.run('draw()');
  const age=g.run('projectiles[0].age');g.key('Space');g.tick(2);assert.equal(g.run('projectiles[0].age'),age);assert.equal(g.run('cpu.health'),100);g.key('Space');g.tick(1.6);
  assert.ok(g.run('cpu.health')>=80);assert.ok(g.run('cpu.health')<100);if(guard)assert.ok(g.run('cpu.health')>=96);
  assert.equal(g.run('projectiles.length'),0);g.run('mainMenu()');assert.equal(g.run('combatSounds.size+soundTails.size'),0);
 }
 const g=game();g.run('startGame("jairo","sergio");state="playing";player.x=200;cpu.x=700;player.power=100');g.key('KeyS');g.key('KeyL');g.tick(.4);g.run('cpu.x=450');g.tick(1.6);assert.equal(g.run('cpu.health'),100);
});

test('CPU Jairo can choose either special and ten fighters are selectable in two rows',()=>{
 const g=game();g.run('startGame("sergio","jairo");state="playing";cpu.power=100;Math.random=()=>.2;attack(cpu,"special")');assert.equal(g.run('cpu.specialStyle'),'crash');
 g.run('cpu.action="idle";cpu.actionTime=0;cpu.power=100;cpu.specialCooldown=0;Math.random=()=>.8;attack(cpu,"special")');assert.equal(g.run('cpu.specialStyle'),'critical');
 g.run('startMode("versus");chooseFighter("facu",false)');g.key('ArrowDown');assert.equal(g.run('playerChoice'),'jairo');g.key('Enter');g.run('chooseFighter("jairo",false);confirmFighter();startGame(playerChoice)');assert.equal(g.run('player.kind+":"+cpu.kind'),'jairo:jairo');
});
