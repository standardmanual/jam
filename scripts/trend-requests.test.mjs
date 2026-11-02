// trend-requests 시험 (티켓 20261102_1420)
// 실행: node scripts/trend-requests.test.mjs

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { main, parseCheckedDate, parseTopics, pickDue, requestText } from './trend-requests.mjs'

const README = `# 트렌드 리서치 자료

### places: 등록된 장소 카테고리

| 폴더 | 주제 | 찾을 것 | 주기(일) |
|---|---|---|---|
| \`food\` | 음식점·카페 | 줄 서는 카페 | 7 |
| \`mountain\` | 산 | 계절 산행 명소 | 7 |
| 그 밖의 카테고리 | \`school\` 등 | 사용자가 넣은 자료만 다룬다 | 수시 |

### culture: 문화와 유행

| 폴더 | 주제 | 찾을 것 | 주기(일) |
|---|---|---|---|
| \`memes-slang\` | 밈과 은어 | 유행어 | 7 |
| \`marketing\` | 마케팅 | 마케팅 흐름 | 28 |

## 4. 항목 형식

| \`ignored\` | 표 | 그룹 밖 | 7 |
`

// 1) 주제 표 읽기: 그룹 제목 아래의 숫자 주기 행만, 수시 행과 그룹 밖 행은 뺀다
const topics = parseTopics(README)
assert.deepEqual(
  topics.map((t) => `${t.group}/${t.slug}:${t.cycleDays}`),
  ['places/food:7', 'places/mountain:7', 'culture/memes-slang:7', 'culture/marketing:28'],
)
assert.equal(topics[0].look, '줄 서는 카페')

// 2) 확인일 읽기
assert.equal(parseCheckedDate('# places/food\n\n- 확인일: 2026-11-02\n- 주기: 7일\n'), '2026-11-02')
assert.equal(parseCheckedDate('---\n확인일: 2026-10-27\n---\n'), '2026-10-27')
assert.equal(parseCheckedDate('확인일이 없는 파일'), null)

// 3) 기한 계산: 지난 일수 ÷ 주기가 큰 순서, 아직 안 된 주제는 뺀다, 파일이 없으면 맨 앞
const checked = new Map([
  ['places/food', '2026-11-02'], // 7일 지남 → 1.0
  ['places/mountain', '2026-10-26'], // 14일 → 2.0
  ['culture/memes-slang', '2026-11-08'], // 1일 → 0.14, 제외
  ['culture/marketing', '2026-10-12'], // 28일 → 1.0
])
let due = pickDue(topics, checked, '2026-11-09')
assert.deepEqual(due.map((t) => t.slug), ['mountain', 'food', 'marketing'])
due = pickDue(topics, new Map(), '2026-11-09')
assert.deepEqual(due.map((t) => t.slug), ['food', 'memes-slang', 'mountain', 'marketing'], '확인일이 없으면 주기가 짧은 순서로 앞에 온다')
assert.equal(pickDue(topics, checked, '2026-11-09', 1).length, 1, 'limit을 지킨다')

// 4) 요청문: 기간·형식·규칙이 들어 있다
const text = requestText(topics[0], '2026-11-09')
assert.match(text, /places\/food: 음식점·카페/)
assert.match(text, /2026-11-02부터 2026-11-09까지/)
assert.match(text, /출처 주소와 발행일/)
assert.match(text, /- 근거:/)

// 5) 저장소를 읽는 전체 흐름: 임시 저장소에 README와 latest.md 하나만 두고 실행
const root = mkdtempSync(join(tmpdir(), 'trend-requests-'))
try {
  const put = (rel, body) => {
    const full = join(root, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, body)
  }
  put('docs/operations/trendresearch/README.md', README)
  put('docs/operations/trendresearch/places/food/latest.md', '# places/food\n\n- 확인일: 2026-11-09\n')
  const lines = []
  assert.equal(main(['--list', '--today', '2026-11-09'], root, (s) => lines.push(s)), 0)
  const joined = lines.join('\n')
  assert.match(joined, /기한이 지난 주제 3개/)
  assert.doesNotMatch(joined, /places\/food/, '방금 확인한 주제는 빠진다')
  assert.match(joined, /places\/mountain .*아직 모은 적 없음/)
  assert.equal(main(['--limit', '0'], root, () => {}), 1, '잘못된 인자는 1을 돌려준다')
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('통과: trend-requests')
