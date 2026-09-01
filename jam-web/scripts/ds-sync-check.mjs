#!/usr/bin/env node
/**
 * ds-sync-check.mjs — 서비스 UI ↔ MODULAR ↔ Storybook ↔ claude.ai/design 정합성 진단
 *
 * `/jam-ds` 스킬의 진단 엔진. 사람이 눈으로 네 층을 대조하던 일을 기계가 대신한다.
 *
 * ── 왜 텍스트 diff가 아닌가 ─────────────────────────────────────────────────
 * 서비스 UI는 Tailwind 유틸리티(`h-[49px] px-1 max-w-[388px]`)로, MODULAR은 인라인 style
 * 객체(`height: 49, padding: '0 4px', maxWidth: 388`)로 같은 값을 표현한다. 문자열 비교로는
 * 100% 오탐이 난다(실제로 탭바 티켓 20260901_1626에서 두 파일은 값이 일치하는데도 diff는
 * 전부 달라 보였다). 그래서 양쪽을 **정규화된 CSS 속성:값 집합**으로 환원해 비교한다.
 *
 * ── 기준값 방향 ─────────────────────────────────────────────────────────────
 * - 컴포넌트 기하·색: **서비스 UI(src/components/ui/*.tsx)가 기준**. DS를 여기 맞춘다.
 * - 디자인 토큰: **MODULAR(design-system/tokens/*.css)가 기준**. globals.css가 이를 import하므로
 *   방향이 반대다. 토큰 값 자체는 이 스크립트가 판정하지 않는다.
 *
 * ── 한계 (정직하게) ─────────────────────────────────────────────────────────
 * JSX를 AST로 파싱하지 않는다. 컴포넌트 파일 전체를 하나의 값 집합으로 보므로 "어느 요소의
 * 값인지"는 구분하지 못한다. 즉 한쪽에만 있는 값은 잡아내지만, 서로 다른 요소에 같은 값이
 * 붙어 있는 오배치는 못 잡는다. 해석하지 못한 Tailwind 클래스는 삼키지 않고 unresolved로
 * 보고한다.
 *
 * 사용법:
 *   node scripts/ds-sync-check.mjs           # 사람이 읽는 리포트
 *   node scripts/ds-sync-check.mjs --json    # 기계 판독용 JSON
 *   node scripts/ds-sync-check.mjs --only=PAIR_GEOMETRY,STORY_STALE
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..');
const DS = path.join(WEB_ROOT, 'design-system');
const SERVICE_UI = path.join(WEB_ROOT, 'src/components/ui');
const SYNC_DIR = path.join(REPO_ROOT, '.design-sync');

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '')
  .split(',').filter(Boolean);

const findings = [];
/** @param {'ERROR'|'WARN'|'INFO'} level */
function report(check, level, subject, message, detail) {
  if (ONLY.length && !ONLY.includes(check)) return;
  findings.push({ check, level, subject, message, ...(detail ? { detail } : {}) });
}

// ── 토큰 해석 ────────────────────────────────────────────────────────────────
/** tokens/*.css + styles.css 의 `--x: value` 를 모아 var() 를 재귀 해석할 수 있게 만든다. */
function loadTokens() {
  const map = new Map();
  const dirs = [path.join(DS, 'tokens')];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.css'))) {
      // 주석 안에도 ':' 와 '--토큰' 이 등장해 매칭을 밀어내므로 먼저 걷어낸다.
      const src = readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
        if (!map.has(m[1])) map.set(m[1], m[2].trim());
      }
    }
  }
  return map;
}
const TOKENS = loadTokens();

/** var(--x) 를 실제 값까지 펼친다. 순환은 깊이로 끊는다. */
function resolveVars(value, depth = 0) {
  if (depth > 8 || typeof value !== 'string') return value;
  return value.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (whole, name, fallback) => {
    const hit = TOKENS.get(name);
    if (hit !== undefined) return resolveVars(hit, depth + 1);
    if (fallback !== undefined) return resolveVars(fallback.trim(), depth + 1);
    return whole; // 미정의 토큰은 그대로 둔다 (TOKEN_UNDEFINED 가 따로 잡는다)
  });
}

// ── 값 정규화 ────────────────────────────────────────────────────────────────
/** React style 에서 단위 없는 숫자가 px 로 해석되지 '않는' 속성들. */
const UNITLESS = new Set([
  'zIndex', 'opacity', 'flex', 'flexGrow', 'flexShrink', 'fontWeight', 'lineHeight',
  'order', 'gridColumn', 'gridRow', 'columnCount',
]);

function normalizeValue(prop, raw) {
  let v = String(raw).trim().replace(/^['"]|['"]$/g, '');
  v = resolveVars(v);
  v = v.replace(/\s+/g, ' ').trim();
  if (/^-?\d+(\.\d+)?$/.test(v) && !UNITLESS.has(prop)) v = `${v}px`;
  // calc/공백 표기 흔들림 흡수: calc(100% - 42px) === calc(100%-42px)
  if (v.startsWith('calc(')) v = v.replace(/\s*([+\-*/])\s*/g, '$1');
  // 0 계열 통일
  if (/^0(px|rem|em|%)$/.test(v)) v = '0';
  // rem → px (루트 16px 가정)
  v = v.replace(/(-?\d+(?:\.\d+)?)rem\b/g, (_, n) => `${parseFloat(n) * 16}px`);
  // 색상 소문자화 + #abc → #aabbcc
  if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + v.slice(1).split('').map((c) => c + c).join('');
  if (/^#[0-9a-f]{6,8}$/i.test(v)) v = v.toLowerCase();
  // 9999px 이상의 반경은 pill 로 동치 처리 (rounded-full ↔ var(--radius-pill))
  if (prop === 'borderRadius' && /^\d+px$/.test(v) && parseInt(v) >= 999) v = 'PILL';
  return v;
}

// ── 인라인 style 객체 추출 (MODULAR .jsx) ───────────────────────────────────
/** style={{ ... }} 블록을 중괄호 균형으로 잘라낸 뒤 최상위 key: value 만 뽑는다. */
function extractInlineStyles(src) {
  const out = [];
  const re = /style=\{\{/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 2;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    out.push(...parseStyleBody(src.slice(start, i - 2)));
  }
  // pill.style.width = `...` 같은 명령형 대입은 런타임 계산이라 비교에서 제외한다.
  return out;
}

/** `key: value,` 를 최상위 레벨에서만 분리한다 (중첩 객체·함수 호출 안쪽은 건너뛴다). */
function parseStyleBody(body) {
  const pairs = [];
  let depth = 0, key = null, buf = '', inStr = null;
  const flush = () => {
    if (key && buf.trim()) {
      const val = buf.trim().replace(/,$/, '');
      // 삼항/변수 참조는 정적 비교 불가 → 건너뛴다
      if (!/[?]|=>|\breturn\b/.test(val)) pairs.push([key, val]);
    }
    key = null; buf = '';
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) { buf += c; if (c === inStr && body[i - 1] !== '\\') inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; buf += c; continue; }
    if (c === '{' || c === '(' || c === '[') depth++;
    if (c === '}' || c === ')' || c === ']') depth--;
    if (c === ':' && depth === 0 && key === null) { key = buf.trim(); buf = ''; continue; }
    if (c === ',' && depth === 0) { flush(); continue; }
    buf += c;
  }
  flush();
  return pairs
    .filter(([k]) => /^[A-Za-z][\w]*$/.test(k))
    .map(([k, v]) => [k, normalizeValue(k, v)]);
}

// ── Tailwind 유틸리티 추출 (서비스 .tsx) ────────────────────────────────────
const TW_SCALE = (n) => `${parseFloat(n) * 4}px`;
const TW_RADIUS = {
  none: '0', sm: '2px', '': '4px', md: '6px', lg: '8px',
  xl: '12px', '2xl': '16px', '3xl': '24px', full: 'PILL',
};
/** 값이 없거나 구조·상태에만 관여해 기하 비교 대상이 아닌 클래스들. */
const TW_IGNORE = /^(fixed|absolute|relative|sticky|static|flex|inline-flex|grid|block|inline|hidden|contents|isolate|items-|justify-|content-|self-|place-|text-(left|center|right|justify)$|font-|leading-|tracking-|uppercase|lowercase|capitalize|truncate|whitespace-|break-|overflow-|overscrow-|overscroll-|object-|cursor-|pointer-events-|select-|resize|appearance-|outline-|ring-|shadow|border(-|$)|divide-|backdrop-|filter|blur|transition|duration-|delay-|ease-|animate-|will-change-|transform|origin-|scale-|rotate-|skew-|translate-|grow|shrink|basis-|order-|col-|row-|auto-|flex-|gap-x-|gap-y-|antialiased|sr-only|not-sr-only|list-|align-|table-|float-|clear-|box-|aspect-|columns-|touch-|scroll-|snap-|caret-|accent-|fill-|stroke-|mix-|bg-(gradient|clip|origin|repeat|position|size|center|cover|contain|no-repeat)|from-|via-|to-)/;
/** 상태·반응형 프리픽스가 붙은 클래스는 조건부라 정적 비교 대상이 아니다. */
const TW_VARIANT = /^[a-z0-9-]+:/;

const TW_PROP = [
  [/^w-(.+)$/, 'width'], [/^h-(.+)$/, 'height'],
  [/^max-w-(.+)$/, 'maxWidth'], [/^max-h-(.+)$/, 'maxHeight'],
  [/^min-w-(.+)$/, 'minWidth'], [/^min-h-(.+)$/, 'minHeight'],
  [/^size-(.+)$/, '@size'],
  [/^p-(.+)$/, '@p'], [/^px-(.+)$/, '@px'], [/^py-(.+)$/, '@py'],
  [/^pt-(.+)$/, 'paddingTop'], [/^pr-(.+)$/, 'paddingRight'],
  [/^pb-(.+)$/, 'paddingBottom'], [/^pl-(.+)$/, 'paddingLeft'],
  [/^m-(.+)$/, '@m'], [/^mx-(.+)$/, '@mx'], [/^my-(.+)$/, '@my'],
  [/^mt-(.+)$/, 'marginTop'], [/^mr-(.+)$/, 'marginRight'],
  [/^mb-(.+)$/, 'marginBottom'], [/^ml-(.+)$/, 'marginLeft'],
  [/^gap-(.+)$/, 'gap'], [/^z-(.+)$/, 'zIndex'],
  [/^top-(.+)$/, 'top'], [/^bottom-(.+)$/, 'bottom'],
  [/^left-(.+)$/, 'left'], [/^right-(.+)$/, 'right'],
  [/^opacity-(.+)$/, 'opacity'],
  [/^bg-\[(.+)\]$/, 'backgroundColor'], [/^text-\[(#.+)\]$/, 'color'],
];

/** Tailwind 임의값 `[...]` 은 `_` 가 공백을 뜻한다. */
function twValue(prop, token) {
  let v = token;
  if (v.startsWith('[') && v.endsWith(']')) {
    v = v.slice(1, -1).replace(/_/g, ' ');
    return normalizeValue(prop, v);
  }
  if (prop === 'zIndex' || prop === 'opacity') {
    return prop === 'opacity' ? String(parseFloat(v) / 100) : v;
  }
  if (v === 'full') return prop.startsWith('max') || prop === 'width' || prop === 'height' ? '100%' : v;
  if (v === 'px') return '1px';
  if (v === 'auto' || v === 'screen' || v === 'min' || v === 'max' || v === 'fit') return v;
  if (/^\d+(\.\d+)?$/.test(v)) return TW_SCALE(v);
  if (/^\d+\/\d+$/.test(v)) { const [a, b] = v.split('/'); return `${((+a / +b) * 100).toFixed(4).replace(/\.?0+$/, '')}%`; }
  return v;
}

function extractTailwind(src) {
  const out = [];
  const unresolved = new Set();
  const classStrings = [];
  for (const m of src.matchAll(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)) {
    classStrings.push(m[1] || m[2] || m[3] || '');
  }
  for (const cs of classStrings) {
    for (const rawTok of cs.split(/\s+/).filter(Boolean)) {
      if (rawTok.includes('${')) continue;          // 템플릿 보간은 동적
      if (TW_VARIANT.test(rawTok)) continue;         // hover:/md:/active: 등 조건부
      if (TW_IGNORE.test(rawTok)) continue;
      const tok = rawTok.replace(/^!/, '');
      let matched = false;
      if (/^rounded(-|$)/.test(tok)) {
        const suffix = tok.replace(/^rounded-?/, '');
        if (suffix.startsWith('[')) out.push(['borderRadius', normalizeValue('borderRadius', suffix.slice(1, -1).replace(/_/g, ' '))]);
        else if (suffix in TW_RADIUS) out.push(['borderRadius', normalizeValue('borderRadius', TW_RADIUS[suffix])]);
        else unresolved.add(tok);
        continue;
      }
      for (const [re, prop] of TW_PROP) {
        const mm = tok.match(re);
        if (!mm) continue;
        matched = true;
        const bare = prop.replace('@', '');
        const val = normalizeValue(bare, twValue(bare, mm[1]));
        if (prop === '@size') out.push(['width', val], ['height', val]);
        else if (prop === '@p') out.push(['paddingTop', val], ['paddingRight', val], ['paddingBottom', val], ['paddingLeft', val]);
        else if (prop === '@px') out.push(['paddingLeft', val], ['paddingRight', val]);
        else if (prop === '@py') out.push(['paddingTop', val], ['paddingBottom', val]);
        else if (prop === '@m') out.push(['marginTop', val], ['marginRight', val], ['marginBottom', val], ['marginLeft', val]);
        else if (prop === '@mx') out.push(['marginLeft', val], ['marginRight', val]);
        else if (prop === '@my') out.push(['marginTop', val], ['marginBottom', val]);
        else out.push([prop, val]);
        break;
      }
      if (!matched && !/^(jam-|ds-)/.test(tok)) unresolved.add(tok);
    }
  }
  return { pairs: out, unresolved: [...unresolved] };
}

/** padding/margin shorthand 를 4방향으로 분해해 양쪽 표기를 같은 축에 놓는다. */
function expandShorthand(pairs) {
  const out = [];
  for (const [k, v] of pairs) {
    if ((k === 'padding' || k === 'margin') && /\s/.test(v)) {
      const parts = v.split(/\s+/);
      const [t, r, b, l] = parts.length === 2 ? [parts[0], parts[1], parts[0], parts[1]]
        : parts.length === 3 ? [parts[0], parts[1], parts[2], parts[1]]
        : parts.length === 4 ? parts : [v, v, v, v];
      const P = k === 'padding' ? 'padding' : 'margin';
      out.push([`${P}Top`, t], [`${P}Right`, r], [`${P}Bottom`, b], [`${P}Left`, l]);
    } else if ((k === 'padding' || k === 'margin')) {
      const P = k;
      out.push([`${P}Top`, v], [`${P}Right`, v], [`${P}Bottom`, v], [`${P}Left`, v]);
    } else out.push([k, v]);
  }
  return out;
}

const keyOf = ([k, v]) => `${k}: ${v}`;

// ── 검사 1·2: 페어 기하 드리프트 / 페어 결손 ────────────────────────────────
function loadManifest() {
  const p = path.join(DS, '_ds_manifest.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
const manifest = loadManifest();

function buildPairs() {
  const pairs = [];
  if (!manifest) return pairs;
  for (const c of manifest.components || []) {
    const dsPath = path.join(DS, c.sourcePath);
    const svcPath = path.join(SERVICE_UI, `${c.name}.tsx`);
    pairs.push({
      name: c.name,
      dsPath, svcPath,
      dsExists: existsSync(dsPath),
      svcExists: existsSync(svcPath),
      rel: { ds: path.relative(REPO_ROOT, dsPath), svc: path.relative(REPO_ROOT, svcPath) },
    });
  }
  return pairs;
}

function checkPairs(pairs) {
  for (const p of pairs) {
    if (!p.dsExists) {
      report('MANIFEST_DRIFT', 'ERROR', p.name,
        `manifest 가 가리키는 컴포넌트 파일이 없습니다: ${p.rel.ds}`);
      continue;
    }
    if (!p.svcExists) continue; // 서비스에 짝이 없는 DS 전용 컴포넌트는 정상 (@ds 직접 import)

    // <svg …> 여는 태그를 지워 아이콘 치수를 비교 대상에서 제외한다 (양쪽 대칭).
    // 서비스는 <svg className="w-4 h-4">, MODULAR 은 <svg width={16} height={16}> 로 쓴다.
    // 표현 계층이 달라 짝지을 수 없고, 짝지으면 아이콘 16px 이 버튼 28px 과 비교된다.
    const stripSvg = (src) => src.replace(/<svg[^>]*>/g, '<svg>');
    const dsSrc = stripSvg(readFileSync(p.dsPath, 'utf8'));
    const svcSrc = stripSvg(readFileSync(p.svcPath, 'utf8'));

    const dsAll = expandShorthand(extractInlineStyles(dsSrc)).map(keyOf);
    const tw = extractTailwind(svcSrc);
    const svcAll = expandShorthand([...tw.pairs, ...extractInlineStyles(svcSrc)]).map(keyOf);
    const dsSet = new Set(dsAll);
    const svcSet = new Set(svcAll);

    const onlySvc = [...svcSet].filter((x) => !dsSet.has(x)).sort();
    const onlyDs = [...dsSet].filter((x) => !svcSet.has(x)).sort();

    // 같은 속성이 양쪽에 있는데 값만 다른 경우가 진짜 드리프트다. 한쪽에만 있는 속성은
    // 표현 방식 차이(예: DS 는 CSS 클래스로 뺀 값)일 수 있어 심각도를 낮춘다.
    const propOf = (s) => s.split(':')[0];
    const svcProps = new Set(onlySvc.map(propOf));
    const conflicts = onlyDs.filter((x) => svcProps.has(propOf(x)));
    const conflictProps = new Set(conflicts.map(propOf));

    for (const prop of conflictProps) {
      const svcVals = onlySvc.filter((x) => propOf(x) === prop);
      const dsVals = onlyDs.filter((x) => propOf(x) === prop);
      // 양쪽 다 그 속성이 딱 한 번씩만 등장할 때만 같은 요소를 가리킨다고 볼 수 있다.
      // 중복 제거된 값 개수가 아니라 '원본 등장 횟수' 로 세야 한다 — DS 가 marginBottom 을
      // 핸들·제목 두 곳에 같은 값으로 쓰면 Set 에서는 1개로 접혀 오판한다.
      const occur = (arr) => arr.filter((x) => propOf(x) === prop).length;
      const certain = occur(svcAll) === 1 && occur(dsAll) === 1;
      report('PAIR_GEOMETRY', certain ? 'ERROR' : 'WARN', p.name,
        certain
          ? `${prop} 값이 어긋납니다. 서비스가 기준입니다.`
          : `${prop} 이 양쪽에 여러 번 등장해 요소 대응을 확정할 수 없습니다. 눈으로 확인하세요.`,
        { 기준_서비스: svcVals, 현재_MODULAR: dsVals, 파일: p.rel });
    }
    const svcOnlyProps = onlySvc.filter((x) => !conflictProps.has(propOf(x)));
    const dsOnlyProps = onlyDs.filter((x) => !conflictProps.has(propOf(x)));
    if (svcOnlyProps.length || dsOnlyProps.length) {
      report('PAIR_GEOMETRY', 'WARN', p.name,
        '한쪽에만 있는 값입니다. 의도된 차이인지, 옮겨야 할 값인지 판단이 필요합니다.',
        { 서비스에만: svcOnlyProps, MODULAR에만: dsOnlyProps, 파일: p.rel });
    }
    if (tw.unresolved.length) {
      report('PAIR_GEOMETRY', 'INFO', p.name,
        `해석하지 못한 Tailwind 클래스 ${tw.unresolved.length}개 — 비교에서 빠졌습니다.`,
        { 미해석: tw.unresolved });
    }
  }
}

// ── 검사 3: props 드리프트 (.d.ts ↔ .tsx) ───────────────────────────────────
function propNames(src) {
  const names = new Set();
  // `interface XxxProps {` / `type XxxProps = {` 본문 '안에서만' 뽑는다.
  // 파일 전체를 훑으면 style 객체·상수 리터럴의 키까지 props 로 잡혀(height·transform·
  // username …) 9쌍 전부에서 오탐이 났다.
  const re = /(?:interface|type)\s+\w*Props\b[^{]*\{/g;
  while (re.test(src)) {
    let depth = 1, i = re.lastIndex;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    const body = src.slice(start, i - 1);
    // 중첩 객체 타입 안쪽 키는 props 가 아니므로 최상위 깊이에서만 인정한다.
    let d = 0, buf = '';
    for (let j = 0; j < body.length; j++) {
      const c = body[j];
      if (c === '{' || c === '(' || c === '[') d++;
      else if (c === '}' || c === ')' || c === ']') d--;
      else if (c === ':' && d === 0) {
        const name = buf.trim().replace(/\?$/, '').replace(/^readonly\s+/, '');
        if (/^\w+$/.test(name)) names.add(name);
        buf = ''; continue;
      } else if ((c === ';' || c === ',' || c === '\n') && d === 0) { buf = ''; continue; }
      buf += c;
    }
  }
  return names;
}
function checkProps(pairs) {
  for (const p of pairs) {
    if (!p.svcExists || !p.dsExists) continue;
    const dts = p.dsPath.replace(/\.jsx$/, '.d.ts');
    if (!existsSync(dts)) {
      report('PROPS_DRIFT', 'WARN', p.name, `타입 정의가 없습니다: ${path.relative(REPO_ROOT, dts)}`);
      continue;
    }
    const dsProps = propNames(readFileSync(dts, 'utf8'));
    const svcProps = propNames(readFileSync(p.svcPath, 'utf8'));
    if (!svcProps.size) continue;  // 서비스에 Props 타입 선언 자체가 없으면 비교 불가
    const missing = [...svcProps].filter((n) => !dsProps.has(n));
    const extra = [...dsProps].filter((n) => !svcProps.has(n));
    if (missing.length || extra.length) {
      report('PROPS_DRIFT', 'WARN', p.name,
        'props 시그니처가 서비스 구현과 어긋납니다.',
        { 서비스에만: missing, DS타입에만: extra, 파일: path.relative(REPO_ROOT, dts) });
    }
  }
}

// ── 검사 4·5: Story 결손 / 노후 ─────────────────────────────────────────────
function lastCommitTime(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', file],
      { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return out ? parseInt(out, 10) : 0;
  } catch { return 0; }
}
function checkStories(pairs) {
  for (const p of pairs) {
    if (!p.dsExists) continue;
    const story = p.dsPath.replace(/\.jsx$/, '.stories.tsx');
    if (!existsSync(story)) {
      report('STORY_MISSING', 'ERROR', p.name,
        `Storybook Story 가 없습니다. MODULAR 카탈로그에서 이 컴포넌트가 보이지 않습니다.`,
        { 필요한_파일: path.relative(REPO_ROOT, story) });
      continue;
    }
    const cT = lastCommitTime(path.relative(REPO_ROOT, p.dsPath));
    const sT = lastCommitTime(path.relative(REPO_ROOT, story));
    if (cT && sT && cT > sT) {
      const days = Math.floor((cT - sT) / 86400);
      report('STORY_STALE', 'WARN', p.name,
        `컴포넌트가 Story 보다 나중에 커밋됐습니다 (${days}일 차이). Story 가 낡았을 수 있습니다.`,
        { 컴포넌트: path.relative(REPO_ROOT, p.dsPath), 스토리: path.relative(REPO_ROOT, story) });
    }
  }
}

// ── 검사 6: manifest ↔ 실제 파일 ────────────────────────────────────────────
function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const n of readdirSync(dir)) {
    const full = path.join(dir, n);
    if (statSync(full).isDirectory()) walk(full, pred, acc);
    else if (pred(full)) acc.push(full);
  }
  return acc;
}
function checkManifest() {
  if (!manifest) { report('MANIFEST_DRIFT', 'ERROR', '_ds_manifest.json', '파일이 없습니다.'); return; }
  const listed = new Set((manifest.components || []).map((c) => path.join(DS, c.sourcePath)));
  const actual = walk(path.join(DS, 'components'), (f) => f.endsWith('.jsx') && !/ \d\.jsx$/.test(f));
  const unlisted = actual.filter((f) => !listed.has(f)).map((f) => path.relative(DS, f));
  if (unlisted.length) {
    report('MANIFEST_DRIFT', 'ERROR', '_ds_manifest.json',
      `컴포넌트 파일이 색인에 없습니다 (${unlisted.length}개). 탐색·업로드에서 누락됩니다.`,
      { 미등록: unlisted });
  }
  for (const c of manifest.cards || []) {
    const p = path.join(DS, c.path);
    if (!existsSync(p)) {
      report('MANIFEST_DRIFT', 'ERROR', c.name, `카드가 가리키는 파일이 없습니다: ${c.path}`);
    }
  }
  for (const g of manifest.globalCssPaths || []) {
    if (!existsSync(path.join(DS, g))) {
      report('MANIFEST_DRIFT', 'ERROR', 'globalCssPaths', `등록된 CSS 가 없습니다: ${g}`);
    }
  }
  // globals.css 가 import 하는데 manifest 에는 빠진 토큰 파일을 찾는다.
  const globals = path.join(WEB_ROOT, 'src/app/globals.css');
  if (existsSync(globals)) {
    const imported = [...readFileSync(globals, 'utf8')
      .matchAll(/@import\s+["']\.\.\/\.\.\/design-system\/([^"']+)["']/g)].map((m) => m[1]);
    const registered = new Set(manifest.globalCssPaths || []);
    const missing = imported.filter((i) => !registered.has(i));
    if (missing.length) {
      report('MANIFEST_DRIFT', 'WARN', 'globalCssPaths',
        '서비스가 import 하는데 manifest 에 등록되지 않은 토큰 파일이 있습니다. 업로드본에서 스타일이 빠집니다.',
        { 누락: missing });
    }
  }
}

/** manifest 에 박제된 토큰 값이 tokens/*.css 의 현재 값과 같은지 본다. */
function checkManifestTokens() {
  if (!manifest) return;
  const stale = [];
  for (const t of manifest.tokens || []) {
    const actual = TOKENS.get(t.name);
    if (actual === undefined) { stale.push(`${t.name}: 등록됐으나 tokens/ 에 정의 없음`); continue; }
    // rgb(234,232,226) 와 rgb(234, 232, 226) 은 같은 값이다 — 구분자 주변 공백을 지운 뒤 비교한다.
    const canon = (v) => String(v).replace(/\s+/g, ' ').replace(/\s*([,()])\s*/g, '$1').trim();
    if (canon(actual) !== canon(t.value)) {
      stale.push(`${t.name}: manifest "${t.value}" ≠ 실제 "${actual}"`);
    }
  }
  const declared = new Set((manifest.tokens || []).map((t) => t.name));
  const undeclared = [...TOKENS.keys()].filter((n) => !declared.has(n));
  if (stale.length) {
    report('MANIFEST_TOKEN_DRIFT', 'ERROR', '_ds_manifest.json',
      `manifest 의 토큰 값이 실제 tokens/*.css 와 다릅니다 (${stale.length}개). 업로드본이 틀린 값을 보여줍니다.`,
      { 어긋난_토큰: stale });
  }
  if (undeclared.length) {
    report('MANIFEST_TOKEN_DRIFT', 'WARN', '_ds_manifest.json',
      `tokens/ 에는 있으나 manifest 색인에 없는 토큰 ${undeclared.length}개.`,
      { 미등록: undeclared });
  }
  for (const bf of manifest.brandFonts || []) {
    const fam = TOKENS.get('--font-family-base') || '';
    if (bf.tokens?.includes('--font-family-base') && !fam.includes(bf.family)) {
      report('MANIFEST_TOKEN_DRIFT', 'ERROR', 'brandFonts',
        `manifest 의 브랜드 폰트가 실제 토큰과 다릅니다: "${bf.family}" ≠ ${fam.split(',')[0]}`);
    }
  }
}

// ── 검사 7: 토큰 미사용 (raw 값) ────────────────────────────────────────────
function checkRawTokens() {
  const byValue = new Map();
  for (const [name, val] of TOKENS) {
    const resolved = resolveVars(val);
    if (/^#[0-9a-f]{3,8}$/i.test(resolved)) byValue.set(resolved.toLowerCase(), name);
  }
  const targets = [
    ...walk(path.join(DS, 'components'), (f) => f.endsWith('.jsx') && !/ \d\.jsx$/.test(f)),
    ...walk(SERVICE_UI, (f) => f.endsWith('.tsx')),
  ];
  for (const f of targets) {
    const src = readFileSync(f, 'utf8');
    const hits = new Set();
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const hex = m[0].toLowerCase();
      if (byValue.has(hex)) hits.add(`${m[0]} → var(${byValue.get(hex)})`);
    }
    if (hits.size) {
      report('TOKEN_RAW', 'WARN', path.basename(f, path.extname(f)),
        `토큰으로 정의된 색을 raw hex 로 썼습니다 (${hits.size}개).`,
        { 대체가능: [...hits], 파일: path.relative(REPO_ROOT, f) });
    }
  }
}

/** 코드가 참조하는데 tokens/ 에 정의가 없는 var(--x) 를 잡는다. */
function checkUndefinedTokens() {
  const targets = [
    ...walk(path.join(DS, 'components'), (f) => f.endsWith('.jsx') && !/ \d\.jsx$/.test(f)),
    ...walk(SERVICE_UI, (f) => f.endsWith('.tsx')),
  ];
  const globalsSrc = existsSync(path.join(WEB_ROOT, 'src/app/globals.css'))
    ? readFileSync(path.join(WEB_ROOT, 'src/app/globals.css'), 'utf8') : '';
  for (const f of targets) {
    const src = readFileSync(f, 'utf8');
    const missing = new Set();
    // 컴포넌트가 자기 style 로 주입하는 지역 변수(`'--eye-color': eyeColor`)는 토큰이 아니다.
    const localVars = new Set([...src.matchAll(/['"](--[\w-]+)['"]\s*:/g)].map((m) => m[1]));
    for (const m of src.matchAll(/var\((--[\w-]+)\s*(,?)/g)) {
      if (m[2] === ',') continue;                    // fallback 이 있으면 비어도 렌더가 살아 있다
      if (localVars.has(m[1])) continue;
      if (!TOKENS.has(m[1]) && !globalsSrc.includes(`${m[1]}:`)) missing.add(m[1]);
    }
    if (missing.size) {
      report('TOKEN_UNDEFINED', 'ERROR', path.basename(f, path.extname(f)),
        `정의되지 않은 토큰을 참조합니다 (${missing.size}개). 값이 비어 렌더가 깨집니다.`,
        { 미정의: [...missing], 파일: path.relative(REPO_ROOT, f) });
    }
  }
}

// ── 검사 8: claude.ai/design 업로드 노후 ────────────────────────────────────
function checkUploadState() {
  const statePath = path.join(SYNC_DIR, 'state.json');
  if (!existsSync(statePath)) {
    report('UPLOAD_STALE', 'INFO', 'claude.ai/design',
      '업로드 추적 파일이 없습니다 (.design-sync/state.json). 최초 동기화 후 생성됩니다.');
    return;
  }
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (!state.lastUploadCommit) {
    report('UPLOAD_STALE', 'INFO', 'claude.ai/design', '마지막 업로드 커밋이 기록되지 않았습니다.');
    return;
  }
  let changed = [];
  try {
    changed = execFileSync('git',
      ['diff', '--name-only', `${state.lastUploadCommit}..HEAD`, '--', 'jam-web/design-system'],
      { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n').filter(Boolean)
      .filter((f) => !f.includes('.stories.'));  // Story 는 업로드 대상이 아니다
  } catch {
    report('UPLOAD_STALE', 'WARN', 'claude.ai/design',
      `기록된 커밋을 찾을 수 없습니다: ${state.lastUploadCommit}`);
    return;
  }
  if (changed.length) {
    report('UPLOAD_STALE', 'WARN', 'claude.ai/design',
      `마지막 업로드 이후 MODULAR 파일 ${changed.length}개가 바뀌었습니다. 재업로드가 필요합니다.`,
      { projectId: state.projectId, 마지막업로드: state.lastUploadAt, 변경파일: changed });
  }
}

// ── 실행 ────────────────────────────────────────────────────────────────────
const pairs = buildPairs();
checkPairs(pairs);
checkProps(pairs);
checkStories(pairs);
checkManifest();
checkManifestTokens();
checkRawTokens();
checkUndefinedTokens();
checkUploadState();

const counts = {
  ERROR: findings.filter((f) => f.level === 'ERROR').length,
  WARN: findings.filter((f) => f.level === 'WARN').length,
  INFO: findings.filter((f) => f.level === 'INFO').length,
};

if (AS_JSON) {
  console.log(JSON.stringify({
    generatedFrom: 'scripts/ds-sync-check.mjs',
    pairs: pairs.filter((p) => p.svcExists).map((p) => p.name),
    dsOnly: pairs.filter((p) => !p.svcExists).map((p) => p.name),
    counts, findings,
  }, null, 2));
} else {
  const ICON = { ERROR: '✗', WARN: '△', INFO: 'ㆍ' };
  console.log('\n╭─ MODULAR 정합성 진단 ─────────────────────────────────────');
  console.log(`│ 페어(서비스↔DS) ${pairs.filter((p) => p.svcExists).length}개 · DS 전용 ${pairs.filter((p) => !p.svcExists).length}개`);
  console.log(`│ 오류 ${counts.ERROR} · 경고 ${counts.WARN} · 참고 ${counts.INFO}`);
  console.log('╰───────────────────────────────────────────────────────────\n');
  const order = { ERROR: 0, WARN: 1, INFO: 2 };
  for (const f of [...findings].sort((a, b) => order[a.level] - order[b.level])) {
    console.log(`${ICON[f.level]} [${f.check}] ${f.subject}`);
    console.log(`  ${f.message}`);
    if (f.detail) {
      for (const [k, v] of Object.entries(f.detail)) {
        const body = Array.isArray(v) ? (v.length > 8 ? `${v.slice(0, 8).join(', ')} … 외 ${v.length - 8}개` : v.join(', ')) : JSON.stringify(v);
        if (body) console.log(`    ${k}: ${body}`);
      }
    }
    console.log('');
  }
  if (!findings.length) console.log('네 층이 모두 정합합니다.\n');
}
process.exit(counts.ERROR > 0 ? 1 : 0);
