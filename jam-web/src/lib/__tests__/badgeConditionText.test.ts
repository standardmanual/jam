/**
 * badgeConditionText.ts 회귀 테스트 — 티켓 20260905_0038 A묶음.
 *
 * 이 파일이 고정하는 것은 문구의 «예쁨»이 아니라 **오표시가 다시 생기지 않는다는 성질**이다.
 * 이전 구현은 아는 키 18개를 `if`로 나열하고 나머지를 「관리자가 직접 발급하는 배지예요」로
 * 떨어뜨려 v5 209종을 잘못 설명했다. 그래서 첫 번째 테스트가 **레지스트리 전 필드 순회**다 —
 * 조건 필드가 새로 늘어도 이 테스트가 먼저 깨진다.
 */
import { describe, it, expect } from 'vitest'
import { formatBadgeConditionText, formatBadgeConditionSpec } from '@/lib/badgeConditionText'
import { CONDITION_FIELDS, type ConditionKey } from '@/lib/badge-engine/conditionRegistry'
import type { BadgeCondition } from '@/types/database'

/** 오표시의 표식 — 조건이 있는 배지에서 이 문구가 나오면 실패다 */
const MANUAL_TEXT = '관리자가 직접 발급하는 배지예요.'

/**
 * **의도적으로 침묵하는 키.** 화면의 다른 영역이 담당하거나(선행 배지 카드 그리드),
 * 문장 전체를 갈아끼우거나(미션 보상), 유저 노출 어휘가 아직 없다(2단 교차 게이트 3종).
 * 이 목록에 키를 추가하려면 **왜 말하지 않는지**를 `USER_PHRASE`에 함께 적어야 한다.
 */
const INTENTIONALLY_SILENT: ConditionKey[] = [
  'activity_type',
  'mission_reward',
  'prerequisite_badge_names',
  'cross_in_axis',
  'cross_between_axis',
  'gate_mission_badge',
]

/** 필드 하나만 든 조건을 만든다 — 타입별로 «말이 되는 최소값» */
function soloCondition(key: ConditionKey): BadgeCondition {
  const field = CONDITION_FIELDS.find((f) => f.key === key)!
  const value = (() => {
    switch (field.input) {
      case 'boolean':
        return true
      case 'pace':
        return 330
      case 'time_range':
        return { start: '05:00', end: '07:00' }
      case 'text_list':
        return ['첫 숨결']
      case 'select':
        return key === 'season' ? 'spring' : 'running'
      case 'text':
        return 'hangang'
      case 'object':
        return key === 'activities_within_hours' ? { hours: 24, count: 3 } : { family_keys: ['walking:K1'] }
      default:
        return key === 'month' ? 8 : 2
    }
  })()
  return { [key]: value } as BadgeCondition
}

describe('레지스트리 전 필드 커버리지 — 「관리자가 직접 발급」으로 떨어지지 않는다', () => {
  const speaking = CONDITION_FIELDS.filter((f) => !INTENTIONALLY_SILENT.includes(f.key))

  it.each(speaking.map((f) => [f.key] as const))('%s 는 단독으로도 조건 문구를 만든다', (key) => {
    const text = formatBadgeConditionText(soloCondition(key), '테스트 배지')
    expect(text).not.toBe(MANUAL_TEXT)
    expect(text).toContain('획득할 수 있어요')
    // 내부 키가 유저 문장에 새어나오지 않는다 (라벨을 못 찾으면 key 원문이 찍힌다)
    expect(text).not.toContain(key)
  })

  it('v5가 도입한 신규 조건 키도 실제 문구를 만든다 (오표시 209종의 원인들)', () => {
    expect(formatBadgeConditionText({ single_distance_km: 100 }, '긴 하루')).toBe(
      '한 번의 거리 100km 이상 조건을 채우면 획득할 수 있어요.'
    )
    expect(formatBadgeConditionText({ personal_record_break: 3 }, '자기 초월')).toBe(
      '개인 기록 갱신 3회 이상 조건을 채우면 획득할 수 있어요.'
    )
    expect(formatBadgeConditionText({ month_over_month_ratio: 1.2 }, '지난달의 나에게')).toBe(
      '전월 대비 1.2배 이상 조건을 채우면 획득할 수 있어요.'
    )
    expect(formatBadgeConditionText({ return_gap_days: 90 }, '겨울잠')).toBe(
      '복귀 전 휴식일 90일 이상 조건을 채우면 획득할 수 있어요.'
    )
  })

  it('personal_record_break_metric은 코드값이 아니라 한국어 라벨로 나온다 (티켓 20260908_2157)', () => {
    expect(
      formatBadgeConditionText(
        { personal_record_break: 1, personal_record_break_metric: 'single_distance_km' },
        '발끝의 한계'
      )
    ).toBe('개인 기록 갱신 1회 이상 · 개인 기록 지표: 한 번의 거리 조건을 채우면 획득할 수 있어요.')
  })
})

describe('「관리자가 직접 발급」·미션 보상은 여전히 맞는 문구다', () => {
  it('조건이 비어 있으면 관리자 수동 발급', () => {
    expect(formatBadgeConditionText(null, '수동 배지')).toBe(MANUAL_TEXT)
    expect(formatBadgeConditionText({}, '수동 배지')).toBe(MANUAL_TEXT)
  })

  it('미션 보상 배지 40종은 미션 문구로 남는다', () => {
    expect(formatBadgeConditionText({ activity_type: 'walking', mission_reward: true }, '누적의 증명')).toBe(
      "'누적의 증명' 미션을 완료하면 받을 수 있는 배지예요."
    )
  })
})

describe('v5 조건문 표기 규칙', () => {
  it('「주」에는 예외 없이 (월~일)이 붙는다', () => {
    expect(formatBadgeConditionText({ weekly_count: 3 }, 'x')).toContain('한 주(월~일)에 3회 이상')
    expect(formatBadgeConditionText({ weekly_streak: 4 }, 'x')).toContain('4주(월~일) 연속')
  })

  it('페이스는 부등호 없이 「보다 빠르게」', () => {
    const text = formatBadgeConditionText({ max_pace_sec_per_km: 330 }, 'x')
    expect(text).toContain('페이스 5:30/km보다 빠르게')
    expect(text).not.toContain('이내')
  })

  it('종목은 조건문에 넣지 않는다 — 배지가 이미 종목에 속한다', () => {
    // 이전 구현은 「자전거 타기으로 누적 30km」라는 조사 오류까지 함께 냈다
    const text = formatBadgeConditionText({ activity_type: 'cycling', distance_km: 30 }, 'x')
    expect(text).toBe('누적 거리 30km 이상 조건을 채우면 획득할 수 있어요.')
  })

  it('요소 순서는 ①기간 ②맥락 ③지표 ④달성 횟수다', () => {
    const text = formatBadgeConditionText(
      { activity_type: 'walking', time_range: { start: '05:00', end: '07:00' }, single_distance_km: 5, repeat_count: 10, weekly_count: 3 },
      'x'
    )
    expect(text).toBe(
      '한 주(월~일)에 3회 이상 · 새벽 시간대(05:00~07:00) · 한 번의 거리 5km 이상 · 위 조건을 10회 달성 조건을 채우면 획득할 수 있어요.'
    )
  })

  it('반복 1회는 말하지 않는다 — 기본 동작을 자기 참조로 되풀이하는 문장이다', () => {
    expect(formatBadgeConditionText({ streak_days: 3, repeat_count: 1 }, 'x')).toBe(
      '3일 연속 활동 조건을 채우면 획득할 수 있어요.'
    )
  })
})

describe('조합 조건', () => {
  it('요일 배열 + total_count는 「요일별 독립 카운터」 한 문구로 합친다', () => {
    expect(
      formatBadgeConditionText({ day_of_week: ['saturday', 'sunday'], total_count: 1, single_distance_km: 10 }, 'x')
    ).toBe('토요일·일요일 각 요일마다 1회 이상 · 한 번의 거리 10km 이상 조건을 채우면 획득할 수 있어요.')
  })

  it('month + monthly_km는 한 문구로 합치고 month를 따로 말하지 않는다', () => {
    expect(formatBadgeConditionText({ month: [6, 7], monthly_km: 80 }, 'x')).toBe(
      '6월·7월 한 달 동안 80km 이상 조건을 채우면 획득할 수 있어요.'
    )
  })

  it('same_activity가 참이면 「서로 다른 활동에서 달성해도 인정」 안내를 붙이지 않는다', () => {
    const text = formatBadgeConditionText(
      { same_activity: true, distance_km: 30, elevation_gain_m: 500, duration_minutes: 60 },
      'x'
    )
    expect(text).toContain('한 번의 활동에서 동시에 채워야 해요')
    expect(text).not.toContain('서로 다른 활동')
  })

  it('per-activity 속성이 2개 이상이면 기존 안내가 그대로 붙는다', () => {
    expect(formatBadgeConditionText({ duration_minutes: 60, elevation_gain_m: 500 }, 'x')).toBe(
      // 같은 자리(지표)에서는 레지스트리 선언 순서를 그대로 따른다
      '누적 고도 500m 이상 · 한 번의 이동시간 60분 이상 조건을 채우면 획득할 수 있어요. (각 조건은 서로 다른 활동에서 달성해도 인정돼요)'
    )
  })
})

describe('jsonb 형태 오류에 페이지가 죽지 않는다', () => {
  it('객체형 필드가 스칼라로 들어와도 나머지 조건은 그대로 그린다', () => {
    // condition_json은 jsonb라 형태 보장이 없다 — 배지 상세는 서버 렌더라 던지면 500이 된다
    const broken = { activities_within_hours: 3, distance_km: 10 } as unknown as BadgeCondition
    expect(formatBadgeConditionText(broken, 'x')).toBe('누적 거리 10km 이상 조건을 채우면 획득할 수 있어요.')
  })

  it('레지스트리가 모르는 키만 있으면 「관리자 발급」이 아니라 준비 중으로 말한다', () => {
    const unknown = { totally_unknown_key: 1 } as unknown as BadgeCondition
    expect(formatBadgeConditionText(unknown, 'x')).toBe('획득 조건 안내를 준비하고 있어요.')
  })
})

/**
 * 조건 표기 줄 — 티켓 20260906_1305.
 *
 * 이 줄이 고정하는 성질은 **자리의 약속**이다: 마지막 숫자는 언제나 「몇 번 달성해야 하는가」다.
 * `formatBadgeConditionText`의 반환값은 한 글자도 바뀌지 않아야 하므로 위 테스트들이 그대로
 * 남아 있는 것 자체가 회귀 방어다.
 */
describe('formatBadgeConditionSpec — 조건 표기 둘째 줄', () => {
  it('요소 순서는 ①기간 ②맥락 ③지표이고, 달성 횟수만 「/ N회」로 맨 끝에 뗀다', () => {
    expect(
      formatBadgeConditionSpec({
        activity_type: 'walking',
        time_range: { start: '05:00', end: '07:00' },
        single_distance_km: 5,
        repeat_count: 10,
        weekly_count: 3,
      })
    ).toBe('한 주(월~일)에 3회 이상 · 새벽 시간대(05:00~07:00) · 한 번의 거리 5km 이상 / 10회')
  })

  it('같은 조건을 문장 쪽은 한 문단으로, 표기 쪽은 명사구로 낸다 — 문장 반환값은 그대로다', () => {
    const condition: BadgeCondition = { activity_type: 'walking', active_days_count: 100 }
    expect(formatBadgeConditionText(condition, '오늘의 한 걸음')).toBe(
      '누적 활동일수 100일 이상 조건을 채우면 획득할 수 있어요.'
    )
    expect(formatBadgeConditionSpec(condition)).toBe('누적 활동일수 100일 이상')
  })

  it('명사구로 끝난다 — 마침표도 「~해요」도 붙이지 않는다', () => {
    const specs = [
      formatBadgeConditionSpec({ distance_km: 30 }),
      formatBadgeConditionSpec({ streak_days: 3, repeat_count: 5 }),
      formatBadgeConditionSpec({ weekly_count: 3, single_distance_km: 5 }),
    ]
    for (const spec of specs) {
      expect(spec).not.toBeNull()
      expect(spec!.endsWith('.')).toBe(false)
      expect(spec).not.toContain('해요')
      expect(spec).not.toContain('획득')
    }
  })

  it('달성 횟수는 1회도 적는다 — 맨 끝 숫자가 달성 횟수라는 약속을 비우지 않는다', () => {
    // 문장 쪽은 1회를 생략한다(군더더기). 표기 쪽은 라이팅 정본과 같이 「/ 1회」를 적는다
    expect(formatBadgeConditionText({ streak_days: 3, repeat_count: 1 }, 'x')).toBe(
      '3일 연속 활동 조건을 채우면 획득할 수 있어요.'
    )
    expect(formatBadgeConditionSpec({ streak_days: 3, repeat_count: 1 })).toBe('3일 연속 활동 / 1회')
  })

  it('repeat_count 키가 없으면 꼬리도 없다 (v5 630종 중 491종)', () => {
    expect(formatBadgeConditionSpec({ activity_type: 'running', distance_km: 30 })).toBe('누적 거리 30km 이상')
  })

  it('null 3케이스 — 이 줄 자체를 그리지 않는다', () => {
    // ① 미션 보상 — 문장이 이미 「'X' 미션을 완료하면」이다
    expect(formatBadgeConditionSpec({ activity_type: 'walking', mission_reward: true })).toBeNull()
    // ② 조건 없음 — 어드민 수동 발급
    expect(formatBadgeConditionSpec(null)).toBeNull()
    expect(formatBadgeConditionSpec(undefined)).toBeNull()
    expect(formatBadgeConditionSpec({})).toBeNull()
    // ③ 레지스트리가 모르는 키만 있음
    expect(formatBadgeConditionSpec({ totally_unknown_key: 1 } as unknown as BadgeCondition)).toBeNull()
  })

  it('침묵하는 키만 남으면 null이다 — 종목만 든 조건은 표기할 것이 없다', () => {
    expect(formatBadgeConditionSpec({ activity_type: 'cycling' })).toBeNull()
  })

  it('안내 문장의 「서로 다른 활동에서 인정」 꼬리는 표기 줄에 붙지 않는다', () => {
    expect(formatBadgeConditionSpec({ duration_minutes: 60, elevation_gain_m: 500 })).toBe(
      '누적 고도 500m 이상 · 한 번의 이동시간 60분 이상'
    )
  })

  it('jsonb 형태가 깨져도 나머지 조건은 그대로 표기한다', () => {
    const broken = { activities_within_hours: 3, distance_km: 10 } as unknown as BadgeCondition
    expect(formatBadgeConditionSpec(broken)).toBe('누적 거리 10km 이상')
  })
})
