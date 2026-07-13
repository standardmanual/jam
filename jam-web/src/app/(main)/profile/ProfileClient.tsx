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

// ─── 피드 카드 내부 표현 ─────────────────────────────────────────────────────

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
  common: 'bg-jam-ink/20 text-jam-ink',
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

// ─── 카드 ────────────────────────────────────────────────────────────────────

function FeedCard({ item }: { item: ActivityFeedRow }) {
  const meta = item.metadata as Record<string, string | number | null>
  const isBadge = BADGE_EVENTS.has(item.event_type)
  const isMission = MISSION_EVENTS.has(item.event_type)

  const title = isBadge
    ? String(meta.badge_name ?? '')
    : String(meta.mission_title ?? '')

  const sub = (() => {
    if (item.event_type === 'item_picked_up' || item.event_type === 'item_dropped') {
      return meta.poi_name ? String(meta.poi_name) : null
    }
    if (item.event_type === 'mission_completed' && meta.reward_points) {
      return `+${meta.reward_points}P 획득`
    }
    return null
  })()

  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null

  const cardBg = item.event_type === 'mission_completed'
    ? 'bg-jam-lime'
    : item.event_type === 'mission_cancelled'
    ? 'bg-white/60'
    : 'bg-white'

  return (
    <div className={`${cardBg} border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 flex items-center gap-3`}>
      {/* 이미지 또는 이모지 아이콘 */}
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
        {/* 이벤트 종류 레이블 */}
        <p className="text-[10px] font-black text-jam-ink/40 uppercase tracking-widest mb-0.5">
          {EVENT_LABEL[item.event_type]}
        </p>

        {/* 제목 */}
        <p className="font-black text-sm text-jam-ink truncate">{title}</p>

        {/* 서브 (POI명, 보상 등) */}
        {sub && <p className="text-xs text-jam-ink/50 font-semibold mt-0.5 truncate">{sub}</p>}

        {/* rarity 뱃지 */}
        {rarity && RARITY_COLOR[rarity] && (
          <span className={`inline-block mt-1 text-[10px] font-black px-1.5 py-0.5 rounded-md ${RARITY_COLOR[rarity]}`}>
            {RARITY_LABEL[rarity]}
          </span>
        )}
      </div>

      {/* 시간 */}
      <span className="text-[11px] text-jam-ink/40 font-semibold shrink-0 self-start mt-0.5">
        {formatRelativeTime(item.event_at)}
      </span>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface Props {
  profile: UserRow | null
  strava: StravaConnectionRow | null
  feedItems: ActivityFeedRow[]
}

export default function ProfileClient({ profile, strava, feedItems }: Props) {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')

  const filtered = feedItems.filter((f) => matchesFilter(f, activeFilter))

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
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
        <div>
          <p className="font-black text-xl">{profile?.display_name ?? '익명'}</p>
          <p className="text-jam-ink/60 text-sm font-semibold">{profile?.email}</p>
        </div>
      </div>

      {/* Strava 연동 */}
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

      {/* 활동 피드 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-black text-base">활동 이력</h2>
          <span className="text-xs text-jam-ink/40 font-semibold">{filtered.length}개</span>
        </div>

        {/* 필터 탭 — 3개만 */}
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
            <p className="text-jam-ink/50 font-bold text-sm">아직 활동 이력이 없어요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((item) => (
              <FeedCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <button
        onClick={handleLogout}
        className="w-full py-4 rounded-2xl border-[3px] border-jam-ink text-jam-ink font-black text-base active:scale-95 transition-all bg-white/60"
      >
        로그아웃
      </button>
    </div>
  )
}
