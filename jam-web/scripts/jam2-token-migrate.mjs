#!/usr/bin/env node
/**
 * jam2-token-migrate.mjs — JAM 2.0 토큰 이름 일괄 변경 (티켓 20261015_2131, 상위 20261015_2130).
 *
 * 옛 토큰 이름을 새 이름으로 바꾼다. 대응표는 scripts/jam2-token-map.json에 데이터로 있다.
 *
 * 한 번만 실행된다. 옛 이름과 새 이름이 겹치는 항목이 있다(--radius-sm 8px → --radius-lg,
 * --radius-xs 4px → --radius-sm, 옛 bg-surface → bg-background, 옛 bg-surface-elevated →
 * bg-surface). 두 번 돌리면 의미가 뒤집히므로 실행 뒤 보고서 파일이 생기고, 보고서가 있으면
 * 실행을 거부한다.
 *
 * 대상: jam-web/src(어드민 src/app/admin·src/components/admin 제외)와 jam-web/design-system
 *   (uploads·_vendor·_ds_manifest.json·_adherence.oxlintrc.json 제외).
 *
 * 규칙 요약
 *   - 클래스 문자열(Tailwind 임의값)의 글자·행간·간격·반경은 Tailwind 기본 유틸리티로 바꾼다.
 *   - 클래스가 아닌 곳(인라인 style·CSS·JSX)은 변수 이름만 새 눈금 이름으로 바꾼다.
 *   - `text-[length:var(--text-X)] leading-[var(--leading-X)]`는 같은 단계일 때 `text-N` 하나가 된다.
 *     짝이 안 맞는 행간은 지우지 않고 수동 검토 목록으로 보낸다.
 *   - 자간(--tracking-*)은 새 시스템에서 모두 0이라 선언을 지운다. 굵기(--weight-*)는 수치로 남긴다.
 *   - --color-primary는 쓰임에 따라 면(background·bg-)이면 --accent, 글자·아이콘·선이면 --link다.
 *     판별이 안 되는 곳은 바꾸지 않고 수동 검토 목록으로 보낸다.
 *
 * 사용법
 *   node scripts/jam2-token-migrate.mjs --dry     # 쓰지 않고 보고서만 출력
 *   node scripts/jam2-token-migrate.mjs           # 파일에 쓰고 보고서 파일을 남긴다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const MAP = JSON.parse(fs.readFileSync(path.join(HERE, 'jam2-token-map.json'), 'utf8'));
const REPORT = path.join(HERE, 'jam2-token-migrate.report.json');
const DRY = process.argv.includes('--dry');

if (!DRY && fs.existsSync(REPORT)) {
  console.error('이미 실행됐습니다(jam2-token-migrate.report.json). 두 번째 실행은 의미가 뒤집히므로 막습니다.');
  process.exit(2);
}

// tokens/*.css와 globals.css는 새 이름으로 손으로 다시 썼다. 스크립트가 다시 건드리면
// 새 정의(--radius-sm 등)가 옛 이름으로 오인돼 바뀐다.
const EXCLUDE_PREFIX = [
  'src/app/admin/', 'src/components/admin/', 'design-system/uploads/', 'design-system/_vendor/',
  'design-system/_ds_manifest.json', 'design-system/_adherence.oxlintrc.json',
  'design-system/tokens/', 'src/app/globals.css',
];
const EXT = new Set(['.ts', '.tsx', '.jsx', '.js', '.mjs', '.css', '.html', '.md', '.json']);

function listFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const rel = path.relative(WEB, p).split(path.sep).join('/');
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        walk(p);
        continue;
      }
      if (EXCLUDE_PREFIX.some((x) => rel === x || rel.startsWith(x))) continue;
      if (!EXT.has(path.extname(e.name))) continue;
      out.push(rel);
    }
  };
  walk(path.join(WEB, 'src'));
  walk(path.join(WEB, 'design-system'));
  return out.sort();
}

// ── 보고서 누적 ────────────────────────────────────────────────────────────
const perFile = new Map();   // file → { rule: count }
const manual = [];           // { file, line, kind, text }
function count(file, rule, n = 1) {
  if (!perFile.has(file)) perFile.set(file, {});
  const o = perFile.get(file);
  o[rule] = (o[rule] ?? 0) + n;
}
function flag(file, line, kind, text) {
  manual.push({ file, line, kind, text: text.trim().slice(0, 200) });
}

// ── 공통 도구 ──────────────────────────────────────────────────────────────
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BOUNDARY = '(?![\\w-])';

/** 변수 이름 단일 패스 치환. 긴 이름부터 맞춰 접두 충돌을 막는다. */
const VAR_KEYS = Object.keys(MAP.vars).sort((a, b) => b.length - a.length);
const VAR_RE = new RegExp(`(?<![\\w-])(${VAR_KEYS.map(escapeRe).join('|')})${BOUNDARY}`, 'g');

const WEIGHT_KEYS = Object.keys(MAP.weights).sort((a, b) => b.length - a.length);
const WEIGHT_NAMES = WEIGHT_KEYS.map(escapeRe).join('|');

/** 변형(hover: md: data-[x]: …) 접두를 떼어 낸다. 대괄호·괄호 안의 ':'는 건너뛴다. */
function splitVariants(tok) {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < tok.length; i++) {
    const c = tok[i];
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (c === ':' && depth === 0) last = i;
  }
  return last < 0 ? ['', tok] : [tok.slice(0, last + 1), tok.slice(last + 1)];
}

// ── 1. --color-primary: 면이면 accent, 글자·아이콘·선이면 link ────────────────
const FILL_KEY = /(background|(^|[^a-z])bg|Bg$|gradient)/i;
const INK_KEY = /(color|stroke|fill|border|outline|ring|shadow|text|caret)/i;
const CLASS_PREFIX_FILL = new Set(['bg', 'from', 'to', 'via']);

function primaryKind(text, idx) {
  const lineStart = text.lastIndexOf('\n', idx) + 1;
  const before = text.slice(lineStart, idx);
  const slashes = before.search(/(^|[^:])\/\//);
  if (/^\s*(\*|\/\*|<!--)/.test(before) || slashes >= 0 || /<!--/.test(before)) return { kind: 'comment' };

  // Tailwind 임의값: bg-[color:var(--color-primary)] / shadow-[inset_0_0_0_2px_var(--color-primary)]
  const cls = before.match(/(?:^|[\s"'`:{(])-?([a-z][a-z0-9]*(?:-[a-z0-9]+)*)-\[[^\]\s]*$/);
  if (cls) {
    const prefix = cls[1];
    return { kind: CLASS_PREFIX_FILL.has(prefix) ? 'fill' : 'ink', via: `class:${prefix}` };
  }

  // 인라인 style 키·JSX 속성·CSS 속성: 같은 줄에서 가장 가까운 `이름:` 또는 `이름=`.
  const keyRe = /([A-Za-z_$][\w$-]*)['"]?\s*(?::|=)(?!=)/g;
  let key = null;
  for (const m of before.matchAll(keyRe)) key = m[1];
  if (!key && lineStart > 0) {
    const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1;
    const prev = text.slice(prevStart, lineStart - 1);
    for (const m of prev.matchAll(keyRe)) key = m[1];
  }
  if (!key) return { kind: 'unknown' };
  if (FILL_KEY.test(key)) return { kind: 'fill', via: `key:${key}` };
  if (INK_KEY.test(key)) return { kind: 'ink', via: `key:${key}` };
  return { kind: 'unknown', via: `key:${key}` };
}

function replacePrimary(text, file) {
  const re = /--color-primary(?![\w-])/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    const idx = m.index;
    const { kind, via } = primaryKind(text, idx);
    const lineNo = text.slice(0, idx).split('\n').length;
    const lineText = text.split('\n')[lineNo - 1];
    let repl = null;
    if (kind === 'fill') repl = '--accent';
    else if (kind === 'ink') repl = '--link';
    else if (kind === 'comment') {
      // 주석·설명문: 윤곽선·글자·아이콘 맥락이면 link, 아니면 accent. 결과는 검토 목록에 남긴다.
      repl = /(윤곽|outline|포커스|focus|글자|텍스트|text|color|아이콘|숫자|링크|선)/i.test(lineText) ? '--link' : '--accent';
      flag(file, lineNo, 'primary-comment', lineText);
    }
    out += text.slice(last, idx);
    if (repl) {
      out += repl;
      count(file, `primary→${repl.slice(2)}`);
    } else {
      out += m[0];
      flag(file, lineNo, 'primary-unknown', `${via ?? ''} :: ${lineText}`);
    }
    last = idx + m[0].length;
  }
  return out + text.slice(last);
}

// ── 2. 클래스 문자열 토큰 변환 ──────────────────────────────────────────────
const SPACING_PREFIX = '(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y|w|h|size|min-w|min-h|max-w|max-h|top|right|bottom|left|inset|inset-x|inset-y|start|end|basis|translate-x|translate-y)';
const RE_SPACING = new RegExp(`^(-?)(${SPACING_PREFIX})-\\[var\\(--spacing-(\\d+)\\)\\](\\/\\d+)?$`);
const RE_RADIUS = /^rounded((?:-(?:t|r|b|l|s|e|tl|tr|bl|br|ss|se|ee|es))?)-\[var\(--radius-([\w-]+)\)\]$/;
const RE_TEXT = /^text-\[(?:length:)?var\(--text-([\w-]+)\)\]$/;
const RE_LEADING = /^leading-\[var\(--leading-([\w-]+)\)\]$/;
const RE_WEIGHT = new RegExp(`^font-\\[number:var\\((${WEIGHT_NAMES})\\)\\]$`);
const RE_TRACKING = /^tracking-\[var\(--tracking-[\w-]+\)\]$/;

/** 한 문자열(따옴표로 끊은 구간) 안의 클래스 토큰을 변환한다. */
function transformSegment(seg, file, lineNo) {
  if (!/\[|rounded-|bg-|text-/.test(seg)) return seg;
  const parts = seg.split(/(\s+)/);          // [tok, ws, tok, ws, ...]
  const toks = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i] === '') continue;
    const [variants, base] = splitVariants(parts[i]);
    toks.push({ idx: i, variants, base, raw: parts[i], drop: false, out: null });
  }
  // text·leading 짝 찾기 (같은 변형 접두 + 같은 구간)
  const texts = toks.filter((t) => RE_TEXT.test(t.base));
  const leadings = toks.filter((t) => RE_LEADING.test(t.base));
  for (const t of texts) {
    const name = t.base.match(RE_TEXT)[1];
    const step = MAP.textStep[name];
    if (!step) continue;                      // --text-h1·--text-display 등: 수동
    const pair = leadings.find((l) => !l.drop && l.out === null && l.variants === t.variants);
    t.out = `${t.variants}text-${step}`;
    count(file, 'class:text');
    if (pair) {
      const lstep = MAP.leadingStep[pair.base.match(RE_LEADING)[1]];
      if (lstep === step) {
        pair.drop = true;
        count(file, 'class:leading(쌍 합침)');
      } else if (lstep) {
        pair.out = `${pair.variants}leading-[var(--text-${lstep}--line-height)]`;
        count(file, 'class:leading(짝 불일치)');
        flag(file, lineNo, 'leading-mismatch', `${t.raw} + ${pair.raw}`);
      }
    }
  }
  for (const l of leadings) {
    if (l.drop || l.out !== null) continue;
    const name = l.base.match(RE_LEADING)[1];
    if (name === 'loose' || name === 'reading') continue; // 남기는 토큰
    const lstep = MAP.leadingStep[name];
    if (!lstep) continue;
    l.out = `${l.variants}leading-[var(--text-${lstep}--line-height)]`;
    count(file, 'class:leading(단독)');
    flag(file, lineNo, 'leading-alone', l.raw);
  }
  for (const t of toks) {
    if (t.drop || t.out !== null) continue;
    let m;
    if ((m = t.base.match(RE_SPACING)) && MAP.spacingStep[m[3]]) {
      t.out = `${t.variants}${m[1]}${m[2]}-${MAP.spacingStep[m[3]]}${m[4] ?? ''}`;
      count(file, 'class:spacing');
    } else if ((m = t.base.match(RE_RADIUS))) {
      const u = MAP.radiusUtility[m[2]];
      if (u) {
        t.out = `${t.variants}rounded${m[1]}-${u}`;
        count(file, 'class:radius');
        if (m[2] === 'input' || m[2] === 'inputs') flag(file, lineNo, 'radius-input-capsule', t.raw);
      } else {
        flag(file, lineNo, 'radius-unmapped', t.raw);
      }
    } else if ((m = t.base.match(RE_WEIGHT))) {
      const u = MAP.weightUtility[String(MAP.weights[m[1]])];
      t.out = `${t.variants}font-${u}`;
      count(file, 'class:weight');
    } else if (RE_TRACKING.test(t.base)) {
      t.drop = true;
      count(file, 'class:tracking(삭제)');
    }
  }
  // 재조립
  const out = parts.slice();
  for (const t of toks) {
    if (t.out !== null) out[t.idx] = t.out;
  }
  // 삭제 토큰: 뒤쪽 공백을 함께 지우고, 마지막이면 앞쪽 공백을 지운다.
  const dropped = toks.filter((t) => t.drop).sort((a, b) => b.idx - a.idx);
  for (const t of dropped) {
    out[t.idx] = null;
    if (t.idx + 1 < out.length && out[t.idx + 1] !== null) out[t.idx + 1] = null;
    else if (t.idx - 1 >= 0 && out[t.idx - 1] !== null) out[t.idx - 1] = null;
  }
  return out.filter((x) => x !== null).join('');
}

function transformClasses(text, file) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/var\(--(?:text|leading|spacing|radius|weight|tracking)-/.test(line)) continue;
    lines[i] = line.replace(/[^"'`]+/g, (seg) => transformSegment(seg, file, i + 1));
  }
  return lines.join('\n');
}

// ── 3. 클래스가 아닌 곳의 자간·굵기 ─────────────────────────────────────────
function transformStyleMisc(text, file) {
  let out = text;
  // JS 객체: letterSpacing: 'var(--tracking-h4)',  (자간은 새 시스템에서 모두 0 → 삭제)
  out = out.replace(/[ \t]*letterSpacing:\s*(['"])var\(--tracking-[\w-]+\)\1,?[ \t]?/g, (m) => {
    count(file, 'style:letterSpacing(삭제)');
    return '';
  });
  // CSS·인라인 style 문자열: letter-spacing:var(--tracking-x);
  out = out.replace(/[ \t]*letter-spacing:\s*var\(--tracking-[\w-]+\)\s*;?/g, () => {
    count(file, 'css:letter-spacing(삭제)');
    return '';
  });
  // 굵기: fontWeight: 'var(--weight-h4)' → fontWeight: 500
  out = out.replace(new RegExp(`(['"])var\\((${WEIGHT_NAMES})\\)\\1`, 'g'), (m, q, name) => {
    count(file, 'style:fontWeight');
    return String(MAP.weights[name]);
  });
  // CSS: font-weight:var(--weight-x)
  out = out.replace(new RegExp(`var\\((${WEIGHT_NAMES})\\)`, 'g'), (m, name) => {
    count(file, 'css:font-weight');
    return String(MAP.weights[name]);
  });
  // 비어 버린 줄(공백만 남은 줄)은 지운다. 원래 비어 있던 줄은 그대로 둔다.
  if (out !== text) {
    const before = text.split('\n');
    const after = out.split('\n');
    if (before.length === after.length) {
      out = after.filter((l, i) => !(l.trim() === '' && before[i].trim() !== '')).join('\n');
    }
  }
  return out;
}

// ── 4. 색 유틸리티 이름 (bg-surface → bg-background …) ──────────────────────
const UTIL_NAMES = Object.keys(MAP.utilities).sort((a, b) => b.length - a.length);
const UTIL_PREFIXES = MAP.utilityPrefixes.slice().sort((a, b) => b.length - a.length);
const UTIL_RE = new RegExp(
  `(?<![\\w-])(${UTIL_PREFIXES.map(escapeRe).join('|')})-(${UTIL_NAMES.map(escapeRe).join('|')})(?![\\w-])`,
  'g',
);
const PRIMARY_UTIL_RE = new RegExp(`(?<![\\w-])(bg|text|border|border-t|border-b|border-l|border-r|ring|outline|fill|stroke|from|to|via|divide|placeholder|decoration|caret|accent|shadow)-primary(?![\\w-])`, 'g');
const RADIUS_CLASS_RE = new RegExp(`(?<![\\w-])(${Object.keys(MAP.radiusClasses).map(escapeRe).join('|')})(?![\\w-])`, 'g');

function transformUtilities(text, file) {
  let out = text.replace(UTIL_RE, (m, prefix, name) => {
    count(file, 'util:color');
    return `${prefix}-${MAP.utilities[name]}`;
  });
  out = out.replace(PRIMARY_UTIL_RE, (m, prefix) => {
    const kind = CLASS_PREFIX_FILL.has(prefix) ? 'fill' : 'ink';
    count(file, `util:primary→${MAP.primaryUtility[kind]}`);
    return `${prefix}-${MAP.primaryUtility[kind]}`;
  });
  out = out.replace(RADIUS_CLASS_RE, (m) => {
    count(file, 'util:radius');
    return MAP.radiusClasses[m];
  });
  return out;
}

// ── 5. 변수 이름 단일 패스 ──────────────────────────────────────────────────
function transformVars(text, file) {
  return text.replace(VAR_RE, (m) => {
    count(file, 'var');
    return MAP.vars[m];
  });
}

// ── 6. 남은 calc() 안 간격 목록 ─────────────────────────────────────────────
function scanLeftovers(text, file) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (/calc\([^)]*var\(--spacing-\d+\)/.test(line)) flag(file, i + 1, 'calc-spacing', line);
    if (/(?<![\w-])text-(?:white|black)(?![\w-])|bg-(?:white|black)(?![\w-])/.test(line)) { /* 하위 티켓 몫 */ }
  });
}

// ── 실행 ───────────────────────────────────────────────────────────────────
const files = listFiles();
let changedFiles = 0;
for (const rel of files) {
  const abs = path.join(WEB, rel);
  const before = fs.readFileSync(abs, 'utf8');
  let t = before;
  t = replacePrimary(t, rel);          // 1) --color-primary는 문맥을 보고 먼저 처리한다
  t = transformClasses(t, rel);        // 2) 클래스 문자열의 글자·행간·간격·반경·굵기·자간
  t = transformStyleMisc(t, rel);      // 3) 클래스가 아닌 곳의 자간·굵기
  t = transformUtilities(t, rel);      // 4) 색 유틸리티 이름
  t = transformVars(t, rel);           // 5) 남은 변수 이름 단일 패스
  scanLeftovers(t, rel);               // 6) 수동 검토 목록
  if (t !== before) {
    changedFiles++;
    if (!DRY) fs.writeFileSync(abs, t);
  }
}

const totals = {};
for (const [, o] of perFile) for (const [k, v] of Object.entries(o)) totals[k] = (totals[k] ?? 0) + v;
const report = {
  dryRun: DRY,
  scannedFiles: files.length,
  changedFiles,
  totals,
  perFile: Object.fromEntries([...perFile.entries()].sort()),
  manual,
};
if (!DRY) fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`대상 ${files.length}개 · 변경 ${changedFiles}개${DRY ? ' (dry-run, 파일은 쓰지 않음)' : ''}`);
console.log('규칙별 치환 수:');
for (const [k, v] of Object.entries(totals).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);
const byKind = {};
for (const m of manual) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
console.log('수동 검토:', JSON.stringify(byKind));
if (process.argv.includes('--list')) {
  for (const m of manual) console.log(`  [${m.kind}] ${m.file}:${m.line}  ${m.text}`);
}
