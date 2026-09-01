#!/usr/bin/env node
/**
 * ds-manifest-sync.mjs — `_ds_manifest.json` 의 기계 판독 산출물을 실제 파일에서 재생성한다.
 *
 * `/jam-ds` 스킬 2절("자동 수선 — 승인 없이 바로")의 실행 도구. manifest 는 색인일 뿐
 * 원본이 아니므로, 사람이 손으로 고칠 이유가 없고 손으로 고치면 또 낡는다.
 *
 * 갱신 대상:
 *   - tokens        ← design-system/tokens/*.css 의 현재 값
 *   - brandFonts    ← --font-family-base 의 첫 패밀리
 *   - components    ← components/ 의 실제 .jsx 목록
 *   - globalCssPaths← src/app/globals.css 가 @import 하는 목록
 *
 * 건드리지 '않는' 것:
 *   - cards — 카드가 가리키는 파일이 없을 때 "카드를 지운다"와 "파일을 만든다"는 판단이
 *     갈린다. 기계가 정할 일이 아니라 사용자에게 묻는다.
 *   - namespace/startingPoints/templates/themes — 업로드 계약에 속한 값이라 보존한다.
 *
 * 기존 항목의 `kind` 분류는 **보존**한다. 새로 추가되는 토큰만 파일명으로 kind 를 추정한다
 * (기존 분류에는 `--color-text` 를 font 로 두는 등 손으로 정한 예외가 섞여 있어, 규칙으로
 * 일괄 재생성하면 그 의도가 지워진다).
 *
 * 사용법:
 *   node scripts/ds-manifest-sync.mjs           # 변경 내용을 출력만 (dry-run)
 *   node scripts/ds-manifest-sync.mjs --write   # 실제로 파일에 쓴다
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DS = path.join(WEB_ROOT, 'design-system');
const MANIFEST = path.join(DS, '_ds_manifest.json');
const WRITE = process.argv.includes('--write');

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const changes = [];

// ── 토큰 ────────────────────────────────────────────────────────────────────
const KIND_BY_FILE = {
  'colors.css': 'color', 'colors.light.css': 'color', 'typography.css': 'font',
  'fonts.css': 'font', 'spacing.css': 'spacing', 'radius.css': 'radius',
  'motion.css': 'other', 'materials.css': 'other',
};

/** tokens/*.css 를 훑어 `--x: value` 를 정의 순서대로 모은다. */
function readTokenFiles() {
  const found = new Map();   // name → { value, definedIn }
  const dir = path.join(DS, 'tokens');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.css')).sort()) {
    // 주석 안에도 ':' 와 '--토큰' 이 나와 매칭을 밀어내므로 먼저 걷어낸다.
    const src = readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) {
      const name = m[1];
      const value = m[2].replace(/\s+/g, ' ').trim();
      // 먼저 정의된 파일을 정본으로 본다 (colors.light.css 의 라이트 테마 재정의가
      // 기본 팔레트를 덮어쓰지 않도록).
      if (!found.has(name)) found.set(name, { value, definedIn: `tokens/${f}` });
    }
  }
  return found;
}

const actual = readTokenFiles();
const prevKind = new Map((manifest.tokens || []).map((t) => [t.name, t.kind]));
const prevAnnotation = new Map((manifest.tokens || []).map((t) => [t.name, t.annotation]));
const canon = (v) => String(v).replace(/\s+/g, ' ').replace(/\s*([,()])\s*/g, '$1').trim();

const nextTokens = [];
// 기존 순서를 유지해 diff 를 작게 만든다.
for (const t of manifest.tokens || []) {
  const hit = actual.get(t.name);
  if (!hit) { changes.push(`토큰 제거: ${t.name} (tokens/ 에 정의 없음)`); continue; }
  if (canon(hit.value) !== canon(t.value)) {
    changes.push(`토큰 값: ${t.name}  "${t.value}" → "${hit.value}"`);
  }
  if (hit.definedIn !== t.definedIn) {
    changes.push(`토큰 위치: ${t.name}  ${t.definedIn} → ${hit.definedIn}`);
  }
  const entry = { name: t.name, value: hit.value, kind: t.kind, definedIn: hit.definedIn };
  if (prevAnnotation.get(t.name)) entry.annotation = prevAnnotation.get(t.name);
  nextTokens.push(entry);
}
// 새 토큰은 뒤에 붙인다.
for (const [name, { value, definedIn }] of actual) {
  if (prevKind.has(name)) continue;
  const kind = KIND_BY_FILE[path.basename(definedIn)] || 'other';
  const entry = { name, value, kind, definedIn };
  if (kind === 'other') entry.annotation = 'other';
  nextTokens.push(entry);
  changes.push(`토큰 추가: ${name} = "${value}" (${kind})`);
}
manifest.tokens = nextTokens;

// ── 브랜드 폰트 ─────────────────────────────────────────────────────────────
const family = (actual.get('--font-family-base')?.value || '')
  .split(',')[0].trim().replace(/^['"]|['"]$/g, '');
if (family) {
  const prev = manifest.brandFonts?.[0]?.family;
  if (prev !== family) changes.push(`브랜드 폰트: "${prev}" → "${family}"`);
  manifest.brandFonts = [{
    family, status: 'ok', tokens: ['--font-family-base'], path: 'tokens/typography.css',
  }];
}

// ── 컴포넌트 목록 ───────────────────────────────────────────────────────────
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const n of readdirSync(dir)) {
    const full = path.join(dir, n);
    if (statSync(full).isDirectory()) walk(full, acc);
    // iCloud 동기화가 만든 중복본(" 2.jsx")은 색인에 넣지 않는다.
    else if (full.endsWith('.jsx') && !/ \d\.jsx$/.test(full)) acc.push(full);
  }
  return acc;
}
const actualComponents = walk(path.join(DS, 'components'))
  .map((f) => path.relative(DS, f).split(path.sep).join('/'));
const listedPaths = new Set((manifest.components || []).map((c) => c.sourcePath));

const nextComponents = (manifest.components || []).filter((c) => {
  if (actualComponents.includes(c.sourcePath)) return true;
  changes.push(`컴포넌트 제거: ${c.name} (${c.sourcePath} 없음)`);
  return false;
});
for (const p of actualComponents) {
  if (listedPaths.has(p)) continue;
  const name = path.basename(p, '.jsx');
  nextComponents.push({ name, sourcePath: p });
  changes.push(`컴포넌트 추가: ${name} (${p})`);
}
manifest.components = nextComponents;

// ── globalCssPaths ──────────────────────────────────────────────────────────
const globals = path.join(WEB_ROOT, 'src/app/globals.css');
if (existsSync(globals)) {
  const imported = [...readFileSync(globals, 'utf8')
    .matchAll(/@import\s+["']\.\.\/\.\.\/design-system\/([^"']+)["']/g)].map((m) => m[1]);
  // globals.css 가 import 하지 않는 styles.css 등 기존 등록분은 보존하고, 빠진 것만 채운다.
  const next = [...(manifest.globalCssPaths || [])];
  for (const i of imported) {
    if (!next.includes(i)) {
      // 토큰 CSS 는 styles.css 앞에 와야 변수가 먼저 정의된다.
      const at = next.indexOf('styles.css');
      if (at >= 0) {
        next.splice(at, 0, i);
      } else {
        next.push(i);
      }
      changes.push(`globalCssPaths 추가: ${i}`);
    }
  }
  manifest.globalCssPaths = next;
}

// ── 출력 ────────────────────────────────────────────────────────────────────
if (!changes.length) {
  console.log('manifest 가 이미 최신입니다.');
  process.exit(0);
}
console.log(`\n변경 ${changes.length}건:\n`);
for (const c of changes) console.log(`  · ${c}`);
if (WRITE) {
  writeFileSync(MANIFEST, JSON.stringify(manifest) + '\n');
  console.log(`\n→ ${path.relative(WEB_ROOT, MANIFEST)} 갱신 완료\n`);
} else {
  console.log('\n(dry-run — 실제로 쓰려면 --write)\n');
}
