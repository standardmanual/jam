/**
 * 어드민 투데이 캘린더뷰(20260902_1028) 날짜 유틸 유닛테스트 (node:assert, 러너 불필요)
 * 실행: npx tsx src/lib/admin/__tests__/today-calendar.test.ts
 */
import assert from 'node:assert'
import {
  todayKstDateString,
  normalizeDateParam,
  kstDayBoundsIso,
  shiftDateStr,
  formatKstDateLabel,
} from '../today-calendar'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

check('todayKstDateString: UTC 15:00(=KST 00:00, 날짜가 넘어간 직후) → 다음 날 날짜', () => {
  assert.equal(todayKstDateString(new Date('2026-07-26T15:00:00Z')), '2026-07-27')
})
check('todayKstDateString: UTC 14:59(=KST 23:59, 날짜 넘어가기 직전) → 그날 날짜', () => {
  assert.equal(todayKstDateString(new Date('2026-07-26T14:59:00Z')), '2026-07-26')
})

check('normalizeDateParam: 유효한 값은 그대로 통과', () => {
  assert.equal(normalizeDateParam('2026-09-02'), '2026-09-02')
})
check('normalizeDateParam: 형식이 잘못되면 오늘 날짜로 대체', () => {
  const now = new Date('2026-07-26T00:00:00Z')
  assert.equal(normalizeDateParam('2026/09/02', now), todayKstDateString(now))
})
check('normalizeDateParam: 값이 없으면 오늘 날짜로 대체', () => {
  const now = new Date('2026-07-26T00:00:00Z')
  assert.equal(normalizeDateParam(undefined, now), todayKstDateString(now))
})
check('normalizeDateParam: 달력상 존재하지 않는 날짜(2026-02-30)는 오버플로우 보정 없이 오늘 날짜로 대체', () => {
  const now = new Date('2026-07-26T00:00:00Z')
  assert.equal(normalizeDateParam('2026-02-30', now), todayKstDateString(now))
})
check('normalizeDateParam: 윤년의 2월 29일(2028-02-29)은 유효한 값으로 통과', () => {
  assert.equal(normalizeDateParam('2028-02-29'), '2028-02-29')
})
check('normalizeDateParam: 평년의 2월 29일(2026-02-29)은 존재하지 않으므로 오늘 날짜로 대체', () => {
  const now = new Date('2026-07-26T00:00:00Z')
  assert.equal(normalizeDateParam('2026-02-29', now), todayKstDateString(now))
})

check('kstDayBoundsIso: 2026-09-02 KST 하루 경계는 UTC 09-01T15:00 ~ 09-02T14:59:59.999', () => {
  const { startIso, endIso } = kstDayBoundsIso('2026-09-02')
  assert.equal(startIso, '2026-09-01T15:00:00.000Z')
  assert.equal(endIso, '2026-09-02T14:59:59.999Z')
})

check('shiftDateStr: 하루 앞으로', () => {
  assert.equal(shiftDateStr('2026-09-02', 1), '2026-09-03')
})
check('shiftDateStr: 하루 뒤로(월 경계)', () => {
  assert.equal(shiftDateStr('2026-09-01', -1), '2026-08-31')
})
check('shiftDateStr: 연 경계', () => {
  assert.equal(shiftDateStr('2026-12-31', 1), '2027-01-01')
})

check('formatKstDateLabel: 2026-09-02는 수요일', () => {
  assert.equal(formatKstDateLabel('2026-09-02'), '2026년 9월 2일 (수)')
})

console.log(`\n${passed} passed`)
