"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const ui = {
  selectScreen: document.getElementById("selectScreen"),
  gameScreen: document.getElementById("gameScreen"),
  arena: document.getElementById("arena"),
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
  sergio: loadImage("assets/sergio-sheet.png"),
  blotta: loadImage("assets/blotta-sheet.png")
};

const POSES = {
  sergio: { idle: 0, punch: 1, kick: 2, hit: 3, meat: 4, bottle: 5 },
  blotta: { idle: 0, punch: 1, kick: 2, sweep: 3, hit: 4, power: 5 }
};

const stats = {
  sergio: { name: "SERGIO", speed: 245, jump: 650, defaultFace: 1 },
  blotta: { name: "BLOTTA", speed: 265, jump: 680, defaultFace: -1 }
};

let state = "select";
let playerChoice = "sergio";
let player = null;
let cpu = null;
let fighters = [];
let projectiles = [];
let particles = [];
let held = { left: false, right: false };
let roundTime = 60;
let secondAccumulator = 0;
let lastTime = performance.now();
let introToken = 0;
let aiClock = 0;
let screenShake = 0;
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
    attackLanded: false, invuln: 0, specialCooldown: 0,
    projectileToggle: 0, facing: x < 480 ? 1 : -1, flash: 0
  };
}

function startGame(choice) {
  playerChoice = choice;
  const other = choice === "sergio" ? "blotta" : "sergio";
  player = makeFighter(choice, 235, true);
  cpu = makeFighter(other, 725, false);
  fighters = [player, cpu];
  projectiles = [];
  particles = [];
  held.left = held.right = false;
  roundTime = 60;
  secondAccumulator = 0;
  aiClock = 0;
  screenShake = 0;
  state = "intro";
  ui.selectScreen.hidden = true;
  ui.gameScreen.hidden = false;
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
  setTimeout(() => ui.announcement.classList.remove("show"), duration);
}

function positionSpeech() {
  const blotta = fighters.find(f => f.kind === "blotta");
  if (!blotta) return;
  ui.speech.style.left = `${(blotta.x / canvas.width) * 100}%`;
}

function update(dt) {
  if (state !== "playing") return;

  secondAccumulator += dt;
  if (secondAccumulator >= 1) {
    secondAccumulator -= 1;
    roundTime = Math.max(0, roundTime - 1);
    ui.timer.textContent = String(roundTime).padStart(2, "0");
    if (roundTime === 0) finishRound(player.health >= cpu.health ? player : cpu, "TIEMPO");
  }

  updatePlayer();
  updateAI(dt);
  fighters.forEach(f => updateFighter(f, dt));
  separateFighters();
  updateProjectiles(dt);
  updateParticles(dt);
  updateHud();
  screenShake = Math.max(0, screenShake - dt * 26);
}

function updatePlayer() {
  if (!player || isLocked(player)) return;
  let direction = 0;
  if (held.left) direction -= 1;
  if (held.right) direction += 1;
  if (direction) {
    player.vx = direction * stats[player.kind].speed;
  } else if (player.grounded) {
    player.vx *= .7;
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
      f.action = "idle";
      f.attackLanded = false;
    }
  }

  f.vy += 1550 * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.x = Math.max(65, Math.min(895, f.x));

  if (f.y >= 438) {
    f.y = 438;
    f.vy = 0;
    f.grounded = true;
    if (!isLocked(f)) f.vx *= .76;
  } else {
    f.grounded = false;
    f.vx *= .994;
  }
}

function resolveAttackFrame(f, target) {
  if (f.attackLanded || f.action === "hit") return;
  const elapsedWindow = f.actionTime;
  const distance = Math.abs(target.x - f.x);
  let active = false;
  let damage = 0;
  let reach = 0;
  let knock = 0;

  if (f.action === "punch" && elapsedWindow < .36) {
    active = true; damage = f.kind === "sergio" ? 10 : 8; reach = f.kind === "sergio" ? 118 : 105; knock = 170;
  } else if (f.action === "kick" && elapsedWindow < .48) {
    active = true; damage = f.kind === "sergio" ? 12 : 11; reach = 142; knock = 245;
  }

  if (active && distance < reach && Math.abs(target.y - f.y) < 125) {
    f.attackLanded = true;
    hit(target, damage, f.facing * knock, f.action === "kick" ? -250 : -120, f);
  }
}

function separateFighters() {
  const dx = cpu.x - player.x;
  const overlap = 78 - Math.abs(dx);
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
  if (state !== "playing" || isLocked(f)) return;
  if (type === "special") {
    if (f.power < 35 || f.specialCooldown > 0) {
      if (f.isPlayer) sfx("empty");
      return;
    }
    f.power -= 35;
    f.specialCooldown = .85;
    f.action = "special";
    f.actionTime = .62;
    f.vx *= .2;
    const style = f.kind === "sergio" ? (f.projectileToggle++ % 2 ? "bottle" : "meat") : "ki";
    setTimeout(() => {
      if (state === "playing" && f.health > 0) spawnProjectile(f, style);
    }, 210);
    sfx("special");
    return;
  }

  f.action = type;
  f.actionTime = type === "punch" ? .52 : .68;
  f.attackLanded = false;
  if (type === "kick") {
    f.vx = f.facing * 335;
    if (f.grounded) f.vy = -310;
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
    owner, style, x: owner.x + owner.facing * 66, y: owner.y - 122,
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
    const hitDistance = Math.hypot(p.x - target.x, p.y - (target.y - 105));
    if (target.invuln <= 0 && hitDistance < p.radius + 42) {
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
  target.actionTime = .38;
  target.vx = knockX;
  target.vy = knockY;
  target.flash = .18;
  screenShake = damage > 12 ? 10 : 6;
  burst(target.x, target.y - 105, damage > 12 ? "#fff45c" : "#ff7d3b", 10);
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

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 70 + Math.random() * 230;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .25, color, size: 3 + Math.random() * 6 });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 620 * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function draw() {
  const shakeX = screenShake ? (Math.random() - .5) * screenShake : 0;
  const shakeY = screenShake ? (Math.random() - .5) * screenShake * .55 : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  if (assets.arena.complete) ctx.drawImage(assets.arena, -8, -5, 976, 550);
  else { ctx.fillStyle = "#16263a"; ctx.fillRect(0, 0, 960, 540); }

  const vignette = ctx.createLinearGradient(0, 0, 0, 540);
  vignette.addColorStop(0, "rgba(5,10,22,.12)");
  vignette.addColorStop(.75, "rgba(5,8,14,0)");
  vignette.addColorStop(1, "rgba(2,3,8,.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 960, 540);

  drawShadow(player);
  drawShadow(cpu);
  fighters.slice().sort((a, b) => a.x - b.x).forEach(drawFighter);
  projectiles.forEach(drawProjectile);
  particles.forEach(drawParticle);
  ctx.restore();
}

function poseFor(f) {
  if (f.action === "hit") return POSES[f.kind].hit;
  if (f.action === "punch") return POSES[f.kind].punch;
  if (f.action === "kick") return POSES[f.kind].kick;
  if (f.action === "special") {
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
  ctx.ellipse(f.x, 452, 70 - lift * .05, 13 - lift * .012, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFighter(f) {
  const image = assets[f.kind];
  if (!image.complete) return;
  const pose = poseFor(f);
  const sx = (pose % 3) * 256;
  const sy = Math.floor(pose / 3) * 256;
  const size = f.kind === "sergio" ? 310 : 300;
  const desiredFace = f.facing;
  const needsFlip = desiredFace !== stats[f.kind].defaultFace;
  const bob = f.action === "idle" && f.grounded ? Math.sin(performance.now() / 180) * 2 : 0;

  ctx.save();
  ctx.translate(f.x, f.y + bob);
  if (needsFlip) ctx.scale(-1, 1);
  if (f.flash > 0 && Math.floor(f.flash * 40) % 2 === 0) ctx.globalAlpha = .42;
  ctx.drawImage(image, sx, sy, 256, 256, -size / 2, -size * .94, size, size);
  ctx.restore();
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

function togglePause() {
  if (state === "playing") {
    state = "paused";
    announce("PAUSA", 999999);
  } else if (state === "paused") {
    state = "playing";
    ui.announcement.classList.remove("show");
  }
}

function loop(now) {
  const dt = Math.min(.032, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  if (state !== "select") draw();
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

document.querySelectorAll("[data-pick]").forEach(btn => {
  btn.addEventListener("click", () => startGame(btn.dataset.pick));
});

document.getElementById("rematchBtn").addEventListener("click", () => startGame(playerChoice));
document.getElementById("selectBtn").addEventListener("click", () => {
  introToken++;
  state = "select";
  ui.gameScreen.hidden = true;
  ui.selectScreen.hidden = false;
  ui.resultPanel.hidden = true;
  ui.speech.hidden = true;
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
  if (state !== "select") event.preventDefault();
});

requestAnimationFrame(loop);
