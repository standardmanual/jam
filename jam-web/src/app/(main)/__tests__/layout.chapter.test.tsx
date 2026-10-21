/**
 * `(main)/layout.tsx`의 챕터 번호 읽기 배선 (티켓 20261019_1317 3회 — 1회 게이트 참고 사항 ②의 답)
 *
 * 판정 로직(`parseChapterNo`·`claimChapterRise`)은 따로 시험돼 있지만, 레이아웃이 `user_chapters`를 읽어 `ChapterRiseWatcher`로 이어 붙이는 부분은
 * CI가 잡지 못했다. 여기서 그 배선을 고정한다.
 *
 * 고정하는 것
 *  - 챕터 행이 있으면 `ChapterRiseWatcher`가 `chapterNo`와 `userId` 둘만 받아 한 번 그려진다.
 *  - 행이 없거나(퀘스트 전) 값이 손상됐거나(0·음수·소수·문자·NULL) 읽기에 실패하면 그려지지 않는다. 읽기 실패는 `console.error`로 남는다.
 *    읽기가 실패해도 레이아웃은 깨지지 않고 본문(children)과 탭 바가 그대로 나온다.
 *  - `user_chapters`에서 읽는 것은 `chapter_no` 한 칸뿐이고 세션 유저의 행만 읽는다(이름·진행 비율은 읽지 않는다 — 레이아웃은 화면을 열 때마다 돈다).
 *  - 비로그인은 `/login`으로 보내고 아무것도 읽지 않는다.
 *
 * 서버 컴포넌트를 함수로 불러 얻은 요소 트리를 읽는다. 클라이언트 자식은 구분되는 가짜 컴포넌트로 대신하고 Supabase는 기록형 가짜다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/__tests__/layout.chapter.test.tsx"
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
  chapter: { data: { chapter_no: 3 } as unknown, error: null as unknown },
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
          if (table === 'user_chapters') return state.chapter
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
vi.mock('@/components/chapter/ChapterRiseWatcher', () => ({
  default: function ChapterRiseWatcherStub() {
    return null
  },
}))

import MainLayout from '../layout'
import ChapterRiseWatcher from '@/components/chapter/ChapterRiseWatcher'
import TabBar from '@/components/ui/TabBar'
import StravaConnectReveal from '@/components/StravaConnectReveal'

const CHILD_MARKER = 'layout-chapter-test-child'

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

function chapterReads(): Read[] {
  return (state.reads as Read[]).filter((r) => r.table === 'user_chapters')
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  state.authenticated = true
  state.chapter = { data: { chapter_no: 3 }, error: null }
  state.reads = []
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('(main)/layout — 챕터 오름 감시 배선', () => {
  it('챕터 행이 있으면 ChapterRiseWatcher가 chapterNo·userId와 함께 한 번 그려진다', async () => {
    const tree = await renderLayout()

    const watchers = findByType(tree, ChapterRiseWatcher)
    expect(watchers).toHaveLength(1)
    expect(watchers[0].props).toEqual({ chapterNo: 3, userId: USER_ID })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('감시 컴포넌트는 접속 유저 id만 받고 점수·이름·진행 값은 받지 않는다', async () => {
    state.chapter = { data: { chapter_no: 5, name: '단골', score: 480 }, error: null }

    const [watcher] = findByType(await renderLayout(), ChapterRiseWatcher)

    expect(Object.keys(watcher.props).sort()).toEqual(['chapterNo', 'userId'])
    expect(JSON.stringify(watcher.props)).not.toContain('단골')
    expect(JSON.stringify(watcher.props)).not.toContain('480')
  })

  it('챕터 번호가 문자열 숫자로 와도 번호로 바꿔 내려준다', async () => {
    state.chapter = { data: { chapter_no: '4' }, error: null }

    const [watcher] = findByType(await renderLayout(), ChapterRiseWatcher)

    expect(watcher.props.chapterNo).toBe(4)
  })

  it('행이 없으면(퀘스트 전) 그려지지 않고 오류도 남기지 않는다', async () => {
    state.chapter = { data: null, error: null }

    const tree = await renderLayout()

    expect(findByType(tree, ChapterRiseWatcher)).toHaveLength(0)
    expect(errorSpy).not.toHaveBeenCalled()
    expect(hasChild(tree)).toBe(true)
  })

  it('값이 손상됐으면(0·음수·소수·문자·NULL·안전하지 않은 큰 수) 그려지지 않는다', async () => {
    for (const corrupt of [0, -1, 2.5, 'x', '', '0', '03', null, undefined, Number.MAX_SAFE_INTEGER + 2, {}, [3]]) {
      state.chapter = { data: { chapter_no: corrupt }, error: null }

      const tree = await renderLayout()

      expect(findByType(tree, ChapterRiseWatcher), `chapter_no=${JSON.stringify(corrupt)}`).toHaveLength(0)
    }
  })

  it('읽기에 실패하면 그려지지 않고 console.error로 남긴다 — 레이아웃은 깨지지 않는다', async () => {
    const dbError = { message: 'connection reset', code: '57P01' }
    state.chapter = { data: { chapter_no: 3 }, error: dbError }

    const tree = await renderLayout()

    expect(findByType(tree, ChapterRiseWatcher)).toHaveLength(0)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(String(errorSpy.mock.calls[0][0])).toContain('user_chapters 조회 실패')
    expect(errorSpy.mock.calls[0][1]).toBe(dbError)
    // 본문과 탭 바, 다른 감시 컴포넌트는 그대로 나온다
    expect(hasChild(tree)).toBe(true)
    expect(findByType(tree, TabBar)).toHaveLength(1)
    expect(findByType(tree, StravaConnectReveal)).toHaveLength(1)
  })

  it('읽기가 실패했는데 데이터가 함께 와도 오래된 값으로 연출하지 않는다', async () => {
    state.chapter = { data: { chapter_no: 9 }, error: { message: 'timeout' } }

    expect(findByType(await renderLayout(), ChapterRiseWatcher)).toHaveLength(0)
  })

  it('챕터가 있어도 본문과 탭 바, 연결 직후 연출 컴포넌트가 함께 그려진다', async () => {
    const tree = await renderLayout()

    expect(hasChild(tree)).toBe(true)
    expect(findByType(tree, TabBar)).toHaveLength(1)
    expect(findByType(tree, StravaConnectReveal)).toHaveLength(1)
  })
})

describe('(main)/layout — user_chapters 읽기', () => {
  it('chapter_no 한 칸만, 세션 유저의 행만 한 번 읽는다', async () => {
    await renderLayout()

    const reads = chapterReads()
    expect(reads).toHaveLength(1)
    expect(reads[0].select).toBe('chapter_no')
    expect(reads[0].eq).toEqual([['user_id', USER_ID]])
  })

  it('챕터를 읽지 못한 경우에도 같은 한 칸 조회다 — 이름·진행 비율을 따로 읽지 않는다', async () => {
    state.chapter = { data: null, error: { message: 'x' } }

    await renderLayout()

    expect(chapterReads().map((r) => r.select)).toEqual(['chapter_no'])
  })
})

describe('(main)/layout — 비로그인', () => {
  it('/login으로 보내고 아무것도 읽지 않는다', async () => {
    state.authenticated = false

    await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT:/login')

    expect(state.reads).toEqual([])
  })
})
