import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createServiceClient } from '@/lib/supabase/server'
import { Card } from '@/components/admin/ui/card'
import type { BadgeRow } from '@/types/database'
import { RARITY_LABEL, RARITY_BADGE_COLOR } from '@/lib/admin/item-badge-status'
import { ItemBadgeSearchBar } from './ItemBadgeSearchBar'

type SearchBadgeRow = Pick<BadgeRow, 'id' | 'name' | 'image_url' | 'rarity'>

interface Props {
  searchParams: Promise<Record<string, string | undefined>>
}

/**
 * 아이템배지 현황 — 배지 검색 화면(티켓 20260829_2139, 열린 결정 2·3; 메뉴명 20260830_1242 변경).
 *
 * `/admin/badges`(도안 CRUD)와는 다른 잡스토리(조회/감사)이자 다른 객체(Badge 도안이
 * 아니라 InventoryItem 개체)를 다루므로 독립된 최상위 메뉴로 뒀다. 배지(도안)를 먼저
 * 고르고, 그 배지로 발급된 일련번호 목록은 `[badgeId]` 하위 화면에서 본다.
 *
 * 활성/비활성(deleted_at) 구분 없이 전체 아이템배지를 대상으로 한다 — 회수된 배지라도
 * 과거에 발급된 개체의 이력은 감사 대상이다.
 */
export default async function ItemBadgesSearchPage({ searchParams }: Props) {
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const filterFactionId = params.faction_id
  const filterItemBookId = params.item_book_id
  const filterRarity = params.rarity
  const hasFilter = !!(q || filterFactionId || filterItemBookId || filterRarity)

  const supabase = createServiceClient()

  const [{ data: factionsRaw }, { data: itemBooksRaw }] = await Promise.all([
    supabase.from('factions').select('id, name').order('name'),
    supabase.from('item_books').select('id, name, faction_id').order('name'),
  ])
  const factions = (factionsRaw ?? []) as { id: string; name: string }[]
  const itemBooks = (itemBooksRaw ?? []) as { id: string; name: string; faction_id: string | null }[]

  let badges: SearchBadgeRow[] = []
  const totalCountByBadge = new Map<string, number>()

  if (hasFilter) {
    let query = supabase.from('badges').select('id, name, image_url, rarity').eq('type', 'item')
    if (q) query = query.ilike('name', `%${q}%`)
    if (filterFactionId) query = query.eq('faction_id', filterFactionId)
    if (filterItemBookId) query = query.eq('item_book_id', filterItemBookId)
    // filterRarity는 쿼리스트링에서 온 string이라 badges.rarity 유니언으로 좁혀 넘긴다.
    // 유효하지 않은 값이 들어와도 지금과 똑같이 "결과 0건"이 되도록 검증 없이 그대로 전달한다.
    if (filterRarity) query = query.eq('rarity', filterRarity as NonNullable<SearchBadgeRow['rarity']>)

    const { data: badgesRaw } = await query.order('name', { ascending: true }).limit(100)
    badges = (badgesRaw ?? []) as SearchBadgeRow[]

    const badgeIds = badges.map((b) => b.id)
    if (badgeIds.length > 0) {
      const { data: itemsRaw } = await supabase.from('inventory_items').select('badge_id').in('badge_id', badgeIds)
      for (const row of (itemsRaw ?? []) as { badge_id: string }[]) {
        totalCountByBadge.set(row.badge_id, (totalCountByBadge.get(row.badge_id) ?? 0) + 1)
      }
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">아이템배지 현황</h1>
        <p className="text-muted-foreground text-sm mt-1">
          배지를 검색해 발급된 일련번호와 이력을 조회합니다.
        </p>
      </div>

      <Suspense>
        <ItemBadgeSearchBar factions={factions} itemBooks={itemBooks} />
      </Suspense>

      {hasFilter && (
        <>
          <div className="text-sm text-muted-foreground">
            {q ? `"${q}" 검색 결과 ${badges.length}종` : `필터 결과 ${badges.length}종`}
          </div>

          {badges.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              조건에 맞는 배지가 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {badges.map((badge) => (
                <Link key={badge.id} href={`/admin/item-badges/${badge.id}`}>
                  <Card className="p-4 flex items-center gap-3 hover:border-neutral-400 transition-colors h-full">
                    <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                      {badge.image_url ? (
                        <Image
                          src={badge.image_url}
                          alt={badge.name}
                          width={48}
                          height={48}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{badge.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`inline-block px-2 py-0.5 text-xs font-semibold rounded ${
                            (badge.rarity ? RARITY_BADGE_COLOR[badge.rarity] : null) ?? 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {badge.rarity ? RARITY_LABEL[badge.rarity] : '—'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          총 발급 {totalCountByBadge.get(badge.id) ?? 0}개
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
