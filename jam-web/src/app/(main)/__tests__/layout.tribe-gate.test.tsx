/**
 * `(main)/layout.tsx`의 트라이브 게이트 (티켓 20261021_1247 1회, 운영 로직 2장)
 *
 * 고정하는 것
 *  - 트라이브가 없으면(tribe_id가 null·빈 문자열·행이 없음) `/onboarding`으로 보낸다. 본문(children)은 그려지지 않는다.
 *  - 트라이브가 있으면 막지 않고 본문과 탭 바가 그려진다.
 *  - `users`를 읽지 못하면(오류) 막지 않고 로그만 남긴다 — 읽기 실패 한 번으로 트라이브를 고른 유저를 쫓아내지 않는다. 판정은 같은 `users` 조회의
 *    `tribe_id` 한 칸을 더한 것이라 조회 횟수가 늘지 않는다(users 조회는 한 번).
 *  - 비로그인은 이전처럼 `/login`이고 `users`를 읽지 않는다.
 *  - **되돌림 반복이 없다**: 이 레이아웃이 `/onboarding`으로 보내는 모든 `users` 행에 대해 고르기 화면의 진입 판정(`resolveOnboardingEntry`)은
 *    홈으로 되돌리지 않는다. 고르기 화면은 `(main)` 밖(`(onboarding)` 그룹)에 있어 이 레이아웃을 지나지 않는다(파일 위치 확인).
 *
 * 서버 컴포넌트를 함수로 불러 얻은 요소 트리를 읽는다. 클라이언트 자식은 구분되는 가짜 컴포넌트로 대신하고 Supabase는 기록형 가짜다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/__tests__/layout.tribe-gate.test.tsx"
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

const USER_ID = '11111111-1111-4111-8111-111111111111'

const state = vi.hoisted(() => ({
  authenticated: true,
  users: { data: { username: 'runner', avatar_url: null, notifications_seen_at: null, tribe_id: 'tribe-1' } as unknown, error: null as unknown },
  usersReads: 0,
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
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => {
          if (table === 'users') {
            state.usersReads += 1
            return state.users
          }
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
vi.mock('@/lib/capsule/unseen', () => ({ readUnseenCapsuleResultOrNull: async () => null }))
vi.mock('@/components/capsule/CapsuleResultProvider', () => ({
  default: function CapsuleResultProviderStub() {
    return null
  },
}))
vi.mock('@/components/chapter/ChapterRiseWatcher', () => ({
  default: function ChapterRiseWatcherStub() {
    return null
  },
}))

import MainLayout from '../layout'
import TabBar from '@/components/ui/TabBar'
import { resolveOnboardingEntry } from '../../(onboarding)/onboarding/onboarding-entry'

const CHILD_MARKER = 'layout-tribe-gate-test-child'
const appRoot = fileURLToPath(new URL('../../', import.meta.url))

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

function hasChild(tree: ReactNode): boolean {
  let found = false
  walk(tree, (element) => {
    if (element.props['data-marker'] === CHILD_MARKER) found = true
  })
  return found
}

function countOf(tree: ReactNode, type: unknown): number {
  let count = 0
  walk(tree, (element) => {
    if (element.type === type) count += 1
  })
  return count
}

/** 레이아웃을 실행해 «어디로 보냈는가»를 돌려준다. 보내지 않으면 null */
async function redirectOf(): Promise<string | null> {
  try {
    await MainLayout({ children: <p data-marker={CHILD_MARKER}>본문</p> })
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.startsWith('NEXT_REDIRECT:')) return message.slice('NEXT_REDIRECT:'.length)
    throw err
  }
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.authenticated = true
  state.users = { data: { username: 'runner', avatar_url: null, notifications_seen_at: null, tribe_id: 'tribe-1' }, error: null }
  state.usersReads = 0
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('(main)/layout — 트라이브 게이트', () => {
  it('트라이브가 없으면 /onboarding으로 보낸다', async () => {
    state.users = { data: { username: 'runner', avatar_url: null, notifications_seen_at: null, tribe_id: null }, error: null }

    await expect(redirectOf()).resolves.toBe('/onboarding')
  })

  it('아이디가 없는 신규 유저(tribe_id도 없음)도 /onboarding으로 보낸다', async () => {
    state.users = { data: { username: null, avatar_url: null, notifications_seen_at: null, tribe_id: null }, error: null }

    await expect(redirectOf()).resolves.toBe('/onboarding')
  })

  it('tribe_id가 빈 문자열이거나 users 행이 없어도 /onboarding으로 보낸다', async () => {
    state.users = { data: { username: 'runner', tribe_id: '' }, error: null }
    await expect(redirectOf()).resolves.toBe('/onboarding')

    state.users = { data: null, error: null }
    await expect(redirectOf()).resolves.toBe('/onboarding')
  })

  it('온보딩 완료 시각은 있는데 트라이브가 없는 계정도 막는다(판정 기준은 tribe_id 하나다)', async () => {
    state.users = {
      data: { username: 'runner', avatar_url: null, notifications_seen_at: null, tribe_id: null, onboarding_completed_at: '2026-09-20T00:00:00.000Z' },
      error: null,
    }

    await expect(redirectOf()).resolves.toBe('/onboarding')
  })

  it('트라이브가 있으면 막지 않고 본문과 탭 바를 그린다', async () => {
    const tree = await MainLayout({ children: <p data-marker={CHILD_MARKER}>본문</p> })

    expect(hasChild(tree)).toBe(true)
    expect(countOf(tree, TabBar)).toBe(1)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('users 조회가 오류면 막지 않고 로그만 남긴다(읽기 실패 한 번으로 유저를 쫓아내지 않는다)', async () => {
    const dbError = { message: 'connection reset', code: '57P01' }
    state.users = { data: null, error: dbError }

    const tree = await MainLayout({ children: <p data-marker={CHILD_MARKER}>본문</p> })

    expect(hasChild(tree)).toBe(true)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('users 조회 실패')
    expect(errorSpy.mock.calls[0][1]).toBe(dbError)
  })

  it('판정은 users를 한 번만 읽는 같은 조회에서 나온다(조회 횟수가 늘지 않는다)', async () => {
    await redirectOf()

    expect(state.usersReads).toBe(1)
  })

  it('비로그인은 /login이고 users를 읽지 않는다', async () => {
    state.authenticated = false

    await expect(redirectOf()).resolves.toBe('/login')
    expect(state.usersReads).toBe(0)
  })
})

describe('트라이브 게이트와 고르기 화면 사이에 되돌림 반복이 없다', () => {
  // 레이아웃이 /onboarding으로 보내는 users 행의 모양들 — 공용 DB에서 실제로 있는 조합을 포함한다
  const ROWS: { name: string; row: Record<string, unknown> | null }[] = [
    { name: '신규(행은 있고 아이디도 트라이브도 없음)', row: { username: null, display_name: null, avatar_url: null, notifications_seen_at: null, tribe_id: null } },
    { name: '1단계만 마침(아이디 있음, 트라이브 없음)', row: { username: 'runner', display_name: '러너', avatar_url: null, notifications_seen_at: null, tribe_id: null } },
    { name: '완료 시각은 있는데 트라이브가 없음(공용 DB의 7개 계정 유형)', row: { username: 'runner', display_name: '러너', avatar_url: null, notifications_seen_at: null, tribe_id: null, onboarding_completed_at: '2026-09-20T00:00:00.000Z' } },
    { name: 'tribe_id가 빈 문자열', row: { username: 'runner', display_name: '러너', avatar_url: null, notifications_seen_at: null, tribe_id: '' } },
    { name: 'users 행이 없음', row: null },
  ]

  it.each(ROWS)('$name: 게이트가 /onboarding으로 보내면 고르기 화면은 홈으로 되돌리지 않는다', async ({ row }) => {
    state.users = { data: row, error: null }

    expect(await redirectOf()).toBe('/onboarding')
    expect(resolveOnboardingEntry(row as Parameters<typeof resolveOnboardingEntry>[0]).kind).not.toBe('home')
  })

  it('트라이브가 있는 행은 게이트를 지나고, 고르기 화면에 와도 홈으로 보낸다(서로 다른 곳으로 보내지 않는다)', async () => {
    const row = { username: 'runner', display_name: '러너', avatar_url: null, notifications_seen_at: null, tribe_id: 'tribe-1' }
    state.users = { data: row, error: null }

    expect(await redirectOf()).toBeNull()
    expect(resolveOnboardingEntry(row).kind).toBe('home')
  })

  it('고르기 화면은 (main) 밖에 있고, 그 레이아웃에는 리다이렉트도 트라이브 조회도 없다', () => {
    expect(existsSync(join(appRoot, '(main)/onboarding'))).toBe(false)
    expect(existsSync(join(appRoot, '(onboarding)/onboarding/page.tsx'))).toBe(true)

    const layout = readFileSync(join(appRoot, '(onboarding)/layout.tsx'), 'utf8')
    // 주석에는 설명으로 나올 수 있어 코드 부분만 본다
    const code = layout.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/\bredirect\b/)
    expect(code).not.toMatch(/supabase|tribe_id|hasTribe|createServiceClient/)
    // 하단 탭 바는 두지 않는다(눌러도 이 화면으로 되돌아오는 탭을 보이지 않는다)
    expect(code).not.toMatch(/TabBar/)
  })
})
