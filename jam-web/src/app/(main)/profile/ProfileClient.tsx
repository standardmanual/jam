'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeTime } from '@/lib/utils'
import type { UserRow, StravaConnectionRow, ActivityFeedRow, ActivityFeedEventType } from '@/types/database'

// ─── 필터 탭 ────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'badge' | 'mission'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'badge', label: '배지' },
  { key: 'mission', label: '미션' },
]

const BADGE_EVENTS = new Set<ActivityFeedEventType>(['badge_earned', 'item_dropped', 'item_picked_up'])
const MISSION_EVENTS = new Set<ActivityFeedEventType>(['mission_joined', 'mission_completed', 'mission_cancelled'])

function matchesFilter(item: ActivityFeedRow, tab: FilterTab): boolean {
  if (tab === 'all') return true
  if (tab === 'badge') return BADGE_EVENTS.has(item.event_type)
  if (tab === 'mission') return MISSION_EVENTS.has(item.event_type)
  return false
}

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
  common: 'bg-jam-ink/10 text-jam-ink',
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

// ─── 상세 시트 ───────────────────────────────────────────────────────────────

function DetailSheet({ item, onClose }: { item: ActivityFeedRow; onClose: () => void }) {
  const meta = item.metadata as Record<string, string | number | null>
  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null
  const isMissionCompleted = item.event_type === 'mission_completed'

  const title = BADGE_EVENTS.has(item.event_type)
    ? String(meta.badge_name ?? '')
    : String(meta.mission_title ?? '')

  const sheetBg = isMissionCompleted ? 'bg-jam-lime' : 'bg-jam-cream'

  return (
    <>
      {/* 딤 배경 */}
      <div
        className="fixed inset-0 bg-jam-ink/40 z-40"
        onClick={onClose}
      />

      {/* 시트 */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 ${sheetBg} border-t-[3px] border-jam-ink rounded-t-3xl px-6 pt-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}>
        {/* 핸들 */}
        <div className="w-10 h-1 bg-jam-ink/20 rounded-full mx-auto mb-5" />

        {/* 이미지 또는 아이콘 */}
        <div className="flex justify-center mb-5">
          {badgeImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={badgeImage}
              alt={title}
              className="w-28 h-28 rounded-3xl object-cover border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616]"
            />
          ) : (
            <div className="w-28 h-28 rounded-3xl bg-white border-[3px] border-jam-ink shadow-[4px_4px_0_0_#161616] flex items-center justify-center text-6xl">
              {EVENT_ICON[item.event_type]}
            </div>
          )}
        </div>

        {/* 이벤트 레이블 */}
        <p className="text-center text-[11px] font-black text-jam-ink/40 uppercase tracking-widest mb-1">
          {EVENT_LABEL[item.event_type]}
        </p>

        {/* 제목 */}
        <h2 className="text-center text-2xl font-black text-jam-ink mb-3 leading-tight">{title}</h2>

        {/* rarity */}
        {rarity && RARITY_COLOR[rarity] && (
          <div className="flex justify-center mb-4">
            <span className={`text-xs font-black px-3 py-1 rounded-xl border-[2px] border-jam-ink ${RARITY_COLOR[rarity]}`}>
              {RARITY_LABEL[rarity]}
            </span>
          </div>
        )}

        {/* 상세 정보 */}
        <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] divide-y-[2px] divide-jam-ink/10 mb-5">
          {/* POI 이름 */}
          {(item.event_type === 'item_dropped' || item.event_type === 'item_picked_up') && meta.poi_name && (
            <Row label="장소" value={String(meta.poi_name)} />
          )}

          {/* 미션 보상 */}
          {item.event_type === 'mission_completed' && meta.reward_points && (
            <Row label="보상" value={`${meta.reward_points}P`} />
          )}

          {/* 날짜 */}
          <Row label="일시" value={formatFullDate(item.event_at)} />
        </div>

        {/* 닫기 */}
        <button
          onClick={onClose}
          className="w-full py-4 rounded-2xl border-[3px] border-jam-ink bg-jam-ink text-white font-black text-base active:scale-95 transition-all shadow-[3px_3px_0_0_#161616]"
        >
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

// ─── 피드 카드 ───────────────────────────────────────────────────────────────

function FeedCard({ item, onClick }: { item: ActivityFeedRow; onClick: () => void }) {
  const meta = item.metadata as Record<string, string | number | null>
  const isMission = MISSION_EVENTS.has(item.event_type)
  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null

  const title = BADGE_EVENTS.has(item.event_type)
    ? String(meta.badge_name ?? '')
    : String(meta.mission_title ?? '')

  const sub = (() => {
    if (item.event_type === 'item_picked_up' || item.event_type === 'item_dropped') {
      return meta.poi_name ? String(meta.poi_name) : null
    }
    if (item.event_type === 'mission_completed' && meta.reward_points) {
      return `+${meta.reward_points}P`
    }
    return null
  })()

  const cardBg =
    item.event_type === 'mission_completed' ? 'bg-jam-lime' :
    item.event_type === 'mission_cancelled' ? 'bg-white/60' :
    'bg-white'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left ${cardBg} border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 flex items-center gap-3 active:scale-[0.98] transition-transform`}
    >
      {/* 이미지 또는 아이콘 */}
      {badgeImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={badgeImage}
          alt={title}
          className="w-11 h-11 rounded-xl object-cover border-[2px] border-jam-ink shrink-0"
        />
      ) : (
        <div className={`w-11 h-11 rounded-xl border-[2px] border-jam-ink flex items-center justify-center text-xl shrink-0 ${isMission ? 'bg-jam-yellow' : 'bg-jam-cream'}`}>
          {EVENT_ICON[item.event_type]}
        </div>
      )}

      {/* 텍스트 */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-jam-ink/40 uppercase tracking-widest mb-0.5">
          {EVENT_LABEL[item.event_type]}
        </p>
        <p className="font-black text-sm text-jam-ink truncate">{title}</p>
        {sub && <p className="text-xs text-jam-ink/50 font-semibold mt-0.5 truncate">{sub}</p>}
        {rarity && RARITY_COLOR[rarity] && (
          <span className={`inline-block mt-1 text-[10px] font-black px-1.5 py-0.5 rounded-md ${RARITY_COLOR[rarity]}`}>
            {RARITY_LABEL[rarity]}
          </span>
        )}
      </div>

      {/* 시간 + 화살표 */}
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
}: Props) {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [selectedItem, setSelectedItem] = useState<ActivityFeedRow | null>(null)
  const [following, setFollowing] = useState(isFollowing)
  const [followerCnt, setFollowerCnt] = useState(followerCount)

  const filtered = feedItems.filter((f) => matchesFilter(f, activeFilter))

  const handleFollow = async () => {
    if (following) {
      setFollowing(false)
      setFollowerCnt((c) => c - 1)
      await fetch(`/api/follows/${targetUserId}`, { method: 'DELETE' })
    } else {
      setFollowing(true)
      setFollowerCnt((c) => c + 1)
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
      if (meta.mission_id) {
        router.push(`/missions/${meta.mission_id}`)
        return
      }
    }
    setSelectedItem(item)
  }

  return (
    <div className="min-h-full bg-jam-pink text-jam-ink px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-10 flex flex-col gap-6">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-4">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt="프로필"
            className="w-16 h-16 rounded-2xl object-cover border-[3px] border-jam-ink"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-white border-[3px] border-jam-ink flex items-center justify-center text-2xl">
            👤
          </div>
        )}
        <div className="flex-1">
          <p className="font-black text-xl">{profile?.username ? `@${profile.username}` : '익명'}</p>
          {isOwnProfile && <p className="text-jam-ink/60 text-sm font-semibold">{profile?.email}</p>}
        </div>
        {isOwnProfile ? (
          <button
            onClick={() => router.push('/profile/edit')}
            className="px-3 py-1.5 rounded-xl bg-jam-ink text-white text-sm font-black border-[2px] border-jam-ink active:scale-95 transition-transform"
          >
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

      {/* 통계 바 */}
      <div className="flex border-[2px] border-jam-ink rounded-2xl overflow-hidden bg-white shadow-[2px_2px_0_0_#161616]">
        {[
          { label: '팔로워', value: followerCnt, href: `/${username}/followers` },
          { label: '팔로잉', value: followingCount, href: `/${username}/following` },
          { label: '뱃지', value: badgeCount, onClick: () => { setActiveFilter('badge'); window.scrollTo(0, 0) } },
          { label: '아이템북', value: itemBookCount, href: '/itembooks' },
        ].map((stat, i) => (
          <button
            key={stat.label}
            onClick={stat.onClick ?? (() => router.push(stat.href!))}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 active:bg-jam-ink/5 transition-colors ${
              i < 3 ? 'border-r-[2px] border-jam-ink' : ''
            }`}
          >
            <span className="text-xl font-black text-jam-ink">{stat.value}</span>
            <span className="text-[10px] font-black text-jam-ink/50 uppercase tracking-wider">{stat.label}</span>
          </button>
        ))}
      </div>

      {/* Strava 연동 — 본인만 */}
      {isOwnProfile && (
      <section className="bg-jam-cream rounded-3xl border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] p-5">
        <h2 className="font-black text-base mb-3">Strava 연동</h2>
        {strava ? (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FC4C02] border border-jam-ink" />
            <span className="text-sm font-black text-[#FC4C02]">연동됨</span>
            {strava.last_synced_at && (
              <span className="text-sm text-jam-ink/50 font-semibold ml-1">
                · {formatRelativeTime(strava.last_synced_at)}
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-sm text-jam-ink/50 font-semibold">연동 안됨</span>
            <a
              href="/api/strava/auth"
              className="px-4 py-2 rounded-xl bg-[#FC4C02] text-white text-sm font-black active:scale-95 transition-transform border-2 border-jam-ink"
            >
              Strava 연동
            </a>
          </div>
        )}
      </section>
      )}

      {/* Feed — 본인만 */}
      {isOwnProfile && (
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-base">Feed</h2>
          <span className="text-xs text-jam-ink/40 font-semibold">{filtered.length}개</span>
        </div>

        {/* 필터 탭 */}
        <div className="flex gap-2 mb-4">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`flex-1 py-2 rounded-xl border-[2px] border-jam-ink text-xs font-black transition-all active:scale-95 ${
                activeFilter === key
                  ? 'bg-jam-ink text-white shadow-[2px_2px_0_0_#161616]'
                  : 'bg-white/60 text-jam-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-jam-ink/50 font-bold text-sm">아직 기록이 없어요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((item) => (
              <FeedCard key={item.id} item={item} onClick={() => handleCardClick(item)} />
            ))}
          </div>
        )}
      </section>
      )}

      {/* 로그아웃 — 본인만 */}
      {isOwnProfile && (
        <button
          onClick={handleLogout}
          className="w-full py-4 rounded-2xl border-[3px] border-jam-ink text-jam-ink font-black text-base active:scale-95 transition-all bg-white/60"
        >
          로그아웃
        </button>
      )}

      {/* 상세 시트 (배지/아이템 이벤트) */}
      {selectedItem && (
        <DetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  )
}
