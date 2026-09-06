/**
 * 앰비언트 드랍 예약 배포 시각(KST) 판정 · 상호 배제 창 유닛 테스트
 * 배포 시각은 어드민 설정값(schedule_hour_kst, KST 정시)이다 — 티켓 20260906_1206
 */
import {
  isAmbientDropScheduledHour,
  isValidScheduleHourKst,
  isWithinAmbientDropExclusionWindow,
  formatAmbientDropScheduleTime,
} from '../schedule'
import { kstDateString, kstHour } from '@/lib/notifications/kst'

/** 인자는 UTC 기준 시각 (2026-08-26) */
function utc(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 7, 26, hour, minute, 0))
}

// 기본 시나리오: 배포 시각 KST 03:00 = UTC 18:00 (마이그레이션 137 default, 구 고정 스케줄과 동일)
const KST_3 = 3

// 공용 KST 헬퍼(@/lib/notifications/kst)를 그대로 쓴다 — 예약 배포 판정이 이 변환에 의존하므로
// 이 스위트에서도 경계값을 함께 고정해둔다(오프셋이 어긋나면 배포 시각이 통째로 밀린다).
describe('KST 변환 경계 — 예약 배포 판정의 전제', () => {
  it('UTC 18:00은 KST 03:00(다음날)', () => {
    expect(kstHour(utc(18, 0))).toBe(3)
    expect(kstDateString(utc(18, 0))).toBe('2026-08-27')
  })

  it('UTC 00:00은 KST 09:00(같은 날)', () => {
    expect(kstHour(utc(0, 0))).toBe(9)
    expect(kstDateString(utc(0, 0))).toBe('2026-08-26')
  })

  it('UTC 14:59는 KST 23:59 — 날짜가 아직 넘어가지 않는다', () => {
    expect(kstHour(utc(14, 59))).toBe(23)
    expect(kstDateString(utc(14, 59))).toBe('2026-08-26')
  })

  it('UTC 15:00은 KST 00:00 — 이 순간 KST 날짜가 넘어간다', () => {
    expect(kstHour(utc(15, 0))).toBe(0)
    expect(kstDateString(utc(15, 0))).toBe('2026-08-27')
  })
})

describe('isAmbientDropScheduledHour — 매시 cron의 배치 여부 판정', () => {
  it('설정 시각(KST 03:00)의 정각·중간 분 모두 그 시각으로 본다', () => {
    expect(isAmbientDropScheduledHour(utc(18, 0), KST_3)).toBe(true)
    expect(isAmbientDropScheduledHour(utc(18, 59), KST_3)).toBe(true)
  })

  it('앞뒤 시각은 배치하지 않는다', () => {
    expect(isAmbientDropScheduledHour(utc(17, 59), KST_3)).toBe(false)
    expect(isAmbientDropScheduledHour(utc(19, 0), KST_3)).toBe(false)
  })

  it('설정 시각을 바꾸면 판정도 따라 바뀐다 — KST 09:00 = UTC 00:00', () => {
    expect(isAmbientDropScheduledHour(utc(0, 0), 9)).toBe(true)
    expect(isAmbientDropScheduledHour(utc(0, 0), KST_3)).toBe(false)
  })

  it('KST 00:00(=UTC 15:00) 설정도 정상 판정된다', () => {
    expect(isAmbientDropScheduledHour(utc(15, 0), 0)).toBe(true)
    expect(isAmbientDropScheduledHour(utc(14, 0), 0)).toBe(false)
  })
})

describe('isWithinAmbientDropExclusionWindow', () => {
  it('배포 시각 정각은 창 안(0분 차이)', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(18, 0), KST_3, 15)).toBe(true)
  })

  it('배포 시각 전후 n분 이내면 창 안', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(17, 50), KST_3, 15)).toBe(true) // -10분
    expect(isWithinAmbientDropExclusionWindow(utc(18, 10), KST_3, 15)).toBe(true) // +10분
  })

  it('경계값(n분 정확히)은 창 안(포함)', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(17, 45), KST_3, 15)).toBe(true)
    expect(isWithinAmbientDropExclusionWindow(utc(18, 15), KST_3, 15)).toBe(true)
  })

  it('n분을 초과하면 창 밖', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(17, 44), KST_3, 15)).toBe(false)
    expect(isWithinAmbientDropExclusionWindow(utc(18, 16), KST_3, 15)).toBe(false)
  })

  it('windowMinutes=0이면 항상 창 밖', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(18, 0), KST_3, 0)).toBe(false)
  })

  it('KST 자정 경계 랩어라운드 — 배포 시각 KST 00:00(=UTC 15:00)의 직전도 창 안', () => {
    // KST 23:50 = UTC 14:50 → KST 00:00과 10분 차이(랩어라운드)
    expect(isWithinAmbientDropExclusionWindow(utc(14, 50), 0, 15)).toBe(true)
    expect(isWithinAmbientDropExclusionWindow(utc(14, 50), 0, 5)).toBe(false)
    // KST 00:10 = UTC 15:10
    expect(isWithinAmbientDropExclusionWindow(utc(15, 10), 0, 15)).toBe(true)
  })

  it('KST 23:00 설정도 자정을 넘겨 랩어라운드한다', () => {
    // KST 23:00 = UTC 14:00 / KST 00:05 = UTC 15:05 → 65분 차이
    expect(isWithinAmbientDropExclusionWindow(utc(15, 5), 23, 70)).toBe(true)
    expect(isWithinAmbientDropExclusionWindow(utc(15, 5), 23, 60)).toBe(false)
  })

  it('완전히 창 밖인 시각은 항상 false (합리적 윈도우 범위에서)', () => {
    expect(isWithinAmbientDropExclusionWindow(utc(12, 0), KST_3, 60)).toBe(false)
  })
})

describe('isValidScheduleHourKst — 어드민 입력 검증', () => {
  it('0~23 정수만 통과한다', () => {
    expect(isValidScheduleHourKst(0)).toBe(true)
    expect(isValidScheduleHourKst(23)).toBe(true)
    expect(isValidScheduleHourKst(-1)).toBe(false)
    expect(isValidScheduleHourKst(24)).toBe(false)
    expect(isValidScheduleHourKst(3.5)).toBe(false)
    expect(isValidScheduleHourKst('3')).toBe(false)
    expect(isValidScheduleHourKst(NaN)).toBe(false)
  })
})

describe('formatAmbientDropScheduleTime — 시간대를 반드시 함께 표기', () => {
  it('두 자리 정시 + KST', () => {
    expect(formatAmbientDropScheduleTime(3)).toBe('03:00 KST')
    expect(formatAmbientDropScheduleTime(18)).toBe('18:00 KST')
  })
})
