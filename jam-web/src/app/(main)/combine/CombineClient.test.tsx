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
const refreshMock = vi.hoisted(() => vi.fn())

/**
 * 주소(쿼리)와 history를 흉내 내는 `next/navigation` 모의 — 화면 상태의 원천이 주소라서(티켓 20261110_1215)
 * `push`·`replace`·`back`이 `useSearchParams`가 읽는 값을 실제로 바꾼다.
 */
const navMock = vi.hoisted(() => {
  const state = { entries: [''], index: 0 }
  const queryOf = (url: string) => (url.includes('?') ? url.slice(url.indexOf('?') + 1) : '')
  const push = vi.fn((url: string) => {
    state.entries = [...state.entries.slice(0, state.index + 1), queryOf(url)]
    state.index += 1
  })
  const replace = vi.fn((url: string) => {
    state.entries[state.index] = queryOf(url)
  })
  const back = vi.fn(() => {
    if (state.index > 0) state.index -= 1
  })
  return {
    state,
    push,
    replace,
    back,
    search: () => state.entries[state.index],
    /** 주소로 바로 열린 상태(링크·새로고침)로 시작한다 — 앞 항목이 없다 */
    openDirect: (query: string) => {
      state.entries = [query]
      state.index = 0
    },
    reset: () => {
      state.entries = ['']
      state.index = 0
      push.mockClear()
      replace.mockClear()
      back.mockClear()
    },
  }
})

/** 손으로 돌리는 훅 저장소 — `active`일 때만 `useState`·`useMemo`를 대신한다(티켓 20261001_1159). */
const hooks = vi.hoisted(() => ({
  active: false,
  store: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void | (() => void)>,
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
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      if (hooks.active) hooks.effects.push(effect)
      else actual.useEffect(effect, deps)
    },
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navMock.push, replace: navMock.replace, back: navMock.back, prefetch: vi.fn(), refresh: refreshMock }),
  usePathname: () => '/combine',
  useSearchParams: () => new URLSearchParams(navMock.search()),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: toastMock }),
}))

import { markOpenedByPush } from '@/lib/combine/navigation'
import CombineClient, {
  shouldRecordMixFail,
  buildDemoCombineResult,
  computeQuestPulseTarget,
  resolveQuestPulseStep,
  testMixNoticeOnClose,
  toMixRevealBadges,
  toPendingRevealBadges,
  pendingResultMessage,
  RecipeDescription,
  type RecipeWithSlots,
} from './CombineClient'

// 테스트마다 주소와 «push로 열었다» 표시를 처음으로 돌린다.
beforeEach(() => {
  navMock.reset()
  markOpenedByPush(false)
})
import RecipeRewardRow from './RecipeRewardRow'
import PendingResultsSheet from './PendingResultsSheet'
import RecipeSlotCard from './RecipeSlotCard'
import BagItemCell from './BagItemCell'
import BottomSheet from '@/components/ui/BottomSheet'
import BadgeRevealOverlay from '@/components/BadgeRevealOverlay'
import { Button } from '@ds/components/buttons/Button'
import { d, t } from '@/lib/i18n'
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
  it('칸의 «+»를 처음 눌러 mix_fail을 기록하면 같은 화면에서 mix_success 규칙으로 판정한다', () => {
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
    // 두 조각 모두 줄바꿈 없이 통째로 움직이고, 글자색은 --muted 토큰(text-muted)이다.
    // --warning은 가는 선·점·면에만 쓰는 색이라 글자로 쓰면 흰 카드 위 2.07:1이다(티켓 20261015_2134).
    // 색을 hex로 직접 쓰지 않는다.
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(2)
    // 날짜 줄은 phrasing(`<span>`)이고, 줄 전체가 text-xs이며 글자색은 ListRow의 meta(muted)에서 온다. 말줄임 클래스가 없다.
    expect(html).toMatch(/<span class="flex flex-wrap gap-x-1 text-xs"><span class="whitespace-nowrap">/)
    expect(html).toContain(`<span class="whitespace-nowrap">${RELEASE_LABEL}</span>`)
    expect(html).not.toMatch(/<span class="[^"]*truncate[^"]*">(공개 예정|\d+월)/)
    // meta는 줄 제한이 없다(metaLines=0) — 날짜가 말줄임·줄 수 제한에 걸리지 않는다
    expect(html).not.toContain('-webkit-line-clamp')
    expect(html).not.toContain('var(--warning)')
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
      'text-xs text-muted text-center break-keep text-balance',
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

// ─────────────────────────────────────────────────────────────────────────────
// 티켓 20261018_0055 2회 — 받지 않은 믹스 결과, 잠긴 결과, 보상 없음, 설명, 5칸
// ─────────────────────────────────────────────────────────────────────────────

describe('toMixRevealBadges — 잠긴 결과 변환 (티켓 20261018_0055 2회)', () => {
  const rewardBadges = [
    { id: 'reward-1', name: '보상 배지', image_url: 'https://img/reward-1.png', rarity: 'rare' as const, description: '설명' },
  ]

  it('열린 결과는 이미 로드한 보상 배지 상세에서 이름·그림·설명·등급을 찾는다', () => {
    const [item] = toMixRevealBadges([{ id: 'reward-1', name: '서버 이름', rarity: 'rare' }], rewardBadges)
    expect(item).toEqual({ id: 'reward-1', name: '보상 배지', description: '설명', imageUrl: 'https://img/reward-1.png', rarity: 'rare' })
  })

  it('잠긴 결과는 빈 id로 상세를 찾지 않고 가린 항목이 된다 — 이름 없는 카드가 나오지 않는다', () => {
    const [item] = toMixRevealBadges([{ id: '', name: '', rarity: 'rare', locked: true }], rewardBadges)
    expect(item).toEqual({ id: 'locked-0', name: '', description: '', rarity: 'rare', locked: true })
    expect('imageUrl' in item).toBe(false)
  })

  it('잠긴 결과 항목에는 필요한 양 키가 없다 — 여는 비용은 포인트라서 화면 연출이 싣지 않는다', () => {
    const [item] = toMixRevealBadges([{ id: '', name: '', rarity: 'epic', locked: true }], rewardBadges)
    expect('unlockRequired' in item).toBe(false)
  })

  it('잠긴 결과가 여럿이어도 캐러셀 키(id)가 겹치지 않는다', () => {
    const items = toMixRevealBadges(
      [
        { id: '', name: '', rarity: 'rare', locked: true },
        { id: '', name: '', rarity: 'rare', locked: true },
      ],
      rewardBadges,
    )
    expect(new Set(items.map((i) => i.id)).size).toBe(2)
  })
})

describe('toPendingRevealBadges — 받은 결과를 연출 항목으로 (티켓 20261018_0055 2회)', () => {
  it('잠긴 결과는 이름·그림을 싣지 않고 등급만 싣는다', () => {
    const [locked, open] = toPendingRevealBadges([
      { id: 'p1', badgeId: '', name: '', imageUrl: null, rarity: 'epic', locked: true, createdAt: '2026-10-18T00:00:00Z' },
      { id: 'p2', badgeId: 'b2', name: '열린 배지', imageUrl: 'https://img/b2.png', rarity: 'rare', locked: false, createdAt: '2026-10-18T00:00:00Z' },
    ])
    expect(locked).toMatchObject({ locked: true, rarity: 'epic', name: '' })
    expect('unlockRequired' in locked).toBe(false)
    expect(open).toMatchObject({ id: 'b2', name: '열린 배지', imageUrl: 'https://img/b2.png', rarity: 'rare' })
    expect(open.locked).toBeUndefined()
  })
})

describe('pendingResultMessage', () => {
  it('결과 개수와 지금 빈칸 수를 숫자로 넣고 서버 일반 문구를 쓰지 않는다', () => {
    const message = pendingResultMessage({ pendingCount: 3, freeSlots: 1, points: 0 })
    expect(message).toContain('믹스 결과 3개를 아직 받지 못했어요')
    expect(message).toContain('지금 빈칸 1개, 받으려면 3개가 필요해요')
    expect(message).not.toContain('포인트')
  })

  it('포인트가 있으면 먼저 받았다는 한 문장을 더한다', () => {
    expect(pendingResultMessage({ pendingCount: 2, freeSlots: 0, points: 1200 })).toContain('1,200 포인트는 먼저 받았어요.')
  })
})

describe('RecipeRewardRow — 보상 없음·잠김 칩 (티켓 20261018_0055 2회)', () => {
  const badge = { id: 'b1', name: '결과 배지', image_url: null, rarity: 'rare' as const }

  it('noReward면 «보상 없음» 부제가 보인다', () => {
    const html = renderToStaticMarkup(<RecipeRewardRow title="레시피" slotCount={2} badges={[]} points={0} noReward />)
    expect(html).toContain(d.combine.noRewardLabel)
  })

  it('noReward가 없으면 보상이 비어 있어도 «보상 없음»을 쓰지 않는다(회귀 방지)', () => {
    const base = renderToStaticMarkup(<RecipeRewardRow title="레시피" slotCount={2} badges={[]} points={0} />)
    expect(base).not.toContain(d.combine.noRewardLabel)
  })

  it('보상이 있으면 noReward여도 «보상 없음»을 쓰지 않는다', () => {
    const html = renderToStaticMarkup(<RecipeRewardRow title="레시피" slotCount={2} badges={[]} points={50} noReward />)
    expect(html).not.toContain(d.combine.noRewardLabel)
  })

  it('rewardLocked면 등급 칩 옆에 «잠김» 칩이 붙고, 아니면 없다', () => {
    const locked = renderToStaticMarkup(<RecipeRewardRow title="레시피" slotCount={2} badges={[badge]} points={0} rewardLocked />)
    const open = renderToStaticMarkup(<RecipeRewardRow title="레시피" slotCount={2} badges={[badge]} points={0} />)
    expect(locked).toContain(d.lockedItem.detail.chip)
    expect(open).not.toContain(d.lockedItem.detail.chip)
  })
})

describe('RecipeDescription — 설명 3줄 접힘 (티켓 20261018_0055 2회)', () => {
  it('줄바꿈을 살리고 3줄로 접힌 채 그린다 — 서버 렌더에는 «더 보기»가 없다(넘침은 실제 높이로 잰다)', () => {
    const html = renderToStaticMarkup(<RecipeDescription text={'첫 줄\n둘째 줄'} />)
    expect(html).toContain('line-clamp-3')
    expect(html).toContain('whitespace-pre-line')
    expect(html).toContain('break-keep')
    expect(html).not.toContain(d.combine.descriptionMore)
  })
})

describe('CombineClient — 받지 않은 믹스 결과 (티켓 20261018_0055 2회)', () => {
  beforeEach(() => {
    toastMock.mockClear()
    refreshMock.mockClear()
    hooks.active = true
    hooks.store = []
  })

  afterEach(() => {
    hooks.active = false
    vi.unstubAllGlobals()
  })

  function createScreen(recipe: RecipeWithSlots, extra: { pendingCount?: number; questStep?: 'mix_fail' | 'mix_success' | null } = {}) {
    const props = { items: [], publicRecipes: [recipe], ownedConditionBadgeIds: [], ...extra }
    const render = () => {
      hooks.cursor = 0
      return CombineClient(props)
    }
    const overlay = (tree: ReactNode) => findAll(tree, (el) => el.type === BadgeRevealOverlay)[0]
    const sheetEl = (tree: ReactNode) => findAll(tree, (el) => el.type === PendingResultsSheet)[0]
    const ctaButton = (tree: ReactNode) =>
      findAll(tree, (el) => el.type === 'button' && String(el.props.className).includes('max-w-[220px]'))[0]
    const bannerButton = (tree: ReactNode) =>
      findAll(tree, (el) => el.type === Button && textOf(el) === d.combine.pendingBanner.action)[0]
    const openMixer = () => {
      const row = findAll(render(), (el) => el.type === RecipeRewardRow)[0]
      ;(row.props.onClick as () => void)()
      return render()
    }
    const post = async () => {
      await (ctaButton(openMixer()).props.onClick as () => Promise<void>)()
      return render()
    }
    return { render, overlay, sheetEl, ctaButton, bannerButton, openMixer, post }
  }

  /** URL·메서드별 응답을 돌려주는 fetch 대역 */
  function stubFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
    const fn = vi.fn(async (url: string, init?: RequestInit) => {
      const out = handler(url, init)
      const status = out.status ?? 200
      return { ok: status >= 200 && status < 300, status, json: async () => out.body }
    })
    vi.stubGlobal('fetch', fn)
    return fn
  }

  const bannerText = (count: number) => t(d.combine.pendingBanner.title, { count })
  /** 배너 «받기»는 시트를 열고 목록 읽기를 기다리지 않는다 — 읽기가 끝날 때까지 한 번 비운다 */
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  const openSheet = async (screen: ReturnType<typeof createScreen>) => {
    ;(screen.bannerButton(screen.render()).props.onClick as () => void)()
    await flush()
  }

  // ── (e) 배너·CTA 차단 ──────────────────────────────────────────────────────

  it('받지 않은 결과가 있으면 탐색 화면에 배너와 «받기»가 보인다', () => {
    const screen = createScreen(recipeFixture(), { pendingCount: 3 })
    const tree = screen.render()
    expect(textOf(tree)).toContain(bannerText(3))
    expect(textOf(tree)).toContain(d.combine.pendingBanner.body)
    expect(screen.bannerButton(tree)).toBeDefined()
  })

  it('믹서 화면에도 같은 배너가 있고, 믹스하기는 비활성이며 이유 한 줄이 버튼에 연결된다', () => {
    const screen = createScreen(recipeFixture(), { pendingCount: 3 })
    const mixer = screen.openMixer()
    expect(textOf(mixer)).toContain(bannerText(3))

    const cta = screen.ctaButton(mixer)
    expect(cta.props.disabled).toBe(true)
    expect(cta.props['aria-describedby']).toBe('combine-pending-note')
    const notes = findAll(mixer, (el) => el.type === 'p' && el.props.id === 'combine-pending-note')
    expect(notes).toHaveLength(1)
    expect(textOf(notes[0])).toBe(d.combine.pendingBlockedNote)
    // 비활성 이유는 읽혀야 하는 정보라 muted가 아니다
    expect(String(notes[0].props.className)).toContain('text-foreground')
    expect(String(notes[0].props.className)).not.toContain('text-muted')
  })

  it('받지 않은 결과가 없으면 배너도 이유 문구도 없고 믹스하기가 활성이다', () => {
    const screen = createScreen(recipeFixture(), { pendingCount: 0 })
    const mixer = screen.openMixer()
    expect(textOf(mixer)).not.toContain(d.combine.pendingBanner.body)
    expect(textOf(mixer)).not.toContain(d.combine.pendingBlockedNote)
    expect(screen.ctaButton(mixer).props.disabled).toBe(false)
    expect(screen.ctaButton(mixer).props['aria-describedby']).toBeUndefined()
  })

  it('온보딩 연출 모드에서는 받지 않은 결과가 있다고 서버가 알려 와도 배너·차단이 없다', () => {
    const screen = createScreen(recipeFixture(), { pendingCount: 3, questStep: 'mix_fail' })
    const mixer = screen.openMixer()
    expect(textOf(mixer)).not.toContain(d.combine.pendingBanner.body)
    expect(screen.ctaButton(mixer).props.disabled).toBe(false)
  })

  it('막힌 상태에서 믹스하기 핸들러가 불려도 요청을 보내지 않는다', async () => {
    const fetchMock = stubFetch(() => ({ body: {} }))
    const screen = createScreen(recipeFixture(), { pendingCount: 2 })
    await (screen.ctaButton(screen.openMixer()).props.onClick as () => Promise<void>)()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // ── (a) 믹스 직후 받지 않은 결과 ───────────────────────────────────────────

  it('믹스 직후 결과가 받지 않은 상태로 남으면 숫자가 든 안내가 나오고 «0 포인트 획득»·서버 일반 문구가 나오지 않는다', async () => {
    stubFetch(() => ({
      body: {
        success: true,
        resultStatus: 'pending',
        resultBadges: [],
        pointsAwarded: 0,
        pendingCount: 3,
        freeSlots: 1,
        message: d.combine.resultPending,
      },
    }))
    const screen = createScreen(recipeFixture())
    const tree = await screen.post()
    const shown = screen.overlay(tree)
    expect(shown.props.open).toBe(true)
    expect(shown.props.emptyMessage).toBe(pendingResultMessage({ pendingCount: 3, freeSlots: 1, points: 0 }))
    expect(String(shown.props.emptyMessage)).not.toContain('0 포인트 획득')
    expect(shown.props.emptyMessage).not.toBe(d.combine.resultPending)
  })

  it('받지 않은 결과로 남았어도 포인트가 있으면 안내에 같이 알린다', async () => {
    stubFetch(() => ({
      body: { success: true, resultStatus: 'pending', resultBadges: [], pointsAwarded: 50, pendingCount: 2, freeSlots: 0 },
    }))
    const screen = createScreen(recipeFixture())
    const shown = screen.overlay(await screen.post())
    expect(String(shown.props.emptyMessage)).toContain('50 포인트는 먼저 받았어요.')
  })

  it('받지 않은 결과로 남은 오버레이를 닫으면 배너가 나타나고 믹스하기가 막히며 서버 값을 다시 받는다', async () => {
    stubFetch(() => ({
      body: { success: true, resultStatus: 'pending', resultBadges: [], pointsAwarded: 0, pendingCount: 3, freeSlots: 1 },
    }))
    const screen = createScreen(recipeFixture())
    const shown = screen.overlay(await screen.post())
    // 오버레이가 떠 있는 동안에는 배너가 아직 없다
    expect(textOf(screen.render())).not.toContain(d.combine.pendingBanner.body)

    refreshMock.mockClear()
    ;(shown.props.onClose as () => void)()
    const after = screen.render()
    expect(textOf(after)).toContain(bannerText(3))
    expect(screen.ctaButton(after).props.disabled).toBe(true)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  // ── (b) 보상 없음 ─────────────────────────────────────────────────────────

  it('보상 없음 성공은 «0 포인트 획득!»이 아니라 안내 문구가 나온다', async () => {
    stubFetch(() => ({
      body: { success: true, resultStatus: 'none', resultBadges: [], pointsAwarded: 0, noReward: true },
    }))
    const screen = createScreen(recipeFixture({ reward_badge_ids: [], reward_points: 0, rewardBadges: [], allow_no_reward: true }))
    const shown = screen.overlay(await screen.post())
    expect(shown.props.open).toBe(true)
    expect(shown.props.emptyMessage).toBe(d.combine.noRewardResult)
    expect(String(shown.props.emptyMessage)).not.toContain('포인트 획득')
  })

  it('포인트만 주는 성공은 지금처럼 «N 포인트 획득!»이다(회귀 방지)', async () => {
    stubFetch(() => ({ body: { success: true, resultStatus: 'none', resultBadges: [], pointsAwarded: 100 } }))
    const screen = createScreen(recipeFixture())
    const shown = screen.overlay(await screen.post())
    expect(shown.props.emptyMessage).toBe(t(d.combine.successPointsOnly, { points: 100 }))
  })

  // ── (c) 잠긴 결과 ─────────────────────────────────────────────────────────

  it('잠긴 채 나온 결과는 이름 없는 카드가 아니라 잠긴 항목으로 오버레이에 넘어간다', async () => {
    stubFetch(() => ({
      body: {
        success: true,
        resultStatus: 'granted',
        resultBadges: [{ id: '', name: '', rarity: 'rare', locked: true }],
        pointsAwarded: 0,
      },
    }))
    const screen = createScreen(recipeFixture())
    const shown = screen.overlay(await screen.post())
    expect(shown.props.items).toEqual([
      { id: 'locked-0', name: '', description: '', rarity: 'rare', locked: true },
    ])
    expect(shown.props.emptyMessage).toBeUndefined()
  })

  // ── (d) 이용 정지·409 ─────────────────────────────────────────────────────

  it('이용 정지 403은 info 토스트이고 오버레이를 열지 않으며 요청은 한 번뿐이다', async () => {
    const fetchMock = stubFetch(() => ({ status: 403, body: { error: '이용이 정지된 계정이에요', code: 'user_suspended' } }))
    const screen = createScreen(recipeFixture())
    const tree = await screen.post()
    expect(toastMock).toHaveBeenCalledWith('이용이 정지된 계정이에요', 'info')
    expect(screen.overlay(tree).props.open).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('이용 정지 응답에 문구가 없으면 사전의 믹스 정지 문구를 쓴다', async () => {
    stubFetch(() => ({ status: 403, body: { code: 'user_suspended' } }))
    const screen = createScreen(recipeFixture())
    await screen.post()
    expect(toastMock).toHaveBeenCalledWith(d.suspension.combineBlocked, 'info')
  })

  it('409 pending_results_exist는 info 토스트이고 오버레이 없이 배너 개수를 다시 읽는다', async () => {
    const fetchMock = stubFetch((url) =>
      url === '/api/combine'
        ? { status: 409, body: { success: false, code: 'pending_results_exist', message: d.combine.pendingResultsExist } }
        : { body: { pendingCount: 2, freeSlots: 0, items: [] } },
    )
    const screen = createScreen(recipeFixture())
    const tree = await screen.post()
    expect(toastMock).toHaveBeenCalledWith(d.combine.pendingResultsExist, 'info')
    expect(screen.overlay(tree).props.open).toBe(false)
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/combine', '/api/combine/pending'])
    expect(textOf(tree)).toContain(bannerText(2))
  })

  it('409 pending_results_exist 뒤 개수를 읽지 못하면 서버 값을 다시 받는다(router.refresh)', async () => {
    stubFetch((url) =>
      url === '/api/combine'
        ? { status: 409, body: { success: false, code: 'pending_results_exist', message: d.combine.pendingResultsExist } }
        : { status: 500, body: { error: 'x' } },
    )
    const screen = createScreen(recipeFixture())
    await screen.post()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('잠긴 재료 409(locked_item_not_allowed)는 info 토스트이고 결과 오버레이를 열지 않는다(티켓 20261018_0056)', async () => {
    stubFetch(() => ({
      status: 409,
      body: { success: false, reason: 'locked_item_not_allowed', code: 'locked_item_not_allowed', message: d.lockedItem.combine, pointsAwarded: 0 },
    }))
    const screen = createScreen(recipeFixture())
    const shown = screen.overlay(await screen.post())
    expect(toastMock).toHaveBeenCalledWith(d.lockedItem.combine, 'info')
    expect(toastMock).not.toHaveBeenCalledWith(expect.anything(), 'error')
    expect(shown.props.open).toBe(false)
    // 소각 전 거절이라 화면 데이터를 다시 받지 않는다
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('잠긴 재료 409 응답에 문구가 없으면 사전의 믹스 잠김 문구를 쓴다', async () => {
    stubFetch(() => ({ status: 409, body: { success: false, code: 'locked_item_not_allowed' } }))
    const screen = createScreen(recipeFixture())
    await screen.post()
    expect(toastMock).toHaveBeenCalledWith(d.lockedItem.combine, 'info')
  })

  // ── 받기 시트 ─────────────────────────────────────────────────────────────

  const lockedPending = { id: 'p1', badgeId: '', name: '', imageUrl: null, rarity: 'epic', locked: true, createdAt: '2026-10-18T00:00:00Z' }
  const openPending = { id: 'p2', badgeId: 'b2', name: '열린 배지', imageUrl: null, rarity: 'rare', locked: false, createdAt: '2026-10-18T00:00:00Z' }

  it('배너의 «받기»를 누르면 시트가 열리고 목록과 지금 빈칸 수를 새로 읽는다', async () => {
    const fetchMock = stubFetch(() => ({ body: { pendingCount: 2, freeSlots: 5, items: [lockedPending, openPending] } }))
    const screen = createScreen(recipeFixture(), { pendingCount: 2 })
    await openSheet(screen)
    const sheet = screen.sheetEl(screen.render())
    expect(sheet.props.open).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/combine/pending')
    expect(sheet.props.view).toEqual({ status: 'ready', items: [lockedPending, openPending], freeSlots: 5, neededSlots: 2, claiming: false })
  })

  it('목록을 읽지 못하면 시트가 오류 상태가 된다', async () => {
    stubFetch(() => ({ status: 500, body: { error: 'x' } }))
    const screen = createScreen(recipeFixture(), { pendingCount: 2 })
    await openSheet(screen)
    expect((screen.sheetEl(screen.render()).props.view as { status: string }).status).toBe('error')
  })

  it('목록이 비었으면(다른 기기에서 이미 받음) 빈 상태가 되고 배너가 사라지며 서버 값을 다시 받는다', async () => {
    stubFetch(() => ({ body: { pendingCount: 0, freeSlots: 5, items: [] } }))
    const screen = createScreen(recipeFixture(), { pendingCount: 2 })
    await openSheet(screen)
    const tree = screen.render()
    expect(textOf(tree)).not.toContain(d.combine.pendingBanner.body)
    expect((screen.sheetEl(tree).props.view as { items: unknown[] }).items).toEqual([])
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  async function openSheetThen(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
    const list = [lockedPending, openPending]
    const fetchMock = stubFetch((url, init) =>
      init?.method === 'POST' ? handler(url, init) : { body: { pendingCount: list.length, freeSlots: 5, items: list } },
    )
    const screen = createScreen(recipeFixture(), { pendingCount: list.length })
    await openSheet(screen)
    return { screen, fetchMock }
  }

  const claimOf = (screen: ReturnType<typeof createScreen>) => screen.sheetEl(screen.render()).props.onClaim as () => Promise<void>

  it('받기에 성공하면 시트를 닫고 «믹스 결과 N개를 받았어요»와 함께 연출한다 — 잠긴 결과는 잠긴 채 보인다', async () => {
    const { screen } = await openSheetThen(() => ({ body: { granted: 2, itemIds: ['i1', 'i2'] } }))
    await claimOf(screen)()
    const tree = screen.render()
    expect(screen.sheetEl(tree).props.open).toBe(false)
    const shown = screen.overlay(tree)
    expect(shown.props.open).toBe(true)
    expect(shown.props.resultMessage).toBe(t(d.combine.claimedToast, { count: 2 }))
    const items = shown.props.items as { locked?: boolean; name: string; id: string }[]
    expect(items[0]).toMatchObject({ locked: true, name: '', rarity: 'epic' })
    expect(items[1]).toMatchObject({ id: 'b2', name: '열린 배지' })
    expect(items[1].locked).toBeUndefined()
  })

  it('받은 연출을 닫으면 배너가 사라지고 믹스하기가 활성이 되며 서버 값을 다시 받는다', async () => {
    const { screen } = await openSheetThen(() => ({ body: { granted: 2, itemIds: ['i1', 'i2'] } }))
    await claimOf(screen)()
    refreshMock.mockClear()
    ;(screen.overlay(screen.render()).props.onClose as () => void)()
    const mixer = screen.openMixer()
    expect(textOf(mixer)).not.toContain(d.combine.pendingBanner.body)
    expect(screen.ctaButton(mixer).props.disabled).toBe(false)
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })

  it('제출 중에는 같은 요청을 다시 보내지 않는다', async () => {
    const { screen, fetchMock } = await openSheetThen(() => ({ body: { granted: 2, itemIds: [] } }))
    const first = claimOf(screen)()
    // 첫 요청이 끝나기 전에 다시 렌더한 트리의 핸들러를 부른다
    const second = claimOf(screen)()
    await Promise.all([first, second])
    expect(fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST')).toHaveLength(1)
  })

  it('받기 409 insufficient_slots는 토스트 없이 시트의 빈칸·필요 칸 수를 바꾼다', async () => {
    const { screen } = await openSheetThen(() => ({ status: 409, body: { code: 'insufficient_slots', error: 'x', free: 1, needed: 3 } }))
    await claimOf(screen)()
    const sheet = screen.sheetEl(screen.render())
    expect(sheet.props.open).toBe(true)
    expect(sheet.props.view).toMatchObject({ freeSlots: 1, neededSlots: 3, claiming: false })
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('받기 409 no_pending은 info 토스트, 시트 닫기, 배너 제거(서버 값 다시 받기)다', async () => {
    const { screen } = await openSheetThen(() => ({ status: 409, body: { code: 'no_pending', error: d.combine.claim.noPending } }))
    await claimOf(screen)()
    const tree = screen.render()
    expect(toastMock).toHaveBeenCalledWith(d.combine.claim.noPending, 'info')
    expect(screen.sheetEl(tree).props.open).toBe(false)
    expect(textOf(tree)).not.toContain(d.combine.pendingBanner.body)
    expect(refreshMock).toHaveBeenCalled()
  })

  it('받기 403 user_suspended는 info 토스트이고 시트를 열어 둔다', async () => {
    const { screen } = await openSheetThen(() => ({ status: 403, body: { code: 'user_suspended', error: d.suspension.combineClaimBlocked } }))
    await claimOf(screen)()
    expect(toastMock).toHaveBeenCalledWith(d.suspension.combineClaimBlocked, 'info')
    expect(screen.sheetEl(screen.render()).props.open).toBe(true)
    expect(screen.overlay(screen.render()).props.open).toBe(false)
  })

  it('받기 500은 error 토스트이고 시트를 열어 둔 채 버튼이 다시 활성이 된다', async () => {
    const { screen } = await openSheetThen(() => ({ status: 500, body: { error: d.combine.claim.failed } }))
    await claimOf(screen)()
    expect(toastMock).toHaveBeenCalledWith(d.combine.claim.failed, 'error')
    const sheet = screen.sheetEl(screen.render())
    expect(sheet.props.open).toBe(true)
    expect(sheet.props.view).toMatchObject({ claiming: false })
  })
})

describe('CombineClient — 믹서 칸 수와 설명 (티켓 20261018_0055 2회)', () => {
  beforeEach(() => {
    hooks.active = true
    hooks.store = []
  })

  afterEach(() => {
    hooks.active = false
  })

  function mixerFor(recipe: RecipeWithSlots) {
    hooks.store = []
    navMock.reset()
    markOpenedByPush(false)
    const props = { items: [], publicRecipes: [recipe], ownedConditionBadgeIds: [] }
    const render = () => {
      hooks.cursor = 0
      return CombineClient(props)
    }
    ;(findAll(render(), (el) => el.type === RecipeRewardRow)[0].props.onClick as () => void)()
    return render()
  }

  const slots = (n: number): RecipeWithSlots['slots'] =>
    Array.from({ length: n }, (_, i) => ({ id: `slot-${i}`, slot_order: i, badge_type: 'item' as const, candidates: [] }))

  const gridClass = (tree: ReactNode) =>
    String(findAll(tree, (el) => el.type === 'div' && String(el.props.className).includes('grid-cols'))[0].props.className)

  it('5칸은 3열(3+2)이고 4칸 이하는 지금처럼 4열이다', () => {
    expect(gridClass(mixerFor(recipeFixture({ slots: slots(5) })))).toContain('grid-cols-3')
    expect(gridClass(mixerFor(recipeFixture({ slots: slots(4) })))).toContain('grid-cols-4')
    expect(gridClass(mixerFor(recipeFixture({ slots: slots(2) })))).toContain('grid-cols-4')
  })

  it('레시피에 설명이 있어도 믹서에는 설명 영역을 그리지 않는다(2026-11-10 사용자 지시)', () => {
    const find = (tree: ReactNode) => findAll(tree, (el) => el.type === RecipeDescription)
    expect(find(mixerFor(recipeFixture({ description: '설명 문단' })))).toHaveLength(0)
    expect(find(mixerFor(recipeFixture({ description: null })))).toHaveLength(0)
  })

  it('요약 행은 대표 보상 배지를 배지 상세로 연결한다(linkBadge)', () => {
    const row = findAll(mixerFor(recipeFixture({})), (el) => el.type === RecipeRewardRow)[0]
    expect(row.props.linkBadge).toBe(true)
  })

  it('요약 행에 보상 없음·잠김 여부가 전달된다', () => {
    const noReward = findAll(
      mixerFor(recipeFixture({ reward_badge_ids: [], reward_points: 0, rewardBadges: [], reward_locked: true })),
      (el) => el.type === RecipeRewardRow,
    )[0]
    expect(noReward.props.noReward).toBe(true)
    expect(noReward.props.rewardLocked).toBe(true)
    const normal = findAll(mixerFor(recipeFixture({ reward_points: 50 })), (el) => el.type === RecipeRewardRow)[0]
    expect(normal.props.noReward).toBe(false)
    expect(normal.props.rewardLocked).toBe(false)
  })
})

describe('RecipeRewardRow — ListRow 구조 (티켓 20261107_0011)', () => {
  const badge = { id: 'b1', name: '결과 배지', image_url: 'https://example.com/b1.png', rarity: 'rare' as const }
  const render = (props: Partial<React.ComponentProps<typeof RecipeRewardRow>> = {}) =>
    renderToStaticMarkup(<RecipeRewardRow title="레시피 제목" slotCount={3} badges={[]} points={10} {...props} />)

  it('제목은 굵게(700) 한 줄 말줄임이고 슬롯 개수는 제목 끝 칩(titleSuffix)이다', () => {
    const html = render()
    expect(html).toMatch(/text-overflow:ellipsis;white-space:nowrap[^"]*font-weight:700[^"]*">레시피 제목</)
    // 슬롯 수 칩: 12px 보통 굵기, 제목 말줄임 바깥(줄어들지 않는 칸)
    expect(html).toMatch(/flex-shrink:0;display:inline-flex;align-items:center"><span class="" style="[^"]*font-weight:400[^"]*">3<\/span>/)
  })

  it('slotCount를 주지 않으면 제목 끝 칩이 없다(레시피 탐색 목록 행, 2026-11-10 사용자 지시)', () => {
    const html = render({ slotCount: undefined, onClick: () => {} })
    expect(html).toContain('레시피 제목')
    expect(html).not.toMatch(/flex-shrink:0;display:inline-flex;align-items:center"><span class="" style="[^"]*font-weight:400[^"]*">3<\/span>/)
    expect(html).not.toMatch(/font-weight:400[^"]*">\d+<\/span>/)
  })

  it('linkBadge면 대표 보상 배지의 이미지와 이름이 그 배지 상세로 가는 링크다(표시 전용 요약 행)', () => {
    const html = render({ badges: [badge], linkBadge: true })
    // 이름: 밑줄 링크, 이미지: 같은 주소의 lead 링크(접근 가능한 이름은 배지명)
    expect(html.match(/href="\/badges\/b1"/g)).toHaveLength(2)
    expect(html).toContain('aria-label="결과 배지"')
    expect(html).toMatch(/<a [^>]*href="\/badges\/b1"[^>]*>결과 배지<\/a>/)
  })

  it('linkBadge가 없거나, 눌림 행(onClick)이거나, 보상 배지가 없으면 링크를 만들지 않는다', () => {
    expect(render({ badges: [badge] })).not.toContain('/badges/')
    expect(render({ badges: [badge], linkBadge: true, onClick: () => {} })).not.toContain('/badges/')
    expect(render({ badges: [], linkBadge: true })).not.toContain('/badges/')
  })

  it('눌림 유무: onClick이 있으면 버튼(눌림), 없으면 표시 전용 요약바(눌림·cursor 없음)', () => {
    const press = render({ onClick: () => {} })
    expect(press).toContain('<button type="button"')
    expect(press).toContain('data-interactive="true"')
    const display = render()
    expect(display).not.toContain('<button')
    expect(display).toContain('data-interactive="false"')
    expect(display).not.toContain('cursor:pointer')
  })

  it('배지 보상: lead는 tile 48 안 장식 이미지(alt 빈 값), eyebrow에 등급 칩, meta에 배지명(+N), 포인트가 value다', () => {
    const html = render({ badges: [badge, { ...badge, id: 'b2' }, { ...badge, id: 'b3' }], points: 1200 })
    expect(html).toMatch(/<img[^>]*alt=""/)
    expect(html).toContain('border-radius:var(--radius-2xl);background')
    expect(html.indexOf('Rare')).toBeLessThan(html.indexOf('레시피 제목'))
    expect(html).toMatch(/<span class="block truncate">결과 배지 \+2<\/span>/)
    expect(html.indexOf('결과 배지 +2')).toBeGreaterThan(html.indexOf('레시피 제목'))
    expect(html).toContain('1,200')
  })

  it('포인트만: lead는 round 코인, eyebrow·배지명 줄이 없다', () => {
    const html = render({ points: 500 })
    expect(html).toContain('border-radius:var(--radius-full);background')
    expect(html).not.toContain('block truncate')
    expect(html).not.toContain('Rare')
  })

  it('보상 없음: «보상 없음» meta 한 줄이고 value가 없다', () => {
    const html = render({ points: 0, noReward: true })
    expect(html).toContain(d.combine.noRewardLabel)
    expect(html).not.toContain('>포인트<')
  })

  it('잠김 칩은 배지 보상이 있을 때만 eyebrow에 붙는다 — 포인트만이면 붙지 않는다', () => {
    expect(render({ badges: [badge], rewardLocked: true })).toContain(d.lockedItem.detail.chip)
    expect(render({ rewardLocked: true })).not.toContain(d.lockedItem.detail.chip)
  })

  it('eyebrow는 그릴 칩이 있을 때만 만든다 — common 등급이고 잠기지 않았으면 eyebrow 자리가 없다', () => {
    const common = { ...badge, rarity: 'common' as const }
    const plain = render({ badges: [common], points: 0 })
    expect(plain).not.toContain('inline-flex items-center gap-1')
    const locked = render({ badges: [common], points: 0, rewardLocked: true })
    expect(locked).toContain('inline-flex items-center gap-1')
    expect(locked).toContain(d.lockedItem.detail.chip)
  })

  it('공개 예정만 있고 배지명 줄이 없으면 날짜 줄에 위쪽 여백(mt-1)을 주지 않는다', () => {
    expect(render({ releaseAt: RELEASE_AT })).not.toContain('mt-1')
    expect(render({ badges: [badge], releaseAt: RELEASE_AT })).toContain('mt-1')
  })

  it('클릭 영역 안에 div·p가 없다 — 행 본문은 span뿐이다', () => {
    const html = render({ onClick: () => {}, badges: [badge], rewardLocked: true, releaseAt: RELEASE_AT })
    const button = /<button[\s\S]*<\/button>/.exec(html)?.[0] ?? ''
    expect(button).not.toBe('')
    expect(button).not.toMatch(/<(div|p)[\s>]/)
  })

  it('한국어 줄바꿈은 ListRow의 keep-all이 맡는다', () => {
    expect(render()).toContain('word-break:keep-all;overflow-wrap:break-word')
  })
})

describe('RecipeRewardRow — 획득 포인트 표기 (티켓 20261104_2315)', () => {
  it('포인트 숫자는 굵게, 그 아래 줄에 작은 글씨 «포인트»가 붙고 둘 다 --point-text 오렌지다', () => {
    const html = renderToStaticMarkup(<RecipeRewardRow title="레시피" slotCount={2} badges={[]} points={1200} />)
    const num = /<span class="([^"]*)" style="([^"]*)">1,200<\/span>/.exec(html)
    expect(num?.[1]).toContain('text-point-text')
    expect(num?.[2]).toContain('font-weight:700')
    expect(num?.[2]).toContain('font-size:var(--text-base)')
    expect(num?.[2]).toContain('color:var(--point-text)')
    const unit = /<span class="([^"]*)" style="([^"]*)">포인트<\/span>/.exec(html)
    expect(unit?.[1]).toContain('text-point-text')
    expect(unit?.[2]).toContain('font-size:var(--text-xs)')
    expect(unit?.[2]).toContain('color:var(--point-text)')
    expect(html).toContain('flex-direction:column')
    expect(html).not.toContain('text-warning')
  })

  it('포인트가 0이면 숫자도 «포인트» 단위도 그리지 않는다', () => {
    const html = renderToStaticMarkup(<RecipeRewardRow title="레시피" slotCount={2} badges={[]} points={0} />)
    expect(html).not.toContain('>포인트<')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 티켓 20261110_1115 — 슬롯 칸 («+» 바로 채움 / 시트 / 흐림 / «−» 비움 / «+» 반짝임)
// ─────────────────────────────────────────────────────────────────────────────

describe('CombineClient — 슬롯 칸 (티켓 20261110_1115)', () => {
  beforeEach(() => {
    toastMock.mockClear()
    hooks.active = true
    hooks.store = []
  })

  afterEach(() => {
    hooks.active = false
    vi.unstubAllGlobals()
  })

  const cand = (id: string) => ({ id, name: `배지-${id}`, image_url: `https://example.com/${id}.png` })
  const owned = (itemId: string, badgeId: string) => ({
    id: itemId,
    badge_id: badgeId,
    serial_prefix: null,
    serial_number: 1,
    badge: { id: badgeId, name: `배지-${badgeId}`, image_url: `https://example.com/${badgeId}.png`, rarity: 'common' as const },
  })
  const slotOf = (
    id: string,
    order: number,
    badgeIds: string[],
    badge_type: 'item' | 'activity' | 'checkin' = 'item',
  ) => ({ id, slot_order: order, badge_type, candidates: badgeIds.map(cand) })

  function screenFor(
    slots: RecipeWithSlots['slots'],
    items: ReturnType<typeof owned>[],
    opts: { ownedConditionBadgeIds?: string[]; questStep?: 'mix_fail' | 'mix_success' | null } = {},
  ) {
    hooks.store = []
    navMock.reset()
    markOpenedByPush(false)
    const recipe = recipeFixture({ slots })
    const props = {
      items,
      publicRecipes: [recipe],
      ownedConditionBadgeIds: opts.ownedConditionBadgeIds ?? [],
      questStep: opts.questStep ?? null,
    }
    const render = () => {
      hooks.cursor = 0
      return CombineClient(props)
    }
    ;(findAll(render(), (el) => el.type === RecipeRewardRow)[0].props.onClick as () => void)()
    const cards = (tree: ReactNode) => findAll(tree, (el) => el.type === RecipeSlotCard)
    const sheet = (tree: ReactNode) => findAll(tree, (el) => el.type === BottomSheet)[0]
    const cells = (tree: ReactNode) => findAll(tree, (el) => el.type === BagItemCell)
    const cta = (tree: ReactNode) =>
      findAll(tree, (el) => el.type === 'button' && String(el.props.className).includes('max-w-[220px]'))[0]
    return { render, cards, sheet, cells, cta }
  }

  const press = (el: AnyElement, key: 'onAdd' | 'onRemove') => (el.props[key] as () => void)()

  it('활성 행이 하나면 «+»가 시트 없이 바로 채우고, «−»로 비우면 «+»로 돌아간다', () => {
    const s = screenFor([slotOf('s1', 1, ['a'])], [owned('i1', 'a')])
    let tree = s.render()
    expect(s.cards(tree)[0].props.status).toBe('addable')
    expect(s.cards(tree)[0].props.name).toBe('배지-a')

    press(s.cards(tree)[0], 'onAdd')
    tree = s.render()
    expect(s.sheet(tree).props.open).toBe(false)
    expect(s.cards(tree)[0].props.status).toBe('filled')
    expect(s.cta(tree).props.disabled).toBe(false)

    press(s.cards(tree)[0], 'onRemove')
    tree = s.render()
    expect(s.cards(tree)[0].props.status).toBe('addable')
    expect(s.cta(tree).props.disabled).toBe(true)
  })

  it('같은 배지 개체가 둘이면 «+»가 시트를 열고, 시트에서 고르면 채워진다', () => {
    const s = screenFor([slotOf('s1', 1, ['a'])], [owned('i1', 'a'), owned('i2', 'a')])
    let tree = s.render()
    press(s.cards(tree)[0], 'onAdd')
    tree = s.render()
    expect(s.sheet(tree).props.open).toBe(true)
    expect(s.cells(tree)).toHaveLength(2)
    expect(s.cards(tree)[0].props.status).toBe('addable')

    ;(s.cells(tree)[1].props.onClick as () => void)()
    tree = s.render()
    expect(s.sheet(tree).props.open).toBe(false)
    expect(s.cards(tree)[0].props.status).toBe('filled')
  })

  it('후보 배지가 여럿이면 활성 행의 첫 후보를 대표로 보여 주고 «+»는 시트를 연다', () => {
    const s = screenFor([slotOf('s1', 1, ['a', 'b', 'c'])], [owned('i2', 'b'), owned('i3', 'c')])
    let tree = s.render()
    expect(s.cards(tree)[0].props.name).toBe('배지-b')
    press(s.cards(tree)[0], 'onAdd')
    tree = s.render()
    expect(s.sheet(tree).props.open).toBe(true)
    // 시트 목록은 그대로다: 후보 전체(미보유 a는 needed, 보유 b·c는 active)
    expect(s.cells(tree).map((c) => c.props.state)).toEqual(['needed', 'active', 'active'])
  })

  it('보유 후보가 없으면 첫 후보를 흐리게 보여 주고 «+» 동작은 아무 일도 하지 않는다', () => {
    const s = screenFor([slotOf('s1', 1, ['a', 'b'])], [])
    let tree = s.render()
    const card = s.cards(tree)[0]
    expect(card.props.status).toBe('unowned')
    expect(card.props.name).toBe('배지-a')
    press(card, 'onAdd')
    tree = s.render()
    expect(s.sheet(tree).props.open).toBe(false)
    expect(s.cards(tree)[0].props.status).toBe('unowned')
  })

  it('보유했지만 모두 다른 칸에 쓴 칸은 흐리다 — 같은 개체는 슬롯 하나에만 들어간다', () => {
    const s = screenFor([slotOf('s1', 1, ['a']), slotOf('s2', 2, ['a'])], [owned('i1', 'a')])
    let tree = s.render()
    expect(s.cards(tree).map((c) => c.props.status)).toEqual(['addable', 'addable'])
    press(s.cards(tree)[0], 'onAdd')
    tree = s.render()
    expect(s.cards(tree).map((c) => c.props.status)).toEqual(['filled', 'unowned'])
    // 칸 하나를 비우면 다른 칸이 다시 «+»가 된다
    press(s.cards(tree)[0], 'onRemove')
    tree = s.render()
    expect(s.cards(tree).map((c) => c.props.status)).toEqual(['addable', 'addable'])
  })

  it('조건 배지 슬롯도 같은 방식이다 — 보유 조건이면 바로 채우고 아니면 흐리다', () => {
    const s = screenFor(
      [slotOf('s1', 1, ['c1'], 'activity'), slotOf('s2', 2, ['c2'], 'checkin')],
      [],
      { ownedConditionBadgeIds: ['c1'] },
    )
    let tree = s.render()
    expect(s.cards(tree).map((c) => c.props.status)).toEqual(['addable', 'unowned'])
    press(s.cards(tree)[0], 'onAdd')
    tree = s.render()
    expect(s.sheet(tree).props.open).toBe(false)
    expect(s.cards(tree).map((c) => c.props.status)).toEqual(['filled', 'unowned'])
  })

  it('4칸 이하는 카드 여백을 줄이고(dense) 5칸은 줄이지 않는다', () => {
    const four = screenFor([slotOf('s1', 1, ['a'])], [owned('i1', 'a')])
    expect(four.cards(four.render())[0].props.dense).toBe(true)
    const five = screenFor(
      [1, 2, 3, 4, 5].map((n) => slotOf(`s${n}`, n, ['a'])),
      [owned('i1', 'a')],
    )
    expect(five.cards(five.render())[0].props.dense).toBe(false)
  })

  it('퀘스트 mix_success: 반짝임이 «+» → 다음 빈 칸의 «+» → 믹스하기 버튼으로 이어진다(시트 없이 바로 채움)', () => {
    const s = screenFor(
      [slotOf('s1', 1, ['a']), slotOf('s2', 2, ['b'])],
      [owned('i1', 'a'), owned('i2', 'b')],
      { questStep: 'mix_success' },
    )
    let tree = s.render()
    expect(s.cards(tree).map((c) => c.props.pulse)).toEqual([true, false])
    expect(String(s.cta(tree).props.className)).not.toContain('jam-quest-pulse')

    press(s.cards(tree)[0], 'onAdd')
    tree = s.render()
    expect(s.cards(tree).map((c) => c.props.pulse)).toEqual([false, true])

    press(s.cards(tree)[1], 'onAdd')
    tree = s.render()
    expect(s.cards(tree).map((c) => c.props.pulse)).toEqual([false, false])
    expect(String(s.cta(tree).props.className)).toContain('jam-quest-pulse')
  })

  it('퀘스트 mix_success: 시트가 열리면 반짝임이 칸이 아니라 시트의 활성 행으로 옮겨 간다', () => {
    const s = screenFor([slotOf('s1', 1, ['a'])], [owned('i1', 'a'), owned('i2', 'a')], { questStep: 'mix_success' })
    let tree = s.render()
    press(s.cards(tree)[0], 'onAdd')
    tree = s.render()
    expect(s.cards(tree)[0].props.pulse).toBe(false)
    expect(s.cells(tree).map((c) => c.props.pulse)).toEqual([true, false])
  })

  it('퀘스트: 첫 빈 칸이 흐린 칸이면 «+»가 없으므로 반짝임을 걸지 않는다', () => {
    const s = screenFor([slotOf('s1', 1, ['a'])], [], { questStep: 'mix_success' })
    const tree = s.render()
    expect(s.cards(tree)[0].props.status).toBe('unowned')
    expect(s.cards(tree)[0].props.pulse).toBe(false)
  })

  it('데모 모드: 첫 «+» 탭에서 mix_fail을 한 번만 기록한다', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    const s = screenFor(
      [slotOf('s1', 1, ['a']), slotOf('s2', 2, ['b'])],
      [owned('i1', 'a'), owned('i2', 'b')],
      { questStep: 'mix_fail' },
    )
    let tree = s.render()
    press(s.cards(tree)[0], 'onAdd')
    tree = s.render()
    press(s.cards(tree)[1], 'onAdd')
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: string }]
    expect(url).toBe('/api/onboarding-quest/step')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ step: 'mix_fail' })
  })

  it('데모 모드: 흐린 칸에는 «+»가 없어 mix_fail을 기록하지 않는다', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    const s = screenFor([slotOf('s1', 1, ['z'])], [], { questStep: 'mix_fail' })
    press(s.cards(s.render())[0], 'onAdd')
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('데모 모드가 아니면 «+»를 눌러도 mix_fail을 기록하지 않는다', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const s = screenFor([slotOf('s1', 1, ['a'])], [owned('i1', 'a')])
    press(s.cards(s.render())[0], 'onAdd')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mix_fail 기록이 실패하면 토스트로 알리고 플래그를 되돌려 다음 «+»에서 다시 시도한다', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    const s = screenFor(
      [slotOf('s1', 1, ['a']), slotOf('s2', 2, ['b'])],
      [owned('i1', 'a'), owned('i2', 'b')],
      { questStep: 'mix_fail' },
    )
    let tree = s.render()
    press(s.cards(tree)[0], 'onAdd')
    await new Promise((r) => setTimeout(r, 0))
    expect(toastMock).toHaveBeenCalledWith(d.onboardingQuest.mixStepSaveFailed, 'error')
    tree = s.render()
    press(s.cards(tree)[1], 'onAdd')
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
