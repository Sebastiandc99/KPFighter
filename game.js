"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;
const FIGHTER_SCALE = .9;
const spriteFrames = new Map();
const poseBlendSurfaces = new Map();
let drawingScale = 1;

const ui = {
  titleScreen: document.getElementById("titleScreen"),
  modeScreen: document.getElementById("modeScreen"),
  rankingScreen: document.getElementById("rankingScreen"),
  selectScreen: document.getElementById("selectScreen"),
  stageScreen: document.getElementById("stageScreen"),
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

const stages = {
  arcade: { name: "PATIO ARCADE", src: "assets/arena.jpg", description: "El escenario original de KP FIGHTER." },
  mine: { name: "GALERÍA SUBTERRÁNEA", src: "assets/stage-mine.webp", description: "Roca, luces cálidas y combate bajo tierra." },
  newmont: { name: "PLANTA NEWMONT", src: "assets/stage-newmont.webp", description: "La planta minera, a cielo abierto." }
};
const stageRoster = Object.keys(stages);
const stageImages = Object.fromEntries(stageRoster.map(key => [key, loadImage(stages[key].src)]));

const assets = {
  facu: loadImage("assets/facu-atlas-v1.png"),
  uppercuts: loadImage("assets/uppercuts-v1.png"),
  arena: loadImage("assets/arena.jpg"),
  sergio: loadImage("assets/sergio-attack-v4.png"),
  blotta: loadImage("assets/blotta-atlas-v2-clean.png"),
  tunki: loadImage("assets/tunki-attack-v1.png"),
  marechal: loadImage("assets/marechal-attack-v1.png"),
  sergioMotion: loadImage("assets/sergio-motion-v4.png"),
  blottaMotion: loadImage("assets/blotta-motion-v3.png"),
  tunkiMotion: loadImage("assets/tunki-motion-v1.png"),
  marechalMotion: loadImage("assets/marechal-motion-v1.png")
};

const POSES = {
  facu: {idle:0, punch:1, kick:2, hit:3, power:4, sweep:5},
  sergio: { idle: 0, punch: 1, kick: 2, hit: 3, meat: 4, bottle: 5 },
  blotta: { idle: 0, punch: 1, kick: 2, sweep: 3, hit: 4, power: 5 },
  tunki: { idle: 0, punch: 1, kick: 2, hit: 3, power: 4, slam: 5 },
  marechal: { idle: 0, punch: 1, kick: 2, hit: 3, power: 4, sweep: 5 }
};

const stats = {
  facu: { name: "FACU", speed: 276, jump: 615, defaultFace: 1, size: 222, height: 188, width: 25, description: "BIGOTE BOOMERANG", ability: null },
  sergio: { name: "SERGIO", speed: 260, jump: 595, defaultFace: 1, size: 210, height: 184, width: 32, description: "PANZAZO · ASADO · FERNET", ability: null },
  blotta: { name: "BLOTTA", speed: 278, jump: 620, defaultFace: -1, size: 214, height: 180, width: 25, description: "KARATE · ENERGÍA · HUMO", ability: "teleport" },
  tunki: { name: "LA TUNKI", speed: 246, jump: 605, defaultFace: 1, size: 202, height: 174, width: 32, description: "FLORES · SALTO APLASTANTE", ability: "slam" },
  marechal: { name: "MARECHAL", speed: 270, jump: 620, defaultFace: 1, size: 242, height: 202, width: 23, description: "ARTES MARCIALES · RAYOS", ability: null }
};

const roster = ["sergio", "blotta", "tunki", "marechal", "facu"];
const FLOOR = 448;
const STEP = 1 / 120;
const JUMP_BOOST = 1.25;
// Cues follow the measured speech onsets in each supplied MP3, including leading silence.
const INTRO = { voice: 1.10, title: 1.338, fight: 3.144, end: 3.80 };
const ROUND_AUDIO = {
  1: { src: "assets/round-1.mp3", title: "ROUND 1", timing: INTRO, buffer: null, loading: null },
  2: { src: "assets/round-2.mp3", title: "ROUND 2", timing: { voice: .35, title: .412, fight: 2.206, end: 2.75 }, buffer: null, loading: null },
  3: { src: "assets/final-round.mp3", title: "FINAL ROUND", timing: { voice: .35, title: .520, fight: 2.304, end: 3.00 }, buffer: null, loading: null }
};
const MOVES = {
  punch: { startup: .085, active: .095, recovery: .18, reach: 77, damage: 3, knock: 160 },
  kick: { startup: .12, active: .16, recovery: .23, reach: 106, damage: 4, knock: 235 },
  uppercut: { startup: .105, active: .17, recovery: .26, reach: 76, damage: 5, knock: 145, lift: -420 },
  lowKick: { startup: .13, active: .14, recovery: .22, reach: 102, damage: 4, knock: 210 },
  special: { startup: .19, active: .04, recovery: .29 },
  teleport: { startup: .16, active: .28, recovery: .23 },
  slam: { startup: .12, active: 1.55, recovery: .33, damage: 18, knock: 290 }
};

const COMBAT_AUDIO = {
  boomerang: {src: "assets/boomerang.wav", volume: 1.1, start: 0, end: 1},
  // Skip measured leading silence so even a close-range jab is audible.
  general: { src: "assets/golpe-general.mp3", volume: .32, start: .18, end: .59 },
  belly: { src: "assets/panzazo-sergio.mp3", volume: .36, start: .035 },
  lightning: { src: "assets/poder-rayo.mp3", volume: 1.35, start: .035, end: 1.69 },
  meat: { src: "assets/poder-sergio-carne.mp3", volume: 1.35, start: 0 },
  flowers: { src: "assets/flores-tunki.mp3", volume: 1.35, start: .025, end: 2.42 }
};
// Each attack/projectile owns its own voice; removing one never stops another.
const combatSounds = new Set();
const EXTRA_AUDIO = {
  music: [{src: "assets/fighter-1.mp3", usage: "fight"}, {src: "assets/fighter-2.mp3", usage: "fight"}],
  selection: {src: "assets/seleccion-v2.mp3", usage: "selection"}
};
const soundTails = new Set();
let musicTrack = null;
let musicElapsed = 0;
let musicSource = null;
let musicGain = null;
let musicStartedAt = 0;

let state = "title";
let playerChoice = "sergio";
let opponentChoice = "blotta";
let gameMode = "solo";
let selectionPlayer = 1;
let modeChoice = "solo";
let stageChoice = "arcade";
let match = { round: 1, playerWins: 0, cpuWins: 0, complete: false, repeat: false };
let resolvingContacts = false;
let player = null;
let cpu = null;
let fighters = [];
let projectiles = [];
let particles = [];
let afterimages = [];
let effects = [];
let held = { left: false, right: false, down: false, guard: false };
const held2 = { left: false, right: false, down: false, guard: false };
let roundTime = 60;
let lastTime = performance.now();
let aiClock = 0;
let screenShake = 0;
let stageTime = 0;
let muted = false;
const synthVoices = new Set();
let soundGeneration = 0;
let audioCtx = null;
let roundVoiceSource = null;
let roundVoiceStarted = false;
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

function mobileInput() {
  return !!(window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 0
    || document.body.classList.contains("touch-device"));
}

function syncViewport() {
  const sideways = mobileInput() && window.innerHeight > window.innerWidth;
  document.body.classList.toggle("phone-portrait", sideways);
  document.body.classList.toggle("two-touch", gameMode === "versus" && (mobileInput() || window.innerWidth <= 820));
  const density = Math.min(2, Math.max(1, (canvas.clientWidth || VIEW_WIDTH) * (window.devicePixelRatio || 1) / VIEW_WIDTH));
  const width = Math.round(VIEW_WIDTH * density);
  const height = Math.round(VIEW_HEIGHT * density);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  drawingScale = width / VIEW_WIDTH;
  ctx.imageSmoothingEnabled = false;
}

async function requestMobileLandscape() {
  if (!mobileInput()) return;
  try {
    if (!document.fullscreenElement && document.documentElement?.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch (_) { /* The rotated layout also works outside fullscreen. */ }
  try { await window.screen?.orientation?.lock?.("landscape"); } catch (_) { /* CSS handles orientation-lock restrictions. */ }
  syncViewport();
}

function clearHeld() {
  keyHolds.clear();
  touchHolds.clear();
  Object.keys(held).forEach(key => { held[key] = false; });
  Object.keys(held2).forEach(key => { held2[key] = false; });
  document.querySelectorAll("[data-hold].active").forEach(button => button.classList.remove("active"));
}

function humanFighter(f) { return f.isPlayer || gameMode === "versus"; }
function fighterInput(f) { return f === cpu ? held2 : held; }
function fighterLabel(f) { return (f === player ? "1P" : gameMode === "versus" ? "2P" : "CPU") + " · " + stats[f.kind].name; }

function mainMenu() {
  stopRoundVoice(); stopAllCombatSounds(); stopMusic();
  clearHeld();
  fighters = []; player = cpu = null;
  projectiles = []; particles = []; afterimages = []; effects = [];
  hitStop = screenShake = accumulator = 0;
  state = "title";
  ui.resultPanel.hidden = true;
  document.getElementById("winnerForm").hidden = true;
  setPauseUI(false);
  showScreen(ui.titleScreen);
  document.body.classList.remove("versus-mode");
  document.body.classList.remove("two-touch");
  ui.startBtn.focus?.();
}

function openModeSelection() {
  mainMenu();
  state = "mode";
  showScreen(ui.modeScreen);
  chooseMode(modeChoice);
  ensureAudio();
}

function chooseMode(mode) {
  modeChoice = mode === "versus" ? "versus" : "solo";
  document.querySelectorAll("[data-mode]").forEach(button => {
    button.classList.toggle("selected", button.dataset.mode === modeChoice);
    button.setAttribute("aria-pressed", String(button.dataset.mode === modeChoice));
  });
}

function startMode(mode) {
  gameMode = mode;
  modeChoice = mode;
  selectionPlayer = 1;
  document.body.classList.toggle("versus-mode", gameMode === "versus");
  openSelection();
}

function confirmFighter() {
  if (gameMode === "versus" && selectionPlayer === 1) {
    selectionPlayer = 2;
    chooseFighter(opponentChoice, false);
  } else openStageSelection();
}

function backFromFighters() {
  if (gameMode === "versus" && selectionPlayer === 2) { selectionPlayer = 1; chooseFighter(playerChoice, false); }
  else openModeSelection();
}

function makeFighter(kind, x, isPlayer) {
  const f = {
    kind, x, y: FLOOR, prevX: x, prevY: FLOOR, vx: 0, vy: 0, health: 100, power: 40,
    isPlayer, grounded: true, action: "idle", actionTime: 0,
    actionDuration: 0, animClock: Math.random() * 4, trailClock: 0,
    mustacheAway: false, specialSpawned: false, specialStyle: "ki",
    queuedAction: null, queueTime: 0,
    crouching: false, guarding: false, guardTime: 0, crouchTime: 0,
    teleportDone: false, teleportSmokeStarted: false, teleportTarget: x,
    slamLaunched: false, slamDiving: false, slamLanded: false, slamFromAir: false,
    landingSquash: 0,
    attackLanded: false, invuln: 0, specialCooldown: 0,
    projectileToggle: 0, facing: x < 480 ? 1 : -1, flash: 0,
    moveSpec: null, lowAttack: false, airAttack: false, moveIntent: 0, attackSound: null,
    walkPhase: 0, combo: 0, comboTime: 0, guardFlash: 0
  };
  const motion = fighterMotion(f);
  f.animation = { pose: POSES[kind].idle, fromPose: POSES[kind].idle, mix: 1, prevMix: 1,
    duration: .055, facing: f.facing, motion, prevMotion: { ...motion } };
  return f;
}

function showScreen(screen) {
  [ui.titleScreen, ui.modeScreen, ui.selectScreen, ui.stageScreen, ui.gameScreen, ui.rankingScreen].forEach(node => {
    node.classList.toggle("active", node === screen);
  });
}

function chooseFighter(kind, playSound = true) {
  if (!stats[kind]) return;
  if (selectionPlayer === 2) opponentChoice = kind;
  else playerChoice = kind;
  document.getElementById("selectionPlayer").textContent = selectionPlayer + "P";
  document.getElementById("selectionPrompt").textContent = "JUGADOR " + selectionPlayer + " · ELIGE TU LUCHADOR";
  document.querySelectorAll(".p1-arrow small").forEach(node => { node.textContent = selectionPlayer + "P"; });
  ui.selectScreen.classList.toggle("selecting-p2", selectionPlayer === 2);
  ui.confirmBtn.textContent = gameMode === "versus" && selectionPlayer === 1 ? "CONFIRMAR JUGADOR 1" : "ELEGIR ESCENARIO";
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
  stopRoundVoice();
  stopAllCombatSounds();
  state = "select";
  selectMusic("selection");
  clearHeld();
  ui.resultPanel.hidden = true;
  ui.speech.hidden = true;
  setPauseUI(false);
  showScreen(ui.selectScreen);
  chooseFighter(selectionPlayer === 2 ? opponentChoice : playerChoice, false);
  ensureAudio();
  sfx("start");
}

function chooseStage(key, playSound = true) {
  if (!stages[key]) return;
  stageChoice = key;
  document.getElementById("stagePreview").src = stages[key].src;
  document.getElementById("stageName").textContent = stages[key].name;
  document.getElementById("stageDescription").textContent = stages[key].description;
  document.querySelectorAll("[data-stage]").forEach(button => {
    button.classList.toggle("selected", button.dataset.stage === key);
    button.setAttribute("aria-pressed", String(button.dataset.stage === key));
  });
  if (playSound) sfx("move");
}

function openStageSelection() {
  state = "stage";
  clearHeld();
  showScreen(ui.stageScreen);
  document.getElementById("stageFighter").textContent = stats[playerChoice].name + (gameMode === "versus" ? " VS " + stats[opponentChoice].name : " · GANA DOS ROUNDS");
  chooseStage(stageChoice, false);
  ensureAudio();
}

function startGame(choice, opponentKind = null) {
  accumulator = 0;
  playerChoice = choice;
  const opponents = roster.filter(kind => kind !== choice);
  match = { round: 1, playerWins: 0, cpuWins: 0, complete: false, repeat: false, scores: [0, 0], winner: null, saved: false, saving: false,
    id: globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2),
    playerKind: choice, cpuKind: gameMode === "versus" ? (stats[opponentKind] ? opponentKind : opponentChoice) : opponents.includes(opponentKind) ? opponentKind : opponents[Math.floor(Math.random() * opponents.length)] };
  selectMusic();
  startRound();
}

function startRound() {
  stopRoundVoice();
  stopAllCombatSounds();
  roundVoiceStarted = false;
  player = makeFighter(match.playerKind, 235, true);
  cpu = makeFighter(match.cpuKind, 725, false);
  fighters = [player, cpu];
  projectiles = [];
  particles = [];
  afterimages = [];
  effects = [];
  clearHeld();
  roundTime = 60;
  aiClock = 0;
  screenShake = 0;
  stageTime = 0;
  introElapsed = 0;
  resultElapsed = 0;
  hitStop = 0;
  state = "intro";
  showScreen(ui.gameScreen);
  syncViewport();
  setPauseUI(false);
  ui.resultPanel.hidden = true;
  document.getElementById("roundNotice").hidden = true;
  ui.leftName.textContent = stats[player.kind].name;
  ui.rightName.textContent = stats[cpu.kind].name;
  document.getElementById("rightRole").textContent = gameMode === "versus" ? "2P" : "CPU";
  document.getElementById("touchControls2").hidden = gameMode !== "versus";
  document.body.classList.toggle("versus-mode", gameMode === "versus");
  const ability2 = stats[cpu.kind].ability;
  document.getElementById("abilityBtn2").hidden = !ability2;
  document.getElementById("abilityLabel2").textContent = ability2 === "slam" ? "APLASTAR" : "HUMO";
  document.getElementById("abilityIcon2").textContent = ability2 === "slam" ? "▼" : "☁";
  document.getElementById("abilityBtn2").setAttribute("aria-label", ability2 === "slam" ? "Salto aplastante del Jugador 2" : "Humo del Jugador 2");
  document.getElementById("winnerForm").hidden = true;
  document.getElementById("cpuResultNote").hidden = true;
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
  syncMusic();
  sfx("start");
}

function beginIntro() {
  introElapsed = 0;
  ui.speech.hidden = match.round !== 1 || match.repeat || !fighters.some(f => f.kind === "blotta");
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
  ui.speech.style.left = (blotta.x / VIEW_WIDTH * 100) + "%";
  ui.speech.style.top = "36%";
}

function update(dt) {
  if (["select", "stage", "intro", "playing", "roundOver"].includes(state)) advanceMusic(dt);
  if (!["intro", "playing", "roundOver", "finished"].includes(state)) return;
  fighters.forEach(f => {
    f.prevX = f.x; f.prevY = f.y;
    f.animation.prevMotion = { ...f.animation.motion };
    f.animation.prevMix = f.animation.mix;
  });
  projectiles.forEach(p => { p.prevX = p.x; p.prevY = p.y; p.prevSpin = p.spin; });
  particles.forEach(p => { p.prevX = p.x; p.prevY = p.y; });
  stageTime += dt;
  if (announcementTime > 0) {
    announcementTime -= dt;
    if (announcementTime <= 0) ui.announcement.classList.remove("show");
  }
  if (state === "intro") {
    const timing = ROUND_AUDIO[match.round].timing;
    const before = introElapsed;
    introElapsed += dt;
    fighters.forEach(f => { f.animClock += dt; updateAnimation(f, dt); });
    if (before < timing.title && introElapsed >= timing.title) {
      ui.speech.hidden = true;
      announce(ROUND_AUDIO[match.round].title, (timing.fight - timing.title - .15) * 1000);
    }
    syncRoundVoice();
    if (before < timing.fight && introElapsed >= timing.fight) {
      announce("¡PELEA!", 600);
      if (!roundVoiceStarted) sfx("fight");
    }
    if (introElapsed >= timing.end) { stopRoundVoice(); state = "playing"; syncMusic(); }
    return;
  }
  if (state === "finished" || state === "roundOver") {
    resultElapsed += dt;
    updateParticles(dt);
    updateAfterimages(dt);
    updateEffects(dt);
    screenShake = Math.max(0, screenShake - dt * 32);
    fighters.forEach(f => {
      f.actionTime = Math.max(0, f.actionTime - dt);
      f.flash = Math.max(0, f.flash - dt);
      if (!f.grounded) integrateBody(f, dt);
      updateAnimation(f, dt);
    });
    if (state === "finished" && resultElapsed >= .8) ui.resultPanel.hidden = false;
    if (state === "finished" && resultElapsed >= 2.2 && !match.endShown) showGameOver();
    if (state === "finished" && resultElapsed >= 3.8 && match.winner === 1 && gameMode === "solo") showRanking();
    if (state === "roundOver" && resultElapsed >= .8) document.getElementById("roundNotice").hidden = false;
    if (state === "roundOver" && resultElapsed >= 2.65) {
      match.round = match.playerWins + match.cpuWins + 1;
      startRound();
    }
    return;
  }
  if (hitStop > 0) {
    suspendCombatSounds(false);
    hitStop = Math.max(0, hitStop - dt);
    return;
  }

  advanceCombatSounds(dt);

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
  if (gameMode === "versus") updateHuman(cpu, held2);
  else if (aiEnabled) updateAI(dt);
  fighters.forEach(f => updateFighter(f, dt));
  separateFighters();
  // Capture both contacts before resolving so simultaneous hits can trade.
  const contacts = fighters.map(f => attackContact(f, f === player ? cpu : player)).filter(Boolean);
  resolvingContacts = true;
  contacts.forEach(contact => {
    contact.attacker.attackLanded = true;
    stopFighterSound(contact.attacker);
    hit(contact.target, contact.damage, contact.direction * contact.knock, contact.lift, contact.attacker, contact);
  });
  resolvingContacts = false;
  if (player.health <= 0 || cpu.health <= 0) {
    finishRound(player.health <= 0 && cpu.health <= 0 ? null : player.health > 0 ? player : cpu, "K.O.");
  }
  if (state === "playing") updateProjectiles(dt);
  fighters.forEach(f => updateAnimation(f, dt));
  updateParticles(dt);
  updateAfterimages(dt);
  updateEffects(dt);
  screenShake = Math.max(0, screenShake - dt * 32);
}

function setStance(f, down, guard) {
  const available = f.grounded && (f.action === "idle" || f.action === "block");
  f.crouching = available && down;
  f.guarding = available && guard;
}

function updatePlayer() {
  if (!player) return;
  updateHuman(player, held);
}

function updateHuman(f, input) {
  setStance(f, input.down, input.guard);
  f.moveIntent = Number(input.right) - Number(input.left);
}

function updateAI(dt) {
  const dx = player.x - cpu.x;
  const distance = Math.abs(dx);
  const toward = Math.sign(dx) || 1;
  setStance(cpu, cpu.crouchTime > 0, cpu.guardTime > 0);
  if (isLocked(cpu)) return;
  aiClock -= dt;
  if (aiClock > 0) return;
  aiClock = .11 + Math.random() * .14;
  if (cpu.guarding || cpu.crouching) { cpu.moveIntent = 0; return; }
  const incoming = projectiles.some(p => p.owner === player && Math.abs(p.x - cpu.x) < 220 && (cpu.x - p.x) * p.vx > 0);
  const threatened = distance < 140 && ["punch", "uppercut", "kick"].includes(player.action);
  if (!player.grounded && cpu.grounded && distance < 105 && player.y > FLOOR - 185 && Math.random() < .43) {
    cpu.crouchTime = .45;
    setStance(cpu, true, false);
    attack(cpu, "punch");
    return;
  }
  if ((incoming || threatened) && cpu.grounded && Math.random() < .65) {
    cpu.guardTime = .26 + Math.random() * .22;
    cpu.crouchTime = player.lowAttack ? cpu.guardTime : 0;
    setStance(cpu, cpu.crouchTime > 0, true);
    cpu.moveIntent = 0;
    return;
  }
  if (cpu.kind === "blotta" && cpu.power >= 30 && cpu.specialCooldown === 0 && distance < 260 && Math.random() < .09) {
    attack(cpu, "teleport");
    return;
  }
  if (cpu.kind === "tunki" && cpu.power >= 30 && cpu.specialCooldown === 0 && distance < 220 && cpu.grounded && Math.random() < .19) {
    attack(cpu, "slam");
    return;
  }
  if (distance > 120 * FIGHTER_SCALE) {
    cpu.moveIntent = toward;
    if (distance > 235 && cpu.power >= 35 && cpu.specialCooldown === 0 && Math.random() < .28) attack(cpu, "special");
    else if (distance < 215 && cpu.grounded && Math.random() < .10) jump(cpu);
    return;
  }
  cpu.moveIntent = distance < 62 * FIGHTER_SCALE && Math.random() < .2 ? -toward : 0;
  // Choose a low attack against a standing guard, but still allow reaction mistakes.
  if (player.guarding && !player.crouching && cpu.grounded && Math.random() < .6) {
    cpu.crouchTime = .42;
    setStance(cpu, true, false);
    attack(cpu, "kick");
    return;
  }
  const roll = Math.random();
  const punchReach = (MOVES.punch.reach + stats[player.kind].width) * FIGHTER_SCALE - 4;
  if (roll < .37) attack(cpu, distance <= punchReach ? "punch" : "kick");
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
      addEffect("ground", f.x, FLOOR + 2, "#e4c38a", 44, .28);
      if (f.action === "slam") {
        f.slamLanded = true;
        f.actionTime = f.actionDuration = .33;
        f.vx *= .15;
        f.landingSquash = .22;
        screenShake = 7;
        dustBurst(f.x, FLOOR, 24);
        burst(f.x, FLOOR - 12, "#ff77bc", 15);
        addEffect("ground", f.x, FLOOR, "#ff82cf", 130, .48);
        addEffect("impact", f.x, FLOOR - 12, "#ffb6e1", 75, .3);
        sfx("slam");
      }
    }
  } else f.grounded = false;
}

function updateFighter(f, dt) {
  const other = f === player ? cpu : player;
  if (f.action === "idle") {
    const speed = stats[f.kind].speed * (humanFighter(f) ? 1 : .82);
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
      f.vy = f.slamFromAir ? 180 : -800;
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
  // A full stride follows distance travelled; backsteps play the cycle in reverse.
  if (f.grounded && f.action === "idle" && !f.crouching && !f.guarding) {
    const previousStep = Math.floor(f.walkPhase);
    f.walkPhase = ((f.walkPhase + f.vx * f.facing * dt / 35) % 4 + 4) % 4;
    if (Math.abs(f.vx) > 90 && Math.floor(f.walkPhase) !== previousStep) dustBurst(f.x - Math.sign(f.vx) * 15, FLOOR, 2);
  }

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
        addEffect("ring", f.x, FLOOR - 80, "#b9a8ff", 60, .32);
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
        addEffect("ring", f.x, FLOOR - 80, "#cddcff", 70, .32);
      }
    }
    if (f.actionTime === 0) {
      stopFighterSound(f);
      f.action = "idle";
      f.actionDuration = 0;
      f.moveSpec = null;
      f.lowAttack = f.airAttack = false;
      setStance(f, humanFighter(f) ? fighterInput(f).down : f.crouchTime > 0, humanFighter(f) ? fighterInput(f).guard : f.guardTime > 0);
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
        if (canCancel) { stopFighterSound(f); f.action = "idle"; f.actionTime = 0; }
        if (queued === "jump") jump(f);
        else attack(f, queued);
      }
    }
  }
  const progress = actionProgress(f);
  if ((f.action === "slam" && f.slamDiving && !f.slamLanded) || (f.action === "uppercut" && progress > .18 && progress < .6) || (f.action === "kick" && progress > .2 && progress < .72) || (f.action === "special" && progress > .3 && progress < .65)) {
    f.trailClock -= dt;
    if (f.trailClock <= 0) { addAfterimage(f); f.trailClock = .06; }
  } else f.trailClock = 0;
}

function hurtBox(f) {
  const low = f.crouching || f.lowAttack;
  const rise = f.action === "uppercut" ? uppercutRise(f) : 0;
  const height = (f.action === "uppercut" ? lerp(124, stats[f.kind].height, rise) : low ? 124 : stats[f.kind].height) * FIGHTER_SCALE;
  const width = stats[f.kind].width * FIGHTER_SCALE;
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
  if (f.attackLanded || !["punch", "uppercut", "kick"].includes(f.action) || isVanished(target) || target.invuln > 0) return null;
  const spec = f.moveSpec;
  const elapsed = f.actionDuration - f.actionTime;
  if (elapsed < spec.startup || elapsed > spec.startup + spec.active) return null;
  const front = f.x + f.facing * spec.reach * FIGHTER_SCALE;
  const low = f.lowAttack;
  const rising = f.action === "uppercut";
  const centerY = f.y - (rising ? lerp(93, 218, smoothstep((elapsed - spec.startup) / spec.active)) : low ? 34 : (f.action === "punch" ? (f.kind === "sergio" ? 88 : 145) : 120)) * FIGHTER_SCALE;
  const thickness = (rising ? 25 : f.action === "punch" ? 14 : 20) * FIGHTER_SCALE;
  const box = { left: Math.min(f.x, front), right: Math.max(f.x, front), top: centerY - thickness, bottom: centerY + thickness };
  if (!overlaps(box, hurtBox(target))) return null;
  return {
    attacker: f, target, damage: spec.damage + (f.kind === "sergio" && f.action === "punch" ? 2 : 0),
    knock: spec.knock, lift: rising ? spec.lift : f.airAttack ? -120 : 0, direction: f.facing, low,
    sourceX: f.x, projectile: false, x: (front + target.x) / 2, y: centerY
  };
}

function slamContact(f, target) {
  if (f.attackLanded || !f.slamDiving || isVanished(target) || target.invuln > 0) return null;
  if (f.slamLanded && f.actionTime < .24) return null;
  const radius = (f.slamLanded ? 100 : 49) * FIGHTER_SCALE;
  const box = { left: f.x - radius, right: f.x + radius, top: f.y - 65 * FIGHTER_SCALE, bottom: f.y + 5 };
  if (!overlaps(box, hurtBox(target))) return null;
  const direction = Math.sign(target.x - f.x) || f.facing;
  return { attacker: f, target, damage: MOVES.slam.damage, knock: MOVES.slam.knock, lift: -180,
    direction, sourceX: f.x, low: false, overhead: true, projectile: false, x: target.x, y: Math.min(f.y, target.y - 80) };
}

function separateFighters() {
  if (fighters.some(isVanished)) return;
  if (!overlaps(hurtBox(player), hurtBox(cpu))) return;
  const dx = cpu.x - player.x;
  const spacing = (stats[player.kind].width + stats[cpu.kind].width) * FIGHTER_SCALE + 2;
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
    if (humanFighter(f)) queueAction(f, "jump");
    return false;
  }
  f.crouching = f.guarding = false;
  f.vy = -stats[f.kind].jump * JUMP_BOOST;
  f.vx = f.moveIntent * stats[f.kind].speed * .92;
  f.grounded = false;
  dustBurst(f.x, FLOOR, 4);
  addEffect("ground", f.x, FLOOR, powerColor(f.kind), 40, .25);
  sfx("jump");
  return true;
}

function attack(f, type) {
  if (state !== "playing" || !f || !["punch", "kick", "special", "teleport", "slam"].includes(type)) return false;
  if (type === "teleport" && f.kind !== "blotta") return false;
  if (type === "slam" && f.kind !== "tunki") return false;
  if (isLocked(f)) {
    if (humanFighter(f)) queueAction(f, type);
    return false;
  }
  if (type === "special" && f.kind === "facu" && f.mustacheAway) return false;
  const cost = type === "special" ? 35 : ["teleport", "slam"].includes(type) ? 30 : 0;
  if (cost && (f.power < cost || f.specialCooldown > 0 || (!f.grounded && type !== "slam"))) {
    if (humanFighter(f)) sfx("empty");
    return false;
  }
  const low = f.grounded && (humanFighter(f) ? fighterInput(f).down : f.crouching) && !cost;
  if (low && type === "punch") type = "uppercut";
  stopFighterSound(f);
  f.moveSpec = MOVES[low && type === "kick" ? "lowKick" : type];
  f.action = type;
  f.actionDuration = f.moveSpec.startup + f.moveSpec.active + f.moveSpec.recovery;
  f.actionTime = f.actionDuration;
  f.attackLanded = false;
  f.lowAttack = low && type !== "uppercut";
  f.airAttack = !f.grounded;
  f.crouching = f.lowAttack;
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
    f.teleportDirection = humanFighter(f) ? Number(fighterInput(f).right) - Number(fighterInput(f).left) : 0;
    f.teleportDone = f.teleportSmokeStarted = false;
    f.vx = f.vy = 0;
  } else if (type === "special") {
    f.specialSpawned = false;
    f.specialStyle = f.kind === "facu" ? "boomerang" : f.kind === "sergio" ? (f.projectileToggle++ % 2 ? "bottle" : "meat") : f.kind === "tunki" ? "flowers" : f.kind === "marechal" ? "lightning" : "ki";
    if (COMBAT_AUDIO[f.specialStyle]) f.attackSound = startCombatSound(f.specialStyle);
    f.vx = 0;
  } else if (type === "kick" && !low && f.grounded) {
    f.vy = -260;
    f.vx = f.facing * 260;
    f.grounded = false;
    f.airAttack = true;
  } else if (f.grounded) {
    f.vx = f.facing * (low ? 35 : f.kind === "sergio" ? 180 : 105);
  }
  if (["punch", "uppercut", "kick"].includes(type)) {
    f.attackSound = startCombatSound(f.kind === "sergio" && type === "punch" ? "belly" : "general");
  } else if (type !== "special" || !COMBAT_AUDIO[f.specialStyle]) sfx(type);
  return true;
}

function spawnProjectile(owner, style) {
  if (style === "boomerang") { spawnBoomerang(owner); return; }
  const config = style === "ki" ? { speed: 470, damage: 13, radius: 16 } :
    style === "lightning" ? { speed: 560, damage: 13, radius: 15 } :
    style === "flowers" ? { speed: 405, damage: 14, radius: 20 } :
    style === "bottle" ? { speed: 425, damage: 12, radius: 16 } : { speed: 395, damage: 10, radius: 19 };
  const x = owner.x + owner.facing * 58 * FIGHTER_SCALE;
  const y = owner.y - 143 * FIGHTER_SCALE;
  addEffect("ring", x, y, powerColor(owner.kind), 36, .22);
  burst(x, y, powerColor(owner.kind), 5);
  const sound = COMBAT_AUDIO[style] ? owner.attackSound || startCombatSound(style) : null;
  if (sound === owner.attackSound) owner.attackSound = null;
  projectiles.push({
    sound,
    owner, style, x, y, prevX: x, prevY: y, prevSpin: 0,
    vx: owner.facing * config.speed, vy: style === "ki" || style === "lightning" ? 0 : -42,
    damage: config.damage, radius: config.radius * FIGHTER_SCALE, life: 2.5, spin: 0, trailTime: 0, trail: []
  });
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.style === "boomerang") { updateBoomerang(p, dt); if (state !== "playing") return; continue; }
    p.life -= dt;
    p.x += p.vx * dt;
    p.spin += dt * 8;
    if (p.style !== "ki" && p.style !== "lightning") { p.vy += 82 * dt; p.y += p.vy * dt; }
    p.trailTime -= dt;
    if (p.trailTime <= 0) {
      p.trail.unshift({ x: p.x, y: p.y });
      if (p.trail.length > 9) p.trail.pop();
      p.trailTime = .025;
      if (p.style === "flowers") burst(p.x, p.y, "#ff81c5", 1);
      if (p.style === "lightning") burst(p.x, p.y, "#91eaff", 1);
    }
    const target = p.owner === player ? cpu : player;
    // End as soon as the leading edge reaches the visible screen boundary.
    if (p.life <= 0 || (p.vx < 0 ? p.x - p.radius <= 0 : p.x + p.radius >= VIEW_WIDTH) || p.y + p.radius >= FLOOR) {
      stopCombatSound(p.sound);
      projectiles.splice(i, 1);
      continue;
    }
    const box = { left: p.x - p.radius, right: p.x + p.radius, top: p.y - p.radius, bottom: p.y + p.radius };
    if (!isVanished(target) && target.invuln <= 0 && overlaps(box, hurtBox(target))) {
      stopCombatSound(p.sound);
      hit(target, p.damage, Math.sign(p.vx) * 180, 0, p.owner,
        { direction: Math.sign(p.vx), sourceX: p.x - Math.sign(p.vx) * p.radius, projectile: true, low: false, x: p.x, y: p.y });
      if (p.style === "flowers") burst(p.x, p.y, "#ff72bb", 15);
      if (p.style === "lightning") burst(p.x, p.y, "#a8edff", 14);
      projectiles.splice(i, 1);
      if (state !== "playing") return;
    }
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
    addScore(target, 25);
    target.health = Math.max(0, target.health - (contact.projectile ? 1 : 0));
    target.power = Math.min(100, target.power + 4);
    target.action = "block";
    target.actionDuration = .15;
    target.actionTime = .15;
    target.vx = knockX * .24;
    target.invuln = .08;
    target.guardFlash = .20;
    burst(target.x + target.facing * 32 * FIGHTER_SCALE, target.y - (target.crouching ? 65 : 134) * FIGHTER_SCALE, "#8cecff", 6);
    addEffect("ring", target.x + target.facing * 32 * FIGHTER_SCALE, target.y - (target.crouching ? 65 : 134) * FIGHTER_SCALE, "#8cecff", 38, .24);
    hitStop = .025;
    sfx("block");
  } else {
    stopFighterSound(target);
    addScore(attacker, Math.min(damage, target.health) * 10);
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
    addEffect("impact", contact.x ?? target.x, contact.y ?? target.y - 104, powerColor(attacker.kind), damage > 11 ? 57 : 38, .25);
    sfx("hit");
    if (navigator.vibrate) navigator.vibrate(15);
  }
  suspendCombatSounds(false);
  if (target.health <= 0 && !resolvingContacts) finishRound(attacker, "K.O.");
  return true;
}

function finishRound(winner, reason) {
  if (state !== "playing") return;
  if (winner === player) match.playerWins++;
  else if (winner === cpu) match.cpuWins++;
  match.repeat = !winner;
  match.complete = match.playerWins >= 2 || match.cpuWins >= 2;
  if (winner) addScore(winner, 1000 + Math.ceil(roundTime) * 5 + Math.round(winner.health) * 10);
  if (match.complete) {
    match.winner = winner === player ? 0 : 1;
    addScore(winner, 2000);
    stopMusic();
  }
  state = match.complete ? "finished" : "roundOver";
  resultElapsed = 0;
  stopRoundVoice();
  stopAllCombatSounds();
  setPauseUI(false);
  clearHeld();
  ui.resultKicker.textContent = match.playerWins + " — " + match.cpuWins;
  ui.resultTitle.textContent = winner ? fighterLabel(winner) + " GANA" : "EMPATE";
  document.getElementById("finalScore").textContent = winner ? "PUNTAJE FINAL · " + match.scores[winner === player ? 0 : 1].toLocaleString("es-AR") : "";
  document.getElementById("roundNotice").textContent = !winner ? "EMPATE · SE REPITE EL ROUND" :
    fighterLabel(winner) + " GANA EL ROUND · " + match.playerWins + " — " + match.cpuWins;
  updateHud();
  announce(reason, 750);
  sfx(match.complete ? winner === player ? "win" : "lose" : "confirm");
}

function addScore(f, points) {
  if (!f || !match.scores) return;
  const slot = f === player ? 0 : 1;
  match.scores[slot] = Math.min(1000000, match.scores[slot] + Math.max(0, Math.round(points)));
}

function showGameOver() {
  match.endShown = true;
  ui.resultKicker.textContent = "GAME OVER";
  const humanWinner = match.winner === 0 || gameMode === "versus";
  document.getElementById("winnerForm").hidden = !humanWinner;
  document.getElementById("cpuResultNote").hidden = humanWinner;
  if (humanWinner) {
    const input = document.getElementById("winnerName");
    input.value = "";
    document.getElementById("saveError").textContent = "";
    document.getElementById("saveScoreBtn").disabled = false;
    // Mobile players tap the field deliberately, preventing a sudden keyboard resize.
    if (!mobileInput()) input.focus?.();
  }
}

function rankingPosition(position) {
  const lastTwo = position % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "TH" : ({1:"ST", 2:"ND", 3:"RD"}[position % 10] || "TH");
  return position + suffix;
}

const RANKING_API = "https://kp-fighter-ranking.sebastiandc99.chatgpt.site/api/ranking";
let rankingRequest = 0;

async function rankingFetch(url, options = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 15000) : null;
  try {
    const response = await fetch(url, {...options, signal: controller?.signal, credentials: "omit", cache: "no-store"});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo conectar con el ranking.");
    return data;
  } finally { if (timeout) clearTimeout(timeout); }
}

async function saveWinner(event) {
  event.preventDefault();
  if (state !== "finished" || !match.complete || !match.endShown || match.saved || match.saving || (gameMode === "solo" && match.winner !== 0)) return;
  const input = document.getElementById("winnerName");
  const name = input.value.normalize("NFKC").replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim();
  const message = document.getElementById("saveError");
  if (!name || name.length > 20) { message.textContent = "Escribí un nombre de 1 a 20 caracteres."; input.focus?.(); return; }
  const result = match;
  const button = document.getElementById("saveScoreBtn");
  result.saving = true; button.disabled = true; message.textContent = "Guardando puntaje…";
  try {
    await rankingFetch(RANKING_API, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({
      id: result.id, name, score: result.scores[result.winner], mode: gameMode,
      character: result.winner === 0 ? result.playerKind : result.cpuKind
    })});
    result.saved = true;
    if (state === "finished" && match === result) await showRanking(result.id);
  } catch (_) {
    if (match === result) message.textContent = "No se pudo guardar. Tu nombre sigue acá; revisá la conexión y volvé a intentar.";
  } finally { result.saving = false; button.disabled = false; }
}

async function showRanking(highlight = null) {
  const requestId = ++rankingRequest;
  state = "ranking";
  clearHeld(); stopAllCombatSounds(); stopRoundVoice(); stopMusic();
  setPauseUI(false);
  showScreen(ui.rankingScreen);
  const rows = document.getElementById("rankingRows");
  rows.replaceChildren();
  const status = document.getElementById("rankingStatus");
  status.textContent = "Cargando ranking completo…";
  document.getElementById("rankingRetryBtn").hidden = true;
  try {
    let cursor = null;
    const entries = new Map();
    const cursors = new Set();
    do {
      const data = await rankingFetch(RANKING_API + (cursor ? "?after=" + encodeURIComponent(cursor) : ""));
      if (state !== "ranking" || requestId !== rankingRequest) return;
      if (!Array.isArray(data.entries)) throw new Error("Invalid ranking response");
      data.entries.forEach(entry => { if (entry && typeof entry.name === "string" && Number.isSafeInteger(entry.score)) entries.set(entry.id, entry); });
      cursor = data.next || null;
      if (cursor && cursors.has(cursor)) throw new Error("Repeated ranking page");
      cursors.add(cursor);
    } while (cursor);
    const sorted = [...entries.values()].sort((a,b) => b.score - a.score || a.createdAt - b.createdAt || String(a.id).localeCompare(String(b.id)));
    for (const [index,entry] of sorted.entries()) {
      const row = document.createElement("tr");
      if (entry.id === highlight) row.classList.add("new-record");
      for (const [column,value] of [rankingPosition(index + 1), String(entry.score), entry.name].entries()) {
        const cell = document.createElement("td");
        const lettering = document.createElement("span"); lettering.classList.add("ranking-lettering");
        lettering.textContent = String(value); cell.appendChild(lettering);
        if (column === 2 && entry.name.length > 9) cell.classList.add("long-name");
        row.appendChild(cell);
      }
      rows.appendChild(row);
    }
    status.textContent = sorted.length ? sorted.length + " RESULTADOS · DESLIZÁ PARA VER TODOS" : "Todavía no hay resultados. ¡El primero puede ser tuyo!";
  } catch (_) {
    if (state !== "ranking" || requestId !== rankingRequest) return;
    status.textContent = "No se pudo cargar el ranking. Revisá la conexión y reintentá.";
    document.getElementById("rankingRetryBtn").hidden = false;
  }
}

function isLocked(f) {
  return f.action !== "idle" && f.actionTime > 0;
}

function actionProgress(f) {
  if (!f.actionDuration) return 0;
  return Math.max(0, Math.min(1, 1 - f.actionTime / f.actionDuration));
}

function uppercutRise(f) {
  const elapsed = f.actionDuration - f.actionTime;
  return smoothstep((elapsed - MOVES.uppercut.startup * .5) / (MOVES.uppercut.startup * .5 + MOVES.uppercut.active))
    * (1 - smoothstep((elapsed - MOVES.uppercut.startup - MOVES.uppercut.active) / MOVES.uppercut.recovery));
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 70 + Math.random() * 230;
    particles.push({ x, y, prevX: x, prevY: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .35 + Math.random() * .25, color, size: 2 + Math.random() * 4, spark: true });
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
    kind: f.kind, mustacheAway: f.mustacheAway,
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
  if (particles.length > 220) particles.splice(0, particles.length - 220);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.gravity ?? 620) * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function powerColor(kind) {
  return { facu: "#ffe47a", sergio: "#ffc650", blotta: "#76daff", tunki: "#ff8bd5", marechal: "#a5eaff" }[kind];
}

function addEffect(type, x, y, color, radius, life) {
  if (effects.length >= 48) effects.shift();
  effects.push({ type, x, y, color, radius, life, maxLife: life });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].life -= dt;
    if (effects[i].life <= 0) effects.splice(i, 1);
  }
}

function drawEffect(effect) {
  const age = 1 - effect.life / effect.maxLife;
  const radius = effect.radius * (.15 + smoothstep(age) * .85);
  ctx.save();
  ctx.translate(effect.x, effect.y);
  ctx.globalAlpha = (1 - age) * .85;
  ctx.strokeStyle = effect.color;
  ctx.lineWidth = Math.max(1, 5 * (1 - age));
  if (effect.type === "ground") {
    ctx.scale(1, .22);
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha *= .4;
    ctx.beginPath(); ctx.arc(0, 0, radius * .7, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
    if (effect.type === "impact") {
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4 + .2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * radius * .25, Math.sin(angle) * radius * .25);
        ctx.lineTo(Math.cos(angle) * radius * (i % 2 ? .75 : 1.2), Math.sin(angle) * radius * (i % 2 ? .75 : 1.2));
        ctx.stroke();
      }
      ctx.fillStyle = "#fff7d8";
      ctx.globalAlpha *= 1 - age;
      ctx.beginPath(); ctx.arc(0, 0, 12 * (1 - age), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function drawStage(image, parallaxX) {
  if (!image.complete || !image.naturalWidth) { ctx.fillStyle = "#16263a"; ctx.fillRect(0, 0, 960, 540); return; }
  const width = image.naturalWidth;
  const height = image.naturalHeight || width * 9 / 16;
  const scale = Math.max(976 / width, 550 / height);
  const cropWidth = 976 / scale;
  const cropHeight = 550 / scale;
  // Preserve image proportions and the plant's Newmont sign when framing 4:3 art.
  ctx.drawImage(image, (width - cropWidth) / 2, (height - cropHeight) * .6, cropWidth, cropHeight, -8 + parallaxX, -5, 976, 550);
}

function draw() {
  ctx.setTransform(drawingScale, 0, 0, drawingScale, 0, 0);
  const shakeX = screenShake ? (Math.random() - .5) * screenShake : 0;
  const shakeY = screenShake ? (Math.random() - .5) * screenShake * .55 : 0;
  const parallaxX = Math.sin(stageTime * .55) * 2;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawStage(stageImages[stageChoice], parallaxX);

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
  projectiles.forEach(p => { drawProjectileTrail(p); drawProjectile(p); });
  particles.forEach(drawParticle);
  effects.forEach(drawEffect);
  ctx.restore();
}

function poseFor(f) {
  const progress = actionProgress(f);
  if (f.action === "hit") return POSES[f.kind].hit;
  if (f.action === "uppercut") {
    const elapsed = f.actionDuration - f.actionTime;
    return elapsed < MOVES.uppercut.startup * .65 || elapsed > MOVES.uppercut.startup + MOVES.uppercut.active + MOVES.uppercut.recovery * .6 ? 8 : 12;
  }
  // Frames 6–11 come from the movement atlas, with separate jump and guard poses.
  if (f.action === "teleport") return 11;
  if (f.action === "slam") return f.slamLanded ? 11 : f.slamDiving ? POSES.tunki.slam : f.slamLaunched ? 10 : 8;
  if (f.guarding || f.action === "block") return 9;
  if (["punch", "kick", "special"].includes(f.action) && f.moveSpec) {
    const elapsed = f.actionDuration - f.actionTime;
    if (elapsed > f.moveSpec.startup + f.moveSpec.active + f.moveSpec.recovery * .58) {
      return f.lowAttack ? 8 : !f.grounded ? 10 : POSES[f.kind].idle;
    }
  }
  if (f.kind === "facu" && f.lowAttack && f.action === "kick") return POSES.facu.sweep;
  if (f.kind === "marechal" && f.lowAttack && f.action === "kick") return POSES.marechal.sweep;
  if (f.lowAttack) return f.kind === "blotta" && f.action === "kick" ? POSES.blotta.sweep : 8;
  if (f.action === "punch") {
    return progress < .16 || progress > .86 ? POSES[f.kind].idle : f.kind === "sergio" ? 11 : POSES[f.kind].punch;
  }
  if (f.action === "kick") return progress < .12 ? POSES[f.kind].idle : POSES[f.kind].kick;
  if (f.action === "special") {
    if (progress < .15) return POSES[f.kind].idle;
    if (f.kind === "blotta") return POSES.blotta.power;
    if (f.kind === "tunki") return POSES.tunki.power;
    if (f.kind === "facu") return POSES.facu.power;
    if (f.kind === "marechal") return POSES.marechal.power;
    return f.projectileToggle % 2 ? POSES.sergio.meat : POSES.sergio.bottle;
  }
  if (f.crouching) return 8;
  if (!f.grounded) return 10;
  if (f.kind === "marechal" && f.landingSquash > .08 && f.action === "idle") return 11;
  if (Math.abs(f.vx) > 22) return [6, 0, 7, 0][Math.floor(f.walkPhase) % 4];
  return POSES[f.kind].idle;
}

function drawShadow(f) {
  if (isVanished(f)) return;
  const lift = Math.max(0, FLOOR - lerp(f.prevY, f.y, renderAlpha));
  ctx.save();
  const radius = Math.max(18, (stats[f.kind].width + 15) * FIGHTER_SCALE - lift * .035);
  const x = f.prevX + (f.x - f.prevX) * renderAlpha;
  ctx.translate(x, FLOOR + 3);
  ctx.scale(1, .2);
  const shadow = ctx.createRadialGradient(0, 0, 2, 0, 0, radius);
  shadow.addColorStop(0, "rgba(0,0,0,.65)");
  shadow.addColorStop(.5, "rgba(0,0,0,.28)");
  shadow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = Math.max(.25, 1 - lift / 360);
  ctx.fillStyle = shadow;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.restore();
}

function fighterMotion(f) {
  const motion = { dx: 0, dy: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const progress = actionProgress(f);
  const moving = f.grounded && f.action === "idle" && !f.crouching && !f.guarding && Math.abs(f.vx) > 1;

  if (f.action === "idle") {
    if (moving) {
      const weight = Math.min(1, Math.abs(f.vx) / stats[f.kind].speed);
      const step = Math.sin(f.walkPhase * Math.PI / 2);
      const lift = (1 - Math.cos(f.walkPhase * Math.PI)) * .5;
      motion.dy -= lift * 2.6 * weight;
      motion.rotation = (step * .014 - f.vx / 18000) * weight;
      motion.scaleX += lift * .009 * weight;
      motion.scaleY -= lift * .008 * weight;
    } else if (f.grounded) {
      const breath = Math.sin(f.animClock * 3.7);
      motion.dy -= 1.4 + breath * 1.15;
      motion.scaleX -= breath * .01;
      motion.scaleY += breath * .014;
    }
  }

  if (!f.grounded && f.action === "idle") {
    const lift = Math.min(1, Math.abs(f.vy) / stats[f.kind].jump);
    motion.scaleY += .035 * lift;
    motion.scaleX -= .018 * lift;
    motion.rotation -= Math.max(-.045, Math.min(.045, f.vx / 5000));
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
  const elapsed = f.actionDuration - f.actionTime;
  const move = f.moveSpec;
  const windup = move ? Math.sin(Math.PI * Math.min(1, elapsed / move.startup)) : 0;
  const extension = move ? smoothstep((elapsed - move.startup * .45) / (move.startup * .55))
    * (1 - smoothstep((elapsed - move.startup - move.active) / move.recovery)) : 0;
  if (f.action === "uppercut") {
    const rise = uppercutRise(f);
    motion.dx += f.facing * (10 * rise - 3 * windup);
    motion.rotation -= f.facing * .035 * rise;
    motion.scaleY = .80 + .20 * rise;
    motion.scaleX = 1.03 - .03 * rise;
  } else if (f.action === "punch") {
    motion.dx += f.facing * (-5 * windup + 15 * extension);
    motion.rotation += f.facing * (.018 * windup - .038 * extension);
    motion.scaleX += .035 * extension;
    motion.scaleY -= .02 * extension;
  } else if (f.action === "kick") {
    motion.dx += f.facing * (-3 * windup + 10 * extension);
    motion.dy -= 6 * extension;
    motion.rotation += f.facing * (.025 * windup - .06 * extension);
    motion.scaleX += .035 * extension;
    motion.scaleY -= .02 * extension;
  } else if (f.action === "special") {
    motion.dx += f.facing * (-4 * windup + 7 * extension);
    motion.rotation += f.facing * (.018 * windup - .022 * extension);
    motion.scaleY += .015 * extension;
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

function lerp(a, b, amount) { return a + (b - a) * amount; }

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function updateAnimation(f, dt) {
  const animation = f.animation;
  const pose = poseFor(f);
  if (animation.facing !== f.facing || isVanished(f)) {
    animation.pose = animation.fromPose = pose;
    animation.mix = animation.prevMix = 1;
    animation.facing = f.facing;
  } else if (pose !== animation.pose) {
    animation.fromPose = animation.mix >= .5 ? animation.pose : animation.fromPose;
    animation.pose = pose;
    animation.mix = animation.prevMix = 0;
    // Brief transitions retain crisp strikes while easing steps and stance changes.
    animation.duration = f.action === "hit" ? .018 : f.action === "idle" ? .065 : .035;
  }
  animation.mix = Math.min(1, animation.mix + dt / animation.duration);
  const target = fighterMotion(f);
  const follow = 1 - Math.exp(-(f.action === "hit" ? 65 : 42) * dt);
  for (const key of Object.keys(target)) animation.motion[key] = lerp(animation.motion[key], target[key], follow);
}

function renderedFighter(f) {
  const animation = f.animation;
  const motion = {};
  for (const key of Object.keys(animation.motion)) {
    motion[key] = lerp(animation.prevMotion[key], animation.motion[key], renderAlpha);
  }
  return { kind: f.kind, mustacheAway: f.mustacheAway, x: lerp(f.prevX, f.x, renderAlpha), y: lerp(f.prevY, f.y, renderAlpha),
    facing: f.facing, pose: animation.pose, fromPose: animation.fromPose,
    mix: smoothstep(lerp(animation.prevMix, animation.mix, renderAlpha)), motion };
}

function drawMotionLines(f, motion) {
  const progress = actionProgress(f);
  if (f.action === "uppercut" && progress > .15 && progress < .75) {
    ctx.save();
    ctx.translate(f.x + motion.dx, f.y - 120 * FIGHTER_SCALE);
    ctx.scale(f.facing * FIGHTER_SCALE, FIGHTER_SCALE);
    ctx.strokeStyle = powerColor(f.kind);
    ctx.globalAlpha = .65 * Math.sin(Math.PI * progress);
    ctx.lineCap = "round";
    for (const [radius, width] of [[72, 5], [83, 2]]) {
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 1.15, 0, -.1 - smoothstep(progress / .6) * 1.4, .7, false);
      ctx.stroke();
    }
    ctx.restore();
  }
  const active = (f.action === "kick" && progress > .16 && progress < .78)
    || (f.action === "punch" && progress > .2 && progress < .65);

  if (active) {
    ctx.save();
    ctx.globalAlpha = .28 * Math.sin(Math.PI * progress);
    ctx.strokeStyle = f.kind === "sergio" ? "#ffe165" : f.kind === "tunki" ? "#ff88ce" : "#8fe5ff";
    ctx.lineCap = "square";
    for (let i = 0; i < 4; i++) {
      const y = f.y - (55 + i * 18) * FIGHTER_SCALE + motion.dy;
      const front = f.x + motion.dx - f.facing * (34 + i * 5);
      ctx.lineWidth = 5 - i * .7;
      ctx.beginPath();
      ctx.moveTo(front, y);
      ctx.lineTo(front - f.facing * (42 + i * 13), y + i * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (f.action === "kick") {
      ctx.save();
      ctx.translate(f.x + motion.dx, f.y - (f.lowAttack ? 28 : 88) * FIGHTER_SCALE);
      ctx.scale(f.facing, 1);
      ctx.globalAlpha = .5 * Math.sin(Math.PI * progress);
      ctx.strokeStyle = powerColor(f.kind);
      ctx.lineCap = "round";
      for (const [radius, width] of [[64, 5], [76, 2]]) {
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * FIGHTER_SCALE, radius * .72 * FIGHTER_SCALE, -.35, -1.35, .1 + progress * 1.5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  if (f.action === "special" && progress > .1 && progress < .72) {
    ctx.save();
    ctx.globalAlpha = .34;
    ctx.strokeStyle = f.kind === "blotta" || f.kind === "marechal" ? "#69dbff" : f.kind === "tunki" ? "#ff88ce" : "#ffbf3d";
    ctx.lineWidth = 3;
    const radius = 48 + Math.sin(progress * Math.PI * 5) * 8;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y - 82 * FIGHTER_SCALE, radius * FIGHTER_SCALE, radius * .68 * FIGHTER_SCALE, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(f.x + f.facing * 52 * FIGHTER_SCALE, f.y - 143 * FIGHTER_SCALE);
    const charge = Math.sin(Math.PI * Math.min(1, progress / .72));
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 32);
    glow.addColorStop(0, powerColor(f.kind));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.globalAlpha = charge * .65;
    ctx.fillRect(-32, -32, 64, 64);
    ctx.fillStyle = "#fff6dc";
    for (let i = 0; i < 4; i++) {
      const angle = stageTime * 12 + i * Math.PI / 2;
      const radius = 22 - charge * 10;
      ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  if (f.kind === "marechal" && f.action === "special" && progress > .12 && progress < .78) {
    ctx.save();
    ctx.translate(f.x + f.facing * 51 * FIGHTER_SCALE, f.y - 143 * FIGHTER_SCALE);
    ctx.scale(f.facing * FIGHTER_SCALE, FIGHTER_SCALE);
    ctx.strokeStyle = "#c5f4ff";
    ctx.shadowColor = "#219cff";
    ctx.shadowBlur = 9;
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-17, side * 12);
      ctx.lineTo(-6, side * (20 + Math.sin(stageTime * 35) * 4));
      ctx.lineTo(0, side * 5);
      ctx.lineTo(10, side * 15);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function spriteFrame(frame) {
  if (frame.kind === "facu") return facuSpriteFrame(frame);
  const key = frame.kind + ":" + frame.pose;
  if (spriteFrames.has(key)) return spriteFrames.get(key);
  const uppercut = frame.pose === 12;
  const movement = frame.pose >= 6 && !uppercut;
  const image = uppercut ? assets.uppercuts : assets[frame.kind + (movement ? "Motion" : "")];
  if (!image.complete || !image.naturalWidth) return null;
  const pose = uppercut ? roster.indexOf(frame.kind) : frame.pose % 6;
  const cell = 270;
  const surface = document.createElement("canvas");
  surface.width = surface.height = cell;
  const paint = surface.getContext("2d");
  const baseline = uppercut || movement || frame.kind !== "blotta" ? 260 : (pose === 4 ? 265 : 269);
  const columns = uppercut ? 2 : 3;
  paint.drawImage(image, (pose % columns) * cell, Math.floor(pose / columns) * cell, cell, cell, 0, 260 - baseline, cell, cell);
  // Stage lighting is applied once, preserving every original silhouette and detail.
  paint.globalCompositeOperation = "source-atop";
  const light = paint.createLinearGradient(0, 0, cell * .4, cell);
  light.addColorStop(0, "rgba(255,244,218,.12)");
  light.addColorStop(.45, "rgba(255,235,210,.025)");
  light.addColorStop(1, "rgba(10,21,40,.11)");
  paint.fillStyle = light;
  paint.fillRect(0, 0, cell, cell);
  spriteFrames.set(key, surface);
  return surface;
}

function blendedSprite(frame) {
  const current = spriteFrame(frame);
  if (!current || frame.mix == null || frame.mix >= 1 || frame.fromPose === frame.pose) return current;
  const previous = spriteFrame({ kind: frame.kind, pose: frame.fromPose, mustacheAway: frame.mustacheAway });
  if (!previous) return current;
  let surface = poseBlendSurfaces.get(frame.kind);
  if (!surface) {
    surface = document.createElement("canvas");
    surface.width = surface.height = 270;
    poseBlendSurfaces.set(frame.kind, surface);
  }
  const paint = surface.getContext("2d");
  paint.clearRect(0, 0, 270, 270);
  paint.globalCompositeOperation = "source-over";
  paint.globalAlpha = 1 - frame.mix;
  paint.drawImage(previous, 0, 0);
  // Premultiplied blending keeps shared opaque pixels solid during a transition.
  paint.globalCompositeOperation = "lighter";
  paint.globalAlpha = frame.mix;
  paint.drawImage(current, 0, 0);
  paint.globalAlpha = 1;
  paint.globalCompositeOperation = "source-over";
  return surface;
}

// The generated sheet has clean-shaven faces. The detachable piece is composited
// into each pose before blending, so it follows crouches, hits and jumps exactly.
const FACU_FRAMES = [
  [32,10,284,354,197,85,0], [377,14,324,349,545,89,0],
  [734,3,379,359,832,72,0], [1168,25,259,335,1251,86,-.2],
  [12,378,352,339,175,456,0], [372,475,343,239,489,543,0],
  [776,367,240,345,915,433,0], [1161,368,243,342,1300,434,0],
  [46,833,232,236,197,910,0], [407,727,265,348,548,803,0],
  [785,716,210,292,927,783,0], [1187,708,170,377,1275,807,-.25]
];
function facuPose(pose) { return pose === 12 ? 11 : Math.min(10, pose); }
function facuFace(pose) {
  const [x,y,w,h,mx,my,angle] = FACU_FRAMES[facuPose(pose)];
  return {x:135+(mx-x-w/2)*.66, y:260+(my-y-h)*.66, angle};
}
function drawMustache(paint, x, y, width, angle = 0) {
  paint.save(); paint.translate(x,y); paint.rotate(angle); paint.scale(width/40,width/40);
  paint.fillStyle="#1c0e0b"; paint.beginPath();
  paint.moveTo(0,-2); paint.bezierCurveTo(-7,-9,-12,4,-20,-5);
  paint.bezierCurveTo(-21,9,-6,12,0,3); paint.bezierCurveTo(6,12,21,9,20,-5);
  paint.bezierCurveTo(12,4,7,-9,0,-2); paint.fill();
  paint.strokeStyle="#69402a"; paint.lineWidth=1.6; paint.beginPath();
  paint.moveTo(-17,1);paint.quadraticCurveTo(-9,6,-2,0);
  paint.moveTo(2,0);paint.quadraticCurveTo(9,6,17,1);paint.stroke();paint.restore();
}
function clearSheetMatte(paint) {
  const pixels=paint.getImageData?.(0,0,270,270);
  if (!pixels?.data) return; // lightweight headless rendering adapter
  const data=pixels.data, seen=new Uint8Array(270*270), queue=[];
  const visit=index=>{
    if(seen[index])return;seen[index]=1;const n=index*4;
    const hi=Math.max(data[n],data[n+1],data[n+2]),lo=Math.min(data[n],data[n+1],data[n+2]);
    if(data[n+3]===0 || (lo>170 && hi-lo<24)){queue.push(index);data[n+3]=0;}
  };
  for(let n=0;n<270;n++){visit(n);visit(269*270+n);visit(n*270);visit(n*270+269);}
  for(let k=0;k<queue.length;k++){const n=queue[k],x=n%270,y=Math.floor(n/270);if(x)visit(n-1);if(x<269)visit(n+1);if(y)visit(n-270);if(y<269)visit(n+270);}
  paint.putImageData(pixels,0,0);
}
function facuSpriteFrame(frame) {
  const pose=facuPose(frame.pose), key="facu:"+pose+":"+!!frame.mustacheAway;
  if(spriteFrames.has(key))return spriteFrames.get(key);
  const image=assets.facu;if(!image.complete || !image.naturalWidth)return null;
  const surface=document.createElement("canvas");surface.width=surface.height=270;
  const paint=surface.getContext("2d"),[x,y,w,h]=FACU_FRAMES[pose];
  paint.imageSmoothingEnabled=false;
  paint.drawImage(image,x,y,w,h,135-w*.33,260-h*.66,w*.66,h*.66);
  clearSheetMatte(paint);
  if(!frame.mustacheAway){const face=facuFace(frame.pose);drawMustache(paint,face.x,face.y,22,face.angle);}
  spriteFrames.set(key,surface);return surface;
}
function facuMouth(f) {
  const face=facuFace(poseFor(f)), size=stats.facu.size*FIGHTER_SCALE/270;
  const motion=fighterMotion(f),flip=f.facing===stats.facu.defaultFace?1:-1;
  const x=(face.x-135)*size*flip*motion.scaleX, y=(face.y-260)*size*motion.scaleY;
  return {x:f.x+motion.dx+x*Math.cos(motion.rotation)-y*Math.sin(motion.rotation),y:f.y+motion.dy+x*Math.sin(motion.rotation)+y*Math.cos(motion.rotation)};
}
function spawnBoomerang(owner) {
  if(owner.mustacheAway)return;
  const mouth=facuMouth(owner),sound=owner.attackSound || startCombatSound("boomerang");
  owner.attackSound=null;owner.mustacheAway=true;
  projectiles.push({owner,style:"boomerang",sound,x:mouth.x,y:mouth.y,prevX:mouth.x,prevY:mouth.y,
    vx:owner.facing*500,vy:0,damage:13,radius:19,life:4,age:0,returning:false,contactDone:false,
    spin:0,prevSpin:0,trailTime:0,trail:[]});
}
function catchBoomerang(p) {
  p.owner.mustacheAway=false;stopCombatSound(p.sound);
  const index=projectiles.indexOf(p);if(index>=0)projectiles.splice(index,1);
}
function updateBoomerang(p,dt) {
  p.age+=dt;p.life-=dt;p.spin+=dt*18;
  const mouth=facuMouth(p.owner);
  if(!p.returning && (p.age>=.62 || p.x-p.radius<=0 || p.x+p.radius>=VIEW_WIDTH))p.returning=true;
  if(p.returning){
    const dx=mouth.x-p.x,dy=mouth.y-p.y,distance=Math.hypot(dx,dy),speed=690;
    if(distance<=speed*dt+8 || p.life<=0){catchBoomerang(p);return;}
    p.vx=dx/distance*speed;p.vy=dy/distance*speed;
  }
  p.x+=p.vx*dt;p.y+=p.vy*dt;
  p.trailTime-=dt;
  if(p.trailTime<=0){p.trail.unshift({x:p.x,y:p.y});if(p.trail.length>9)p.trail.pop();p.trailTime=.025;}
  const target=p.owner===player?cpu:player;
  const box={left:p.x-p.radius,right:p.x+p.radius,top:p.y-p.radius,bottom:p.y+p.radius};
  if(!p.contactDone && !isVanished(target) && target.invuln<=0 && overlaps(box,hurtBox(target))){
    p.contactDone=true;p.returning=true;
    hit(target,p.damage,Math.sign(p.vx)*180,0,p.owner,{direction:Math.sign(p.vx),sourceX:p.x-Math.sign(p.vx)*p.radius,projectile:true,low:false,x:p.x,y:p.y});
    burst(p.x,p.y,"#ffe47a",10);
  }
}

function drawSpriteFrame(frame, alpha = 1, ghost = false) {
  const sprite = blendedSprite(frame);
  if (!sprite) return;
  const cell = 270;
  const size = stats[frame.kind].size * FIGHTER_SCALE;
  const needsFlip = frame.facing !== stats[frame.kind].defaultFace;
  const motion = frame.motion;

  ctx.save();
  ctx.translate(frame.x + motion.dx, frame.y + motion.dy);
  ctx.rotate(motion.rotation);
  ctx.scale((needsFlip ? -1 : 1) * motion.scaleX, motion.scaleY);
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (ghost) ctx.globalCompositeOperation = "screen";
  else {
    ctx.shadowColor = "rgba(4,10,22,.65)";
    ctx.shadowBlur = 1.5 * drawingScale;
    ctx.shadowOffsetY = drawingScale;
  }
  ctx.drawImage(sprite, -size / 2, -size * 260 / cell, size, size);
  ctx.restore();
}

function drawAfterimage(ghost) {
  drawSpriteFrame(ghost, (ghost.life / ghost.maxLife) * .16, true);
}

function drawFighter(f) {
  const frame = renderedFighter(f);
  const { motion, x, y } = frame;
  drawMotionLines({ ...f, x, y }, motion);
  const flashing = f.flash > 0 && Math.floor(f.flash * 40) % 2 === 0;
  let opacity = flashing ? .55 : 1;
  if (f.action === "teleport") {
    const elapsed = f.actionDuration - f.actionTime;
    opacity *= elapsed < .16 ? 1 - elapsed / .16 : elapsed < .45 ? 0 : Math.min(1, (elapsed - .45) / .18);
  }
  drawSpriteFrame(frame, opacity);
  if (f.guarding || f.guardFlash > 0) {
    ctx.save();
    ctx.globalAlpha = .35 + f.guardFlash * 2;
    ctx.strokeStyle = "#8ddfff";
    ctx.lineWidth = f.guardFlash > 0 ? 4 : 2;
    ctx.beginPath();
    const centerY = y - (f.crouching ? 72 : 136) * FIGHTER_SCALE;
    ctx.arc(x + f.facing * 20 * FIGHTER_SCALE, centerY, 35 * FIGHTER_SCALE, f.facing > 0 ? -1.2 : Math.PI - 1.2, f.facing > 0 ? 1.2 : Math.PI + 1.2);
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

function drawProjectileTrail(p) {
  if (p.trail.length < 2) return;
  const x = lerp(p.prevX, p.x, renderAlpha);
  const y = lerp(p.prevY, p.y, renderAlpha);
  const tail = p.trail[p.trail.length - 1];
  const tint = powerColor(p.owner.kind);
  ctx.save();
  const gradient = ctx.createLinearGradient(tail.x, tail.y, x, y);
  gradient.addColorStop(0, "transparent");
  gradient.addColorStop(1, tint);
  ctx.strokeStyle = gradient;
  ctx.lineCap = "round";
  for (const [width, alpha] of [[23, .16], [10, .28], [3, .65]]) {
    ctx.lineWidth = width * FIGHTER_SCALE;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(x, y);
    p.trail.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.stroke();
  }
  ctx.restore();
}

function drawProjectile(p) {
  ctx.save();
  ctx.translate(lerp(p.prevX, p.x, renderAlpha), lerp(p.prevY, p.y, renderAlpha));
  ctx.scale(FIGHTER_SCALE, FIGHTER_SCALE);
  ctx.rotate(p.style === "ki" || p.style === "lightning" ? 0 : lerp(p.prevSpin, p.spin, renderAlpha) * Math.sign(p.vx));
  if (p.style === "boomerang") {
    ctx.shadowColor = "#ffe171"; ctx.shadowBlur = 9 * drawingScale;
    drawMustache(ctx, 0, 0, 54, 0);
  } else if (p.style === "lightning") {
    ctx.scale(Math.sign(p.vx) || 1, 1);
    ctx.lineJoin = "miter";
    ctx.shadowColor = "#139bff";
    ctx.shadowBlur = 14 * drawingScale;
    const flicker = Math.sin(stageTime * 55) * 4;
    for (const [width, color] of [[9, "#1584f0"], [5, "#76dfff"], [2, "#ffffff"]]) {
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(-67, -5);
      ctx.lineTo(-47, 8 + flicker);
      ctx.lineTo(-37, -9);
      ctx.lineTo(-21, 6 - flicker);
      ctx.lineTo(-9, -6);
      ctx.lineTo(15, 0);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#bef4ff";
    ctx.beginPath();
    ctx.moveTo(-38, -8);
    ctx.lineTo(-44, -20);
    ctx.lineTo(-54, -16);
    ctx.moveTo(-19, 5);
    ctx.lineTo(-31, 20);
    ctx.lineTo(-43, 15);
    ctx.stroke();
  } else if (p.style === "ki") {
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
  } else if (p.style === "meat") {
    // Grilled strips use the same drawn style on every browser, including phones.
    ctx.fillStyle = "#321713";
    ctx.beginPath(); ctx.moveTo(-27, -10); ctx.lineTo(-10, -15); ctx.lineTo(28, -6); ctx.lineTo(25, 9); ctx.lineTo(7, 14); ctx.lineTo(-28, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#bd673b";
    ctx.beginPath(); ctx.moveTo(-24, -8); ctx.lineTo(-10, -11); ctx.lineTo(24, -4); ctx.lineTo(21, 6); ctx.lineTo(7, 10); ctx.lineTo(-24, 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#542317"; ctx.lineWidth = 3;
    for (let x = -16; x < 24; x += 9) { ctx.beginPath(); ctx.moveTo(x, -8); ctx.lineTo(x - 4, 7); ctx.stroke(); }
    ctx.strokeStyle = "#efb673"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-22, 3); ctx.lineTo(8, 9); ctx.lineTo(23, 4); ctx.stroke();
  } else {
    ctx.fillStyle = "#111d12";
    ctx.fillRect(-6, -28, 12, 17);
    ctx.beginPath(); ctx.moveTo(-6, -14); ctx.lineTo(-13, -6); ctx.lineTo(-13, 27); ctx.lineTo(13, 27); ctx.lineTo(13, -6); ctx.lineTo(6, -14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#315b31"; ctx.fillRect(-9, -4, 18, 27);
    ctx.fillStyle = "#ab8b49"; ctx.fillRect(-6, -29, 12, 6);
    ctx.fillStyle = "#f1d9a0"; ctx.fillRect(-10, 3, 20, 13);
    ctx.fillStyle = "#9f292c"; ctx.fillRect(-10, 3, 20, 3);
    ctx.fillStyle = "#32442a"; ctx.fillRect(-7, 9, 14, 2); ctx.fillRect(-5, 12, 10, 2);
    ctx.fillStyle = "#bad296"; ctx.fillRect(-7, -6, 2, 7);
  }
  ctx.restore();
}

function drawParticle(p) {
  ctx.save();
  const x = lerp(p.prevX ?? p.x, p.x, renderAlpha);
  const y = lerp(p.prevY ?? p.y, p.y, renderAlpha);
  ctx.globalAlpha = Math.min(1, p.life * 4);
  ctx.fillStyle = p.color;
  if (p.smoke) {
    const age = 1 - p.life / p.maxLife;
    ctx.globalAlpha = Math.min(1, p.life * 4) * .72;
    const radius = p.size * (.6 + age * .8);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.arc(x + radius * .6, y + radius * .2, radius * .68, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.spark) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(1, p.size * .6);
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - p.vx * .025, y - p.vy * .025); ctx.stroke();
  } else ctx.fillRect(x, y, p.size, p.size);
  ctx.restore();
}

function updateHud() {
  if (!player || !cpu) return;
  ui.leftHealth.style.width = `${player.health}%`;
  ui.rightHealth.style.width = `${cpu.health}%`;
  ui.leftPower.style.width = `${player.power}%`;
  ui.rightPower.style.width = `${cpu.power}%`;
  ui.timer.textContent = String(Math.ceil(roundTime)).padStart(2, "0");
  document.getElementById("leftScore").textContent = String(match.scores?.[0] || 0).padStart(6, "0");
  document.getElementById("rightScore").textContent = String(match.scores?.[1] || 0).padStart(6, "0");
  document.getElementById("roundLabel").textContent = ROUND_AUDIO[match.round].title + " · " + match.playerWins + " — " + match.cpuWins;
  document.querySelectorAll("#leftRounds i").forEach((dot, index) => dot.classList.toggle("won", index < match.playerWins));
  document.querySelectorAll("#rightRounds i").forEach((dot, index) => dot.classList.toggle("won", index < match.cpuWins));
  document.querySelector('[data-tap="special"]').classList.toggle("ready", player.power >= 35 && player.specialCooldown === 0 && !player.mustacheAway);
  ui.abilityBtn.classList.toggle("ready", player.power >= 30 && player.specialCooldown === 0);
  document.getElementById("abilityBtn2").classList.toggle("ready", cpu.power >= 30 && cpu.specialCooldown === 0);
}

function setPauseUI(paused) {
  ui.pauseBtn.textContent = paused ? "SEGUIR" : "PAUSA";
  ui.pauseBtn.classList.toggle("resume", paused);
  ui.pauseBtn.setAttribute("aria-label", paused ? "Reanudar juego" : "Pausar juego");
  ui.gameScreen.classList.toggle("paused", paused);
  document.getElementById("pauseMenu").hidden = !paused;
  document.getElementById("pauseHelp").hidden = !paused;
}

function togglePause() {
  if (state === "playing" || state === "intro" || state === "roundOver") {
    pauseFrom = state;
    state = "paused";
    stopRoundVoice();
    suspendCombatSounds();
    pauseMusic();
    clearHeld();
    fighters.forEach(f => { f.queuedAction = null; });
    setPauseUI(true);
    ui.announcement.classList.remove("show");
    document.getElementById("resumeBtn").focus?.();
  } else if (state === "paused") {
    state = pauseFrom;
    syncCombatSounds();
    syncMusic();
    clearHeld();
    lastTime = performance.now();
    accumulator = 0;
    setPauseUI(false);
    ui.announcement.classList.remove("show");
    if (state === "intro") {
      const timing = ROUND_AUDIO[match.round].timing;
      syncRoundVoice();
      if (introElapsed >= timing.fight) announce("¡PELEA!", (timing.end - introElapsed) * 1000);
      else if (introElapsed >= timing.title) announce(ROUND_AUDIO[match.round].title, Math.max(0, timing.fight - introElapsed - .15) * 1000);
    }
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
  if (["intro", "playing", "paused", "roundOver", "finished"].includes(state)) {
    if (state !== "paused") draw();
    updateHud();
  }
  requestAnimationFrame(loop);
}

function ensureAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  if (!audioCtx) audioCtx = new Audio();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  [1, 2, 3].forEach(loadRoundVoice);
  Object.keys(COMBAT_AUDIO).forEach(loadCombatAudio);
  loadMusic(EXTRA_AUDIO.selection);
  if (musicTrack) loadMusic(musicTrack);
}

function loadCombatAudio(name) {
  const cue = COMBAT_AUDIO[name];
  if (!audioCtx || cue.buffer || cue.loading || typeof fetch !== "function") return;
  cue.loading = fetch(cue.src)
    .then(response => { if (!response.ok) throw new Error("Combat audio unavailable"); return response.arrayBuffer(); })
    .then(bytes => audioCtx.decodeAudioData(bytes))
    .then(buffer => { cue.buffer = buffer; syncCombatSounds(); })
    .catch(() => { /* A missing sound must never interrupt combat. */ });
}

function startCombatSound(name) {
  const voice = { name, elapsed: 0, source: null, gain: null, audibleAt: null };
  combatSounds.add(voice);
  ensureAudio();
  syncCombatSounds();
  return voice;
}

function disconnectCombatVoice(voice) {
  if (voice.source) {
    voice.source.onended = null;
    try { voice.source.stop(); } catch (_) { /* Already stopped. */ }
    voice.source.disconnect();
    voice.source = null;
  }
  if (voice.gain) { voice.gain.disconnect(); voice.gain = null; }
}

function stopCombatSound(voice, immediate = false) {
  if (!voice) return;
  combatSounds.delete(voice);
  const minAudible = ["lightning", "meat", "flowers", "boomerang"].includes(voice.name) ? .08 : 0;
  const heard = voice.audibleAt === null ? 0 : Math.max(0, (audioCtx?.currentTime ?? voice.elapsed) - voice.audibleAt);
  if (!immediate && voice.source && minAudible > heard && !muted && state === "playing") {
    // At point-blank range retain only a short attack transient, never the whole clip.
    soundTails.add(voice);
    voice.source.loop = false;
    voice.source.onended = () => { soundTails.delete(voice); disconnectCombatVoice(voice); };
    voice.source.stop((audioCtx.currentTime ?? 0) + minAudible - heard);
    return;
  }
  disconnectCombatVoice(voice);
  soundTails.delete(voice);
}

function stopFighterSound(f) {
  stopCombatSound(f.attackSound);
  f.attackSound = null;
}

function stopAllCombatSounds() {
  stopSynthSounds();
  projectiles = projectiles.filter(p => p.style !== "boomerang");
  for (const voice of [...combatSounds, ...soundTails]) stopCombatSound(voice, true);
  fighters.forEach(f => { f.attackSound = null; f.mustacheAway = false; });
}

function suspendCombatSounds(includeTails = true) {
  if (includeTails) stopSynthSounds();
  if (includeTails) for (const voice of soundTails) stopCombatSound(voice, true);
  for (const voice of combatSounds) disconnectCombatVoice(voice);
}

function syncCombatSounds() {
  if (state !== "playing" || hitStop > 0 || muted || !audioCtx || audioCtx.state !== "running") return;
  for (const voice of combatSounds) {
    const cue = COMBAT_AUDIO[voice.name];
    if (voice.source || !cue.buffer) continue;
    const source = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    source.buffer = cue.buffer;
    // Loops cover long flights. The owning attack ends the sound, never a timeout.
    source.loop = true;
    source.loopStart = cue.start;
    source.loopEnd = Math.min(cue.end ?? cue.buffer.duration, cue.buffer.duration);
    gain.gain.value = cue.volume;
    source.connect(gain).connect(audioCtx.destination);
    voice.source = source;
    voice.gain = gain;
    voice.audibleAt = audioCtx.currentTime ?? voice.elapsed;
    source.start(0, cue.start + voice.elapsed % (source.loopEnd - cue.start));
  }
}

function advanceCombatSounds(dt) {
  for (const voice of combatSounds) voice.elapsed += dt;
  syncCombatSounds();
}

function loadRoundVoice(round = match.round) {
  const cue = ROUND_AUDIO[round];
  if (!audioCtx || !cue.src || cue.loading || cue.buffer || typeof fetch !== "function") return;
  cue.loading = fetch(cue.src)
    .then(response => { if (!response.ok) throw new Error("Round audio unavailable"); return response.arrayBuffer(); })
    .then(bytes => audioCtx.decodeAudioData(bytes))
    .then(buffer => { cue.buffer = buffer; syncRoundVoice(); })
    .catch(() => { /* Keep the round playable with the synthesized cue if loading fails. */ });
}

function selectMusic(usage = "fight") {
  if (usage === "selection" && musicTrack?.usage === usage) { syncMusic(); return; }
  stopMusic();
  musicTrack = usage === "selection" ? EXTRA_AUDIO.selection : EXTRA_AUDIO.music[Math.floor(Math.random() * EXTRA_AUDIO.music.length)];
  ensureAudio();
  syncMusic();
}

function loadMusic(track) {
  if (!audioCtx || track.buffer || track.loading || typeof fetch !== "function") return;
  track.loading = fetch(track.src).then(response => {
    if (!response.ok) throw new Error("Music unavailable");
    return response.arrayBuffer();
  }).then(bytes => audioCtx.decodeAudioData(bytes)).then(buffer => { track.buffer = buffer; syncMusic(); }).catch(() => {});
}

function syncMusic() {
  const allowed = musicTrack?.usage === "selection" ? ["select", "stage"] : ["intro", "playing", "roundOver"];
  if (!allowed.includes(state) || muted || !audioCtx || audioCtx.state !== "running" || !musicTrack?.buffer) return;
  if (musicGain) musicGain.gain.value = state === "intro" ? .18 : musicTrack.usage === "selection" ? .42 : .36;
  if (musicSource) return;
  musicSource = audioCtx.createBufferSource();
  musicGain = audioCtx.createGain();
  musicSource.buffer = musicTrack.buffer;
  musicSource.loop = true;
  musicGain.gain.value = state === "intro" ? .18 : musicTrack.usage === "selection" ? .42 : .36;
  musicSource.connect(musicGain).connect(audioCtx.destination);
  musicSource.start(0, musicElapsed % musicTrack.buffer.duration);
  musicStartedAt = audioCtx.currentTime || 0;
}

function pauseMusic() {
  if (musicSource) {
    if (Number.isFinite(audioCtx.currentTime)) musicElapsed += Math.max(0, audioCtx.currentTime - musicStartedAt);
    try { musicSource.stop(); } catch (_) {} musicSource.disconnect(); musicSource = null;
  }
  if (musicGain) { musicGain.disconnect(); musicGain = null; }
}

function stopMusic() { pauseMusic(); musicTrack = null; musicElapsed = 0; }
function advanceMusic(dt) {
  if (!Number.isFinite(audioCtx?.currentTime)) musicElapsed += dt;
  syncMusic();
}

function stopRoundVoice() {
  if (roundVoiceSource) {
    roundVoiceSource.onended = null;
    try { roundVoiceSource.stop(); } catch (_) { /* It may have just ended. */ }
    roundVoiceSource.disconnect();
    roundVoiceSource = null;
  }
  roundVoiceStarted = false;
}

function syncRoundVoice() {
  const cue = ROUND_AUDIO[match.round];
  if (state !== "intro" || muted || !audioCtx || audioCtx.state !== "running" || !cue.src || !cue.buffer || roundVoiceStarted) return;
  const offset = introElapsed - cue.timing.voice;
  if (offset < 0 || offset >= cue.buffer.duration) return;
  const source = audioCtx.createBufferSource();
  source.buffer = cue.buffer;
  source.connect(audioCtx.destination);
  source.onended = () => { source.disconnect(); if (roundVoiceSource === source) roundVoiceSource = null; };
  source.start(0, offset);
  roundVoiceSource = source;
  roundVoiceStarted = true;
}

function stopSynthSounds() {
  soundGeneration++;
  for (const voice of synthVoices) { try { voice.osc.stop(); } catch (_) {} voice.osc.disconnect(); voice.gain.disconnect(); }
  synthVoices.clear();
}

function tone(freq, duration, type = "square", volume = .045, slide = 0) {
  if (muted || state === "paused") return;
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
  const voice = {osc, gain}; synthVoices.add(voice);
  osc.onended = () => { synthVoices.delete(voice); osc.disconnect(); gain.disconnect(); };
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function sfx(name) {
  if (muted || state === "paused") return;
  const generation = soundGeneration;
  const later = (callback, delay) => setTimeout(() => { if (generation === soundGeneration) callback(); }, delay);
  const sounds = {
    start: () => { tone(130, .12); later(() => tone(195, .18), 110); },
    move: () => tone(290, .055, "square", .025, 70),
    confirm: () => { tone(330, .08, "square", .035); later(() => tone(660, .14, "square", .035), 70); },
    fight: () => { tone(260, .12, "sawtooth", .05, 380); later(() => tone(520, .18), 100); },
    jump: () => tone(170, .11, "square", .025, 180),
    punch: () => tone(95, .08, "sawtooth", .018, -40),
    kick: () => tone(130, .12, "sawtooth", .02, -80),
    hit: () => { tone(62, .13, "square", .03, -22); tone(145, .05, "sawtooth", .015, -80); },
    special: () => { tone(220, .23, "sawtooth", .085, 380); later(() => tone(540, .12, "square", .06, -100), 80); },
    lightning: () => { tone(960, .16, "sawtooth", .038, -720); tone(140, .2, "square", .026, 510); },
    teleport: () => { tone(400, .23, "sine", .08, -330); tone(95, .36, "triangle", .06, 620); },
    slam: () => { tone(88, .22, "triangle", .075, -60); tone(48, .14, "sawtooth", .045, -20); },
    block: () => tone(720, .07, "triangle", .025, -370),
    empty: () => tone(70, .08, "square", .025),
    win: () => [0, 130, 260].forEach((d, i) => later(() => tone([330, 440, 660][i], .24), d)),
    lose: () => { tone(220, .25, "sawtooth", .04, -100); later(() => tone(105, .45, "square", .04, -55), 180); }
  };
  (sounds[name] || (() => {}))();
}

ui.startBtn.addEventListener("click", () => { requestMobileLandscape(); openModeSelection(); });
document.getElementById("soloBtn").addEventListener("click", () => startMode("solo"));
document.getElementById("versusBtn").addEventListener("click", () => startMode("versus"));
document.getElementById("modeBackBtn").addEventListener("click", mainMenu);
document.getElementById("fighterBackBtn").addEventListener("click", backFromFighters);
document.querySelectorAll("[data-pick]").forEach(btn => btn.addEventListener("click", () => chooseFighter(btn.dataset.pick)));
ui.confirmBtn.addEventListener("click", () => { requestMobileLandscape(); sfx("confirm"); confirmFighter(); });
document.querySelectorAll("[data-stage]").forEach(button => button.addEventListener("click", () => chooseStage(button.dataset.stage)));
document.getElementById("stageBackBtn").addEventListener("click", openSelection);
document.getElementById("stageConfirmBtn").addEventListener("click", () => { requestMobileLandscape(); startGame(playerChoice); });
ui.pauseBtn.addEventListener("click", togglePause);
document.getElementById("resumeBtn").addEventListener("click", () => { if (state === "paused") togglePause(); });
document.getElementById("quitBtn").addEventListener("click", mainMenu);
document.getElementById("titleRankingBtn").addEventListener("click", showRanking);
document.getElementById("rankingMenuBtn").addEventListener("click", mainMenu);
document.getElementById("newGameBtn").addEventListener("click", openModeSelection);
document.getElementById("rankingRetryBtn").addEventListener("click", showRanking);
document.getElementById("winnerForm").addEventListener("submit", saveWinner);
ui.soundBtn.addEventListener("click", () => {
  muted = !muted;
  if (muted) { stopRoundVoice(); suspendCombatSounds(); pauseMusic(); }
  ui.soundBtn.textContent = muted ? "🔇" : "🔊";
  ui.soundBtn.setAttribute("aria-label", muted ? "Activar sonido" : "Desactivar sonido");
  if (!muted) { ensureAudio(); syncRoundVoice(); syncCombatSounds(); syncMusic(); }
});

const HOLD_KEYS = {
  KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
  KeyS: "down", ArrowDown: "down", KeyI: "guard", ShiftLeft: "guard", ShiftRight: "guard"
};
const TAP_KEYS = { KeyW: "jump", ArrowUp: "jump", KeyJ: "punch", KeyK: "kick", KeyL: "special", KeyH: "ability" };
const P2_HOLD_KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down", Digit0: "guard", Numpad0: "guard", ControlRight: "guard" };
const P2_TAP_KEYS = { ArrowUp: "jump", Digit7: "punch", Numpad1: "punch", Digit8: "kick", Numpad2: "kick", Digit9: "special", Numpad3: "special", Digit6: "ability", Numpad4: "ability" };
function keyBinding(code) {
  if (gameMode === "versus" && (code in P2_HOLD_KEYS || code in P2_TAP_KEYS)) return {slot: 2, hold: P2_HOLD_KEYS[code], tap: P2_TAP_KEYS[code]};
  return {slot: 1, hold: HOLD_KEYS[code], tap: TAP_KEYS[code]};
}
function refreshHeld() {
  [held,held2].forEach((input,index) => {
    Object.keys(input).forEach(action => {
      input[action] = [...keyHolds].some(code => { const b = keyBinding(code); return b.slot === index + 1 && b.hold === action; })
        || [...touchHolds.values()].some(value => (value.slot || 1) === index + 1 && (value.action || value) === action);
    });
  });
}
function refreshHumans() { updatePlayer(); if (cpu && gameMode === "versus") updateHuman(cpu, held2); }
function performAction(action, slot = 1) {
  if (state !== "playing" || (slot === 2 && gameMode !== "versus")) return;
  const f = slot === 2 ? cpu : player;
  if (!f) return;
  refreshHumans();
  if (action === "jump") jump(f);
  else if (action === "ability") attack(f, stats[f.kind].ability);
  else attack(f, action);
}
window.addEventListener("keydown", event => {
  // Name entry and native buttons keep their own keyboard behavior.
  if (event.target?.tagName === "INPUT" || event.target?.tagName === "TEXTAREA" || state === "ranking") return;
  const code = event.code || (event.key === " " ? "Space" : event.key.length === 1 ? "Key" + event.key.toUpperCase() : event.key);
  if (state === "paused") {
    if (["Space", "Escape"].includes(code)) { event.preventDefault(); if (!event.repeat) togglePause(); }
    return;
  }
  const binding = keyBinding(code);
  if (binding.hold || binding.tap || ["Space", "Enter", "Escape"].includes(code)) event.preventDefault();
  if (event.repeat) return;
  if (state === "title") { if (["Enter", "Space"].includes(code)) openModeSelection(); return; }
  if (state === "mode") {
    if (["KeyA", "KeyD", "ArrowLeft", "ArrowRight"].includes(code)) chooseMode(modeChoice === "solo" ? "versus" : "solo");
    if (["Enter", "Space"].includes(code)) startMode(modeChoice);
    if (code === "Digit1") startMode("solo");
    if (code === "Digit2") startMode("versus");
    if (code === "Escape") mainMenu();
    return;
  }
  if (state === "select") {
    if (["KeyA", "KeyD", "ArrowLeft", "ArrowRight"].includes(code)) {
      const direction = code === "KeyA" || code === "ArrowLeft" ? -1 : 1;
      const selected = selectionPlayer === 2 ? opponentChoice : playerChoice;
      chooseFighter(roster[(roster.indexOf(selected) + direction + roster.length) % roster.length]);
    }
    if (["Enter", "Space", "KeyJ", "Numpad1"].includes(code)) confirmFighter();
    if (code === "Escape") backFromFighters();
    return;
  }
  if (state === "stage") {
    if (["KeyA", "KeyD", "ArrowLeft", "ArrowRight"].includes(code)) {
      const direction = code === "KeyA" || code === "ArrowLeft" ? -1 : 1;
      chooseStage(stageRoster[(stageRoster.indexOf(stageChoice) + direction + stageRoster.length) % stageRoster.length]);
    }
    if (["Enter", "Space", "KeyJ"].includes(code)) startGame(playerChoice);
    if (code === "Escape") openSelection();
    return;
  }
  if (code === "Space" || code === "Escape") { togglePause(); return; }
  if (state !== "playing") return;
  if (binding.hold) { keyHolds.add(code); refreshHeld(); refreshHumans(); }
  if (binding.tap) performAction(binding.tap, binding.slot);
});
window.addEventListener("keyup", event => {
  const code = event.code || (event.key.length === 1 ? "Key" + event.key.toUpperCase() : event.key);
  keyHolds.delete(code); refreshHeld();
  if (state === "playing") refreshHumans();
});
function pauseOnLeave() {
  clearHeld();
  if (state === "playing" || state === "intro" || state === "roundOver") togglePause();
}
window.addEventListener("blur", pauseOnLeave);
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseOnLeave(); });
document.querySelectorAll("[data-hold]").forEach(btn => {
  const slot = Number(btn.dataset.player || 1);
  btn.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (state !== "playing" || (slot === 2 && gameMode !== "versus")) return;
    if (event.pointerType === "touch") document.body.classList.add("touch-device");
    btn.setPointerCapture(event.pointerId);
    touchHolds.set(event.pointerId, {slot, action: btn.dataset.hold});
    refreshHeld(); refreshHumans(); btn.classList.add("active");
  });
  const release = event => {
    touchHolds.delete(event.pointerId); refreshHeld();
    if (state === "playing") refreshHumans();
    btn.classList.toggle("active", [...touchHolds.values()].some(v => v.slot === slot && v.action === btn.dataset.hold));
  };
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => btn.addEventListener(name, release));
});
document.querySelectorAll("[data-tap]").forEach(btn => {
  btn.addEventListener("pointerdown", event => {
    event.preventDefault();
    if (state !== "playing") return;
    btn.setPointerCapture(event.pointerId); btn.classList.add("active");
    performAction(btn.dataset.tap, Number(btn.dataset.player || 1));
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => btn.addEventListener(name, () => btn.classList.remove("active")));
});

document.addEventListener("pointerdown", event => {
  if (event.pointerType === "touch") {
    document.body.classList.add("touch-device");
    syncViewport();
  }
}, { passive: true });

document.addEventListener("contextmenu", event => {
  if (state !== "title" && state !== "select") event.preventDefault();
});

window.addEventListener("resize", syncViewport);
window.addEventListener("orientationchange", syncViewport);
document.addEventListener("fullscreenchange", syncViewport);
syncViewport();
if (window.location?.search && new URLSearchParams(window.location.search).has("ranking")) showRanking();
requestAnimationFrame(loop);
