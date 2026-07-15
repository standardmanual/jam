'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeTime } from '@/lib/utils'
import type { UserRow, ActivityFeedRow, ActivityFeedEventType } from '@/types/database'

// ─── 탭 ─────────────────────────────────────────────────────────────────────

type TabKey = 'badge' | 'itembooks' | 'followers' | 'following'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'badge', label: '뱃지' },
  { key: 'itembooks', label: '아이템북' },
  { key: 'followers', label: '팔로워' },
  { key: 'following', label: '팔로잉' },
]

const BADGE_EVENTS = new Set<ActivityFeedEventType>(['badge_earned', 'item_dropped', 'item_picked_up'])
const MISSION_EVENTS = new Set<ActivityFeedEventType>(['mission_joined', 'mission_completed', 'mission_cancelled'])

// ─── 상수 ───────────────────────────────────────────────────────────────────

const EVENT_ICON: Record<ActivityFeedEventType, string> = {
  badge_earned: '🏅',
  item_dropped: '📦',
  item_picked_up: '🎁',
  mission_joined: '🎯',
  mission_completed: '🎉',
  mission_cancelled: '❌',
}

const EVENT_LABEL: Record<ActivityFeedEventType, string> = {
  badge_earned: '배지 획득',
  item_dropped: '아이템 드랍',
  item_picked_up: '아이템 픽업',
  mission_joined: '미션 참가',
  mission_completed: '미션 완료',
  mission_cancelled: '미션 취소',
}

const RARITY_COLOR: Record<string, string> = {
  rare: 'bg-jam-teal/20 text-jam-teal',
  legendary: 'bg-jam-purple/20 text-jam-purple',
  mythic: 'bg-[#FF4500]/20 text-[#FF4500]',
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  legendary: 'Legendary',
  mythic: 'Mythic',
}

function formatFullDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

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

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function DetailSheet({ item, onClose }: { item: ActivityFeedRow; onClose: () => void }) {
  const meta = item.metadata as Record<string, string | number | null>
  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null
  const isMissionCompleted = item.event_type === 'mission_completed'
  const title = BADGE_EVENTS.has(item.event_type) ? String(meta.badge_name ?? '') : String(meta.mission_title ?? '')
  const sheetBg = isMissionCompleted ? 'bg-jam-lime' : 'bg-jam-cream'

  return (
    <>
      <div className="fixed inset-0 bg-jam-ink/40 z-40" onClick={onClose} />
      <div className={`fixed bottom-0 left-0 right-0 z-50 ${sheetBg} border-t-[3px] border-jam-ink rounded-t-3xl px-6 pt-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}>
        <div className="w-10 h-1 bg-jam-ink/20 rounded-full mx-auto mb-5" />
        <div className="flex justify-center mb-5">
          {badgeImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={badgeImage} alt={title} className="w-28 h-28 rounded-3xl object-cover border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616]" />
          ) : (
            <div className="w-28 h-28 rounded-3xl bg-white border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] flex items-center justify-center text-6xl">
              {EVENT_ICON[item.event_type]}
            </div>
          )}
        </div>
        <p className="text-center text-[11px] font-black text-jam-ink/40 uppercase tracking-widest mb-1">
          {EVENT_LABEL[item.event_type]}
        </p>
        <h2 className="text-center text-2xl font-black text-jam-ink mb-3 leading-tight">{title}</h2>
        {rarity && RARITY_COLOR[rarity] && (
          <div className="flex justify-center mb-4">
            <span className={`text-xs font-black px-3 py-1 rounded-xl border-[2px] border-jam-ink ${RARITY_COLOR[rarity]}`}>
              {RARITY_LABEL[rarity]}
            </span>
          </div>
        )}
        <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] divide-y-[2px] divide-jam-ink/10 mb-5">
          {(item.event_type === 'item_dropped' || item.event_type === 'item_picked_up') && meta.poi_name && (
            <Row label="장소" value={String(meta.poi_name)} />
          )}
          {item.event_type === 'mission_completed' && meta.reward_points && (
            <Row label="보상" value={`${meta.reward_points}P`} />
          )}
          <Row label="일시" value={formatFullDate(item.event_at)} />
        </div>
        <button onClick={onClose} className="w-full py-4 rounded-2xl border-[3px] border-jam-ink bg-jam-ink text-white font-black text-base active:scale-95 transition-all shadow-[3px_3px_0_0_#161616]">
          닫기
        </button>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs font-black text-jam-ink/40 uppercase tracking-widest">{label}</span>
      <span className="text-sm font-black text-jam-ink text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function FeedCard({ item, onClick }: { item: ActivityFeedRow; onClick: () => void }) {
  const meta = item.metadata as Record<string, string | number | null>
  const isMission = MISSION_EVENTS.has(item.event_type)
  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null
  const title = BADGE_EVENTS.has(item.event_type) ? String(meta.badge_name ?? '') : String(meta.mission_title ?? '')
  const sub = (() => {
    if (item.event_type === 'item_picked_up' || item.event_type === 'item_dropped') return meta.poi_name ? String(meta.poi_name) : null
    if (item.event_type === 'mission_completed' && meta.reward_points) return `+${meta.reward_points}P`
    return null
  })()
  const cardBg = item.event_type === 'mission_completed' ? 'bg-jam-lime' : item.event_type === 'mission_cancelled' ? 'bg-white/60' : 'bg-white'

  return (
    <button onClick={onClick} className={`w-full text-left ${cardBg} border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 flex items-center gap-3 active:scale-[0.98] transition-transform`}>
      {badgeImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={badgeImage} alt={title} className="w-11 h-11 rounded-xl object-cover border-[2px] border-jam-ink shrink-0" />
      ) : (
        <div className={`w-11 h-11 rounded-xl border-[2px] border-jam-ink flex items-center justify-center text-xl shrink-0 ${isMission ? 'bg-jam-yellow' : 'bg-jam-cream'}`}>
          {EVENT_ICON[item.event_type]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-jam-ink/40 uppercase tracking-widest mb-0.5">{EVENT_LABEL[item.event_type]}</p>
        <p className="font-black text-sm text-jam-ink truncate">{title}</p>
        {sub && <p className="text-xs text-jam-ink/50 font-semibold mt-0.5 truncate">{sub}</p>}
        {rarity && RARITY_COLOR[rarity] && (
          <span className={`inline-block mt-1 text-[10px] font-black px-1.5 py-0.5 rounded-md ${RARITY_COLOR[rarity]}`}>
            {RARITY_LABEL[rarity]}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[11px] text-jam-ink/40 font-semibold">{formatRelativeTime(item.event_at)}</span>
        <span className="text-jam-ink/30 text-xs">›</span>
      </div>
    </button>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface Props {
  profile: UserRow | null
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
}

export default function ProfileClient({
  profile,
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
}: Props) {
  const router = useRouter()

  // ── 탭 상태 ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('badge')
  const [tabLoading, setTabLoading] = useState(false)
  const [followersData, setFollowersData] = useState<FollowUser[] | null>(null)
  const [followingData, setFollowingData] = useState<FollowUser[] | null>(null)
  const [itembooksData, setItembooksData] = useState<ItemBookItem[] | null>(null)
  const [listFollowStates, setListFollowStates] = useState<Record<string, boolean>>({})

  const [selectedItem, setSelectedItem] = useState<ActivityFeedRow | null>(null)

  // ── 팔로우 (프로필 헤더) ───────────────────────────────────────────────────
  const [following, setFollowing] = useState(isFollowing)
  const [followerCnt, setFollowerCnt] = useState(followerCount)

  const badgeItems = feedItems.filter((f) => BADGE_EVENTS.has(f.event_type))

  // ── 해시 읽기 (마운트 시) ──────────────────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash.slice(1) as TabKey
    if (['badge', 'itembooks', 'followers', 'following'].includes(hash)) {
      selectTab(hash, false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 탭 선택 + 데이터 lazy fetch ────────────────────────────────────────────
  const selectTab = useCallback(async (tab: TabKey, pushHistory = true) => {
    if (pushHistory) window.history.replaceState(null, '', `#${tab}`)
    setActiveTab(tab)

    if (tab === 'followers' && followersData === null) {
      setTabLoading(true)
      const res = await fetch(`/api/users/${username}/followers`)
      const json = await res.json()
      const users: FollowUser[] = json.users ?? []
      setFollowersData(users)
      setListFollowStates(prev => {
        const next = { ...prev }
        for (const u of users) next[u.id] = u.isFollowing
        return next
      })
      setTabLoading(false)
    } else if (tab === 'following' && followingData === null) {
      setTabLoading(true)
      const res = await fetch(`/api/users/${username}/following`)
      const json = await res.json()
      const users: FollowUser[] = json.users ?? []
      setFollowingData(users)
      setListFollowStates(prev => {
        const next = { ...prev }
        for (const u of users) next[u.id] = u.isFollowing
        return next
      })
      setTabLoading(false)
    } else if (tab === 'itembooks' && itembooksData === null) {
      setTabLoading(true)
      const res = await fetch(`/api/users/${username}/itembooks`)
      const json = await res.json()
      setItembooksData(json.books ?? [])
      setTabLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, followersData, followingData, itembooksData])

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
  }

  // ── 탭 콘텐츠 렌더 ────────────────────────────────────────────────────────

  const renderTabContent = () => {
    if (tabLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-[3px] border-jam-ink border-t-transparent animate-spin" />
        </div>
      )
    }

    if (activeTab === 'badge') {
      if (badgeItems.length === 0) {
        return (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">🏅</p>
            <p className="text-jam-ink/50 font-bold text-sm">아직 획득한 배지가 없어요</p>
          </div>
        )
      }
      return (
        <div className="flex flex-col gap-2">
          {badgeItems.map(item => (
            <FeedCard key={item.id} item={item} onClick={() => handleCardClick(item)} />
          ))}
        </div>
      )
    }

    if (activeTab === 'itembooks') {
      if (itembooksData === null) return null
      if (itembooksData.length === 0) {
        return (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📕</p>
            <p className="text-jam-ink/50 font-bold text-sm">아직 발견한 아이템북이 없어요</p>
          </div>
        )
      }
      return (
        <div className="grid grid-cols-2 gap-3">
          {itembooksData.map(book => {
            const pct = book.totalBadgeCount > 0 ? Math.round((book.slottedCount / book.totalBadgeCount) * 100) : 0
            return (
              <Link
                key={book.id}
                href={`/itembooks/${book.id}`}
                className={`flex flex-col rounded-2xl border-[3px] p-3 gap-2 transition-all active:shadow-none active:translate-x-[3px] active:translate-y-[3px] ${
                  book.isCompleted
                    ? 'bg-jam-lime border-jam-ink shadow-[3px_3px_0_0_#161616]'
                    : 'bg-white border-jam-ink shadow-[3px_3px_0_0_#161616]'
                }`}
              >
                <div className="relative w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center bg-jam-cream">
                  {book.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.image_url} alt={book.name} className="w-full h-full object-contain p-1.5" />
                  ) : (
                    <span className="text-4xl">📖</span>
                  )}
                  {book.isCompleted && (
                    <span className="absolute top-1.5 right-1.5 bg-jam-ink text-white text-[10px] font-black px-2 py-0.5 rounded-full border-2 border-white">완성</span>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-jam-ink leading-tight line-clamp-2">{book.name}</h2>
                  {book.faction && <p className="text-[11px] text-jam-ink/50 font-bold mt-0.5 truncate">{book.faction.name}</p>}
                </div>
                <div className="mt-auto flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-jam-ink/10 overflow-hidden border border-jam-ink/20">
                    <div className={`h-full rounded-full transition-all ${book.isCompleted ? 'bg-jam-ink' : 'bg-jam-teal'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-jam-ink/70 font-black tabular-nums shrink-0">{book.slottedCount}/{book.totalBadgeCount}</span>
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
        <div className="text-center py-12">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-jam-ink/50 font-bold text-sm">
            {activeTab === 'followers' ? '아직 팔로워가 없어요' : '아직 팔로잉이 없어요'}
          </p>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-2">
        {listData.map(u => (
          <div key={u.id} className="flex items-center gap-3 bg-white border-[2px] border-jam-ink rounded-2xl p-3 shadow-[2px_2px_0_0_#161616]">
            <Link href={`/${u.username}`} className="flex items-center gap-3 flex-1 min-w-0">
              {u.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={u.avatar_url} alt={u.username ?? ''} className="w-10 h-10 rounded-full object-cover border-[2px] border-jam-ink shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-jam-cream border-[2px] border-jam-ink flex items-center justify-center text-lg shrink-0">👤</div>
              )}
              <span className="font-black text-sm text-jam-ink truncate">{u.username}</span>
            </Link>
            {u.id !== currentUserId && (
              <button
                onClick={() => handleListFollow(u.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black border-[2px] border-jam-ink active:scale-95 transition-all shrink-0 ${
                  listFollowStates[u.id] ? 'bg-white/60 text-jam-ink' : 'bg-jam-ink text-white'
                }`}
              >
                {listFollowStates[u.id] ? '팔로잉' : '팔로우'}
              </button>
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

  return (
    <div className="min-h-full bg-jam-pink text-jam-ink px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-10 flex flex-col gap-6">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="프로필" className="w-16 h-16 rounded-2xl object-cover border-[3px] border-jam-ink" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-white border-[3px] border-jam-ink flex items-center justify-center text-2xl">👤</div>
        )}
        <div className="flex-1">
          <p className="font-black text-xl">{profile?.username ?? '익명'}</p>
          {isOwnProfile && <p className="text-jam-ink/60 text-sm font-semibold">{profile?.email}</p>}
        </div>
        {isOwnProfile ? (
          <button onClick={() => router.push('/profile/edit')} className="px-3 py-1.5 rounded-xl bg-jam-ink text-white text-sm font-black border-[2px] border-jam-ink active:scale-95 transition-transform">
            편집
          </button>
        ) : (
          <button
            onClick={handleFollow}
            className={`px-4 py-1.5 rounded-xl text-sm font-black border-[2px] border-jam-ink active:scale-95 transition-all ${
              following ? 'bg-white/60 text-jam-ink' : 'bg-jam-ink text-white'
            }`}
          >
            {following ? '팔로잉' : '팔로우'}
          </button>
        )}
      </div>

      {/* 통계 바 (탭) */}
      <div className="flex border-[2px] border-jam-ink rounded-2xl overflow-hidden bg-white shadow-[2px_2px_0_0_#161616]">
        {TABS.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => selectTab(tab.key)}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${
              i < TABS.length - 1 ? 'border-r-[2px] border-jam-ink' : ''
            } ${activeTab === tab.key ? 'bg-jam-ink text-white' : 'active:bg-jam-ink/5'}`}
          >
            <span className={`text-xl font-black ${activeTab === tab.key ? 'text-white' : 'text-jam-ink'}`}>
              {statCounts[tab.key]}
            </span>
            <span className={`text-[10px] font-black uppercase tracking-wider ${activeTab === tab.key ? 'text-white/80' : 'text-jam-ink/50'}`}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      <section>
        {renderTabContent()}
      </section>

      {/* 로그아웃 — 본인만 */}
      {isOwnProfile && (
        <button onClick={handleLogout} className="w-full py-4 rounded-2xl border-[3px] border-jam-ink text-jam-ink font-black text-base active:scale-95 transition-all bg-white/60">
          로그아웃
        </button>
      )}

      {/* 상세 시트 */}
      {selectedItem && <DetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  )
}
