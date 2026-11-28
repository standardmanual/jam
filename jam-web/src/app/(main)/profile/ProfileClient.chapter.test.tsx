/**
 * 프로필 화면의 챕터 줄 노출 (티켓 20261019_1317 1회, 사용자 결정 3·4, 티켓 20261127_1736 C6)
 *
 * 내 프로필은 챕터 게이지 카드가 챕터를 보이므로 헤더에 «트라이브 · 챕터 N» 작은 글씨 줄이 없다(내 프로필에서만 걷었다). 카드는 `ProfileClient.chapterGauge.test.tsx`가 본다.
 * 다른 유저 프로필은 헤더 아래 한 줄 «트라이브 · 챕터 3»만 보이고 게이지가 없다. 챕터는 숫자로만 표기한다(2026-10-21 결정, 티켓 20261021_1539). 퀘스트 전과 읽지 못함(`null`)은 줄을 그리지 않는다.
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
import type { MyChapterResult } from '@/lib/chapter/read'

const MINE: MyChapterResult = { ok: true, chapterNo: 3, chapterJam: 500, requiredJam: 1260, nextChapterNo: 4, isLastChapter: false, progress: 0.3968, tribeName: '새벽러너스' }
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
    username: 'runner',
    currentUserId: 'u1',
    pointBalance: 100,
    ...over,
  }
  return renderToStaticMarkup(<ProfileClient {...props} />)
}

describe('내 프로필 헤더에는 챕터 줄이 없다', () => {
  it('챕터가 있어도 «트라이브 · 챕터 N» 작은 글씨 줄이 없고 카드 안의 챕터 번호만 보인다', () => {
    const html = render({ chapter: MINE })
    expect(html).not.toContain('data-chapter-line')
    expect(html).not.toContain('새벽러너스 · 챕터')
  })

  it('편집 버튼은 행 오른쪽 끝에 남고 빈 flex-1 래퍼가 없다', () => {
    const html = render({ chapter: MINE })
    const editAt = html.indexOf(d.profile.editButton)
    expect(editAt).toBeGreaterThan(-1)
    const rowStart = html.lastIndexOf('<div class="flex items-center justify-end">', editAt)
    expect(rowStart).toBeGreaterThan(-1)
    expect(html.slice(rowStart, editAt)).not.toContain('flex-1 min-w-0"')
    expect(html.indexOf('>러너<')).toBeGreaterThan(editAt)
  })

  it('챕터가 없어도(null·퀘스트 전) 헤더에는 편집 버튼만 남는다', () => {
    const html = render({ chapter: null })
    expect(html).not.toContain('data-chapter-line')
    expect(html).toContain(d.profile.editButton)
  })

  it('방어: 내 프로필에 타인용 prop이 와도 그리지 않는다', () => {
    const html = render({ chapter: null, publicChapter: PUBLIC })
    expect(html).not.toContain('새벽러너스 · 챕터')
    expect(html).not.toContain('data-chapter-line')
  })
})

describe('다른 유저 프로필의 챕터 줄', () => {
  it('헤더 아래 «트라이브 · 챕터 3» 한 줄만 보이고 게이지가 없다', () => {
    const html = render({ isOwnProfile: false, publicChapter: PUBLIC })
    expect(html).toContain('>새벽러너스 · 챕터 3<')
    expect(html).not.toContain('data-chapter-gauge')
    expect(html).not.toContain('다음 챕터까지')
    const followAt = html.indexOf(d.profile.followButton)
    const lineAt = html.indexOf('data-chapter-line="public"')
    expect(followAt).toBeGreaterThan(-1)
    expect(lineAt).toBeGreaterThan(followAt)
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
    const html = render({ isOwnProfile: false, publicChapter: null, chapter: MINE, blocked: { pendingItemCount: 2 } })
    expect(html).not.toContain('data-chapter-line')
    expect(html).not.toContain('data-chapter-gauge')
  })
})
