/**
 * 온보딩 퀘스트 4~5단계(mix_fail=레시피 확인, mix_success=믹스 성공) 연출 분기
 * (티켓 20260927_2127, 상위 20260927_2123 T4). 펄스 강조 판정(`computeQuestPulseTarget`)은
 * 티켓 20260928_1755(상위 T4) 추가.
 *
 * 저장소에 jsdom·testing-library가 없어(`QuestPickupScene.test.tsx`와 같은 방식) 클릭·
 * 슬롯 채우기 같은 실제 상호작용은 시뮬레이션할 수 없다. 그래서 갈래를 나눠 고정한다:
 * 1) 순수 함수(`shouldRecordMixFail`·`buildDemoCombineResult`·`computeQuestPulseTarget`) —
 *    demoMode에서 mix_fail을 한 번만 기록하는 판정, 실제 /api/combine 응답 없이 로컬로
 *    구성하는 결과값, 「지금 눌러야 할 요소」 하나를 고르는 로직.
 * 2) 서버 렌더(`renderToStaticMarkup`) — demoMode에서는 연출 레시피 1건만 보이고, 그 밖의
 *    경우(questStep 없음)는 넘겨받은 실제 레시피 목록이 그대로 보인다(회귀 방지). 슬롯/시트/
 *    버튼 전환은 jsdom 부재로 검증 불가 — 레시피 미선택 시 펄스 클래스 유무만 정적 렌더로 확인한다.
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

import CombineClient, {
  shouldRecordMixFail,
  buildDemoCombineResult,
  computeQuestPulseTarget,
} from './CombineClient'
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

  // 티켓 20260928_1755: 레시피 미선택 상태에서 mix_fail·mix_success 둘 다 레시피 행에
  // 펄스가 붙는다(사용자 승인 결정 1). 슬롯/시트/버튼 전환은 jsdom 부재로 정적 렌더로
  // 검증할 수 없어 computeQuestPulseTarget 단위 테스트로 별도 커버한다.
  it.each(['mix_fail', 'mix_success'] as const)(
    'questStep이 %s이고 레시피 미선택이면 레시피 행에 jam-quest-pulse 클래스가 붙는다',
    (questStep) => {
      const html = renderToStaticMarkup(
        <CombineClient
          items={DEMO_MIX_ITEMS}
          publicRecipes={[DEMO_MIX_RECIPE]}
          ownedConditionBadgeIds={[]}
          questStep={questStep}
        />
      )
      expect(html).toContain('jam-quest-pulse')
    }
  )

  it('questStep이 없으면(비연출 모드) 평소 레시피 목록에 펄스 클래스가 없다', () => {
    const html = renderToStaticMarkup(
      <CombineClient
        items={[]}
        publicRecipes={[DEMO_MIX_RECIPE]}
        ownedConditionBadgeIds={[]}
        questStep={null}
      />
    )
    expect(html).not.toContain('jam-quest-pulse')
  })
})

describe('computeQuestPulseTarget', () => {
  const base = {
    questStep: 'mix_fail' as const,
    loading: false,
    selectedRecipe: null,
    fills: {},
    bagSlotId: null,
    bagRows: [],
    canSubmit: false,
  }
  const [slot1, slot2] = DEMO_MIX_RECIPE.slots
  const dummyFill = { refId: 'r', badgeId: 'b', name: 'n', imageUrl: null }

  it('퀘스트 차례가 아니면(questStep null) 항상 null이다', () => {
    expect(computeQuestPulseTarget({ ...base, questStep: null, selectedRecipe: DEMO_MIX_RECIPE })).toBeNull()
  })

  it('제출 중(loading)이면 항상 null이다', () => {
    expect(
      computeQuestPulseTarget({ ...base, loading: true, selectedRecipe: DEMO_MIX_RECIPE, canSubmit: true })
    ).toBeNull()
  })

  it('레시피를 아직 고르지 않았으면 레시피 행을 가리킨다(mix_fail·mix_success 공통)', () => {
    expect(computeQuestPulseTarget({ ...base, selectedRecipe: null })).toEqual({ type: 'recipe' })
    expect(computeQuestPulseTarget({ ...base, questStep: 'mix_success', selectedRecipe: null })).toEqual({
      type: 'recipe',
    })
  })

  it('mix_fail: 선택 후 빈 슬롯이 있으면 slot_order가 빠른 첫 빈 슬롯을 가리킨다', () => {
    expect(
      computeQuestPulseTarget({ ...base, selectedRecipe: DEMO_MIX_RECIPE, fills: {} })
    ).toEqual({ type: 'slot', slotId: slot1.id })

    expect(
      computeQuestPulseTarget({
        ...base,
        selectedRecipe: DEMO_MIX_RECIPE,
        fills: { [slot1.id]: dummyFill },
      })
    ).toEqual({ type: 'slot', slotId: slot2.id })
  })

  it('mix_fail: 두 슬롯이 모두 채워지면 null이다(제출 버튼 경로를 정의하지 않음)', () => {
    expect(
      computeQuestPulseTarget({
        ...base,
        selectedRecipe: DEMO_MIX_RECIPE,
        fills: { [slot1.id]: dummyFill, [slot2.id]: dummyFill },
      })
    ).toBeNull()
  })

  it('mix_success: 가방 시트가 열려 있으면 활성 후보 행 중 첫 번째를 가리킨다', () => {
    const bagRows = [
      { key: 'needed-1', refId: null, badgeId: 'b1', name: 'n1', imageUrl: null, state: 'needed' as const },
      { key: 'active-1', refId: 'r1', badgeId: 'b1', name: 'n1', imageUrl: null, state: 'active' as const },
      { key: 'active-2', refId: 'r2', badgeId: 'b2', name: 'n2', imageUrl: null, state: 'active' as const },
    ]
    expect(
      computeQuestPulseTarget({
        ...base,
        questStep: 'mix_success',
        selectedRecipe: DEMO_MIX_RECIPE,
        bagSlotId: slot1.id,
        bagRows,
      })
    ).toEqual({ type: 'bagRow', key: 'active-1' })
  })

  it('mix_success: 시트가 닫혀 있고 빈 슬롯이 있으면 다음 빈 슬롯을 가리킨다', () => {
    expect(
      computeQuestPulseTarget({
        ...base,
        questStep: 'mix_success',
        selectedRecipe: DEMO_MIX_RECIPE,
        fills: { [slot1.id]: dummyFill },
        bagSlotId: null,
      })
    ).toEqual({ type: 'slot', slotId: slot2.id })
  })

  it('mix_success: 시트가 닫혀 있고 canSubmit이면 조합하기 버튼을 가리킨다', () => {
    expect(
      computeQuestPulseTarget({
        ...base,
        questStep: 'mix_success',
        selectedRecipe: DEMO_MIX_RECIPE,
        fills: { [slot1.id]: dummyFill, [slot2.id]: dummyFill },
        bagSlotId: null,
        canSubmit: true,
      })
    ).toEqual({ type: 'submit' })
  })
})
