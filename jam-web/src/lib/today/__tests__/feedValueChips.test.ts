/**
 * 홈피드 DB 값 칩 규칙표와 값 → 문구 변환 (티켓 20261121_0012)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedValueChips.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  buildValueChips,
  checkChipTextLength,
  FEED_CHIP_TEXT_MAX_LENGTH,
  FEED_DIVIDER_ENGLISH,
  FEED_DROP_PICKUP_PHRASES,
  toEnglishDivider,
  FEED_VALUE_CHIP_RULES,
  formatBadgeCriteriaChip,
  formatBadgeLevelChip,
  formatItemCountChip,
  formatMissionConditionChip,
  formatPlaceNameChip,
  formatRemainingChip,
  formatRequiredBadgesChip,
  formatRewardPointsChip,
} from '../feedValueChips'

const NOW = new Date('2026-11-21T03:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const after = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

describe('규칙표', () => {
  it('자원 다섯 가지의 분류 칩 문구가 영어 대문자다(«배지» 없음)', () => {
    expect(Object.fromEntries(Object.entries(FEED_VALUE_CHIP_RULES).map(([k, v]) => [k, v.divider]))).toEqual({
      mission: 'MISSION',
      activity_badge: 'ACTIVITY',
      collection: 'COLLECTION',
      checkin: 'CHECK IN',
      drop_pickup: 'ITEM',
    })
  })

  it('값 칩 우선순위: 미션은 남은 기간 → 보상 포인트 → 조건 값, 드랍·픽업은 없음', () => {
    expect(FEED_VALUE_CHIP_RULES.mission.values).toEqual(['remaining', 'reward-points', 'condition'])
    expect(FEED_VALUE_CHIP_RULES.activity_badge.values).toEqual(['criteria', 'level'])
    expect(FEED_VALUE_CHIP_RULES.collection.values).toEqual(['item-count'])
    expect(FEED_VALUE_CHIP_RULES.checkin.values).toEqual(['required-badges', 'place-name'])
    expect(FEED_VALUE_CHIP_RULES.drop_pickup.values).toEqual([])
    expect(FEED_DROP_PICKUP_PHRASES).toEqual(['DROP', 'PICKUP'])
  })
})

describe('미션 남은 기간', () => {
  it('종료 7일 이내면 «N일 남음»(내림), 정확히 7일도 포함한다', () => {
    expect(formatRemainingChip(after(7 * DAY), NOW)).toBe('7일 남음')
    expect(formatRemainingChip(after(3 * DAY + 5 * HOUR), NOW)).toBe('3일 남음')
    expect(formatRemainingChip(after(2 * DAY), NOW)).toBe('2일 남음')
  })

  it('7일을 1밀리초라도 넘으면 칩이 없다', () => {
    expect(formatRemainingChip(after(7 * DAY + 1), NOW)).toBeNull()
    expect(formatRemainingChip(after(30 * DAY), NOW)).toBeNull()
  })

  it('24시간 이내는 «N시간 남음»(올림, 최소 1시간)이다', () => {
    expect(formatRemainingChip(after(DAY), NOW)).toBe('24시간 남음')
    expect(formatRemainingChip(after(5 * HOUR + 1), NOW)).toBe('6시간 남음')
    expect(formatRemainingChip(after(60 * 1000), NOW)).toBe('1시간 남음')
    // 24시간을 넘으면 «1일 남음»
    expect(formatRemainingChip(after(DAY + 1), NOW)).toBe('1일 남음')
  })

  it('지났거나 지금 끝나는 미션, 상시(종료 없음), 읽을 수 없는 시각은 칩이 없다', () => {
    expect(formatRemainingChip(after(0), NOW)).toBeNull()
    expect(formatRemainingChip(after(-DAY), NOW)).toBeNull()
    expect(formatRemainingChip(null, NOW)).toBeNull()
    expect(formatRemainingChip(undefined, NOW)).toBeNull()
    expect(formatRemainingChip('이건 날짜가 아님', NOW)).toBeNull()
  })

  it('기준 시각은 인자로 받는다(같은 종료 시각도 기준에 따라 다르다)', () => {
    const end = after(5 * DAY)
    expect(formatRemainingChip(end, NOW)).toBe('5일 남음')
    expect(formatRemainingChip(end, new Date(NOW.getTime() + 3 * DAY))).toBe('2일 남음')
    expect(formatRemainingChip(end, new Date(NOW.getTime() + 6 * DAY))).toBeNull()
  })
})

describe('보상 포인트', () => {
  it('«N 포인트»로 쓰고 천 단위 쉼표를 둔다', () => {
    expect(formatRewardPointsChip(500)).toBe('500 포인트')
    expect(formatRewardPointsChip(12000)).toBe('12,000 포인트')
  })

  it('없거나 0이면 칩이 없다', () => {
    expect(formatRewardPointsChip(0)).toBeNull()
    expect(formatRewardPointsChip(null)).toBeNull()
    expect(formatRewardPointsChip(undefined)).toBeNull()
    expect(formatRewardPointsChip(-5)).toBeNull()
    expect(formatRewardPointsChip(Number.NaN)).toBeNull()
  })
})

describe('미션 조건 값', () => {
  it('거리: «걷기 8km», 종목이 없으면 «8km», 소수는 한 자리까지', () => {
    expect(formatMissionConditionChip({ distance_km: 8, activity_type: 'walking' })).toBe('걷기 8km')
    expect(formatMissionConditionChip({ distance_km: 8 })).toBe('8km')
    expect(formatMissionConditionChip({ distance_km: 10.5, activity_type: 'running' })).toBe('달리기 10.5km')
    expect(formatMissionConditionChip({ distance_km: 42.195, activity_type: 'running' })).toBe('달리기 42.2km')
  })

  it('상승고도: «상승고도 400m»', () => {
    expect(formatMissionConditionChip({ elevation_gain_m: 400 })).toBe('상승고도 400m')
    expect(formatMissionConditionChip({ elevation_gain_m: 1200, activity_type: 'hiking' })).toBe('상승고도 1,200m')
  })

  it('횟수·연속 일수·이동 시간', () => {
    expect(formatMissionConditionChip({ count: 5, activity_type: 'running' })).toBe('달리기 5회')
    expect(formatMissionConditionChip({ count: 3 })).toBe('3회')
    expect(formatMissionConditionChip({ streak_days: 7 })).toBe('7일 연속')
    expect(formatMissionConditionChip({ duration_minutes: 60 })).toBe('60분')
  })

  it('여러 칸이 있으면 앞의 것(거리 → 상승고도 → 횟수 → 연속 → 시간)이 이긴다', () => {
    expect(formatMissionConditionChip({ distance_km: 5, elevation_gain_m: 300, count: 3 })).toBe('5km')
    expect(formatMissionConditionChip({ elevation_gain_m: 300, count: 3 })).toBe('상승고도 300m')
    expect(formatMissionConditionChip({ count: 3, streak_days: 7 })).toBe('3회')
  })

  it('값이 없거나 0이면 칩이 없다(체크인 미션처럼 값 없는 조건 포함)', () => {
    expect(formatMissionConditionChip(null)).toBeNull()
    expect(formatMissionConditionChip({})).toBeNull()
    expect(formatMissionConditionChip({ distance_km: 0, activity_type: 'walking' })).toBeNull()
    // 앞 칸이 0이면 뒤 칸이 있어도 다음 칸으로 넘어간다
    expect(formatMissionConditionChip({ distance_km: 0, count: 2 })).toBe('2회')
  })
})

describe('액티비티 배지 달성 기준·레벨', () => {
  it('조건 문구 레지스트리의 칩 중 판정을 만드는 첫 조건을 쓴다', () => {
    expect(formatBadgeCriteriaChip({ total_count: 10 })).toBe('10회')
    expect(formatBadgeCriteriaChip({ streak_days: 14 })).toBe('14일 연속')
    expect(formatBadgeCriteriaChip({ elevation_gain_m: 700 })).toBe('고도 700m')
  })

  it('거르는 조건(단일 활동·장소 지정)만 있으면 칩이 없다', () => {
    expect(formatBadgeCriteriaChip({ same_activity: true })).toBeNull()
    expect(formatBadgeCriteriaChip({})).toBeNull()
    expect(formatBadgeCriteriaChip(null)).toBeNull()
    expect(formatBadgeCriteriaChip(undefined)).toBeNull()
  })

  it('거르는 조건이 판정 조건과 함께 있어도 판정 조건 문구를 쓴다', () => {
    expect(formatBadgeCriteriaChip({ same_activity: true, total_count: 3 })).toBe('3회')
  })

  it('레벨은 «Lv.1», 등급형(NULL)·0·소수·음수는 칩이 없다', () => {
    expect(formatBadgeLevelChip(1)).toBe('Lv.1')
    expect(formatBadgeLevelChip(12)).toBe('Lv.12')
    expect(formatBadgeLevelChip(null)).toBeNull()
    expect(formatBadgeLevelChip(undefined)).toBeNull()
    expect(formatBadgeLevelChip(0)).toBeNull()
    expect(formatBadgeLevelChip(1.5)).toBeNull()
    expect(formatBadgeLevelChip(-1)).toBeNull()
  })
})

describe('컬렉션·체크인', () => {
  it('컬렉션 아이템 수: «아이템 N개», 없거나 0이면 칩이 없다', () => {
    expect(formatItemCountChip(12)).toBe('아이템 12개')
    expect(formatItemCountChip(0)).toBeNull()
    expect(formatItemCountChip(null)).toBeNull()
  })

  it('체크인 필요 배지 수: «배지 N종류», 없거나 0이면 칩이 없다', () => {
    expect(formatRequiredBadgesChip(3)).toBe('배지 3종류')
    expect(formatRequiredBadgesChip(0)).toBeNull()
    expect(formatRequiredBadgesChip(undefined)).toBeNull()
  })

  it('장소 이름: 앞뒤 공백을 떼고, 비어 있으면 칩이 없다', () => {
    expect(formatPlaceNameChip('  문경새재 ')).toBe('문경새재')
    expect(formatPlaceNameChip('   ')).toBeNull()
    expect(formatPlaceNameChip(null)).toBeNull()
  })
})

describe('buildValueChips', () => {
  it('미션: 규칙표 순서(남은 기간 → 포인트 → 조건)로 후보를 낸다', () => {
    expect(
      buildValueChips(
        {
          resource: 'mission',
          endsAt: after(3 * DAY),
          rewardPoints: 500,
          condition: { distance_km: 8, activity_type: 'walking' },
        },
        NOW,
      ),
    ).toEqual(['3일 남음', '500 포인트', '걷기 8km'])
  })

  it('값이 없는 종류는 건너뛴다(기간이 지났고 포인트가 0이면 조건 값만)', () => {
    expect(
      buildValueChips(
        {
          resource: 'mission',
          endsAt: after(-DAY),
          rewardPoints: 0,
          condition: { elevation_gain_m: 400 },
        },
        NOW,
      ),
    ).toEqual(['상승고도 400m'])
    expect(buildValueChips({ resource: 'mission' }, NOW)).toEqual([])
  })

  it('액티비티 배지: 달성 기준 → 레벨', () => {
    expect(buildValueChips({ resource: 'activity_badge', condition: { total_count: 10 }, level: 1 }, NOW)).toEqual([
      '10회',
      'Lv.1',
    ])
    expect(buildValueChips({ resource: 'activity_badge', condition: null, level: null }, NOW)).toEqual([])
  })

  it('컬렉션·체크인', () => {
    expect(buildValueChips({ resource: 'collection', itemCount: 8 }, NOW)).toEqual(['아이템 8개'])
    expect(buildValueChips({ resource: 'collection', itemCount: 0 }, NOW)).toEqual([])
    expect(buildValueChips({ resource: 'checkin', requiredBadgeCount: 3, placeName: '문경새재' }, NOW)).toEqual([
      '배지 3종류',
      '문경새재',
    ])
    expect(buildValueChips({ resource: 'checkin', placeName: '문경새재' }, NOW)).toEqual(['문경새재'])
  })

  it('드랍·픽업은 값 칩이 없다', () => {
    expect(buildValueChips({ resource: 'drop_pickup' }, NOW)).toEqual([])
  })
})

describe('문구 칩 글자 수 경고', () => {
  it('상한은 12자이고, 12자까지는 경고가 없다', () => {
    expect(FEED_CHIP_TEXT_MAX_LENGTH).toBe(12)
    expect(checkChipTextLength('가나다라마바사아자차카타')).toMatchObject({ length: 12, exceeds: false, warning: null })
  })

  it('13자부터는 막지 않고 경고 정보만 돌려준다', () => {
    const check = checkChipTextLength('가나다라마바사아자차카타파')
    expect(check).toMatchObject({ length: 13, max: 12, exceeds: true })
    expect(check.warning).toContain('12자')
    expect(check.warning).toContain('13자')
  })

  it('앞뒤 공백은 세지 않고, 이모지 한 글자는 1로 센다', () => {
    expect(checkChipTextLength('  드랍  ').length).toBe(2)
    expect(checkChipTextLength('🔥🔥').length).toBe(2)
  })

  it('상한을 바꿔 넣을 수 있다', () => {
    expect(checkChipTextLength('가나다', 2)).toMatchObject({ exceeds: true, max: 2 })
  })
})

describe('한글 구분 문구 → 영어 분류 문구', () => {
  it('저장된 한글 문구 일곱 개를 영어 대문자로 바꾼다', () => {
    expect(FEED_DIVIDER_ENGLISH).toEqual({
      미션: 'MISSION',
      '액티비티 배지': 'ACTIVITY',
      '아이템 배지': 'ITEM',
      컬렉션: 'COLLECTION',
      체크인: 'CHECK IN',
      드랍: 'DROP',
      픽업: 'PICKUP',
    })
    expect(toEnglishDivider('아이템 배지')).toBe('ITEM')
  })

  it('표에 없는 문구(값 칩 글자·이미 영어인 문구·표 키와 같은 이름의 내장 속성)는 그대로 둔다', () => {
    expect(toEnglishDivider('2일 남음')).toBe('2일 남음')
    expect(toEnglishDivider('MISSION')).toBe('MISSION')
    expect(toEnglishDivider('constructor')).toBe('constructor')
  })
})
