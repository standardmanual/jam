'use client'

import BadgeCard from './BadgeCard'
import BadgesTable from './BadgesTable'
import { useIsDesktop } from '@/lib/admin/use-is-desktop'
import type { BadgeRow } from '@/types/database'

/** 목록(카드/테이블)에 실제로 쓰는 컬럼만 — `admin/badges/page.tsx`의 select()와 짝을 이룬다
 *  (20260826_011 A8). 상세화면(drop_weight, valid_from/until, background_* 등)은 별도로
 *  전체 조회한다. */
export type BadgeListRow = Pick<
  BadgeRow,
  | 'id' | 'name' | 'description' | 'type' | 'rarity' | 'image_url' | 'condition_json'
  | 'activity_types' | 'patch_available' | 'patch_price_krw' | 'faction_id' | 'deleted_at'
>

interface BadgeListProps {
  badges: BadgeListRow[]
  factionMap?: Map<string, string>
}

export default function BadgeList({ badges, factionMap = new Map() }: BadgeListProps) {
  // `md:hidden`/`hidden md:block`으로 카드 리스트와 테이블을 둘 다 마운트하면 렌더 비용이
  // 이중으로 든다(실측: /admin/badges 50건 페이지에서 <img> 100개, 20260826_011 A4) —
  // 실제 뷰포트에 맞는 한쪽만 마운트한다.
  const isDesktop = useIsDesktop()

  if (badges.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-sm">일치하는 배지가 없습니다.</p>
      </div>
    )
  }

  if (isDesktop === null) return null

  if (!isDesktop) {
    return (
      <div className="grid grid-cols-1 gap-4">
        {badges.map((badge) => (
          <BadgeCard key={badge.id} badge={badge} />
        ))}
      </div>
    )
  }

  return <BadgesTable badges={badges} factionMap={factionMap} />
}
