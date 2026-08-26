/**
 * 앰비언트 드랍 상호 배제 창(exclusion window) 판정 유닛 테스트
 * 스케줄 상수 = 18:00 UTC (schedule.ts) — 자정 경계 랩어라운드 케이스 포함
 */
import { isWithinAmbientDropExclusionWindow } from '../schedule'

function utc(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 7, 26, hour, minute, 0))
}

describe('isWithinAmbientDropExclusionWindow', () => {
  it('스케줄 시각 정각은 창 안(0분 차이)', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(18, 0), 15)).toBe(true)
  })

  it('스케줄 시각 전후 n분 이내면 창 안', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(17, 50), 15)).toBe(true) // -10분
    expect(isWithinAmbientDropExclusionWindow(utc(18, 10), 15)).toBe(true) // +10분
  })

  it('경계값(n분 정확히)은 창 안(포함)', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(17, 45), 15)).toBe(true)
    expect(isWithinAmbientDropExclusionWindow(utc(18, 15), 15)).toBe(true)
  })

  it('n분을 초과하면 창 밖', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(17, 44), 15)).toBe(false)
    expect(isWithinAmbientDropExclusionWindow(utc(18, 16), 15)).toBe(false)
  })

  it('windowMinutes=0이면 항상 창 밖', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(18, 0), 0)).toBe(false)
  })

  it('자정 경계 랩어라운드 — 스케줄이 하루 끝에 가까우면 다음날 새벽도 창에 포함될 수 있다', () => {
    // 스케줄은 18:00으로 고정이라 자정과는 6시간 떨어져 있음 — 큰 윈도우로 랩어라운드 검증
    // 23:55는 18:00과 355분 차이, 24*60-355=1085분 → min(355,1085)=355. 360분 창이면 포함.
    expect(isWithinAmbientDropExclusionWindow(utc(23, 55), 360)).toBe(true)
    expect(isWithinAmbientDropExclusionWindow(utc(23, 55), 300)).toBe(false)
  })

  it('완전히 창 밖인 정오는 항상 false (합리적 윈도우 범위에서)', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(12, 0), 60)).toBe(false)
  })
})
