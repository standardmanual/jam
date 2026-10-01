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
 *
 * 티켓 20261001_1159(운영자 시험 믹스) 추가분: 클릭·상태 전환은 jsdom이 없어도 검증할 수 있게
 * `react`의 `useState`·`useMemo`만 «손으로 돌리는 상태 저장소»로 바꿔 끼우고(`hooks.active`일 때만),
 * 컴포넌트 함수를 직접 호출해 나온 엘리먼트 트리에서 핸들러(`onClick`·`onClose`)를 꺼내 부른다.
 * 하위 컴포넌트는 렌더하지 않고 props만 본다. 그 밖의 테스트는 실제 React 훅으로 돈다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const toastMock = vi.hoisted(() => vi.fn())

/** 손으로 돌리는 훅 저장소 — `active`일 때만 `useState`·`useMemo`를 대신한다(티켓 20261001_1159). */
const hooks = vi.hoisted(() => ({
  active: false,
  store: [] as unknown[],
  cursor: 0,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial)
      const index = hooks.cursor++
      if (!(index in hooks.store)) {
        hooks.store[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      }
      const set = (next: unknown) => {
        hooks.store[index] = typeof next === 'function' ? (next as (prev: unknown) => unknown)(hooks.store[index]) : next
      }
      return [hooks.store[index], set]
    },
    useMemo: (factory: () => unknown, deps: unknown[]) => (hooks.active ? factory() : actual.useMemo(factory, deps)),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/combine',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

import CombineClient, {
  shouldRecordMixFail,
  buildDemoCombineResult,
  computeQuestPulseTarget,
  resolveQuestPulseStep,
  testMixNoticeOnClose,
  type RecipeWithSlots,
} from './CombineClient'
import RecipeRewardRow from './RecipeRewardRow'
import BadgeRevealOverlay from '@/components/BadgeRevealOverlay'
import { d } from '@/lib/i18n'
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

describe('resolveQuestPulseStep (티켓 20260928_2155)', () => {
  it('가방을 처음 열어 mix_fail을 기록하면 같은 화면에서 mix_success 규칙으로 판정한다', () => {
    expect(resolveQuestPulseStep('mix_fail', false)).toBe('mix_fail')
    expect(resolveQuestPulseStep('mix_fail', true)).toBe('mix_success')
    expect(resolveQuestPulseStep('mix_success', false)).toBe('mix_success')
    expect(resolveQuestPulseStep(null, true)).toBe(null)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 티켓 20261001_1159 — 운영자 미리보기와 시험 믹스
// ─────────────────────────────────────────────────────────────────────────────

// 2026-10-06 15:30 KST — 서버가 내려주는 공개 시각(KST 고정 표기라 실행 환경 시간대와 무관하다)
const RELEASE_AT = '2026-10-06T06:30:00.000Z'
const RELEASE_LABEL = '10월 6일 오후 3시 30분'

/** 슬롯이 없는 레시피 — 슬롯을 채우지 않아도 믹스하기 핸들러가 바로 돈다. */
function recipeFixture(overrides: Partial<RecipeWithSlots> = {}): RecipeWithSlots {
  return { ...DEMO_MIX_RECIPE, id: 'recipe-1', name: '테스트 레시피', slots: [], ...overrides }
}

type AnyElement = ReactElement<Record<string, unknown>>

function findAll(node: ReactNode, predicate: (el: AnyElement) => boolean, found: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => findAll(child, predicate, found))
    return found
  }
  if (!isValidElement(node)) return found
  const el = node as AnyElement
  if (predicate(el)) found.push(el)
  findAll(el.props.children as ReactNode, predicate, found)
  return found
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node as AnyElement).props.children as ReactNode)
  return ''
}

describe('RecipeRewardRow — 공개 예정 줄 (티켓 20261001_1159)', () => {
  const baseProps = { title: '레시피', slotCount: 2, badges: [], points: 100 }

  it('releaseAt이 있으면 「공개 예정 ·」과 날짜(요일 없음, 오후 3시 30분 형식)가 두 조각으로 보인다', () => {
    const html = renderToStaticMarkup(<RecipeRewardRow {...baseProps} releaseAt={RELEASE_AT} />)
    expect(html).toContain(`${d.combine.releaseScheduled} ·`)
    expect(html).toContain(RELEASE_LABEL)
    // 두 조각 모두 줄바꿈 없이 통째로 움직이고, 색은 --color-warning 토큰이다(색을 hex로 직접 쓰지 않는다)
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(2)
    expect(html).toContain('var(--color-warning)')
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/)
  })

  it('releaseAt이 없거나 null이면 줄이 없다 — 지금과 같은 렌더다', () => {
    const withoutProp = renderToStaticMarkup(<RecipeRewardRow {...baseProps} />)
    const withNull = renderToStaticMarkup(<RecipeRewardRow {...baseProps} releaseAt={null} />)
    expect(withoutProp).not.toContain(d.combine.releaseScheduled)
    expect(withNull).toBe(withoutProp)
  })
})

describe('CombineClient — 공개 예정 표시 (티켓 20261001_1159)', () => {
  it('releaseAt이 있는 행에만 「공개 예정」 줄이 보이고, 없는 행에는 없다', () => {
    const scheduled = recipeFixture({ id: 'recipe-scheduled', name: '공개 전 레시피', releaseAt: RELEASE_AT })
    const released = recipeFixture({ id: 'recipe-released', name: '공개된 레시피', releaseAt: null })
    const html = renderToStaticMarkup(
      <CombineClient items={[]} publicRecipes={[scheduled, released]} ownedConditionBadgeIds={[]} />
    )
    expect(html).toContain('공개 전 레시피')
    expect(html).toContain('공개된 레시피')
    // 「공개 예정」 줄은 정확히 한 번 — 공개 전 행에만 붙는다
    expect(html.split(`${d.combine.releaseScheduled} ·`)).toHaveLength(2)
    expect(html).toContain(RELEASE_LABEL)
  })

  it('releaseAt 필드가 없는 레시피(온보딩 연출 레시피 등)는 줄이 없다', () => {
    const html = renderToStaticMarkup(
      <CombineClient items={[]} publicRecipes={[DEMO_MIX_RECIPE]} ownedConditionBadgeIds={[]} />
    )
    expect(html).not.toContain(d.combine.releaseScheduled)
  })
})

describe('CombineClient — 믹서 화면과 시험 믹스 결과 안내 (티켓 20261001_1159)', () => {
  beforeEach(() => {
    toastMock.mockClear()
    hooks.active = true
    hooks.store = []
  })

  afterEach(() => {
    hooks.active = false
    vi.unstubAllGlobals()
  })

  /** 컴포넌트 함수를 직접 부른다 — 호출 때마다 훅 커서를 처음으로 돌린 새 트리를 돌려준다. */
  function createScreen(recipe: RecipeWithSlots) {
    const props = { items: [], publicRecipes: [recipe], ownedConditionBadgeIds: [] }
    const render = () => {
      hooks.cursor = 0
      return CombineClient(props)
    }
    const overlay = (tree: ReactNode) => findAll(tree, (el) => el.type === BadgeRevealOverlay)[0]
    const ctaButton = (tree: ReactNode) =>
      findAll(tree, (el) => el.type === 'button' && String(el.props.className).includes('max-w-[220px]'))[0]
    /** 목록에서 레시피 행을 눌러 믹서 화면으로 들어간다 */
    const openMixer = () => {
      const row = findAll(render(), (el) => el.type === RecipeRewardRow)[0]
      ;(row.props.onClick as () => void)()
      return render()
    }
    return { render, overlay, ctaButton, openMixer }
  }

  function stubMixResponse(body: Record<string, unknown>) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => body })))
  }

  it('공개 전 레시피를 고르면 요약 바에 같은 releaseAt이 전달되고 CTA 아래에 사전 안내 캡션이 나온다', () => {
    const screen = createScreen(recipeFixture({ releaseAt: RELEASE_AT }))
    const mixer = screen.openMixer()

    const summary = findAll(mixer, (el) => el.type === RecipeRewardRow)
    expect(summary).toHaveLength(1)
    expect(summary[0].props.releaseAt).toBe(RELEASE_AT)

    const captions = findAll(mixer, (el) => el.type === 'p' && textOf(el) === d.combine.testMixPreNotice)
    expect(captions).toHaveLength(1)
    // burnNotice와 같은 모양(크기·색·정렬)에 두 줄 줄바꿈 보정(break-keep·text-balance)만 더한다
    expect(captions[0].props.className).toBe(
      'text-[length:var(--text-caption)] text-text-secondary text-center break-keep text-balance',
    )
  })

  it('공개된 레시피(releaseAt 없음)는 요약 바에도 CTA 아래에도 공개 예정 표시가 없다', () => {
    const screen = createScreen(recipeFixture({ releaseAt: null }))
    const mixer = screen.openMixer()

    const summary = findAll(mixer, (el) => el.type === RecipeRewardRow)[0]
    expect(summary.props.releaseAt).toBeNull()
    expect(findAll(mixer, (el) => el.type === 'p' && textOf(el) === d.combine.testMixPreNotice)).toHaveLength(0)
  })

  it('시험 믹스(응답 testMix: true)는 오버레이가 떠 있는 동안 토스트가 없고 닫는 순간 info 토스트가 한 번 뜬다', async () => {
    stubMixResponse({
      success: true,
      path: 'recipe',
      resultBadges: [{ id: 'reward-1', name: '보상 배지', rarity: 'rare' }],
      pointsAwarded: 100,
      testMix: true,
    })
    const screen = createScreen(recipeFixture({ releaseAt: RELEASE_AT }))
    await (screen.ctaButton(screen.openMixer()).props.onClick as () => Promise<void>)()

    // 결과 오버레이가 떠 있다 — 이 동안에는 토스트를 띄우지 않는다
    const shown = screen.overlay(screen.render())
    expect(shown.props.open).toBe(true)
    expect(toastMock).not.toHaveBeenCalled()

    ;(shown.props.onClose as () => void)()

    expect(screen.overlay(screen.render()).props.open).toBe(false)
    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith(d.combine.testMixNotice, 'info')
  })

  it('시험 믹스 실패(위로 포인트 포함)도 emptyMessage 오버레이가 평소처럼 뜨고 닫을 때 같은 토스트가 한 번 뜬다', async () => {
    stubMixResponse({
      success: false,
      reason: 'no_recipe_match',
      pointsAwarded: 5,
      message: '재료가 뒤섞이더니 흔적도 없이 사라졌어요. 그래도 5 포인트가 남았어요.',
      testMix: true,
    })
    const screen = createScreen(recipeFixture({ releaseAt: RELEASE_AT }))
    await (screen.ctaButton(screen.openMixer()).props.onClick as () => Promise<void>)()

    const shown = screen.overlay(screen.render())
    expect(shown.props.open).toBe(true)
    expect(shown.props.emptyMessage).toContain('5 포인트')
    expect(toastMock).not.toHaveBeenCalled()

    ;(shown.props.onClose as () => void)()

    expect(toastMock).toHaveBeenCalledTimes(1)
    expect(toastMock).toHaveBeenCalledWith(d.combine.testMixNotice, 'info')
  })

  it('일반 믹스(응답에 testMix 없음)는 닫아도 토스트가 없다', async () => {
    stubMixResponse({
      success: true,
      path: 'recipe',
      resultBadges: [{ id: 'reward-1', name: '보상 배지', rarity: 'rare' }],
      pointsAwarded: 100,
    })
    const screen = createScreen(recipeFixture({ releaseAt: null }))
    await (screen.ctaButton(screen.openMixer()).props.onClick as () => Promise<void>)()

    const shown = screen.overlay(screen.render())
    expect(shown.props.open).toBe(true)
    ;(shown.props.onClose as () => void)()

    expect(screen.overlay(screen.render()).props.open).toBe(false)
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('화면이 낡아 releaseAt은 남았지만 서버가 일반 믹스로 처리했다면(응답에 testMix 없음) 토스트를 띄우지 않는다', async () => {
    stubMixResponse({ success: true, path: 'recipe', resultBadges: [], pointsAwarded: 100 })
    const screen = createScreen(recipeFixture({ releaseAt: RELEASE_AT }))
    await (screen.ctaButton(screen.openMixer()).props.onClick as () => Promise<void>)()

    const shown = screen.overlay(screen.render())
    ;(shown.props.onClose as () => void)()

    expect(toastMock).not.toHaveBeenCalled()
  })
})

describe('testMixNoticeOnClose', () => {
  it('결과의 testMix가 참일 때만 안내 문구를 돌려준다', () => {
    expect(testMixNoticeOnClose({ testMix: true })).toBe(d.combine.testMixNotice)
    expect(testMixNoticeOnClose({ testMix: false })).toBeNull()
    expect(testMixNoticeOnClose({})).toBeNull()
    expect(testMixNoticeOnClose(null)).toBeNull()
  })
})
