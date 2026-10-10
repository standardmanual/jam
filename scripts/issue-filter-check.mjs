#!/usr/bin/env node
// 이슈 소재 자동 제외 필터 — 소재 카드 파일(마크다운 표 또는 JSON 배열)을 읽어
// PRD(`docs/service/prd/content-automation/PRD.md`) §7.3 범주·금지어 기준으로 「필터 판정」·
// 「제외 사유」를 채운다. (티켓 20260923_2255)
//
// 표준 소재 카드 표 헤더(글자 단위로 일치해야 읽는다, `docs/marketing/트렌드_노트.md` 형식):
//   | 제목(관찰) | 범주 | 출처 | 관찰일 | 유효 기간 | 지역 | 트라이브 후보 | 활용 경로 |
//   필터 판정 | 제외 사유 | 상태 | 수명(등록일 기준) |
//
// 판정 규칙 (PRD §7.3):
//   - 뉴스 소스(출처에 "빅카인즈" 포함)는 카테고리·금지어로 기계가 1차 제외한다. 걸리지 않으면 통과.
//   - 밈 소스(메타데이터 없음)는 항상 "사람 스크리닝 필요"로 표시한다 — 이 스크립트는 밈 소스를
//     자동으로 제외하지 않는다(윤진 1차 → 윈터 최종 검수는 사람이 한다).
//   - 이 스크립트는 키워드 일치로만 1차 판정하는 골격이다. 외부 API를 호출하지 않는다.
//
// 사용법:
//   node scripts/issue-filter-check.mjs <소재 카드 파일(.md 또는 .json)> [--dry]
//   --dry 없이 실행하면 판정 결과를 파일에 다시 써넣는다. --dry는 결과만 출력한다.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const CARD_TABLE_HEADER =
  '| 제목(관찰) | 범주 | 출처 | 관찰일 | 유효 기간 | 지역 | 트라이브 후보 | 활용 경로 | 필터 판정 | 제외 사유 | 상태 | 수명(등록일 기준) |'

export const CARD_FIELDS = [
  'title',
  'category',
  'source',
  'observedAt',
  'validPeriod',
  'region',
  'tribeCandidates',
  'usagePath',
  'verdict',
  'reason',
  'status',
  'lifespan',
]

export const NEWS_SOURCE_MARKER = '빅카인즈'

// PRD `docs/service/prd/content-automation/PRD.md` §7.3 표와 글자 단위로 같은 상수.
// 마지막 행(세계관 미배정 소재)은 윤진이 최종 확정하지 못한 소재를 윈터가 추가한 범주다.
export const EXCLUSION_CATEGORIES = [
  {
    id: '정치',
    keywords: ['정치', '선거', '정당', '여당', '야당', '국회'],
    reason: '정치적 논쟁 소재로 자동 제외',
  },
  {
    id: '재난·사고',
    keywords: ['재난', '지진', '태풍', '홍수', '화재', '산불', '참사', '사망 사고'],
    reason: '재난·사고 소재로 자동 제외',
  },
  {
    id: '범죄·사건',
    keywords: ['범죄', '살인', '폭행', '사기', '절도', '강력 사건'],
    reason: '범죄·사건 소재로 자동 제외',
  },
  {
    id: '혐오·비하',
    keywords: ['혐오', '비하', '차별 조롱'],
    reason: '혐오·비하 표현 소재로 자동 제외',
  },
  {
    id: '실존 인물',
    keywords: ['실존 인물'],
    reason: '실존 인물 언급으로 자동 제외',
  },
  {
    id: '저작권 소재',
    keywords: ['저작권', '음원 인용', '캐릭터 인용'],
    reason: '저작권 소재 직접 인용으로 자동 제외',
  },
  {
    id: '논쟁 중인 사회 갈등',
    keywords: ['사회 갈등', '갑론을박 논쟁'],
    reason: '사회 갈등 논쟁 소재로 자동 제외',
  },
  {
    id: '세계관 미배정 소재',
    keywords: [
      '순위 밈',
      '비교형 밈',
      '다이어트 조언',
      '체중 조언',
      '시술 조언',
      '종교 의례',
      '실존 대회',
    ],
    reason: '세계관 미배정 소재로 제외(윈터)',
  },
]

export function isNewsSource(source) {
  return typeof source === 'string' && source.includes(NEWS_SOURCE_MARKER)
}

export function matchExclusionCategory(text) {
  const haystack = text ?? ''
  return EXCLUSION_CATEGORIES.find((c) => c.keywords.some((kw) => haystack.includes(kw))) ?? null
}

// 뉴스 소스만 기계가 판정한다. 밈 소스는 항상 사람 스크리닝 필요로 남긴다(PRD §7.3).
export function judgeCard(card) {
  if (isNewsSource(card.source)) {
    const matched = matchExclusionCategory(`${card.title ?? ''} ${card.category ?? ''}`)
    if (matched) return { verdict: '제외', reason: matched.reason }
    return { verdict: '통과', reason: '' }
  }
  return { verdict: '사람 스크리닝 필요', reason: '' }
}

export function applyJudgments(cards) {
  return cards.map((card) => ({ ...card, ...judgeCard(card) }))
}

export function summarizeJudgments(cards) {
  const summary = { total: cards.length, pass: 0, excluded: 0, screening: 0, byCategory: {} }
  for (const card of cards) {
    if (card.verdict === '제외') {
      summary.excluded++
      summary.byCategory[card.reason] = (summary.byCategory[card.reason] ?? 0) + 1
    } else if (card.verdict === '사람 스크리닝 필요') {
      summary.screening++
    } else if (card.verdict === '통과') {
      summary.pass++
    }
  }
  return summary
}

// 월간 리포트 「제외된 소재」 절 형식 (건수 · 범주별 건수 · 사유, PRD §8-1).
export function formatExcludedSection(cards) {
  const excluded = cards.filter((c) => c.verdict === '제외')
  const summary = summarizeJudgments(cards)
  const lines = []
  lines.push('## 제외된 소재')
  lines.push('')
  lines.push(
    `제외 ${summary.excluded}건 / 전체 ${summary.total}건 (사람 스크리닝 필요 ${summary.screening}건)`
  )
  lines.push('')
  if (excluded.length === 0) {
    lines.push('(이번 회차 제외 없음)')
    return lines.join('\n')
  }
  lines.push('| 사유 | 건수 |')
  lines.push('|---|---|')
  for (const [reason, count] of Object.entries(summary.byCategory)) {
    lines.push(`| ${reason} | ${count} |`)
  }
  lines.push('')
  lines.push('| 제목(관찰) | 범주 | 출처 | 제외 사유 |')
  lines.push('|---|---|---|---|')
  for (const card of excluded) {
    lines.push(`| ${card.title} | ${card.category} | ${card.source} | ${card.reason} |`)
  }
  return lines.join('\n')
}

export function parseMarkdownCards(text) {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex((l) => l.trim() === CARD_TABLE_HEADER)
  if (headerIdx === -1) return null
  const cards = []
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim().startsWith('|')) break
    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < CARD_FIELDS.length) break
    if (cells[0] === '(아직 없음)') continue
    const card = {}
    CARD_FIELDS.forEach((f, idx) => {
      card[f] = cells[idx]
    })
    cards.push(card)
  }
  return cards
}

export function parseJsonCards(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error(`JSON 소재 카드 파일을 읽을 수 없습니다(손상된 JSON): ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!Array.isArray(data)) return null
  return data.map((raw) => {
    const card = {}
    for (const f of CARD_FIELDS) card[f] = raw[f] ?? ''
    return card
  })
}

export function formatMarkdownTable(cards) {
  const lines = [CARD_TABLE_HEADER, `| ${CARD_FIELDS.map(() => '---').join(' | ')} |`]
  if (cards.length === 0) {
    lines.push(`| (아직 없음) | ${CARD_FIELDS.slice(1).map(() => '').join(' | ')} |`)
  } else {
    for (const card of cards) {
      lines.push(`| ${CARD_FIELDS.map((f) => card[f] ?? '').join(' | ')} |`)
    }
  }
  return lines.join('\n')
}

function replaceMarkdownTable(text, newTableText) {
  const lines = text.split('\n')
  const headerIdx = lines.findIndex((l) => l.trim() === CARD_TABLE_HEADER)
  if (headerIdx === -1) throw new Error('표준 소재 카드 표 헤더를 찾지 못했습니다')
  let endIdx = headerIdx + 2
  while (endIdx < lines.length && lines[endIdx].trim().startsWith('|')) endIdx++
  return [...lines.slice(0, headerIdx), ...newTableText.split('\n'), ...lines.slice(endIdx)].join(
    '\n'
  )
}

function parseArgs(argv) {
  const dry = argv.includes('--dry')
  const filePath = argv.find((a) => !a.startsWith('--')) ?? null
  return { filePath, dry }
}

function main() {
  const { filePath, dry } = parseArgs(process.argv.slice(2))
  if (!filePath) {
    console.error('사용법: node scripts/issue-filter-check.mjs <소재 카드 파일(.md 또는 .json)> [--dry]')
    process.exit(1)
  }

  let text
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (err) {
    console.error(`소재 카드 파일을 열 수 없습니다: ${filePath} (${err instanceof Error ? err.message : String(err)})`)
    process.exit(1)
  }
  const isJson = filePath.endsWith('.json')
  let cards
  try {
    cards = isJson ? parseJsonCards(text) : parseMarkdownCards(text)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
  if (cards === null) {
    console.error(`표준 소재 카드 표 헤더를 찾지 못했습니다: ${filePath}`)
    process.exit(1)
  }

  const judged = applyJudgments(cards)
  const summary = summarizeJudgments(judged)
  console.log(
    `총 ${summary.total}건 — 통과 ${summary.pass} · 제외 ${summary.excluded} · 사람 스크리닝 필요 ${summary.screening}`
  )
  console.log('')
  console.log(formatExcludedSection(judged))

  if (!dry) {
    const output = isJson
      ? `${JSON.stringify(judged, null, 2)}\n`
      : replaceMarkdownTable(text, formatMarkdownTable(judged))
    writeFileSync(filePath, output)
    console.log(`\n갱신: ${filePath}`)
  }
}

// 테스트에서 이 모듈을 import할 때는 실행하지 않는다.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
