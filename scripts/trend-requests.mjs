#!/usr/bin/env node
// trend-requests — 지금 다시 모아야 할 트렌드 주제와 요청문을 만든다 (티켓 20261102_1420).
//
// 배경: 트렌드 수집과 작성(latest.md)은 월요일 05:00 루틴이 Gmail 라벨 «JAM» 메일과 어드민 등록 출처로 하고(2026-11-02 Muse 포기, 같은 날 루틴으로 확정), 대화 세션은 요청받을 때만 한다. 어떤 주제를 지금 다시 모아야 하는지는
// `docs/operations/trendresearch/README.md`의 주제 표(주기, 일)와 각 `latest.md`의 `확인일`로 정해진다. 이 스크립트는
// 그 계산과 요청문 만들기를 한 번에 한다. 저장소를 읽기만 하고 아무것도 쓰지 않는다.
//
// 사용법:
//   node scripts/trend-requests.mjs                 기한이 지난 주제를 오래된 순으로 15개까지, 요청문과 함께 출력
//   node scripts/trend-requests.mjs --limit 5       개수를 바꾼다
//   node scripts/trend-requests.mjs --list          요청문 없이 주제 목록만 보인다
//   node scripts/trend-requests.mjs --today 2026-11-09   오늘 날짜를 정한다(시험용, 기본은 KST 오늘)

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const README = ['docs', 'operations', 'trendresearch', 'README.md']
export const DEFAULT_LIMIT = 15
const GROUPS = ['places', 'sports', 'service', 'culture']
const DAY_MS = 86_400_000

/** README의 주제 표(### places: 처럼 그룹 제목 아래의 표)에서 주기가 숫자인 행만 읽는다. */
export function parseTopics(readmeText) {
  const topics = []
  let group = null
  for (const line of readmeText.split('\n')) {
    if (/^##\s/.test(line)) group = null // 다음 절로 넘어가면 그룹이 끝난다
    const head = line.match(/^###\s+([a-z]+):/)
    if (head) {
      group = GROUPS.includes(head[1]) ? head[1] : null
      continue
    }
    if (!group) continue
    const row = line.match(/^\|\s*`([a-z0-9_-]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\d+)\s*\|\s*$/)
    if (!row) continue
    topics.push({ group, slug: row[1], name: row[2], look: row[3], cycleDays: Number(row[4]) })
  }
  return topics
}

/** latest.md 맨 위의 `확인일: YYYY-MM-DD`를 읽는다. 없으면 null. */
export function parseCheckedDate(latestText) {
  const m = latestText.match(/^[-*\s]*확인일:\s*(\d{4}-\d{2}-\d{2})/m)
  return m ? m[1] : null
}

const toUtcMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`)

/**
 * 기한이 지난 주제를 고른다. 지난 일수 ÷ 주기가 1 이상인 것만, 값이 큰 순서로 limit개.
 * 확인일이 없는 주제(latest.md가 없음)는 가장 오래된 것으로 보고 주기가 짧은 순서로 앞에 둔다.
 */
export function pickDue(topics, checkedByKey, today, limit = DEFAULT_LIMIT) {
  const scored = topics.map((t) => {
    const checked = checkedByKey.get(`${t.group}/${t.slug}`) ?? null
    const ratio = checked === null ? Infinity : (toUtcMs(today) - toUtcMs(checked)) / DAY_MS / t.cycleDays
    return { ...t, checked, ratio }
  })
  return scored
    .filter((t) => t.ratio >= 1)
    .sort((a, b) => (b.ratio === a.ratio ? a.cycleDays - b.cycleDays || a.slug.localeCompare(b.slug) : b.ratio - a.ratio))
    .slice(0, limit)
}

/** 외부 AI에게 붙여 넣을 요청문 한 편. 항목 형식은 README 4절과 같아야 한다. */
export function requestText(topic, today) {
  const since = new Date(toUtcMs(today) - Math.max(topic.cycleDays, 7) * DAY_MS).toISOString().slice(0, 10)
  return `## ${topic.group}/${topic.slug}: ${topic.name}

- 찾을 것: ${topic.look}
- 기간: ${since}부터 ${today}까지 한국에서 새로 나온 것
- 규칙: 한국어 자료를 먼저 찾는다. 항목마다 출처 주소와 발행일을 적는다. 확인하지 못한 것은 추측하지 말고 «확인 못함»이라고 적는다. 개인 연락처와 남의 개인정보는 쓰지 않는다. 사건·인물이 얽힌 소재는 그렇다고 표시한다.
- 개수: 6개 이내. 쓸 만한 것이 없으면 없다고 적는다.
- 형식: 항목마다 아래 일곱 줄.

### 항목 제목 한 줄
- 요지: 확인된 사실을 한두 문장으로
- 발견일: ${today}
- 유효: YYYY-MM-DD까지 (유행의 수명을 보고 정한다)
- 기획 활용: 어떤 주제의 어떤 각도로 쓸 수 있는지 한 줄
- 주의: 이슈 필터에 걸릴 수 있는 점, 상표·사업장 홍보로 보일 위험, 확인이 필요한 점
- 근거: 출처 이름, 주소, 발행일
- 신뢰도: 높음 / 보통 / 낮음`
}

function todayKst() {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)
}

function readChecked(root, topics) {
  const map = new Map()
  for (const t of topics) {
    const file = path.join(root, 'docs', 'operations', 'trendresearch', t.group, t.slug, 'latest.md')
    if (!existsSync(file)) continue
    const date = parseCheckedDate(readFileSync(file, 'utf8'))
    if (date) map.set(`${t.group}/${t.slug}`, date)
  }
  return map
}

export function main(argv, root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), out = console.log) {
  const opt = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const limit = Number(opt('--limit') ?? DEFAULT_LIMIT)
  const today = opt('--today') ?? todayKst()
  if (!Number.isInteger(limit) || limit < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    out('사용법: node scripts/trend-requests.mjs [--limit N] [--list] [--today YYYY-MM-DD]')
    return 1
  }
  const readme = path.join(root, ...README)
  if (!existsSync(readme)) {
    out(`주제 표를 찾지 못했습니다: ${README.join('/')}`)
    return 1
  }
  const topics = parseTopics(readFileSync(readme, 'utf8'))
  const due = pickDue(topics, readChecked(root, topics), today, limit)
  out(`# 트렌드 수집 요청 (${today}, 기한이 지난 주제 ${due.length}개)\n`)
  if (due.length === 0) {
    out('지금 다시 모을 주제가 없습니다.')
    return 0
  }
  for (const t of due) {
    const when = t.checked === null ? '아직 모은 적 없음' : `확인일 ${t.checked}`
    if (argv.includes('--list')) out(`- ${t.group}/${t.slug} (${t.name}, 주기 ${t.cycleDays}일, ${when})`)
    else out(`${requestText(t, today)}\n\n(${when}, 주기 ${t.cycleDays}일)\n`)
  }
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
