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
  pauseBtn: document.getElementById("pauseBtn")
};

const assets = {
  arena: loadImage("assets/arena.jpg"),
  sergio: loadImage("assets/sergio-atlas-v2.png"),
  blotta: loadImage("assets/blotta-atlas-v2-clean.png")
};

const POSES = {
  sergio: { idle: 0, punch: 1, kick: 2, hit: 3, meat: 4, bottle: 5 },
  blotta: { idle: 0, punch: 1, kick: 2, sweep: 3, hit: 4, power: 5 }
};

const stats = {
  sergio: { name: "SERGIO", speed: 245, jump: 650, defaultFace: 1 },
  blotta: { name: "BLOTTA", speed: 265, jump: 680, defaultFace: -1 }
};

let state = "title";
let playerChoice = "sergio";
let player = null;
let cpu = null;
let fighters = [];
let projectiles = [];
let particles = [];
let afterimages = [];
let held = { left: false, right: false };
let roundTime = 60;
let secondAccumulator = 0;
let lastTime = performance.now();
let introToken = 0;
let aiClock = 0;
let screenShake = 0;
let stageTime = 0;
let muted = false;
let audioCtx = null;

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img;
}

function makeFighter(kind, x, isPlayer) {
  return {
    kind, x, y: 438, vx: 0, vy: 0, health: 100, power: 32,
    isPlayer, grounded: true, action: "idle", actionTime: 0,
    actionDuration: 0, animClock: Math.random() * 4, trailClock: 0,
    specialSpawned: false, specialStyle: "ki",
    queuedAction: null, queueTime: 0,
    landingSquash: 0, wasGrounded: true,
    attackLanded: false, invuln: 0, specialCooldown: 0,
    projectileToggle: 0, facing: x < 480 ? 1 : -1, flash: 0
  };
}

function showScreen(screen) {
  [ui.titleScreen, ui.selectScreen, ui.gameScreen].forEach(node => {
    node.classList.toggle("active", node === screen);
  });
}

function chooseFighter(kind, playSound = true) {
  playerChoice = kind;
  document.querySelectorAll("[data-pick]").forEach(button => {
    button.classList.toggle("selected", button.dataset.pick === kind);
  });
  document.querySelectorAll("[data-portrait]").forEach(portrait => {
    portrait.classList.toggle("selected", portrait.dataset.portrait === kind);
  });
  if (playSound) sfx("move");
}

function openSelection() {
  introToken++;
  state = "select";
  held.left = held.right = false;
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
  const other = choice === "sergio" ? "blotta" : "sergio";
  player = makeFighter(choice, 235, true);
  cpu = makeFighter(other, 725, false);
  fighters = [player, cpu];
  projectiles = [];
  particles = [];
  afterimages = [];
  held.left = held.right = false;
  roundTime = 60;
  secondAccumulator = 0;
  aiClock = 0;
  screenShake = 0;
  stageTime = 0;
  state = "intro";
  showScreen(ui.gameScreen);
  setPauseUI(false);
  ui.resultPanel.hidden = true;
  ui.leftName.textContent = stats[player.kind].name;
  ui.rightName.textContent = stats[cpu.kind].name;
  updateHud();
  beginIntro();
  ensureAudio();
  sfx("start");
}

function beginIntro() {
  const token = ++introToken;
  ui.speech.hidden = false;
  positionSpeech();
  ui.announcement.textContent = "";
  ui.announcement.classList.remove("show");
  setTimeout(() => {
    if (token !== introToken || state !== "intro") return;
    ui.speech.hidden = true;
    announce("ROUND 1", 850);
  }, 1700);
  setTimeout(() => {
    if (token !== introToken || state !== "intro") return;
    announce("¡PELEA!", 800);
    sfx("fight");
  }, 2750);
  setTimeout(() => {
    if (token !== introToken || state !== "intro") return;
    state = "playing";
  }, 3500);
}

function announce(text, duration) {
  ui.announcement.textContent = text;
  ui.announcement.classList.add("show");
  if (duration) setTimeout(() => ui.announcement.classList.remove("show"), duration);
}

function positionSpeech() {
  const blotta = fighters.find(f => f.kind === "blotta");
  if (!blotta) return;
  ui.speech.style.left = `${(blotta.x / canvas.width) * 100}%`;
}

function update(dt) {
  if (state !== "playing") return;
  stageTime += dt;

  secondAccumulator += dt;
  if (secondAccumulator >= 1) {
    secondAccumulator -= 1;
    roundTime = Math.max(0, roundTime - 1);
    ui.timer.textContent = String(roundTime).padStart(2, "0");
    if (roundTime === 0) finishRound(player.health >= cpu.health ? player : cpu, "TIEMPO");
  }

  updatePlayer(dt);
  updateAI(dt);
  fighters.forEach(f => updateFighter(f, dt));
  separateFighters();
  updateProjectiles(dt);
  updateParticles(dt);
  updateAfterimages(dt);
  updateHud();
  screenShake = Math.max(0, screenShake - dt * 26);
}

function updatePlayer(dt) {
  if (!player || isLocked(player)) return;
  let direction = 0;
  if (held.left) direction -= 1;
  if (held.right) direction += 1;
  if (direction) {
    const targetSpeed = direction * stats[player.kind].speed;
    player.vx += (targetSpeed - player.vx) * Math.min(1, dt * 16);
  } else if (player.grounded) {
    player.vx *= Math.pow(.0005, dt);
  }
}

function updateAI(dt) {
  aiClock -= dt;
  if (aiClock > 0 || isLocked(cpu)) return;
  aiClock = .12 + Math.random() * .18;
  const dx = player.x - cpu.x;
  const distance = Math.abs(dx);
  const toward = Math.sign(dx);
  const incoming = projectiles.some(p => p.owner === player && Math.abs(p.x - cpu.x) < 220);

  if (incoming && cpu.grounded && Math.random() < .52) {
    jump(cpu);
    return;
  }
  if (distance > 235) {
    cpu.vx = toward * stats[cpu.kind].speed * .76;
    if (cpu.power >= 35 && cpu.specialCooldown <= 0 && Math.random() < .2) attack(cpu, "special");
    return;
  }
  if (distance < 78 && Math.random() < .28) {
    cpu.vx = -toward * stats[cpu.kind].speed * .7;
    return;
  }
  cpu.vx *= .45;
  const r = Math.random();
  if (r < .38) attack(cpu, "punch");
  else if (r < .7) attack(cpu, "kick");
  else if (r < .82 && cpu.power >= 35 && cpu.specialCooldown <= 0) attack(cpu, "special");
  else if (r < .9) jump(cpu);
}

function updateFighter(f, dt) {
  const previouslyGrounded = f.grounded;
  f.animClock += dt;
  f.queueTime = Math.max(0, f.queueTime - dt);
  if (f.queueTime === 0) f.queuedAction = null;
  f.landingSquash = Math.max(0, f.landingSquash - dt);
  f.invuln = Math.max(0, f.invuln - dt);
  f.specialCooldown = Math.max(0, f.specialCooldown - dt);
  f.flash = Math.max(0, f.flash - dt);
  f.power = Math.min(100, f.power + dt * 2.2);

  const opponent = f === player ? cpu : player;
  f.facing = opponent.x > f.x ? 1 : -1;

  if (f.actionTime > 0) {
    f.actionTime -= dt;
    resolveAttackFrame(f, opponent);
    if (f.actionTime <= 0) {
      const queuedAction = f.queueTime > 0 ? f.queuedAction : null;
      f.action = "idle";
      f.actionDuration = 0;
      f.attackLanded = false;
      f.queuedAction = null;
      f.queueTime = 0;
      if (queuedAction) attack(f, queuedAction);
    }
  }

  f.vy += 1550 * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.x = Math.max(65, Math.min(895, f.x));

  if (f.y >= 438) {
    const landingSpeed = f.vy;
    f.y = 438;
    f.vy = 0;
    f.grounded = true;
    if (!previouslyGrounded && landingSpeed > 180) {
      f.landingSquash = .16;
      dustBurst(f.x, 445, Math.min(10, Math.round(landingSpeed / 75)));
      screenShake = Math.max(screenShake, 2.5);
    }
    if (isLocked(f) && f.action !== "kick" && f.action !== "hit") {
      f.vx *= Math.pow(.015, dt);
    } else if (!isLocked(f)) {
      f.vx *= .985;
    }
  } else {
    f.grounded = false;
    f.vx *= .994;
  }

  const progress = actionProgress(f);
  if (f.action === "special" && progress > .32 && !f.specialSpawned) {
    f.specialSpawned = true;
    spawnProjectile(f, f.specialStyle);
  }
  const leavesTrail = (f.action === "kick" && progress > .18 && progress < .76)
    || (f.action === "special" && progress > .22 && progress < .7);
  if (leavesTrail) {
    f.trailClock -= dt;
    if (f.trailClock <= 0) {
      addAfterimage(f);
      f.trailClock = .055;
    }
  } else {
    f.trailClock = 0;
  }

  f.wasGrounded = f.grounded;
}

function resolveAttackFrame(f, target) {
  if (f.attackLanded || f.action === "hit") return;
  const progress = actionProgress(f);
  const distance = Math.abs(target.x - f.x);
  let active = false;
  let damage = 0;
  let reach = 0;
  let knock = 0;

  if (f.action === "punch" && progress > .22 && progress < .64) {
    active = true; damage = f.kind === "sergio" ? 10 : 8; reach = f.kind === "sergio" ? 104 : 96; knock = 170;
  } else if (f.action === "kick" && progress > .26 && progress < .7) {
    active = true; damage = f.kind === "sergio" ? 12 : 11; reach = 124; knock = 235;
  }

  if (active && distance < reach && Math.abs(target.y - f.y) < 105) {
    f.attackLanded = true;
    hit(target, damage, f.facing * knock, f.action === "kick" ? -250 : -120, f);
  }
}

function separateFighters() {
  const dx = cpu.x - player.x;
  const overlap = 64 - Math.abs(dx);
  if (overlap > 0) {
    const push = overlap / 2;
    const sign = Math.sign(dx) || 1;
    player.x -= sign * push;
    cpu.x += sign * push;
  }
}

function jump(f) {
  if (state !== "playing" || !f.grounded || isLocked(f)) return;
  f.vy = -stats[f.kind].jump;
  f.grounded = false;
  sfx("jump");
}

function attack(f, type) {
  if (state !== "playing") return;
  if (isLocked(f)) {
    if (f.isPlayer && f.action !== "hit") {
      f.queuedAction = type;
      f.queueTime = .18;
    }
    return;
  }
  if (type === "special") {
    if (f.power < 35 || f.specialCooldown > 0) {
      if (f.isPlayer) sfx("empty");
      return;
    }
    f.power -= 35;
    f.specialCooldown = .85;
    f.action = "special";
    f.actionDuration = .72;
    f.actionTime = f.actionDuration;
    f.specialSpawned = false;
    f.vx *= .2;
    f.specialStyle = f.kind === "sergio" ? (f.projectileToggle++ % 2 ? "bottle" : "meat") : "ki";
    sfx("special");
    return;
  }

  f.action = type;
  f.actionDuration = type === "punch" ? .44 : .62;
  f.actionTime = f.actionDuration;
  f.attackLanded = false;
  if (type === "kick") {
    f.vx = f.facing * 300;
    if (f.grounded) f.vy = -275;
  } else {
    f.vx = f.facing * (f.kind === "sergio" ? 165 : 105);
  }
  sfx(type);
}

function spawnProjectile(owner, style) {
  const config = style === "ki"
    ? { speed: 490, damage: 14, radius: 26 }
    : style === "bottle"
      ? { speed: 425, damage: 13, radius: 22 }
      : { speed: 395, damage: 11, radius: 25 };
  projectiles.push({
    owner, style, x: owner.x + owner.facing * 58, y: owner.y - 92,
    vx: owner.facing * config.speed, vy: style === "ki" ? 0 : -80,
    damage: config.damage, radius: config.radius, life: 2.3, spin: 0
  });
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.spin += dt * 9;
    if (p.style !== "ki") {
      p.vy += 230 * dt;
      p.y += p.vy * dt;
    }
    const target = p.owner === player ? cpu : player;
    const hitDistance = Math.hypot(p.x - target.x, p.y - (target.y - 82));
    if (target.invuln <= 0 && hitDistance < p.radius + 34) {
      hit(target, p.damage, Math.sign(p.vx) * 210, -155, p.owner);
      burst(p.x, p.y, p.style === "ki" ? "#65d8ff" : "#ffbf3d", 13);
      projectiles.splice(i, 1);
    } else if (p.life <= 0 || p.x < -50 || p.x > 1010 || p.y > 520) {
      projectiles.splice(i, 1);
    }
  }
}

function hit(target, damage, knockX, knockY, attacker) {
  if (target.invuln > 0 || state !== "playing") return;
  target.health = Math.max(0, target.health - damage);
  target.power = Math.min(100, target.power + damage * 1.25);
  attacker.power = Math.min(100, attacker.power + damage * .75);
  target.invuln = .36;
  target.action = "hit";
  target.actionDuration = .4;
  target.actionTime = target.actionDuration;
  target.vx = knockX;
  target.vy = knockY;
  target.flash = .18;
  screenShake = damage > 12 ? 10 : 6;
  burst(target.x, target.y - 82, damage > 12 ? "#fff45c" : "#ff7d3b", 10);
  ui.flash.classList.remove("on");
  void ui.flash.offsetWidth;
  ui.flash.classList.add("on");
  sfx("hit");
  if (navigator.vibrate) navigator.vibrate(damage > 12 ? 45 : 25);
  if (target.health <= 0) finishRound(attacker, "K.O.");
}

function finishRound(winner, reason) {
  if (state !== "playing") return;
  state = "finished";
  setPauseUI(false);
  held.left = held.right = false;
  ui.resultKicker.textContent = reason;
  ui.resultTitle.textContent = winner === player ? "¡GANASTE!" : `${stats[winner.kind].name} GANA`;
  announce("K.O.!", 1000);
  sfx(winner === player ? "win" : "lose");
  setTimeout(() => { ui.resultPanel.hidden = false; }, 1050);
}

function isLocked(f) {
  return f.actionTime > 0 && f.action !== "idle";
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
  if (f.action === "punch") {
    return progress < .16 || progress > .84 ? POSES[f.kind].idle : POSES[f.kind].punch;
  }
  if (f.action === "kick") return progress < .12 ? POSES[f.kind].idle : POSES[f.kind].kick;
  if (f.action === "special") {
    if (progress < .15) return POSES[f.kind].idle;
    if (f.kind === "blotta") return POSES.blotta.power;
    return f.projectileToggle % 2 ? POSES.sergio.meat : POSES.sergio.bottle;
  }
  if (!f.grounded) return POSES[f.kind].kick;
  return POSES[f.kind].idle;
}

function drawShadow(f) {
  const lift = Math.max(0, 438 - f.y);
  ctx.save();
  ctx.globalAlpha = .32 * Math.max(.3, 1 - lift / 430);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(f.x, 452, 54 - lift * .04, 10 - lift * .009, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function fighterMotion(f) {
  const motion = { dx: 0, dy: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const progress = actionProgress(f);
  const moving = f.grounded && f.action === "idle" && Math.abs(f.vx) > 18;

  if (f.action === "idle") {
    if (moving) {
      const step = Math.sin(f.animClock * 11);
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
    ctx.strokeStyle = f.kind === "sergio" ? "#ffe165" : "#8fe5ff";
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
    ctx.strokeStyle = f.kind === "blotta" ? "#69dbff" : "#ffbf3d";
    ctx.lineWidth = 3;
    const radius = 48 + Math.sin(progress * Math.PI * 5) * 8;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 82, radius, radius * .68, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSpriteFrame(frame, alpha = 1, ghost = false) {
  const image = assets[frame.kind];
  if (!image.complete) return;
  const pose = frame.pose;
  const cell = 270;
  const sx = (pose % 3) * cell;
  const sy = Math.floor(pose / 3) * cell;
  const size = frame.kind === "sergio" ? 246 : 238;
  const needsFlip = frame.facing !== stats[frame.kind].defaultFace;
  const motion = frame.motion;

  ctx.save();
  ctx.translate(frame.x + motion.dx, frame.y + motion.dy);
  ctx.rotate(motion.rotation);
  ctx.scale((needsFlip ? -1 : 1) * motion.scaleX, motion.scaleY);
  ctx.globalAlpha = alpha;
  if (ghost) ctx.globalCompositeOperation = "screen";
  ctx.drawImage(image, sx, sy, cell, cell, -size / 2, -size * .94, size, size);
  ctx.restore();
}

function drawAfterimage(ghost) {
  drawSpriteFrame(ghost, (ghost.life / ghost.maxLife) * .16, true);
}

function drawFighter(f) {
  const motion = fighterMotion(f);
  drawMotionLines(f, motion);
  const flashing = f.flash > 0 && Math.floor(f.flash * 40) % 2 === 0;
  drawSpriteFrame({ kind: f.kind, pose: poseFor(f), x: f.x, y: f.y, facing: f.facing, motion }, flashing ? .42 : 1);
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
    ctx.beginPath(); ctx.arc(0, 0, 17 + Math.sin(performance.now()/60)*3, 0, Math.PI*2); ctx.stroke();
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
  ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  ctx.restore();
}

function updateHud() {
  if (!player || !cpu) return;
  ui.leftHealth.style.width = `${player.health}%`;
  ui.rightHealth.style.width = `${cpu.health}%`;
  ui.leftPower.style.width = `${player.power}%`;
  ui.rightPower.style.width = `${cpu.power}%`;
  ui.timer.textContent = String(roundTime).padStart(2, "0");
}

function setPauseUI(paused) {
  ui.pauseBtn.textContent = paused ? "SEGUIR" : "PAUSA";
  ui.pauseBtn.classList.toggle("resume", paused);
  ui.pauseBtn.setAttribute("aria-label", paused ? "Reanudar juego" : "Pausar juego");
  ui.gameScreen.classList.toggle("paused", paused);
}

function togglePause() {
  if (state === "playing") {
    state = "paused";
    held.left = held.right = false;
    setPauseUI(true);
    announce("PAUSA");
  } else if (state === "paused") {
    state = "playing";
    setPauseUI(false);
    ui.announcement.classList.remove("show");
  }
}

function loop(now) {
  const dt = Math.min(.032, (now - lastTime) / 1000);
  lastTime = now;
  if (state === "intro") {
    stageTime += dt;
    fighters.forEach(f => { f.animClock += dt; });
  }
  update(dt);
  if (["intro", "playing", "paused", "finished"].includes(state)) draw();
  requestAnimationFrame(loop);
}

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function tone(freq, duration, type = "square", volume = .045, slide = 0) {
  if (muted) return;
  ensureAudio();
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

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (["a", "d", "w", "j", "k", "l", "p", "arrowleft", "arrowright", "arrowup", " "].includes(key)) event.preventDefault();

  if (state === "title") {
    if (!event.repeat && (key === "enter" || key === " ")) openSelection();
    return;
  }

  if (state === "select") {
    if (!event.repeat && ["a", "d", "arrowleft", "arrowright"].includes(key)) {
      chooseFighter(playerChoice === "sergio" ? "blotta" : "sergio");
    }
    if (!event.repeat && (key === "enter" || key === " " || key === "j")) {
      sfx("confirm");
      startGame(playerChoice);
    }
    return;
  }

  if (key === "a" || key === "arrowleft") held.left = true;
  if (key === "d" || key === "arrowright") held.right = true;
  if (event.repeat) return;
  if (key === "w" || key === "arrowup") jump(player);
  if (key === "j") attack(player, "punch");
  if (key === "k" || key === " ") attack(player, "kick");
  if (key === "l") attack(player, "special");
  if (key === "p" || key === "escape") togglePause();
});

window.addEventListener("keyup", event => {
  const key = event.key.toLowerCase();
  if (key === "a" || key === "arrowleft") held.left = false;
  if (key === "d" || key === "arrowright") held.right = false;
});

window.addEventListener("blur", () => {
  held.left = held.right = false;
  if (state === "playing") togglePause();
});

document.querySelectorAll("[data-hold]").forEach(btn => {
  const actionName = btn.dataset.hold;
  const set = value => {
    held[actionName] = value;
    btn.classList.toggle("active", value);
  };
  btn.addEventListener("pointerdown", event => { event.preventDefault(); btn.setPointerCapture(event.pointerId); set(true); });
  btn.addEventListener("pointerup", event => { event.preventDefault(); set(false); });
  btn.addEventListener("pointercancel", () => set(false));
  btn.addEventListener("lostpointercapture", () => set(false));
});

document.querySelectorAll("[data-tap]").forEach(btn => {
  btn.addEventListener("pointerdown", event => {
    event.preventDefault();
    btn.classList.add("active");
    const actionName = btn.dataset.tap;
    if (actionName === "jump") jump(player);
    else attack(player, actionName);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(name => btn.addEventListener(name, () => btn.classList.remove("active")));
});

document.addEventListener("contextmenu", event => {
  if (state !== "title" && state !== "select") event.preventDefault();
});

requestAnimationFrame(loop);
