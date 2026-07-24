'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ActivityFeedRow, ActivityFeedEventType } from '@/types/database'
import { formatRelativeTime } from '@/lib/utils'

type FilterTab = 'all' | 'badge' | 'mission'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'badge', label: '배지' },
  { key: 'mission', label: '미션' },
]

const BADGE_EVENTS = new Set<ActivityFeedEventType>(['badge_earned', 'item_dropped', 'item_picked_up'])
const MISSION_EVENTS = new Set<ActivityFeedEventType>(['mission_joined', 'mission_completed', 'mission_cancelled'])

const EVENT_ICON: Record<ActivityFeedEventType, string> = {
  badge_earned: '🏅', item_dropped: '📦', item_picked_up: '🎁',
  mission_joined: '🎯', mission_completed: '🎉', mission_cancelled: '❌',
}
const EVENT_LABEL: Record<ActivityFeedEventType, string> = {
  badge_earned: '배지 획득', item_dropped: '아이템 드랍', item_picked_up: '아이템 픽업',
  mission_joined: '미션 참가', mission_completed: '미션 완료', mission_cancelled: '미션 취소',
}
const RARITY_COLOR: Record<string, string> = {
  rare: 'bg-jam-teal/20 text-jam-teal',
  legendary: 'bg-jam-purple/20 text-jam-purple',
  mythic: 'bg-[#FF4500]/20 text-[#FF4500]',
}
const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', legendary: 'Legend', mythic: 'Mythic',
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function DetailSheet({ item, onClose }: { item: ActivityFeedRow; onClose: () => void }) {
  const router = useRouter()
  const meta = item.metadata as Record<string, string | number | null>
  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null
  const isMissionCompleted = item.event_type === 'mission_completed'
  const title = BADGE_EVENTS.has(item.event_type) ? String(meta.badge_name ?? '') : String(meta.mission_title ?? '')
  const isBadgeEvent = BADGE_EVENTS.has(item.event_type) && Boolean(meta.badge_id)
  const rawBadgeNames = (item.metadata as Record<string, unknown>).awarded_badge_names
  const missionBadgeNames = Array.isArray(rawBadgeNames) ? (rawBadgeNames as string[]) : []

  return (
    <>
      <div className="fixed inset-0 bg-jam-ink/40 z-40" onClick={onClose} />
      <div className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 ${isMissionCompleted ? 'bg-jam-lime' : 'bg-jam-cream'} border-t-[3px] border-jam-ink rounded-t-3xl px-6 pt-5 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-4 right-4 w-8 h-8 rounded-xl border-[2px] border-jam-ink bg-white flex items-center justify-center active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-4 h-4 text-jam-ink">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
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
        <p className="text-center text-[11px] font-black text-jam-ink/40 uppercase tracking-widest mb-1">{EVENT_LABEL[item.event_type]}</p>
        <h2 className="text-center text-2xl font-black text-jam-ink mb-3 leading-tight">{title}</h2>
        {rarity && RARITY_COLOR[rarity] && (
          <div className="flex justify-center mb-4">
            <span className={`text-xs font-black px-3 py-1 rounded-xl border-[2px] border-jam-ink ${RARITY_COLOR[rarity]}`}>{RARITY_LABEL[rarity]}</span>
          </div>
        )}
        <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] divide-y-[2px] divide-jam-ink/10 mb-5">
          {(item.event_type === 'item_dropped' || item.event_type === 'item_picked_up') && meta.poi_name && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-black text-jam-ink/40 uppercase tracking-widest">장소</span>
              <span className="text-sm font-black text-jam-ink">{String(meta.poi_name)}</span>
            </div>
          )}
          {item.event_type === 'mission_completed' && meta.target_value != null && Number(meta.target_value) > 0 && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-black text-jam-ink/40 uppercase tracking-widest">결과</span>
              <span className="text-sm font-black text-jam-ink">{String(meta.final_progress_value ?? 0)} / 목표 {String(meta.target_value)}</span>
            </div>
          )}
          {item.event_type === 'mission_completed' && missionBadgeNames.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <span className="text-xs font-black text-jam-ink/40 uppercase tracking-widest shrink-0">보상 배지</span>
              <span className="text-sm font-black text-jam-ink text-right">{missionBadgeNames.join(', ')}</span>
            </div>
          )}
          {item.event_type === 'mission_completed' && meta.reward_points && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-black text-jam-ink/40 uppercase tracking-widest">보상 포인트</span>
              <span className="text-sm font-black text-jam-ink">{meta.reward_points}P</span>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-black text-jam-ink/40 uppercase tracking-widest">일시</span>
            <span className="text-sm font-black text-jam-ink">{formatFullDate(item.event_at)}</span>
          </div>
        </div>
        {isBadgeEvent ? (
          <button
            onClick={() => router.push(`/badges/${meta.badge_id}`)}
            className="w-full py-4 rounded-2xl border-[3px] border-jam-ink bg-jam-ink text-white font-black text-base active:scale-95 transition-all shadow-[3px_3px_0_0_#161616]"
          >
            상세보기
          </button>
        ) : (
          <button onClick={onClose} className="w-full py-4 rounded-2xl border-[3px] border-jam-ink bg-jam-ink text-white font-black text-base active:scale-95 transition-all shadow-[3px_3px_0_0_#161616]">닫기</button>
        )}
      </div>
    </>
  )
}

function FeedCard({ item, onClick }: { item: ActivityFeedRow; onClick: () => void }) {
  const meta = item.metadata as Record<string, string | number | boolean | null>
  const isMission = MISSION_EVENTS.has(item.event_type)
  const rarity = meta.rarity ? String(meta.rarity) : null
  const badgeImage = meta.badge_image_url ? String(meta.badge_image_url) : null
  const title = BADGE_EVENTS.has(item.event_type) ? String(meta.badge_name ?? '') : String(meta.mission_title ?? '')
  const sub = (() => {
    if (item.event_type === 'item_dropped') {
      // 드랍엔진 v2: 세계관 이름 노출 ("아스팔트 레인저의 파편")
      if (meta.faction_name) return `${meta.faction_name}의 파편`
      return meta.poi_name ? String(meta.poi_name) : null
    }
    if (item.event_type === 'item_picked_up') return meta.poi_name ? String(meta.poi_name) : null
    if (item.event_type === 'mission_completed' && meta.reward_points) return `+${meta.reward_points}P`
    return null
  })()
  const isLastPiece = item.event_type === 'item_dropped' && meta.is_last_piece === true
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
        <span className="inline-flex items-center gap-1.5 mt-1">
          {rarity && RARITY_COLOR[rarity] && (
            <span className={`inline-block text-[10px] font-black px-1.5 py-0.5 rounded-md ${RARITY_COLOR[rarity]}`}>{RARITY_LABEL[rarity]}</span>
          )}
          {isLastPiece && (
            <span className="inline-block text-[10px] font-black px-1.5 py-0.5 rounded-md bg-jam-ink text-jam-lime">
              🧩 마지막 파편!
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[11px] text-jam-ink/40 font-semibold">{formatRelativeTime(item.event_at)}</span>
        <span className="text-jam-ink/30 text-xs">›</span>
      </div>
    </button>
  )
}

export default function HomeFeedSection({ feedItems }: { feedItems: ActivityFeedRow[] }) {
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [selectedItem, setSelectedItem] = useState<ActivityFeedRow | null>(null)

  const filtered = feedItems.filter(f => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'badge') return BADGE_EVENTS.has(f.event_type)
    if (activeFilter === 'mission') return MISSION_EVENTS.has(f.event_type)
    return false
  })

  const handleCardClick = (item: ActivityFeedRow) => {
    if (MISSION_EVENTS.has(item.event_type)) {
      const meta = item.metadata as Record<string, string>
      if (meta.mission_id) { router.push(`/missions/${meta.mission_id}`); return }
    }
    setSelectedItem(item)
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-black text-lg text-jam-ink">Feed</h2>
        <span className="text-xs text-jam-ink/40 font-semibold">{filtered.length}개</span>
      </div>
      <div className="flex gap-2 mb-4">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`flex-1 py-2 rounded-xl border-[2px] border-jam-ink text-xs font-black transition-all active:scale-95 ${
              activeFilter === key ? 'bg-jam-ink text-white shadow-[2px_2px_0_0_#161616]' : 'bg-white/60 text-jam-ink'
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
          {filtered.map(item => (
            <FeedCard key={item.id} item={item} onClick={() => handleCardClick(item)} />
          ))}
        </div>
      )}
      {selectedItem && <DetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </section>
  )
}
