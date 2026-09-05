const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Test the real engine and real input handlers without a browser or third-party dependencies.
function game() {
  const nodes = new Map();
  const context2d = new Proxy({}, {
    get: (_, name) => name.startsWith("create") ? () => ({ addColorStop() {} }) : () => {},
    set: () => true
  });
  function node(id, dataset = {}) {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {
        dataset, children: [], value: "", focus() {}, appendChild(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; }, style: {}, hidden: false, disabled: false, textContent: "", width: 960, height: 540,
        classList: {
          add: key => classes.add(key), remove: key => classes.delete(key),
          contains: key => classes.has(key),
          toggle: (key, on) => { if (on) classes.add(key); else classes.delete(key); }
        },
        listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; },
        setAttribute() {}, getContext: () => context2d, setPointerCapture() {}
      });
    }
    return nodes.get(id);
  }
  const picks = ["sergio", "blotta", "tunki", "marechal"].map(kind => node("pick-" + kind, { pick: kind }));
  const portraits = ["sergio", "blotta", "tunki", "marechal"].map(kind => node("portrait-" + kind, { portrait: kind }));
  const stages = ["arcade", "mine", "newmont"].map(stage => node("stage-" + stage, { stage }));
  const leftRounds = [0, 1].map(i => node("left-round-" + i));
  const rightRounds = [0, 1].map(i => node("right-round-" + i));
  const holds = ["left", "right", "down", "guard"].map(hold => node("hold-" + hold, { hold }));
  const taps = ["jump", "punch", "kick", "special", "ability"].map(tap => node("tap-" + tap, { tap }));
  const holds2 = ["left", "right", "down", "guard"].map(hold => node("p2-hold-" + hold, { hold, player: "2" }));
  const taps2 = ["jump", "punch", "kick", "special", "ability"].map(tap => node("p2-tap-" + tap, { tap, player: "2" }));
  const modes = ["solo", "versus"].map(mode => node(mode + "Btn", {mode}));
  const win = node("window");
  const doc = node("document");
  Object.assign(doc, {
    body: node("body"),
    createElement: tag => node(tag + "-" + nodes.size),
    getElementById: id => node(id),
    querySelector: selector => selector === '[data-tap="special"]' ? taps[3] : node(selector),
    querySelectorAll: selector => ({
      "[data-pick]": picks, "[data-portrait]": portraits, "[data-hold]": [...holds,...holds2], "[data-tap]": [...taps,...taps2], "[data-mode]": modes,
      "[data-stage]": stages, "#leftRounds i": leftRounds, "#rightRounds i": rightRounds,
      "[data-hold].active": [...holds,...holds2].filter(n => n.classList.contains("active"))
    }[selector] || [])
  });
  const sandbox = vm.createContext({
    document: doc, window: win, navigator: { vibrate() {} },
    Image: class { constructor() { this.complete = true; this.naturalWidth = 810; } },
    performance: { now: () => 0 }, requestAnimationFrame() {}, setTimeout() {}, console
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8"), sandbox);
  const run = code => vm.runInContext(code, sandbox);
  run('muted = true; aiEnabled = false; startGame("sergio"); state = "playing";');
  const tick = seconds => run("for (let n = 0; n < " + Math.round(seconds * 120) + "; n++) update(STEP)");
  const key = (code, type = "keydown", repeat = false) => {
    let prevented = false;
    win.listeners[type]({ code, key: code, repeat, preventDefault() { prevented = true; } });
    return prevented;
  };
  return { run, tick, key, nodes, holds, taps, holds2, taps2, sandbox };
}

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
  assert.equal(g.run("player.health"), 90);
});

test("low attacks bypass standing guard but crouching guard blocks them", () => {
  for (const crouched of [false, true]) {
    const g = game();
    g.run("player.x = 300; cpu.x = 375; player.facing = 1;");
    if (crouched) g.key("ArrowDown");
    g.key("ShiftLeft");
    g.run('hit(player, 9, -170, 0, cpu, {sourceX: cpu.x, low:true})');
    assert.equal(g.run("player.health"), crouched ? 100 : 91);
  }
});

test("Blotta vanishes, leaves smoke at both positions and spends power once", () => {
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
  assert.ok(g.run("player.power") < 38);
  g.tick(.4);
  assert.equal(g.run("isVanished(player)"), false);
  assert.equal(g.run('attack(player, "teleport")'), false);
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
  for (const kind of ["sergio", "blotta", "tunki", "marechal"]) {
   for (const rival of ["sergio", "blotta", "tunki", "marechal"].filter(other => other !== kind)) {
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
  assert.equal(g.run("cpu.health"), 86);
  assert.equal(g.run("projectiles.length"), 0);
  assert.equal(g.run('attack(cpu, "slam")'), false);
});

test("Tunki's neutral jump does no damage; deliberate slam dives and hits once", () => {
  const g = game();
  g.run('startGame("tunki"); state = "playing"; player.x = 300; cpu.x = 410;');
  g.key("KeyW");
  g.tick(1);
  assert.equal(g.run("cpu.health"), 100);
  g.run("player.x = 300; cpu.x = 410;");
  g.key("KeyH");
  g.tick(.08);
  assert.equal(g.run("cpu.health"), 100);
  assert.equal(g.run("player.action"), "slam");
  g.tick(.2);
  assert.equal(g.run("player.grounded"), false);
  g.tick(1.1);
  assert.equal(g.run("cpu.health"), 82);
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
    assert.equal(g.run("cpu.health"), crouched ? 82 : 100);
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
    assert.equal(g.run("cpu.health"), 87);
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
    assert.equal(g.run("cpu.health"), defense === "guard" ? 99 : 100);
  }
});

test("stance transitions interpolate, backward steps reverse, and attacks settle into rest", () => {
  for (const kind of ["sergio", "blotta", "tunki", "marechal"]) {
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
    g.tick(.42);
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
  assert.equal(g.nodes.get("stagePreview").src, "assets/stage-newmont.webp");
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
  g.run('player.x = 300; cpu.x = 355; player.health = cpu.health = 5; attack(player, "punch"); attack(cpu, "punch");');
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
  for (const kind of ["sergio", "blotta", "tunki", "marechal"]) {
    const g = game();
    g.run('startGame("' + kind + '"); state = "playing"; var minY = FLOOR;');
    g.key("KeyW");
    g.run("for (let i=0; i<120; i++) { update(STEP); minY = Math.min(minY, player.y); }");
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
  for (const kind of ["sergio", "blotta", "tunki", "marechal"]) {
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
      assert.equal(g.run("cpu.health"), 88);
      assert.ok(g.run("cpu.vy < 0 && !cpu.grounded"));
      g.tick(.8);
      assert.equal(g.run("cpu.health"), 88);
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
      assert.equal(g.run("cpu.health"), block ? 99 : kind === "sergio" ? 90 : 87);
    }
  }
});

test("projectile sound ends at either visible edge, expiry or floor and voices remain independent", () => {
  for (const direction of [-1, 1]) {
    const g = game(); enableCombatAudio(g);
    g.run(`player.facing = ${direction}; spawnProjectile(player, 'lightning'); projectiles[0].x = ${direction > 0 ? 945 : 15};`);
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
  assert.equal(g.run('match.scores[1]'),100); assert.equal(g.run('match.scores[0]'),0);
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
  assert.equal(g.nodes.get('rankingRows').children[0].children[1].textContent,'Seba 2');
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
