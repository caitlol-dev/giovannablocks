"use strict";

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("nextCanvas");
const nextCtx = nextCanvas.getContext("2d");
const holdCanvas = document.getElementById("holdCanvas");
const holdCtx = holdCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("highScore");
const levelEl = document.getElementById("level");
const linesEl = document.getElementById("lines");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlayKicker");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const menuBtn = document.getElementById("menuBtn");
const menuModal = document.getElementById("menuModal");
const resumeBtn = document.getElementById("resumeBtn");
const modalSoundBtn = document.getElementById("modalSoundBtn");
const themeBtn = document.getElementById("themeBtn");
const themeColorMeta = document.getElementById("themeColorMeta");
const boardFrame = document.getElementById("boardFrame");
const impactFlash = document.getElementById("impactFlash");

const COLORS = {
  I: "#78d7eb",
  J: "#89aef1",
  L: "#ffc49d",
  O: "#ffe88f",
  S: "#9be2c3",
  T: "#e9a9dd",
  Z: "#f4a6bd"
};

const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
  O: [[1,1],[1,1]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]]
};

let board = createBoard();
let active = null;
let nextType = null;
let holdType = null;
let canHold = true;
let bag = [];
let score = 0;
let lines = 0;
let level = 1;
let highScore = Number(localStorage.getItem("giovannaBlocksHighScore") || localStorage.getItem("neonBlocksHighScore") || 0);
let running = false;
let paused = false;
let gameOver = false;
let lastTime = 0;
let dropCounter = 0;
let animationId = null;

// Efeitos visuais
let particles = [];
let rowFlashes = [];

// Áudio via Web Audio API: nenhum arquivo externo é necessário.
let audioContext = null;
let soundEnabled = localStorage.getItem("giovannaBlocksSound") !== "off";
let currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

function ensureAudio() {
  if (!soundEnabled) return null;
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function tone(freq, duration = 0.07, type = "sine", volume = 0.035, endFreq = null, delay = 0) {
  const ac = ensureAudio();
  if (!ac) return;

  const now = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function soundRotate() { tone(520, .045, "sine", .018, 650); }
function soundHold() { tone(420, .06, "triangle", .022, 560); }
function soundLock(hard = false) {
  tone(hard ? 150 : 210, hard ? .11 : .075, "triangle", hard ? .045 : .028, hard ? 82 : 145);
  tone(hard ? 330 : 380, .045, "sine", .013, 260, .018);
}
function soundLineClear(count) {
  const chord = count >= 4 ? [523, 659, 784, 1047] : [587, 740, 880];
  chord.forEach((f, i) => tone(f, .12, "sine", .03, f * 1.03, i * .045));
}
function soundGameOver() {
  [420, 330, 250].forEach((f, i) => tone(f, .18, "triangle", .026, f * .78, i * .1));
}

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) { return matrix.map(row => [...row]); }

function refillBag() {
  const pieces = Object.keys(SHAPES);
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  bag.push(...pieces);
}

function getRandomType() {
  if (bag.length === 0) refillBag();
  return bag.shift();
}

function createPiece(type) {
  const matrix = cloneMatrix(SHAPES[type]);
  return { type, matrix, x: Math.floor((COLS - matrix[0].length) / 2), y: -getTopPadding(matrix) };
}

function getTopPadding(matrix) {
  let padding = 0;
  for (const row of matrix) {
    if (row.some(Boolean)) break;
    padding++;
  }
  return padding;
}

function spawnPiece() {
  const type = nextType || getRandomType();
  nextType = getRandomType();
  active = createPiece(type);
  canHold = true;
  drawNext();
  if (collides(active)) endGame();
}

function collides(piece, matrix = piece.matrix, testX = piece.x, testY = piece.y) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const bx = testX + x;
      const by = testY + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
  }
  return false;
}

function mergePiece(piece = active) {
  piece.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const by = piece.y + y;
      const bx = piece.x + x;
      if (by >= 0) board[by][bx] = piece.type;
    });
  });
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, index) => matrix.map(row => row[index]).reverse());
}

function rotatePiece() {
  if (!canPlay()) return;
  const rotated = rotateMatrix(active.matrix);
  const kicks = [0, -1, 1, -2, 2];
  for (const offset of kicks) {
    if (!collides(active, rotated, active.x + offset, active.y)) {
      active.matrix = rotated;
      active.x += offset;
      soundRotate();
      return;
    }
  }
}

function movePiece(dx) {
  if (!canPlay()) return;
  if (!collides(active, active.matrix, active.x + dx, active.y)) active.x += dx;
}

function softDrop(manual = true) {
  if (!canPlay()) return;
  if (!collides(active, active.matrix, active.x, active.y + 1)) {
    active.y++;
    if (manual) score += 1;
  } else {
    lockPiece(false);
  }
  updateStats();
}

function hardDrop() {
  if (!canPlay()) return;
  let distance = 0;
  while (!collides(active, active.matrix, active.x, active.y + 1)) {
    active.y++;
    distance++;
  }
  score += distance * 2;
  lockPiece(true);
  updateStats();
}

function getOccupiedCells(piece) {
  const cells = [];
  piece.matrix.forEach((row, y) => row.forEach((v, x) => {
    if (v && piece.y + y >= 0) cells.push({ x: piece.x + x, y: piece.y + y });
  }));
  return cells;
}

function addImpactParticles(piece, hard = false) {
  const cells = getOccupiedCells(piece);
  const amount = hard ? 4 : 2;
  cells.forEach(cell => {
    for (let i = 0; i < amount; i++) {
      particles.push({
        x: (cell.x + .5) * BLOCK,
        y: (cell.y + .88) * BLOCK,
        vx: (Math.random() - .5) * (hard ? 3.8 : 2.4),
        vy: -(Math.random() * (hard ? 4 : 2.6) + 1.1),
        life: hard ? 420 : 300,
        maxLife: hard ? 420 : 300,
        size: Math.random() * 3.2 + 1.6,
        color: Math.random() > .45 ? COLORS[piece.type] : "#ffffff"
      });
    }
  });
}

function triggerBoardImpact(hard = false) {
  boardFrame.classList.remove("bump", "bump-hard");
  impactFlash.classList.remove("active");
  void boardFrame.offsetWidth;
  boardFrame.classList.add(hard ? "bump-hard" : "bump");
  impactFlash.classList.add("active");
  window.setTimeout(() => boardFrame.classList.remove("bump", "bump-hard"), 280);
  window.setTimeout(() => impactFlash.classList.remove("active"), 250);
}

function lockPiece(hard = false) {
  const lockedPiece = { ...active, matrix: cloneMatrix(active.matrix) };
  addImpactParticles(lockedPiece, hard);
  triggerBoardImpact(hard);
  soundLock(hard);
  mergePiece(lockedPiece);
  clearLines();
  spawnPiece();
  dropCounter = 0;
}

function clearLines() {
  let cleared = 0;
  const clearedRows = [];
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(Boolean)) {
      clearedRows.push(y);
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      y++;
    }
  }

  if (!cleared) return;

  clearedRows.forEach(row => {
    rowFlashes.push({ y: row, life: 300, maxLife: 300 });
    for (let x = 0; x < COLS; x++) {
      for (let i = 0; i < 3; i++) {
        particles.push({
          x: (x + .5) * BLOCK,
          y: (row + .5) * BLOCK,
          vx: (Math.random() - .5) * 5,
          vy: (Math.random() - .5) * 4,
          life: 520,
          maxLife: 520,
          size: Math.random() * 4 + 2,
          color: Math.random() > .5 ? "#ffffff" : "#f5a9c8"
        });
      }
    }
  });

  const linePoints = [0, 100, 300, 500, 800];
  score += linePoints[cleared] * level;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  soundLineClear(cleared);
  triggerBoardImpact(cleared >= 4);
  updateStats();
}

function holdPiece() {
  if (!canPlay() || !canHold) return;
  const currentType = active.type;
  if (!holdType) {
    holdType = currentType;
    spawnPiece();
  } else {
    const swapType = holdType;
    holdType = currentType;
    active = createPiece(swapType);
    if (collides(active)) endGame();
  }
  canHold = false;
  drawHold();
  soundHold();
}

function getDropInterval() { return Math.max(90, 760 - (level - 1) * 62); }

function getGhostY() {
  let ghostY = active.y;
  while (!collides(active, active.matrix, active.x, ghostY + 1)) ghostY++;
  return ghostY;
}

function roundedRectPath(context, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + rr, y);
  context.arcTo(x + w, y, x + w, y + h, rr);
  context.arcTo(x + w, y + h, x, y + h, rr);
  context.arcTo(x, y + h, x, y, rr);
  context.arcTo(x, y, x + w, y, rr);
  context.closePath();
}

function drawCell(context, x, y, size, color, alpha = 1, inset = 1) {
  context.save();
  context.globalAlpha = alpha;
  const px = x * size + inset;
  const py = y * size + inset;
  const s = size - inset * 2;

  roundedRectPath(context, px, py, s, s, Math.max(3, size * .16));
  context.fillStyle = color;
  context.fill();

  const grad = context.createLinearGradient(px, py, px + s, py + s);
  grad.addColorStop(0, "rgba(255,255,255,.58)");
  grad.addColorStop(.42, "rgba(255,255,255,.05)");
  grad.addColorStop(1, "rgba(69,139,163,.14)");
  roundedRectPath(context, px, py, s, s, Math.max(3, size * .16));
  context.fillStyle = grad;
  context.fill();

  context.strokeStyle = "rgba(255,255,255,.8)";
  context.lineWidth = 1;
  roundedRectPath(context, px + .5, py + .5, s - 1, s - 1, Math.max(3, size * .16));
  context.stroke();

  // pequeno brilho circular deixa as peças mais “fofas”
  context.fillStyle = "rgba(255,255,255,.44)";
  context.beginPath();
  context.arc(px + s * .27, py + s * .25, Math.max(1.4, size * .055), 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function getCanvasTheme() {
  if (currentTheme === "dark") {
    return {
      boardTop: "#183643",
      boardBottom: "#102b36",
      boardGrid: "rgba(135, 218, 235, .12)",
      previewTop: "rgba(27, 59, 71, .98)",
      previewBottom: "rgba(17, 43, 53, .98)"
    };
  }

  return {
    boardTop: "#f6fdff",
    boardBottom: "#eaf9fd",
    boardGrid: "rgba(92,183,211,.12)",
    previewTop: "rgba(245,253,255,.95)",
    previewBottom: "rgba(232,248,252,.9)"
  };
}

function drawBoardBackground() {
  const theme = getCanvasTheme();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, theme.boardTop);
  grad.addColorStop(1, theme.boardBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = theme.boardGrid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath(); ctx.moveTo(x * BLOCK + .5, 0); ctx.lineTo(x * BLOCK + .5, ROWS * BLOCK); ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * BLOCK + .5); ctx.lineTo(COLS * BLOCK, y * BLOCK + .5); ctx.stroke();
  }
}

function drawMatrix(matrix, offsetX, offsetY, type, alpha = 1) {
  matrix.forEach((row, y) => row.forEach((value, x) => {
    if (value && offsetY + y >= 0) drawCell(ctx, offsetX + x, offsetY + y, BLOCK, COLORS[type], alpha);
  }));
}

function updateEffects(delta) {
  for (const p of particles) {
    p.x += p.vx * (delta / 16.67);
    p.y += p.vy * (delta / 16.67);
    p.vy += .16 * (delta / 16.67);
    p.life -= delta;
  }
  particles = particles.filter(p => p.life > 0);
  rowFlashes.forEach(f => f.life -= delta);
  rowFlashes = rowFlashes.filter(f => f.life > 0);
}

function drawEffects() {
  rowFlashes.forEach(f => {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.save();
    ctx.globalAlpha = a * .55;
    const g = ctx.createLinearGradient(0, 0, canvas.width, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(.5, "#ffffff");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, f.y * BLOCK, canvas.width, BLOCK);
    ctx.restore();
  });

  particles.forEach(p => {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (.55 + a * .45), 0, Math.PI * 2);
    ctx.fill();
    if (p.color === "#ffffff") {
      ctx.strokeStyle = "rgba(115,201,229,.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  });
}

function draw() {
  drawBoardBackground();
  board.forEach((row, y) => row.forEach((type, x) => {
    if (type) drawCell(ctx, x, y, BLOCK, COLORS[type]);
  }));

  if (active && !gameOver) {
    const ghostY = getGhostY();
    if (ghostY !== active.y) drawMatrix(active.matrix, active.x, ghostY, active.type, .18);
    drawMatrix(active.matrix, active.x, active.y, active.type, 1);
  }
  drawEffects();
}

function drawPreview(context, type, canvasEl) {
  const theme = getCanvasTheme();
  context.clearRect(0, 0, canvasEl.width, canvasEl.height);
  const bg = context.createLinearGradient(0, 0, 0, canvasEl.height);
  bg.addColorStop(0, theme.previewTop);
  bg.addColorStop(1, theme.previewBottom);
  context.fillStyle = bg;
  context.fillRect(0, 0, canvasEl.width, canvasEl.height);
  if (!type) return;

  const matrix = SHAPES[type];
  const size = 24;
  const occupiedRows = matrix.filter(row => row.some(Boolean));
  const minY = matrix.findIndex(row => row.some(Boolean));
  const coords = [];
  matrix.forEach((row, y) => row.forEach((value, x) => { if (value) coords.push({x, y: y - minY}); }));
  const minX = Math.min(...coords.map(c => c.x));
  const maxX = Math.max(...coords.map(c => c.x));
  const width = (maxX - minX + 1) * size;
  const height = occupiedRows.length * size;
  const startX = (canvasEl.width - width) / 2 - minX * size;
  const startY = (canvasEl.height - height) / 2;
  coords.forEach(({x,y}) => {
    context.save();
    context.translate(startX, startY);
    drawCell(context, x, y, size, COLORS[type], 1, 1.5);
    context.restore();
  });
}

function drawNext() { drawPreview(nextCtx, nextType, nextCanvas); }
function drawHold() { drawPreview(holdCtx, holdType, holdCanvas); }

function updateStats() {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem("giovannaBlocksHighScore", String(highScore));
  }
  scoreEl.textContent = score.toLocaleString("pt-BR");
  highScoreEl.textContent = highScore.toLocaleString("pt-BR");
  levelEl.textContent = level;
  linesEl.textContent = lines;
}

function updateSoundButton() {
  modalSoundBtn.textContent = soundEnabled ? "Som: ligado" : "Som: desligado";
  modalSoundBtn.setAttribute("aria-pressed", String(!soundEnabled));
}

function updateThemeButton() {
  const isDark = currentTheme === "dark";
  themeBtn.textContent = isDark ? "Tema: escuro" : "Tema: claro";
  themeBtn.setAttribute("aria-pressed", String(isDark));
  themeBtn.setAttribute("aria-label", isDark ? "Trocar para tema claro" : "Trocar para tema escuro");
}

function applyTheme(theme, save = true) {
  currentTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = currentTheme;

  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", currentTheme === "dark" ? "#102b36" : "#cceff7");
  }

  if (save) localStorage.setItem("giovannaBlocksTheme", currentTheme);
  updateThemeButton();
  draw();
  drawNext();
  drawHold();
}

function toggleTheme() {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

function resetGame() {
  board = createBoard();
  active = null;
  nextType = null;
  holdType = null;
  canHold = true;
  bag = [];
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropCounter = 0;
  particles = [];
  rowFlashes = [];
  lastTime = performance.now();
  closeMenu(false);
  drawHold();
  updateStats();
  spawnPiece();
}

function startGame() {
  ensureAudio();
  resetGame();
  running = true;
  hideOverlay();
  closeMenu(false);
  if (animationId) cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

function restartGame() {
  closeMenu(false);
  startGame();
}

function openMenu() {
  if (running && !gameOver) {
    paused = true;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }
  menuModal.classList.add("visible");
  menuModal.setAttribute("aria-hidden", "false");
  updateSoundButton();
  updateThemeButton();
}

function closeMenu(resumeGame = true) {
  menuModal.classList.remove("visible");
  menuModal.setAttribute("aria-hidden", "true");
  if (resumeGame && running && !gameOver) {
    paused = false;
    lastTime = performance.now();
    dropCounter = 0;
    if (!animationId) animationId = requestAnimationFrame(gameLoop);
  }
}

function togglePause() {
  if (menuModal.classList.contains("visible")) {
    closeMenu(true);
  } else {
    openMenu();
  }
}

function endGame() {
  gameOver = true;
  running = false;
  updateStats();
  soundGameOver();
  showOverlay("FIM DE JOGO", "Boa tentativa!", `Você fez ${score.toLocaleString("pt-BR")} pontos e chegou ao nível ${level}.`, "Jogar novamente");
}

function canPlay() { return running && !paused && !gameOver && active; }

function showOverlay(kicker, title, text, buttonText) {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startBtn.textContent = buttonText;
  overlay.classList.add("visible");
}
function hideOverlay() { overlay.classList.remove("visible"); }

function gameLoop(time = 0) {
  if (!running || gameOver || paused) {
    animationId = null;
    draw();
    return;
  }

  const delta = Math.min(45, time - lastTime || 0);
  lastTime = time;
  dropCounter += delta;

  if (dropCounter > getDropInterval()) {
    softDrop(false);
    dropCounter = 0;
  }

  updateEffects(delta);
  draw();

  if (running && !paused && !gameOver) {
    animationId = requestAnimationFrame(gameLoop);
  } else {
    animationId = null;
  }
}

function handleAction(action) {
  if (action === "left") movePiece(-1);
  if (action === "right") movePiece(1);
  if (action === "down") softDrop(true);
  if (action === "rotate") rotatePiece();
  if (action === "drop") hardDrop();
  if (action === "hold") holdPiece();
  draw();
}

document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  const handledKeys = ["arrowleft", "arrowright", "arrowdown", "arrowup", " ", "c", "p"];
  if (handledKeys.includes(key)) event.preventDefault();
  if (key === "p") { togglePause(); return; }
  if (paused || gameOver || !running) return;
  if (key === "arrowleft") movePiece(-1);
  if (key === "arrowright") movePiece(1);
  if (key === "arrowdown") softDrop(true);
  if (key === "arrowup") rotatePiece();
  if (key === " ") hardDrop();
  if (key === "c") holdPiece();
  draw();
});

startBtn.addEventListener("click", () => {
  ensureAudio();
  startGame();
});
restartBtn.addEventListener("click", restartGame);
menuBtn.addEventListener("click", togglePause);
resumeBtn.addEventListener("click", () => closeMenu(true));
modalSoundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem("giovannaBlocksSound", soundEnabled ? "on" : "off");
  updateSoundButton();
  if (soundEnabled) {
    ensureAudio();
    tone(620, .07, "sine", .02, 780);
  }
});

themeBtn.addEventListener("click", toggleTheme);

menuModal.addEventListener("click", event => {
  if (event.target === menuModal) closeMenu(true);
});

// Controles mobile: toque imediato + repetição ao segurar esquerda/direita/baixo.
let mobileRepeatDelay = null;
let mobileRepeatInterval = null;

function stopMobileRepeat() {
  if (mobileRepeatDelay) clearTimeout(mobileRepeatDelay);
  if (mobileRepeatInterval) clearInterval(mobileRepeatInterval);
  mobileRepeatDelay = null;
  mobileRepeatInterval = null;
}

document.querySelectorAll("[data-action]").forEach(button => {
  const action = button.dataset.action;
  const repeatable = ["left", "right", "down"].includes(action);

  button.addEventListener("pointerdown", event => {
    event.preventDefault();
    stopMobileRepeat();
    handleAction(action);

    if (repeatable) {
      mobileRepeatDelay = setTimeout(() => {
        mobileRepeatInterval = setInterval(() => handleAction(action), action === "down" ? 70 : 95);
      }, 230);
    }
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
    button.addEventListener(type, stopMobileRepeat);
  });
});

// Gestos diretamente no tabuleiro para jogar com uma mão:
// toque = girar, arrastar para os lados = mover, para baixo = descer, para cima = queda rápida.
let boardGesture = null;
canvas.addEventListener("pointerdown", event => {
  if (!window.matchMedia("(max-width: 720px)").matches || !canPlay()) return;
  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
  boardGesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
});

canvas.addEventListener("pointerup", event => {
  if (!boardGesture || boardGesture.id !== event.pointerId || !canPlay()) return;
  event.preventDefault();

  const dx = event.clientX - boardGesture.x;
  const dy = event.clientY - boardGesture.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  boardGesture = null;

  if (absX < 18 && absY < 18) {
    rotatePiece();
  } else if (absX > absY) {
    const steps = Math.max(1, Math.min(4, Math.round(absX / 38)));
    const dir = dx > 0 ? 1 : -1;
    for (let i = 0; i < steps; i++) movePiece(dir);
  } else if (dy > 24) {
    const steps = Math.max(1, Math.min(4, Math.round(absY / 42)));
    const gesturePiece = active;
    for (let i = 0; i < steps && canPlay() && active === gesturePiece; i++) softDrop(true);
  } else if (dy < -34) {
    hardDrop();
  }

  draw();
});

canvas.addEventListener("pointercancel", () => { boardGesture = null; });

window.addEventListener("blur", () => {
  if (running && !paused && !gameOver && !menuModal.classList.contains("visible")) openMenu();
});

applyTheme(currentTheme, false);
updateSoundButton();
updateThemeButton();
updateStats();
drawNext();
drawHold();
draw();
