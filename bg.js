// bg.js — snowflakes + toggle button 
(() => {
  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });

  const prefersReduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- toggle state ---
  let enabled = !prefersReduced && (localStorage.getItem("snowEnabled") ?? "1") !== "0";
  let rafId = 0;

const root = document.documentElement;

function applyFxState(){
  root.classList.toggle("fx-off", !enabled);
}


  // Find or create button
  let btn = document.getElementById("btnSnow");
  if (!btn) {
    const controls = document.querySelector(".controls");
    if (controls) {
      btn = document.createElement("button");
      btn.id = "btnSnow";
      btn.className = "btn";
      controls.appendChild(btn);
    }
  }

  function setBtnState() {
    if (!btn) return;
    btn.textContent = enabled ? "XMAS: Вкл" : "XMAS: Выкл";
    btn.classList.toggle("snow-off", !enabled);
    btn.disabled = prefersReduced;
    if (prefersReduced) btn.textContent = "XMAS: выкл (reduce motion)";
    applyFxState();
  }

  function stopAndClear() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = "none";
  }

  function start() {
    canvas.style.display = "";
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  if (btn) {
    btn.addEventListener("click", () => {
      enabled = !enabled;
      localStorage.setItem("snowEnabled", enabled ? "1" : "0");
      setBtnState();
      if (enabled) start();
      else stopAndClear();
    });
  }

  setBtnState();

  // --- canvas sizing ---
  let w = 0, h = 0, dpr = 1;

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = Math.floor(window.innerWidth);
    h = Math.floor(window.innerHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // subtle cursor parallax
  let mx = 0, my = 0;
  window.addEventListener(
    "mousemove",
    (e) => {
      mx = (e.clientX / Math.max(1, w)) - 0.5;
      my = (e.clientY / Math.max(1, h)) - 0.5;
    },
    { passive: true }
  );

  // -------- 3D-ish helpers (safe version; no spike distortion) --------
  function rotMatrix(yaw, pitch, roll) {
    const cy = Math.cos(yaw),  sy = Math.sin(yaw);
    const cx = Math.cos(pitch),sx = Math.sin(pitch);
    const cz = Math.cos(roll), sz = Math.sin(roll);

    // R = Rz * Rx * Ry
    const m00 = cz * cy + sz * sx * sy;
    const m01 = sz * cx;
    const m02 = cz * -sy + sz * sx * cy;

    const m10 = -sz * cy + cz * sx * sy;
    const m11 = cz * cx;
    const m12 = -sz * -sy + cz * sx * cy;

    const m20 = cx * sy;
    const m21 = -sx;
    const m22 = cx * cy;

    return [m00,m01,m02, m10,m11,m12, m20,m21,m22];
  }

  function mulMatVec(m, v) {
    const x = v[0], y = v[1], z = v[2];
    return [
      m[0]*x + m[1]*y + m[2]*z,
      m[3]*x + m[4]*y + m[5]*z,
      m[6]*x + m[7]*y + m[8]*z
    ];
  }

  function buildSnowflakeSegments(R) {
    const segs = [];
    const arms = 6;

    const b1 = R * 0.55;
    const b2 = R * 0.78;
    const br1 = R * 0.23;
    const br2 = R * 0.18;

    for (let i = 0; i < arms; i++) {
      const a = (Math.PI * 2 / arms) * i;
      const ca = Math.cos(a), sa = Math.sin(a);

      segs.push([[0,0,0], [ca*R, sa*R, 0]]);

      const a1 = a + Math.PI/6;
      const a2 = a - Math.PI/6;

      segs.push([[ca*b1, sa*b1, 0], [ca*b1 + Math.cos(a1)*br1, sa*b1 + Math.sin(a1)*br1, 0]]);
      segs.push([[ca*b1, sa*b1, 0], [ca*b1 + Math.cos(a2)*br1, sa*b1 + Math.sin(a2)*br1, 0]]);

      segs.push([[ca*b2, sa*b2, 0], [ca*b2 + Math.cos(a1)*br2, sa*b2 + Math.sin(a1)*br2, 0]]);
      segs.push([[ca*b2, sa*b2, 0], [ca*b2 + Math.cos(a2)*br2, sa*b2 + Math.sin(a2)*br2, 0]]);
    }
    return segs;
  }

  // -------- particles --------
  const flakes = [];
  const COUNT = 75;
  const FOV = 560;
  const MIN_D = 220;
  const MAX_D = 1400;
  const MAX_TILT = 0.85; // keep from going fully edge-on

  function resetFlake(f, spawnTop = false) {
    f.x = rand(-80, w + 80);
    f.y = spawnTop ? rand(-h, -50) : rand(-50, h + 50);
    f.d = rand(MIN_D, MAX_D);

    f.baseR = rand(9, 16);

    f.yaw = rand(-MAX_TILT, MAX_TILT);
    f.pitch = rand(-MAX_TILT, MAX_TILT);
    f.roll = rand(0, Math.PI * 2);

    f.wy = rand(-0.6, 0.6);
    f.wp = rand(-0.7, 0.7);
    f.wr = rand(-1.4, 1.4);

    const depth01 = 1 - (f.d - MIN_D) / (MAX_D - MIN_D);
    f.vy = rand(45, 120) * (0.35 + depth01 * 0.95);
    f.vx = rand(-26, 26) * (0.25 + depth01 * 0.9);

    f.phase = rand(0, Math.PI * 2);
    f.sway = rand(14, 44) * (0.25 + depth01 * 0.8);

    f.alpha = rand(0.25, 0.75) * (0.35 + depth01 * 0.9);
    f.blur = rand(0, 2.2) + (1 - depth01) * 1.8;
  }

  function seed() {
    flakes.length = 0;
    for (let i = 0; i < COUNT; i++) {
      const f = {};
      resetFlake(f, false);
      flakes.push(f);
    }
  }

  function drawFlake(f, time) {
    const depth01 = 1 - (f.d - MIN_D) / (MAX_D - MIN_D);
    const persp = FOV / (FOV + f.d);

    const R = f.baseR * (0.7 + depth01 * 1.25) * (0.9 + persp);

    const flip = Math.abs(Math.cos(f.pitch) * Math.cos(f.yaw));
    const a = f.alpha * (0.75 + 0.25 * Math.sin(time * 2.0 + f.phase)) * (0.35 + 0.65 * flip);
    const squash = 0.55 + 0.45 * flip;

    const m = rotMatrix(f.yaw, f.pitch, f.roll);
    const segs = buildSnowflakeSegments(R);

    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(255,255,255,0.55)";
    ctx.shadowBlur = f.blur;

    ctx.lineWidth = clamp(0.9 + R * 0.06, 0.9, 2.1);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";

    ctx.beginPath();
    for (const [p1, p2] of segs) {
      const r1 = mulMatVec(m, p1);
      const r2 = mulMatVec(m, p2);

      const x1 = f.x + r1[0] * persp;
      const y1 = f.y + r1[1] * persp * squash;
      const x2 = f.x + r2[0] * persp;
      const y2 = f.y + r2[1] * persp * squash;

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();
    ctx.restore();
  }

  let lastT = 0;

  function frame(t) {
    if (!enabled) { stopAndClear(); return; }

    const time = t * 0.001;
    const dt = lastT ? Math.min(0.033, (t - lastT) / 1000) : 0.016;
    lastT = t;

    ctx.clearRect(0, 0, w, h);

    // vignette
    const g = ctx.createRadialGradient(w*0.5, h*0.45, 0, w*0.5, h*0.45, Math.max(w,h)*0.82);
    g.addColorStop(0, "rgba(255,255,255,0.04)");
    g.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const wind = Math.sin(time * 0.25) * 14 + Math.sin(time * 0.07) * 10;
    const windMouse = mx * 28;

    for (const f of flakes) {
      const depth01 = 1 - (f.d - MIN_D) / (MAX_D - MIN_D);
      const speedScale = 0.55 + depth01 * 0.95;

      const sway = Math.sin(time * (0.9 + depth01 * 0.6) + f.phase) * f.sway;

      f.x += (f.vx + (wind + windMouse) * 0.10) * dt * speedScale + sway * dt * 0.8;
      f.y += f.vy * dt * speedScale;

      f.d += Math.sin(time * 0.6 + f.phase) * dt * (10 * (0.35 + depth01));
      f.d = clamp(f.d, MIN_D, MAX_D);

      f.yaw += f.wy * dt;
      f.pitch += f.wp * dt;
      f.roll += f.wr * dt;

      if (f.yaw > MAX_TILT) { f.yaw = MAX_TILT; f.wy *= -0.85; }
      if (f.yaw < -MAX_TILT){ f.yaw = -MAX_TILT; f.wy *= -0.85; }
      if (f.pitch > MAX_TILT){ f.pitch = MAX_TILT; f.wp *= -0.85; }
      if (f.pitch < -MAX_TILT){ f.pitch = -MAX_TILT; f.wp *= -0.85; }

      if (f.y > h + 80) resetFlake(f, true);
      if (f.x < -140) f.x = w + 140;
      if (f.x > w + 140) f.x = -140;

      drawFlake(f, time);
    }

    rafId = requestAnimationFrame(frame);
  }

  resize();
  seed();
  window.addEventListener("resize", () => { resize(); seed(); }, { passive: true });

  if (enabled) start();
  else stopAndClear();
})();
