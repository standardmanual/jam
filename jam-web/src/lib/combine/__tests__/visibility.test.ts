/**
 * 믹스 레시피 공개 판정 — 공개 시각(valid_from)·종료 시각(valid_until) 규칙 (티켓 20261001_1157, 20261002_0710)
 *
 * 실행: cd jam-web && npx vitest run src/lib/combine/__tests__/visibility.test.ts
 */
import { describe, it, expect } from 'vitest'
import { filterReleasedRecipes, isRecipeReleased, recipeReleaseState } from '../visibility'

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
