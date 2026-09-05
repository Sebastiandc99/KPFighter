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
        dataset, style: {}, hidden: false, disabled: false, textContent: "", width: 960, height: 540,
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
  const picks = ["sergio", "blotta", "tunki"].map(kind => node("pick-" + kind, { pick: kind }));
  const portraits = ["sergio", "blotta", "tunki"].map(kind => node("portrait-" + kind, { portrait: kind }));
  const holds = ["left", "right", "down", "guard"].map(hold => node("hold-" + hold, { hold }));
  const taps = ["jump", "punch", "kick", "special", "ability"].map(tap => node("tap-" + tap, { tap }));
  const win = node("window");
  const doc = node("document");
  Object.assign(doc, {
    body: node("body"),
    createElement: tag => node(tag + "-" + nodes.size),
    getElementById: id => node(id),
    querySelector: selector => selector === '[data-tap="special"]' ? taps[3] : node(selector),
    querySelectorAll: selector => ({
      "[data-pick]": picks, "[data-portrait]": portraits, "[data-hold]": holds, "[data-tap]": taps,
      "[data-hold].active": holds.filter(n => n.classList.contains("active"))
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
  return { run, tick, key, nodes, holds, taps };
}

test("neutral jump has its own pose and never inflicts a kick", () => {
  const g = game();
  g.run("player.x = 300; cpu.x = 365;");
  g.key("KeyW");
  assert.equal(g.run("player.action"), "idle");
  assert.equal(g.run("poseFor(player)"), 10);
  assert.ok(g.run("player.vy") < 0);
  g.tick(.8);
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
  g.tick(2.2);
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
  assert.equal(g.run("state"), "finished");
  g.tick(1);
  assert.equal(g.nodes.get("resultPanel").hidden, false);
  const hp = g.run("player.health");
  g.run("hit(player, 20, -170, 0, cpu)");
  assert.equal(g.run("player.health"), hp);
  assert.equal(g.run("cpu.health"), 0);
});

test("all character matchups finish simulated fights with AI and rendering enabled", () => {
  for (const kind of ["sergio", "blotta", "tunki"]) {
   for (const rival of ["sergio", "blotta", "tunki"].filter(other => other !== kind)) {
    const g = game();
    g.run('startGame("' + kind + '"); state = "playing"; aiEnabled = true;');
    g.run('cpu.kind = "' + rival + '";');
    for (let frame = 1; frame <= 61 * 60; frame++) {
      if (frame % 17 === 0) g.key("KeyJ");
      if (frame % 47 === 0) g.key("KeyK");
      if (frame % 139 === 0) g.key("KeyL");
      if (frame % 251 === 0) g.key("KeyH");
      g.run("loop(" + frame * 1000 / 60 + ")");
    }
    assert.equal(g.run("state"), "finished");
    assert.ok(g.run("fighters.every(f => Number.isFinite(f.x) && Number.isFinite(f.y) && f.health >= 0 && f.health <= 100)"));
    assert.ok(g.run("particles.length < 100 && afterimages.length < 20"));
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
  g.tick(.8);
  assert.equal(g.run("cpu.health"), 100);
  g.run("player.x = 300; cpu.x = 410;");
  g.key("KeyH");
  g.tick(.08);
  assert.equal(g.run("cpu.health"), 100);
  assert.equal(g.run("player.action"), "slam");
  g.tick(.2);
  assert.equal(g.run("player.grounded"), false);
  g.tick(.9);
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
