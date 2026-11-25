#!/usr/bin/env node
// CSS 변수(토큰) 사용 스캐너. 읽기 전용이며 어떤 파일도 고치지 않는다.
//   node scripts/token-usage.mjs [--root <jam-web 경로>] [--json]
// 분류: used(실행 코드) / test-only(시험·스토리만) / unused / needs-review(동적 조합 의심)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.mdx']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'storybook-static']);

// @theme 네임스페이스 → 그 변수를 쓰는 Tailwind 유틸리티 접두. null이면 아무 접두나 인정한다.
const THEME_UTILITIES = {
  color: [
    'bg', 'text', 'border', 'border-x', 'border-y', 'border-t', 'border-b', 'border-l', 'border-r',
    'ring', 'ring-offset', 'fill', 'stroke', 'from', 'via', 'to', 'outline', 'divide', 'placeholder',
    'accent', 'caret', 'decoration', 'shadow', 'inset-shadow', 'drop-shadow',
  ],
  text: ['text'],
  font: ['font'],
  'font-weight': ['font'],
  leading: ['leading'],
  tracking: ['tracking'],
  radius: [
    'rounded', 'rounded-t', 'rounded-b', 'rounded-l', 'rounded-r', 'rounded-tl', 'rounded-tr',
    'rounded-bl', 'rounded-br', 'rounded-s', 'rounded-e',
  ],
  shadow: ['shadow'],
  spacing: null,
  ease: ['ease'],
  animate: ['animate'],
  blur: ['blur', 'backdrop-blur'],
};

function parseArgs(argv) {
  const args = { root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--root') args.root = path.resolve(argv[++i] ?? '.');
  }
  return args;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (CODE_EXT.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const rel = (root, f) => path.relative(root, f).split(path.sep).join('/');
const isTestOrStory = (r) =>
  /(^|\/)__tests__\//.test(r) || /\.(test|spec|stories)\.[a-z]+$/.test(r) || r.startsWith('.storybook/');

function isDefinitionFile(r) {
  return (
    (r.startsWith('design-system/tokens/') && r.endsWith('.css')) ||
    r === 'design-system/styles.css' ||
    (r.startsWith('src/') && r.endsWith('.css'))
  );
}

// CSS 본문에서 `--이름: 값;` 정의를 뽑는다. @theme 블록 안인지도 함께 기록한다.
function collectDefinitions(css) {
  const defs = [];
  const stack = []; // 각 `{`가 @theme 블록인지
  const re = /(@theme[^{]*\{)|(\{)|(\})|(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]*)(;|(?=\}))/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1]) stack.push(true);
    else if (m[2]) stack.push(false);
    else if (m[3]) stack.pop();
    else defs.push({ name: m[4], value: m[5], theme: stack.includes(true), index: m.index, length: m[0].length });
  }
  return defs;
}

function themeUtilityRegex(name) {
  const m = /^--([a-z]+(?:-weight)?)-(.+)$/.exec(name);
  if (!m || !(m[1] in THEME_UTILITIES)) return null;
  const prefixes = THEME_UTILITIES[m[1]];
  const rest = m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const head = prefixes ? `(?:${prefixes.join('|')})` : '[a-z]+(?:-[a-z]+)*';
  return new RegExp(`(?<![\\w-])-?${head}-${rest}(?![\\w-])`);
}

function utilityNames(name) {
  const m = /^--([a-z]+(?:-weight)?)-(.+)$/.exec(name);
  if (!m || !(m[1] in THEME_UTILITIES)) return [];
  const prefixes = THEME_UTILITIES[m[1]] ?? [''];
  return prefixes.map((p) => (p ? `${p}-${m[2]}` : m[2]));
}

export function scan(root) {
  const files = ['src', 'design-system', '.storybook'].flatMap((d) => walk(path.join(root, d)));
  const defs = []; // {name, file, theme, value}
  const runtimeText = [];
  const testText = [];
  const dynamicPrefixes = new Set();

  for (const file of files) {
    const r = rel(root, file);
    let text = fs.readFileSync(file, 'utf8');
    if (isDefinitionFile(r) && file.endsWith('.css')) {
      const found = collectDefinitions(text);
      for (const d of found) defs.push({ name: d.name, file: r, theme: d.theme, value: d.value });
      // 정의 자리는 사용에서 뺀다(뒤에서부터 잘라 인덱스를 유지한다)
      for (const d of [...found].reverse()) {
        const head = d.name.length;
        text = text.slice(0, d.index) + ' '.repeat(head) + text.slice(d.index + head);
        // 값 안의 var() 참조는 그래프 간선으로 처리하므로 사용 텍스트에서도 뺀다
        text = text.slice(0, d.index + head) + ' '.repeat(d.length - head) + text.slice(d.index + d.length);
      }
    }
    (isTestOrStory(r) ? testText : runtimeText).push(text);
    if (!isTestOrStory(r)) {
      for (const m of text.matchAll(/([A-Za-z][\w-]*-)\$\{/g)) dynamicPrefixes.add(m[1]);
      for (const m of text.matchAll(/(--[\w-]*-)\$\{/g)) dynamicPrefixes.add(m[1]);
    }
  }
  const runtime = runtimeText.join('\n');
  const tests = testText.join('\n');

  const names = [...new Set(defs.map((d) => d.name))];
  const themeNames = new Set(defs.filter((d) => d.theme).map((d) => d.name));
  const directUse = (text, name) => {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`${esc}(?![\\w-])`).test(text)) return true;
    if (themeNames.has(name)) {
      const re = themeUtilityRegex(name);
      if (re && re.test(text)) return true;
    }
    return false;
  };

  const direct = new Map(names.map((n) => [n, { runtime: directUse(runtime, n), test: directUse(tests, n) }]));

  // 값에서 참조하는 변수: 참조하는 쪽이 살아 있을 때만 산 것
  const refs = new Map(names.map((n) => [n, new Set()]));
  for (const d of defs) {
    for (const m of d.value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
      if (m[1] !== d.name) refs.get(d.name).add(m[1]);
    }
  }
  const propagate = (seed) => {
    const alive = new Set(seed);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of [...alive]) {
        for (const t of refs.get(n) ?? []) {
          if (refs.has(t) && !alive.has(t)) {
            alive.add(t);
            changed = true;
          }
        }
      }
    }
    return alive;
  };
  const runtimeAlive = propagate(names.filter((n) => direct.get(n).runtime));
  const testAlive = propagate(names.filter((n) => direct.get(n).test));

  const prefixes = [...dynamicPrefixes];
  const suspicious = (n) =>
    prefixes.some((p) => (p.startsWith('--') ? n.startsWith(p) : utilityNames(n).some((u) => u.startsWith(p))));

  const classOf = new Map();
  for (const n of names) {
    if (runtimeAlive.has(n)) classOf.set(n, 'used');
    else if (testAlive.has(n)) classOf.set(n, 'test-only');
    else if (suspicious(n)) classOf.set(n, 'needs-review');
    else classOf.set(n, 'unused');
  }

  const byFile = {};
  for (const d of defs) {
    const f = (byFile[d.file] ??= { total: 0, used: 0, 'test-only': 0, unused: 0, 'needs-review': 0, names: { 'test-only': [], unused: [], 'needs-review': [] } });
    const c = classOf.get(d.name);
    f.total++;
    f[c]++;
    if (c !== 'used') f.names[c].push(d.name);
  }
  const totals = { total: 0, used: 0, 'test-only': 0, unused: 0, 'needs-review': 0 };
  for (const f of Object.values(byFile)) for (const k of Object.keys(totals)) totals[k] += f[k];
  return { files: byFile, totals, uniqueNames: names.length };
}

function render(result) {
  const lines = ['정의 파일 | 정의 수 | used | test-only | unused | needs-review'];
  const row = (label, f) => `${label} | ${f.total} | ${f.used} | ${f['test-only']} | ${f.unused} | ${f['needs-review']}`;
  for (const [file, f] of Object.entries(result.files).sort()) lines.push(row(file, f));
  lines.push(row('합계', result.totals));
  lines.push('', `고유 변수 이름: ${result.uniqueNames}개`);
  for (const [file, f] of Object.entries(result.files).sort()) {
    for (const c of ['unused', 'test-only', 'needs-review']) {
      if (f.names[c].length) lines.push('', `[${c}] ${file} (${f.names[c].length})`, `  ${f.names[c].join('\n  ')}`);
    }
  }
  return lines.join('\n');
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const args = parseArgs(process.argv.slice(2));
  const result = scan(args.root);
  console.log(args.json ? JSON.stringify(result, null, 2) : render(result));
}
