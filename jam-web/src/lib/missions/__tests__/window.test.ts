/**
 * 미션 기간 경계 — 판정에 넘기는 활동 선택 회귀 테스트 (티켓 20261019_1312)
 *
 * 운영 로직 13.2절 «기간과 순위»: 지정한 기간 안에, 참가한 뒤에 한 활동만 반영한다. 미리 보여 주는 미션에
 * 시작 전에 참가했어도 시작 전 활동은 반영하지 않고, 끝난 뒤의 활동도 반영하지 않는다.
 *
 * 실행: `npx tsx src/lib/missions/__tests__/window.test.ts` (node assert — 러너 불필요)
 */
import assert from 'node:assert'
import { activitiesWithinMissionWindow } from '../window'
import type { NormalizedActivity } from '@/types/strava'

let seq = 0
function act(startDate: string): NormalizedActivity {
  seq += 1
  return {
    stravaId: seq,
    name: `act-${seq}`,
    distanceKm: 10,
    movingTimeSec: 3600,
    elevationGainM: 100,
    jamActivityType: 'running',
    startDate,
    averageSpeedKmh: 10,
    startLatLng: null,
    endLatLng: null,
  }
}

const ids = (list: NormalizedActivity[]) => list.map((a) => a.startDate)

// 미션: 10월 10일 00:00Z 시작, 10월 20일 00:00Z 종료
const STARTS_AT = '2026-10-10T00:00:00.000Z'
const ENDS_AT = '2026-10-20T00:00:00.000Z'

const beforeStart = act('2026-10-08T12:00:00Z') // 시작 전
const duringA = act('2026-10-12T12:00:00Z') // 기간 안
const duringB = act('2026-10-15T12:00:00Z') // 기간 안
const afterEnd = act('2026-10-22T12:00:00Z') // 종료 뒤
const all = [beforeStart, duringA, duringB, afterEnd]

const cases: Array<[string, () => void]> = [
  ['시작 전에 참가한 미션: 시작 전 활동은 빼고 기간 안 활동만 남긴다', () => {
    const joinedAt = '2026-10-05T00:00:00+00:00' // 미리 보여 주는 미션에 시작 전에 참가
    const result = activitiesWithinMissionWindow(all, { joinedAt, startsAt: STARTS_AT, endsAt: ENDS_AT })
    assert.deepStrictEqual(ids(result), [duringA.startDate, duringB.startDate])
  }],

  ['종료 뒤의 활동은 반영하지 않는다', () => {
    const result = activitiesWithinMissionWindow(all, { joinedAt: '2026-10-01T00:00:00Z', startsAt: STARTS_AT, endsAt: ENDS_AT })
    assert.ok(!result.includes(afterEnd), '종료 뒤 활동이 반영됐다')
  }],

  ['시작 뒤에 참가한 미션: 참가 이후 활동만 반영한다', () => {
    const joinedAt = '2026-10-14T00:00:00Z' // 시작(10/10) 뒤, duringA(10/12) 뒤에 참가
    const result = activitiesWithinMissionWindow(all, { joinedAt, startsAt: STARTS_AT, endsAt: ENDS_AT })
    assert.deepStrictEqual(ids(result), [duringB.startDate], '참가 전 활동이 반영됐다')
  }],

  ['참가한 뒤의 기간 안 활동은 모두 포함한다', () => {
    const result = activitiesWithinMissionWindow(all, { joinedAt: '2026-10-10T00:00:00Z', startsAt: STARTS_AT, endsAt: ENDS_AT })
    assert.ok(result.includes(duringA) && result.includes(duringB))
  }],

  ['ends_at이 없는 상시 미션: 종료 상한 없이 참가·시작 뒤 활동을 모두 반영한다', () => {
    const result = activitiesWithinMissionWindow(all, { joinedAt: '2026-10-05T00:00:00Z', startsAt: STARTS_AT, endsAt: null })
    assert.deepStrictEqual(ids(result), [duringA.startDate, duringB.startDate, afterEnd.startDate])
  }],

  ['경계 시각은 포함한다 (하한·상한 모두)', () => {
    const atStart = act('2026-10-10T00:00:00Z')
    const atEnd = act('2026-10-20T00:00:00Z')
    const result = activitiesWithinMissionWindow([atStart, atEnd], { joinedAt: '2026-10-01T00:00:00Z', startsAt: STARTS_AT, endsAt: ENDS_AT })
    assert.deepStrictEqual(ids(result), [atStart.startDate, atEnd.startDate])
  }],

  ['표기가 달라도 같은 시각은 같게 본다 (Z ↔ +00:00, 밀리초)', () => {
    // DB timestamptz는 `+00:00` 표기라 문자열로 비교하면 같은 시각이 어긋난다
    const sameInstant = act('2026-10-12T03:00:00Z')
    const result = activitiesWithinMissionWindow([sameInstant], {
      joinedAt: '2026-10-12T03:00:00.000000+00:00',
      startsAt: '2026-10-10T00:00:00+00:00',
      endsAt: '2026-10-12T03:00:00.000+00:00',
    })
    assert.deepStrictEqual(ids(result), [sameInstant.startDate])
  }],

  ['한국 시각 표기로 받은 시작·종료도 시각으로 비교한다', () => {
    // 2026-10-12T09:00:00+09:00 = 2026-10-12T00:00:00Z
    const before = act('2026-10-11T23:59:59Z')
    const after = act('2026-10-12T00:00:01Z')
    const result = activitiesWithinMissionWindow([before, after], {
      joinedAt: null,
      startsAt: '2026-10-12T09:00:00+09:00',
      endsAt: null,
    })
    assert.deepStrictEqual(ids(result), [after.startDate])
  }],

  ['참가 시각을 모르면 미션 시작을 하한으로 쓴다', () => {
    const result = activitiesWithinMissionWindow(all, { joinedAt: undefined, startsAt: STARTS_AT, endsAt: ENDS_AT })
    assert.deepStrictEqual(ids(result), [duringA.startDate, duringB.startDate])
  }],

  ['입력 배열을 바꾸지 않고 활동이 없으면 빈 배열을 돌려준다', () => {
    const copy = [...all]
    activitiesWithinMissionWindow(all, { joinedAt: STARTS_AT, startsAt: STARTS_AT, endsAt: ENDS_AT })
    assert.deepStrictEqual(all, copy)
    assert.deepStrictEqual(activitiesWithinMissionWindow([], { joinedAt: STARTS_AT, startsAt: STARTS_AT, endsAt: null }), [])
  }],
]

let passed = 0
for (const [name, fn] of cases) {
  fn()
  passed++
  console.info(`  ✓ ${name}`)
}
console.info(`\n[window] ${passed}/${cases.length} passed`)
