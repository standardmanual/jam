'use client'

import { PoiCard } from './PoiCard'
import { PoiTable } from './PoiTable'
import type { PoiRow } from '@/types/database'

interface PoiListProps {
  pois: PoiRow[]
  badgeMap: Map<string, string>
  categoryLabelMap: Map<string, string>
}

export function PoiList({ pois, badgeMap, categoryLabelMap }: PoiListProps) {
  return (
    <>
      {/* 모바일: 카드 그리드 */}
      <div className="block md:hidden space-y-3">
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
      </div>

      {/* 데스크톱: 테이블 */}
      <div className="hidden md:block">
        <PoiTable pois={pois} badgeMap={badgeMap} categoryLabelMap={categoryLabelMap} />
      </div>
    </>
  )
}
