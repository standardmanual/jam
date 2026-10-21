/**
 * 미션 상세 — 받을 보상 «받기» (티켓 20261019_1317 2회, 운영 로직 6.4절·7.3절)
 *
 * 고정하는 것
 *  - `resolveClaimOutcome`: 받기 API 응답(200 · 409 `insufficient_slots` · 409 `no_pending` · 403 `user_suspended` · 그 밖)을 화면이 다룰 갈래로 나눈다.
 *    서버가 보낸 `error` 문구를 우선 쓰고 없으면 `d.missions.claim` 문구로 대신한다.
 *  - 받기 버튼의 모든 상태: 대기 · 받는 중(같은 요청을 두 번 보내지 않음) · 성공(토스트 + `router.refresh()` + 카드 숨김) ·
 *    빈칸 부족(`free`·`needed` 안내 + 인벤토리 링크, 카드와 버튼 그대로) · 받을 보상 없음(서버 문구 토스트 + 새로 읽기) ·
 *    이용 정지(서버 문구 안내) · 404·500·네트워크 오류(토스트, 다시 누를 수 있음).
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 훅 중 `useState`만 호출 순서대로 값을 보관하는 가짜로 바꾸고
 * 컴포넌트 함수를 직접 불러 요소 트리를 읽는다(`ChapterRiseWatcher.test.tsx`와 같은 방식). 누르기는 트리에서 찾은 버튼의 `onClick`을 부르고,
 * 상태가 바뀐 뒤에는 컴포넌트를 다시 불러 새 트리를 읽는다. `fetch`·토스트·라우터는 가짜로 대신한다.
 * 실제 마크업(DOM) — 잠긴 보상의 이름·그림·id가 없음 포함 — 은 `MissionDetailClient.notice.test.tsx`가 서버 렌더로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/[id]/MissionDetailClient.claim.test.tsx"
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import type { MissionRow } from '@/types/database'

const store = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))
const toastMock = vi.hoisted(() => vi.fn())
const refreshMock = vi.hoisted(() => vi.fn())

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = store.cursor++
      if (!(index in store.slots)) store.slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial
      const set = (next: unknown) => {
        store.slots[index] = typeof next === 'function' ? (next as (prev: unknown) => unknown)(store.slots[index]) : next
      }
      return [store.slots[index], set]
    },
  }
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: refreshMock }),
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: toastMock }) }))
vi.mock('@/components/transitions-pages', () => ({ useRevealOnMount: () => ({ current: null }) }))
vi.mock('@/lib/analytics/gtag', () => ({ trackEvent: vi.fn() }))

import MissionDetailClient, { resolveClaimOutcome, type PendingRewardInfo } from './MissionDetailClient'
import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import { d } from '@/lib/i18n'

const OPEN: PendingRewardInfo = { locked: false, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: '한강 러너 캡', image_url: 'https://cdn.example/open.png', rarity: 'rare' }
const LOCKED: PendingRewardInfo = { locked: true, rarity: 'epic' }

const mission = {
  id: 'm1',
  title: '주말 러닝',
  description: null,
  mission_type: 'distance',
  condition_json: { distance_km: 10 },
  condition_text: null,
  reward_points: null,
  reward_badge_ids: [],
  max_completions: null,
  starts_at: '2026-01-01T00:00:00Z',
  ends_at: null,
  image_url: null,
} as unknown as MissionRow

/** 컴포넌트를 한 번 그린다. 저장된 상태(`store`)를 이어 받는다 */
function render(pendingRewards: PendingRewardInfo[] | null = [OPEN, LOCKED]): ReactNode {
  store.cursor = 0
  return MissionDetailClient({
    mission,
    isParticipating: true,
    isCompleted: true,
    progressValue: 10,
    rewardBadges: [],
    pendingRewards,
  })
}

/** 요소 트리를 깊이 우선으로 돈다. `children`뿐 아니라 요소를 값으로 받는 props(`action` 등)도 따라간다 */
function walk(node: unknown, visit: (element: ReactElement<Record<string, unknown>>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!isValidElement(node)) return
  const element = node as ReactElement<Record<string, unknown>>
  visit(element)
  for (const value of Object.values(element.props)) walk(value, visit)
}

function textOf(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node as ReactElement<{ children?: unknown }>).props.children)
  return ''
}

function find(tree: ReactNode, predicate: (element: ReactElement<Record<string, unknown>>) => boolean) {
  const found: ReactElement<Record<string, unknown>>[] = []
  walk(tree, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}

/** «받기»(또는 «받는 중») 버튼 — 없으면 undefined */
function claimButton(tree: ReactNode) {
  return find(tree, (el) => el.type === Button && [d.missions.pendingCard.claim, d.missions.pendingCard.claiming].some((label) => label === textOf(el.props.children)))[0]
}

/** 카드 안의 InlineNotice 글자 */
function noticeTexts(tree: ReactNode): string[] {
  return find(tree, (el) => el.type === InlineNotice).map((el) => textOf(el.props.children))
}

function click(button: ReactElement<Record<string, unknown>> | undefined): Promise<void> {
  expect(button).toBeDefined()
  return (button!.props.onClick as () => Promise<void>)()
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const fetchMock = vi.fn()

beforeEach(() => {
  store.slots = []
  store.cursor = 0
  toastMock.mockReset()
  refreshMock.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveClaimOutcome', () => {
  it('200이면 받았다. 받은 개수는 응답의 granted다', () => {
    expect(resolveClaimOutcome(200, true, { granted: 3, itemIds: ['a'] })).toEqual({ kind: 'claimed', granted: 3 })
  })

  it('granted가 없거나 0이면 개수를 모른다(null)', () => {
    expect(resolveClaimOutcome(200, true, {})).toEqual({ kind: 'claimed', granted: null })
    expect(resolveClaimOutcome(200, true, { granted: 0 })).toEqual({ kind: 'claimed', granted: null })
    expect(resolveClaimOutcome(200, true, null)).toEqual({ kind: 'claimed', granted: null })
  })

  it('409 insufficient_slots는 free·needed를 싣고 서버 문구를 쓴다', () => {
    expect(resolveClaimOutcome(409, false, { error: '서버 문구', code: 'insufficient_slots', free: 1, needed: 3 })).toEqual({
      kind: 'insufficient_slots',
      free: 1,
      needed: 3,
      message: '서버 문구',
    })
  })

  it('free·needed가 숫자가 아니면 null이고 문구는 d.missions.claim으로 대신한다', () => {
    expect(resolveClaimOutcome(409, false, { code: 'insufficient_slots', free: '1', needed: -2 })).toEqual({
      kind: 'insufficient_slots',
      free: null,
      needed: null,
      message: d.missions.claim.insufficientSlots,
    })
  })

  it('409 no_pending은 받을 보상이 더 없다', () => {
    expect(resolveClaimOutcome(409, false, { error: '이미 받았어요', code: 'no_pending' })).toEqual({ kind: 'no_pending', message: '이미 받았어요' })
    expect(resolveClaimOutcome(409, false, { code: 'no_pending' })).toEqual({ kind: 'no_pending', message: d.missions.claim.noPending })
  })

  it('403 user_suspended는 이용 정지다. 서버 문구가 없으면 정지 안내 문구로 대신한다', () => {
    expect(resolveClaimOutcome(403, false, { error: '정지 안내', code: 'user_suspended' })).toEqual({ kind: 'suspended', message: '정지 안내' })
    expect(resolveClaimOutcome(403, false, { code: 'user_suspended' })).toEqual({ kind: 'suspended', message: d.suspension.missionClaimBlocked })
  })

  it('코드가 다른 403·409와 404·500은 실패다', () => {
    expect(resolveClaimOutcome(403, false, { error: '권한 없음' })).toEqual({ kind: 'failed', message: '권한 없음' })
    expect(resolveClaimOutcome(409, false, { code: 'other' })).toEqual({ kind: 'failed', message: d.missions.claim.failed })
    expect(resolveClaimOutcome(404, false, { error: '인벤토리를 찾지 못했어요', code: 'inventory_not_found' })).toEqual({
      kind: 'failed',
      message: '인벤토리를 찾지 못했어요',
    })
    expect(resolveClaimOutcome(500, false, { error: '실패' })).toEqual({ kind: 'failed', message: '실패' })
  })

  it('본문을 읽지 못해도(null·문자열·배열) 실패 문구로 대신한다', () => {
    for (const body of [null, undefined, '오류', ['x']]) {
      expect(resolveClaimOutcome(500, false, body)).toEqual({ kind: 'failed', message: d.missions.claim.failed })
    }
  })
})

describe('받기 버튼 — 처음 모양', () => {
  it('«받기» 버튼이 있고 받는 중이 아니다', () => {
    const button = claimButton(render())

    expect(button?.props.loading).toBe(false)
    expect(textOf(button?.props.children)).toBe(d.missions.pendingCard.claim)
    expect(noticeTexts(render())).toEqual([])
  })

  it('받을 보상이 없으면 버튼이 없다', () => {
    expect(claimButton(render([]))).toBeUndefined()
  })

  it('읽지 못함(null)이면 받기 버튼이 아니라 «다시 시도»만 있다', () => {
    const tree = render(null)

    expect(claimButton(tree)).toBeUndefined()
    expect(noticeTexts(tree)).toEqual([d.missions.pendingCard.loadFailed])
    const retry = find(tree, (el) => el.type === Button && textOf(el.props.children) === d.missions.pendingCard.retry)[0]
    expect(retry).toBeDefined()
    void (retry.props.onClick as () => void)()
    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})

describe('받기 버튼 — 누르면', () => {
  it('POST /api/missions/{id}/claim 을 한 번 보낸다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { granted: 2, itemIds: ['a', 'b'] }))

    await click(claimButton(render()))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/missions/m1/claim')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' })
  })

  it('받는 중에는 버튼이 loading이고 «받는 중»이며, 다시 눌러도 요청을 또 보내지 않는다', async () => {
    let finish: (value: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((resolve) => { finish = resolve }))

    const pending = click(claimButton(render()))
    const during = claimButton(render())
    expect(during?.props.loading).toBe(true)
    expect(textOf(during?.props.children)).toBe(d.missions.pendingCard.claiming)

    await click(during)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    finish(jsonResponse(200, { granted: 2 }))
    await pending
  })

  it('성공하면 토스트를 띄우고 새로 읽고 카드를 바로 숨긴다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { granted: 2, itemIds: ['a', 'b'] }))

    await click(claimButton(render()))

    expect(toastMock).toHaveBeenCalledWith('미션 보상 2개를 받았어요', 'success')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    const after = render()
    expect(claimButton(after)).toBeUndefined()
    expect(textOf(after)).not.toContain(d.missions.pendingCard.title)
  })

  it('응답에 granted가 없으면 카드의 보상 개수로 토스트를 띄운다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))

    await click(claimButton(render([OPEN, LOCKED, OPEN])))

    expect(toastMock).toHaveBeenCalledWith('미션 보상 3개를 받았어요', 'success')
  })

  it('409 빈칸 부족이면 free·needed로 안내하고 인벤토리 링크를 둔다. 카드와 버튼은 그대로고 토스트·새로 읽기는 없다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: '서버 문구', code: 'insufficient_slots', free: 1, needed: 3 }))

    await click(claimButton(render()))

    const after = render()
    expect(noticeTexts(after)).toEqual(['지금 빈칸 1개, 받으려면 3개가 필요해요. 받지 못한 보상은 그대로 남아 있어요.'])
    const link = find(after, (el) => typeof el.props.href === 'string' && el.props.href === '/inventory')[0]
    expect(textOf(link.props.children)).toBe(d.missions.pendingCard.inventoryLink)
    expect(claimButton(after)?.props.loading).toBe(false)
    expect(toastMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('409 빈칸 부족인데 숫자가 없으면 서버 문구를 안내로 쓴다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: '서버 문구', code: 'insufficient_slots' }))

    await click(claimButton(render()))

    expect(noticeTexts(render())).toEqual(['서버 문구'])
  })

  it('빈칸 부족 뒤에 다시 눌러 성공하면 안내가 사라지고 카드가 숨는다', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(409, { code: 'insufficient_slots', free: 0, needed: 2 }))
      .mockResolvedValueOnce(jsonResponse(200, { granted: 2 }))

    await click(claimButton(render()))
    expect(noticeTexts(render())).toHaveLength(1)

    await click(claimButton(render()))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(claimButton(render())).toBeUndefined()
    expect(noticeTexts(render())).toEqual([])
    expect(toastMock).toHaveBeenCalledWith('미션 보상 2개를 받았어요', 'success')
  })

  it('409 받을 보상 없음이면 서버 문구를 토스트로 알리고 새로 읽고 카드를 거둔다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { error: '이미 받았을 수 있어요', code: 'no_pending' }))

    await click(claimButton(render()))

    expect(toastMock).toHaveBeenCalledWith('이미 받았을 수 있어요', 'info')
    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(claimButton(render())).toBeUndefined()
  })

  it('403 이용 정지이면 서버 문구를 카드 안에 안내한다. 인벤토리 링크는 없다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: '이용이 정지된 계정이에요', code: 'user_suspended' }))

    await click(claimButton(render()))

    const after = render()
    expect(noticeTexts(after)).toEqual(['이용이 정지된 계정이에요'])
    expect(find(after, (el) => el.props.href === '/inventory')).toHaveLength(0)
    expect(claimButton(after)?.props.loading).toBe(false)
    expect(toastMock).not.toHaveBeenCalled()
  })

  it('404는 서버 문구를 오류 토스트로 알린다. 카드는 그대로고 다시 누를 수 있다', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: '인벤토리를 찾지 못해 미션 보상을 받지 못했어요.', code: 'inventory_not_found' }))

    await click(claimButton(render()))

    expect(toastMock).toHaveBeenCalledWith('인벤토리를 찾지 못해 미션 보상을 받지 못했어요.', 'error')
    expect(refreshMock).not.toHaveBeenCalled()
    expect(claimButton(render())?.props.loading).toBe(false)
  })

  it('500이면 서버 문구, 본문이 없으면 기본 실패 문구를 오류 토스트로 알린다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: d.missions.claim.failed }))
    await click(claimButton(render()))
    expect(toastMock).toHaveBeenLastCalledWith(d.missions.claim.failed, 'error')

    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => { throw new Error('not json') } })
    await click(claimButton(render()))
    expect(toastMock).toHaveBeenLastCalledWith(d.missions.claim.failed, 'error')
    expect(toastMock).toHaveBeenCalledTimes(2)
  })

  it('네트워크 오류이면 오류 토스트를 띄우고 버튼이 풀려 다시 누를 수 있다', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))

    await click(claimButton(render()))

    expect(toastMock).toHaveBeenCalledWith(d.missions.claim.failed, 'error')
    expect(refreshMock).not.toHaveBeenCalled()
    const again = claimButton(render())
    expect(again?.props.loading).toBe(false)

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { granted: 2 }))
    await click(again)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(toastMock).toHaveBeenLastCalledWith('미션 보상 2개를 받았어요', 'success')
  })
})
