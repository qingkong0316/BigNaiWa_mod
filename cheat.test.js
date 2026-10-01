/* 作弊菜单冒烟：引力手感、自选等级、锁定拖动、暂停警戒、不提交排行榜 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = __dirname;

function makeCtx() {
  const g = { addColorStop() {} };
  return {
    setTransform() {}, save() {}, restore() {}, scale() {}, rotate() {}, translate() {},
    clearRect() {}, fillRect() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    arc() {}, ellipse() {}, clip() {}, stroke() {}, fill() {}, setLineDash() {},
    drawImage() {},
    createLinearGradient: () => g, createRadialGradient: () => g,
    measureText: () => ({ width: 10 }), fillText() {}, strokeText() {},
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    font: '', textAlign: '', textBaseline: '', lineCap: ''
  };
}

function makeEl(id) {
  const el = {
    id, style: {}, textContent: '', hidden: false, width: 680, height: 160, _c: new Set(),
    classList: {
      add(c) { el._c.add(c); },
      remove(c) { el._c.delete(c); },
      toggle(c, on) { if (on) el._c.add(c); else el._c.delete(c); },
      contains: (c) => el._c.has(c)
    },
    getContext: () => el._ctx || (el._ctx = makeCtx()),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 420, height: 700 }),
    addEventListener() {},
    querySelector() { return { textContent: '' }; },
    querySelectorAll() { return []; },
    setAttribute() {},
    offsetWidth: 100
  };
  return el;
}

const els = {};
['game', 'stage', 'overlay', 'score', 'best', 'finalScore', 'finalBest',
 'next', 'chain', 'soundBtn', 'resetBtn', 'restartBtn'].forEach((id) => { els[id] = makeEl(id); });

const rafQueue = [];
let submitted = 0;
const sandbox = {
  console, Math, Date, JSON, Object, Array, Number, String, Boolean, Error, isNaN, Infinity,
  performance: { now: () => Date.now() },
  requestAnimationFrame(fn) { rafQueue.push(fn); return 1; },
  setTimeout: (fn) => setTimeout(fn, 0), clearTimeout,
  document: {
    readyState: 'complete',
    getElementById: (id) => els[id] || null,
    addEventListener() {},
    createElement: () => makeEl('tmp')
  },
  localStorage: {
    _d: {},
    getItem(k) { return this._d[k] ?? null; },
    setItem(k, v) { this._d[k] = String(v); }
  },
  addEventListener() {},
  navigator: {},
  Promise,
  URLSearchParams,
  Image: class {
    constructor() { this.onload = null; this.onerror = null; }
    set src(v) { this._src = v; if (this.onload) this.onload(); }
    get src() { return this._src; }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.fetch = function (url, opts) {
  const body = opts && opts.body && opts.body.toString ? opts.body.toString() : '';
  if (String(body).indexOf('action=update') !== -1) submitted++;
  return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'assets', 'fruits', 'parts.js'), 'utf8'), sandbox, { filename: 'parts.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'game.js'), 'utf8'), sandbox, { filename: 'game.js' });

const U = sandbox.__DNW__;
const S = U.state;
const C = U.cheats;
let pass = true;
function check(name, ok, extra) {
  if (!ok) pass = false;
  console.log((ok ? '  ok  ' : '  FAIL') + '  ' + name + (extra ? '  — ' + extra : ''));
}

let clock = Date.now();
function pump(frames) {
  for (let f = 0; f < frames; f++) {
    clock += 16.7;
    const q = rafQueue.splice(0, rafQueue.length);
    for (const fn of q) fn(clock);
  }
}

function sep(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/* 关掉作弊时，原物理路径不被引力拉动 */
U.reset();
C.attract = false;
S.balls.length = 0;
const farA = U.makeBall(80, 400, 0, 0, 0);
const farB = U.makeBall(340, 400, 0, 0, 0);
farA.landed = farB.landed = true;
S.balls.push(farA, farB);
const far0 = sep(farA, farB);
for (let i = 0; i < 90; i++) U.stepPhysics(1 / 60);
check('关作弊时远处同级不会相吸', Math.abs(sep(farA, farB) - far0) < 8, 'Δ=' + (sep(farA, farB) - far0).toFixed(1));

/* 局部引力：近的同级会靠近，远的和异级不会。分开测，避免落地后互相弹开干扰判断。 */
function pairGap(tierA, tierB, x0, x1) {
  U.reset();
  C.attract = true;
  S.balls.length = 0;
  const a = U.makeBall(x0, 280, tierA, 0, 0);
  const b = U.makeBall(x1, 280, tierB, 0, 0);
  S.balls.push(a, b);
  const g0 = Math.abs(b.x - a.x);
  for (let i = 0; i < 30; i++) U.stepPhysics(1 / 60);
  return [g0, Math.abs(b.x - a.x)];
}
const [near0, near1] = pairGap(1, 1, 170, 250);
const [diff0, diff1] = pairGap(1, 4, 180, 250);
const [edge0, edge1] = pairGap(1, 1, 40, 360);
check('近处同级会靠近', near1 < near0 - 12, near0.toFixed(1) + ' → ' + near1.toFixed(1));
check('不会在半秒内吸到重叠', near1 > 20, '距离 ' + near1.toFixed(1));
check('不同等级不互相吸引', Math.abs(diff1 - diff0) < 6, diff0.toFixed(1) + ' → ' + diff1.toFixed(1));
check('超出半径的同级基本不动', Math.abs(edge1 - edge0) < 6, edge0.toFixed(1) + ' → ' + edge1.toFixed(1));

/* 自选下一块 */
C.attract = false;
C.pick = true;
C.pickTier = 7;
U.reset();
check('自选后当前与下一块都是所选等级', S.pending === 7 && S.next === 7, 'pending=' + S.pending + ' next=' + S.next);
const before = S.balls.length;
U.tryDrop();
check('投放出去的就是所选等级', S.balls.length === before + 1 && S.balls[S.balls.length - 1].tier === 7);
check('投放之后下一块仍是所选等级', S.pending === 7 && S.next === 7);
C.pick = false;
U.reset();
check('关掉自选后会恢复随机链', S.pending >= 0 && S.pending <= 4 && S.next <= 4, 'pending=' + S.pending + ' next=' + S.next);

/* 锁定拖动：点到球不投放，拖得动，再点取消；点空处仍投放 */
C.lockDrag = true;
U.reset();
S.balls.length = 0;
const locked = U.makeBall(200, 400, 2, 0, 0);
locked.landed = true;
S.balls.push(locked);
const nLock = S.balls.length;
U.onPointerDown({ clientX: 200, clientY: 400, pointerType: 'mouse', pointerId: 3 });
check('点到球不会投放', S.balls.length === nLock && locked.held === true, '球数 ' + S.balls.length);
U.onPointerMove({ clientX: 280, clientY: 460, pointerType: 'mouse', pointerId: 3 });
check('拖动后球跟着走', Math.abs(locked.x - 280) < 30 && Math.abs(locked.y - 460) < 40,
  '位置 ' + locked.x.toFixed(0) + ',' + locked.y.toFixed(0));
const parked = { x: locked.x, y: locked.y };
U.onPointerUp({ clientX: 280, clientY: 460, pointerType: 'mouse', pointerId: 3 });
for (let i = 0; i < 20; i++) U.stepPhysics(1 / 60);
check('松手后仍然锁定，不会掉下去', locked.held === true && Math.abs(locked.y - parked.y) < 1,
  'held=' + locked.held + ' y=' + locked.y.toFixed(1));
U.onPointerDown({ clientX: locked.x, clientY: locked.y, pointerType: 'mouse', pointerId: 4 });
U.onPointerUp({ clientX: locked.x, clientY: locked.y, pointerType: 'mouse', pointerId: 4 });
check('再点同一颗会取消锁定', locked.held !== true);
pump(5);
const nAim = S.balls.length;
U.onPointerDown({ clientX: 120, clientY: 80, pointerType: 'mouse', pointerId: 5 });
check('没锁球时点击空白仍会投放', S.balls.length === nAim + 1, '球数 ' + S.balls.length);

/* 触屏：没点到球时仍是松手才投放 */
C.lockDrag = true;
U.reset();
pump(5);
const nTouch = S.balls.length;
U.onPointerDown({ clientX: 100, clientY: 200, pointerType: 'touch', pointerId: 8 });
check('锁定模式下面点空白，按下不投放', S.balls.length === nTouch);
U.onPointerMove({ clientX: 180, clientY: 200, pointerType: 'touch', pointerId: 8 });
U.onPointerUp({ clientX: 180, clientY: 200, pointerType: 'touch', pointerId: 8 });
check('锁定模式下面点空白，松手才投放', S.balls.length === nTouch + 1);

/* 暂停警戒 */
C.lockDrag = false;
C.pauseDanger = true;
U.reset();
S.balls.length = 0;
const danger = U.makeBall(210, 130, 0);
danger.y = 130; danger.py = 130; danger.vy = 0; danger.vx = 0; danger.landed = true;
S.balls.push(danger);
let frames = 0;
while (!S.over && frames < 240) {
  danger.y = 130; danger.py = 130; danger.vy = 0; danger.vx = 0;
  pump(1);
  frames++;
}
check('暂停警戒时卡在线上不结束', S.over === false, '帧 ' + frames);
C.pauseDanger = false;
S.cheatTainted = false;
U.reset();
S.balls.length = 0;
const danger2 = U.makeBall(210, 130, 0);
danger2.landed = true;
S.balls.push(danger2);
frames = 0;
while (!S.over && frames < 240) {
  danger2.y = 130; danger2.py = 130; danger2.vy = 0; danger2.vx = 0;
  pump(1);
  frames++;
}
check('关掉暂停后仍会按原规则结束', S.over === true, '帧 ' + frames);

/* 排行榜：开过作弊就不调用提交，fetch 的 update 也被拦住 */
submitted = 0;
C.attract = true;
U.reset();
sandbox.DanaiwaBoard = {
  onGameOver() { submitted += 10; }
};
S.over = false;
S.cheatTainted = true;
S.score = 50;
/* 直接走结束：用一颗静止越线球，但先确保 tainted */
C.pauseDanger = false;
S.balls.length = 0;
const d3 = U.makeBall(210, 130, 0);
d3.landed = true;
S.balls.push(d3);
frames = 0;
while (!S.over && frames < 240) {
  d3.y = 130; d3.py = 130; d3.vy = 0; d3.vx = 0;
  pump(1);
  frames++;
}
check('作弊对局结束时不调用原作上榜', S.over === true && submitted === 0, 'submitted=' + submitted);

const body = new sandbox.URLSearchParams();
body.set('action', 'update');
body.set('tag', 'dnw_test');
let rejected = false;
sandbox.fetch('https://tinywebdb.appinventor.space/api', { method: 'POST', body: body }).catch(() => { rejected = true; });
setTimeout(() => {
  check('作弊时发往 TinyWebDB 的 update 被拒绝', rejected === true && submitted === 0, 'rejected=' + rejected);
  C.attract = false;
  C.pick = false;
  C.lockDrag = false;
  C.pauseDanger = false;
  U.reset();
  check('全部关掉并重开后允许上榜', U.blockLeaderboard() === false);
  console.log(pass ? '\n作弊冒烟通过' : '\n作弊冒烟未通过');
  process.exit(pass ? 0 : 1);
}, 30);
