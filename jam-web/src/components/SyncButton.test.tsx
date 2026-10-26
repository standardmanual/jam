/**
 * 동기화 버튼의 결과 갈래 — 이번에 받은 잼의 합계 (티켓 20261025_2050)
 *
 * 저장소에 jsdom·testing-library가 없어(vitest `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)만 쓴다. 정적 렌더는 클릭을 보낼 수
 * 없으므로 `Button` 목이 렌더 때 받은 `onClick`(= `handleSync`)을 붙잡아 두었다가 직접 부른다. 서버 렌더가 끝난 뒤의 `setState`는 아무것도
 * 하지 않으므로, 이 시험이 보는 것은 상태가 아니라 토스트 호출·화면 새로 읽기 호출·분석 이벤트다. 오버레이에 실리는 헤더 한 줄과 라이브 리전은
 * `BadgeRevealOverlay.summary.test.tsx`가, 갈래 판정과 값 접기는 `lib/strava/__tests__/sync-result.test.ts`가 고정한다.
 *
 * 갈래: (a) 배지 있음 → 토스트 없음, 새로 읽기는 오버레이를 닫을 때로 미룬다 / (b) 배지 0개 → 토스트 + 새로 읽기 /
 *       (c) 보류 고르기를 먼저 보여 준 뒤 배지 0개 → 잼이 있을 때만 토스트.
 *
 * 실행: cd jam-web && npx vitest run src/components/SyncButton.test.tsx
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  openPicker: vi.fn(),
  trackEvent: vi.fn(),
  onClick: undefined as undefined | (() => Promise<void>),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, back: vi.fn(), prefetch: vi.fn(), refresh: mocks.refresh }),
}))

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}))

vi.mock('@/components/ui/Button', () => ({
  default: (props: { onClick?: () => Promise<void> }) => {
    mocks.onClick = props.onClick
    return null
  },
}))

vi.mock('@/components/strava/PendingItemsPickerProvider', () => ({
  usePendingItemsPicker: () => ({ openPicker: mocks.openPicker }),
}))

vi.mock('@/lib/analytics/gtag', () => ({
  trackEvent: mocks.trackEvent,
}))

import SyncButton from '@/components/SyncButton'
import { d } from '@/lib/i18n'

const JAM_LINE = '이번에 잼 1,240만큼 받았어요'
const BADGE = { id: 'b1', name: '들꽃', description: '길가에서 만났어요', imageUrl: null, rarity: 'common' as const }

/** 동기화 응답을 흉내 낸다. `fetch`가 매번 새 `Response`를 만든다 */
function respond(body: Record<string, unknown>, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
  )
}

/** 버튼을 렌더하고 눌렀을 때와 같이 `handleSync`를 끝까지 돌린다 */
async function sync() {
  const html = renderToStaticMarkup(<SyncButton username="runner" />)
  expect(mocks.onClick).toBeTypeOf('function')
  await mocks.onClick?.()
  return html
}

const base = { synced: 3, badges: 0, itemBooksCompleted: 0, missionsCompleted: 0 }

beforeEach(() => {
  mocks.toast.mockReset()
  mocks.refresh.mockReset()
  mocks.replace.mockReset()
  mocks.trackEvent.mockReset()
  mocks.openPicker.mockReset().mockResolvedValue('resolved')
  mocks.onClick = undefined
})

describe('SyncButton — 처음 렌더', () => {
  it('오버레이가 닫혀 있어 잼 줄이 보이지 않는다', async () => {
    respond({ ...base })
    const html = renderToStaticMarkup(<SyncButton username="runner" />)
    expect(html).not.toContain('이번에 잼')
  })
})

describe('SyncButton — (b) 배지 0개', () => {
  it('잼이 있으면 «동기화 완료» 대신 같은 문구의 success 토스트 한 줄을 내고 화면을 새로 읽는다', async () => {
    respond({ ...base, jamEarned: 1240 })
    await sync()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(JAM_LINE, 'success')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('토스트에 «동기화 완료»를 이어 붙이지 않고 활동별 잼 숫자도 싣지 않는다', async () => {
    respond({ ...base, jamEarned: 1240, activities: [{ id: 1, jam: 400 }, { id: 2, jam: 840 }] })
    await sync()
    const [message] = mocks.toast.mock.calls[0] as [string, string]
    expect(message).toBe(JAM_LINE)
    expect(message).not.toContain(d.today.syncDone)
    expect(message).not.toMatch(/400|840/)
  })

  it.each([
    ['jamEarned 없음(옛 응답)', {}],
    ['0', { jamEarned: 0 }],
    ['null', { jamEarned: null }],
    ['음수', { jamEarned: -30 }],
    ['숫자 문자열', { jamEarned: '120' }],
  ])('잼이 %s이면 지금 그대로 «동기화 완료» 토스트다', async (_label, extra) => {
    respond({ ...base, ...extra })
    await sync()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(d.today.syncDone, 'success')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('소수 합계는 내리고 큰 수는 쉼표로 끊는다', async () => {
    respond({ ...base, jamEarned: 12345.9 })
    await sync()
    expect(mocks.toast).toHaveBeenCalledWith('이번에 잼 12,345만큼 받았어요', 'success')
  })
})

describe('SyncButton — (c) 보류 고르기를 먼저 보여 준 뒤 배지 0개', () => {
  it('잼이 있으면 같은 잼 토스트를 낸다', async () => {
    respond({ ...base, pendingItems: 2, jamEarned: 1240 })
    await sync()
    expect(mocks.openPicker).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(JAM_LINE, 'success')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['jamEarned 없음', {}],
    ['0', { jamEarned: 0 }],
    ['음수', { jamEarned: -1 }],
  ])('잼이 %s이면 지금 그대로 토스트 없이 화면만 새로 읽는다', async (_label, extra) => {
    respond({ ...base, pendingItems: 2, ...extra })
    await sync()
    expect(mocks.openPicker).toHaveBeenCalledTimes(1)
    expect(mocks.toast).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('SyncButton — (a) 배지가 있을 때', () => {
  it('토스트를 내지 않고 새로 읽기를 오버레이를 닫을 때로 미룬다(잼이 있어도 없어도)', async () => {
    for (const extra of [{ jamEarned: 1240 }, {}]) {
      mocks.toast.mockReset()
      mocks.refresh.mockReset()
      respond({ ...base, earnedBadges: [BADGE], ...extra })
      await sync()
      expect(mocks.toast).not.toHaveBeenCalled()
      expect(mocks.refresh).not.toHaveBeenCalled()
    }
  })

  it('첫 배지 이벤트는 지금처럼 보낸다', async () => {
    respond({ ...base, earnedBadges: [BADGE], isFirstBadgeEver: true, jamEarned: 90 })
    await sync()
    expect(mocks.trackEvent).toHaveBeenCalledWith('first_badge_earned')
  })
})

describe('SyncButton — 실패 응답', () => {
  it('실패 응답에는 잼 줄을 붙이지 않는다', async () => {
    respond({ error: 'boom', jamEarned: 99 }, 500)
    await sync()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
    expect(mocks.toast).toHaveBeenCalledWith(d.today.syncFailed, 'error')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
