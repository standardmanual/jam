/**
 * 날짜별 구성 (티켓 20261001_1155)
 *
 * 지키는 것: 하루 겹침 판정(`/admin/today`와 같은 KST 하루), 운영 묶음 항목을 세는 상태, 대표 카드 정렬(A9),
 * 「이미지 제작 필요」(A8), 검사 범위(가정 15), ISO 주 표기.
 */
import { describe, expect, it } from 'vitest'
import {
  buildDayCompositions,
  checksNextWeek,
  hasItemCopy,
  needsImageProduction,
  pickRepresentative,
  readMergeResourceId,
  isoWeekOfDate,
  signalScanDates,
  type CompositionCard,
  type DayComposition,
  type DayCompositionInput,
  type SignalBundleItemInput,
} from '@/lib/admin/opsSignals/composition'
import { mondayOfWeek } from '@/lib/admin/cronSchedule'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import { cardOriginal, dayEnd, dayStart, kst, makeBundle, makeCard, makeDayCard, makeItem } from './fixtures'

function compose(input: Partial<DayCompositionInput>, dates: string[] = ['2026-10-01']): DayComposition[] {
  return buildDayCompositions({ cards: [], missions: [], bundles: [], ...input }, dates)
}

describe('buildDayCompositions — 실제 카드의 하루 겹침', () => {
  it('시작 ≤ 그날 끝이고 끝 ≥ 그날 시작이면 걸친다(양 끝 포함)', () => {
    const endsAtMidnight = makeCard({ startsAt: dayStart('2026-09-30'), endsAt: dayStart('2026-10-01') })
    const startsAtNextMidnight = makeCard({ startsAt: dayStart('2026-10-02'), endsAt: dayEnd('2026-10-02') })
    const endedBefore = makeCard({ startsAt: dayStart('2026-09-29'), endsAt: dayEnd('2026-09-30') })
    const [day] = compose({ cards: [endsAtMidnight, startsAtNextMidnight, endedBefore] })
    expect(day.cards.map((card) => card.id)).toEqual([endsAtMidnight.id])
  })

  it('비활성 카드는 센 수 없다', () => {
    const active = makeCard()
    const inactive = makeCard({ isActive: false })
    const [day] = compose({ cards: [active, inactive] })
    expect(day.cards.map((card) => card.id)).toEqual([active.id])
  })

  it('이 날 새로 시작하는 카드만 startsOnDay가 참이다', () => {
    const starting = makeDayCard('2026-10-01')
    const ongoing = makeCard({ startsAt: dayStart('2026-09-28'), endsAt: dayEnd('2026-10-05') })
    const [day] = compose({ cards: [starting, ongoing] })
    expect(day.cards.find((card) => card.id === starting.id)?.startsOnDay).toBe(true)
    expect(day.cards.find((card) => card.id === ongoing.id)?.startsOnDay).toBe(false)
  })

  it('옛 카드(모양 칸이 빈 카드)는 이미지가 없어도 「이미지가 빈 항목」이 아니다(A8)', () => {
    const legacy = makeCard({ shapeStored: false, shape: 'hero', hasCover: false })
    const stored = makeCard({ shapeStored: true, shape: 'hero', hasCover: false })
    const storedBrief = makeCard({ shapeStored: true, shape: 'brief', hasCover: false })
    const [day] = compose({ cards: [legacy, stored, storedBrief] })
    const byId = (id: string) => day.cards.find((card) => card.id === id) as CompositionCard
    expect(byId(legacy.id).imageMissing).toBe(false)
    expect(byId(stored.id).imageMissing).toBe(true)
    expect(byId(storedBrief.id).imageMissing).toBe(false)
  })

  it('실제 카드의 문안은 제목이 비어 있으면 빈 것이다(A5)', () => {
    const [day] = compose({ cards: [makeCard({ title: '   ' }), makeCard({ title: '제목' })] })
    expect(day.cards.map((card) => card.hasCopy).sort()).toEqual([false, true])
  })
})

describe('buildDayCompositions — 운영 묶음 항목', () => {
  it('반려·취소·실패와 10개 밖 상태 값은 세지 않고 승인 전·예약·게재·종료는 센다(가정 15)', () => {
    const counted = ['arrived', 'reviewing', 'approved', 'preparing', 'scheduled', 'live', 'ended'].map((status) =>
      makeItem({ status })
    )
    const notCounted = ['rejected', 'cancelled', 'failed', 'weird'].map((status) => makeItem({ status }))
    const [day] = compose({ bundles: [makeBundle([...counted, ...notCounted])] })
    expect(day.cards.map((card) => card.id).sort()).toEqual(counted.map((item) => item.id).sort())
  })

  it('공개 시각이 없거나 읽을 수 없는 항목은 날짜에 올리지 않는다', () => {
    const [day] = compose({
      bundles: [makeBundle([makeItem({ startsAt: null }), makeItem({ startsAt: '아무 때나' })])],
    })
    expect(day.cards).toEqual([])
  })

  it('종료 시각이 없으면 공개한 날 하루만 걸친다', () => {
    const item = makeItem({ startsAt: kst('2026-10-01', '09:00'), endsAt: null })
    const days = compose({ bundles: [makeBundle([item])] }, ['2026-09-30', '2026-10-01', '2026-10-02'])
    expect(days.map((day) => day.cards.length)).toEqual([0, 1, 0])
    expect(days[1].cards[0].endsAt).toBeNull()
  })

  it('종료 시각이 있으면 그 기간 내내 걸친다', () => {
    const item = makeItem({ startsAt: kst('2026-09-29', '09:00'), endsAt: kst('2026-10-02', '09:00') })
    const days = compose({ bundles: [makeBundle([item])] }, ['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(days.map((day) => day.cards.length)).toEqual([0, 1, 1, 1, 0])
  })

  it('홈피드 카드가 아닌 항목은 bundleItems로, 패턴 제안은 어디에도 넣지 않는다', () => {
    const mission = makeItem({ kind: 'mission', original: { copy: { title: '미션' } } })
    const proposal = makeItem({ kind: 'pattern_proposal', original: {} })
    const [day] = compose({ bundles: [makeBundle([mission, proposal])] })
    expect(day.cards).toEqual([])
    expect(day.bundleItems.map((item) => item.itemId)).toEqual([mission.id])
    expect(day.bundleItems[0].title).toBe('미션')
  })

  it('시험 묶음의 카드는 isSample 표식이 붙는다', () => {
    const [day] = compose({ bundles: [makeBundle([makeItem()], { isSample: true })] })
    expect(day.cards[0].isSample).toBe(true)
  })

  it('수정본이 있으면 수정본의 칸을 읽는다(모양·노출 대상)', () => {
    const item = makeItem({ original: cardOriginal({ shape: 'brief' }), edited: { shape: 'poster', exposure_tags: ['new_user'] } })
    const [day] = compose({ bundles: [makeBundle([item])] })
    expect(day.cards[0].shape).toBe('poster')
    expect(day.cards[0].exposureTags).toEqual(['new_user'])
  })

  it('칸이 틀리면 「모름」으로 읽는다(모양·노출 대상·트라이브)', () => {
    const item = makeItem({ original: { shape: 'large_thumbnail', exposure_tags: 'all', tribe_id: 'abc' } })
    const [day] = compose({ bundles: [makeBundle([item])] })
    expect(day.cards[0].shape).toBe('unknown')
    expect(day.cards[0].exposureTags).toBe('unknown')
    expect(day.cards[0].tribeId).toBe('unknown')
  })

  it('이미지 모양인 예약·게재 항목에 이미지가 없으면 「이미지가 빈 항목」이고 승인 전이면 아니다(A8)', () => {
    const noImage = cardOriginal({ resource: {} })
    const items = ['arrived', 'approved', 'scheduled', 'live'].map((status) => makeItem({ status, original: noImage }))
    const [day] = compose({ bundles: [makeBundle(items)] })
    const missingByStatus = Object.fromEntries(day.cards.map((card) => [card.status, card.imageMissing]))
    expect(missingByStatus).toEqual({ arrived: false, approved: false, scheduled: true, live: true })
  })
})

describe('buildDayCompositions — 미션', () => {
  it('종료 시각이 없는 미션은 시작한 날부터 계속 걸친다', () => {
    const permanent = { id: 'm1', title: '상시', startsAt: kst('2026-09-20', '09:00'), endsAt: null }
    const ended = { id: 'm2', title: '끝남', startsAt: kst('2026-09-20', '09:00'), endsAt: kst('2026-09-30', '09:00') }
    const days = compose({ missions: [permanent, ended] }, ['2026-09-19', '2026-09-30', '2026-10-01'])
    expect(days.map((day) => day.missions.map((mission) => mission.id))).toEqual([[], ['m1', 'm2'], ['m1']])
  })
})

describe('pickRepresentative — 대표 카드(가정 16, A9)', () => {
  function pick(cards: CompositionCard[]) {
    return pickRepresentative(cards)
  }
  function realCard(over: Parameters<typeof makeCard>[0] = {}): CompositionCard {
    const card = makeCard(over)
    return compose({ cards: [card] })[0].cards[0]
  }
  function bundleCard(over: Partial<SignalBundleItemInput> = {}, receivedAt = kst('2026-10-01', '08:00')): CompositionCard {
    const bundle = makeBundle([makeItem(over)], { receivedAt })
    return compose({ bundles: [bundle] })[0].cards[0]
  }

  it('전원 대상(all) 카드만 대표가 될 수 있다', () => {
    const targeted = realCard({ sortOrder: 0, exposureTags: ['new_user'] })
    const all = realCard({ sortOrder: 5, exposureTags: ['all', 'new_user'] })
    expect(pick([targeted, all])?.id).toBe(all.id)
  })

  it('전원 대상 카드가 없으면 대표가 없다. 노출 대상을 모르는 카드도 대표가 될 수 없다', () => {
    const unknownTags = bundleCard({ original: { shape: 'hero', exposure_tags: 'all' } })
    expect(unknownTags.exposureTags).toBe('unknown')
    expect(pick([realCard({ exposureTags: ['new_user'] }), unknownTags])).toBeNull()
    expect(pick([])).toBeNull()
  })

  it('실제 카드는 sort_order 오름차순, 같으면 starts_at 내림차순이다', () => {
    const late = realCard({ sortOrder: 1, startsAt: dayStart('2026-10-01') })
    const early = realCard({ sortOrder: 1, startsAt: dayStart('2026-09-29') })
    const first = realCard({ sortOrder: 0, startsAt: dayStart('2026-09-20') })
    expect(pick([early, late, first])?.id).toBe(first.id)
    expect(pick([early, late])?.id).toBe(late.id)
  })

  it('운영 묶음 카드는 resource.sort_order를 실제 카드와 같은 줄에 놓는다', () => {
    const real = realCard({ sortOrder: 3 })
    const bundleFirst = bundleCard({ original: cardOriginal({ resource: { sort_order: 1, cover_image_url: 'x' } }) })
    expect(pick([real, bundleFirst])?.id).toBe(bundleFirst.id)
  })

  it('resource.sort_order가 없는 운영 묶음 카드는 실제 카드 뒤에 제출 순서로 둔다', () => {
    const real = realCard({ sortOrder: 99 })
    const olderBundle = bundleCard({}, kst('2026-09-30', '08:00'))
    const newerBundle = bundleCard({}, kst('2026-10-01', '08:00'))
    expect(olderBundle.sortOrder).toBeNull()
    expect(pick([newerBundle, olderBundle, real])?.id).toBe(real.id)
    expect(pick([newerBundle, olderBundle])?.id).toBe(olderBundle.id)
  })

  it('같은 묶음 안에서는 제출한 항목 순서(position)가 앞선 카드가 대표다', () => {
    const bundle = makeBundle([makeItem({ position: 2 }), makeItem({ position: 0 }), makeItem({ position: 1 })])
    const [day] = compose({ bundles: [bundle] })
    expect(day.representative?.position).toBe(0)
    expect(day.cards.map((card) => card.position)).toEqual([0, 1, 2])
  })

  it('하루 구성의 representative가 같은 규칙으로 정해진다', () => {
    const first = makeCard({ sortOrder: 0 })
    const second = makeCard({ sortOrder: 1 })
    const [day] = compose({ cards: [second, first] })
    expect(day.representative?.id).toBe(first.id)
    expect(day.cards.map((card) => card.id)).toEqual([first.id, second.id])
  })
})

describe('needsImageProduction — 「이미지 제작 필요」(A8)', () => {
  const noImage = (shape: string) => cardOriginal({ shape, resource: {} })

  it('승인 전(도착·검토중·승인됨·준비중) 이미지 모양 항목에 이미지가 없으면 참이다', () => {
    for (const status of ['arrived', 'reviewing', 'approved', 'preparing']) {
      for (const shape of ['hero', 'poster', 'square']) {
        expect(needsImageProduction({ status, original: noImage(shape), edited: null }), `${status}/${shape}`).toBe(true)
      }
    }
  })

  it('이미지가 있으면 거짓이다', () => {
    expect(needsImageProduction({ status: 'arrived', original: cardOriginal(), edited: null })).toBe(false)
    expect(
      needsImageProduction({ status: 'arrived', original: cardOriginal({ resource: { cover_image_url: '   ' } }), edited: null })
    ).toBe(true)
  })

  it('이미지가 없는 모양(brief·list)은 거짓이다', () => {
    for (const shape of ['brief', 'list']) {
      expect(needsImageProduction({ status: 'arrived', original: noImage(shape), edited: null })).toBe(false)
    }
  })

  it('승인 뒤 상태(예약·게재·종료)와 멈춘 상태는 표시하지 않는다', () => {
    for (const status of ['scheduled', 'live', 'ended', 'rejected', 'cancelled', 'failed']) {
      expect(needsImageProduction({ status, original: noImage('hero'), edited: null }), status).toBe(false)
    }
  })

  it('모양을 읽을 수 없으면(칸이 없거나 틀림) 거짓이다', () => {
    expect(needsImageProduction({ status: 'arrived', original: { resource: {} }, edited: null })).toBe(false)
    expect(needsImageProduction({ status: 'arrived', original: { shape: 'large_thumbnail' }, edited: null })).toBe(false)
  })

  it('수정본의 모양이 제출 원본보다 먼저다', () => {
    expect(needsImageProduction({ status: 'arrived', original: noImage('brief'), edited: { shape: 'hero' } })).toBe(true)
    expect(needsImageProduction({ status: 'arrived', original: noImage('hero'), edited: { shape: 'list' } })).toBe(false)
  })

  it('구성의 운영 묶음 카드에도 같은 값이 실린다', () => {
    const item = makeItem({ status: 'reviewing', original: noImage('poster') })
    const [day] = compose({ bundles: [makeBundle([item])] })
    expect(day.cards[0].needsImageProduction).toBe(true)
    expect(day.cards[0].imageMissing).toBe(false)
  })
})

describe('hasItemCopy — 문안이 있는가(A5)', () => {
  it('copy에 비어 있지 않은 문자열이 하나라도 있으면 참이다', () => {
    expect(hasItemCopy({ original: { copy: { title: '', body: '본문' } }, edited: null })).toBe(true)
    expect(hasItemCopy({ original: { copy: { nested: { line: '안쪽' } } }, edited: null })).toBe(true)
    expect(hasItemCopy({ original: { copy: '한 줄' }, edited: null })).toBe(true)
  })

  it('copy가 없거나 공백·빈 값뿐이면 거짓이다', () => {
    expect(hasItemCopy({ original: {}, edited: null })).toBe(false)
    expect(hasItemCopy({ original: { copy: { title: '  ', body: '' } }, edited: null })).toBe(false)
    expect(hasItemCopy({ original: { copy: { count: 3 } }, edited: null })).toBe(false)
    expect(hasItemCopy({ original: { copy: null }, edited: null })).toBe(false)
  })
})

describe('signalScanDates — 검사 범위(가정 15)', () => {
  const options = { nextWeekCheckFromWeekday: 5 }
  const at = (date: string) => new Date(`${date}T12:00:00+09:00`)

  it('목요일에는 오늘부터 이번 주 일요일까지다', () => {
    expect(signalScanDates(at('2026-10-01'), options)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  })

  it('월요일에는 이번 주 7일이다', () => {
    const dates = signalScanDates(at('2026-10-05'), options)
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe('2026-10-05')
    expect(dates[6]).toBe('2026-10-11')
  })

  it('금·토·일요일에는 다음 주(월~일)까지 본다', () => {
    const friday = signalScanDates(at('2026-10-02'), options)
    expect(friday).toEqual([
      '2026-10-02', '2026-10-03', '2026-10-04',
      '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
    ])
    expect(signalScanDates(at('2026-10-03'), options)).toHaveLength(9)
    expect(signalScanDates(at('2026-10-04'), options)).toHaveLength(8)
  })

  it('다음 주 기획이 이미 도착했으면 금요일 전에도 다음 주를 본다', () => {
    const dates = signalScanDates(at('2026-10-01'), { ...options, nextWeekArrived: true })
    expect(dates).toHaveLength(11)
    expect(dates[4]).toBe('2026-10-05')
    expect(dates[10]).toBe('2026-10-11')
  })

  it('KST 자정을 넘기면 날짜가 바뀐다(UTC로는 아직 전날)', () => {
    expect(signalScanDates(new Date('2026-09-30T15:30:00Z'), options)[0]).toBe('2026-10-01')
  })
})

describe('checksNextWeek — 다음 주를 보는 날(검사 범위와 운영 홈 다음 주 줄이 같은 판정, 티켓 20261006_1340)', () => {
  const options = { nextWeekCheckFromWeekday: 5 }
  const at = (date: string) => new Date(`${date}T12:00:00+09:00`)

  it('기준 요일(금)부터와 일요일에 참이고 그 전에는 거짓이다', () => {
    expect(checksNextWeek(at('2026-10-05'), options)).toBe(false)
    expect(checksNextWeek(at('2026-10-01'), options)).toBe(false)
    expect(checksNextWeek(at('2026-10-02'), options)).toBe(true)
    expect(checksNextWeek(at('2026-10-03'), options)).toBe(true)
    expect(checksNextWeek(at('2026-10-04'), options)).toBe(true)
  })

  it('다음 주 기획이 도착했으면 기준 요일 전에도 참이다', () => {
    expect(checksNextWeek(at('2026-10-01'), { ...options, nextWeekArrived: true })).toBe(true)
  })

  it('기준 요일을 S7에서 바꾸면 그 요일부터다', () => {
    expect(checksNextWeek(at('2026-10-01'), { nextWeekCheckFromWeekday: 4 })).toBe(true)
    expect(checksNextWeek(at('2026-10-01'), { nextWeekCheckFromWeekday: 6 })).toBe(false)
  })

  it('검사 범위(signalScanDates)가 같은 판정을 쓴다: 다음 주 월요일이 범위에 있는 날이 곧 참인 날이다', () => {
    for (const date of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07']) {
      const nextMonday = shiftDateStr(mondayOfWeek(date), 7)
      expect(signalScanDates(at(date), options).includes(nextMonday)).toBe(checksNextWeek(at(date), options))
    }
  })
})

describe('isoWeekOfDate — 묶음의 week 칸과 같은 ISO 주 표기', () => {
  it('주 번호를 구한다', () => {
    expect(isoWeekOfDate('2026-10-05')).toBe('2026-W41')
    expect(isoWeekOfDate('2026-10-11')).toBe('2026-W41')
    expect(isoWeekOfDate('2026-01-01')).toBe('2026-W01')
  })

  it('해가 바뀌는 주를 ISO 규칙대로 센다', () => {
    expect(isoWeekOfDate('2027-01-01')).toBe('2026-W53')
    expect(isoWeekOfDate('2024-12-30')).toBe('2025-W01')
  })
})

describe('buildDayCompositions — 실제 카드·운영 항목 합치기(티켓 20261006_1339)', () => {
  const CARD_ID = '3f1b2c9e-0d6a-4b7e-9a51-2c8d7e6f5a40'
  const MISSION_ID = '7a2e4c10-9b3d-4f6a-8e15-5d0c1b2a3f90'

  /** 운영 묶음의 홈피드 카드 항목. `created_resource`로 실제 카드를 가리킨다. */
  const cardItem = (over: Partial<SignalBundleItemInput> = {}, resourceId: string | null = CARD_ID) =>
    makeItem({
      status: 'scheduled',
      createdResource: resourceId === null ? null : { today_card_id: resourceId },
      ...over,
    })
  const missionItem = (over: Partial<SignalBundleItemInput> = {}, resourceId: string | null = MISSION_ID) =>
    makeItem({
      kind: 'mission',
      status: 'scheduled',
      original: { copy: { title: '운영 미션' } },
      createdResource: resourceId === null ? null : { mission_id: resourceId },
      ...over,
    })
  const realCard = (over: Parameters<typeof makeCard>[0] = {}) => makeCard({ id: CARD_ID, title: '실제 카드', ...over })
  const realMission = (over: Partial<{ id: string; title: string; startsAt: string; endsAt: string | null }> = {}) => ({
    id: MISSION_ID,
    title: '실제 미션',
    startsAt: kst('2026-09-28', '09:00'),
    endsAt: kst('2026-10-05', '09:00') as string | null,
    ...over,
  })

  it('운영툴이 만든 실제 카드와 그 운영 항목은 한 칸으로 한 번만 센다', () => {
    const item = cardItem()
    const [day] = compose({ cards: [realCard()], bundles: [makeBundle([item])] })
    expect(day.cards).toHaveLength(1)
    expect(day.cards[0].source).toBe('bundle')
    expect(day.cards[0].id).toBe(item.id)
    expect(day.cards[0].resourceId).toBe(CARD_ID)
  })

  it('합친 칸의 값: 키·상태·시험·묶음 연결은 운영 항목, 제목·모양·노출 대상·커버·정렬은 실제 카드 값이다(가정 1)', () => {
    const item = cardItem({
      position: 3,
      patternNo: 'P-07',
      original: cardOriginal({ shape: 'brief', exposure_tags: ['new_user'], copy: { title: '항목 제목' }, resource: { sort_order: 9 } }),
    })
    const bundle = makeBundle([item], { isSample: true, receivedAt: kst('2026-09-30', '08:00') })
    const card = realCard({ shape: 'poster', exposureTags: ['all'], sortOrder: 2, hasCover: false, title: '실제 제목' })
    const [day] = compose({ cards: [card], bundles: [bundle] })
    const merged = day.cards[0]
    // 운영 항목 값
    expect(merged.key).toBe(`bundle:${item.id}`)
    expect(merged.status).toBe('scheduled')
    expect(merged.isSample).toBe(true)
    expect(merged.bundleId).toBe(bundle.id)
    expect(merged.patternNo).toBe('P-07')
    expect(merged.position).toBe(3)
    expect(merged.submittedAtMs).toBe(Date.parse(kst('2026-09-30', '08:00')))
    // 실제 카드 값
    expect(merged.title).toBe('실제 제목')
    expect(merged.shape).toBe('poster')
    expect(merged.exposureTags).toEqual(['all'])
    expect(merged.sortOrder).toBe(2)
    expect(merged.imageMissing).toBe(true) // 커버가 없다
    expect(merged.hasCopy).toBe(true)
  })

  it('날짜 겹침은 실제 카드의 기간이다(항목의 시각이 달라도 카드가 걸치는 날에 보인다)', () => {
    const item = cardItem({ startsAt: dayStart('2026-10-01'), endsAt: dayEnd('2026-10-01') })
    const card = realCard({ startsAt: dayStart('2026-10-03'), endsAt: dayEnd('2026-10-03') })
    const days = compose({ cards: [card], bundles: [makeBundle([item])] }, ['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(days.map((day) => day.cards.length)).toEqual([0, 0, 1])
    expect(days[2].cards[0].startsOnDay).toBe(true)
    expect(days[2].cards[0].startsAt).toBe(card.startsAt)
  })

  it('항목에 없는 실제 카드는 따로 센다(합칠 짝이 없다)', () => {
    const item = cardItem()
    const other = makeCard({ id: 'other-card' })
    const [day] = compose({ cards: [realCard(), other], bundles: [makeBundle([item])] })
    expect(day.cards.map((card) => card.id).sort()).toEqual([item.id, other.id].sort())
    expect(day.cards.find((card) => card.id === other.id)?.resourceId).toBe(other.id)
  })

  it('ID는 대소문자를 가리지 않고 앞뒤 빈칸을 무시해 비교한다', () => {
    const item = cardItem({}, `  ${CARD_ID.toUpperCase()} `)
    const [day] = compose({ cards: [realCard()], bundles: [makeBundle([item])] })
    expect(day.cards).toHaveLength(1)
    expect(day.cards[0].resourceId).toBe(CARD_ID)
  })

  it('멈춘 항목(반려·취소·실패)은 합치지 않는다: 실제 카드가 그대로 한 번 센다', () => {
    for (const status of ['rejected', 'cancelled', 'failed']) {
      const [day] = compose({ cards: [realCard()], bundles: [makeBundle([cardItem({ status })])] })
      expect(day.cards, status).toHaveLength(1)
      expect(day.cards[0].source, status).toBe('card')
      expect(day.cards[0].id, status).toBe(CARD_ID)
    }
  })

  it('created_resource가 {sample:true}이거나 비었거나 키가 다르면 합치지 않는다', () => {
    const cases: Array<SignalBundleItemInput['createdResource']> = [
      { sample: true },
      null,
      {},
      { today_card_id: '' },
      { today_card_id: 7 },
      { mission_id: CARD_ID }, // 홈피드 카드 항목은 today_card_id만 읽는다
    ]
    for (const createdResource of cases) {
      const item = makeItem({ status: 'scheduled', createdResource })
      const [day] = compose({ cards: [realCard()], bundles: [makeBundle([item], { isSample: true })] })
      expect(day.cards, JSON.stringify(createdResource)).toHaveLength(2)
    }
  })

  it('비활성 실제 카드와는 합치지 않는다(항목이 자기 시각으로 센다)', () => {
    const [day] = compose({ cards: [realCard({ isActive: false })], bundles: [makeBundle([cardItem()])] })
    expect(day.cards).toHaveLength(1)
    expect(day.cards[0].source).toBe('bundle')
    expect(day.cards[0].resourceId).toBeNull()
  })

  it('가리키는 카드가 입력에 없으면 항목이 자기 시각으로 센다', () => {
    const [day] = compose({ cards: [], bundles: [makeBundle([cardItem()])] })
    expect(day.cards).toHaveLength(1)
    expect(day.cards[0].resourceId).toBeNull()
  })

  it('같은 카드를 가리키는 항목이 둘이면 먼저 나온 항목만 합친다', () => {
    const first = cardItem({ position: 0 })
    const second = cardItem({ position: 1 })
    const [day] = compose({ cards: [realCard()], bundles: [makeBundle([first, second])] })
    expect(day.cards).toHaveLength(2)
    expect(day.cards.find((card) => card.id === first.id)?.resourceId).toBe(CARD_ID)
    expect(day.cards.find((card) => card.id === second.id)?.resourceId).toBeNull()
  })

  it('합친 칸은 대표 카드 정렬에서 실제 카드의 정렬 값을 쓴다', () => {
    const item = cardItem()
    const other = makeCard({ id: 'other-card', sortOrder: 5 })
    const [day] = compose({ cards: [realCard({ sortOrder: 1 }), other], bundles: [makeBundle([item])] })
    expect(day.representative?.id).toBe(item.id)
    expect(day.cards.map((card) => card.id)).toEqual([item.id, other.id])
  })

  it('같은 자원을 두 번 세지 않아 하루 카드 수가 늘지 않는다', () => {
    const cards = [realCard(), makeCard({ id: 'c2', sortOrder: 1 }), makeCard({ id: 'c3', sortOrder: 2 })]
    const [day] = compose({ cards, bundles: [makeBundle([cardItem()])] })
    expect(day.cards).toHaveLength(3)
  })

  it('실제 미션과 미션 항목도 한 칸으로 합친다(실제 미션 값: 제목·기간, 항목 값: 상태·시험·묶음 연결)', () => {
    const item = missionItem({ patternNo: 'P-02' })
    const bundle = makeBundle([item])
    const [day] = compose({ missions: [realMission()], bundles: [bundle] })
    expect(day.missions).toEqual([])
    expect(day.bundleItems).toHaveLength(1)
    const merged = day.bundleItems[0]
    expect(merged.itemId).toBe(item.id)
    expect(merged.resourceId).toBe(MISSION_ID)
    expect(merged.title).toBe('실제 미션')
    expect(merged.startsAt).toBe(kst('2026-09-28', '09:00'))
    expect(merged.endsAt).toBe(kst('2026-10-05', '09:00'))
    expect(merged.status).toBe('scheduled')
    expect(merged.bundleId).toBe(bundle.id)
    expect(merged.patternNo).toBe('P-02')
  })

  it('합친 미션의 날짜 겹침은 실제 미션 기간이다(상시 미션은 계속 걸친다)', () => {
    const item = missionItem({ startsAt: dayStart('2026-10-01'), endsAt: dayEnd('2026-10-01') })
    const permanent = realMission({ startsAt: dayStart('2026-09-30'), endsAt: null })
    const days = compose({ missions: [permanent], bundles: [makeBundle([item])] }, ['2026-09-29', '2026-10-01', '2026-10-04'])
    expect(days.map((day) => day.bundleItems.length)).toEqual([0, 1, 1])
    expect(days.every((day) => day.missions.length === 0)).toBe(true)
  })

  it('멈춘 미션 항목은 합치지 않는다: 실제 미션이 그대로 센다', () => {
    const [day] = compose({ missions: [realMission()], bundles: [makeBundle([missionItem({ status: 'failed' })])] })
    expect(day.missions.map((mission) => mission.id)).toEqual([MISSION_ID])
    expect(day.bundleItems).toEqual([])
  })

  it('미션이 아닌 항목(JAM! 배지 등)은 합치지 않는다', () => {
    const badge = makeItem({ kind: 'jam_badge', status: 'scheduled', createdResource: { badge_id: MISSION_ID } })
    const [day] = compose({ missions: [realMission()], bundles: [makeBundle([badge])] })
    expect(day.missions.map((mission) => mission.id)).toEqual([MISSION_ID])
    expect(day.bundleItems).toHaveLength(1)
    expect(day.bundleItems[0].resourceId).toBeNull()
  })

  it('실제 카드 칸의 resourceId는 자기 ID이고, 합치지 않은 운영 항목 칸은 null이다', () => {
    const real = makeCard({ id: 'solo' })
    const plain = makeItem()
    const [day] = compose({ cards: [real], bundles: [makeBundle([plain])] })
    expect(day.cards.find((card) => card.source === 'card')?.resourceId).toBe('solo')
    expect(day.cards.find((card) => card.source === 'bundle')?.resourceId).toBeNull()
  })
})

describe('readMergeResourceId', () => {
  it('종류별 키만 읽고 소문자로 돌려준다(카드 today_card_id, 미션 mission_id)', () => {
    expect(readMergeResourceId({ kind: 'home_feed_card', createdResource: { today_card_id: 'ABC' } })).toBe('abc')
    expect(readMergeResourceId({ kind: 'mission', createdResource: { mission_id: 'DEF' } })).toBe('def')
    expect(readMergeResourceId({ kind: 'mission', createdResource: { today_card_id: 'abc' } })).toBeNull()
  })

  it('합치기 대상 종류가 아니거나 값이 없으면 null이다', () => {
    expect(readMergeResourceId({ kind: 'jam_badge', createdResource: { badge_id: 'abc' } })).toBeNull()
    expect(readMergeResourceId({ kind: null, createdResource: { today_card_id: 'abc' } })).toBeNull()
    expect(readMergeResourceId({ kind: 'home_feed_card' })).toBeNull()
    expect(readMergeResourceId({ kind: 'home_feed_card', createdResource: { sample: true } })).toBeNull()
    expect(readMergeResourceId({ kind: 'toString', createdResource: { today_card_id: 'abc' } })).toBeNull()
  })
})
