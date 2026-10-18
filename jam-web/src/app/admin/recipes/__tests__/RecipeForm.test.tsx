/**
 * 레시피 폼의 설명·보상 없음·결과 잠김 입력 (티켓 20261018_0055)
 *
 * 확인하는 것: 설명 입력(최대 길이는 서버 검증과 같은 `MAX_DESCRIPTION_LENGTH`), 보상 «없음»과 결과 잠김 선택이 그려지고
 * 기존 레시피의 저장 값이 초기 상태로 반영된다.
 * jsdom이 없어(`vitest.config.ts` `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 확인한다. 서버 렌더는 이어 붙은
 * 글자 사이에 `<!-- -->`를 끼우므로 주석을 지운 글로 비교한다.
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
