// check-routine-reports.mjs 테스트 — 꺼진 루틴은 리포트 누락 점검에서 뺀다 (티켓 20261007_1956)
// 실행: node scripts/check-routine-reports.test.mjs
// 파일시스템에 의존하지 않도록 scheduled-jobs.md 전문과 존재 여부 판정 함수를 주입한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { routineReportWarnings } from './check-routine-reports.mjs'

const section = (heading, status) => `## ${heading}\n\n| 항목 | 내용 |\n| --- | --- |\n| 상태 | ${status} |\n\n`
const md = (weeklyStatus, monthlyStatus) =>
  section('주간 — 화요일 09:00 KST', weeklyStatus) +
  section('월간 — 매월 1일 09:00 KST', monthlyStatus) +
  section('데일리 미팅 — 매주 월·수·금 20:00 KST', '켜짐 (2026-10-14 등록)')

const none = () => false
// KST 벽시계 값을 UTC getter로 읽는 Date (check-routine-reports.mjs의 now 규약)
const kst = (y, m, d, h = 12) => new Date(Date.UTC(y, m - 1, d, h, 0))

// 켜진 루틴: 화요일 09시 이후·매월 2일 이후에 리포트가 없으면 경고가 나온다(기존 동작 유지)
{
  const w = routineReportWarnings(kst(2026, 10, 14), md('켜짐', '켜짐'), none) // 2026-10-14 수요일
  assert.equal(w.length, 2)
  assert.match(w[0], /주간 리포트가 없습니다 — docs\/operations\/reports\/weekly\/2026-W42\.md/)
  assert.match(w[1], /월간 리포트가 없습니다 — docs\/operations\/reports\/monthly\/2026-10\.md/)
}

// 켜진 루틴이라도 리포트가 있으면 경고가 없다
assert.deepEqual(routineReportWarnings(kst(2026, 10, 14), md('켜짐', '켜짐'), () => true), [])

// 꺼진 루틴: 같은 날짜에서 경고가 나오지 않는다
assert.deepEqual(
  routineReportWarnings(kst(2026, 10, 14), md('꺼짐 (2026-10-07 삭제, JAM 2.0 완료 전까지 중단)', '꺼짐 (2026-10-07 삭제, JAM 2.0 완료 전까지 중단)'), none),
  []
)

// 한쪽만 꺼진 경우 켜진 쪽만 경고한다
{
  const w = routineReportWarnings(kst(2026, 10, 14), md('꺼짐 (중단)', '켜짐'), none)
  assert.equal(w.length, 1)
  assert.match(w[0], /월간 리포트/)
}
{
  const w = routineReportWarnings(kst(2026, 10, 14), md('켜짐', '꺼짐 (중단)'), none)
  assert.equal(w.length, 1)
  assert.match(w[0], /주간 리포트/)
}

// 예정 시각 전에는 켜져 있어도 경고가 없다 (월요일, 1일 08시)
assert.deepEqual(routineReportWarnings(kst(2026, 10, 12), md('켜짐', '켜짐'), none).filter((x) => /주간/.test(x)), [])
assert.deepEqual(routineReportWarnings(kst(2026, 10, 1, 8), md('켜짐', '켜짐'), none).filter((x) => /월간/.test(x)), [])

// 문서가 없거나 해당 절이 없으면 조용히 건너뛴다
assert.deepEqual(routineReportWarnings(kst(2026, 10, 14), null, none), [])
assert.deepEqual(routineReportWarnings(kst(2026, 10, 14), '# 빈 문서\n', none), [])

// 실제 scheduled-jobs.md: 주간·월간이 꺼져 있으므로 어느 날짜에도 경고가 없다 (JAM 2.0 완료 전까지)
{
  const actual = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '.claude', 'skills', 'jam-work', 'references', 'scheduled-jobs.md'),
    'utf8'
  )
  for (const now of [kst(2026, 10, 14), kst(2026, 10, 16), kst(2026, 11, 3), kst(2026, 12, 20)]) {
    assert.deepEqual(routineReportWarnings(now, actual, none), [], `${now.toISOString()}에 경고가 없어야 한다`)
  }
}

console.log('check-routine-reports 테스트 통과')
