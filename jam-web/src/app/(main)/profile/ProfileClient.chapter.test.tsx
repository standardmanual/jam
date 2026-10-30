/**
 * 프로필 화면의 챕터 줄 노출 (티켓 20261019_1317 1회, 사용자 결정 3·4)
 *
 * 내 프로필(`isOwnProfile`이고 서버가 `chapterInitial`을 내려준 경우)에서는 캡슐 위젯 바로 위에 «챕터 3» 줄과 «다음 챕터까지» 게이지가 보인다.
 * 다른 유저 프로필은 헤더 아래 한 줄 «트라이브 · 챕터 3»만 보이고 게이지가 없다. 챕터는 숫자로만 표기한다(2026-10-21 결정, 티켓 20261021_1539). 퀘스트 전과 읽지 못함(`null`)은 어느 쪽도 줄을 그리지 않는다.
 * 서버 페이지가 타인에게 진행 값을 내리지 않는 것은 `[username]/__tests__/page.test.tsx`가 고정하고, 여기서는 prop이 와도 화면이 그리지 않는지 본다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/profile/ProfileClient.chapter.test.tsx"
 */
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))
vi.mock('@/components/ui/BottomSheet', () => ({
  default: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? <div>{children}</div> : null),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: async () => ({}) } }),
}))

import ProfileClient from './ProfileClient'
import { d } from '@/lib/i18n'
import type { ActivityFeedRow } from '@/types/database'
import type { CapsuleStatus } from '@/lib/capsule/capsule-contract'

const CAPSULE: CapsuleStatus = { required: 300, filled: 120, remaining: 180, balance: 50, openable: false, notOpenableReason: 'not_full', pendingCount: 0, jamBlocked: false, alertStage: 0, claim: { available: false, blockedReason: null, freeSlots: 40, neededSlots: 2 }, notice: 'none' }
const MINE = { chapterNo: 3, nextChapterNo: 4, progress: 0.42 }
const PUBLIC = { tribeName: '새벽러너스', chapterNo: 3 }

type ProfileProps = Parameters<typeof ProfileClient>[0]

function render(over: Partial<ProfileProps> = {}): string {
  const props: ProfileProps = {
    profile: { username: 'runner', display_name: '러너', avatar_url: null },
    feedItems: [] as ActivityFeedRow[],
    isOwnProfile: true,
    isFollowing: false,
    targetUserId: 'u1',
    followerCount: 0,
    followingCount: 0,
    badgeCount: 0,
    itemBookCount: 0,
    username: 'runner',
    currentUserId: 'u1',
    pointBalance: 100,
    ...over,
  }
  return renderToStaticMarkup(<ProfileClient {...props} />)
}

describe('내 프로필의 챕터 줄', () => {
  it('챕터와 «다음 챕터까지»와 게이지가 보인다', () => {
    const html = render({ capsuleInitial: CAPSULE, chapterInitial: MINE })
    expect(html).toContain('>챕터 3<')
    expect(html).not.toContain('챕터 3 ·')
    expect(html).toContain(d.chapter.line.untilNext)
    expect(html).toContain('data-chapter-gauge')
  })

  it('점수 숫자는 어디에도 없다 — 서버 값(진행 비율)이 숫자로 그려지지 않는다', () => {
    const html = render({ capsuleInitial: CAPSULE, chapterInitial: { ...MINE, progress: 0.4242 } })
    expect(html).not.toContain('0.4242')
    expect(html).not.toContain('42.42')
    expect(html).not.toContain('점수')
  })

  it('마지막 챕터는 게이지와 «다음 챕터까지»가 없다', () => {
    const html = render({ capsuleInitial: CAPSULE, chapterInitial: { chapterNo: 50, nextChapterNo: null, progress: null } })
    expect(html).toContain('>챕터 50<')
    expect(html).not.toContain('data-chapter-gauge')
    expect(html).not.toContain(d.chapter.line.untilNext)
  })

  it('퀘스트 전과 읽지 못함(null)은 챕터 줄이 없다 — 안내 줄도 다시 시도 버튼도 없다', () => {
    const html = render({ capsuleInitial: CAPSULE, chapterInitial: null })
    expect(html).not.toContain('data-chapter-line')
    expect(html).not.toContain('챕터')
    expect(html).not.toContain('다시 시도')
    // 캡슐은 그대로 보인다
    expect(html).toContain(d.capsule.aria.filling)
  })

  it('prop이 없으면(undefined) 줄을 그리지 않는다', () => {
    const html = render({ capsuleInitial: CAPSULE })
    expect(html).not.toContain('data-chapter-line')
  })

  it('챕터 줄은 캡슐 바로 위, 프로필 헤더와 통계 탭 사이에 있고 둘이 한 묶음(간격 8)이다', () => {
    const html = render({ capsuleInitial: CAPSULE, chapterInitial: MINE })
    const editAt = html.indexOf(d.profile.editButton)
    const chapterAt = html.indexOf('data-chapter-line="mine"')
    const capsuleAt = html.indexOf(d.capsule.aria.filling)
    const tabsAt = html.indexOf('jam-stat-tabs')
    expect(editAt).toBeGreaterThan(-1)
    expect(chapterAt).toBeGreaterThan(editAt)
    expect(capsuleAt).toBeGreaterThan(chapterAt)
    expect(tabsAt).toBeGreaterThan(capsuleAt)
    // 묶음 래퍼: 챕터 줄 앞의 여는 태그가 gap-2 세로 묶음이다
    expect(html.slice(Math.max(0, chapterAt - 120), chapterAt)).toContain('flex flex-col gap-2')
  })

  it('캡슐 prop이 없어도 챕터 줄만 그려진다', () => {
    const html = render({ chapterInitial: MINE })
    expect(html).toContain('>챕터 3<')
    expect(html).not.toContain(d.capsule.aria.filling)
  })

  it('방어: 내 프로필에 타인용 prop이 와도 그리지 않는다', () => {
    const html = render({ capsuleInitial: CAPSULE, chapterInitial: null, publicChapter: PUBLIC })
    expect(html).not.toContain('새벽러너스')
    expect(html).not.toContain('data-chapter-line')
  })
})

describe('다른 유저 프로필의 챕터 줄', () => {
  it('헤더 아래 «트라이브 · 챕터 3» 한 줄만 보이고 게이지가 없다', () => {
    const html = render({ isOwnProfile: false, publicChapter: PUBLIC })
    expect(html).toContain('>새벽러너스 · 챕터 3<')
    expect(html).not.toContain('data-chapter-gauge')
    expect(html).not.toContain(d.chapter.line.untilNext)
    const followAt = html.indexOf(d.profile.followButton)
    const lineAt = html.indexOf('data-chapter-line="public"')
    const tabsAt = html.indexOf('jam-stat-tabs')
    expect(followAt).toBeGreaterThan(-1)
    expect(lineAt).toBeGreaterThan(followAt)
    expect(tabsAt).toBeGreaterThan(lineAt)
  })

  it('트라이브가 없으면 «챕터 3»만, 챕터가 없으면 트라이브만 보인다', () => {
    expect(render({ isOwnProfile: false, publicChapter: { ...PUBLIC, tribeName: null } })).toContain('>챕터 3<')
    const noChapter = render({ isOwnProfile: false, publicChapter: { tribeName: '새벽러너스', chapterNo: null } })
    expect(noChapter).toContain('>새벽러너스<')
    expect(noChapter).not.toContain('챕터')
  })

  it('보일 조각이 없거나 읽지 못함(null)이면 줄이 없다', () => {
    expect(render({ isOwnProfile: false, publicChapter: { tribeName: null, chapterNo: null } })).not.toContain('data-chapter-line')
    expect(render({ isOwnProfile: false, publicChapter: null })).not.toContain('data-chapter-line')
    expect(render({ isOwnProfile: false })).not.toContain('data-chapter-line')
  })

  it('방어: 타인 프로필에 내 진행 prop이 실수로 와도 그리지 않는다', () => {
    const html = render({ isOwnProfile: false, publicChapter: null, chapterInitial: { ...MINE, progress: 0.4242 } })
    expect(html).not.toContain('data-chapter-line')
    expect(html).not.toContain('data-chapter-gauge')
    expect(html).not.toContain('0.4242')
  })
})
