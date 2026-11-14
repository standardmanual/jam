/**
 * 믹스 레시피 공개 판정 — 공개 시각(valid_from)·종료 시각(valid_until) 규칙 (티켓 20261001_1157, 20261002_0710)
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/visibility.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  filterRecipesWithLiveResults,
  filterReleasedRecipes,
  hasEndedResultBadge,
  isRecipeReleased,
  keepLiveRarities,
  liveResultRarities,
  recipeReleaseState,
} from '../visibility'

const NOW = new Date('2026-10-10T03:00:00.000Z')

describe('isRecipeReleased — 공개 시각 판정', () => {
  it('valid_from이 null이면 공개(기존 레시피의 지금 동작)', () => {
    expect(isRecipeReleased({ valid_from: null }, NOW)).toBe(true)
  })

  it('valid_from이 undefined면 공개(마이그레이션 204 전 환경 폴백)', () => {
    expect(isRecipeReleased({}, NOW)).toBe(true)
    expect(isRecipeReleased({ valid_from: undefined }, NOW)).toBe(true)
  })

  it('과거 시각이면 공개', () => {
    expect(isRecipeReleased({ valid_from: '2026-10-10T02:59:59.999Z' }, NOW)).toBe(true)
    expect(isRecipeReleased({ valid_from: '2026-09-01T00:00:00.000Z' }, NOW)).toBe(true)
  })

  it('미래 시각이면 숨김', () => {
    expect(isRecipeReleased({ valid_from: '2026-10-10T03:00:00.001Z' }, NOW)).toBe(false)
    expect(isRecipeReleased({ valid_from: '2026-12-01T00:00:00.000Z' }, NOW)).toBe(false)
  })

  it('경계 — valid_from이 지금과 같으면 공개', () => {
    expect(isRecipeReleased({ valid_from: NOW.toISOString() }, NOW)).toBe(true)
  })

  it('해석할 수 없는 문자열이면 숨김(fail-closed)', () => {
    expect(isRecipeReleased({ valid_from: 'not-a-date' }, NOW)).toBe(false)
    expect(isRecipeReleased({ valid_from: '' }, NOW)).toBe(false)
  })

  it('now를 생략하면 현재 시각 기준이다', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isRecipeReleased({ valid_from: past })).toBe(true)
    expect(isRecipeReleased({ valid_from: future })).toBe(false)
  })
})

describe('recipeReleaseState — 공개 상태 이름', () => {
  it('공개된 레시피는 released, 공개 전은 scheduled', () => {
    expect(recipeReleaseState({ valid_from: null }, NOW)).toBe('released')
    expect(recipeReleaseState({ valid_from: '2026-10-01T00:00:00.000Z' }, NOW)).toBe('released')
    expect(recipeReleaseState({ valid_from: '2026-11-01T00:00:00.000Z' }, NOW)).toBe('scheduled')
  })

  it('해석할 수 없는 문자열은 scheduled(숨김과 같은 쪽)', () => {
    expect(recipeReleaseState({ valid_from: 'garbage' }, NOW)).toBe('scheduled')
  })
})

describe('filterReleasedRecipes — 공개된 레시피만 남긴다', () => {
  const recipes = [
    { id: 'always', valid_from: null },
    { id: 'past', valid_from: '2026-10-01T00:00:00.000Z' },
    { id: 'future', valid_from: '2026-10-20T00:00:00.000Z' },
    { id: 'edge', valid_from: NOW.toISOString() },
    { id: 'broken', valid_from: 'nope' },
  ]

  it('공개 전·해석 불가 레시피를 빼고 순서를 유지한다', () => {
    expect(filterReleasedRecipes(recipes, NOW).map((r) => r.id)).toEqual(['always', 'past', 'edge'])
  })

  it('시각이 지나면 들어온다', () => {
    const later = new Date('2026-10-20T00:00:00.000Z')
    expect(filterReleasedRecipes(recipes, later).map((r) => r.id)).toEqual(['always', 'past', 'future', 'edge'])
  })

  it('입력 배열을 바꾸지 않는다', () => {
    const before = recipes.map((r) => r.id)
    filterReleasedRecipes(recipes, NOW)
    expect(recipes.map((r) => r.id)).toEqual(before)
  })

  it('빈 배열은 빈 배열', () => {
    expect(filterReleasedRecipes([], NOW)).toEqual([])
  })
})

describe('종료 시각(valid_until) — 티켓 20261002_0710', () => {
  it('valid_until이 null이면 종료 없음(상시) — 기존 레시피의 지금 동작', () => {
    expect(isRecipeReleased({ valid_from: null, valid_until: null }, NOW)).toBe(true)
    expect(recipeReleaseState({ valid_from: '2026-10-01T00:00:00.000Z', valid_until: null }, NOW)).toBe('released')
  })

  it('valid_until이 undefined(칸이 없는 응답, 마이그레이션 213 전 환경)여도 동작이 바뀌지 않는다', () => {
    expect(isRecipeReleased({}, NOW)).toBe(true)
    expect(isRecipeReleased({ valid_until: undefined }, NOW)).toBe(true)
    expect(recipeReleaseState({ valid_from: '2026-10-01T00:00:00.000Z', valid_until: undefined }, NOW)).toBe('released')
  })

  it('종료 시각이 미래면 공개 중이다', () => {
    expect(isRecipeReleased({ valid_until: '2026-10-10T03:00:00.001Z' }, NOW)).toBe(true)
    expect(isRecipeReleased({ valid_until: '2026-12-01T00:00:00.000Z' }, NOW)).toBe(true)
    expect(recipeReleaseState({ valid_until: '2026-12-01T00:00:00.000Z' }, NOW)).toBe('released')
  })

  it('경계 — valid_until이 지금과 같으면 그 순간부터 종료다', () => {
    expect(isRecipeReleased({ valid_until: NOW.toISOString() }, NOW)).toBe(false)
    expect(recipeReleaseState({ valid_until: NOW.toISOString() }, NOW)).toBe('ended')
  })

  it('종료 시각이 지났으면 종료다', () => {
    expect(isRecipeReleased({ valid_until: '2026-10-10T02:59:59.999Z' }, NOW)).toBe(false)
    expect(recipeReleaseState({ valid_from: '2026-10-01T00:00:00.000Z', valid_until: '2026-10-09T00:00:00.000Z' }, NOW)).toBe(
      'ended'
    )
  })

  it('종료 시각을 해석할 수 없으면 종료로 숨긴다(fail-closed)', () => {
    expect(isRecipeReleased({ valid_until: 'not-a-date' }, NOW)).toBe(false)
    expect(recipeReleaseState({ valid_until: 'not-a-date' }, NOW)).toBe('ended')
    expect(recipeReleaseState({ valid_until: '' }, NOW)).toBe('ended')
  })

  it('공개 전이면 종료 시각이 어떻든 scheduled가 앞선다', () => {
    expect(recipeReleaseState({ valid_from: '2026-11-01T00:00:00.000Z', valid_until: '2026-12-01T00:00:00.000Z' }, NOW)).toBe(
      'scheduled'
    )
    expect(recipeReleaseState({ valid_from: '2026-11-01T00:00:00.000Z', valid_until: '2026-10-01T00:00:00.000Z' }, NOW)).toBe(
      'scheduled'
    )
  })

  it('시각이 흘러 기간 안을 지나면 scheduled → released → ended로 바뀐다', () => {
    const recipe = { valid_from: '2026-10-11T00:00:00.000Z', valid_until: '2026-10-12T00:00:00.000Z' }
    expect(recipeReleaseState(recipe, NOW)).toBe('scheduled')
    expect(recipeReleaseState(recipe, new Date('2026-10-11T00:00:00.000Z'))).toBe('released')
    expect(recipeReleaseState(recipe, new Date('2026-10-11T23:59:59.999Z'))).toBe('released')
    expect(recipeReleaseState(recipe, new Date('2026-10-12T00:00:00.000Z'))).toBe('ended')
  })

  it('filterReleasedRecipes는 종료된 레시피도 뺀다', () => {
    const recipes = [
      { id: 'always', valid_from: null, valid_until: null },
      { id: 'running', valid_from: '2026-10-01T00:00:00.000Z', valid_until: '2026-10-20T00:00:00.000Z' },
      { id: 'ended', valid_from: '2026-10-01T00:00:00.000Z', valid_until: '2026-10-09T00:00:00.000Z' },
      { id: 'ends-now', valid_from: null, valid_until: NOW.toISOString() },
      { id: 'future', valid_from: '2026-10-20T00:00:00.000Z', valid_until: null },
      { id: 'no-until-column', valid_from: null },
    ]
    expect(filterReleasedRecipes(recipes, NOW).map((r) => r.id)).toEqual(['always', 'running', 'no-until-column'])
  })
})

describe('hasEndedResultBadge — 결과 배지의 공개 기간이 끝난 레시피 (티켓 20261018_0055)', () => {
  const PAST = '2026-10-10T02:59:59.999Z'
  const FUTURE = '2026-10-10T03:00:00.001Z'

  it('종료 시각이 지났으면 끝났다', () => {
    expect(hasEndedResultBadge(['b1'], [{ id: 'b1', valid_until: PAST }], NOW)).toBe(true)
  })

  it('경계 — 종료 시각이 지금과 같으면 끝났고, 1ms 뒤면 아직이다', () => {
    expect(hasEndedResultBadge(['b1'], [{ id: 'b1', valid_until: NOW.toISOString() }], NOW)).toBe(true)
    expect(hasEndedResultBadge(['b1'], [{ id: 'b1', valid_until: FUTURE }], NOW)).toBe(false)
  })

  it('종료 시각이 null·undefined면 종료 없음이다', () => {
    expect(hasEndedResultBadge(['b1'], [{ id: 'b1', valid_until: null }], NOW)).toBe(false)
    expect(hasEndedResultBadge(['b1'], [{ id: 'b1' }], NOW)).toBe(false)
  })

  it('해석할 수 없는 종료 시각은 끝난 것으로 본다(fail-closed)', () => {
    expect(hasEndedResultBadge(['b1'], [{ id: 'b1', valid_until: 'not-a-date' }], NOW)).toBe(true)
  })

  it('결과 배지 중 하나라도 끝났으면 끝난 레시피다. 레시피와 상관없는 배지는 보지 않는다', () => {
    const badges = [
      { id: 'b1', valid_until: FUTURE },
      { id: 'b2', valid_until: PAST },
      { id: 'other', valid_until: PAST },
    ]
    expect(hasEndedResultBadge(['b1', 'b2'], badges, NOW)).toBe(true)
    expect(hasEndedResultBadge(['b1'], badges, NOW)).toBe(false)
  })

  it('결과 배지가 없거나 조회되지 않은 배지(삭제)는 판정하지 않는다', () => {
    expect(hasEndedResultBadge([], [{ id: 'b1', valid_until: PAST }], NOW)).toBe(false)
    expect(hasEndedResultBadge(null, [{ id: 'b1', valid_until: PAST }], NOW)).toBe(false)
    expect(hasEndedResultBadge(['gone'], [], NOW)).toBe(false)
  })

  it('filterRecipesWithLiveResults는 끝난 결과가 있는 레시피만 빼고 순서를 지키며 입력을 바꾸지 않는다', () => {
    const recipes = [
      { id: 'r1', reward_badge_ids: ['b1'] },
      { id: 'r2', reward_badge_ids: ['b2'] },
      { id: 'r3', reward_badge_ids: [] },
    ]
    const badges = [{ id: 'b2', valid_until: PAST }]
    expect(filterRecipesWithLiveResults(recipes, badges, NOW).map((r) => r.id)).toEqual(['r1', 'r3'])
    expect(recipes).toHaveLength(3)
  })
})

describe('등급 대응형 레시피의 결과 공개 판정 (티켓 20261114_1705 3회)', () => {
  const PAST = '2026-10-10T02:59:59.999Z'
  const follow = { id: 'f', grade_mode: 'follow_materials', reward_badge_ids: ['c', 'r', 'e', 'm'] }
  const live = [
    { id: 'c', rarity: 'common', valid_until: null },
    { id: 'r', rarity: 'rare', valid_until: null },
    { id: 'e', rarity: 'epic', valid_until: null },
    { id: 'm', rarity: 'mystic', valid_until: null },
  ]
  const withEnded = (id: string) => live.map((b) => (b.id === id ? { ...b, valid_until: PAST } : b))

  it('한 등급만 끝나면 레시피는 남고 그 등급만 살아 있는 등급에서 빠진다', () => {
    const badges = withEnded('e')
    expect(filterRecipesWithLiveResults([follow], badges, NOW)).toHaveLength(1)
    expect([...liveResultRarities(follow.reward_badge_ids, badges, NOW)].sort()).toEqual(['common', 'mystic', 'rare'])
  })

  it('모든 등급이 끝나면 레시피를 뺀다', () => {
    const badges = live.map((b) => ({ ...b, valid_until: PAST }))
    expect(filterRecipesWithLiveResults([follow], badges, NOW)).toEqual([])
  })

  it('한 등급의 배지가 하나도 조회되지 않아도(삭제) 남은 등급이 있으면 남기고, 모두 없으면 뺀다', () => {
    expect(filterRecipesWithLiveResults([follow], live.slice(0, 2), NOW)).toHaveLength(1)
    expect(filterRecipesWithLiveResults([follow], [], NOW)).toEqual([])
  })

  it('같은 등급의 배지 중 하나라도 끝났으면 그 등급은 살아 있지 않다(서버 판정과 같다)', () => {
    const recipe = { id: 'f2', grade_mode: 'follow_materials', reward_badge_ids: ['r1', 'r2'] }
    const badges = [
      { id: 'r1', rarity: 'rare', valid_until: null },
      { id: 'r2', rarity: 'rare', valid_until: PAST },
    ]
    expect(filterRecipesWithLiveResults([recipe], badges, NOW)).toEqual([])
  })

  it('등급 고정형은 보상 배지 하나라도 끝나면 뺀다(지금 그대로)', () => {
    const fixed = { id: 'x', grade_mode: 'fixed', reward_badge_ids: ['c', 'r'] }
    const unset = { id: 'y', reward_badge_ids: ['c', 'r'] }
    expect(filterRecipesWithLiveResults([fixed, unset], withEnded('r'), NOW)).toEqual([])
    expect(filterRecipesWithLiveResults([fixed, unset], live, NOW)).toHaveLength(2)
  })

  it('보상 배지가 0개인 레시피는 유형과 상관없이 남긴다', () => {
    const none = { id: 'n', grade_mode: 'follow_materials', reward_badge_ids: [] }
    expect(filterRecipesWithLiveResults([none], [], NOW)).toHaveLength(1)
  })

  it('keepLiveRarities는 끝난 등급과 등급 없는 배지를 빼고 낮은 등급부터 세운다', () => {
    const badges = [
      { id: 'm', rarity: 'mystic' },
      { id: 'c', rarity: 'common' },
      { id: 'e', rarity: 'epic' },
      { id: 'x', rarity: null },
      { id: 'r', rarity: 'rare' },
    ]
    expect(keepLiveRarities(badges, new Set(['common', 'rare', 'mystic'])).map((b) => b.id)).toEqual(['c', 'r', 'm'])
    expect(badges).toHaveLength(5)
  })
})
