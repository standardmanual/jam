/**
 * contentGaps.ts — 컨텐츠 공백 경고 판정·문구 순수 함수 유닛테스트(티켓 20260924_0912)
 *
 * 지키는 것:
 * 1. 공개 미션 정의 — 게이트 축·노출 조건이 있으면 공개 미션이 아니다
 * 2. 미션 공백 — 상시 입문 미션 0건, 60일 안 날짜 공백, 종료 14일 경계, 후속 인정 범위, KST 자정 경계
 * 3. 카드 편성 공백 — 다음 주는 금요일부터, 이번 주는 오늘부터, 비활성·장기 카드만 있는 날은 미편성
 * 4. 문구 — 정상이면 문구가 없고, 문제면 날짜·제목이 들어간다
 */
import { describe, it, expect } from 'vitest'
import {
  isPublicMission,
  checkMissionGaps,
  checkCardGaps,
  missionGapMessages,
  cardGapMessage,
  MISSION_GAP_HORIZON_DAYS,
  type ContentGapMissionInput,
} from '../contentGaps'
import type { WeeklyCardInput } from '../weeklyCards'

/** 2026-09-24(목) 10:00 KST */
const THU = new Date('2026-09-24T10:00:00+09:00')

let seq = 0
function mission(over: Partial<ContentGapMissionInput> = {}): ContentGapMissionInput {
  seq += 1
  return {
    id: `m${seq}`,
    title: `미션${seq}`,
    starts_at: '2026-09-01T00:00:00+09:00',
    ends_at: null,
    gate_axis: null,
    visibility_rule_json: null,
    ...over,
  }
}

/** 60일 전체를 덮는 상시 공개 미션 */
const evergreen = () => mission({ id: 'evergreen', title: '상시 입문' })

function card(over: Partial<WeeklyCardInput> = {}): WeeklyCardInput {
  seq += 1
  return {
    id: `c${seq}`,
    title: `카드${seq}`,
    content_type_id: null,
    template_type: 'default',
    starts_at: '2026-09-24T00:00:00+09:00',
    ends_at: '2026-09-24T23:59:59+09:00',
    is_active: true,
    sort_order: 0,
    ...over,
  } as WeeklyCardInput
}

/** 하루짜리 활성 단기 카드 */
function dayCard(date: string, over: Partial<WeeklyCardInput> = {}): WeeklyCardInput {
  return card({ starts_at: `${date}T00:00:00+09:00`, ends_at: `${date}T23:59:59+09:00`, ...over })
}

describe('isPublicMission', () => {
  it('게이트 축도 노출 조건도 없으면 공개 미션이다', () => {
    expect(isPublicMission(mission())).toBe(true)
  })
  it('게이트 축이 있으면 공개 미션이 아니다', () => {
    expect(isPublicMission(mission({ gate_axis: 'running:distance' }))).toBe(false)
  })
  it('노출 조건이 있으면 공개 미션이 아니다', () => {
    const rule = { require_owned: [] } as unknown as ContentGapMissionInput['visibility_rule_json']
    expect(isPublicMission(mission({ visibility_rule_json: rule }))).toBe(false)
  })
})

describe('checkMissionGaps — 상시 입문 미션', () => {
  it('공개 미션이 없으면 상시 입문 미션 없음과 60일 전체 공백을 모두 경고한다', () => {
    const r = checkMissionGaps([], THU)
    expect(r.noIntroMission).toBe(true)
    expect(r.gapDates).toHaveLength(MISSION_GAP_HORIZON_DAYS)
    expect(r.gapDates[0]).toBe('2026-09-24')
    expect(r.hasGap).toBe(true)
  })

  it('이미 시작한 상시 공개 미션이 있으면 경고가 없다', () => {
    const r = checkMissionGaps([evergreen()], THU)
    expect(r).toMatchObject({ noIntroMission: false, gapDates: [], endingWithoutSuccessor: [], hasGap: false })
  })

  it('아직 시작하지 않은 상시 미션은 입문 미션으로 세지 않는다', () => {
    const future = mission({ starts_at: '2026-09-25T00:00:00+09:00' })
    const r = checkMissionGaps([future], THU)
    expect(r.noIntroMission).toBe(true)
    // 시작 전 날짜(오늘 하루)는 공백이고 25일부터는 채워진다
    expect(r.gapDates).toEqual(['2026-09-24'])
  })

  it('게이트 미션과 노출 조건이 있는 미션만 있으면 공개 미션이 없는 것이다', () => {
    const gate = mission({ gate_axis: 'running:distance' })
    const rule = { require_owned: [] } as unknown as ContentGapMissionInput['visibility_rule_json']
    const hidden = mission({ visibility_rule_json: rule })
    const r = checkMissionGaps([gate, hidden], THU)
    expect(r.noIntroMission).toBe(true)
    expect(r.gapDates).toHaveLength(MISSION_GAP_HORIZON_DAYS)
  })
})

describe('checkMissionGaps — 60일 안 날짜 공백', () => {
  it('기간 미션만 있고 사이가 비면 비는 날짜를 오름차순으로 돌려준다', () => {
    const a = mission({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: '2026-10-01T23:59:00+09:00' })
    const b = mission({ starts_at: '2026-10-04T00:00:00+09:00', ends_at: '2026-12-31T23:59:00+09:00' })
    const r = checkMissionGaps([evergreenEnded(), a, b], THU)
    expect(r.gapDates).toEqual(['2026-10-02', '2026-10-03'])
  })

  it('60일째 날까지 검사하고 61일째는 검사하지 않는다', () => {
    // 오늘부터 59일 뒤(60일째)에 끝나는 상시 아닌 미션 — 60일째는 덮이고 그 이후는 범위 밖
    const m = mission({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: '2026-11-22T23:59:00+09:00' }) // 9/24 + 59일 = 11/22
    const r = checkMissionGaps([m], THU)
    expect(r.gapDates).toEqual([])
    const short = mission({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: '2026-11-21T23:59:00+09:00' })
    expect(checkMissionGaps([short], THU).gapDates).toEqual(['2026-11-22'])
  })

  it('KST 자정 경계 — 23:59에 끝나는 미션 다음 날 00:00 시작 미션이면 공백이 없다', () => {
    const a = mission({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: '2026-10-31T23:59:59+09:00' })
    const b = mission({ starts_at: '2026-11-01T00:00:00+09:00', ends_at: '2027-01-31T23:59:59+09:00' })
    expect(checkMissionGaps([evergreenEnded(), a, b], THU).gapDates).toEqual([])
  })

  it('KST 자정 경계 — 다음 미션이 다음 날 00:01에 시작하면 그 날 하루는 걸치므로 공백이 아니다', () => {
    const a = mission({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: '2026-10-31T23:59:59+09:00' })
    const b = mission({ starts_at: '2026-11-01T00:01:00+09:00', ends_at: '2027-01-31T23:59:59+09:00' })
    expect(checkMissionGaps([evergreenEnded(), a, b], THU).gapDates).toEqual([])
  })

  it('UTC 날짜와 KST 날짜가 다른 시각(UTC 15:00 이후)은 KST 날짜로 센다', () => {
    // UTC 2026-10-31T15:00 = KST 2026-11-01 00:00 → 종료일은 11/1
    const m = mission({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: '2026-10-31T15:30:00Z' })
    const r = checkMissionGaps([evergreen(), m], THU)
    expect(r.endingWithoutSuccessor).toEqual([]) // 종료일 11/1은 14일 밖
    const near = mission({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: '2026-10-06T15:30:00Z' }) // KST 10/7
    expect(checkMissionGaps([evergreen(), near], THU).endingWithoutSuccessor[0].endDate).toBe('2026-10-07')
  })
})

/** 기간 미션 두 개의 공백만 보기 위한 배경: 오늘 이전에 끝난 미션(검사 대상 아님) */
function evergreenEnded(): ContentGapMissionInput {
  return mission({ starts_at: '2026-01-01T00:00:00+09:00', ends_at: '2026-09-23T23:59:59+09:00' })
}

describe('checkMissionGaps — 종료 임박(14일)', () => {
  // 오늘 9/24 → 오늘+14일은 10/8(검사), 오늘+15일은 10/9(제외)
  const ending = (endDate: string) =>
    mission({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: `${endDate}T23:59:00+09:00` })

  it('종료일이 오늘+14일(10/8)인 미션은 검사한다', () => {
    const m = ending('2026-10-08')
    const r = checkMissionGaps([evergreen(), m], THU)
    expect(r.endingWithoutSuccessor).toEqual([{ id: m.id, title: m.title, endDate: '2026-10-08' }])
    expect(r.hasGap).toBe(true)
  })

  it('종료일이 오늘+15일(10/9)인 미션은 검사하지 않는다', () => {
    const r = checkMissionGaps([evergreen(), ending('2026-10-09')], THU)
    expect(r.endingWithoutSuccessor).toEqual([])
  })

  it('오늘 끝나는 미션은 검사하고 어제 끝난 미션은 검사하지 않는다', () => {
    const today = ending('2026-09-24')
    const yesterday = ending('2026-09-23')
    const r = checkMissionGaps([evergreen(), today, yesterday], THU)
    expect(r.endingWithoutSuccessor.map((m) => m.id)).toEqual([today.id])
  })

  it('종료 다음 날 시작하는 기간 미션이 이어지면 경고가 없다', () => {
    const a = ending('2026-10-07')
    const b = mission({ starts_at: '2026-10-08T00:00:00+09:00', ends_at: '2026-11-30T23:59:00+09:00' })
    const r = checkMissionGaps([evergreen(), a, b], THU)
    expect(r.endingWithoutSuccessor).toEqual([])
  })

  it('이미 겹쳐 있는 더 늦게 끝나는 기간 미션도 후속으로 인정한다', () => {
    const a = ending('2026-10-07')
    const b = mission({ starts_at: '2026-10-01T00:00:00+09:00', ends_at: '2026-11-30T23:59:00+09:00' })
    expect(checkMissionGaps([evergreen(), a, b], THU).endingWithoutSuccessor).toEqual([])
  })

  it('종료 다음 날 시작 시각 정각에 시작하는 미션은 후속이고, 1분이라도 늦으면 후속이 아니다', () => {
    const a = ending('2026-10-07')
    const onTime = mission({ starts_at: '2026-10-08T00:00:00+09:00', ends_at: '2026-11-30T23:59:00+09:00' })
    expect(checkMissionGaps([evergreen(), a, onTime], THU).endingWithoutSuccessor).toEqual([])
    const late = mission({ starts_at: '2026-10-08T00:01:00+09:00', ends_at: '2026-11-30T23:59:00+09:00' })
    expect(checkMissionGaps([evergreen(), a, late], THU).endingWithoutSuccessor.map((m) => m.id)).toEqual([a.id])
  })

  it('종료 다음 날 시작 시각 이후에 시작하는 미션은 후속이 아니다', () => {
    const a = ending('2026-10-07')
    const b = mission({ starts_at: '2026-10-09T00:00:00+09:00', ends_at: '2026-11-30T23:59:00+09:00' })
    const r = checkMissionGaps([evergreen(), a, b], THU)
    expect(r.endingWithoutSuccessor.map((m) => m.id)).toEqual([a.id])
  })

  it('종료가 더 늦지 않은 미션은 후속이 아니다', () => {
    const a = ending('2026-10-07')
    const b = mission({ starts_at: '2026-10-01T00:00:00+09:00', ends_at: '2026-10-05T23:59:00+09:00' })
    const r = checkMissionGaps([evergreen(), a, b], THU)
    expect(r.endingWithoutSuccessor.map((m) => m.id)).toContain(a.id)
  })

  it('상시 미션은 후속으로 인정하지 않는다', () => {
    const a = ending('2026-10-07')
    const r = checkMissionGaps([evergreen(), a], THU) // evergreen은 상시
    expect(r.endingWithoutSuccessor.map((m) => m.id)).toEqual([a.id])
    expect(r.noIntroMission).toBe(false)
    expect(r.gapDates).toEqual([])
  })

  it('종료 임박 미션이 여럿이면 종료일 오름차순이다', () => {
    const late = mission({ starts_at: '2026-10-03T00:00:00+09:00', ends_at: '2026-10-05T23:59:00+09:00' })
    const early = mission({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: '2026-09-30T23:59:00+09:00' })
    const r = checkMissionGaps([evergreen(), late, early], THU)
    expect(r.endingWithoutSuccessor.map((m) => m.endDate)).toEqual(['2026-09-30', '2026-10-05'])
  })
})

describe('checkCardGaps', () => {
  // 2026-09-21(월) ~ 09-27(일), 다음 주 09-28(월) ~ 10-04(일)
  const FRI = new Date('2026-09-25T10:00:00+09:00')
  const SUN = new Date('2026-09-27T10:00:00+09:00')
  const MON = new Date('2026-09-21T10:00:00+09:00')

  it('목요일에는 다음 주를 검사하지 않는다', () => {
    const r = checkCardGaps([], THU)
    expect(r.checkedNextWeek).toBe(false)
    expect(r.unprogrammedDates).toEqual(['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'])
  })

  it('월~목에는 다음 주를 검사하지 않는다', () => {
    expect(checkCardGaps([], MON).checkedNextWeek).toBe(false)
    expect(checkCardGaps([], MON).unprogrammedDates).toHaveLength(7)
  })

  it('금요일에는 다음 주 월~일을 함께 검사한다', () => {
    const r = checkCardGaps([], FRI)
    expect(r.checkedNextWeek).toBe(true)
    expect(r.unprogrammedDates).toEqual([
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
  })

  it('일요일에도 다음 주를 검사한다(오늘 하루 + 다음 주 7일)', () => {
    const r = checkCardGaps([], SUN)
    expect(r.checkedNextWeek).toBe(true)
    expect(r.unprogrammedDates).toHaveLength(8)
    expect(r.unprogrammedDates[0]).toBe('2026-09-27')
  })

  it('이번 주는 오늘(포함)부터 검사하고 지난 요일은 검사하지 않는다', () => {
    const r = checkCardGaps([], THU)
    expect(r.unprogrammedDates).not.toContain('2026-09-23')
    expect(r.unprogrammedDates[0]).toBe('2026-09-24')
  })

  it('활성 단기 카드가 있는 날은 편성된 것이다', () => {
    const cards = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'].map((d) => dayCard(d))
    const r = checkCardGaps(cards, THU)
    expect(r).toMatchObject({ unprogrammedDates: [], hasGap: false })
  })

  it('비활성 단기 카드만 있는 날은 미편성이다', () => {
    const r = checkCardGaps([dayCard('2026-09-24', { is_active: false })], THU)
    expect(r.unprogrammedDates).toContain('2026-09-24')
  })

  it('장기 카드만 있는 날은 미편성이다', () => {
    const long = card({ starts_at: '2026-09-01T00:00:00+09:00', ends_at: '2026-12-31T23:59:59+09:00' })
    const r = checkCardGaps([long], THU)
    expect(r.unprogrammedDates).toEqual(['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'])
  })

  it('여러 날에 걸치는 활성 단기 카드(7일 이하)는 걸친 날을 모두 편성한다', () => {
    const week = card({ starts_at: '2026-09-24T00:00:00+09:00', ends_at: '2026-09-27T23:59:59+09:00' })
    expect(checkCardGaps([week], THU).hasGap).toBe(false)
  })
})

describe('문구', () => {
  it('미션 공백이 없으면 문구가 없다', () => {
    expect(missionGapMessages(checkMissionGaps([evergreen()], THU))).toEqual([])
  })

  it('상시 입문 미션 없음·공백 날짜·종료 임박을 각각 문구로 만든다', () => {
    const a = mission({
      title: '그루터기 살롱',
      starts_at: '2026-09-01T00:00:00+09:00',
      ends_at: '2026-10-07T23:59:00+09:00',
    })
    const msgs = missionGapMessages(checkMissionGaps([a], THU))
    expect(msgs).toContain('상시 입문 미션이 없어요')
    expect(msgs).toContain('10/8 공개 미션이 없어요 (총 46일)')
    expect(msgs).toContain("'그루터기 살롱'이 10/7에 끝나는데 이어지는 기간 미션이 없어요")
  })

  it('공백 날짜가 하루면 총 일수를 붙이지 않는다', () => {
    const future = mission({ starts_at: '2026-09-25T00:00:00+09:00' })
    expect(missionGapMessages(checkMissionGaps([future], THU))).toContain('9/24 공개 미션이 없어요')
  })

  it('카드 편성 공백이 없으면 null이다', () => {
    expect(cardGapMessage({ unprogrammedDates: [], checkedNextWeek: false, hasGap: false })).toBeNull()
  })

  it('카드 편성 공백은 개수와 요일 포함 날짜를 나열한다', () => {
    expect(cardGapMessage(checkCardGaps([], THU))).toBe('미편성 4일: 9/24(목), 9/25(금), 9/26(토), 9/27(일)')
  })

  it('7일을 넘으면 나머지는 "외 N일"로 줄인다', () => {
    const msg = cardGapMessage(checkCardGaps([], new Date('2026-09-25T10:00:00+09:00')))
    expect(msg).toBe(
      '미편성 10일: 9/25(금), 9/26(토), 9/27(일), 9/28(월), 9/29(화), 9/30(수), 10/1(목) 외 3일'
    )
  })
})
