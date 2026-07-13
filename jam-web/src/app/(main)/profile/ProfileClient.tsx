'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeTime } from '@/lib/utils'
import type { UserRow, StravaConnectionRow, ActivityFeedRow, ActivityFeedEventType } from '@/types/database'

const FILTER_LABELS: Record<ActivityFeedEventType | 'all', string> = {
  all: '전체',
  badge_earned: '배지',
  item_dropped: '드랍',
  item_picked_up: '픽업',
  mission_joined: '미션 참가',
  mission_completed: '미션 완료',
  mission_cancelled: '미션 취소',
}

const FILTER_TABS: Array<ActivityFeedEventType | 'all'> = [
  'all',
  'badge_earned',
  'item_dropped',
  'item_picked_up',
  'mission_joined',
  'mission_completed',
  'mission_cancelled',
]

function FeedIcon({ type }: { type: ActivityFeedEventType }) {
  const icons: Record<ActivityFeedEventType, string> = {
    badge_earned: '🏅',
    item_dropped: '📦',
    item_picked_up: '🎁',
    mission_joined: '🎯',
    mission_completed: '🎉',
    mission_cancelled: '❌',
  }
  return <span className="text-xl">{icons[type]}</span>
}

function FeedLabel({ type }: { type: ActivityFeedEventType }) {
  const labels: Record<ActivityFeedEventType, string> = {
    badge_earned: '배지 획득',
    item_dropped: '아이템 드랍',
    item_picked_up: '아이템 픽업',
    mission_joined: '미션 참가',
    mission_completed: '미션 완료',
    mission_cancelled: '미션 취소',
  }
  return <span className="text-[10px] font-black text-jam-ink/40 uppercase tracking-widest">{labels[type]}</span>
}

function FeedItemTitle({ item }: { item: ActivityFeedRow }) {
  const meta = item.metadata as Record<string, string>
  switch (item.event_type) {
    case 'badge_earned':
    case 'item_dropped':
    case 'item_picked_up':
      return <span className="font-black text-sm text-jam-ink">{meta.badge_name}</span>
    case 'mission_joined':
    case 'mission_completed':
    case 'mission_cancelled':
      return <span className="font-black text-sm text-jam-ink">{meta.mission_title}</span>
    default:
      return null
  }
}

function FeedItemSub({ item }: { item: ActivityFeedRow }) {
  const meta = item.metadata as Record<string, string>
  switch (item.event_type) {
    case 'item_picked_up':
      return meta.poi_name ? <span className="text-xs text-jam-ink/50 font-semibold">{meta.poi_name}</span> : null
    case 'item_dropped':
      return meta.poi_name ? <span className="text-xs text-jam-ink/50 font-semibold">{meta.poi_name}</span> : null
    case 'mission_completed':
      return meta.reward_points
        ? <span className="text-xs text-jam-ink/50 font-semibold">+{meta.reward_points}P</span>
        : null
    default:
      return null
  }
}

function RarityDot({ rarity }: { rarity?: string }) {
  const colors: Record<string, string> = {
    common: 'bg-jam-ink/30',
    rare: 'bg-jam-teal',
    legendary: 'bg-jam-purple',
    mythic: 'bg-[#FF4500]',
  }
  if (!rarity || !colors[rarity]) return null
  return <span className={`w-2 h-2 rounded-full shrink-0 ${colors[rarity]}`} />
}

interface Props {
  profile: UserRow | null
  strava: StravaConnectionRow | null
  feedItems: ActivityFeedRow[]
}

export default function ProfileClient({ profile, strava, feedItems }: Props) {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<ActivityFeedEventType | 'all'>('all')

  const filtered = activeFilter === 'all'
    ? feedItems
    : feedItems.filter((f) => f.event_type === activeFilter)

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
        <h2 className="font-black text-base mb-3">활동 이력</h2>

        {/* 필터 탭 */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`shrink-0 px-3 py-1.5 rounded-xl border-[2px] border-jam-ink text-xs font-black transition-all active:scale-95 ${
                activeFilter === tab
                  ? 'bg-jam-ink text-white'
                  : 'bg-white/60 text-jam-ink'
              }`}
            >
              {FILTER_LABELS[tab]}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-jam-ink/50 font-bold text-sm">아직 활동 이력이 없어요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((item) => {
              const meta = item.metadata as Record<string, string>
              return (
                <div
                  key={item.id}
                  className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] p-4 flex items-center gap-3"
                >
                  {/* 아이콘 또는 배지 이미지 */}
                  {meta.badge_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={meta.badge_image_url}
                      alt={meta.badge_name}
                      className="w-10 h-10 rounded-xl object-cover border-[2px] border-jam-ink shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-jam-cream border-[2px] border-jam-ink flex items-center justify-center shrink-0">
                      <FeedIcon type={item.event_type} />
                    </div>
                  )}

                  {/* 콘텐츠 */}
                  <div className="flex-1 min-w-0">
                    <FeedLabel type={item.event_type} />
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <RarityDot rarity={meta.rarity} />
                      <FeedItemTitle item={item} />
                    </div>
                    <FeedItemSub item={item} />
                  </div>

                  {/* 시간 */}
                  <span className="text-[11px] text-jam-ink/40 font-semibold shrink-0">
                    {formatRelativeTime(item.event_at)}
                  </span>
                </div>
              )
            })}
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
