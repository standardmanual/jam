/**
 * 저장된 홈피드 카드 색 일회성 재배정 계산 (티켓 20261122_2224 회차 10)
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedColorReassign.test.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { DEFAULT_FEED_PALETTE, FEED_FALLBACK_COLORS } from '../feedAssign'
import { chipExclusionRule, isHexColor, violatesImageColorRule } from '../feedColorRules'
import { boxAllowedFor, boxHasTextFor, FEED_COLOR_USAGE, FEED_DEEP_GREEN_KEY, FEED_DEEP_GREEN_RHYTHM } from '../feedConstants'
import { imageColorsForCard } from '../feedImageColors'
import { reassignFeedColors, sortForReassign, type FeedColorReassignCard, type FeedColorReassignResult } from '../feedColorReassign'
import { FEED_RECENT_BG_LIMIT } from '@/lib/admin/feedCardServer'

const FAR_FUTURE = 2_000_000_000

/** 노출 기간이 모두 겹치는 합성 카드 n장(등록 시각이 1초씩 다르다). */
function overlappingCards(n: number, feedType = 'text_box'): FeedColorReassignCard[] {
  return Array.from({ length: n }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    feedType,
    seed: 1_000_003 * (index + 1),
    createdAt: 1_700_000_000 + index,
    startsAt: 1_700_000_000,
    endsAt: FAR_FUTURE,
    badgeColors: null,
  }))
}

function byId(results: readonly FeedColorReassignResult[]): Map<string, FeedColorReassignResult> {
  return new Map(results.map((r) => [r.id, r]))
}

/** 결과 한 장이 쓰임 표(바탕·박스·값 칩)를 지키는가 */
function followsUsage(r: FeedColorReassignResult): boolean {
  return (
    (FEED_COLOR_USAGE.bg as readonly string[]).includes(r.bg) &&
    (FEED_COLOR_USAGE.box as readonly string[]).includes(r.box) &&
    (FEED_COLOR_USAGE.valueChip as readonly string[]).includes(r.chip)
  )
}

/** 칩이 바탕·박스 어느 쪽으로도 배제 표에 걸리지 않는가 */
function chipPassesExclusion(r: FeedColorReassignResult): boolean {
  return chipExclusionRule(r.chip, r.bg) === null && chipExclusionRule(r.chip, r.box) === null
}

describe('sortForReassign — 처리 순서', () => {
  it('등록 시각 → 노출 시작 → id 순이고 입력 배열은 바꾸지 않는다', () => {
    const base = { feedType: 'text_box', seed: 1, endsAt: 10, badgeColors: null }
    const input: FeedColorReassignCard[] = [
      { ...base, id: 'b', createdAt: 5, startsAt: 2 },
      { ...base, id: 'a', createdAt: 5, startsAt: 2 },
      { ...base, id: 'c', createdAt: 5, startsAt: 1 },
      { ...base, id: 'd', createdAt: 4, startsAt: 9 },
    ]
    const before = input.map((c) => c.id)
    expect(sortForReassign(input).map((c) => c.id)).toEqual(['d', 'c', 'a', 'b'])
    expect(input.map((c) => c.id)).toEqual(before)
  })
})

describe('reassignFeedColors — 합성 카드', () => {
  const cards = overlappingCards(60)

  it('같은 입력은 같은 결과이고, 입력 순서가 달라도 처리 순서가 같아 결과가 같다', () => {
    const first = reassignFeedColors(cards)
    expect(reassignFeedColors(cards)).toEqual(first)
    expect(reassignFeedColors([...cards].reverse())).toEqual(first)
    expect(first.map((r) => r.id)).toEqual(sortForReassign(cards).map((c) => c.id))
  })

  it('결과가 전부 쓰임 표와 칩 배제 표를 지킨다', () => {
    for (const r of reassignFeedColors(cards)) {
      expect(followsUsage(r)).toBe(true)
      expect(chipPassesExclusion(r)).toBe(true)
      expect(r.usedFallback).toBe(false)
    }
  })

  it('기간이 겹치는 바로 앞 카드와 같은 바탕이 나오지 않는다', () => {
    const results = reassignFeedColors(cards)
    for (let index = 1; index < results.length; index += 1) expect(results[index].bg).not.toBe(results[index - 1].bg)
  })

  it('기간이 겹치지 않는 카드는 앞 카드로 세지 않는다(앞 카드 목록이 비어 같은 바탕이 나올 수 있다)', () => {
    const lone = overlappingCards(2).map((card, index) => ({ ...card, startsAt: index * 1000, endsAt: index * 1000 + 10 }))
    // 두 카드의 기간이 겹치지 않으므로 첫 카드의 바탕이 둘째 카드의 회피 대상이 아니다: 둘째 결과는 «혼자 처리한 결과»와 같다
    const both = reassignFeedColors(lone)
    const alone = reassignFeedColors([lone[1]])
    expect(both[1]).toEqual(alone[0])
  })

  it('짙은 초록 바탕이 5~6장마다 하나씩 나온다(겹치는 카드 사이 4~5장)', () => {
    const results = reassignFeedColors(overlappingCards(120))
    const deepAt = results.flatMap((r, index) => (r.bg === FEED_DEEP_GREEN_KEY ? [index] : []))
    expect(deepAt.length).toBeGreaterThanOrEqual(120 / FEED_DEEP_GREEN_RHYTHM.everyMax - 2)
    const gaps = deepAt.slice(1).map((value, index) => value - deepAt[index])
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(FEED_DEEP_GREEN_RHYTHM.everyMin)
      expect(gap).toBeLessThanOrEqual(FEED_DEEP_GREEN_RHYTHM.everyMax)
    }
    // 첫 짙은 초록도 6번째 이내(목록 앞에 하나 있었던 것으로 센다)
    expect(deepAt[0]).toBeLessThanOrEqual(FEED_DEEP_GREEN_RHYTHM.everyMax - 1)
  })

  it('글자가 들어가는 카드에는 짙은 초록 박스가 없다(히어로처럼 사진만 들어가는 카드는 제한 없음)', () => {
    const text = reassignFeedColors(overlappingCards(120, 'text_box'))
    expect(text.some((r) => r.box === FEED_DEEP_GREEN_KEY)).toBe(false)
    for (const r of text) expect(boxAllowedFor(r.box, boxHasTextFor('text_box', null))).toBe(true)
    const hero = reassignFeedColors(overlappingCards(120, 'hero_box'))
    for (const r of hero) expect(followsUsage(r)).toBe(true)
  })

  it('앞 카드 목록은 최근 FEED_RECENT_BG_LIMIT장까지만 본다(상수는 서버와 같은 값 12)', () => {
    expect(FEED_RECENT_BG_LIMIT).toBe(12)
    // 처음 12장 뒤에도 리듬이 이어진다 = 목록을 자르는 일이 리듬을 깨지 않는다
    const deepAt = reassignFeedColors(overlappingCards(60)).flatMap((r, index) => (r.bg === FEED_DEEP_GREEN_KEY ? [index] : []))
    expect(deepAt.filter((index) => index >= FEED_RECENT_BG_LIMIT).length).toBeGreaterThan(3)
  })

  it('옛 키로 저장된 값은 입력이 아니다: 결과에 옛 10키가 없다', () => {
    const legacy = ['red-soft', 'yellow-soft', 'green-soft', 'purple-soft', 'blue-soft', 'ref-red', 'ref-blue', 'ref-lime', 'ref-pink', 'ref-yellow']
    for (const r of reassignFeedColors(cards)) {
      for (const key of [r.bg, r.chip, r.box]) expect(legacy).not.toContain(key)
    }
  })
})

describe('reassignFeedColors — 배지 소개의 그림 색 규칙', () => {
  it('첫 배지 대표 색에 묻히는 바탕·칩이 나오지 않는다(violatesImageColorRule)', () => {
    // 노랑 계열·초록 계열·분홍 계열·하늘 계열 대표 색을 번갈아 준다
    const hexes = [['#F9FD69'], ['#8AE12E', '#B8F06A'], ['#F372C1'], ['#51CDF5'], ['#3D851E']]
    const cards = overlappingCards(50, 'badge_intro').map((card, index) => ({ ...card, badgeColors: hexes[index % hexes.length] }))
    const results = byId(reassignFeedColors(cards))
    let checked = 0
    for (const card of cards) {
      const r = results.get(card.id) as FeedColorReassignResult
      const image = imageColorsForCard({ feedType: card.feedType, boxKind: null, coverColors: null, badgeColors: [card.badgeColors] })
      expect(image.imageHexes.length).toBeGreaterThan(0)
      if (r.usedFallback) continue
      // 그림 규칙을 건너뛴 카드(조합이 없어 푼 경우)는 이 합성 재료에서 나오지 않아야 한다
      expect(violatesImageColorRule(DEFAULT_FEED_PALETTE[r.bg], image.imageHexes)).toBe(false)
      // 배지 소개의 칩은 그림 위에 걸치지 않으므로 칩에는 그림 규칙이 없다
      expect(image.chipOnImage).toBe(false)
      checked += 1
    }
    expect(checked).toBeGreaterThan(40)
  })

  it('대표 색이 없거나 읽을 수 없으면 그림 규칙 없이 정한다(없는 것과 결과가 같다)', () => {
    const plain = overlappingCards(20, 'badge_intro')
    const broken = plain.map((card, index) => ({ ...card, badgeColors: index % 2 === 0 ? null : ['not-a-hex'] }))
    expect(reassignFeedColors(broken)).toEqual(reassignFeedColors(plain))
  })
})

describe('reassignFeedColors — 안전 조합', () => {
  it('안전 조합 값은 쓰임 표와 배제 표를 지킨다(되돌린 카드가 규칙 밖 값을 만들지 않는다)', () => {
    const safe = { id: 'safe', ...FEED_FALLBACK_COLORS, usedFallback: true }
    expect(followsUsage(safe)).toBe(true)
    expect(chipPassesExclusion(safe)).toBe(true)
  })

  it('그림 색이 모든 바탕 후보를 덮어도 결과를 돌려주고, 안전 조합으로 되돌렸다면 usedFallback이다', () => {
    // 팔레트 전체 색이 그림 색에 들어 있는 극단: 그림 규칙을 풀어 정하므로 폴백이 아닌 결과가 나온다
    const everyColor = Object.entries(DEFAULT_FEED_PALETTE)
      .filter(([key]) => (FEED_COLOR_USAGE.bg as readonly string[]).includes(key))
      .map(([, hex]) => hex)
      .filter(isHexColor)
    const cards = overlappingCards(10, 'badge_intro').map((card) => ({ ...card, badgeColors: everyColor.slice(0, 3) }))
    for (const r of reassignFeedColors(cards)) {
      expect(followsUsage(r)).toBe(true)
      if (r.usedFallback) expect({ bg: r.bg, chip: r.chip, box: r.box }).toEqual(FEED_FALLBACK_COLORS)
    }
  })
})

describe('reassignFeedColors — 실제 재료(카드 121장)', () => {
  const file = path.join(__dirname, '..', '..', '..', '..', 'scripts', 'data', 'feed-color-reassign-input-20261123.json')
  const cards = (JSON.parse(fs.readFileSync(file, 'utf8')) as { cards: FeedColorReassignCard[] }).cards
  const results = reassignFeedColors(cards)
  const sorted = sortForReassign(cards)
  const cardById = new Map(cards.map((c) => [c.id, c]))

  it('121장 전부 한 번씩 결과가 있고 같은 입력은 같은 결과다', () => {
    expect(cards).toHaveLength(121)
    expect(results).toHaveLength(121)
    expect(new Set(results.map((r) => r.id)).size).toBe(121)
    expect(results.map((r) => r.id)).toEqual(sorted.map((c) => c.id))
    expect(reassignFeedColors(cards)).toEqual(results)
  })

  it('전부 쓰임 표를 지키고 칩이 배제 표를 지킨다', () => {
    for (const r of results) {
      expect(followsUsage(r)).toBe(true)
      expect(chipPassesExclusion(r)).toBe(true)
    }
  })

  it('글자가 들어가는 카드(텍스트형·배지 소개)에 짙은 초록 박스가 없다', () => {
    for (const r of results) {
      const feedType = (cardById.get(r.id) as FeedColorReassignCard).feedType
      if (boxHasTextFor(feedType, null)) expect(r.box).not.toBe(FEED_DEEP_GREEN_KEY)
    }
  })

  it('기간이 겹치는 바로 앞 카드와 같은 바탕이 나오지 않는다', () => {
    const resultById = byId(results)
    sorted.forEach((card, index) => {
      const previous = sorted
        .slice(0, index)
        .filter((prev) => prev.startsAt <= card.endsAt && prev.endsAt >= card.startsAt)
        .at(-1)
      if (!previous) return
      expect((resultById.get(card.id) as FeedColorReassignResult).bg).not.toBe((resultById.get(previous.id) as FeedColorReassignResult).bg)
    })
  })

  it('짙은 초록 바탕은 겹치는 카드 사이에서 5번째 미만에는 나오지 않고, 6번째 이후엔 이어진다', () => {
    const resultById = byId(results)
    let deepCards = 0
    sorted.forEach((card, index) => {
      const overlapping = sorted.slice(0, index).filter((prev) => prev.startsAt <= card.endsAt && prev.endsAt >= card.startsAt)
      const recent = overlapping.slice(-FEED_RECENT_BG_LIMIT).map((prev) => (resultById.get(prev.id) as FeedColorReassignResult).bg)
      const last = recent.lastIndexOf(FEED_DEEP_GREEN_KEY)
      const since = last < 0 ? recent.length + 1 : recent.length - last
      const bg = (resultById.get(card.id) as FeedColorReassignResult).bg
      if (bg === FEED_DEEP_GREEN_KEY) {
        deepCards += 1
        expect(since).toBeGreaterThanOrEqual(FEED_DEEP_GREEN_RHYTHM.everyMin)
      } else if (since >= FEED_DEEP_GREEN_RHYTHM.everyMax && card.feedType !== 'badge_intro') {
        // 6번째 이후에는 반드시 짙은 초록이다(그림 색이 걸리는 배지 소개만 예외로 둘 수 있다)
        expect(bg).toBe(FEED_DEEP_GREEN_KEY)
      }
    })
    expect(deepCards).toBeGreaterThan(0)
  })

  it('배지 소개 19장의 바탕은 첫 배지 대표 색에 묻히지 않는다', () => {
    const resultById = byId(results)
    let withColors = 0
    for (const card of cards.filter((c) => c.feedType === 'badge_intro')) {
      const image = imageColorsForCard({ feedType: card.feedType, boxKind: null, coverColors: null, badgeColors: card.badgeColors ? [card.badgeColors] : [] })
      if (image.imageHexes.length === 0) continue
      withColors += 1
      const r = resultById.get(card.id) as FeedColorReassignResult
      if (!r.usedFallback) expect(violatesImageColorRule(DEFAULT_FEED_PALETTE[r.bg], image.imageHexes)).toBe(false)
    }
    expect(withColors).toBeGreaterThan(0)
  })

  it('결과 요약: 새 바탕 5색·짙은 초록 카드 수·폴백 수', () => {
    const bgCount: Record<string, number> = {}
    for (const r of results) bgCount[r.bg] = (bgCount[r.bg] ?? 0) + 1
    // 바탕은 쓰임 표의 5색 안에서만 나오고 5색이 모두 쓰인다
    expect(Object.keys(bgCount).sort()).toEqual([...FEED_COLOR_USAGE.bg].sort())
    // 짙은 초록 바탕은 전체의 약 1/6~1/5 안팎(겹치지 않는 카드가 많아 리듬 상한보다 적을 수 있다)
    expect(bgCount[FEED_DEEP_GREEN_KEY]).toBeGreaterThanOrEqual(10)
    expect(bgCount[FEED_DEEP_GREEN_KEY]).toBeLessThanOrEqual(Math.ceil(121 / FEED_DEEP_GREEN_RHYTHM.everyMin))
    // 이 재료에는 안전 조합으로 되돌린 카드가 없다
    expect(results.filter((r) => r.usedFallback)).toHaveLength(0)
  })
})
