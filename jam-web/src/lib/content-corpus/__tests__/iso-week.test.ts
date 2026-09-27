/**
 * `isoWeekOrdinal`의 연도 경계 회귀 테스트 (티켓 20260927_2149)
 *
 * 배경: 자동 선택 순환(`pickRotating`)의 키인 `isoWeekOrdinal`은 "같은 ISO 주는 같은 값,
 * 다음 주는 정확히 +1"을 전제로 순환 위치가 튀지 않는다고 문서화돼 있었다. 그런데 이전
 * 구현(`isoYear * 53 + weekNo`)은 직전 해가 ISO 주차 52주로 끝나는 해(대부분의 해)에서
 * 다음 해 1주차로 넘어갈 때 값이 2씩 뛰었다(53 + 1 - 52). 이 파일은 연도 경계 두 종류
 * (직전 해가 53주로 끝나는 경우 / 52주로 끝나는 경우) 모두에서 그 전제가 지켜지는지
 * 검증한다. 형제 티켓 20260927_2150·2151이 `content-corpus.test.ts`를 동시에 고치므로
 * 충돌을 피하려고 별도 파일에 둔다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/content-corpus/__tests__/iso-week.test.ts
 */
import { describe, expect, it } from 'vitest'
import { isoWeekOrdinal } from '../select'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** KST 벽시계 자정(00:00)에 해당하는 UTC Date를 만든다. */
function kstMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d) - KST_OFFSET_MS)
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * DAY_MS)
}

describe('isoWeekOrdinal — 연도 경계', () => {
  it('2026-12-28~2027-01-03(직전 해가 53주로 끝나는 경계)은 모두 같은 값이고 다음 주는 +1이다', () => {
    // date -u -d 확인: 2026-12-28~2027-01-03은 전부 ISO 주차 2026-W53.
    const weekStart = kstMidnight(2026, 12, 28)
    const ordinals = Array.from({ length: 7 }, (_, i) => isoWeekOrdinal(addDays(weekStart, i)))
    expect(new Set(ordinals).size).toBe(1)

    // 2027-01-04(월)은 ISO 주차 2027-W01 — 정확히 다음 주.
    const nextWeekMonday = isoWeekOrdinal(kstMidnight(2027, 1, 4))
    expect(nextWeekMonday).toBe(ordinals[0] + 1)
  })

  it('2027-12-27~2028-01-02(직전 해가 52주로 끝나는 경계)은 모두 같은 값이고 다음 주는 +1이다', () => {
    // date -u -d 확인: 2027-12-27~2028-01-02는 전부 ISO 주차 2027-W52.
    const weekStart = kstMidnight(2027, 12, 27)
    const ordinals = Array.from({ length: 7 }, (_, i) => isoWeekOrdinal(addDays(weekStart, i)))
    expect(new Set(ordinals).size).toBe(1)

    // 2028-01-03(월)은 ISO 주차 2028-W01 — 정확히 다음 주.
    const nextWeekMonday = isoWeekOrdinal(kstMidnight(2028, 1, 3))
    expect(nextWeekMonday).toBe(ordinals[0] + 1)
  })
})
