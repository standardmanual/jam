'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BadgeRow, UserActivityBadgeRow, ItemBookRow, BadgeRarity } from '@/types/database'
import RarityBadge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'

type TabKey = 'activity' | 'item' | 'itembook'

export interface ItemBookProgress {
  bookId: string
  owned: number
  total: number
  completed: boolean
}

export interface ItemBadgeCard {
  itemId: string
  badgeId: string
  serialNumber: number
  expiresAt: string | null
  name: string
  imageUrl: string | null
  rarity: BadgeRarity
}

interface BadgesClientProps {
  badges: Array<{ badge: BadgeRow; earned: UserActivityBadgeRow }>
  itemBadges: ItemBadgeCard[]
  itemBooks: ItemBookRow[]
  itemBookProgress: ItemBookProgress[]
}

const rarityGlowMap: Record<string, string> = {
  common: '',
  rare: 'shadow-[0_0_12px_rgba(59,130,246,0.3)]',
  legendary: 'shadow-[0_0_12px_rgba(168,85,247,0.3)]',
  mythic: 'shadow-[0_0_16px_rgba(245,158,11,0.4)]',
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

export default function BadgesClient({ badges, itemBadges, itemBooks, itemBookProgress }: BadgesClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('activity')
  const progressMap = new Map(itemBookProgress.map((p) => [p.bookId, p]))

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'activity', label: '액티비티', count: badges.length },
    { key: 'item', label: '아이템', count: itemBadges.length },
    { key: 'itembook', label: '아이템북', count: itemBooks.length },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div className="flex px-5 pt-5 gap-1 border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'pb-3 px-2 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5',
              activeTab === tab.key
                ? 'border-[#AEEA00] text-[#AEEA00]'
                : 'border-transparent text-white/40 hover:text-white/70',
            ].join(' ')}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 tabular-nums ${
                activeTab === tab.key ? 'bg-[#AEEA00]/20 text-[#AEEA00]' : 'bg-white/10 text-white/30'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {/* 액티비티 배지 탭 */}
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

        {/* 아이템 배지 탭 */}
        {activeTab === 'item' && (
          <>
            {itemBadges.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {itemBadges.map((item) => {
                  const expiring = isExpiringSoon(item.expiresAt)
                  return (
                    <Link key={item.itemId} href={`/inventory/${item.itemId}`}>
                      <div
                        className={[
                          'flex flex-col items-center gap-2 p-3 rounded-2xl bg-white/5 border transition-all active:scale-95',
                          expiring ? 'border-red-500/40' : 'border-white/10 hover:border-white/20',
                          rarityGlowMap[item.rarity],
                        ].join(' ')}
                      >
                        <div className="w-16 h-16 rounded-xl bg-white/5 flex items-center justify-center overflow-hidden relative">
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.name}
                              width={64}
                              height={64}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <span className="text-3xl">🏷️</span>
                          )}
                          {expiring && (
                            <span className="absolute top-0.5 right-0.5 text-[10px]">⚠️</span>
                          )}
                        </div>
                        <p className="text-xs text-center font-medium leading-tight line-clamp-2">
                          {item.name}
                        </p>
                        <div className="flex flex-col items-center gap-0.5">
                          <RarityBadge rarity={item.rarity} />
                          <span className="text-[10px] text-white/30 font-mono">
                            #{String(item.serialNumber).padStart(4, '0')}
                          </span>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <Card className="text-center py-10">
                <p className="text-4xl mb-3">🏷️</p>
                <p className="text-white/50 font-medium">아직 아이템 배지가 없어요</p>
                <p className="text-white/30 text-sm mt-2">
                  활동을 완료하면 확률로 아이템 배지가 드랍됩니다
                </p>
              </Card>
            )}
          </>
        )}

        {/* 아이템북 탭 */}
        {activeTab === 'itembook' && (
          <>
            {itemBooks.length > 0 ? (
              <div className="flex flex-col gap-4">
                {itemBooks.map((book) => {
                  const progress = progressMap.get(book.id) ?? { owned: 0, total: 1, completed: false }
                  const pct = Math.round((progress.owned / progress.total) * 100)
                  return (
                    <Card key={book.id} className={progress.completed ? 'border-[#AEEA00]/40' : ''}>
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-bold text-base">{book.name}</h3>
                        {progress.completed && (
                          <span className="text-[#AEEA00] text-sm font-bold ml-2 shrink-0">완성 ✓</span>
                        )}
                      </div>
                      <p className="text-white/50 text-sm mb-3">{book.description}</p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-2 rounded-full bg-[#AEEA00] transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-white/40 tabular-nums">
                          {progress.owned} / {progress.total}
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            ) : (
              <Card className="text-center py-10">
                <p className="text-4xl mb-3">📖</p>
                <p className="text-white/50 font-medium">아직 아이템북이 없어요</p>
                <p className="text-white/30 text-sm mt-2">관리자가 아이템북을 등록하면 이 곳에 표시됩니다</p>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
