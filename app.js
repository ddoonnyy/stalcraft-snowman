// app.js
// Точный перебор 30C4 = 27405 в браузере — очень быстро.
// Правила:
// - открытая клетка с ЖЁЛТЫМ пунктиром => хотя бы один её 4-сосед жёлтый
// - открытая клетка с НЕ-жёлтым пунктиром => среди 4-соседей жёлтых НЕТ
// Фон "жёлтый" означает: эта клетка уже открыта и она жёлтая.
// Фон "серый" означает: открыта и НЕ жёлтая.
// Закрытая: синий.

const ROWS = 5, COLS = 6, N = ROWS * COLS;

const boardEl = document.getElementById("board");
const outEl = document.getElementById("output");

const totalYellowsEl = document.getElementById("totalYellows");
const wProbEl = document.getElementById("wProb");
const wInfoEl = document.getElementById("wInfo");

const btnSuggest = document.getElementById("btnSuggest");
const btnReset = document.getElementById("btnReset");

const BG = {
  CLOSED: "blue",
  OPEN: "gray",
  YELLOW: "yellow",
};

const HINT = {
  NONE: "blue",   // for closed
  NOY:  "gray",   // opened: NOT yellow hint (no yellow neighbors)
  YES:  "yellow", // opened: yellow hint (has yellow neighbor)
};

function rcToI(r,c){ return r*COLS + c; }
function iToRC(i){ return [Math.floor(i/COLS), i%COLS]; }
function inBounds(r,c){ return r>=0 && r<ROWS && c>=0 && c<COLS; }

const NEIGH_MASK = new Array(N).fill(0);
for(let i=0;i<N;i++){
  const [r,c]=iToRC(i);
  let m=0;
  for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
    const rr=r+dr, cc=c+dc;
    if(inBounds(rr,cc)) m |= (1 << rcToI(rr,cc));
  }
  NEIGH_MASK[i]=m >>> 0;
}

function popcount(x){
  x = x >>> 0;
  let c=0;
  while(x){ x &= (x-1) >>> 0; c++; }
  return c;
}

function log2(x){ return Math.log(x) / Math.log(2); }

// ---------- UI state ----------
/**
 * cell state:
 *  bg: "blue" | "gray" | "yellow"
 *  hint: "blue" | "gray" | "yellow"
 */
const state = Array.from({length:ROWS}, () =>
  Array.from({length:COLS}, () => ({ bg: BG.CLOSED, hint: HINT.NONE }))
);

function clearReco(){
  document.querySelectorAll(".cell.reco").forEach(el => el.classList.remove("reco"));
}

function render(){
  boardEl.innerHTML = "";
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);

      const tile = document.createElement("div");
      tile.className = "tile";
      cell.appendChild(tile);

      const s = state[r][c];
      if(s.bg !== BG.CLOSED){
        cell.classList.add("open");
        if(s.bg === BG.YELLOW) cell.classList.add("yellow");
        if(s.hint === HINT.YES) cell.classList.add("hint-yellow");
      }

      // LMB cycle: closed -> open(non-yellow) -> open(yellow) -> closed
      cell.addEventListener("click", (e) => {
        e.preventDefault();
        clearReco();
        if(s.bg === BG.CLOSED){
          s.bg = BG.OPEN;
          s.hint = HINT.NOY; // default: not-yellow hint
        } else if(s.bg === BG.OPEN){
          s.bg = BG.YELLOW;
          // hint stays (user can toggle)
        } else {
          s.bg = BG.CLOSED;
          s.hint = HINT.NONE;
        }
        render();
        outEl.textContent = "Изменено. Нажми “Подсказать ход”.";
      });

      // RMB toggle hint for opened cells: NOY <-> YES
      cell.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        clearReco();
        if(s.bg === BG.CLOSED) return;
        s.hint = (s.hint === HINT.YES) ? HINT.NOY : HINT.YES;
        render();
        outEl.textContent = "Изменено. Нажми “Подсказать ход”.";
      });

      boardEl.appendChild(cell);
    }
  }
}

btnReset.addEventListener("click", () => {
  clearReco();
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      state[r][c].bg = BG.CLOSED;
      state[r][c].hint = HINT.NONE;
    }
  }
  render();
  outEl.textContent = "Сброшено. Нажми “Подсказать ход”.";
});

// ---------- Solver (exact enumeration) ----------
function readBoard(){
  const bg = Array.from({length:ROWS}, () => Array(COLS).fill("blue"));
  const hint = Array.from({length:ROWS}, () => Array(COLS).fill("blue"));
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      bg[r][c] = state[r][c].bg;
      hint[r][c] = (state[r][c].bg === BG.CLOSED) ? "blue" : state[r][c].hint;
    }
  }
  return { bg, hint };
}

function buildConstraints(bg, hint){
  let openedY = 0 >>> 0;
  let openedNotY = 0 >>> 0;
  let closedMask = 0 >>> 0;
  const constraints = []; // [cellIndex, needYellowNeighborBool]

  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const i = rcToI(r,c);
      const b = bg[r][c];
      const h = hint[r][c];
      if(b !== BG.CLOSED){
        if(b === BG.YELLOW) openedY |= (1 << i);
        else openedNotY |= (1 << i);
        constraints.push([i, h === HINT.YES]);
      } else {
        closedMask |= (1 << i);
      }
    }
  }

  const remaining = (parseInt(totalYellowsEl.value, 10) || 4) - popcount(openedY);
  const closedIdx = [];
  for(let i=0;i<N;i++){
    if((closedMask >>> i) & 1) closedIdx.push(i);
  }
  return { openedY, openedNotY, closedMask, constraints, remaining, closedIdx };
}

function compatible(modelMask, openedY, openedNotY, constraints){
  // opened non-yellow can't be yellow
  if((modelMask & openedNotY) !== 0) return false;
  // opened yellow must be yellow
  if((modelMask & openedY) !== openedY) return false;
  // constraints
  for(const [cellI, need] of constraints){
    const has = ((modelMask & NEIGH_MASK[cellI]) !== 0);
    if(has !== need) return false;
  }
  return true;
}

function enumerateModels(openedY, openedNotY, constraints, remaining, closedIdx){
  if(remaining < 0) return [];
  const base = openedY >>> 0;
  if(remaining === 0){
    return compatible(base, openedY, openedNotY, constraints) ? [base] : [];
  }
  // remaining <= 4 in твоей игре, combos <= 27405
  const models = [];
  const k = remaining;

  function rec(start, picked, mask){
    if(picked === k){
      const m = (mask | base) >>> 0;
      if(compatible(m, openedY, openedNotY, constraints)) models.push(m);
      return;
    }
    for(let j=start; j<=closedIdx.length-(k-picked); j++){
      rec(j+1, picked+1, (mask | (1 << closedIdx[j])) >>> 0);
    }
  }
  rec(0, 0, 0 >>> 0);
  return models;
}

function suggest(){
  clearReco();
  const { bg, hint } = readBoard();

  const wProb = parseFloat(wProbEl.value) || 1.0;
  const wInfo = parseFloat(wInfoEl.value) || 0.35;

  const { openedY, openedNotY, constraints, remaining, closedIdx } = buildConstraints(bg, hint);
  const models = enumerateModels(openedY, openedNotY, constraints, remaining, closedIdx);
  const M = models.length;

  if(M === 0){
    outEl.textContent =
      "❌ Нет совместимых раскладок (данные противоречивы).\n" +
      "Проверь: жёлтые/серые клетки и жёлтые пунктиры.\n" +
      "Если уверен — попробуй сбросить и ввести снова.";
    return;
  }

  // hit counts
  const hit = new Map();
  for(const i of closedIdx) hit.set(i, 0);

  for(const m of models){
    for(const i of closedIdx){
      if(((m >>> i) & 1) === 1) hit.set(i, hit.get(i) + 1);
    }
  }

  const baseEntropy = (M > 0) ? log2(M) : 0.0;

  const scored = [];
  for(const i of closedIdx){
    const pY = hit.get(i) / M;

    // buckets by (bgIsYellow, hintHasYellowNeighbor)
    const buckets = new Map(); // key string -> count
    const neigh = NEIGH_MASK[i];
    for(const m of models){
      const bgIsY = ((m >>> i) & 1) ? 1 : 0;
      const hintHasY = ((m & neigh) !== 0) ? 1 : 0;
      const key = `${bgIsY},${hintHasY}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    let expRemaining = 0.0;
    let expEntropyAfter = 0.0;
    for(const cnt of buckets.values()){
      const prob = cnt / M;
      expRemaining += prob * cnt;
      expEntropyAfter += prob * log2(cnt);
    }
    const infoGain = Math.max(0.0, baseEntropy - expEntropyAfter);
    const score = (wProb * pY) + (wInfo * infoGain);

    const [r,c] = iToRC(i);
    scored.push({ i, r, c, pY, infoGain, expRemaining, score });
  }

  scored.sort((a,b) => {
    // primary: higher P(yellow)
    if(b.pY !== a.pY) return b.pY - a.pY;
    // then combined score
    return b.score - a.score;
  });

  const top = scored.slice(0, 5);
  const best = top[0];

  // highlight best
  const bestCell = boardEl.querySelector(`.cell[data-r="${best.r}"][data-c="${best.c}"]`);
  if(bestCell) bestCell.classList.add("reco");

  // output
  const lines = [];
  lines.push(`Совместимых раскладок: ${M}`);
  lines.push(`Лучший клик: (ряд ${best.r+1}, столбец ${best.c+1})`);
  lines.push(`P(жёлтая)=${(best.pY*100).toFixed(2)}%  IG=${best.infoGain.toFixed(2)} бит  expModels≈${best.expRemaining.toFixed(0)}`);
  lines.push(`ТОП:`);
  top.forEach((s, idx) => {
    lines.push(
      `  #${idx+1}: (${s.r+1},${s.c+1})  P=${(s.pY*100).toFixed(2)}%  IG=${s.infoGain.toFixed(2)}  exp≈${s.expRemaining.toFixed(0)}  score=${s.score.toFixed(3)}`
    );
  });

  outEl.textContent = lines.join("\n");
}

btnSuggest.addEventListener("click", suggest);

// init
render();
outEl.textContent = "Готово. Введи известные клетки и нажми “Подсказать ход”.";
