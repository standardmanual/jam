import { describe, it, expect, beforeEach } from 'vitest'
import {
  closeAction,
  markOpenedByPush,
  recipeHref,
  recipeOpenMethod,
  resolveCombineView,
  tierUpHref,
  wasOpenedByPush,
} from '../navigation'

const IDS = ['r1', 'r2']

describe('resolveCombineView', () => {
  it('쿼리가 없으면 목록이고 정리할 것이 없다', () => {
    expect(resolveCombineView({ recipe: null, view: null }, IDS)).toEqual({ kind: 'list', recipeId: null, needsCleanup: false })
  })

  it('공개 목록에 있는 레시피 ID는 상세다', () => {
    expect(resolveCombineView({ recipe: 'r2', view: null }, IDS)).toEqual({ kind: 'recipe', recipeId: 'r2', needsCleanup: false })
  })

  it('공개 목록에 없는 ID와 빈 값은 목록으로 보내고 주소를 정리한다', () => {
    expect(resolveCombineView({ recipe: 'ended', view: null }, IDS)).toEqual({ kind: 'list', recipeId: null, needsCleanup: true })
    expect(resolveCombineView({ recipe: '', view: null }, IDS)).toEqual({ kind: 'list', recipeId: null, needsCleanup: true })
    expect(resolveCombineView({ recipe: 'r1', view: null }, [])).toEqual({ kind: 'list', recipeId: null, needsCleanup: true })
  })

  it('알 수 없는 view 값도 목록으로 보내고 정리한다', () => {
    expect(resolveCombineView({ recipe: null, view: 'unknown' }, IDS)).toEqual({ kind: 'list', recipeId: null, needsCleanup: true })
  })

  it('view=tier-up은 등급 올리기이고, recipe가 같이 있어도 이긴다', () => {
    expect(resolveCombineView({ recipe: null, view: 'tier-up' }, IDS).kind).toBe('tierUp')
    expect(resolveCombineView({ recipe: 'r1', view: 'tier-up' }, IDS)).toEqual({ kind: 'tierUp', recipeId: null, needsCleanup: false })
  })
})

describe('주소 만들기', () => {
  it('레시피 상세와 등급 올리기 주소', () => {
    expect(recipeHref('abc-123')).toBe('/combine?recipe=abc-123')
    expect(recipeHref('a b&c')).toBe('/combine?recipe=a%20b%26c')
    expect(tierUpHref()).toBe('/combine?view=tier-up')
  })
})

describe('열기·닫기 방식', () => {
  beforeEach(() => markOpenedByPush(false))

  it('목록에서 열면 push, 이미 열린 상세에서 바꾸면 replace', () => {
    expect(recipeOpenMethod(null)).toBe('push')
    expect(recipeOpenMethod('r1')).toBe('replace')
  })

  it('push로 열었으면 back, 아니면 replace', () => {
    expect(closeAction(true)).toBe('back')
    expect(closeAction(false)).toBe('replace')
  })

  it('push 표시는 기본이 false이고 켜고 끌 수 있다', () => {
    expect(wasOpenedByPush()).toBe(false)
    markOpenedByPush(true)
    expect(wasOpenedByPush()).toBe(true)
  })
})
