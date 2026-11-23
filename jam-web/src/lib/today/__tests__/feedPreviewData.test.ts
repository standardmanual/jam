/**
 * 홈피드 새 카드 미리보기의 가짜 데이터와 요약 계산 (티켓 20261121_0155, 상위 20261120_2026 4회차-4)
 *
 * 확인하는 것:
 * 1. 120장 자동 배정이 통합 팔레트 배제 표를 모두 통과하고(위반 0) 제외 조합과 겹치지 않는다(겹침 0), 되돌림 기본 조합이 쓰이지 않는다.
 * 2. 같은 입력은 같은 결과다(`Math.random`·`Date.now` 없음). 시드는 서로 다르고 유형 8개가 모두 나온다.
 * 3. 제외 조합 예시가 «제외하지 않으면 실제로 나올 수 있는» 쌍이라 요약의 겹침 0이 의미가 있다(제외 없이 배정하면 겹침이 생긴다).
 * 4. 유형 8개 구역·박스 5종 구역·상태 구역·모션 구역의 가짜 데이터가 모든 유형을 채우고, 값 칩 입력이 칩 문구로 나온다.
 * 5. 가짜 데이터가 계측(`tracking`)·외부 주소를 싣지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/feedPreviewData.test.ts
 */
import { describe, it, expect } from 'vitest'
import { BOX_SHAPES } from '../boxShape'
import { FEED_RENDERED_TYPES } from '../feedLook'
import { splitTitleByWords } from '../titleChips'
import { chipLimitOf, FEED_CHIP_SLOT_SPECS } from '../feedChipSlots'
import { FEED_COLOR_KEYS } from '../feedConstants'
import {
  PREVIEW_AUTO_COUNT,
  PREVIEW_EXCLUDED_PAIRS,
  buildAutoAssignment,
  buildBoxMatrix,
  buildMotion,
  buildStateMatrix,
  buildTypeSamples,
  previewTitleWords,
  previewView,
  type PreviewCell,
} from '../feedPreviewData'

function allCells(): PreviewCell[] {
  const motion = buildMotion()
  return [
    ...buildTypeSamples().map((sample) => sample.cell),
    ...buildBoxMatrix().flatMap((row) => row.cells),
    ...buildStateMatrix().flatMap((row) => row.cells),
    motion.collected,
    motion.spread,
    motion.scrolling,
    motion.fewBadges,
  ]
}

describe('자동 배정 120장', () => {
  const { cards, summary } = buildAutoAssignment()

  it('카드 120장이고 시드가 모두 다르다', () => {
    expect(PREVIEW_AUTO_COUNT).toBe(120)
    expect(cards).toHaveLength(120)
    expect(summary.cardCount).toBe(120)
    expect(new Set(cards.map((card) => card.seed)).size).toBe(120)
    expect(new Set(cards.map((card) => card.view.look.seed)).size).toBe(120)
  })

  it('규칙 위반이 0이고 제외 조합과 겹침이 0이며 되돌림 기본 조합이 쓰이지 않는다', () => {
    expect(summary.ruleViolationCount).toBe(0)
    expect(summary.excludedOverlapCount).toBe(0)
    expect(summary.fallbackCount).toBe(0)
    expect(cards.every((card) => card.violatedRules.length === 0 && !card.overlapsExcluded && !card.usedFallback)).toBe(true)
  })

  it('유형 8개가 모두 나오고 색·칩은 지정하지 않은(NULL) 자동 배정이다', () => {
    expect(new Set(cards.map((card) => card.feedType))).toEqual(new Set(FEED_RENDERED_TYPES))
    for (const card of cards) {
      expect(card.view.feedType).toBe(card.feedType)
      expect(card.view.look.colors.bg).toBeTruthy()
      expect(card.view.look.colors.chip).toBeTruthy()
      expect(card.view.look.colors.box).toBeTruthy()
    }
    // 칩이 있는 유형은 값 칩 입력에서 칩 문구가 나온다(자동 구성: 값 칩 → 구분 칩)
    const hero = cards.find((card) => card.feedType === 'hero_box')
    expect(hero?.view.look.chips.length).toBeGreaterThan(0)
  })

  it('같은 입력은 같은 결과다', () => {
    expect(buildAutoAssignment()).toEqual(buildAutoAssignment())
    expect(buildAutoAssignment(30)).toEqual({
      cards: cards.slice(0, 30),
      summary: { ...summary, cardCount: 30 },
    })
  })

  it('제외 조합 예시는 규칙에서 나올 수 있는 쌍이라, 제외하지 않으면 실제로 겹치는 카드가 나온다', () => {
    const withoutExclusion = buildAutoAssignment(PREVIEW_AUTO_COUNT, [])
    expect(withoutExclusion.summary.ruleViolationCount).toBe(0)
    // 같은 카드에 같은 색 쌍이 나오는지는 제외 목록이 정한다. 제외가 없으면 예시 쌍이 쓰인 카드가 있다.
    const keys = new Set(PREVIEW_EXCLUDED_PAIRS.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)))
    const overlapsWithoutExclusion = withoutExclusion.cards.filter((card) => {
      const { bg, chip, box } = card.view.look.colors
      return [
        [bg, chip],
        [chip, box],
        [bg, box],
      ].some(([a, b]) => keys.has(a < b ? `${a}|${b}` : `${b}|${a}`))
    })
    expect(overlapsWithoutExclusion.length).toBeGreaterThan(0)
  })

  it('제외 조합을 모두 막으면 되돌림 기본 조합이 쓰이고 요약이 센다(되돌림 수가 실제로 움직인다)', () => {
    // 19키 모든 쌍을 제외하면 통과하는 조합이 없다 — 배경·칩·박스 모두 기본 조합으로 되돌아간다
    const keys = [...FEED_COLOR_KEYS]
    const everything = keys.flatMap((a) => keys.filter((b) => b !== a).map((b) => [a, b] as const))
    const { summary: blocked } = buildAutoAssignment(8, everything)
    expect(blocked.fallbackCount).toBe(8)
  })
})

describe('구역별 가짜 데이터', () => {
  it('유형 8개가 모두 있고 `tracking`·외부 주소가 없다', () => {
    const samples = buildTypeSamples()
    expect(samples.map((sample) => sample.feedType)).toEqual([...FEED_RENDERED_TYPES])
    for (const cell of allCells()) {
      expect(cell.view.tracking).toBeUndefined()
      expect(cell.view.href).toBeUndefined()
      const urls = [cell.view.imageUrl, cell.view.badgeImageUrl, ...(cell.view.collectionBadges ?? []).map((b) => b.imageUrl)]
      for (const url of urls) if (url) expect(url.startsWith('/')).toBe(true)
    }
  })

  it('전체 배경 이미지는 꺼짐 상태 표시를 단다', () => {
    const full = buildTypeSamples().find((sample) => sample.feedType === 'full_image')
    expect(full?.note).toContain('꺼짐')
  })

  it('박스 모양 5종이 박스가 있는 유형(히어로·텍스트·드랍·픽업)마다 한 줄씩 있다', () => {
    const rows = buildBoxMatrix()
    expect(rows.map((row) => row.cells[0].view.feedType)).toEqual(['hero_box', 'text_box', 'text_box', 'drop_pickup'])
    for (const row of rows) expect(row.cells.map((cell) => cell.view.look.boxShape)).toEqual([...BOX_SHAPES])
    // 텍스트는 글자 박스와 이미지 박스 두 줄이다
    expect(rows.filter((row) => row.cells[0].view.feedType === 'text_box').map((row) => row.cells[0].view.look.boxKind)).toEqual(['text', 'image_mask'])
  })

  it('상태 행렬: 유형마다 칩 0·1·2개, 제목 속 칩, 도장, 설명 숨김(보이는 유형만)이 있다', () => {
    const rows = buildStateMatrix()
    expect(rows.map((row) => row.feedType)).toEqual([...FEED_RENDERED_TYPES])
    for (const row of rows) {
      const byLabel = (prefix: string) => row.cells.find((cell) => cell.label.startsWith(prefix))
      const limit = chipLimitOf(row.feedType)
      expect(byLabel('칩 0개')?.view.look.chips).toHaveLength(0)
      expect(byLabel('칩 1개')?.view.look.chips).toHaveLength(Math.min(1, limit))
      expect(byLabel('칩 2개')?.view.look.chips).toHaveLength(Math.min(2, limit))
      expect(byLabel('제목 속 칩')?.view.look.titleChips.words).toHaveLength(2)
      // 도장이 놓일 자리가 없는 유형(배지만)은 켜도 도장이 없고 이름표가 그렇다고 알린다
      const stamp = byLabel('도장')
      if (FEED_CHIP_SLOT_SPECS[row.feedType].slots.length === 0) {
        expect(stamp?.view.look.stamp).toBeNull()
        expect(stamp?.label).toContain('자리가 없어요')
      } else {
        expect(stamp?.view.look.stamp).not.toBeNull()
      }
      const hidden = byLabel('설명 숨김')
      if (hidden) expect(hidden.view.look.showDescription).toBe(false)
    }
    // 설명이 기본으로 보이는 유형은 «설명 숨김» 칸이 있고 숨김 칸에는 설명이 없다
    const hero = rows.find((row) => row.feedType === 'hero_box')
    expect(hero?.cells.find((cell) => cell.label === '설명 숨김')?.view.description).toBeUndefined()
    expect(previewView('hero_box').description).toBeTruthy()
  })

  it('제목 속 칩 낱말은 제목에 그대로 들어 있다', () => {
    for (const feedType of FEED_RENDERED_TYPES) {
      const view = previewView(feedType)
      const pieces = splitTitleByWords(view.title, previewTitleWords(feedType))
      expect(pieces.filter((piece) => piece.type === 'chip')).toHaveLength(2)
    }
  })

  it('모션 구역: 모인·퍼진 상태가 고정되고 스크롤 재생 카드는 고정하지 않는다', () => {
    const motion = buildMotion()
    expect(motion.collected.phase).toBe('collected')
    expect(motion.spread.phase).toBe('spread')
    expect(motion.scrolling.phase).toBeUndefined()
    expect(motion.collected.view.feedType).toBe('collection_intro')
    expect(motion.collected.view.look.burst).toHaveLength(4)
    expect(motion.collected.view.collectionBadges).toHaveLength(4)
    expect(motion.fewBadges.view.collectionBadges).toHaveLength(2)
  })

  it('값 칩 입력이 칩 문구로 나온다(미션 조건·배지 달성 기준·레벨·아이템 수)', () => {
    const texts = (feedType: (typeof FEED_RENDERED_TYPES)[number]) => previewView(feedType, { chips: null }).look.chips.map((chip) => chip.text)
    expect(texts('hero_box')).toContain('미션')
    expect(texts('badge_intro').length).toBeGreaterThan(0)
    expect(texts('badge_intro')[0]).toBe('고도 700m')
    expect(texts('collection_intro')[0]).toBe('아이템 12개')
  })

  it('같은 입력은 같은 결과다', () => {
    expect(buildTypeSamples()).toEqual(buildTypeSamples())
    expect(buildStateMatrix()).toEqual(buildStateMatrix())
    expect(buildBoxMatrix()).toEqual(buildBoxMatrix())
  })
})
