/**
 * `(main)/layout.tsx`의 그리는 뼈대 (티켓 20261106_1104 — 챕터 오름 전체 화면 카드를 걷으며 옛 `layout.chapter.test.tsx`를 이 이름으로 줄였다)
 *
 * 고정하는 것
 *  - 챕터 오름 감시자는 없다. 레이아웃은 `user_chapters`를 읽지 않고(오름은 알림 행과 프로필 표기로만 보인다), 전체 화면 카드를 그리지 않는다.
 *  - 합친 연출을 걷었다(티켓 20261106_1028): 레이아웃은 보지 않은 캡슐 결과를 읽지 않고, 본문·탭 바·연결 오버레이는 프로바이더 없이 그려진다.
 *  - 비로그인은 `/login`으로 보내고 아무것도 읽지 않는다.
 *  - 흰 페이지 면(티켓 20261104_1642).
 *
 * 서버 컴포넌트를 함수로 불러 얻은 요소 트리를 읽는다. 클라이언트 자식은 구분되는 가짜 컴포넌트로 대신하고 Supabase는 기록형 가짜다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/__tests__/layout.shell.test.tsx"
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const USER_ID = '11111111-1111-4111-8111-111111111111'

interface Read {
  table: string
  select: string
  eq: [string, unknown][]
}

const state = vi.hoisted(() => ({
  authenticated: true,
  reads: [] as unknown[],
}))

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      const read: Read = { table, select: '', eq: [] }
      state.reads.push(read)
      const builder = {
        select: (columns: string) => {
          read.select = columns
          return builder
        },
        eq: (column: string, value: unknown) => {
          read.eq.push([column, value])
          return builder
        },
        maybeSingle: async () => {
          // tribe_id가 있어야 트라이브 게이트(티켓 20261021_1247)를 지나 본문까지 그려진다 — 게이트 자체는 layout.tribe-gate.test.tsx가 맡는다
          if (table === 'users') return { data: { username: 'runner', avatar_url: null, notifications_seen_at: null, tribe_id: 'tribe-1' }, error: null }
          return { data: null, error: null }
        },
      }
      return builder
    },
  }),
}))
vi.mock('@/lib/notifications/feed', () => ({
  hasUnread: () => false,
  latestBumpingNotificationAt: async () => null,
}))
vi.mock('@/lib/onboarding-quest/preview', () => ({ getAdminQuestPreview: async () => null }))
vi.mock('@/lib/strava/pending-items', () => ({ countPendingItems: async () => 0 }))
vi.mock('@/lib/topNavData', () => ({
  TopNavDataProvider: function TopNavDataProviderStub() {
    return null
  },
}))
vi.mock('@/components/ui/Toast', () => ({
  ToastProvider: function ToastProviderStub() {
    return null
  },
}))
vi.mock('@/components/ui/TabBar', () => ({
  default: function TabBarStub() {
    return null
  },
}))
vi.mock('@/components/ui/Footer', () => ({
  default: function FooterStub() {
    return null
  },
}))
vi.mock('@/components/StravaConnectReveal', () => ({
  default: function StravaConnectRevealStub() {
    return null
  },
}))
vi.mock('@/components/strava/StravaDuplicateSheet', () => ({
  default: function StravaDuplicateSheetStub() {
    return null
  },
}))
vi.mock('@/components/strava/PendingItemsPickerProvider', () => ({
  default: function PendingItemsPickerProviderStub() {
    return null
  },
}))
vi.mock('@/components/QuestPreviewBanner', () => ({
  default: function QuestPreviewBannerStub() {
    return null
  },
}))

import MainLayout from '../layout'
import TabBar from '@/components/ui/TabBar'
import StravaConnectReveal from '@/components/StravaConnectReveal'
import { MAIN_PAGE_BACKGROUND } from '@/lib/pageBackground'

const CHILD_MARKER = 'layout-shell-test-child'

/** 요소 트리를 깊이 우선으로 돈다. `children`뿐 아니라 요소를 값으로 받는 props도 따라간다 */
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

function findByType(tree: ReactNode, type: unknown) {
  const found: ReactElement<Record<string, unknown>>[] = []
  walk(tree, (element) => {
    if (element.type === type) found.push(element)
  })
  return found
}

async function renderLayout(): Promise<ReactNode> {
  return MainLayout({ children: <p data-marker={CHILD_MARKER}>본문</p> })
}

function hasChild(tree: ReactNode): boolean {
  let found = false
  walk(tree, (element) => {
    if (element.props['data-marker'] === CHILD_MARKER) found = true
  })
  return found
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.authenticated = true
  state.reads = []
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('(main)/layout — 챕터 오름 카드를 걷은 뒤 (티켓 20261106_1104)', () => {
  it('user_chapters를 읽지 않는다', async () => {
    await renderLayout()

    expect((state.reads as Read[]).map((r) => r.table)).not.toContain('user_chapters')
  })

  it('보지 않은 캡슐 결과 표를 읽지 않는다 (티켓 20261106_1028)', async () => {
    await renderLayout()

    expect((state.reads as Read[]).map((r) => r.table)).not.toContain('capsule_unseen_results')
  })

  it('본문·탭 바·연결 오버레이가 그려지고 챕터 오름 카드를 띄우는 요소는 없다', async () => {
    const tree = await renderLayout()

    expect(hasChild(tree)).toBe(true)
    expect(findByType(tree, TabBar)).toHaveLength(1)
    expect(findByType(tree, StravaConnectReveal)).toHaveLength(1)
    const names: string[] = []
    walk(tree, (element) => {
      if (typeof element.type === 'function') names.push(element.type.name)
    })
    expect(names.filter((n) => n.includes('ChapterRise'))).toEqual([])
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('(main)/layout — 비로그인', () => {
  it('/login으로 보내고 아무것도 읽지 않는다', async () => {
    state.authenticated = false

    await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT:/login')

    expect(state.reads).toEqual([])
  })
})

describe('(main)/layout — 흰 페이지 면 (티켓 20261104_1642)', () => {
  it('main 배경은 MAIN_PAGE_BACKGROUND(--background)이고 하단 여백이 없어 푸터 로고가 페이지 맨 끝에 닿는다', async () => {
    const tree = await renderLayout()
    const [main] = findByType(tree, 'main')
    expect(main.props.style).toBe(MAIN_PAGE_BACKGROUND)
    expect(MAIN_PAGE_BACKGROUND.background).toBe('var(--background)')
    expect(String(main.props.className)).not.toContain('pb-')

    const wrappers = findByType(tree, 'div').filter((el) => String(el.props.className ?? '').includes('max-w-[430px]'))
    expect(wrappers).toHaveLength(1)
    expect(String(wrappers[0].props.className)).not.toContain('pb-')
    // 서비스 열 전체가 흰색이므로 바깥 래퍼도 같은 배경을 건다
    expect(wrappers[0].props.style).toMatchObject(MAIN_PAGE_BACKGROUND)
  })
})
