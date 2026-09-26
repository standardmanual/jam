// 자동 생성 파일 — 손으로 고치지 않는다.
// 원본: jam-web/src/lib/asset-generator/*.ts
// 재생성: node jam-web/scripts/asset-generator/build-prototype.mjs
"use strict";
var AssetGeneratorCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // jam-web/src/lib/asset-generator/index.ts
  var index_exports = {};
  __export(index_exports, {
    CENTER_MARGIN: () => CENTER_MARGIN,
    CENTER_MIN: () => CENTER_MIN,
    HARMONICS: () => HARMONICS,
    IRR_HI: () => IRR_HI,
    IRR_LO: () => IRR_LO,
    LOOP_CHANCE: () => LOOP_CHANCE,
    LOOP_WIDTH_MAX: () => LOOP_WIDTH_MAX,
    LOOP_WIDTH_MIN: () => LOOP_WIDTH_MIN,
    OUT_FRACTION: () => OUT_FRACTION,
    PRESET_TARGET_TYPES: () => PRESET_TARGET_TYPES,
    PRESET_TARGET_TYPE_LABELS: () => PRESET_TARGET_TYPE_LABELS,
    RADIUS_MIN: () => RADIUS_MIN,
    buildPath: () => buildPath,
    buildStamp: () => buildStamp,
    candidateStats: () => candidateStats,
    choice: () => choice,
    deriveRibbonFromSeed: () => deriveRibbonFromSeed,
    deserializePresetLayers: () => deserializePresetLayers,
    drawImageLayer: () => drawImageLayer,
    drawRibbonLayer: () => drawRibbonLayer,
    drawTextLayer: () => drawTextLayer,
    fillBackground: () => fillBackground,
    formatLayerKey: () => formatLayerKey,
    getLayerKeys: () => getLayerKeys,
    irrValue: () => irrValue,
    isPresetTargetType: () => isPresetTargetType,
    makeCandidate: () => makeCandidate,
    mulberry32: () => mulberry32,
    parseLayerKey: () => parseLayerKey,
    pickCandidate: () => pickCandidate,
    posAt: () => posAt,
    randInt: () => randInt,
    randRange: () => randRange,
    randomPalette: () => randomPalette,
    randomizeRibbonConfig: () => randomizeRibbonConfig,
    sampleFitted: () => sampleFitted,
    serializePresetLayers: () => serializePresetLayers,
    toAssetPreset: () => toAssetPreset,
    toAssetPresetSummary: () => toAssetPresetSummary,
    unitCurve: () => unitCurve
  });

  // jam-web/src/lib/asset-generator/layerKeys.ts
  var KEY_PREFIX = { text: "text", image: "img" };
  function formatLayerKey(type, n) {
    return `${KEY_PREFIX[type]}${String(n).padStart(2, "0")}`;
  }
  function parseLayerKey(str) {
    const match = /^(text|img)(\d{2,})$/.exec(str);
    if (!match) return null;
    const n = Number(match[2]);
    if (n < 1) return null;
    return { type: match[1] === "text" ? "text" : "image", n };
  }
  function getLayerKeys(layers) {
    const counts = { text: 0, image: 0 };
    return layers.map((layer) => {
      counts[layer.type] += 1;
      return { id: layer.id, type: layer.type, key: formatLayerKey(layer.type, counts[layer.type]) };
    });
  }

  // jam-web/src/lib/asset-generator/random.ts
  function mulberry32(seed) {
    let a = seed;
    return function random() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function randRange(a, b, rnd = Math.random) {
    return a + rnd() * (b - a);
  }
  function randInt(a, b, step = 1, rnd = Math.random) {
    return a + Math.floor(rnd() * (Math.floor((b - a) / step) + 1)) * step;
  }
  function choice(list, rnd = Math.random) {
    return list[Math.floor(rnd() * list.length)];
  }
  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    function f(n) {
      const k = (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      const x = Math.round(v * 255);
      return (x < 16 ? "0" : "") + x.toString(16);
    }
    return "#" + f(0) + f(8) + f(4);
  }
  function hexToRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function randomPalette(rnd = Math.random) {
    let best = null;
    let bestDist = -1;
    for (let i = 0; i < 12; i++) {
      const h = randRange(0, 360, rnd);
      const bg = hslToHex(h, randRange(70, 100, rnd), randRange(42, 58, rnd));
      const end = rnd() < 0.7 ? hslToHex((h + randRange(90, 270, rnd)) % 360, randRange(65, 100, rnd), randRange(55, 80, rnd)) : hslToHex((h + randRange(-40, 40, rnd) + 360) % 360, randRange(70, 100, rnd), randRange(18, 32, rnd));
      const a = hexToRgb(bg);
      const b = hexToRgb(end);
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (dist > bestDist) {
        bestDist = dist;
        best = [bg, end];
      }
      if (dist > 190) break;
    }
    return best;
  }
  var GRADIENT_DIRECTIONS = ["h", "v", "r"];
  function randomizeRibbonConfig(rnd = Math.random) {
    const [bg, end] = randomPalette(rnd);
    return {
      backgroundColor: bg,
      endColor: end,
      linkStartToBackground: true,
      // 랜덤에서는 배경색과 시작 색을 항상 같게 둔다
      sizePct: randInt(12, 40, 1, rnd),
      blurPct: rnd() < 0.6 ? 0 : randInt(5, 35, 1, rnd),
      rotationDeg: randInt(-180, 180, 1, rnd),
      followPath: rnd() < 0.5,
      direction: choice(GRADIENT_DIRECTIONS, rnd),
      irregularityPct: randInt(0, 100, 1, rnd),
      seed: Math.floor(rnd() * 1e9),
      speed: randInt(1e3, 2e3, 10, rnd),
      gap: randInt(4, 30, 1, rnd),
      count: randInt(200, 800, 5, rnd)
    };
  }
  function deriveRibbonFromSeed(seed) {
    return randomizeRibbonConfig(mulberry32(seed));
  }

  // jam-web/src/lib/asset-generator/curve.ts
  var OUT_FRACTION = 0.3;
  var HARMONICS = 6;
  var RADIUS_MIN = 0.15;
  var CENTER_MIN = 0.1;
  var CENTER_MARGIN = 1.3;
  var IRR_LO = 0.6;
  var IRR_HI = 1.5;
  var LOOP_CHANCE = 0.5;
  var LOOP_WIDTH_MIN = 0.32;
  var LOOP_WIDTH_MAX = 0.45;
  var CANDIDATE_TRIES = 40;
  var CANDIDATE_EVAL_POINTS = 240;
  var PATH_SAMPLE_POINTS = 6e3;
  var CANDIDATE_HARMONIC_BASE = [0, 1.1, 1.3, 0.6, 0.35, 0.2, 0.1];
  function irrValue(sliderPct) {
    return IRR_LO + (IRR_HI - IRR_LO) * sliderPct / 100;
  }
  function harmWeight(k, irr) {
    if (k === 1) return 1;
    if (k === 2) return 0.4 + 0.6 * irr;
    return Math.pow(irr, k - 2);
  }
  function makeCandidate(rnd, withLoop = false) {
    const r = rnd();
    const sign = rnd() < 0.5 ? -1 : 1;
    const amp = [];
    const ph = [];
    for (let k = 1; k <= HARMONICS; k++) {
      amp.push(CANDIDATE_HARMONIC_BASE[k] * (0.3 + 0.7 * rnd()));
      ph.push(rnd() * Math.PI * 2);
    }
    let loop = null;
    if (withLoop) {
      const u0 = rnd();
      const width = LOOP_WIDTH_MIN + (LOOP_WIDTH_MAX - LOOP_WIDTH_MIN) * rnd();
      loop = { u0, width, sign: rnd() < 0.5 ? -1 : 1 };
    }
    return { turns: sign * (!withLoop && r >= 0.75 ? 2 : 1), amp, ph, loop };
  }
  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }
  function loopAngle(loop, u) {
    const d = ((u - loop.u0) % 1 + 1) % 1;
    return loop.sign * 2 * Math.PI * (d < loop.width ? smoothstep(d / loop.width) : 1);
  }
  function unitCurve(c, irr, M) {
    const vx = new Float32Array(M);
    const vy = new Float32Array(M);
    let mx = 0;
    let my = 0;
    for (let i = 0; i < M; i++) {
      const u = (i + 0.5) / M;
      let th = 2 * Math.PI * c.turns * u;
      if (c.loop) th += loopAngle(c.loop, u);
      for (let k = 1; k <= c.amp.length; k++) {
        th += harmWeight(k, irr) * c.amp[k - 1] * Math.sin(2 * Math.PI * k * u + c.ph[k - 1]);
      }
      vx[i] = Math.cos(th);
      vy[i] = Math.sin(th);
      mx += vx[i];
      my += vy[i];
    }
    mx /= M;
    my /= M;
    const ux = new Float32Array(M);
    const uy = new Float32Array(M);
    let x = 0;
    let y = 0;
    for (let j = 0; j < M; j++) {
      ux[j] = x;
      uy[j] = y;
      x += (vx[j] - mx) / M;
      y += (vy[j] - my) / M;
    }
    return { ux, uy };
  }
  function sampleFitted(c, irr, M, stageWidth, stageHeight) {
    const uc = unitCurve(c, irr, M);
    const ux = uc.ux;
    const uy = uc.uy;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < M; i++) {
      if (ux[i] < x0) x0 = ux[i];
      if (ux[i] > x1) x1 = ux[i];
      if (uy[i] < y0) y0 = uy[i];
      if (uy[i] > y1) y1 = uy[i];
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hx = Math.max(1e-6, (x1 - x0) / 2);
    const hy = Math.max(1e-6, (y1 - y0) / 2);
    for (let j = 0; j < M; j++) {
      ux[j] = (ux[j] - cx) / hx;
      uy[j] = (uy[j] - cy) / hy;
    }
    function outsideAt(s2) {
      const lim = 1 / s2;
      let out = 0;
      let all = 0;
      for (let k = 0; k < M; k++) {
        const k2 = (k + 1) % M;
        const seg = Math.hypot((ux[k2] - ux[k]) * stageWidth, (uy[k2] - uy[k]) * stageHeight);
        all += seg;
        if (Math.abs(ux[k]) > lim || Math.abs(uy[k]) > lim) out += seg;
      }
      return all > 0 ? out / all : 0;
    }
    let lo = 1;
    let hi = 2;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2;
      if (outsideAt(mid) < OUT_FRACTION) lo = mid;
      else hi = mid;
    }
    const s = (lo + hi) / 2;
    const xs = new Float32Array(M);
    const ys = new Float32Array(M);
    for (let p = 0; p < M; p++) {
      xs[p] = stageWidth / 2 + s * (stageWidth / 2) * ux[p];
      ys[p] = stageHeight / 2 + s * (stageHeight / 2) * uy[p];
    }
    return { xs, ys };
  }
  function candidateStats(c, irr, stageWidth, stageHeight) {
    const M = CANDIDATE_EVAL_POINTS;
    const p = sampleFitted(c, irr, M, stageWidth, stageHeight);
    const px = p.xs;
    const py = p.ys;
    const S = Math.min(stageWidth, stageHeight);
    const d0 = 0.15 * S;
    const skip = M / 10;
    let overlap = 0;
    for (let a = 0; a < M; a++) {
      for (let b = a + 1; b < M; b++) {
        const gap = Math.min(b - a, M - (b - a));
        if (gap <= skip) continue;
        const dist = Math.hypot(px[a] - px[b], py[a] - py[b]);
        if (dist < d0) overlap += 1 - dist / d0;
      }
    }
    let inside = 0;
    let all = 0;
    let kMax = 0;
    for (let i = 0; i < M; i++) {
      const i0 = (i - 1 + M) % M;
      const i2 = (i + 1) % M;
      const v1x = px[i] - px[i0];
      const v1y = py[i] - py[i0];
      const v2x = px[i2] - px[i];
      const v2y = py[i2] - py[i];
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      all += l2;
      if (Math.abs(px[i] - stageWidth / 2) < 0.2 * stageWidth && Math.abs(py[i] - stageHeight / 2) < 0.2 * stageHeight) {
        inside += l2;
      }
      const turn = Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y));
      const kappa = turn / Math.max(1e-6, (l1 + l2) / 2);
      if (kappa > kMax) kMax = kappa;
    }
    return { overlap, center: all > 0 ? inside / all : 0, radius: kMax > 0 ? 1 / kMax / S : Infinity };
  }
  function pickCandidate(rnd, stageWidth, stageHeight) {
    var _a;
    let best = Infinity;
    let pick = null;
    let softBest = Infinity;
    let softPick = null;
    let fallback = null;
    let fallbackScore = -Infinity;
    const wantLoop = rnd() < LOOP_CHANCE;
    const radiusMin = wantLoop ? RADIUS_MIN * 0.5 : RADIUS_MIN;
    const radiusSoft = RADIUS_MIN * 0.5;
    const centerMin = CENTER_MIN * CENTER_MARGIN;
    for (let n = 0; n < CANDIDATE_TRIES; n++) {
      const cand = makeCandidate(rnd, wantLoop);
      const sa = candidateStats(cand, IRR_LO, stageWidth, stageHeight);
      const sb = candidateStats(cand, IRR_HI, stageWidth, stageHeight);
      const radius = Math.min(sa.radius, sb.radius);
      const center = Math.min(sa.center, sb.center);
      const closeness = Math.min(radius / radiusSoft, center / centerMin);
      if (closeness > fallbackScore) {
        fallbackScore = closeness;
        fallback = cand;
      }
      if (radius < radiusSoft || center < centerMin) continue;
      const score = sa.overlap + sb.overlap;
      if (score < softBest) {
        softBest = score;
        softPick = cand;
      }
      if (radius >= radiusMin && score < best) {
        best = score;
        pick = cand;
      }
    }
    return (_a = pick != null ? pick : softPick) != null ? _a : fallback;
  }
  var cachedPick = null;
  var cachedPickKey = "";
  function buildPath(seed, irregPct, stageWidth, stageHeight) {
    const key = `${seed}|${stageWidth}|${stageHeight}`;
    if (cachedPickKey !== key) {
      cachedPick = pickCandidate(mulberry32(seed), stageWidth, stageHeight);
      cachedPickKey = key;
    }
    const pick = cachedPick;
    const N = PATH_SAMPLE_POINTS;
    const fit = sampleFitted(pick, irrValue(irregPct), N, stageWidth, stageHeight);
    const xs = new Float32Array(N + 1);
    const ys = new Float32Array(N + 1);
    const cum = new Float32Array(N + 1);
    const tx = new Float32Array(N + 1);
    const ty = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      xs[i] = fit.xs[i % N];
      ys[i] = fit.ys[i % N];
      cum[i] = i === 0 ? 0 : cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }
    for (let j = 0; j <= N; j++) {
      const prev = (j - 1 + N) % N;
      const next = (j + 1) % N;
      const dx = xs[next] - xs[prev];
      const dy = ys[next] - ys[prev];
      const len = Math.hypot(dx, dy) || 1;
      tx[j] = dx / len;
      ty[j] = dy / len;
    }
    return { xs, ys, tx, ty, cum, total: cum[N], N };
  }
  function posAt(path, s, out = { x: 0, y: 0, a: 0 }) {
    const L = path.total;
    const sc = (s % L + L) % L;
    let lo = 0;
    let hi = path.N;
    while (hi - lo > 1) {
      const mid = lo + hi >> 1;
      if (path.cum[mid] <= sc) lo = mid;
      else hi = mid;
    }
    const seg = path.cum[hi] - path.cum[lo];
    const f = seg > 0 ? (sc - path.cum[lo]) / seg : 0;
    out.x = path.xs[lo] + (path.xs[hi] - path.xs[lo]) * f;
    out.y = path.ys[lo] + (path.ys[hi] - path.ys[lo]) * f;
    out.a = Math.atan2(path.ty[lo] + (path.ty[hi] - path.ty[lo]) * f, path.tx[lo] + (path.tx[hi] - path.tx[lo]) * f);
    return out;
  }

  // jam-web/src/lib/asset-generator/render.ts
  function supportsCanvasFilter(factory) {
    try {
      const probe = factory(1, 1).getContext("2d");
      probe.filter = "blur(1px)";
      return probe.filter === "blur(1px)";
    } catch {
      return false;
    }
  }
  function blurCanvas(factory, src, px) {
    const out = factory(src.width, src.height);
    const octx = out.getContext("2d");
    if (supportsCanvasFilter(factory)) {
      octx.filter = `blur(${px}px)`;
      octx.drawImage(src, 0, 0);
      octx.filter = "none";
      return out;
    }
    const k = Math.max(2, Math.round(px));
    const sw = Math.max(1, Math.round(src.width / k));
    const sh = Math.max(1, Math.round(src.height / k));
    const small = factory(sw, sh);
    const sctx = small.getContext("2d");
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(src, 0, 0, sw, sh);
    octx.imageSmoothingQuality = "high";
    octx.drawImage(small, 0, 0, src.width, src.height);
    return out;
  }
  function buildStamp(factory, input) {
    const { base, blurPct, direction, startColor, endColor } = input;
    const bw = base.width;
    const bh = base.height;
    const blurPx = blurPct / 100 * 0.25 * Math.max(bw, bh);
    const pad = blurPx > 0.3 ? Math.ceil(blurPx * 3) + 2 : 0;
    let canvas = factory(bw + pad * 2, bh + pad * 2);
    canvas.getContext("2d").drawImage(base, pad, pad);
    if (pad > 0) canvas = blurCanvas(factory, canvas, blurPx);
    const ctx = canvas.getContext("2d");
    ctx.globalCompositeOperation = "source-in";
    let gradient;
    if (direction === "h") gradient = ctx.createLinearGradient(pad, 0, pad + bw, 0);
    else if (direction === "v") gradient = ctx.createLinearGradient(0, pad, 0, pad + bh);
    else gradient = ctx.createRadialGradient(pad + bw / 2, pad + bh / 2, 0, pad + bw / 2, pad + bh / 2, Math.hypot(bw, bh) / 2);
    gradient.addColorStop(0, startColor);
    gradient.addColorStop(1, endColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    return canvas;
  }
  function drawRibbonLayer(ctx, input) {
    const { stamp, baseWidth, baseHeight, sizePct, rotationDeg, followPath, path, head, gap, count, stageWidth, stageHeight } = input;
    if (!stamp) return;
    const sc = sizePct / 100 * Math.min(stageWidth, stageHeight) / Math.max(baseWidth, baseHeight);
    const dw = stamp.width * sc;
    const dh = stamp.height * sc;
    if (ctx.imageSmoothingQuality !== void 0) ctx.imageSmoothingQuality = "high";
    const rad = rotationDeg * Math.PI / 180;
    const n = Math.min(count, Math.max(1, Math.floor(0.9 * path.total / gap)));
    const tmp = { x: 0, y: 0, a: 0 };
    for (let i = n - 1; i >= 0; i--) {
      posAt(path, head - i * gap, tmp);
      const ang = rad + (followPath ? tmp.a : 0);
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      ctx.setTransform(cs, sn, -sn, cs, tmp.x, tmp.y);
      ctx.drawImage(stamp, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function fillBackground(ctx, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  }
  function drawImageLayer(ctx, input, createCanvas) {
    const { image, xPct, yPct, widthPct, rotationDeg, opacityPct, stageWidth, stageHeight, overlayColor } = input;
    if (!(image.width > 0) || !(image.height > 0)) return;
    const shortSide = Math.min(stageWidth, stageHeight);
    const dw = widthPct / 100 * shortSide;
    const dh = dw * image.height / image.width;
    const cx = xPct / 100 * stageWidth;
    const cy = yPct / 100 * stageHeight;
    const rad = rotationDeg * Math.PI / 180;
    const cs = Math.cos(rad);
    const sn = Math.sin(rad);
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = Math.max(0, Math.min(1, opacityPct / 100));
    ctx.setTransform(cs, sn, -sn, cs, cx, cy);
    ctx.drawImage(overlayColor && createCanvas ? tintImage(createCanvas, image, overlayColor) : image, -dw / 2, -dh / 2, dw, dh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = prevAlpha;
  }
  function tintImage(createCanvas, image, color) {
    const tmp = createCanvas(image.width, image.height);
    const tctx = tmp.getContext("2d");
    tctx.drawImage(image, 0, 0);
    tctx.globalCompositeOperation = "source-in";
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, image.width, image.height);
    return tmp;
  }
  function drawTextLayer(ctx, input) {
    const { content, font, sizePct, letterSpacing, lineHeight, align, color, xPct, yPct, rotationDeg, opacityPct, stageWidth, stageHeight } = input;
    const shortSide = Math.min(stageWidth, stageHeight);
    const fontSizePx = sizePct / 100 * shortSide;
    if (fontSizePx <= 0) return;
    const letterSpacingPx = letterSpacing * fontSizePx;
    const lineHeightPx = lineHeight * fontSizePx;
    const cx = xPct / 100 * stageWidth;
    const cy = yPct / 100 * stageHeight;
    const rad = rotationDeg * Math.PI / 180;
    const cs = Math.cos(rad);
    const sn = Math.sin(rad);
    const lines = content.split("\n");
    const lineChars = lines.map((line) => Array.from(line));
    const prevFont = ctx.font;
    const prevAlign = ctx.textAlign;
    const prevBaseline = ctx.textBaseline;
    const prevFillStyle = ctx.fillStyle;
    const prevAlpha = ctx.globalAlpha;
    ctx.font = `${font.weight} ${fontSizePx}px "${font.family}"`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.max(0, Math.min(1, opacityPct / 100));
    const lineWidths = lineChars.map(
      (chars) => chars.reduce((sum, ch, i) => sum + ctx.measureText(ch).width + (i < chars.length - 1 ? letterSpacingPx : 0), 0)
    );
    const blockHeight = lineHeightPx * lines.length;
    ctx.setTransform(cs, sn, -sn, cs, cx, cy);
    lineChars.forEach((chars, lineIndex) => {
      const lineWidth = lineWidths[lineIndex];
      const lineY = (lineIndex + 0.5) * lineHeightPx - blockHeight / 2;
      let startX;
      if (align === "left") startX = 0;
      else if (align === "right") startX = -lineWidth;
      else startX = -lineWidth / 2;
      let cursorX = startX;
      chars.forEach((ch) => {
        ctx.fillText(ch, cursorX, lineY);
        cursorX += ctx.measureText(ch).width + letterSpacingPx;
      });
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = prevFont;
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBaseline;
    ctx.fillStyle = prevFillStyle;
    ctx.globalAlpha = prevAlpha;
  }

  // jam-web/src/lib/asset-generator/presetSerialize.ts
  function toAssetPresetSummary(row) {
    return {
      id: row.id,
      name: row.name,
      stageRatio: row.stage_ratio,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  function toAssetPreset(row) {
    var _a;
    return {
      id: row.id,
      name: row.name,
      targetType: row.target_type,
      stageRatio: row.stage_ratio,
      layers: deserializePresetLayers((_a = row.layers) != null ? _a : []),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  var PRESET_TARGET_TYPES = ["badge", "mission", "collection", "home_feed"];
  var PRESET_TARGET_TYPE_LABELS = {
    badge: "\uBC30\uC9C0",
    mission: "\uBBF8\uC158",
    collection: "\uCEEC\uB809\uC158",
    home_feed: "\uD648\uD53C\uB4DC"
  };
  function isPresetTargetType(value) {
    return typeof value === "string" && PRESET_TARGET_TYPES.includes(value);
  }
  function serializePresetLayers(layers, assetUrlByLayerId = {}) {
    return layers.map((layer) => {
      if (layer.type === "text") return layer;
      const replacement = assetUrlByLayerId[layer.id];
      return replacement ? { ...layer, assetUrl: replacement } : layer;
    });
  }
  function deserializePresetLayers(layers) {
    return layers.map((layer) => {
      var _a;
      if (layer.type === "text") return { ...layer, content: typeof layer.content === "string" ? layer.content : "" };
      const { heightPct: _legacyHeightPct, ...rest } = layer;
      return { ...rest, overlayEnabled: (_a = rest.overlayEnabled) != null ? _a : false };
    });
  }
  return __toCommonJS(index_exports);
})();
