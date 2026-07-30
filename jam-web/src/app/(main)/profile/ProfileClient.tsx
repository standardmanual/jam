'use client'

import { useCallback, useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeTime } from '@/lib/utils'
import { d, t } from '@/lib/i18n'
import TopNav from '@/components/ui/TopNav'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import RarityBadge from '@/components/ui/Badge'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import PopInNumber from '@/components/ui/PopInNumber'
import SwapText from '@/components/ui/SwapText'
import {
  UserIcon,
  UsersIcon,
  MedalIcon,
  BookIcon,
  ActivityIcon,
  ChevronRightIcon,
} from '@/components/ui/icons'
import type { UserRow, StravaConnectionRow, ActivityFeedRow, ActivityFeedEventType, BadgeRarity } from '@/types/database'
import FeedSection, { DetailSheet } from '../FeedSection'

// ─── 탭 ─────────────────────────────────────────────────────────────────────

type TabKey = 'badge' | 'itembooks' | 'followers' | 'following'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'badge', label: d.tabs.badge },
  { key: 'itembooks', label: d.tabs.itembooks },
  { key: 'followers', label: d.tabs.followers },
  { key: 'following', label: d.tabs.following },
]
const VALID_TABS = new Set<string>(['badge', 'itembooks', 'followers', 'following'])

// ─── 피드 (본인 Feed 섹션용 UI는 ../FeedSection 공용 컴포넌트로 이전됨) ──────

const MISSION_EVENTS = new Set<ActivityFeedEventType>(['mission_joined', 'mission_completed', 'mission_cancelled'])

// ─── 타입 (탭 콘텐츠) ────────────────────────────────────────────────────────

interface FollowUser {
  id: string
  username: string | null
  avatar_url: string | null
  isFollowing: boolean
}

interface ItemBookItem {
  id: string
  name: string
  image_url: string | null
  faction: { name: string } | null
  totalBadgeCount: number
  slottedCount: number
  isCompleted: boolean
}

// ─── 공통 조각 ───────────────────────────────────────────────────────────────

/** 빈 상태 — 아이콘(SVG) + 안내 문구 */
function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <Card className="flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-40)]">
      <span className="text-text-inverse/40">{icon}</span>
      <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{message}</p>
    </Card>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface Props {
  profile: UserRow | null
  strava: StravaConnectionRow | null
  feedItems: ActivityFeedRow[]
  isOwnProfile: boolean
  isFollowing: boolean
  targetUserId: string
  followerCount: number
  followingCount: number
  badgeCount: number
  itemBookCount: number
  username: string
  currentUserId: string
  /** 본인 프로필에서만 전달됨. 타인 프로필에서는 null. */
  pointBalance: number | null
}

export default function ProfileClient({
  profile,
  strava,
  feedItems,
  isOwnProfile,
  isFollowing,
  targetUserId,
  followerCount,
  followingCount,
  badgeCount,
  itemBookCount,
  username,
  currentUserId,
  pointBalance,
}: Props) {
  const router = useRouter()

  // ── 탭/해시 상태 ──────────────────────────────────────────────────────────
  const [hashFragment, setHashFragment] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabKey>('badge')
  const [tabLoading, setTabLoading] = useState(false)
  const [followersData, setFollowersData] = useState<FollowUser[] | null>(null)
  const [followingData, setFollowingData] = useState<FollowUser[] | null>(null)
  const [itembooksData, setItembooksData] = useState<ItemBookItem[] | null>(null)
  const [listFollowStates, setListFollowStates] = useState<Record<string, boolean>>({})
  const fetchedRef = useRef<Set<TabKey>>(new Set())

  const [selectedItem, setSelectedItem] = useState<ActivityFeedRow | null>(null)
  // 상세 시트는 Panel reveal 닫힘 트랜지션 동안 DOM에 남아 있어야 한다.
  const [sheetOpen, setSheetOpen] = useState(false)
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  const handleSheetClosed = useCallback(() => setSelectedItem(null), [])

  // ── 팔로우 (프로필 헤더) ───────────────────────────────────────────────────
  const [following, setFollowing] = useState(isFollowing)
  const [followerCnt, setFollowerCnt] = useState(followerCount)

  const badgeItems = feedItems.filter((f) => f.event_type === 'badge_earned')

  // ── 탭뷰 여부 ─────────────────────────────────────────────────────────────
  // 본인 프로필: 해시 없으면 기본뷰(Strava+Feed), 유효 해시 있으면 탭콘텐츠
  // 타인 프로필: 항상 탭콘텐츠 (기본=배지갤러리)
  const isTabView = !isOwnProfile || VALID_TABS.has(hashFragment)

  // ── 해시 동기화 (마운트·뒤로가기 포함) ────────────────────────────────────
  useEffect(() => {
    const fetchIfNeeded = async (tab: TabKey) => {
      if (fetchedRef.current.has(tab)) return
      fetchedRef.current.add(tab)
      setTabLoading(true)
      try {
        if (tab === 'followers') {
          const res = await fetch(`/api/users/${username}/followers`)
          const json = await res.json()
          const users: FollowUser[] = json.users ?? []
          setFollowersData(users)
          setListFollowStates(prev => {
            const next = { ...prev }
            for (const u of users) next[u.id] = u.isFollowing
            return next
          })
        } else if (tab === 'following') {
          const res = await fetch(`/api/users/${username}/following`)
          const json = await res.json()
          const users: FollowUser[] = json.users ?? []
          setFollowingData(users)
          setListFollowStates(prev => {
            const next = { ...prev }
            for (const u of users) next[u.id] = u.isFollowing
            return next
          })
        } else if (tab === 'itembooks') {
          const res = await fetch(`/api/users/${username}/itembooks`)
          const json = await res.json()
          setItembooksData(json.books ?? [])
        }
      } finally {
        setTabLoading(false)
      }
    }

    const sync = () => {
      const hash = window.location.hash.slice(1)
      setHashFragment(hash)
      if (VALID_TABS.has(hash)) {
        const tab = hash as TabKey
        setActiveTab(tab)
        fetchIfNeeded(tab)
      }
    }

    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  // ── 탭 클릭 — 해시 이동 (브라우저 뒤로가기 지원) ────────────────────────────
  const handleTabClick = (tab: TabKey) => {
    window.location.hash = tab
  }

  // ── 리스트 내 팔로우 토글 ──────────────────────────────────────────────────
  const handleListFollow = async (targetId: string) => {
    const current = listFollowStates[targetId] ?? false
    setListFollowStates(prev => ({ ...prev, [targetId]: !current }))
    if (current) {
      await fetch(`/api/follows/${targetId}`, { method: 'DELETE' })
    } else {
      await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetId }),
      })
    }
  }

  // ── 헤더 팔로우 토글 ───────────────────────────────────────────────────────
  const handleFollow = async () => {
    if (following) {
      setFollowing(false)
      setFollowerCnt(c => c - 1)
      await fetch(`/api/follows/${targetUserId}`, { method: 'DELETE' })
    } else {
      setFollowing(true)
      setFollowerCnt(c => c + 1)
      await fetch('/api/follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: targetUserId }),
      })
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleCardClick = (item: ActivityFeedRow) => {
    if (MISSION_EVENTS.has(item.event_type)) {
      const meta = item.metadata as Record<string, string>
      if (meta.mission_id) { router.push(`/missions/${meta.mission_id}`); return }
    }
    setSelectedItem(item)
    setSheetOpen(true)
  }

  // ── 탭 콘텐츠 렌더 ────────────────────────────────────────────────────────

  // 로딩 표시는 Skeleton loader and reveal(14-skeleton-reveal.md)이 담당하므로
  // 여기서는 실제 콘텐츠만 그린다.
  const renderTabContent = () => {
    if (activeTab === 'badge') {
      if (badgeItems.length === 0) {
        return <EmptyState icon={<MedalIcon className="w-8 h-8" />} message={d.profile.emptyBadges} />
      }
      return (
        <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
          {badgeItems.map(item => {
            const meta = item.metadata as Record<string, string>
            return (
              <button
                key={item.id}
                onClick={() => handleCardClick(item)}
                className="flex flex-col items-center gap-1.5 p-[var(--spacing-8)] min-h-11 rounded-[var(--radius-cards)] bg-surface-inverse text-text-inverse shadow-[inset_0_0_0_1px_var(--color-border-inverse)] active:scale-95 transition-transform duration-100 cursor-pointer"
              >
                <div className="w-[66px] h-[66px] flex items-center justify-center shrink-0">
                  {meta.badge_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={meta.badge_image_url} alt={meta.badge_name} className="w-full h-full object-contain" />
                  ) : (
                    <MedalIcon className="w-full h-full text-text-inverse/40" />
                  )}
                </div>
                <span className="text-[length:var(--text-body-sm)] leading-tight text-center line-clamp-2 h-10 w-full">{meta.badge_name}</span>
                <div className="h-6 flex items-center justify-center">
                  <RarityBadge rarity={meta.rarity as BadgeRarity} />
                </div>
              </button>
            )
          })}
        </div>
      )
    }

    if (activeTab === 'itembooks') {
      if (itembooksData === null) return null
      if (itembooksData.length === 0) {
        return <EmptyState icon={<BookIcon className="w-8 h-8" />} message={d.profile.emptyItembooks} />
      }
      return (
        <div className="grid grid-cols-2 gap-[var(--spacing-8)]">
          {itembooksData.map(book => {
            const pct = book.totalBadgeCount > 0 ? Math.round((book.slottedCount / book.totalBadgeCount) * 100) : 0
            return (
              <Link
                key={book.id}
                href={`/itembooks/${book.id}?u=${username}`}
                className={[
                  'flex flex-col rounded-[var(--radius-cards)] p-[var(--spacing-16)] gap-[var(--spacing-8)]',
                  'bg-surface-inverse text-text-inverse',
                  'shadow-[inset_0_0_0_1px_var(--color-border-inverse)]',
                  'transition-transform duration-100 active:scale-[0.98]',
                ].join(' ')}
              >
                <div className="relative w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
                  {book.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.image_url} alt={book.name} className="w-full h-full object-contain p-1.5" />
                  ) : (
                    <BookIcon className="w-10 h-10 text-text-inverse/40" />
                  )}
                  {book.isCompleted && (
                    <span className="absolute top-1.5 right-1.5 bg-surface text-text text-[10px] leading-none px-2 py-1 rounded-[var(--radius-tags)]">
                      {d.profile.itembookCompleted}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] line-clamp-2">{book.name}</h2>
                  {book.faction && (
                    <p className="text-[11px] text-text-inverse/60 truncate">{book.faction.name}</p>
                  )}
                </div>
                <div className="mt-auto flex items-center gap-[var(--spacing-8)]">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border-inverse)]">
                    <div className="h-full bg-surface transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-text-inverse/60 tabular-nums shrink-0">
                    {t(d.profile.itembookProgress, { done: book.slottedCount, total: book.totalBadgeCount })}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )
    }

    const listData = activeTab === 'followers' ? followersData : followingData
    if (listData === null) return null
    if (listData.length === 0) {
      return (
        <EmptyState
          icon={<UsersIcon className="w-8 h-8" />}
          message={activeTab === 'followers' ? d.profile.emptyFollowers : d.profile.emptyFollowing}
        />
      )
    }
    return (
      <div className="flex flex-col gap-[var(--spacing-8)]">
        {listData.map(u => (
          <div
            key={u.id}
            className="flex items-center gap-[var(--spacing-16)] bg-surface-inverse text-text-inverse rounded-[var(--radius-cards)] p-[var(--spacing-16)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)]"
          >
            <Link href={`/${u.username}`} className="flex items-center gap-[var(--spacing-16)] flex-1 min-w-0 min-h-11">
              {u.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatar_url} alt={u.username ?? ''} className="w-11 h-11 rounded-full object-cover shrink-0 shadow-[inset_0_0_0_1px_var(--color-border-inverse)]" />
              ) : (
                <div className="w-11 h-11 rounded-full bg-surface text-text flex items-center justify-center shrink-0">
                  <UserIcon className="w-5 h-5" />
                </div>
              )}
              <span className="text-[length:var(--text-body)] leading-[var(--leading-body)] truncate">{u.username}</span>
            </Link>
            {u.id !== currentUserId && (
              <Button
                surface="sub"
                variant={listFollowStates[u.id] ? 'outline' : 'primary'}
                onClick={() => handleListFollow(u.id)}
                className="shrink-0 px-[var(--spacing-16)] py-2 text-[length:var(--text-body-sm)]"
              >
                {/* Text states swap (04-text-states-swap.md) */}
                <SwapText value={listFollowStates[u.id] ? d.profile.followingButton : d.profile.followButton} />
              </Button>
            )}
          </div>
        ))}
      </div>
    )
  }

  const statCounts: Record<TabKey, number> = {
    badge: badgeCount,
    itembooks: itemBookCount,
    followers: followerCnt,
    following: followingCount,
  }

  // 통계바 = 슬라이딩 탭. 라벨은 "숫자 + 이름" 2줄 구성이라 ReactNode로 넘긴다.
  // 팔로워 수는 팔로우/언팔로우 즉시 바뀌므로 Number pop-in(02-number-pop-in.md)을 건다.
  const statTabs: SlidingTabItem<TabKey>[] = TABS.map((tab) => ({
    key: tab.key,
    ariaLabel: tab.label,
    label: (
      <span className="flex flex-col items-center justify-center gap-1">
        <span className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] tabular-nums">
          {tab.key === 'followers' ? (
            <PopInNumber value={statCounts.followers} />
          ) : (
            statCounts[tab.key]
          )}
        </span>
        <span className="text-[11px] leading-none opacity-70">{tab.label}</span>
      </span>
    ),
  }))

  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.profile.title} showBack={!isOwnProfile} />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-40)] flex flex-col gap-[var(--spacing-24)]">
        {/* 프로필 헤더 */}
        <Card className="flex items-center gap-[var(--spacing-16)]">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={d.profile.avatarAlt}
              className="w-16 h-16 rounded-[var(--radius-cards)] object-cover shrink-0 shadow-[inset_0_0_0_1px_var(--color-border-inverse)]"
            />
          ) : (
            <div className="w-16 h-16 rounded-[var(--radius-cards)] bg-surface text-text flex items-center justify-center shrink-0">
              <UserIcon className="w-7 h-7" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] truncate">
              {profile?.username ?? d.profile.anonymous}
            </p>
            {isOwnProfile && (
              <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60 truncate">
                {profile?.email}
              </p>
            )}
            {/* 잼 포인트 잔액 — 본인 프로필에서만, 이메일 바로 아래 노출 */}
            {isOwnProfile && pointBalance !== null && (
              <button
                onClick={() => router.push('/points')}
                aria-label={d.profile.pointsAriaLabel}
                className="mt-1 -ml-2 px-2 inline-flex items-center gap-1.5 min-h-11 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse rounded-[var(--radius-nav-buttons)] active:scale-95 transition-transform duration-100 cursor-pointer"
              >
                {t(d.profile.pointBalance, { count: pointBalance.toLocaleString('ko-KR') })}
                <ChevronRightIcon className="w-4 h-4 text-text-inverse/40" />
              </button>
            )}
          </div>
          {isOwnProfile ? (
            <Button
              surface="sub"
              variant="outline"
              onClick={() => router.push('/profile/edit')}
              className="shrink-0 px-[var(--spacing-16)] py-2 text-[length:var(--text-body-sm)]"
            >
              {d.profile.editButton}
            </Button>
          ) : (
            <Button
              surface="sub"
              variant={following ? 'outline' : 'primary'}
              onClick={handleFollow}
              className="shrink-0 px-[var(--spacing-16)] py-2 text-[length:var(--text-body-sm)]"
            >
              {/* Text states swap (04-text-states-swap.md) */}
              <SwapText value={following ? d.profile.followingButton : d.profile.followButton} />
            </Button>
          )}
        </Card>

        {/* 통계 바 — Tabs sliding (16-tabs-sliding.md).
            기본뷰(해시 없음)에서는 선택된 탭이 없어야 하므로 value에 빈 값을 넘겨
            pill을 숨긴다. */}
        <Card className="p-0 overflow-hidden">
          <SlidingTabs
            items={statTabs}
            value={isTabView ? activeTab : ('' as TabKey)}
            onChange={handleTabClick}
            variant="onCard"
            size="xl"
            shape="card"
            outlined={false}
            aria-label={d.profile.title}
          />
        </Card>

        {/* 탭 콘텐츠 — 탭뷰일 때만.
            로딩은 Skeleton loader and reveal(14-skeleton-reveal.md)로 처리한다.
            콘텐츠 높이가 가변이라 `.jam-skel-flow` 변형을 써서 콘텐츠는 흐름에 두고
            스켈레톤만 위에 겹친다. */}
        {isTabView && (
          <section>
            <div
              className={['t-skel', 'jam-skel-flow', tabLoading ? '' : 'is-revealed'].filter(Boolean).join(' ')}
              style={{ '--jam-skel-min-h': '280px' } as CSSProperties}
            >
              <div
                className="t-skel-skeleton is-pulsing grid grid-cols-3 gap-[var(--spacing-8)] content-start"
                aria-hidden="true"
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[136px] rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border)] bg-surface-inverse/15"
                  />
                ))}
              </div>
              <div className="t-skel-content" aria-busy={tabLoading}>
                {tabLoading ? null : renderTabContent()}
              </div>
            </div>
          </section>
        )}

        {/* Strava 연동 — 본인 + 기본뷰(해시 없음)일 때 */}
        {isOwnProfile && !isTabView && (
          <Card>
            <h2 className="text-[length:var(--text-subheading)] leading-[var(--leading-subheading)] mb-[var(--spacing-16)]">
              {d.profile.stravaTitle}
            </h2>
            {strava ? (
              <div className="flex items-center gap-[var(--spacing-8)]">
                <ActivityIcon className="w-5 h-5 text-text-inverse" />
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse">
                  {d.profile.stravaConnected}
                </span>
                {strava.last_synced_at && (
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">
                    · {formatRelativeTime(strava.last_synced_at)}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-[var(--spacing-16)]">
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">
                  {d.profile.stravaDisconnected}
                </span>
                <a
                  href="/api/strava/auth"
                  className="inline-flex items-center justify-center gap-2 min-h-11 px-[var(--spacing-24)] rounded-[var(--radius-pill-buttons)] bg-surface text-text text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:scale-95 transition-transform duration-100 shrink-0"
                >
                  {d.profile.stravaConnectButton}
                </a>
              </div>
            )}
          </Card>
        )}

        {/* Feed — 본인 + 기본뷰(해시 없음)일 때 */}
        {isOwnProfile && !isTabView && (
          <FeedSection feedItems={feedItems} badgeLinkQuery={`?u=${username}`} />
        )}

        {/* 로그아웃 — 본인만 */}
        {isOwnProfile && (
          <Button variant="outline" surface="main" fullWidth onClick={handleLogout}>
            {d.profile.logoutButton}
          </Button>
        )}
      </div>

      {/* 상세 시트 */}
      {selectedItem && (
        <DetailSheet
          item={selectedItem}
          open={sheetOpen}
          onClose={closeSheet}
          onClosed={handleSheetClosed}
          badgeLinkQuery={`?u=${username}`}
        />
      )}
    </div>
  )
}
