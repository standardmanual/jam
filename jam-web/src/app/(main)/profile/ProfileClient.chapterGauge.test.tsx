/**
 * 프로필 화면의 챕터 게이지 카드 노출 (티켓 20261127_1736 C6, 이전 캡슐 위젯 시험 20261018_0054를 교체)
 *
 * 내 프로필(`isOwnProfile`이고 서버가 `chapter`를 내려준 경우)에서만 헤더 아래에 홈과 같은 `ChapterGaugeSection`이 보이고,
 * 타인이 보는 프로필에는 prop 자체가 없어 DOM에 카드·진행값이 없다. 서버 페이지가 타인에게 prop을 내리지 않는 것은
 * `[username]/__tests__/page.test.tsx`가 고정하고, 여기서는 그 prop이 없을 때(또는 실수로 와도) 화면이 카드를 그리지 않는지 본다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/profile/ProfileClient.chapterGauge.test.tsx"
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

const CHAPTER: MyChapterResult = { ok: true, chapterNo: 3, chapterJam: 500, requiredJam: 1260, nextChapterNo: 4, isLastChapter: false, progress: 0.3968, tribeName: '새벽러너스' }
const NO_CHAPTER: MyChapterResult = { ok: true, chapterNo: null, chapterJam: null, requiredJam: null, nextChapterNo: null, isLastChapter: false, progress: null, tribeName: null }
const BLOCKED = { pendingItemCount: 2 }
/** 카드 정본이 그리는 영문 라벨과 오류 블록 문구 — 카드가 있는지 없는지 가리는 표지 */
const CARD_LABEL = d.chapterGauge.label

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

/** 태그를 걷어낸 글자(자릿수 팝인이 숫자를 span으로 쪼개므로 이어 붙여 본다) */
function flat(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

describe('프로필의 챕터 게이지 카드', () => {
  it('내 프로필 + 서버 값이 있으면 어두운 카드가 보인다 — 트라이브·CHAPTER 번호·필요 잼', () => {
    const html = render({ chapter: CHAPTER, blocked: null })
    expect(html).toContain(CARD_LABEL)
    expect(html).toContain('새벽러너스')
    expect(html).toContain(`aria-label="${d.chapterGauge.ariaLabel.replace('{chapterNo}', '3').replace('{tribeName}', '새벽러너스')}"`)
    expect(flat(html)).toContain('1,260')
    expect(html).not.toContain('다시 시도')
  })

  it('«캡슐» 글자가 화면 어디에도 없다', () => {
    expect(render({ chapter: CHAPTER, blocked: BLOCKED })).not.toContain('캡슐')
    expect(render({ chapter: null })).not.toContain('캡슐')
  })

  it('막힘 값이 있으면 카드 바로 아래에 막힘 안내 카드가 이어 붙는다', () => {
    const html = render({ chapter: CHAPTER, blocked: BLOCKED })
    const cardAt = html.indexOf(CARD_LABEL)
    const blockedAt = html.indexOf(d.capsule.blockedBanner.line1)
    expect(cardAt).toBeGreaterThan(-1)
    expect(blockedAt).toBeGreaterThan(cardAt)
  })

  it('막힘이 아니면(null) 막힘 안내가 없다', () => {
    expect(render({ chapter: CHAPTER, blocked: null })).not.toContain(d.capsule.blockedBanner.line1)
  })

  it('챕터가 없으면(chapterNo null) 카드도 막힘 카드도 래퍼도 없다 — 헤더에는 편집 버튼만 남는다', () => {
    const html = render({ chapter: NO_CHAPTER, blocked: null })
    expect(html).not.toContain(CARD_LABEL)
    expect(html).not.toContain('다시 시도')
    expect(html).toContain(d.profile.editButton)
  })

  it('읽기 실패(null 또는 ok:false)는 오류 블록과 «다시 시도»가 보이고 막힘 카드는 그 아래에 붙는다', () => {
    for (const chapter of [null, { ok: false } as MyChapterResult]) {
      const html = render({ chapter, blocked: BLOCKED })
      expect(html).toContain(d.chapterGauge.loadFailed)
      expect(html).toContain('다시 시도')
      expect(html).not.toContain(CARD_LABEL)
      expect(html.indexOf(d.capsule.blockedBanner.line1)).toBeGreaterThan(html.indexOf(d.chapterGauge.loadFailed))
    }
  })

  it('타인이 보는 프로필(prop 없음)에는 카드·오류 블록·막힘 카드가 DOM에 없다', () => {
    const html = render({ isOwnProfile: false })
    expect(html).not.toContain(CARD_LABEL)
    expect(html).not.toContain(d.chapterGauge.loadFailed)
    expect(html).not.toContain(d.capsule.blockedBanner.line1)
  })

  it('방어: 타인 프로필에 prop이 실수로 와도 카드를 그리지 않는다', () => {
    const html = render({ isOwnProfile: false, chapter: CHAPTER, blocked: BLOCKED })
    expect(html).not.toContain(CARD_LABEL)
    expect(html).not.toContain(d.capsule.blockedBanner.line1)
    expect(flat(html)).not.toContain('1,260')
  })

  it('내 프로필이어도 prop이 없으면(undefined) 카드를 그리지 않는다', () => {
    const html = render({ isOwnProfile: true })
    expect(html).not.toContain(CARD_LABEL)
    expect(html).not.toContain(d.chapterGauge.loadFailed)
  })

  it('카드는 프로필 헤더(숫자 줄·편집 버튼) 아래, 탭 영역 위에 한 번 있다', () => {
    const html = render({ chapter: CHAPTER })
    const cardAt = html.indexOf(CARD_LABEL)
    const editAt = html.indexOf(d.profile.editButton)
    expect(editAt).toBeGreaterThan(-1)
    expect(cardAt).toBeGreaterThan(editAt)
    expect(html.split(CARD_LABEL).length - 1).toBe(1)
  })

  it('카드를 감싸는 곳에 z-index가 없다', () => {
    const html = render({ chapter: CHAPTER, blocked: BLOCKED })
    const around = html.slice(html.indexOf(d.profile.editButton), html.indexOf(CARD_LABEL))
    expect(around).not.toMatch(/\bz-\d|z-index/)
  })
})

/** 숫자 줄 (티켓 20261108_1216) — 탭 카드 대신 숫자 위·라벨 아래 칸을 한 줄에 둔다. */
describe('프로필의 숫자 줄', () => {
  it('내 프로필은 팔로워·팔로잉·포인트와 편집 버튼, 타인 프로필은 팔로워·팔로잉만 보인다', () => {
    const mine = flat(render({ followerCount: 12345, followingCount: 586, pointBalance: 1200 }))
    expect(mine).toContain('12,345팔로워586팔로잉1,200포인트')
    expect(mine).toContain(d.profile.editButton)
    const others = flat(render({ isOwnProfile: false, followerCount: 7, followingCount: 3, pointBalance: null }))
    expect(others).toContain('7팔로워3팔로잉')
    expect(others).not.toContain('포인트')
  })

  it('백만부터 1.0M으로 줄이고, 잔액을 모르면 «–»다', () => {
    expect(flat(render({ followerCount: 1_000_000 }))).toContain('1.0M팔로워')
    expect(flat(render({ followingCount: 1_200_000 }))).toContain('1.2M팔로잉')
    expect(flat(render({ pointBalance: null }))).toContain('–포인트')
  })

  it('통계 탭 카드가 없고, 기본 화면에서는 선택 표시가 없다', () => {
    const html = render()
    expect(html).not.toContain('jam-stat-tabs')
    expect(html).not.toContain('aria-pressed="true"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('숫자와 라벨은 새 색 없이 기존 토큰만 쓴다', () => {
    const html = render()
    expect(html).toContain('text-muted')
    expect(html).not.toContain('text-point-text')
  })
})

describe('프로필 기본 화면', () => {
  it('타인 프로필은 활동 피드 대신 배지 그리드(빈 상태 문구)가 보인다', () => {
    const html = render({ isOwnProfile: false })
    expect(html).toContain('러너님')
    expect(html).toContain('아직')
  })

  it('타인 프로필에 배지가 있으면 배지 카드를 3열 그리드로 그린다', () => {
    const feedItems = [{
      id: 'f1', user_id: 'u2', event_type: 'badge_earned', created_at: '2026-11-01T00:00:00Z',
      metadata: { badge_id: 'b1', badge_name: '한강 러너', badge_image_url: null, rarity: 'common' },
    }] as unknown as ActivityFeedRow[]
    const html = render({ isOwnProfile: false, feedItems })
    expect(html).toContain('grid-cols-3')
    expect(html).toContain('한강 러너')
  })
})

/** 가진 잼 줄 삭제 (티켓 20261028_1739 3회) — 새 게이지가 마지막 잼 양을 대신 보이므로 프로필은 잔액 숫자를 그리지 않는다. */
describe('프로필에는 가진 잼 줄이 없다', () => {
  const label = '가진 잼'

  it('내 프로필에서 카드가 있어도 «가진 잼» 줄이 없다', () => {
    expect(render({ chapter: CHAPTER })).not.toContain(label)
  })

  it('타인이 보는 프로필에도 가진 잼이 없다', () => {
    expect(render({ isOwnProfile: false })).not.toContain(label)
  })

  it('서버 조회가 실패해 null이거나 prop이 없으면(undefined) 가진 잼 줄이 없다', () => {
    expect(render({ chapter: null })).not.toContain(label)
    expect(render({})).not.toContain(label)
  })
})
