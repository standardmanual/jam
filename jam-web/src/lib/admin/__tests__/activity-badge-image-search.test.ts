/**
 * 액티비티 배지 이미지 생성기 — 검색 페이징·레벨형 대응 회귀 (티켓 20260905_0032 C-1)
 *
 * 지키는 것:
 *   ③ **레벨형 배지에 등급 기반 프리셋을 쓰지 않는다** — 프리셋은 «활동 종목 × 등급»
 *      조합표라 등급이 없는 배지에는 성립하지 않는다
 *   ④ **550종 규모에서 검색이 잘리지 않는다** — 예전의 「상한 50건 + truncated」로는
 *      상위 50건 밖의 배지에 도달할 수 없었다
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/activity-badge-image-search.test.ts`
 */
import {
  ACTIVITY_BADGE_IMAGE_SEARCH_PAGE_SIZE,
  activityBadgeImageSearchRange,
  activityBadgeImageSearchTotalPages,
  parseActivityBadgeImageSearchParams,
} from '../activityBadgeImageSearch'
import {
  DEFAULT_ACTIVITY_BADGE_BACKGROUND,
  buildInitialActivityBadgeImageParams,
} from '../activityBadgeImage'
import { getBadgeBlobPreset } from '@/lib/badgeBlobPresets'

describe('③ 레벨형 배지에는 등급 기반 프리셋을 쓰지 않는다', () => {
  it('등급형은 활동 종목 × 등급 프리셋 4색을 채운다', () => {
    const params = buildInitialActivityBadgeImageParams({
      name: '언덕의 도전자',
      description: '누적 300m',
      rarity: 'epic',
      activityTypes: ['hiking'],
    })
    expect(params.rarity).toBe('epic')
    expect(params.background.colors).toEqual(getBadgeBlobPreset('hiking', 'epic'))
  })

  it('레벨형(등급 없음)은 프리셋을 적용하지 않고 기본 배경을 쓴다', () => {
    const params = buildInitialActivityBadgeImageParams({
      name: '밤의 보행자',
      description: 'Lv.7',
      rarity: null,
      activityTypes: ['walking'],
    })
    expect(params.background).toEqual(DEFAULT_ACTIVITY_BADGE_BACKGROUND)
    // 어떤 등급의 프리셋도 쓰지 않는다
    for (const rarity of ['common', 'rare', 'epic', 'mystic'] as const) {
      expect(params.background.colors).not.toEqual(getBadgeBlobPreset('walking', rarity))
    }
  })

  it('레벨형의 저작 등급은 common이다 — 등급 칩을 그리지 않는다는 뜻', () => {
    const params = buildInitialActivityBadgeImageParams({
      name: '밤의 보행자',
      description: 'Lv.7',
      rarity: null,
      activityTypes: ['walking'],
    })
    expect(params.rarity).toBe('common')
  })

  it('프리셋 표에 없는 종목(레거시 키)에는 프리셋을 쓰지 않는다 — 깨지지 않는다', () => {
    const params = buildInitialActivityBadgeImageParams({
      name: '레거시',
      description: '설명',
      rarity: 'rare',
      activityTypes: ['road_running'],
    })
    expect(params.background).toEqual(DEFAULT_ACTIVITY_BADGE_BACKGROUND)
  })
})

describe('④ 550종 규모에서 검색이 잘리지 않는다', () => {
  it('페이지를 넘기면 550종 전부에 도달한다', () => {
    const total = 550
    const pages = activityBadgeImageSearchTotalPages(total)
    const reached = new Set<number>()
    for (let page = 1; page <= pages; page += 1) {
      const { from, to } = activityBadgeImageSearchRange(page)
      for (let i = from; i <= Math.min(to, total - 1); i += 1) reached.add(i)
    }
    expect(reached.size).toBe(total)
    expect(pages).toBe(11)
  })

  it('페이지 경계가 겹치지도 비지도 않는다', () => {
    expect(activityBadgeImageSearchRange(1)).toEqual({ from: 0, to: 49 })
    expect(activityBadgeImageSearchRange(2)).toEqual({ from: 50, to: 99 })
    expect(activityBadgeImageSearchRange(12).from).toBe(11 * ACTIVITY_BADGE_IMAGE_SEARCH_PAGE_SIZE)
  })

  it('결과가 없어도 페이지 수는 1이다', () => {
    expect(activityBadgeImageSearchTotalPages(0)).toBe(1)
    expect(activityBadgeImageSearchTotalPages(50)).toBe(1)
    expect(activityBadgeImageSearchTotalPages(51)).toBe(2)
  })

  it('페이지 값이 깨져 있으면 1페이지로 본다', () => {
    expect(parseActivityBadgeImageSearchParams({ page: 0 }).page).toBe(1)
    expect(parseActivityBadgeImageSearchParams({ page: -3 }).page).toBe(1)
    expect(parseActivityBadgeImageSearchParams({ page: 'abc' }).page).toBe(1)
    expect(parseActivityBadgeImageSearchParams({}).page).toBe(1)
    expect(parseActivityBadgeImageSearchParams({ page: 3.7 }).page).toBe(3)
  })

  it('레벨형 필터에는 등급 필터가 함께 서지 않는다 — 결과가 늘 0건이 된다', () => {
    const params = parseActivityBadgeImageSearchParams({ kind: 'leveled', rarity: 'epic' })
    expect(params.kind).toBe('leveled')
    expect(params.rarity).toBeNull()
  })

  it('등급형 필터에서는 등급 필터가 그대로 선다', () => {
    const params = parseActivityBadgeImageSearchParams({ kind: 'graded', rarity: 'epic' })
    expect(params.rarity).toBe('epic')
  })

  it('모르는 값은 필터 없음으로 떨어진다', () => {
    const params = parseActivityBadgeImageSearchParams({ kind: 'repeatable', rarity: 'legendary' })
    expect(params.kind).toBeNull()
    expect(params.rarity).toBeNull()
  })

  it('검색어에서 PostgREST 문법을 깨뜨리는 문자를 지운다', () => {
    expect(parseActivityBadgeImageSearchParams({ q: ' 산책,왕(100%) ' }).q).toBe('산책 왕 100')
  })
})
