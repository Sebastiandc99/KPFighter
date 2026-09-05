"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  titleScreen: document.getElementById("titleScreen"),
  selectScreen: document.getElementById("selectScreen"),
  gameScreen: document.getElementById("gameScreen"),
  startBtn: document.getElementById("startBtn"),
  confirmBtn: document.getElementById("confirmBtn"),
  announcement: document.getElementById("announcement"),
  speech: document.getElementById("speechBubble"),
  resultPanel: document.getElementById("resultPanel"),
  resultKicker: document.getElementById("resultKicker"),
  resultTitle: document.getElementById("resultTitle"),
  leftName: document.getElementById("leftName"),
  rightName: document.getElementById("rightName"),
  leftHealth: document.getElementById("leftHealth"),
  rightHealth: document.getElementById("rightHealth"),
  leftPower: document.getElementById("leftPower"),
  rightPower: document.getElementById("rightPower"),
  timer: document.getElementById("timer"),
  flash: document.getElementById("flash"),
  soundBtn: document.getElementById("soundBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  abilityBtn: document.getElementById("abilityBtn")
};

const assets = {
  arena: loadImage("assets/arena.jpg"),
  sergio: loadImage("assets/sergio-attack-v4.png"),
  blotta: loadImage("assets/blotta-atlas-v2-clean.png"),
  tunki: loadImage("assets/tunki-attack-v1.png"),
  sergioMotion: loadImage("assets/sergio-motion-v4.png"),
  blottaMotion: loadImage("assets/blotta-motion-v3.png"),
  tunkiMotion: loadImage("assets/tunki-motion-v1.png")
};

const POSES = {
  sergio: { idle: 0, punch: 1, kick: 2, hit: 3, meat: 4, bottle: 5 },
  blotta: { idle: 0, punch: 1, kick: 2, sweep: 3, hit: 4, power: 5 },
  tunki: { idle: 0, punch: 1, kick: 2, hit: 3, power: 4, slam: 5 }
};

const stats = {
  sergio: { name: "SERGIO", speed: 260, jump: 595, defaultFace: 1, size: 210, height: 184, width: 32, description: "PANZAZO · ASADO · FERNET", ability: null },
  blotta: { name: "BLOTTA", speed: 278, jump: 620, defaultFace: -1, size: 214, height: 180, width: 25, description: "KARATE · ENERGÍA · HUMO", ability: "teleport" },
  tunki: { name: "LA TUNKI", speed: 246, jump: 605, defaultFace: 1, size: 202, height: 174, width: 32, description: "FLORES · SALTO APLASTANTE", ability: "slam" }
};

const roster = Object.keys(stats);
const FLOOR = 448;
const STEP = 1 / 120;
const MOVES = {
  punch: { startup: .085, active: .095, recovery: .18, reach: 77, damage: 8, knock: 160 },
  kick: { startup: .12, active: .16, recovery: .23, reach: 106, damage: 11, knock: 235 },
  lowPunch: { startup: .08, active: .09, recovery: .17, reach: 68, damage: 6, knock: 110 },
  lowKick: { startup: .13, active: .14, recovery: .22, reach: 102, damage: 9, knock: 210 },
  special: { startup: .19, active: .04, recovery: .29 },
  teleport: { startup: .16, active: .28, recovery: .23 },
  slam: { startup: .12, active: 1.55, recovery: .33, damage: 18, knock: 290 }
};

let state = "title";
let playerChoice = "sergio";
let player = null;
let cpu = null;
let fighters = [];
let projectiles = [];
let particles = [];
let afterimages = [];
let held = { left: false, right: false, down: false, guard: false };
let roundTime = 60;
let lastTime = performance.now();
let aiClock = 0;
let screenShake = 0;
let stageTime = 0;
let muted = false;
let audioCtx = null;
let accumulator = 0;
let renderAlpha = 1;
let introElapsed = 0;
let resultElapsed = 0;
let announcementTime = 0;
let hitStop = 0;
let pauseFrom = "playing";
let aiEnabled = true;
const keyHolds = new Set();
const touchHolds = new Map();

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

function clearHeld() {
  keyHolds.clear();
  touchHolds.clear();
  Object.keys(held).forEach(key => { held[key] = false; });
  document.querySelectorAll("[data-hold].active").forEach(button => button.classList.remove("active"));
}

function makeFighter(kind, x, isPlayer) {
  return {
    kind, x, y: FLOOR, prevX: x, prevY: FLOOR, vx: 0, vy: 0, health: 100, power: 40,
    isPlayer, grounded: true, action: "idle", actionTime: 0,
    actionDuration: 0, animClock: Math.random() * 4, trailClock: 0,
    specialSpawned: false, specialStyle: "ki",
    queuedAction: null, queueTime: 0,
    crouching: false, guarding: false, guardTime: 0, crouchTime: 0,
    teleportDone: false, teleportSmokeStarted: false, teleportTarget: x,
    slamLaunched: false, slamDiving: false, slamLanded: false, slamFromAir: false,
    landingSquash: 0,
    attackLanded: false, invuln: 0, specialCooldown: 0,
    projectileToggle: 0, facing: x < 480 ? 1 : -1, flash: 0,
    moveSpec: null, lowAttack: false, airAttack: false, moveIntent: 0,
    walkPhase: 0, combo: 0, comboTime: 0, guardFlash: 0
  };
}

function showScreen(screen) {
  [ui.titleScreen, ui.selectScreen, ui.gameScreen].forEach(node => {
    node.classList.toggle("active", node === screen);
  });
}

function chooseFighter(kind, playSound = true) {
  if (!stats[kind]) return;
  playerChoice = kind;
  document.querySelectorAll("[data-pick]").forEach(button => {
    button.classList.toggle("selected", button.dataset.pick === kind);
    button.setAttribute("aria-pressed", String(button.dataset.pick === kind));
  });
  document.getElementById("selectionName").textContent = stats[kind].name;
  document.getElementById("selectionMoves").textContent = stats[kind].description;
  document.querySelectorAll("[data-portrait]").forEach(portrait => {
    portrait.classList.toggle("selected", portrait.dataset.portrait === kind);
  });
  if (playSound) sfx("move");
}

function openSelection() {
  state = "select";
  clearHeld();
  ui.resultPanel.hidden = true;
  ui.speech.hidden = true;
  setPauseUI(false);
  showScreen(ui.selectScreen);
  chooseFighter(playerChoice, false);
  ensureAudio();
  sfx("start");
}

function startGame(choice) {
  playerChoice = choice;
  const opponents = roster.filter(kind => kind !== choice);
  const other = opponents[Math.floor(Math.random() * opponents.length)];
  player = makeFighter(choice, 235, true);
  cpu = makeFighter(other, 725, false);
  fighters = [player, cpu];
  projectiles = [];
  particles = [];
  afterimages = [];
  clearHeld();
  roundTime = 60;
  aiClock = 0;
  screenShake = 0;
  stageTime = 0;
  introElapsed = 0;
  resultElapsed = 0;
  accumulator = 0;
  hitStop = 0;
  state = "intro";
  showScreen(ui.gameScreen);
  setPauseUI(false);
  ui.resultPanel.hidden = true;
  ui.leftName.textContent = stats[player.kind].name;
  ui.rightName.textContent = stats[cpu.kind].name;
  const ability = stats[player.kind].ability;
  ui.abilityBtn.hidden = !ability;
  document.getElementById("abilityHelp").hidden = !ability;
  document.getElementById("abilityLabel").textContent = ability === "slam" ? "APLASTAR" : "HUMO";
  document.getElementById("abilityKeyLabel").textContent = ability === "slam" ? "APLASTAR" : "HUMO";
  document.getElementById("abilityIcon").textContent = ability === "slam" ? "▼" : "☁";
  ui.abilityBtn.setAttribute("aria-label", ability === "slam" ? "Salto aplastante" : "Desaparecer con humo");
  document.querySelector(".desktop-help").setAttribute("aria-hidden", "false");
  canvas.setAttribute("aria-label", "Combate: " + stats[player.kind].name + " contra " + stats[cpu.kind].name);
  updateHud();
  beginIntro();
  ensureAudio();
  sfx("start");
}

function beginIntro() {
  introElapsed = 0;
  ui.speech.hidden = !fighters.some(f => f.kind === "blotta");
  positionSpeech();
  ui.announcement.classList.remove("show");
  announcementTime = 0;
}

function announce(text, duration = 0) {
  ui.announcement.textContent = text;
  ui.announcement.classList.toggle("show", !!text);
  announcementTime = duration / 1000;
}

function positionSpeech() {
  const blotta = fighters.find(f => f.kind === "blotta");
  if (!blotta) return;
  ui.speech.style.left = (blotta.x / canvas.width * 100) + "%";
  ui.speech.style.top = "36%";
}

function update(dt) {
  if (!["intro", "playing", "finished"].includes(state)) return;
  fighters.forEach(f => { f.prevX = f.x; f.prevY = f.y; });
  stageTime += dt;
  if (announcementTime > 0) {
    announcementTime -= dt;
    if (announcementTime <= 0) ui.announcement.classList.remove("show");
  }
  if (state === "intro") {
    const before = introElapsed;
    introElapsed += dt;
    fighters.forEach(f => { f.animClock += dt; });
    if (before < 1.35 && introElapsed >= 1.35) {
      ui.speech.hidden = true;
      announce("ROUND 1", 650);
    }
    if (before < 2.1 && introElapsed >= 2.1) {
      announce("¡PELEA!", 600);
      sfx("fight");
    }
    if (introElapsed >= 2.65) state = "playing";
    return;
  }
  if (state === "finished") {
    resultElapsed += dt;
    updateParticles(dt);
    updateAfterimages(dt);
    screenShake = Math.max(0, screenShake - dt * 32);
    fighters.forEach(f => {
      f.actionTime = Math.max(0, f.actionTime - dt);
      f.flash = Math.max(0, f.flash - dt);
      if (!f.grounded) integrateBody(f, dt);
    });
    if (resultElapsed >= .8) ui.resultPanel.hidden = false;
    return;
  }
  if (hitStop > 0) {
    hitStop = Math.max(0, hitStop - dt);
    return;
  }

  roundTime = Math.max(0, roundTime - dt);
  if (roundTime <= 0) {
    finishRound(player.health === cpu.health ? null : player.health > cpu.health ? player : cpu, "TIEMPO");
    return;
  }
  fighters.forEach(f => {
    for (const name of ["invuln", "specialCooldown", "flash", "landingSquash", "guardTime", "crouchTime", "queueTime", "comboTime", "guardFlash"]) {
      f[name] = Math.max(0, f[name] - dt);
    }
    if (!f.queueTime) f.queuedAction = null;
    if (!f.comboTime) f.combo = 0;
    f.animClock += dt;
    f.power = Math.min(100, f.power + dt * 3.2);
    // Freeze attack direction through active/recovery frames.
    const other = f === player ? cpu : player;
    if (f.action === "idle" || f.action === "block") f.facing = other.x >= f.x ? 1 : -1;
  });
  updatePlayer(dt);
  if (aiEnabled) updateAI(dt);
  fighters.forEach(f => updateFighter(f, dt));
  separateFighters();
  // Capture both contacts before resolving so simultaneous hits can trade.
  const contacts = fighters.map(f => attackContact(f, f === player ? cpu : player)).filter(Boolean);
  contacts.forEach(contact => {
    contact.attacker.attackLanded = true;
    hit(contact.target, contact.damage, contact.direction * contact.knock, contact.lift, contact.attacker, contact);
  });
  if (state === "playing") updateProjectiles(dt);
  updateParticles(dt);
  updateAfterimages(dt);
  screenShake = Math.max(0, screenShake - dt * 32);
}

function setStance(f, down, guard) {
  const available = f.grounded && (f.action === "idle" || f.action === "block");
  f.crouching = available && down;
  f.guarding = available && guard;
}

function updatePlayer() {
  if (!player) return;
  setStance(player, held.down, held.guard);
  player.moveIntent = Number(held.right) - Number(held.left);
}

function updateAI(dt) {
  const dx = player.x - cpu.x;
  const distance = Math.abs(dx);
  const toward = Math.sign(dx) || 1;
  setStance(cpu, cpu.crouchTime > 0, cpu.guardTime > 0);
  if (isLocked(cpu)) return;
  aiClock -= dt;
  if (aiClock > 0) return;
  aiClock = .14 + Math.random() * .18;
  if (cpu.guarding || cpu.crouching) { cpu.moveIntent = 0; return; }
  const incoming = projectiles.some(p => p.owner === player && Math.abs(p.x - cpu.x) < 190 && (cpu.x - p.x) * p.vx > 0);
  const threatened = distance < 140 && ["punch", "kick"].includes(player.action);
  if ((incoming || threatened) && cpu.grounded && Math.random() < .55) {
    cpu.guardTime = .26 + Math.random() * .22;
    cpu.crouchTime = player.lowAttack ? cpu.guardTime : 0;
    setStance(cpu, cpu.crouchTime > 0, true);
    cpu.moveIntent = 0;
    return;
  }
  if (cpu.kind === "blotta" && cpu.power >= 30 && cpu.specialCooldown === 0 && distance < 260 && Math.random() < .075) {
    attack(cpu, "teleport");
    return;
  }
  if (cpu.kind === "tunki" && cpu.power >= 30 && cpu.specialCooldown === 0 && distance < 220 && cpu.grounded && Math.random() < .16) {
    attack(cpu, "slam");
    return;
  }
  if (distance > 120) {
    cpu.moveIntent = toward;
    if (distance > 255 && cpu.power >= 35 && cpu.specialCooldown === 0 && Math.random() < .22) attack(cpu, "special");
    else if (distance < 215 && cpu.grounded && Math.random() < .10) jump(cpu);
    return;
  }
  cpu.moveIntent = distance < 62 && Math.random() < .2 ? -toward : 0;
  const roll = Math.random();
  if (roll < .37) attack(cpu, "punch");
  else if (roll < .73) attack(cpu, "kick");
  else if (roll < .86 && cpu.grounded) {
    cpu.crouchTime = .42;
    setStance(cpu, true, false);
    attack(cpu, "kick");
  } else if (roll < .92) jump(cpu);
  else cpu.guardTime = .35;
}

function integrateBody(f, dt) {
  const wasOnFloor = f.grounded;
  if (!f.grounded) f.vy += 1650 * dt;
  f.x = Math.max(52, Math.min(908, f.x + f.vx * dt));
  f.y += f.vy * dt;
  if (f.y >= FLOOR) {
    f.y = FLOOR;
    f.vy = 0;
    f.grounded = true;
    if (!wasOnFloor) {
      f.landingSquash = .12;
      dustBurst(f.x, FLOOR, 7);
      if (f.action === "slam") {
        f.slamLanded = true;
        f.actionTime = f.actionDuration = .33;
        f.vx *= .15;
        f.landingSquash = .22;
        screenShake = 7;
        dustBurst(f.x, FLOOR, 24);
        burst(f.x, FLOOR - 12, "#ff77bc", 15);
        sfx("slam");
      }
    }
  } else f.grounded = false;
}

function updateFighter(f, dt) {
  const other = f === player ? cpu : player;
  if (f.action === "idle") {
    const speed = stats[f.kind].speed * (f.isPlayer ? 1 : .82);
    const desired = f.crouching || f.guarding ? 0 : f.moveIntent * speed;
    const acceleration = f.grounded ? (desired ? 29 : 36) : 3.5;
    f.vx += (desired - f.vx) * (1 - Math.exp(-acceleration * dt));
  } else if (f.grounded) {
    f.vx *= Math.exp(-7 * dt);
  }
  if (f.action === "teleport") f.vx = f.vy = 0;
  if (f.action === "slam" && !f.slamLanded) {
    const elapsed = f.actionDuration - f.actionTime;
    if (!f.slamLaunched && elapsed >= MOVES.slam.startup) {
      f.slamLaunched = true;
      f.grounded = false;
      f.vy = f.slamFromAir ? 180 : -680;
      f.vx = Math.max(-320, Math.min(320, (other.x - f.x) * 2.6));
      dustBurst(f.x, f.y, 8);
    }
    if (f.slamLaunched && f.vy >= 0 && !f.slamDiving) {
      f.slamDiving = true;
      f.vy = 850;
      f.vx *= .35;
    }
  }
  integrateBody(f, dt);
  if (f.grounded && Math.abs(f.vx) > 18) f.walkPhase += Math.abs(f.vx) * dt / 35;

  if (f.actionTime > 0) {
    f.actionTime = Math.max(0, f.actionTime - dt);
    const elapsed = f.actionDuration - f.actionTime;
    if (f.action === "special" && elapsed >= f.moveSpec.startup && !f.specialSpawned) {
      f.specialSpawned = true;
      spawnProjectile(f, f.specialStyle);
    }
    if (f.action === "teleport") {
      if (elapsed >= .10 && !f.teleportSmokeStarted) {
        f.teleportSmokeStarted = true;
        smokeBurst(f.x, FLOOR - 70, 20);
      }
      if (elapsed >= .31 && !f.teleportDone) {
        f.teleportDone = true;
        const direction = f.teleportDirection;
        let destination = direction ? f.x + direction * 235 : other.x + (f.x < other.x ? 110 : -110);
        destination = Math.max(65, Math.min(895, destination));
        if (Math.abs(destination - other.x) < 68) destination = other.x < 480 ? other.x + 110 : other.x - 110;
        f.x = f.prevX = Math.max(65, Math.min(895, destination));
        f.facing = other.x >= f.x ? 1 : -1;
        smokeBurst(f.x, FLOOR - 70, 22);
      }
    }
    if (f.actionTime === 0) {
      f.action = "idle";
      f.actionDuration = 0;
      f.moveSpec = null;
      f.lowAttack = f.airAttack = false;
      setStance(f, f.isPlayer ? held.down : f.crouchTime > 0, f.isPlayer ? held.guard : f.guardTime > 0);
    }
  }
  if (f.queuedAction && f.queueTime > 0) {
    // A connected punch can cancel into a kick or special; other inputs wait for recovery.
    const canCancel = f.action === "punch" && f.attackLanded && ["kick", "special"].includes(f.queuedAction);
    if (!isLocked(f) || canCancel) {
      const queued = f.queuedAction;
      if (queued !== "jump" || f.grounded) {
        f.queuedAction = null;
        f.queueTime = 0;
        if (canCancel) { f.action = "idle"; f.actionTime = 0; }
        if (queued === "jump") jump(f);
        else attack(f, queued);
      }
    }
  }
  const progress = actionProgress(f);
  if ((f.action === "slam" && f.slamDiving && !f.slamLanded) || (f.action === "kick" && progress > .2 && progress < .72) || (f.action === "special" && progress > .3 && progress < .65)) {
    f.trailClock -= dt;
    if (f.trailClock <= 0) { addAfterimage(f); f.trailClock = .06; }
  } else f.trailClock = 0;
}

function hurtBox(f) {
  const low = f.crouching || f.lowAttack;
  const height = low ? 124 : stats[f.kind].height;
  const width = stats[f.kind].width;
  return { left: f.x - width, right: f.x + width, top: f.y - height, bottom: f.y - 4 };
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isVanished(f) {
  if (f.action !== "teleport") return false;
  const elapsed = f.actionDuration - f.actionTime;
  return elapsed >= .16 && elapsed < .45;
}

function attackContact(f, target) {
  if (f.action === "slam") return slamContact(f, target);
  if (f.attackLanded || !["punch", "kick"].includes(f.action) || isVanished(target) || target.invuln > 0) return null;
  const spec = f.moveSpec;
  const elapsed = f.actionDuration - f.actionTime;
  if (elapsed < spec.startup || elapsed > spec.startup + spec.active) return null;
  const front = f.x + f.facing * spec.reach;
  const low = f.lowAttack;
  const centerY = f.y - (low ? (f.action === "kick" ? 34 : 67) : (f.action === "punch" ? (f.kind === "sergio" ? 88 : 145) : 120));
  const thickness = f.action === "punch" ? 14 : 20;
  const box = { left: Math.min(f.x, front), right: Math.max(f.x, front), top: centerY - thickness, bottom: centerY + thickness };
  if (!overlaps(box, hurtBox(target))) return null;
  return {
    attacker: f, target, damage: spec.damage + (f.kind === "sergio" && f.action === "punch" ? 2 : 0),
    knock: spec.knock, lift: f.airAttack ? -120 : 0, direction: f.facing, low,
    sourceX: f.x, projectile: false, x: (front + target.x) / 2, y: centerY
  };
}

function slamContact(f, target) {
  if (f.attackLanded || !f.slamDiving || isVanished(target) || target.invuln > 0) return null;
  if (f.slamLanded && f.actionTime < .24) return null;
  const radius = f.slamLanded ? 100 : 49;
  const box = { left: f.x - radius, right: f.x + radius, top: f.y - 65, bottom: f.y + 5 };
  if (!overlaps(box, hurtBox(target))) return null;
  const direction = Math.sign(target.x - f.x) || f.facing;
  return { attacker: f, target, damage: MOVES.slam.damage, knock: MOVES.slam.knock, lift: -180,
    direction, sourceX: f.x, low: false, overhead: true, projectile: false, x: target.x, y: Math.min(f.y, target.y - 80) };
}

function separateFighters() {
  if (fighters.some(isVanished)) return;
  if (!overlaps(hurtBox(player), hurtBox(cpu))) return;
  const dx = cpu.x - player.x;
  const spacing = stats[player.kind].width + stats[cpu.kind].width + 2;
  const overlap = spacing - Math.abs(dx);
  if (overlap <= 0) return;
  const sign = Math.sign(dx) || 1;
  player.x = Math.max(52, Math.min(908, player.x - sign * overlap / 2));
  cpu.x = Math.max(52, Math.min(908, cpu.x + sign * overlap / 2));
  // Transfer the unfulfilled push when a fighter is already against the stage edge.
  if (Math.abs(cpu.x - player.x) < spacing) {
    if (player.x === 52 || player.x === 908) cpu.x = player.x + sign * spacing;
    else player.x = cpu.x - sign * spacing;
  }
}

function queueAction(f, type) {
  f.queuedAction = type;
  f.queueTime = .18;
}

function jump(f) {
  if (state !== "playing" || !f) return false;
  if (!f.grounded || isLocked(f)) {
    if (f.isPlayer) queueAction(f, "jump");
    return false;
  }
  f.crouching = f.guarding = false;
  f.vy = -stats[f.kind].jump;
  f.vx = f.moveIntent * stats[f.kind].speed * .92;
  f.grounded = false;
  dustBurst(f.x, FLOOR, 4);
  sfx("jump");
  return true;
}

function attack(f, type) {
  if (state !== "playing" || !f || !["punch", "kick", "special", "teleport", "slam"].includes(type)) return false;
  if (type === "teleport" && f.kind !== "blotta") return false;
  if (type === "slam" && f.kind !== "tunki") return false;
  if (isLocked(f)) {
    if (f.isPlayer) queueAction(f, type);
    return false;
  }
  const cost = type === "special" ? 35 : ["teleport", "slam"].includes(type) ? 30 : 0;
  if (cost && (f.power < cost || f.specialCooldown > 0 || (!f.grounded && type !== "slam"))) {
    if (f.isPlayer) sfx("empty");
    return false;
  }
  const low = f.grounded && (f.isPlayer ? held.down : f.crouching) && !cost;
  f.moveSpec = MOVES[low ? (type === "kick" ? "lowKick" : "lowPunch") : type];
  f.action = type;
  f.actionDuration = f.moveSpec.startup + f.moveSpec.active + f.moveSpec.recovery;
  f.actionTime = f.actionDuration;
  f.attackLanded = false;
  f.lowAttack = low;
  f.airAttack = !f.grounded;
  f.crouching = low;
  f.guarding = false;
  f.queuedAction = null;
  f.queueTime = 0;
  f.power -= cost;
  if (cost) f.specialCooldown = type === "special" ? .7 : 1.35;
  if (type === "slam") {
    f.slamLaunched = f.slamDiving = f.slamLanded = false;
    f.slamFromAir = !f.grounded;
    f.vx = 0;
    if (!f.grounded) f.vy = -90;
  } else if (type === "teleport") {
    f.teleportDirection = f.isPlayer ? Number(held.right) - Number(held.left) : 0;
    f.teleportDone = f.teleportSmokeStarted = false;
    f.vx = f.vy = 0;
  } else if (type === "special") {
    f.specialSpawned = false;
    f.specialStyle = f.kind === "sergio" ? (f.projectileToggle++ % 2 ? "bottle" : "meat") : f.kind === "tunki" ? "flowers" : "ki";
    f.vx = 0;
  } else if (type === "kick" && !low && f.grounded) {
    f.vy = -260;
    f.vx = f.facing * 260;
    f.grounded = false;
    f.airAttack = true;
  } else if (f.grounded) {
    f.vx = f.facing * (low ? 35 : f.kind === "sergio" ? 180 : 105);
  }
  sfx(type);
  return true;
}

function spawnProjectile(owner, style) {
  const config = style === "ki" ? { speed: 470, damage: 13, radius: 16 } :
    style === "flowers" ? { speed: 405, damage: 14, radius: 20 } :
    style === "bottle" ? { speed: 425, damage: 12, radius: 16 } : { speed: 395, damage: 10, radius: 19 };
  projectiles.push({
    owner, style, x: owner.x + owner.facing * 58, y: owner.y - 143,
    vx: owner.facing * config.speed, vy: style === "ki" ? 0 : -42,
    damage: config.damage, radius: config.radius, life: 2.5, spin: 0, trailTime: 0
  });
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.spin += dt * 8;
    if (p.style !== "ki") { p.vy += 82 * dt; p.y += p.vy * dt; }
    if (p.style === "flowers") {
      p.trailTime -= dt;
      if (p.trailTime <= 0) { burst(p.x, p.y, "#ff81c5", 1); p.trailTime = .06; }
    }
    const target = p.owner === player ? cpu : player;
    const box = { left: p.x - p.radius, right: p.x + p.radius, top: p.y - p.radius, bottom: p.y + p.radius };
    if (!isVanished(target) && target.invuln <= 0 && overlaps(box, hurtBox(target))) {
      hit(target, p.damage, Math.sign(p.vx) * 180, 0, p.owner,
        { direction: Math.sign(p.vx), sourceX: p.x - Math.sign(p.vx) * p.radius, projectile: true, low: false, x: p.x, y: p.y });
      if (p.style === "flowers") burst(p.x, p.y, "#ff72bb", 15);
      projectiles.splice(i, 1);
      if (state !== "playing") return;
    } else if (p.life <= 0 || p.x < -50 || p.x > 1010 || p.y > FLOOR) projectiles.splice(i, 1);
  }
}

function hit(target, damage, knockX, knockY, attacker, contact = {}) {
  if (target.invuln > 0 || isVanished(target) || state !== "playing") return false;
  const sourceX = contact.sourceX ?? attacker.x;
  const inFront = (sourceX - target.x) * target.facing >= 0;
  const blocking = target.guarding && target.grounded && inFront && (!contact.low || target.crouching)
    && (!contact.overhead || !target.crouching)
    && ["idle", "block"].includes(target.action);
  if (blocking) {
    target.health = Math.max(0, target.health - (contact.projectile ? 1 : 0));
    target.power = Math.min(100, target.power + 4);
    target.action = "block";
    target.actionDuration = .15;
    target.actionTime = .15;
    target.vx = knockX * .24;
    target.invuln = .08;
    target.guardFlash = .20;
    burst(target.x + target.facing * 32, target.y - (target.crouching ? 65 : 134), "#8cecff", 6);
    hitStop = .025;
    sfx("block");
  } else {
    target.health = Math.max(0, target.health - damage);
    target.power = Math.min(100, target.power + damage * .8);
    attacker.power = Math.min(100, attacker.power + damage * .7);
    attacker.combo = attacker.comboTime > 0 ? attacker.combo + 1 : 1;
    attacker.comboTime = .72;
    target.invuln = .09;
    target.action = "hit";
    target.actionDuration = .23 + damage * .005;
    target.actionTime = target.actionDuration;
    target.vx = knockX;
    target.vy = knockY;
    target.grounded = knockY === 0 && target.y >= FLOOR;
    target.crouching = target.guarding = target.lowAttack = false;
    target.queuedAction = null;
    target.flash = .13;
    screenShake = damage > 11 ? 4 : 2.5;
    hitStop = damage > 11 ? .055 : .035;
    burst(contact.x ?? target.x, contact.y ?? target.y - 104, "#ffd55b", 11);
    sfx("hit");
    if (navigator.vibrate) navigator.vibrate(15);
  }
  if (target.health <= 0) finishRound(attacker, "K.O.");
  return true;
}

function finishRound(winner, reason) {
  if (state !== "playing") return;
  state = "finished";
  resultElapsed = 0;
  setPauseUI(false);
  clearHeld();
  ui.resultKicker.textContent = reason;
  ui.resultTitle.textContent = !winner ? "EMPATE" : winner === player ? "¡GANASTE!" : stats[winner.kind].name + " GANA";
  announce(reason, 750);
  sfx(winner === player ? "win" : "lose");
}

function isLocked(f) {
  return f.action !== "idle" && f.actionTime > 0;
}

function actionProgress(f) {
  if (!f.actionDuration) return 0;
  return Math.max(0, Math.min(1, 1 - f.actionTime / f.actionDuration));
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 70 + Math.random() * 230;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .25, color, size: 3 + Math.random() * 6 });
  }
}

function dustBurst(x, y, count) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x + (Math.random() - .5) * 44,
      y,
      vx: (Math.random() - .5) * 95,
      vy: -20 - Math.random() * 75,
      gravity: 105,
      life: .28 + Math.random() * .22,
      color: Math.random() > .5 ? "#d7b26c" : "#7f6844",
      size: 3 + Math.random() * 7
    });
  }
}

function smokeBurst(x, y, count) {
  for (let i = 0; i < count; i++) {
    const life = .4 + Math.random() * .38;
    particles.push({
      x: x + (Math.random() - .5) * 78, y: y + (Math.random() - .5) * 132,
      vx: (Math.random() - .5) * 95, vy: -22 - Math.random() * 58,
      gravity: -12, life, maxLife: life, smoke: true,
      color: ["#d9d5ed", "#8d88ab", "#bbb5d5"][i % 3], size: 18 + Math.random() * 22
    });
  }
}

function addAfterimage(f) {
  afterimages.push({
    kind: f.kind,
    pose: poseFor(f),
    x: f.x,
    y: f.y,
    facing: f.facing,
    motion: fighterMotion(f),
    life: .18,
    maxLife: .18
  });
}

function updateAfterimages(dt) {
  for (let i = afterimages.length - 1; i >= 0; i--) {
    afterimages[i].life -= dt;
    if (afterimages[i].life <= 0) afterimages.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.gravity ?? 620) * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function draw() {
  const shakeX = screenShake ? (Math.random() - .5) * screenShake : 0;
  const shakeY = screenShake ? (Math.random() - .5) * screenShake * .55 : 0;
  const parallaxX = Math.sin(stageTime * .55) * 2;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  if (assets.arena.complete) ctx.drawImage(assets.arena, -8 + parallaxX, -5, 976, 550);
  else { ctx.fillStyle = "#16263a"; ctx.fillRect(0, 0, 960, 540); }

  const vignette = ctx.createLinearGradient(0, 0, 0, 540);
  vignette.addColorStop(0, "rgba(5,10,22,.12)");
  vignette.addColorStop(.75, "rgba(5,8,14,0)");
  vignette.addColorStop(1, "rgba(2,3,8,.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 960, 540);

  const floorShade = ctx.createLinearGradient(0, 405, 0, 540);
  floorShade.addColorStop(0, "rgba(4,8,15,0)");
  floorShade.addColorStop(1, "rgba(2,4,10,.28)");
  ctx.fillStyle = floorShade;
  ctx.fillRect(0, 400, 960, 140);

  drawShadow(player);
  drawShadow(cpu);
  afterimages.forEach(drawAfterimage);
  fighters.slice().sort((a, b) => a.x - b.x).forEach(drawFighter);
  projectiles.forEach(drawProjectile);
  particles.forEach(drawParticle);
  ctx.restore();
}

function poseFor(f) {
  const progress = actionProgress(f);
  if (f.action === "hit") return POSES[f.kind].hit;
  // Frames 6–11 come from the movement atlas, with separate jump and guard poses.
  if (f.action === "teleport") return 11;
  if (f.action === "slam") return f.slamLanded ? 11 : f.slamDiving ? POSES.tunki.slam : f.slamLaunched ? 10 : 8;
  if (f.guarding || f.action === "block") return 9;
  if (f.lowAttack) return f.kind === "blotta" && f.action === "kick" ? POSES.blotta.sweep : 8;
  if (f.action === "punch") {
    return progress < .16 || progress > .86 ? POSES[f.kind].idle : f.kind === "sergio" ? 11 : POSES[f.kind].punch;
  }
  if (f.action === "kick") return progress < .12 ? POSES[f.kind].idle : POSES[f.kind].kick;
  if (f.action === "special") {
    if (progress < .15) return POSES[f.kind].idle;
    if (f.kind === "blotta") return POSES.blotta.power;
    if (f.kind === "tunki") return POSES.tunki.power;
    return f.projectileToggle % 2 ? POSES.sergio.meat : POSES.sergio.bottle;
  }
  if (f.crouching) return 8;
  if (!f.grounded) return 10;
  if (Math.abs(f.vx) > 22) return [6, 0, 7, 0][Math.floor(f.walkPhase) % 4];
  return POSES[f.kind].idle;
}

function drawShadow(f) {
  if (isVanished(f)) return;
  const lift = Math.max(0, FLOOR - f.y);
  ctx.save();
  ctx.globalAlpha = .32 * Math.max(.3, 1 - lift / 430);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(f.x, FLOOR + 2, Math.max(15, 45 - lift * .04), Math.max(3, 8 - lift * .012), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function fighterMotion(f) {
  const motion = { dx: 0, dy: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const progress = actionProgress(f);
  const moving = f.grounded && f.action === "idle" && Math.abs(f.vx) > 18;

  if (f.action === "idle") {
    if (moving) {
      const step = Math.sin(f.walkPhase * Math.PI);
      motion.dy -= Math.abs(step) * 3.4;
      motion.rotation = step * .018 * f.facing;
      motion.scaleX += Math.abs(step) * .018;
      motion.scaleY -= Math.abs(step) * .014;
    } else if (f.grounded) {
      const breath = Math.sin(f.animClock * 3.7);
      motion.dy -= 1.4 + breath * 1.15;
      motion.scaleX -= breath * .01;
      motion.scaleY += breath * .014;
    }
  }

  if (!f.grounded && f.action === "idle") {
    motion.dy -= Math.sin(f.animClock * 5) * 1.5;
    motion.rotation -= f.facing * Math.max(-.045, Math.min(.045, f.vx / 5000));
  }
  if (f.crouching && (f.guarding || f.action === "block")) {
    motion.scaleY = .69;
    motion.scaleX = 1.04;
  }
  if (f.guarding) {
    motion.rotation = f.facing * .025;
    motion.dx -= f.facing * (2 + f.guardFlash * 22);
  }

  const wave = Math.sin(Math.PI * progress);
  if (f.action === "punch") {
    const anticipation = progress < .22 ? -5 * (progress / .22) : 0;
    motion.dx += f.facing * (anticipation + 15 * wave);
    motion.rotation -= f.facing * .038 * wave;
    motion.scaleX += .055 * wave;
    motion.scaleY -= .025 * wave;
  } else if (f.action === "kick") {
    motion.dx += f.facing * 10 * wave;
    motion.dy -= 8 * wave;
    motion.rotation -= f.facing * .07 * wave;
    motion.scaleX += .06 * wave;
    motion.scaleY -= .025 * wave;
  } else if (f.action === "special") {
    const pulse = Math.sin(progress * Math.PI * 4);
    motion.dy -= 2 + Math.abs(pulse) * 2.4;
    motion.scaleX += Math.abs(pulse) * .025;
    motion.scaleY += Math.abs(pulse) * .025;
  } else if (f.action === "hit") {
    motion.dx -= f.facing * 11 * wave;
    motion.rotation -= f.facing * .095 * wave;
    motion.scaleX -= .04 * wave;
    motion.scaleY += .025 * wave;
  }

  if (f.landingSquash > 0) {
    const impact = f.landingSquash / .16;
    motion.scaleX += .09 * impact;
    motion.scaleY -= .12 * impact;
    motion.dy += 3 * impact;
  }

  return motion;
}

function drawMotionLines(f, motion) {
  const progress = actionProgress(f);
  const active = (f.action === "kick" && progress > .16 && progress < .78)
    || (f.action === "punch" && progress > .2 && progress < .65);

  if (active) {
    ctx.save();
    ctx.globalAlpha = .28 * Math.sin(Math.PI * progress);
    ctx.strokeStyle = f.kind === "sergio" ? "#ffe165" : f.kind === "tunki" ? "#ff88ce" : "#8fe5ff";
    ctx.lineCap = "square";
    for (let i = 0; i < 4; i++) {
      const y = f.y - 55 - i * 18 + motion.dy;
      const front = f.x + motion.dx - f.facing * (34 + i * 5);
      ctx.lineWidth = 5 - i * .7;
      ctx.beginPath();
      ctx.moveTo(front, y);
      ctx.lineTo(front - f.facing * (42 + i * 13), y + i * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (f.action === "special" && progress > .1 && progress < .72) {
    ctx.save();
    ctx.globalAlpha = .34;
    ctx.strokeStyle = f.kind === "blotta" ? "#69dbff" : f.kind === "tunki" ? "#ff88ce" : "#ffbf3d";
    ctx.lineWidth = 3;
    const radius = 48 + Math.sin(progress * Math.PI * 5) * 8;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 82, radius, radius * .68, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSpriteFrame(frame, alpha = 1, ghost = false) {
  const movement = frame.pose >= 6;
  const image = assets[frame.kind + (movement ? "Motion" : "")];
  if (!image.complete || !image.naturalWidth) return;
  const pose = frame.pose % 6;
  const cell = 270;
  const sx = (pose % 3) * cell;
  const sy = Math.floor(pose / 3) * cell;
  const size = stats[frame.kind].size;
  const needsFlip = frame.facing !== stats[frame.kind].defaultFace;
  const motion = frame.motion;

  ctx.save();
  ctx.translate(frame.x + motion.dx, frame.y + motion.dy);
  ctx.rotate(motion.rotation);
  ctx.scale((needsFlip ? -1 : 1) * motion.scaleX, motion.scaleY);
  ctx.globalAlpha = alpha;
  if (ghost) ctx.globalCompositeOperation = "screen";
  const baseline = movement || frame.kind !== "blotta" ? 260 : (pose === 4 ? 265 : 269);
  ctx.drawImage(image, sx, sy, cell, cell, -size / 2, -size * baseline / cell, size, size);
  ctx.restore();
}

function drawAfterimage(ghost) {
  drawSpriteFrame(ghost, (ghost.life / ghost.maxLife) * .16, true);
}

function drawFighter(f) {
  const motion = fighterMotion(f);
  drawMotionLines(f, motion);
  const flashing = f.flash > 0 && Math.floor(f.flash * 40) % 2 === 0;
  let opacity = flashing ? .55 : 1;
  if (f.action === "teleport") {
    const elapsed = f.actionDuration - f.actionTime;
    opacity *= elapsed < .16 ? 1 - elapsed / .16 : elapsed < .45 ? 0 : Math.min(1, (elapsed - .45) / .18);
  }
  const x = f.prevX + (f.x - f.prevX) * renderAlpha;
  const y = f.prevY + (f.y - f.prevY) * renderAlpha;
  drawSpriteFrame({ kind: f.kind, pose: poseFor(f), x, y, facing: f.facing, motion }, opacity);
  if (f.guarding || f.guardFlash > 0) {
    ctx.save();
    ctx.globalAlpha = .35 + f.guardFlash * 2;
    ctx.strokeStyle = "#8ddfff";
    ctx.lineWidth = f.guardFlash > 0 ? 4 : 2;
    ctx.beginPath();
    const centerY = f.y - (f.crouching ? 72 : 136);
    ctx.arc(f.x + f.facing * 20, centerY, 35, f.facing > 0 ? -1.2 : Math.PI - 1.2, f.facing > 0 ? 1.2 : Math.PI + 1.2);
    ctx.stroke();
    ctx.restore();
  }
  if (f.combo > 1 && f.comboTime > 0) {
    ctx.save();
    ctx.font = "italic bold 20px Arial";
    ctx.fillStyle = "#ffe47a";
    ctx.strokeStyle = "#14121d";
    ctx.lineWidth = 4;
    const label = f.combo + " HITS";
    ctx.strokeText(label, f.isPlayer ? 32 : 810, 124);
    ctx.fillText(label, f.isPlayer ? 32 : 810, 124);
    ctx.restore();
  }
}

function drawProjectile(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.style === "ki" ? 0 : p.spin * Math.sign(p.vx));
  if (p.style === "ki") {
    const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 31);
    glow.addColorStop(0, "#ffffff");
    glow.addColorStop(.3, "#75e4ff");
    glow.addColorStop(.7, "#167ceb");
    glow.addColorStop(1, "rgba(15,70,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(-34, -34, 68, 68);
    ctx.strokeStyle = "#bdf6ff";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 15 + Math.sin(stageTime * 18)*2, 0, Math.PI*2); ctx.stroke();
  } else if (p.style === "flowers") {
    // Pixel flowers share one bouquet-shaped projectile and shed petals on impact.
    for (const [x, y, color] of [[-10, -8, "#ff4fa0"], [11, -3, "#ffb8e5"], [0, 12, "#ec4adc"]]) {
      ctx.fillStyle = "#12391c";
      ctx.fillRect(x - 3, y, 6, 19);
      ctx.fillStyle = "#74cc55";
      ctx.fillRect(x, y + 8, 10, 4);
      ctx.fillStyle = "#582345";
      ctx.fillRect(x - 13, y - 7, 26, 14);
      ctx.fillRect(x - 7, y - 13, 14, 26);
      ctx.fillStyle = color;
      ctx.fillRect(x - 11, y - 5, 22, 10);
      ctx.fillRect(x - 5, y - 11, 10, 22);
      ctx.fillStyle = "#ffe876";
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }
  } else {
    ctx.font = "44px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 3;
    ctx.fillText(p.style === "meat" ? "🥩" : "🍾", 0, 0);
  }
  ctx.restore();
}

function drawParticle(p) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, p.life * 4);
  ctx.fillStyle = p.color;
  if (p.smoke) {
    const age = 1 - p.life / p.maxLife;
    ctx.globalAlpha = Math.min(1, p.life * 4) * .72;
    const radius = p.size * (.6 + age * .8);
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.arc(p.x + radius * .6, p.y + radius * .2, radius * .68, 0, Math.PI * 2);
    ctx.fill();
  } else ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  ctx.restore();
}

function updateHud() {
  if (!player || !cpu) return;
  ui.leftHealth.style.width = `${player.health}%`;
  ui.rightHealth.style.width = `${cpu.health}%`;
  ui.leftPower.style.width = `${player.power}%`;
  ui.rightPower.style.width = `${cpu.power}%`;
  ui.timer.textContent = String(Math.ceil(roundTime)).padStart(2, "0");
  document.querySelector('[data-tap="special"]').classList.toggle("ready", player.power >= 35 && player.specialCooldown === 0);
  ui.abilityBtn.classList.toggle("ready", player.power >= 30 && player.specialCooldown === 0);
}

function setPauseUI(paused) {
  ui.pauseBtn.textContent = paused ? "SEGUIR" : "PAUSA";
  ui.pauseBtn.classList.toggle("resume", paused);
  ui.pauseBtn.setAttribute("aria-label", paused ? "Reanudar juego" : "Pausar juego");
  ui.gameScreen.classList.toggle("paused", paused);
  document.getElementById("pauseHelp").hidden = !paused;
}

function togglePause() {
  if (state === "playing" || state === "intro") {
    pauseFrom = state;
    state = "paused";
    clearHeld();
    fighters.forEach(f => { f.queuedAction = null; });
    setPauseUI(true);
    announce("PAUSA");
  } else if (state === "paused") {
    state = pauseFrom;
    clearHeld();
    lastTime = performance.now();
    accumulator = 0;
    setPauseUI(false);
    ui.announcement.classList.remove("show");
  }
}

function loop(now) {
  const dt = Math.max(0, Math.min(.1, (now - lastTime) / 1000));
  lastTime = now;
  accumulator += dt;
  while (accumulator >= STEP) {
    update(STEP);
    accumulator -= STEP;
  }
  renderAlpha = state === "paused" ? 1 : accumulator / STEP;
  if (["intro", "playing", "paused", "finished"].includes(state)) {
    draw();
    updateHud();
  }
  requestAnimationFrame(loop);
}

function ensureAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  if (!audioCtx) audioCtx = new Audio();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
}

function tone(freq, duration, type = "square", volume = .045, slide = 0) {
  if (muted) return;
  ensureAudio();
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), audioCtx.currentTime + duration);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function sfx(name) {
  if (muted) return;
  const sounds = {
    start: () => { tone(130, .12); setTimeout(() => tone(195, .18), 110); },
    move: () => tone(290, .055, "square", .025, 70),
    confirm: () => { tone(330, .08, "square", .035); setTimeout(() => tone(660, .14, "square", .035), 70); },
    fight: () => { tone(260, .12, "sawtooth", .05, 380); setTimeout(() => tone(520, .18), 100); },
    jump: () => tone(170, .11, "square", .025, 180),
    punch: () => tone(95, .08, "sawtooth", .04, -40),
    kick: () => tone(130, .12, "sawtooth", .045, -80),
    hit: () => { tone(62, .13, "square", .07, -22); tone(145, .05, "sawtooth", .035, -80); },
    special: () => { tone(220, .23, "sawtooth", .045, 380); setTimeout(() => tone(540, .12, "square", .03, -100), 80); },
    teleport: () => { tone(400, .23, "sine", .04, -330); tone(95, .36, "triangle", .03, 620); },
    slam: () => { tone(88, .22, "triangle", .075, -60); tone(48, .14, "sawtooth", .045, -20); },
    block: () => tone(720, .07, "triangle", .05, -370),
    empty: () => tone(70, .08, "square", .025),
    win: () => [0, 130, 260].forEach((d, i) => setTimeout(() => tone([330, 440, 660][i], .24), d)),
    lose: () => { tone(220, .25, "sawtooth", .04, -100); setTimeout(() => tone(105, .45, "square", .04, -55), 180); }
  };
  (sounds[name] || (() => {}))();
}

ui.startBtn.addEventListener("click", openSelection);

document.querySelectorAll("[data-pick]").forEach(btn => {
  btn.addEventListener("click", () => chooseFighter(btn.dataset.pick));
  btn.addEventListener("dblclick", () => {
    chooseFighter(btn.dataset.pick, false);
    sfx("confirm");
    startGame(playerChoice);
  });
});

ui.confirmBtn.addEventListener("click", () => {
  sfx("confirm");
  startGame(playerChoice);
});

document.getElementById("rematchBtn").addEventListener("click", () => startGame(playerChoice));
document.getElementById("selectBtn").addEventListener("click", () => {
  openSelection();
});
ui.pauseBtn.addEventListener("click", togglePause);

ui.soundBtn.addEventListener("click", () => {
  muted = !muted;
  ui.soundBtn.textContent = muted ? "🔇" : "🔊";
  ui.soundBtn.setAttribute("aria-label", muted ? "Activar sonido" : "Desactivar sonido");
  if (!muted) sfx("start");
});

const HOLD_KEYS = {
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  KeyS: "down", ArrowDown: "down", KeyI: "guard", ShiftLeft: "guard", ShiftRight: "guard"
};
const TAP_KEYS = { KeyW: "jump", ArrowUp: "jump", KeyJ: "punch", KeyK: "kick", KeyL: "special", KeyH: "ability" };

function refreshHeld() {
  Object.keys(held).forEach(action => {
    held[action] = [...keyHolds].some(code => HOLD_KEYS[code] === action)
      || [...touchHolds.values()].some(value => value === action);
  });
}

function performAction(action) {
  if (state !== "playing") return;
  updatePlayer();
  if (action === "jump") jump(player);
  else if (action === "ability") attack(player, stats[player.kind].ability);
  else attack(player, action);
}

window.addEventListener("keydown", event => {
  const code = event.code || (event.key === " " ? "Space" : event.key.length === 1 ? "Key" + event.key.toUpperCase() : event.key);
  if (code in HOLD_KEYS || code in TAP_KEYS || ["Space", "Enter", "Escape"].includes(code)) event.preventDefault();
  if (event.repeat) return;
  if (state === "title") {
    if (code === "Enter" || code === "Space") openSelection();
    return;
  }
  if (state === "select") {
    if (["KeyA", "KeyD", "ArrowLeft", "ArrowRight"].includes(code)) {
      const direction = code === "KeyA" || code === "ArrowLeft" ? -1 : 1;
      chooseFighter(roster[(roster.indexOf(playerChoice) + direction + roster.length) % roster.length]);
    }
    if (["Enter", "Space", "KeyJ"].includes(code)) startGame(playerChoice);
    return;
  }
  if (code === "Space" || code === "Escape") { togglePause(); return; }
  if (state !== "playing") return;
  if (code in HOLD_KEYS) {
    keyHolds.add(code);
    refreshHeld();
    updatePlayer();
  }
  if (code in TAP_KEYS) performAction(TAP_KEYS[code]);
});

window.addEventListener("keyup", event => {
  const code = event.code || (event.key.length === 1 ? "Key" + event.key.toUpperCase() : event.key);
  keyHolds.delete(code);
  refreshHeld();
  if (state === "playing") updatePlayer();
});

function pauseOnLeave() {
  clearHeld();
  if (state === "playing" || state === "intro") togglePause();
}
window.addEventListener("blur", pauseOnLeave);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseOnLeave();
});

document.querySelectorAll("[data-hold]").forEach(btn => {
  btn.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (state !== "playing") return;
    if (event.pointerType === "touch") document.body.classList.add("touch-device");
    btn.setPointerCapture(event.pointerId);
    touchHolds.set(event.pointerId, btn.dataset.hold);
    refreshHeld();
    updatePlayer();
    btn.classList.add("active");
  });
  const release = event => {
    touchHolds.delete(event.pointerId);
    refreshHeld();
    if (state === "playing") updatePlayer();
    btn.classList.toggle("active", [...touchHolds.values()].includes(btn.dataset.hold));
  };
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => btn.addEventListener(name, release));
});

document.querySelectorAll("[data-tap]").forEach(btn => {
  btn.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (state !== "playing") return;
    btn.setPointerCapture(event.pointerId);
    btn.classList.add("active");
    performAction(btn.dataset.tap);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(name =>
    btn.addEventListener(name, () => btn.classList.remove("active")));
});

document.addEventListener("pointerdown", event => {
  if (event.pointerType === "touch") document.body.classList.add("touch-device");
}, { passive: true });

document.addEventListener("contextmenu", event => {
  if (state !== "title" && state !== "select") event.preventDefault();
});

requestAnimationFrame(loop);
