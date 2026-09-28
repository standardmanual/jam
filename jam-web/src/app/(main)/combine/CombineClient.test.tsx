/**
 * 온보딩 퀘스트 4~5단계(mix_fail=레시피 확인, mix_success=믹스 성공) 연출 분기
 * (티켓 20260927_2127, 상위 20260927_2123 T4).
 *
 * 저장소에 jsdom·testing-library가 없어(`QuestPickupScene.test.tsx`와 같은 방식) 클릭·
 * 슬롯 채우기 같은 실제 상호작용은 시뮬레이션할 수 없다. 그래서 두 갈래로 나눠 고정한다:
 * 1) 순수 함수(`shouldRecordMixFail`·`buildDemoCombineResult`) — demoMode에서 mix_fail을
 *    한 번만 기록하는 판정과, 실제 /api/combine 응답 없이 로컬로 구성하는 결과값의 핵심 로직.
 * 2) 서버 렌더(`renderToStaticMarkup`) — demoMode에서는 연출 레시피 1건만 보이고, 그 밖의
 *    경우(questStep 없음)는 넘겨받은 실제 레시피 목록이 그대로 보인다(회귀 방지).
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/combine',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

import CombineClient, { shouldRecordMixFail, buildDemoCombineResult } from './CombineClient'
import { DEMO_MIX_RECIPE, DEMO_MIX_ITEMS } from '@/lib/onboarding-quest/demo-data'

describe('shouldRecordMixFail', () => {
  it('연출 모드이고 아직 기록하지 않았으면 기록한다', () => {
    expect(shouldRecordMixFail(true, false)).toBe(true)
  })

  it('연출 모드가 아니면 기록하지 않는다', () => {
    expect(shouldRecordMixFail(false, false)).toBe(false)
  })

  it('이미 기록했으면 다시 기록하지 않는다', () => {
    expect(shouldRecordMixFail(true, true)).toBe(false)
  })
})

describe('buildDemoCombineResult', () => {
  it('DEMO_MIX_RECIPE의 보상 배지·포인트를 그대로 결과값으로 옮긴다', () => {
    const result = buildDemoCombineResult(DEMO_MIX_RECIPE)
    expect(result.success).toBe(true)
    expect(result.points).toBe(DEMO_MIX_RECIPE.reward_points)
    expect(result.badges).toHaveLength(1)
    expect(result.badges[0].id).toBe(DEMO_MIX_RECIPE.rewardBadges[0].id)
    expect(result.badges[0].name).toBe('최고급 캣닢 뭉치')
  })
})

describe('CombineClient 초기 렌더', () => {
  it('questStep이 mix_fail이면 연출 레시피(살롱의 장물 시세) 1건만 보인다', () => {
    const html = renderToStaticMarkup(
      <CombineClient
        items={DEMO_MIX_ITEMS}
        publicRecipes={[DEMO_MIX_RECIPE]}
        ownedConditionBadgeIds={[]}
        questStep="mix_fail"
      />
    )
    expect(html).toContain('살롱의 장물 시세')
  })

  it('questStep이 없으면(비연출 모드) 넘겨받은 실제 레시피 목록이 그대로 보인다', () => {
    const otherRecipe = {
      ...DEMO_MIX_RECIPE,
      id: 'other-recipe-1',
      name: '다른 레시피',
    }
    const html = renderToStaticMarkup(
      <CombineClient items={[]} publicRecipes={[otherRecipe]} ownedConditionBadgeIds={[]} questStep={null} />
    )
    expect(html).toContain('다른 레시피')
    expect(html).not.toContain('살롱의 장물 시세')
  })
})
