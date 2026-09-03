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
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");

const COLORS = {
  I: "#24d8ff",
  J: "#5b7cff",
  L: "#ff9d42",
  O: "#ffd84c",
  S: "#52e08a",
  T: "#b96cff",
  Z: "#ff5f79"
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0]
  ],
  O: [
    [1, 1],
    [1, 1]
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0]
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0]
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0]
  ]
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
let highScore = Number(localStorage.getItem("neonBlocksHighScore") || 0);
let running = false;
let paused = false;
let gameOver = false;
let lastTime = 0;
let dropCounter = 0;
let animationId = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map(row => [...row]);
}

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
  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: -getTopPadding(matrix)
  };
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

  if (collides(active)) {
    endGame();
  }
}

function collides(piece, matrix = piece.matrix, testX = piece.x, testY = piece.y) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const boardX = testX + x;
      const boardY = testY + y;

      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return true;
      if (boardY >= 0 && board[boardY][boardX]) return true;
    }
  }
  return false;
}

function mergePiece() {
  active.matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const boardY = active.y + y;
      const boardX = active.x + x;
      if (boardY >= 0) board[boardY][boardX] = active.type;
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
      return;
    }
  }
}

function movePiece(dx) {
  if (!canPlay()) return;
  if (!collides(active, active.matrix, active.x + dx, active.y)) {
    active.x += dx;
  }
}

function softDrop(manual = true) {
  if (!canPlay()) return;
  if (!collides(active, active.matrix, active.x, active.y + 1)) {
    active.y++;
    if (manual) score += 1;
  } else {
    lockPiece();
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
  lockPiece();
  updateStats();
}

function lockPiece() {
  mergePiece();
  clearLines();
  spawnPiece();
  dropCounter = 0;
}

function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      y++;
    }
  }

  if (!cleared) return;

  const linePoints = [0, 100, 300, 500, 800];
  score += linePoints[cleared] * level;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
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
}

function getDropInterval() {
  return Math.max(90, 760 - (level - 1) * 62);
}

function getGhostY() {
  let ghostY = active.y;
  while (!collides(active, active.matrix, active.x, ghostY + 1)) {
    ghostY++;
  }
  return ghostY;
}

function drawCell(context, x, y, size, color, alpha = 1, inset = 1) {
  context.save();
  context.globalAlpha = alpha;

  context.fillStyle = color;
  context.fillRect(x * size + inset, y * size + inset, size - inset * 2, size - inset * 2);

  const grad = context.createLinearGradient(x * size, y * size, x * size + size, y * size + size);
  grad.addColorStop(0, "rgba(255,255,255,0.30)");
  grad.addColorStop(0.42, "rgba(255,255,255,0.03)");
  grad.addColorStop(1, "rgba(0,0,0,0.24)");
  context.fillStyle = grad;
  context.fillRect(x * size + inset, y * size + inset, size - inset * 2, size - inset * 2);

  context.strokeStyle = "rgba(255,255,255,0.18)";
  context.lineWidth = 1;
  context.strokeRect(x * size + inset + 0.5, y * size + inset + 0.5, size - inset * 2 - 1, size - inset * 2 - 1);

  context.restore();
}

function drawBoardBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#080d18";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * BLOCK + 0.5, 0);
    ctx.lineTo(x * BLOCK + 0.5, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * BLOCK + 0.5);
    ctx.lineTo(COLS * BLOCK, y * BLOCK + 0.5);
    ctx.stroke();
  }
}

function drawMatrix(matrix, offsetX, offsetY, type, alpha = 1) {
  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && offsetY + y >= 0) {
        drawCell(ctx, offsetX + x, offsetY + y, BLOCK, COLORS[type], alpha);
      }
    });
  });
}

function draw() {
  drawBoardBackground();

  board.forEach((row, y) => {
    row.forEach((type, x) => {
      if (type) drawCell(ctx, x, y, BLOCK, COLORS[type]);
    });
  });

  if (active && !gameOver) {
    const ghostY = getGhostY();
    if (ghostY !== active.y) {
      drawMatrix(active.matrix, active.x, ghostY, active.type, 0.16);
    }
    drawMatrix(active.matrix, active.x, active.y, active.type, 1);
  }
}

function drawPreview(context, type, canvasEl) {
  context.clearRect(0, 0, canvasEl.width, canvasEl.height);
  context.fillStyle = "rgba(5, 9, 18, 0.35)";
  context.fillRect(0, 0, canvasEl.width, canvasEl.height);

  if (!type) return;

  const matrix = SHAPES[type];
  const size = 24;
  const occupiedRows = matrix.filter(row => row.some(Boolean));
  const minY = matrix.findIndex(row => row.some(Boolean));
  const coords = [];

  matrix.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) coords.push({ x, y: y - minY });
    });
  });

  const minX = Math.min(...coords.map(c => c.x));
  const maxX = Math.max(...coords.map(c => c.x));
  const width = (maxX - minX + 1) * size;
  const height = occupiedRows.length * size;
  const startX = (canvasEl.width - width) / 2 - minX * size;
  const startY = (canvasEl.height - height) / 2;

  coords.forEach(({ x, y }) => {
    context.save();
    context.translate(startX, startY);
    drawCell(context, x, y, size, COLORS[type], 1, 1.5);
    context.restore();
  });
}

function drawNext() {
  drawPreview(nextCtx, nextType, nextCanvas);
}

function drawHold() {
  drawPreview(holdCtx, holdType, holdCanvas);
}

function updateStats() {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem("neonBlocksHighScore", String(highScore));
  }

  scoreEl.textContent = score.toLocaleString("pt-BR");
  highScoreEl.textContent = highScore.toLocaleString("pt-BR");
  levelEl.textContent = level;
  linesEl.textContent = lines;
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
  lastTime = performance.now();
  pauseBtn.textContent = "Pausar";
  drawHold();
  updateStats();
  spawnPiece();
}

function startGame() {
  resetGame();
  running = true;
  hideOverlay();
  if (animationId) cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

function restartGame() {
  startGame();
}

function togglePause() {
  if (!running || gameOver) return;
  paused = !paused;
  pauseBtn.textContent = paused ? "Continuar" : "Pausar";

  if (paused) {
    showOverlay("PAUSADO", "Partida pausada", "Pressione P ou clique em continuar para voltar ao jogo.", "Continuar");
  } else {
    hideOverlay();
    lastTime = performance.now();
  }
}

function endGame() {
  gameOver = true;
  running = false;
  updateStats();
  showOverlay("FIM DE JOGO", "Boa tentativa!", `Você fez ${score.toLocaleString("pt-BR")} pontos e chegou ao nível ${level}.`, "Jogar novamente");
}

function canPlay() {
  return running && !paused && !gameOver && active;
}

function showOverlay(kicker, title, text, buttonText) {
  overlayKicker.textContent = kicker;
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startBtn.textContent = buttonText;
  overlay.classList.add("visible");
}

function hideOverlay() {
  overlay.classList.remove("visible");
}

function gameLoop(time = 0) {
  if (!running && gameOver) {
    draw();
    return;
  }

  const delta = time - lastTime;
  lastTime = time;

  if (!paused && running) {
    dropCounter += delta;
    if (dropCounter > getDropInterval()) {
      softDrop(false);
      dropCounter = 0;
    }
  }

  draw();
  animationId = requestAnimationFrame(gameLoop);
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

  if (key === "p") {
    togglePause();
    return;
  }

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
  if (paused && running) {
    togglePause();
  } else {
    startGame();
  }
});

pauseBtn.addEventListener("click", togglePause);
restartBtn.addEventListener("click", restartGame);

document.querySelectorAll("[data-action]").forEach(button => {
  const action = button.dataset.action;
  button.addEventListener("click", () => handleAction(action));
  button.addEventListener("touchstart", event => {
    event.preventDefault();
    handleAction(action);
  }, { passive: false });
});

window.addEventListener("blur", () => {
  if (running && !paused && !gameOver) togglePause();
});

updateStats();
drawNext();
drawHold();
draw();
