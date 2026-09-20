#!/usr/bin/env node
// 슬롭 검사 — docs/specs/SLOP_DICTIONARY.md의 금칙 단어·금지 문장을
// origin/staging 대비 diff의 추가된 라인에서 찾는다 (티켓 20260918_0951).
//
// 검사 대상: jam-web/**, docs/** (단 docs/tickets/**는 제외 — 티켓 본문은 작업 이력이라
// 검사 대상이 아니다), 그리고 중첩 저장소 jam-doc/의 미푸시 커밋(origin/main 대비 — 세계관·
// 마케팅 문서도 사용자에게 닿는 글이다). 전체 파일이 아니라 diff의 추가 라인만 보는 이유는
// 이미 승인된 기존 텍스트까지 매번 걸리면 게이트가 무의미해지기 때문이다.
//
// "안티 슬롭 구조 원칙"(서론 없는 본론 진입 등)과 "이모지 남발"은 문자열 매칭으로
// 판단할 수 없어 이 스크립트의 대상이 아니다 — 한국어 리뷰·사람 검토가 담당한다.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const DICT_PATH = 'docs/specs/SLOP_DICTIONARY.md'

function extractQuoted(text) {
  return [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/~$/, '').trim())
}

function loadPatterns() {
  const lines = readFileSync(DICT_PATH, 'utf8').split('\n')
  let mode = null
  const patterns = new Set()

  for (const line of lines) {
    if (line.startsWith('## 1.')) {
      mode = 'words'
      continue
    }
    if (line.startsWith('## 2.')) {
      mode = 'sentences'
      continue
    }
    if (line.startsWith('## 3.')) {
      mode = null
      continue
    }
    if (!line.trim().startsWith('|')) continue
    if (/^\|\s*-+\s*\|/.test(line)) continue // 헤더 구분선

    const cols = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, i, arr) => i > 0 && i < arr.length - 1)
    if (cols.length === 0) continue

    if (mode === 'words') {
      if (cols[0] === '금칙') continue // 헤더 행
      extractQuoted(cols[0]).forEach((p) => p && patterns.add(p))
    } else if (mode === 'sentences') {
      if (cols[0] === '유형') continue // 헤더 행
      extractQuoted(cols[1] ?? '').forEach((p) => p && patterns.add(p))
    }
  }
  return [...patterns]
}

function parseAddedLines(diff, prefix = '') {
  const added = []
  let currentFile = null
  let lineNo = 0
  for (const dline of diff.split('\n')) {
    if (dline.startsWith('+++ ')) {
      // 파일 경로에 공백이 있으면 git diff가 뒤에 탭을 붙여 끝을 표시한다.
      const path = dline.slice(6).trimEnd()
      currentFile = path === '/dev/null' ? null : prefix + path
      continue
    }
    if (dline.startsWith('--- ')) continue
    if (dline.startsWith('@@')) {
      const m = dline.match(/\+(\d+)/)
      lineNo = m ? parseInt(m[1], 10) - 1 : 0
      continue
    }
    if (dline.startsWith('+')) {
      lineNo++
      added.push({ file: currentFile, line: lineNo, content: dline.slice(1) })
    } else if (!dline.startsWith('-')) {
      lineNo++
    }
  }
  return added
}

function collectAddedLines() {
  const opts = { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  execSync('git fetch origin staging --quiet', { stdio: 'ignore' })
  // pathspec으로 범위를 좁히면 이동 전 경로가 빠져 이름 변경을 감지하지 못하고, 옮긴 파일 전체가
  // '추가된 줄'로 잡힌다. 전체 diff로 이름 변경을 감지한 뒤 대상 경로는 여기서 거른다.
  const inScope = (f) =>
    f &&
    (f.startsWith('jam-web/') || f.startsWith('docs/') || f.startsWith('jam-doc/')) &&
    !f.startsWith('docs/tickets/') &&
    !f.startsWith('jam-doc/archive/') &&
    !f.startsWith('jam-doc/assets/')
  const added = parseAddedLines(execSync('git diff --find-renames origin/staging...HEAD', opts)).filter((a) =>
    inScope(a.file),
  )
  return added
}

const patterns = loadPatterns()
const addedLines = collectAddedLines()

const findings = []
for (const { file, line, content } of addedLines) {
  for (const p of patterns) {
    if (content.includes(p)) {
      findings.push({ file, line, pattern: p })
    }
  }
}

if (findings.length > 0) {
  console.error(`슬롭 검사 실패: ${findings.length}건`)
  for (const f of findings.slice(0, 20)) {
    console.error(`  ${f.file}:${f.line} — "${f.pattern}"`)
  }
  if (findings.length > 20) console.error(`  ...외 ${findings.length - 20}건`)
  console.error('docs/specs/SLOP_DICTIONARY.md의 대체 표현을 참고해 고치세요.')
  process.exit(1)
}

console.log(`슬롭 검사 통과 (${patterns.length}개 패턴 대조)`)
process.exit(0)
