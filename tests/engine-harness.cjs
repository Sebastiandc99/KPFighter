const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
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
  const picks = ["sergio", "blotta", "tunki", "marechal", "facu", "flor", "galante", "padrino", "paula", "jairo"].map(kind => node("pick-" + kind, { pick: kind }));
  const portraits = ["sergio", "blotta", "tunki", "marechal", "facu", "flor", "galante", "padrino", "paula", "jairo"].map(kind => node("portrait-" + kind, { portrait: kind }));
  const stages = ["arcade", "mine", "newmont"].map(stage => node("stage-" + stage, { stage }));
  const leftRounds = [0, 1].map(i => node("left-round-" + i));
  const rightRounds = [0, 1].map(i => node("right-round-" + i));
  const holds = ["left", "right", "down", "guard"].map(hold => node("hold-" + hold, { hold }));
  const taps = ["jump", "punch", "kick", "special", "ability", "evade"].map(tap => node("tap-" + tap, { tap }));
  const holds2 = ["left", "right", "down", "guard"].map(hold => node("p2-hold-" + hold, { hold, player: "2" }));
  const taps2 = ["jump", "punch", "kick", "special", "ability", "evade"].map(tap => node("p2-tap-" + tap, { tap, player: "2" }));
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

module.exports={game};
