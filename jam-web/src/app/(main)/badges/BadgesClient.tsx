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
    <div className="min-h-full bg-jam-purple flex flex-col">
      {/* 헤더 */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
        <h1 className="text-3xl font-black text-white">나의 배지</h1>
      </div>

      {/* 탭 헤더 */}
      <div className="flex px-5 gap-2 pb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={[
              'px-3.5 py-2 rounded-full text-sm font-black border-[3px] border-jam-ink transition-all flex items-center gap-1.5 whitespace-nowrap',
              activeTab === tab.key
                ? 'bg-jam-lime text-jam-ink shadow-[3px_3px_0_0_#161616]'
                : 'bg-jam-purple text-white/70',
            ].join(' ')}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={[
                  'text-[10px] rounded-full px-1.5 py-0.5 tabular-nums',
                  activeTab === tab.key ? 'bg-jam-ink/10 text-jam-ink' : 'bg-white/10 text-white',
                ].join(' ')}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 bg-jam-cream rounded-t-[2rem] border-t-[3px] border-jam-ink px-5 py-6">
        {/* 액티비티 배지 탭 */}
        {activeTab === 'activity' && (
          <>
            {badges.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {badges.map(({ badge }) => (
                  <Link key={badge.id} href={`/badges/${badge.id}`}>
                    <div className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-white border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all">
                      <div className="w-16 h-16 rounded-xl bg-jam-cream flex items-center justify-center overflow-hidden">
                        {badge.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={badge.image_url}
                            alt={badge.name}
                            className="w-full h-full object-contain p-1"
                          />
                        ) : (
                          <span className="text-3xl">🏅</span>
                        )}
                      </div>
                      <p className="text-xs text-center font-bold leading-tight line-clamp-2 text-jam-ink">
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
                <p className="text-jam-ink/60 font-bold">아직 획득한 배지가 없어요</p>
                <p className="text-jam-ink/40 text-sm mt-2 font-semibold">
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
                          'flex flex-col items-center gap-2 p-3 rounded-2xl bg-white border-[3px] shadow-[3px_3px_0_0_#161616] active:shadow-none active:translate-x-[3px] active:translate-y-[3px] transition-all',
                          expiring ? 'border-red-500' : 'border-jam-ink',
                        ].join(' ')}
                      >
                        <div className="w-16 h-16 rounded-xl bg-jam-cream flex items-center justify-center overflow-hidden relative">
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.name}
                              width={64}
                              height={64}
                              className="object-contain w-full h-full p-1"
                            />
                          ) : (
                            <span className="text-3xl">🏷️</span>
                          )}
                          {expiring && (
                            <span className="absolute top-0.5 right-0.5 text-[10px]">⚠️</span>
                          )}
                        </div>
                        <p className="text-xs text-center font-bold leading-tight line-clamp-2 text-jam-ink">
                          {item.name}
                        </p>
                        <div className="flex flex-col items-center gap-0.5">
                          <RarityBadge rarity={item.rarity} />
                          <span className="text-[10px] text-jam-ink/40 font-mono">
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
                <p className="text-jam-ink/60 font-bold">아직 아이템 배지가 없어요</p>
                <p className="text-jam-ink/40 text-sm mt-2 font-semibold">
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
                    <Link key={book.id} href={`/itembooks/${book.id}`}>
                      <Card
                        className={`active:scale-[0.98] transition-transform ${progress.completed ? 'border-jam-lime shadow-[3px_3px_0_0_#c6ff3a]' : ''}`}
                      >
                        <div className="flex gap-3 mb-3">
                          {book.image_url && (
                            <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border-2 border-jam-ink shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={book.image_url} alt={book.name} className="w-full h-full object-contain p-1" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <h3 className="font-black text-base leading-tight text-jam-ink">{book.name}</h3>
                              {progress.completed ? (
                                <span className="text-jam-ink bg-jam-lime border-2 border-jam-ink px-2 py-0.5 rounded-full text-xs font-black ml-2 shrink-0">
                                  완성 ✓
                                </span>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4 text-jam-ink/30 shrink-0 ml-2 mt-0.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                </svg>
                              )}
                            </div>
                            <p className="text-jam-ink/60 text-sm mt-0.5 line-clamp-2 font-semibold">{book.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2.5 rounded-full bg-jam-ink/10 overflow-hidden border border-jam-ink/20">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${progress.completed ? 'bg-jam-lime' : 'bg-jam-ink/30'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-jam-ink/50 tabular-nums font-bold">
                            {progress.owned} / {progress.total}
                          </span>
                        </div>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <Card className="text-center py-10">
                <p className="text-4xl mb-3">📖</p>
                <p className="text-jam-ink/60 font-bold">아직 아이템북이 없어요</p>
                <p className="text-jam-ink/40 text-sm mt-2 font-semibold">관리자가 아이템북을 등록하면 이 곳에 표시됩니다</p>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
