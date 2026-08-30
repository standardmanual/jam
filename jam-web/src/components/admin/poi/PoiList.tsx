'use client'

import { PoiCard } from './PoiCard'
import { PoiTable } from './PoiTable'
import { useIsDesktop } from '@/lib/admin/use-is-desktop'
import type { PoiRow } from '@/types/database'

/** 목록(카드/테이블)에 실제로 쓰는 컬럼만 — `admin/poi/page.tsx`의 select()와 짝을 이룬다
 *  (20260826_011 A8). 상세화면(osm_id/naver_id/poi_tier/created_at 등)은 별도로 전체 조회한다. */
export type PoiListRow = Pick<
  PoiRow,
  'id' | 'name' | 'latitude' | 'longitude' | 'radius_meters' | 'category' | 'linked_badge_id' | 'is_active'
>

interface PoiListProps {
  pois: PoiListRow[]
  badgeMap: Map<string, string>
  categoryLabelMap: Map<string, string>
}

export function PoiList({ pois, badgeMap, categoryLabelMap }: PoiListProps) {
  // `hidden md:block`으로 카드 그리드와 테이블을 둘 다 마운트하면 렌더 비용이 이중으로 든다
  // (20260826_011 A4) — 실제 뷰포트에 맞는 한쪽만 마운트한다.
  const isDesktop = useIsDesktop()
  if (isDesktop === null) return null

  if (!isDesktop) {
    return (
      <div className="grid grid-cols-1 gap-3">
        {pois.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/50 py-10 text-center">
            <p className="text-sm text-muted-foreground">등록된 POI가 없습니다.</p>
          </div>
        ) : (
          pois.map((poi) => (
            <PoiCard
              key={poi.id}
              poi={poi}
              linkedBadgeName={
                poi.linked_badge_id
                  ? badgeMap.get(poi.linked_badge_id)
                  : undefined
              }
              categoryLabel={categoryLabelMap.get(poi.category)}
            />
          ))
        )}
      </div>
    )
  }

  return <PoiTable pois={pois} badgeMap={badgeMap} categoryLabelMap={categoryLabelMap} />
}
