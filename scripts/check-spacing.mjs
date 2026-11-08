#!/usr/bin/env node
// check-spacing — 서비스 화면 소스에 눈금 밖 간격이 새로 들어오면 실패한다 (티켓 20261108_2140, 간격 5회차, 상위 20261108_1926).
//
// 위반으로 세는 것 세 가지다. 문자열 속 클래스를 정규식으로 세고, 주석 줄도 센다(단순하게).
//   1. 임의 px 간격: pt-[32px]처럼 간격 접두에 [<숫자>px]를 쓴 것
//   2. 32px 이상 Tailwind 단계: gap-8·pb-10·pt-16처럼 간격 접두에 8 이상 단계를 쓴 것 (w-·h-·size-·inset-·top- 등
//      크기·위치 접두와 -mt-8 같은 음수 마진은 대상이 아니다)
//   3. 인라인 style·CSS의 padding·margin·gap 값이 var(--spacing-32|40|48|64|96)을 참조하는 것
// 같은 줄에 `spacing-allow: <사유>` 주석이 있으면 세지 않는다(사유 필수).
//
// 남아 있는 위반은 scripts/spacing-baseline.json에 { "경로": 개수 }로 고정한다. 기준선에 없는 파일의 위반이나
// 기준선보다 늘어난 파일은 실패로, 줄어든 파일은 「기준선을 줄이세요」 안내만 낸다(실패 아님).
//
// 사용법: node scripts/check-spacing.mjs                  검사 (0 = 통과, 1 = 위반 발견)
//         node scripts/check-spacing.mjs --write-baseline  현재 개수로 기준선을 다시 쓴다
//         --root <dir> --baseline <file>                   시험용: 검사 루트와 기준선 경로를 바꾼다
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

// 검사 대상 폴더(루트 기준). admin/ 하위는 건너뛴다.
export const TARGET_DIRS = [
  'jam-web/src/app/(main)',
  'jam-web/src/app/(auth)',
  'jam-web/src/app/(onboarding)',
  'jam-web/src/app/(legal)',
  'jam-web/src/components',
]
const EXT = /\.(tsx|ts|css)$/
const SKIP_FILE = /\.(test|stories)\./
const SKIP_DIRS = new Set(['admin', '__tests__', 'dev-sample', 'spike', 'node_modules'])

const PREFIX = '(?:gap-x|gap-y|space-x|space-y|gap|px|py|pt|pb|pl|pr|p|mx|my|mt|mb|ml|mr|m)'
// 1. 임의 px 간격 (음수 마진 포함, scroll-mt처럼 앞에 다른 단어가 붙은 접두는 제외)
const RULE_ARBITRARY = new RegExp(`(?<![\\w-])-?${PREFIX}-\\[\\d+(?:\\.\\d+)?px\\]`, 'g')
// 2. 32px 이상 단계: 8 이상의 정수 단계(8·9·10·11·12·14·16·20·24 …), 음수 마진 제외
const RULE_STEP = new RegExp(`(?<![\\w-])${PREFIX}-(?:[89]|[1-9]\\d)(?![\\w.\\[])`, 'g')
// 3. 인라인 style·CSS의 padding·margin·gap 이 큰 눈금 변수를 참조
const RULE_VAR = /(?:padding|margin|gap)[\w-]*['"]?\s*:[^;},\n]*?var\(--spacing-(?:32|40|48|64|96)\)/gi
const ALLOW = /spacing-allow:\s*(?!\*\/|-->|\}|$)\S/

// 한 줄의 위반 개수. 면제 주석이 있으면 0.
export function countLine(line) {
  if (ALLOW.test(line)) return 0
  let n = 0
  for (const re of [RULE_ARBITRARY, RULE_STEP, RULE_VAR]) n += (line.match(re) ?? []).length
  return n
}

// 파일 내용의 위반: { total, lines: [줄번호...] }
export function countViolations(text) {
  const lines = []
  let total = 0
  text.split('\n').forEach((line, i) => {
    const n = countLine(line)
    if (n > 0) {
      total += n
      lines.push(i + 1)
    }
  })
  return { total, lines }
}

function walk(dir, out) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out)
    } else if (EXT.test(name) && !SKIP_FILE.test(name)) {
      out.push(full)
    }
  }
}

// 루트 아래 대상 파일의 위반을 센다: { "경로": { total, lines } } (위반 있는 파일만)
export function scan(root) {
  const files = []
  for (const d of TARGET_DIRS) walk(path.join(root, d), files)
  const result = {}
  for (const f of files.sort()) {
    const v = countViolations(readFileSync(f, 'utf8'))
    if (v.total > 0) result[path.relative(root, f).split(path.sep).join('/')] = v
  }
  return result
}

// 기준선과 견준다. failures: 늘었거나 새로 생긴 파일, shrunk: 줄었거나 사라진 파일
export function compare(current, baseline) {
  const failures = []
  const shrunk = []
  for (const [file, v] of Object.entries(current)) {
    const base = baseline[file]
    if (base === undefined) failures.push({ file, now: v.total, base: 0, lines: v.lines })
    else if (v.total > base) failures.push({ file, now: v.total, base, lines: v.lines })
    else if (v.total < base) shrunk.push({ file, now: v.total, base })
  }
  for (const [file, base] of Object.entries(baseline)) {
    if (current[file] === undefined) shrunk.push({ file, now: 0, base })
  }
  return { failures, shrunk }
}

function toBaseline(current) {
  const out = {}
  for (const file of Object.keys(current).sort()) out[file] = current[file].total
  return out
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name, fallback) => {
    const i = args.indexOf(name)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
  }
  const root = path.resolve(opt('--root', path.join(SCRIPT_DIR, '..')))
  const baselinePath = path.resolve(opt('--baseline', path.join(SCRIPT_DIR, 'spacing-baseline.json')))
  const current = scan(root)

  if (args.includes('--write-baseline')) {
    const b = toBaseline(current)
    writeFileSync(baselinePath, JSON.stringify(b, null, 2) + '\n')
    const sum = Object.values(b).reduce((a, n) => a + n, 0)
    console.log(`check-spacing: 기준선을 썼습니다 — 파일 ${Object.keys(b).length}개, 위반 ${sum}건 (${path.basename(baselinePath)})`)
    return 0
  }

  let baseline = {}
  if (existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
    } catch (e) {
      console.error(`check-spacing: 기준선이 올바른 JSON이 아닙니다 — ${e.message}`)
      return 1
    }
  }
  const { failures, shrunk } = compare(current, baseline)

  if (shrunk.length > 0) {
    console.log('check-spacing: 위반이 줄었습니다. 기준선을 줄이세요 (node scripts/check-spacing.mjs --write-baseline):')
    for (const s of shrunk) console.log(`  ${s.file}: ${s.base} → ${s.now}`)
  }
  if (failures.length > 0) {
    console.error('check-spacing: 눈금 밖 간격이 늘었습니다. 역할 토큰의 클래스(readme 「간격 역할 토큰과 클래스 대응」)를 쓰세요.')
    console.error('  불가피하면 같은 줄에 `spacing-allow: <사유>` 주석을 답니다.')
    for (const f of failures) {
      console.error(`  ${f.file}: 기준선 ${f.base} → 현재 ${f.now} (줄 ${f.lines.join(', ')})`)
    }
    return 1
  }
  console.log('check-spacing: 통과')
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
