#!/usr/bin/env node
// check-spacing — 서비스 화면 소스에 눈금 밖 간격이 있으면 실패한다 (티켓 20261108_2140, 간격 5회차, 상위 20261108_1926).
//
// 위반으로 세는 것 세 가지다. 문자열 속 클래스를 정규식으로 세고, 주석 안은 세지 않는다(scripts/strip-code-comments.mjs로 지운 본문에서 센다).
//   1. 임의 px 간격: pt-[32px]처럼 간격 접두에 [<숫자>px]를 쓴 것
//   2. 32px 이상 Tailwind 단계: gap-8·pb-10·pt-16처럼 간격 접두에 8 이상 단계를 쓴 것 (w-·h-·size-·inset-·top- 등
//      크기·위치 접두와 -mt-8 같은 음수 마진은 대상이 아니다)
//   3. 인라인 style·CSS의 padding·margin·gap 값이 var(--spacing-32|40|48|64|96)을 참조하는 것
// 같은 줄에 `spacing-allow: <사유>` 주석이 있으면 세지 않는다(사유 필수, 예외 주석은 원래 줄에서 읽는다).
//
// 위반은 예외 없이 실패한다. 줄 단위 예외는 `spacing-allow: <사유>`뿐이다.
//
// 사용법: node scripts/check-spacing.mjs                  검사 (0 = 통과, 1 = 위반 발견)
//         --root <dir>                                     시험용: 검사 루트를 바꾼다
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from './strip-code-comments.mjs'

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

// 한 줄의 위반 개수. 면제 주석이 있으면 0. rawLine은 주석을 지우기 전의 같은 줄이다(면제 주석을 읽는 용도).
export function countLine(line, rawLine = line) {
  if (ALLOW.test(rawLine)) return 0
  let n = 0
  for (const re of [RULE_ARBITRARY, RULE_STEP, RULE_VAR]) n += (line.match(re) ?? []).length
  return n
}

// 파일 내용의 위반: { total, lines: [줄번호...] }. ext는 주석 문법을 고른다('css'면 /* */만, 기본은 ts·tsx).
export function countViolations(text, ext = 'tsx') {
  const lines = []
  let total = 0
  const rawLines = text.split('\n')
  stripComments(text, ext).split('\n').forEach((line, i) => {
    const n = countLine(line, rawLines[i])
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
    const v = countViolations(readFileSync(f, 'utf8'), path.extname(f).slice(1))
    if (v.total > 0) result[path.relative(root, f).split(path.sep).join('/')] = v
  }
  return result
}

// 위반이 있는 파일을 실패 목록으로 바꾼다(기준선 없이 하나라도 있으면 실패).
export function toFailures(current) {
  return Object.keys(current).sort().map((file) => ({ file, now: current[file].total, lines: current[file].lines }))
}

function main() {
  const args = process.argv.slice(2)
  const opt = (name, fallback) => {
    const i = args.indexOf(name)
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback
  }
  const root = path.resolve(opt('--root', path.join(SCRIPT_DIR, '..')))
  const current = scan(root)

  const failures = toFailures(current)

  if (failures.length > 0) {
    console.error('check-spacing: 눈금 밖 간격이 있습니다. 역할 토큰의 클래스(readme 「간격 역할 토큰과 클래스 대응」)를 쓰세요.')
    console.error('  불가피하면 같은 줄에 `spacing-allow: <사유>` 주석을 답니다.')
    for (const f of failures) {
      console.error(`  ${f.file}: ${f.now}건 (줄 ${f.lines.join(', ')})`)
    }
    return 1
  }
  console.log('check-spacing: 통과')
  return 0
}

// 실행 판정은 실제 경로·NFC로 맞춰 비교한다(링크·한글 정규화 차이로 검사 없이 통과하는 것을 막음, 티켓 20261125_2050).
const canon = (p) => { try { return realpathSync(p).normalize('NFC') } catch { return path.resolve(p).normalize('NFC') } }
if (process.argv[1] && canon(process.argv[1]) === canon(fileURLToPath(import.meta.url))) {
  process.exit(main())
}
