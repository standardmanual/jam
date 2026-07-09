'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BadgeRow, UserActivityBadgeRow, ItemBookRow } from '@/types/database'
import RarityBadge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'

type TabKey = 'activity' | 'itembook'

interface BadgesClientProps {
  badges: Array<{ badge: BadgeRow; earned: UserActivityBadgeRow }>
  itemBooks: ItemBookRow[]
}

const rarityGlowMap: Record<string, string> = {
  common: '',
  rare: 'shadow-[0_0_12px_rgba(59,130,246,0.3)]',
  legendary: 'shadow-[0_0_12px_rgba(168,85,247,0.3)]',
  mythic: 'shadow-[0_0_16px_rgba(245,158,11,0.4)]',
}

export default function BadgesClient({ badges, itemBooks }: BadgesClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('activity')

  return (
    <div className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div className="flex px-5 pt-5 gap-2 border-b border-white/10">
        {[
          { key: 'activity' as TabKey, label: '액티비티 배지' },
          { key: 'itembook' as TabKey, label: '아이템북' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'pb-3 px-1 text-sm font-semibold border-b-2 transition-colors',
              activeTab === tab.key
                ? 'border-[#AEEA00] text-[#AEEA00]'
                : 'border-transparent text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {activeTab === 'activity' && (
          <>
            {badges.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {badges.map(({ badge }) => (
                  <Link key={badge.id} href={`/badges/${badge.id}`}>
                    <div
                      className={[
                        'flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition-all active:scale-95',
                        rarityGlowMap[badge.rarity],
                      ].join(' ')}
                    >
                      <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden">
                        {badge.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={badge.image_url}
                            alt={badge.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-3xl">🏅</span>
                        )}
                      </div>
                      <p className="text-xs text-center font-medium leading-tight line-clamp-2">
                        {badge.name}
                      </p>
                      <RarityBadge rarity={badge.rarity} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="text-center py-10">
                <p className="text-4xl mb-3">🏅</p>
                <p className="text-white/50 font-medium">아직 획득한 배지가 없어요</p>
                <p className="text-white/30 text-sm mt-2">
                  Strava를 연동하고 활동하면 배지를 획득할 수 있어요
                </p>
              </Card>
            )}
          </>
        )}

        {activeTab === 'itembook' && (
          <>
            {itemBooks.length > 0 ? (
              <div className="flex flex-col gap-4">
                {itemBooks.map((book) => (
                  <Card key={book.id}>
                    <h3 className="font-bold text-base mb-1">{book.name}</h3>
                    <p className="text-white/50 text-sm mb-3">{book.description}</p>
                    {/* 진척도: 필요 아이템 수 대비 진행상황 (데이터 연동은 Phase 2) */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-white/10">
                        <div className="h-2 rounded-full bg-[#AEEA00] w-0" />
                      </div>
                      <span className="text-xs text-white/40">
                        0 / {book.required_item_badge_ids.length + 1}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="text-center py-10">
                <p className="text-4xl mb-3">📖</p>
                <p className="text-white/50 font-medium">아직 아이템북이 없어요</p>
                <p className="text-white/30 text-sm mt-2">아이템북은 Phase 2에서 오픈됩니다</p>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
