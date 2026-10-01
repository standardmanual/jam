/**
 * 운영 신호 시험이 함께 쓰는 입력 만들기 (티켓 20261001_1155). 시험 파일이 아니라서 시험으로 돌지 않는다.
 *
 * 기준일은 2026-10-01(목)이다. 날짜는 모두 KST로 적는다(`kst('2026-10-01', '09:00')`).
 */
import type { Json } from '@/types/database.generated'
import { shiftDateStr } from '@/lib/admin/today-calendar'
import type { SignalBundleInput, SignalBundleItemInput, SignalCardInput } from '@/lib/admin/opsSignals/composition'

/** 2026-10-01(목) 12:00 KST. 이번 주 남은 날(목~일) 4일이 검사 범위다. */
export const NOW = new Date('2026-10-01T12:00:00+09:00')

/** `YYYY-MM-DD`와 `HH:mm`으로 KST 시각 문자열을 만든다. */
export function kst(date: string, time = '00:00'): string {
  return `${date}T${time}:00+09:00`
}

export function dayStart(date: string): string {
  return kst(date, '00:00')
}

export function dayEnd(date: string): string {
  return `${date}T23:59:59+09:00`
}

let seq = 0

/** 실제 카드 한 장. 기본은 2026-10-01 하루짜리 전원 대상 `hero` 카드다. */
export function makeCard(over: Partial<SignalCardInput> = {}): SignalCardInput {
  seq += 1
  return {
    id: `card-${seq}`,
    title: `카드 ${seq}`,
    startsAt: dayStart('2026-10-01'),
    endsAt: dayEnd('2026-10-01'),
    isActive: true,
    sortOrder: 0,
    shape: 'hero',
    shapeStored: true,
    exposureTags: ['all'],
    hasCover: true,
    ...over,
  }
}

/** 그날 하루만 걸치는 실제 카드. */
export function makeDayCard(date: string, over: Partial<SignalCardInput> = {}): SignalCardInput {
  return makeCard({ startsAt: dayStart(date), endsAt: dayEnd(date), ...over })
}

/** 홈피드 카드 항목의 제출 원본. 기본은 전원 대상 `hero`에 문안·이미지가 다 있다. */
export function cardOriginal(over: Record<string, Json> = {}): Json {
  return {
    shape: 'hero',
    exposure_tags: ['all'],
    copy: { title: '운영 카드' },
    resource: { cover_image_url: 'https://example.com/cover.png' },
    ...over,
  }
}

/** 운영 묶음 항목 한 건. 기본은 2026-10-01 하루짜리 「새로 도착」 홈피드 카드다. */
export function makeItem(over: Partial<SignalBundleItemInput> = {}): SignalBundleItemInput {
  seq += 1
  return {
    id: `item-${seq}`,
    position: 0,
    itemKey: `key-${seq}`,
    kind: 'home_feed_card',
    status: 'arrived',
    startsAt: dayStart('2026-10-01'),
    endsAt: dayEnd('2026-10-01'),
    patternNo: null,
    original: cardOriginal(),
    edited: null,
    formatErrors: [],
    updatedAt: kst('2026-10-01', '09:00'),
    ...over,
  }
}

/** 운영 묶음 한 건. 기본은 시험이 아닌 묶음이고 제출 원본에 뺀 항목이 없다. */
export function makeBundle(items: SignalBundleItemInput[] = [], over: Partial<SignalBundleInput> = {}): SignalBundleInput {
  seq += 1
  return {
    id: `bundle-${seq}`,
    week: null,
    isSample: false,
    receivedAt: kst('2026-10-01', '08:00'),
    formatErrors: [],
    raw: {},
    items,
    ...over,
  }
}

/**
 * 모든 날짜에 카드가 3장씩 있는 「아무 신호도 걸리지 않는」 기준 구성. 대표 카드의 모양을 날마다 바꿔 단조로운 흐름에도
 * 걸리지 않는다. 시험은 여기서 한 가지 조건만 바꿔 신호가 뜨는지 본다.
 */
export function healthyCards(fromDate: string, toDate: string): SignalCardInput[] {
  const cards: SignalCardInput[] = []
  let index = 0
  for (let date = fromDate; date <= toDate; date = shiftDateStr(date, 1)) {
    cards.push(
      makeDayCard(date, { sortOrder: 0, shape: index % 2 === 0 ? 'hero' : 'poster', exposureTags: ['all'] }),
      makeDayCard(date, { sortOrder: 1, shape: 'brief', exposureTags: ['all'] }),
      makeDayCard(date, { sortOrder: 2, shape: 'list', exposureTags: ['has_participating_mission'] })
    )
    index += 1
  }
  return cards
}

/** 기준 구성이 덮는 날짜 범위: 지난 6일부터 이번 주 일요일까지. */
export const HEALTHY_FROM = '2026-09-25'
export const HEALTHY_TO = '2026-10-04'
