#!/usr/bin/env node
// 운영 패턴 사전 원고 파서와 시드 SQL 생성기 (티켓 20261007_1633, 상위 20260930_1503 ③).
//
// 원고 `jam-doc/planning/content/OPS_PATTERNS.md`를 읽어 패턴 사전 3테이블(마이그레이션 210)에 넣을 초기 데이터
// `jam-web/supabase/migrations/212_ops_patterns_seed.sql`을 만든다. 이 스크립트는 SQL을 실행하지 않는다.
//
// 사용:
//   node scripts/ops-patterns-seed.mjs            검사 후 212를 쓴다. 검사가 어긋나면 파일을 쓰지 않고 1로 끝난다.
//   node scripts/ops-patterns-seed.mjs --check    파일을 쓰지 않고, 생성 결과가 커밋된 212와 같은지만 본다.
//   --input <원고> --output <SQL>                 경로를 바꾼다(테스트용).
//
// ── 칸 매핑 (원고 → DB), 규칙의 원천은 이 머리 주석이다 ─────────────────────────────────────────────
//   ### P01 이름                     → ops_patterns.pattern_no, name
//   - **작동 원리:** / **유저가 겪는 것:** / **주의점:**   → principle / user_experience / pitfalls (라벨 뒤 글 그대로)
//   - **쓰는 메뉴·옵션:** 「샘플별 구현:」 앞   → menus (괄호 밖 「, 」로 나눈다. 괄호는 그대로 둔다)
//   - **샘플:** 주 … / 보조 장치 … / 걸침 …     → samples [{ no, name, role, impl }] (role: main·aux·related, 원고 순서)
//       impl = 「샘플별 구현」 항목에서 번호(와 앞의 「보조 」)를 뺀 글. 걸침 샘플은 주·보조로 소속된 패턴의 구현 글을 가져온다.
//   - **쓰는 카드 모양:**           → card_shapes [{ shape, note }]. 괄호 밖 「, 」로 나눈 조각마다
//       (가) `shape`(글) → note는 괄호 안 글  (나) `shape`만 → note는 ''  (다) 그 밖의 문장 → 조각 안 백틱 값마다 항목, note는 조각 글.
//       「없음」으로 시작하면 [].
//   - **손잡이:** 조건·장소·시간·보상     → knobs.condition·place·time·reward = { open, closed } (「닫은 값은 」 앞과 뒤)
//                트라이브                → knobs.tribe = { rule, example } (「예시:」 앞과 뒤)
//   - **취향 신호:** 아래 「이름: 이유 (추정)」 → ops_pattern_taste_signals (basis estimate, sort_order는 패턴 안 순서 1부터)
//   ### 공통 취향 신호 아래 「- 이름: 이유 (추정)」 → 같은 테이블, pattern_no NULL
//   ### 공통 규칙 아래 「N. **제목:** 본문」      → ops_pattern_common_rules (rule_no, title, body)
//   - **상태:**                     → 담지 않는다(승인 이력). 상태 칸은 P14만 paused(PAUSED_AT_SEED), 나머지 active, origin은 모두 seed.
//
// ── 멈춤 조건 1~9는 validateOpsPatterns에 있다. 하나라도 걸리면 SQL을 쓰지 않고 어긋난 패턴 번호와 항목을 출력한다. ──

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findSections } from './doc-section.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCE_PATH = 'jam-doc/planning/content/OPS_PATTERNS.md'
export const SEED_PATH = 'jam-web/supabase/migrations/212_ops_patterns_seed.sql'

/** 카드 모양 허용 목록. `jam-web/src/lib/today/shape.ts`의 `CARD_SHAPES`와 같아야 한다(테스트가 비교한다). */
export const CARD_SHAPES = ['hero', 'poster', 'square', 'brief', 'list']
/** 원고가 담아야 하는 개수(티켓 20261007_1633 멈춤 조건 1~4). */
export const EXPECTED = { patterns: 18, samples: 63, tasteSignals: 43, commonRules: 7 }
/** 초기 입력에서 쉬는 중으로 두는 패턴과 이유(PRD §10.1). 나머지는 모두 사용 중이다. */
const PAUSED_AT_SEED = { P14: '필요한 기능 O12·O14 대기' }
const KNOB_KEYS = { 조건: 'condition', 장소: 'place', 시간: 'time', 보상: 'reward', 트라이브: 'tribe' }
const REQUIRED_FIELDS = ['작동 원리', '유저가 겪는 것', '쓰는 메뉴·옵션', '손잡이', '샘플', '주의점', '쓰는 카드 모양', '취향 신호']

/** 괄호 밖의 구분자로만 나눈다. 괄호 안 구분자는 그대로 둔다. */
export function splitTopLevel(text, sep = ', ') {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && text.startsWith(sep, i)) {
      parts.push(text.slice(start, i))
      i += sep.length - 1
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((p) => p.trim()).filter((p) => p !== '')
}

const countOf = (text, needle) => text.split(needle).length - 1
const pad = (n) => `P${String(n).padStart(2, '0')}`
const sortedNums = (list) => [...list].sort((a, b) => a - b)
const sameNums = (a, b) => sortedNums(a).join(',') === sortedNums(b).join(',')

/** `### ` 제목 단위로 자른다. */
function splitBlocks(sectionBody) {
  const blocks = []
  for (const line of sectionBody.split('\n')) {
    if (line.startsWith('### ')) blocks.push({ heading: line.trimEnd(), lines: [] })
    else if (blocks.length > 0) blocks[blocks.length - 1].lines.push(line)
  }
  return blocks
}

/** 「- **라벨:** 값」 줄과 그 아래 들여쓴 「  - 항목」 줄을 모은다. */
function readFields(lines) {
  const fields = []
  for (const line of lines) {
    const f = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/)
    if (f) fields.push({ label: f[1], value: f[2].trim(), subs: [] })
    else {
      const s = line.match(/^ {2}- (.*)$/)
      if (s && fields.length > 0) fields[fields.length - 1].subs.push(s[1].trim())
    }
  }
  return fields
}

function parseSampleGroup(text, problems, pn, groupName) {
  if (text.trim() === '-') return []
  const out = []
  for (const item of text.split(/,\s+(?=\d+ )/)) {
    const m = item.trim().match(/^(\d+) (.+)$/s)
    if (m) out.push({ no: Number(m[1]), name: m[2].trim() })
    else problems.push(`[원고 형식] ${pn} 샘플 줄의 ${groupName} 항목을 읽을 수 없다: 「${item.trim()}」`)
  }
  return out
}

function parseCardShapes(value, problems, pn) {
  if (value.startsWith('없음')) return []
  const shapes = []
  const push = (shape, note) => {
    if (!CARD_SHAPES.includes(shape)) problems.push(`[멈춤 9] ${pn} 카드 모양 「${shape}」은 허용 밖이다(${CARD_SHAPES.join('·')})`)
    shapes.push({ shape, note })
  }
  for (const piece of splitTopLevel(value)) {
    const withNote = piece.match(/^`([^`]+)`\((.*)\)$/s)
    const bare = piece.match(/^`([^`]+)`$/)
    if (withNote) push(withNote[1], withNote[2])
    else if (bare) push(bare[1], '')
    else {
      const found = [...piece.matchAll(/`([^`]+)`/g)].map((m) => m[1])
      if (found.length === 0) problems.push(`[멈춤 9] ${pn} 카드 모양 조각에서 모양 값을 찾지 못했다: 「${piece}」`)
      for (const shape of found) push(shape, piece)
    }
  }
  return shapes
}

function parseKnobs(field, problems, pn) {
  const knobs = {}
  const seen = {}
  for (const sub of field.subs) {
    const m = sub.match(/^(조건|장소|시간|보상|트라이브): ?(.*)$/)
    if (!m) continue
    const [, label, raw] = m
    const text = raw.trim()
    seen[label] = (seen[label] ?? 0) + 1
    if (label === '트라이브') {
      const n = countOf(text, '예시:')
      if (n !== 1) problems.push(`[멈춤 5] ${pn} 손잡이 「트라이브」 줄의 「예시:」가 ${n}번이다(정확히 한 번이어야 한다)`)
      const k = text.indexOf('예시:')
      knobs.tribe = k < 0 ? { rule: text, example: '' } : { rule: text.slice(0, k).trim(), example: text.slice(k + 3).trim() }
    } else {
      const n = countOf(text, '닫은 값')
      const marker = '닫은 값은 '
      const k = text.indexOf(marker)
      if (n !== 1 || k < 0) problems.push(`[멈춤 5] ${pn} 손잡이 「${label}」 줄의 「닫은 값」이 ${n}번이다(「닫은 값은 」 꼴로 정확히 한 번이어야 한다)`)
      knobs[KNOB_KEYS[label]] =
        k < 0 ? { open: text, closed: '' } : { open: text.slice(0, k).trimEnd(), closed: text.slice(k + marker.length) }
    }
  }
  for (const label of Object.keys(KNOB_KEYS)) {
    if (!seen[label]) problems.push(`[멈춤 5] ${pn} 손잡이 「${label}」 줄이 없다`)
    else if (seen[label] > 1) problems.push(`[멈춤 5] ${pn} 손잡이 「${label}」 줄이 ${seen[label]}번 나온다`)
  }
  // 키 순서를 고정한다(같은 원고면 같은 파일이 나와야 한다).
  return Object.fromEntries(Object.values(KNOB_KEYS).filter((k) => knobs[k]).map((k) => [k, knobs[k]]))
}

function parseTasteLine(text, problems, where) {
  const i = text.indexOf(': ')
  if (i < 0) {
    problems.push(`[원고 형식] ${where} 취향 신호 줄에 「: 」가 없다: 「${text}」`)
    return { name: text, reason: '' }
  }
  return { name: text.slice(0, i).trim(), reason: text.slice(i + 2).trim().replace(/ \(추정\)$/, '') }
}

function parsePatternBlock(block, problems) {
  const h = block.heading.match(/^### (P\d+) (.+)$/)
  if (!h) return null
  const [, pn, name] = h
  const fields = readFields(block.lines)
  const get = (label) => fields.find((f) => f.label === label)
  for (const label of REQUIRED_FIELDS) {
    if (!get(label)) problems.push(`[원고 형식] ${pn} 「${label}」 줄이 없다`)
  }
  const value = (label) => get(label)?.value ?? ''

  // 메뉴와 샘플별 구현
  const menuField = value('쓰는 메뉴·옵션')
  const cut = menuField.indexOf('샘플별 구현:')
  if (cut < 0) problems.push(`[멈춤 6] ${pn} 「샘플별 구현:」이 없다`)
  const menus = splitTopLevel(menuField.slice(0, cut < 0 ? undefined : cut).trim().replace(/\.$/, ''))
  const implMap = new Map()
  const implNos = []
  if (cut >= 0) {
    for (const item of splitTopLevel(menuField.slice(cut + '샘플별 구현:'.length))) {
      const m = item.match(/^(?:보조 )?(\d+) (.+)$/s)
      if (!m) {
        problems.push(`[멈춤 6] ${pn} 「샘플별 구현」 항목을 읽을 수 없다: 「${item}」`)
        continue
      }
      implNos.push(Number(m[1]))
      implMap.set(Number(m[1]), m[2].trim())
    }
  }

  // 샘플
  const sampleLine = value('샘플').match(/^주 (.*) \/ 보조 장치 (.*) \/ 걸침 (.*)$/s)
  let samples = []
  if (!sampleLine) problems.push(`[원고 형식] ${pn} 샘플 줄이 「주 … / 보조 장치 … / 걸침 …」 꼴이 아니다`)
  else {
    const groups = [
      ['main', '주', sampleLine[1]],
      ['aux', '보조 장치', sampleLine[2]],
      ['related', '걸침', sampleLine[3]],
    ]
    for (const [role, groupName, text] of groups) {
      for (const s of parseSampleGroup(text, problems, pn, groupName)) {
        samples.push({ no: s.no, name: s.name, role, impl: role === 'related' ? '' : (implMap.get(s.no) ?? '') })
      }
    }
  }

  const signals = []
  const tasteField = get('취향 신호')
  if (tasteField && tasteField.value !== '없음') {
    if (tasteField.value !== '') problems.push(`[원고 형식] ${pn} 「취향 신호」는 「없음」이거나 아래 줄로 적어야 한다`)
    tasteField.subs.forEach((sub, idx) => {
      signals.push({ pattern_no: pn, ...parseTasteLine(sub, problems, pn), basis: 'estimate', sort_order: idx + 1 })
    })
  }

  const pausedReason = PAUSED_AT_SEED[pn]
  const pattern = {
    pattern_no: pn,
    name: name.trim(),
    principle: value('작동 원리'),
    user_experience: value('유저가 겪는 것'),
    menus,
    samples,
    card_shapes: parseCardShapes(value('쓰는 카드 모양'), problems, pn),
    knobs: get('손잡이') ? parseKnobs(get('손잡이'), problems, pn) : {},
    pitfalls: value('주의점'),
    status: pausedReason ? 'paused' : 'active',
    pause_reason: pausedReason ?? null,
    origin: 'seed',
    src: { implNos },
  }
  return { pattern, signals }
}

/** 원고 → { patterns, tasteSignals, commonRules, problems }. 읽기만 하고 어긋남은 problems에 모은다(던지지 않는다). */
export function parseOpsPatterns(markdown) {
  const problems = []
  const patterns = []
  const tasteSignals = []
  const commonRules = []
  const body = findSections(markdown, '## 3. 패턴 본문').sections[0]?.body
  if (!body) {
    problems.push('[원고 형식] 「## 3. 패턴 본문」 절이 없다')
    return { patterns, tasteSignals, commonRules, problems }
  }
  for (const block of splitBlocks(body)) {
    if (block.heading === '### 공통 규칙') {
      for (const line of block.lines) {
        const m = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/)
        if (m) commonRules.push({ rule_no: Number(m[1]), title: m[2].trim().replace(/[:：]$/, ''), body: m[3].trim() })
      }
    } else if (block.heading === '### 공통 취향 신호') {
      const common = block.lines.map((l) => l.match(/^- (.+)$/)).filter(Boolean)
      common.forEach((m, idx) => {
        tasteSignals.push({ pattern_no: null, ...parseTasteLine(m[1].trim(), problems, '공통'), basis: 'estimate', sort_order: idx + 1 })
      })
    } else {
      const parsed = parsePatternBlock(block, problems)
      if (parsed) {
        patterns.push(parsed.pattern)
        tasteSignals.push(...parsed.signals)
      }
    }
  }
  // 걸침 샘플은 소속 패턴의 구현 글을 가져온다.
  const ownerImpl = new Map()
  for (const p of patterns) for (const s of p.samples) if (s.role !== 'related' && !ownerImpl.has(s.no)) ownerImpl.set(s.no, s.impl)
  for (const p of patterns) for (const s of p.samples) if (s.role === 'related') s.impl = ownerImpl.get(s.no) ?? ''
  return { patterns, tasteSignals, commonRules, problems }
}

const tableRows = (body, test) =>
  body
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
    .filter(test)

const numList = (cell) => (cell === '-' ? [] : cell.split(/,\s*/).map(Number))

/** 멈춤 조건 1~9를 점검하고 어긋난 항목 목록을 돌려준다(빈 배열이면 통과). */
export function validateOpsPatterns(parsed, markdown) {
  const out = [...parsed.problems]
  const { patterns, tasteSignals, commonRules } = parsed

  // 1. 패턴 18개, P01~P18 연속
  if (patterns.length !== EXPECTED.patterns) out.push(`[멈춤 1] 패턴이 ${patterns.length}개다(${EXPECTED.patterns}개여야 한다)`)
  const want = Array.from({ length: EXPECTED.patterns }, (_, i) => pad(i + 1))
  const got = patterns.map((p) => p.pattern_no)
  if (got.join() !== want.join()) {
    const missing = want.filter((n) => !got.includes(n))
    const extra = got.filter((n) => !want.includes(n))
    out.push(`[멈춤 1] 패턴 번호가 P01~P18 연속이 아니다(없는 번호: ${missing.join(', ') || '-'}, 더한 번호: ${extra.join(', ') || '-'}, 순서: ${got.join(' ')})`)
  }

  // 2. 주+보조 샘플 63개, 두 패턴에 겹치지 않음
  const owners = new Map()
  for (const p of patterns) for (const s of p.samples) if (s.role !== 'related') owners.set(s.no, [...(owners.get(s.no) ?? []), p.pattern_no])
  const ownedCount = patterns.reduce((n, p) => n + p.samples.filter((s) => s.role !== 'related').length, 0)
  if (ownedCount !== EXPECTED.samples) out.push(`[멈춤 2] 주+보조 샘플이 ${ownedCount}개다(${EXPECTED.samples}개여야 한다)`)
  for (const [no, list] of owners) if (list.length > 1) out.push(`[멈춤 2] 샘플 ${no}이 ${list.join('·')} 두 곳 이상에 소속돼 있다`)

  // 3. 취향 신호 43개(패턴별 + 공통), 같은 (패턴, 이름) 중복 없음
  if (tasteSignals.length !== EXPECTED.tasteSignals) out.push(`[멈춤 3] 취향 신호가 ${tasteSignals.length}개다(${EXPECTED.tasteSignals}개여야 한다)`)
  const seenSignal = new Set()
  for (const t of tasteSignals) {
    const key = `${t.pattern_no ?? ''}\u0000${t.name}`
    if (seenSignal.has(key)) out.push(`[멈춤 3] 취향 신호 (${t.pattern_no ?? '공통'}, ${t.name})이 두 번 나온다`)
    seenSignal.add(key)
  }

  // 4. 공통 규칙 7개, 1~7 연속
  if (commonRules.length !== EXPECTED.commonRules) out.push(`[멈춤 4] 공통 규칙이 ${commonRules.length}개다(${EXPECTED.commonRules}개여야 한다)`)
  if (commonRules.map((r) => r.rule_no).join() !== Array.from({ length: EXPECTED.commonRules }, (_, i) => i + 1).join()) {
    out.push(`[멈춤 4] 공통 규칙 번호가 1~${EXPECTED.commonRules} 연속이 아니다(${commonRules.map((r) => r.rule_no).join(' ')})`)
  }

  // 5(손잡이)와 9(카드 모양)는 읽을 때 problems에 담겼다.

  // 6. 「샘플별 구현」 번호 집합 = 주+보조 번호 집합
  for (const p of patterns) {
    const owned = p.samples.filter((s) => s.role !== 'related').map((s) => s.no)
    const impl = p.src.implNos
    const noImpl = owned.filter((n) => !impl.includes(n))
    const noSample = [...new Set(impl.filter((n) => !owned.includes(n)))]
    const dup = [...new Set(impl.filter((n, i) => impl.indexOf(n) !== i))]
    if (noImpl.length > 0) out.push(`[멈춤 6] ${p.pattern_no} 샘플 ${noImpl.join(', ')}의 「샘플별 구현」이 없다`)
    if (noSample.length > 0) out.push(`[멈춤 6] ${p.pattern_no} 「샘플별 구현」의 ${noSample.join(', ')}은 이 패턴의 주·보조 샘플이 아니다`)
    if (dup.length > 0) out.push(`[멈춤 6] ${p.pattern_no} 「샘플별 구현」에 ${dup.join(', ')}이 두 번 나온다`)
  }

  // 7. 「## 2. 패턴 목록」 표의 주·보조·걸침 번호 = 본문 샘플 줄
  const listBody = findSections(markdown, '## 2. 패턴 목록').sections[0]?.body
  if (!listBody) out.push('[멈춤 7] 「## 2. 패턴 목록」 절이 없다')
  else {
    const rows = tableRows(listBody, (c) => /^P\d+$/.test(c[0] ?? '') && c.length >= 6)
    for (const p of patterns) {
      const row = rows.find((c) => c[0] === p.pattern_no)
      if (!row) {
        out.push(`[멈춤 7] ${p.pattern_no}이 「## 2. 패턴 목록」 표에 없다`)
        continue
      }
      const byRole = (role) => p.samples.filter((s) => s.role === role).map((s) => s.no)
      for (const [label, cell, role] of [['주 샘플', row[3], 'main'], ['보조 장치', row[4], 'aux'], ['걸침', row[5], 'related']]) {
        const inTable = numList(cell)
        if (!sameNums(inTable, byRole(role))) out.push(`[멈춤 7] ${p.pattern_no} ${label}: 표 [${inTable.join(', ')}] ≠ 본문 [${byRole(role).join(', ')}]`)
      }
    }
    for (const row of rows) if (!patterns.some((p) => p.pattern_no === row[0])) out.push(`[멈춤 7] 표의 ${row[0]}은 본문에 없다`)
  }

  // 8. 부록 A 63행의 소속 = 본문, 걸침 번호는 63개 안
  const appendix = findSections(markdown, '## 부록 A').sections[0]?.body
  const bodyOwner = new Map()
  for (const p of patterns) for (const s of p.samples) if (s.role !== 'related' && !bodyOwner.has(s.no)) bodyOwner.set(s.no, `${p.pattern_no}${s.role === 'aux' ? '(장치)' : ''}`)
  if (!appendix) out.push('[멈춤 8] 「## 부록 A」 절이 없다')
  else {
    const rows = tableRows(appendix, (c) => /^\d+$/.test(c[0] ?? '') && c.length >= 3)
    if (rows.length !== EXPECTED.samples) out.push(`[멈춤 8] 부록 A가 ${rows.length}행이다(${EXPECTED.samples}행이어야 한다)`)
    const inAppendix = new Set()
    for (const row of rows) {
      const no = Number(row[0])
      inAppendix.add(no)
      if (bodyOwner.get(no) !== row[2]) out.push(`[멈춤 8] 샘플 ${no}의 소속: 부록 A ${row[2]} ≠ 본문 ${bodyOwner.get(no) ?? '없음'}`)
    }
    for (const no of bodyOwner.keys()) if (!inAppendix.has(no)) out.push(`[멈춤 8] 본문 샘플 ${no}이 부록 A에 없다`)
    for (const p of patterns) {
      const outside = p.samples.filter((s) => s.role === 'related' && !bodyOwner.has(s.no)).map((s) => s.no)
      if (outside.length > 0) out.push(`[멈춤 8] ${p.pattern_no} 걸침 ${outside.join(', ')}은 63개 샘플 밖이다`)
    }
  }

  return out
}

// ── SQL 생성 ─────────────────────────────────────────────────────────────────────────

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const qOrNull = (s) => (s === null ? 'NULL' : q(s))
const jsonb = (v) => `${q(JSON.stringify(v))}::jsonb`
const textArray = (list) => (list.length === 0 ? 'ARRAY[]::text[]' : `ARRAY[${list.map(q).join(', ')}]::text[]`)

/** 검증을 통과한 원고에서 212 시드 SQL을 만든다. 생성 시각을 넣지 않는다(같은 원고면 같은 파일). */
export function toSeedSql({ patterns, tasteSignals, commonRules }) {
  const sampleCount = patterns.reduce((n, p) => n + p.samples.filter((s) => s.role !== 'related').length, 0)
  const commonSignals = tasteSignals.filter((t) => t.pattern_no === null).length
  const nos = patterns.map((p) => p.pattern_no)
  const ruleNos = commonRules.map((r) => r.rule_no)
  const pairs = tasteSignals.map((t) => `(${t.pattern_no === null ? 'NULL::text' : q(t.pattern_no)}, ${q(t.name)})`)
  const pairList = (indent) => pairs.map((x) => `${indent}${x}`).join(',\n')
  const L = []

  L.push(
    '-- 212: 운영 패턴 사전 초기 데이터 — ops_patterns · ops_pattern_taste_signals · ops_pattern_common_rules 시드 (티켓 20261007_1633, 상위 20260930_1503 ③)',
    '--',
    '-- 이 파일은 생성 파일이다. 손으로 고치지 않는다. 원고를 고쳤으면 아래 명령으로 다시 만든다.',
    '--   생성 명령: node scripts/ops-patterns-seed.mjs        (같은 원고인지 확인: node scripts/ops-patterns-seed.mjs --check)',
    `--   원고: ${SOURCE_PATH}`,
    `--   생성 때 개수: 패턴 ${patterns.length} · 샘플 ${sampleCount}(주+보조) · 취향 신호 ${tasteSignals.length}(패턴별 ${tasteSignals.length - commonSignals} + 공통 ${commonSignals}) · 공통 규칙 ${commonRules.length}`,
    '--   칸 매핑 규칙은 scripts/ops-patterns-seed.mjs 머리 주석에 있다.',
    '--',
    '-- ⚠️ 이 파일은 **작성만 하고 실행하지 않았다.** 실행은 카리나가 사용자 승인 뒤에 한다.',
    '--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 들어간다.',
    '--',
    '-- 동작:',
    '--   - 세 INSERT는 모두 ON CONFLICT DO NOTHING이다. 다시 돌려도 사람이 S5에서 고친 행을 덮어쓰지 않는다.',
    '--   - 넣는 순서는 패턴 → 취향 신호(패턴을 가리킨다) → 공통 규칙이다.',
    '--   - COMMIT 앞의 확인 블록이 원고의 패턴 번호·취향 신호 쌍·공통 규칙 번호를 세어 어긋나면 트랜잭션을 되돌린다.',
    '--   - 테이블은 210이 만든다. 210이 적용되지 않았으면 실행하지 않는다.',
    '',
    'BEGIN;',
    '',
    '-- ── ops_patterns ────────────────────────────────────────────────────────',
    'INSERT INTO public.ops_patterns',
    '  (pattern_no, name, principle, user_experience, menus, samples, card_shapes, knobs, pitfalls, status, pause_reason, origin)',
    'VALUES',
  )
  patterns.forEach((p, i) => {
    L.push(
      `  -- ${p.pattern_no} ${p.name}`,
      `  (${[q(p.pattern_no), q(p.name), q(p.principle), q(p.user_experience), textArray(p.menus), jsonb(p.samples), jsonb(p.card_shapes), jsonb(p.knobs), q(p.pitfalls), q(p.status), qOrNull(p.pause_reason), q(p.origin)].join(', ')})${i < patterns.length - 1 ? ',' : ''}`,
    )
  })
  L.push(
    'ON CONFLICT DO NOTHING;',
    '',
    '-- ── ops_pattern_taste_signals ───────────────────────────────────────────',
    'INSERT INTO public.ops_pattern_taste_signals',
    '  (pattern_no, name, reason, basis, sort_order)',
    'VALUES',
  )
  tasteSignals.forEach((t, i) => {
    L.push(`  (${[t.pattern_no === null ? 'NULL' : q(t.pattern_no), q(t.name), q(t.reason), q(t.basis), t.sort_order].join(', ')})${i < tasteSignals.length - 1 ? ',' : ''}`)
  })
  L.push(
    'ON CONFLICT DO NOTHING;',
    '',
    '-- ── ops_pattern_common_rules ────────────────────────────────────────────',
    'INSERT INTO public.ops_pattern_common_rules',
    '  (rule_no, title, body)',
    'VALUES',
  )
  commonRules.forEach((r, i) => {
    L.push(`  (${r.rule_no}, ${q(r.title)}, ${q(r.body)})${i < commonRules.length - 1 ? ',' : ''}`)
  })
  L.push(
    'ON CONFLICT DO NOTHING;',
    '',
    '-- ── 개수 확인: 어긋나면 트랜잭션 전체를 되돌린다 ─────────────────────────────',
    'DO $seed_check$',
    'DECLARE',
    '  v_found INTEGER;',
    'BEGIN',
    `  SELECT count(*) INTO v_found FROM public.ops_patterns WHERE pattern_no IN (${nos.map(q).join(', ')});`,
    `  IF v_found <> ${nos.length} THEN`,
    `    RAISE EXCEPTION '원고의 패턴 번호 ${nos.length}개 중 %개만 있다', v_found;`,
    '  END IF;',
    `  SELECT count(*) INTO v_found FROM public.ops_patterns WHERE pattern_no IN (${nos.map(q).join(', ')}) AND origin = 'seed';`,
    `  IF v_found <> ${nos.length} THEN`,
    `    RAISE EXCEPTION '원고의 패턴 ${nos.length}개 중 origin = seed인 행이 %개다', v_found;`,
    '  END IF;',
    '  SELECT count(*) INTO v_found',
    '    FROM (VALUES',
    pairList('      '),
    '    ) AS v(pattern_no, name)',
    "    JOIN public.ops_pattern_taste_signals t ON COALESCE(t.pattern_no, '') = COALESCE(v.pattern_no, '') AND t.name = v.name;",
    `  IF v_found <> ${pairs.length} THEN`,
    `    RAISE EXCEPTION '원고의 취향 신호 (패턴, 이름) ${pairs.length}쌍 중 %쌍만 있다', v_found;`,
    '  END IF;',
    `  SELECT count(*) INTO v_found FROM public.ops_pattern_common_rules WHERE rule_no IN (${ruleNos.join(', ')});`,
    `  IF v_found <> ${ruleNos.length} THEN`,
    `    RAISE EXCEPTION '원고의 공통 규칙 번호 ${ruleNos.length}개 중 %개만 있다', v_found;`,
    '  END IF;',
    'END',
    '$seed_check$;',
    '',
    'COMMIT;',
    '',
    '-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────',
    '--',
    `-- -- ① 세 테이블 행 수(처음 실행이면 ${patterns.length} · ${tasteSignals.length} · ${commonRules.length}. 이미 있던 행은 건드리지 않으므로 사람이 만든 행이 있으면 더 클 수 있다)`,
    '-- SELECT (SELECT count(*) FROM public.ops_patterns) AS patterns,',
    '--        (SELECT count(*) FROM public.ops_pattern_taste_signals) AS taste_signals,',
    '--        (SELECT count(*) FROM public.ops_pattern_common_rules) AS common_rules;',
    '--',
    '-- -- ② 쉬는 중인 패턴(P14 한 행, pause_reason = 필요한 기능 O12·O14 대기)',
    "-- SELECT pattern_no, status, pause_reason FROM public.ops_patterns WHERE status <> 'active' ORDER BY pattern_no;",
    '--',
    '-- -- ③ 패턴별 샘플 수(주+보조+걸침)',
    '-- SELECT pattern_no, jsonb_array_length(samples) AS samples FROM public.ops_patterns ORDER BY pattern_no;',
    `--    기대값: ${patterns.map((p) => `${p.pattern_no}=${p.samples.length}`).join(' ')}`,
    '',
    '-- 되돌림 SQL',
    '-- 되돌리기 전에 사람이 고친 흔적이 있는지 먼저 센다. 아래 값이 0이 아니면 되돌리는 순간 사람이 고친 내용이 사라진다.',
    '--   SELECT count(*) FROM public.ops_patterns WHERE updated_by IS NOT NULL;',
    '--   SELECT count(*) FROM public.ops_pattern_taste_signals WHERE basis = \'confirmed\';',
    '--   SELECT count(*) FROM public.ops_pattern_common_rules WHERE updated_by IS NOT NULL;',
    '-- 순서는 취향 신호(→ 패턴을 가리킨다) → 패턴 → 공통 규칙이다. 원고의 쌍이 아닌 행과 사람이 고친 행은 지우지 않는다.',
    "-- DELETE FROM public.ops_pattern_taste_signals WHERE basis = 'estimate' AND (COALESCE(pattern_no, ''), name) IN (",
    ...pairs.map((x, i) => `--   ${x.replace('NULL::text', "''")}${i < pairs.length - 1 ? ',' : ''}`),
    '-- );',
    "-- DELETE FROM public.ops_patterns WHERE origin = 'seed' AND updated_by IS NULL;",
    `-- DELETE FROM public.ops_pattern_common_rules WHERE rule_no IN (${ruleNos.join(', ')}) AND updated_by IS NULL;`,
    '',
  )
  return L.join('\n')
}

// ── 실행 ─────────────────────────────────────────────────────────────────────────────

function main(argv) {
  const opt = (name, fallback) => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : fallback
  }
  const input = opt('--input', join(ROOT, SOURCE_PATH))
  const output = opt('--output', join(ROOT, SEED_PATH))
  const check = argv.includes('--check')
  if (!existsSync(input)) {
    console.error(`원고를 읽을 수 없다: ${input}`)
    return 1
  }
  const markdown = readFileSync(input, 'utf8')
  const parsed = parseOpsPatterns(markdown)
  const problems = validateOpsPatterns(parsed, markdown)
  if (problems.length > 0) {
    console.error(`원고가 기대와 어긋나 SQL을 쓰지 않았다(${problems.length}건):`)
    for (const p of problems) console.error(`  ${p}`)
    return 1
  }
  const sql = toSeedSql(parsed)
  const summary = `패턴 ${parsed.patterns.length} · 샘플 ${EXPECTED.samples} · 취향 신호 ${parsed.tasteSignals.length} · 공통 규칙 ${parsed.commonRules.length}`
  if (check) {
    if (!existsSync(output) || readFileSync(output, 'utf8') !== sql) {
      console.error(`생성 결과가 ${output}와 다르다. node scripts/ops-patterns-seed.mjs로 다시 만든다.`)
      return 1
    }
    console.log(`${summary} — 커밋된 파일과 같다`)
    return 0
  }
  writeFileSync(output, sql)
  console.log(`${summary}\n쓴 파일: ${output}`)
  return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2))
