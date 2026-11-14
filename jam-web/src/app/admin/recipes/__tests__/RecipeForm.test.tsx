/**
 * 레시피 폼의 설명·보상 없음·결과 잠김 입력 (티켓 20261018_0055)
 *
 * 확인하는 것: 설명 입력(최대 길이는 서버 검증과 같은 `MAX_DESCRIPTION_LENGTH`), 보상 «없음»과 결과 잠김 선택이 그려지고
 * 기존 레시피의 저장 값이 초기 상태로 반영된다.
 * jsdom이 없어(`vitest.config.ts` `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인한다. 서버 렌더는 이어 붙은
 * 글자 사이에 `<!-- -->`를 끼우므로 주석을 지운 글로 비교한다.
 *
 * 티켓 20261114_1705 2회차: 레시피 유형(등급 대응형 / 등급 고정형)에 따라 재료·보상 선택 칸이 묶음 선택으로 바뀌고, 첫 성공자 보상 칸이 그려진다.
 * 이미 성공 기록이 있는 레시피는 첫 성공자 보상 칸이 잠긴다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/recipes/__tests__/RecipeForm.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import RecipeForm from '../RecipeForm'
import { MAX_DESCRIPTION_LENGTH } from '@/lib/combine/recipe-payload'
import type { CombinationRecipeRow } from '@/types/database'

type Props = Parameters<typeof RecipeForm>[0]

function render(overrides: Partial<Props> = {}): string {
  const props: Props = { badges: [], tribes: [], itemBooks: [], ...overrides }
  return renderToStaticMarkup(<RecipeForm {...props} />).replace(/<!-- -->/g, '')
}

const recipe = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '등급 올리기',
  reward_points: 0,
  reward_badge_ids: [],
  valid_from: null,
  valid_until: null,
  description: '같은 등급 5개를 모아요',
  reward_locked: true,
  allow_no_reward: true,
  created_at: '2026-10-18T00:00:00Z',
} as unknown as CombinationRecipeRow

describe('RecipeForm — 설명·보상 없음·결과 잠김', () => {
  it('새 레시피는 설명 입력과 두 선택을 그리고 둘 다 꺼져 있다', () => {
    const out = render()

    expect(out).toContain('id="recipe-description"')
    expect(out).toContain(`maxLength="${MAX_DESCRIPTION_LENGTH}"`)
    expect(out).toContain(`0/${MAX_DESCRIPTION_LENGTH}자`)
    expect(out).toContain('id="recipe-allow-no-reward"')
    expect(out).toContain('id="recipe-reward-locked"')
    expect(out).toContain('보상 없음')
    expect(out).toContain('결과를 잠긴 채 지급')
    expect(out).toMatch(/aria-checked="false"[^>]*id="recipe-allow-no-reward"/)
    expect(out).toMatch(/aria-checked="false"[^>]*id="recipe-reward-locked"/)
  })

  it('저장된 레시피의 설명과 켜진 선택을 초기 값으로 보여 준다', () => {
    const out = render({ recipe, slots: [] })

    expect(out).toContain('같은 등급 5개를 모아요')
    expect(out).toContain(`13/${MAX_DESCRIPTION_LENGTH}자`)
    expect(out).toMatch(/aria-checked="true"[^>]*id="recipe-allow-no-reward"/)
    expect(out).toMatch(/aria-checked="true"[^>]*id="recipe-reward-locked"/)
  })

  it('새 문구에 한국어 줄바꿈 클래스가 붙는다', () => {
    const out = render()

    expect(out).toMatch(/for="recipe-description"[^>]*break-keep[^>]*wrap-break-word/)
    expect(out).toMatch(/id="recipe-allow-no-reward-help"[^>]*break-keep[^>]*wrap-break-word/)
    expect(out).toMatch(/id="recipe-reward-locked-help"[^>]*break-keep[^>]*wrap-break-word/)
  })
})

describe('RecipeForm — 레시피 유형과 첫 성공자 보상 (티켓 20261114_1705 2회차)', () => {
  it('새 레시피는 등급 대응형이 기본이라 재료·보상을 아이템 배지 묶음으로 고른다', () => {
    const out = render()

    expect(out).toContain('id="recipe-grade-mode"')
    expect(out).toContain('등급 대응형은 같은 컬렉션·같은 이름의 4등급이 모두 있는 아이템 배지 묶음만 후보로 고를 수 있어요.')
    expect(out).toContain('보상 배지 묶음 검색...')
    expect(out).toContain('슬롯 1 후보 배지 묶음 검색...')
    expect(out).not.toContain('placeholder="보상 배지 검색..."')
    expect(out).not.toContain('등록한 레시피는 유형을 바꿀 수 없어요')
  })

  it('저장된 등급 고정형 레시피는 배지 하나씩 고르는 칸을 보이고 유형을 바꿀 수 없다고 알린다', () => {
    const out = render({ recipe: { ...recipe, grade_mode: 'fixed' }, slots: [] })

    expect(out).toContain('placeholder="보상 배지 검색..."')
    expect(out).not.toContain('보상 배지 묶음 검색...')
    expect(out).toContain('등록한 레시피는 유형을 바꿀 수 없어요. 다른 유형이 필요하면 새 레시피로 등록해 주세요.')
  })

  it('저장된 등급 대응형 레시피는 보상을 묶음 단위로 보여 준다', () => {
    const badges = ['c', 'r', 'e', 'm'].map((g, i) => ({
      id: `sign-${g}`,
      name: '칸 번호 팻말',
      rarity: ['common', 'rare', 'epic', 'mystic'][i] as 'common',
      type: 'item' as const,
      item_book_id: 'book-1',
    }))
    const out = render({
      recipe: { ...recipe, grade_mode: 'follow_materials', reward_badge_ids: badges.map((b) => b.id) },
      slots: [],
      badges,
    })

    expect(out).toContain('칸 번호 팻말 · 4등급')
    expect(out).toContain('보상 배지 묶음 검색...')
  })

  it('첫 성공자 보상 칸을 그리고 한국어 줄바꿈 클래스를 붙인다', () => {
    const out = render()

    expect(out).toContain('첫 성공자 보상 (선택)')
    expect(out).toContain('첫 성공자 보상 배지 검색...')
    expect(out).toMatch(/<label[^>]*break-keep[^>]*wrap-break-word[^>]*>\s*첫 성공자 보상 \(선택\)/)
  })

  it('저장된 첫 성공자 보상 배지의 이름을 처음 값으로 보여 준다', () => {
    const out = render({
      recipe: { ...recipe, first_success_badge_id: 'first-1' },
      slots: [],
      badges: [{ id: 'first-1', name: '첫 성공 기념', rarity: 'mystic', type: 'item', item_book_id: null }],
    })

    expect(out).toContain('첫 성공 기념')
  })

  it('이미 성공한 유저가 있으면 첫 성공자 보상 칸을 잠그고 안내한다', () => {
    const out = render({ recipe, slots: [], hasSuccessLogs: true })

    expect(out).toContain('이미 믹스에 성공한 유저가 있어 첫 성공자 보상을 바꿀 수 없어요.')
    expect(out).not.toContain('첫 성공자 보상 배지 검색...')
  })
})
