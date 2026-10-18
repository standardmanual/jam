'use client'

import { PoiCard } from './PoiCard'
import { PoiTable } from './PoiTable'
import { useIsDesktop } from '@/lib/admin/use-is-desktop'
import type { PoiCategoryRow } from '@/types/database'
import type { PoiListRow } from '@/lib/admin/poi-list-query'

interface PoiListProps {
  pois: PoiListRow[]
  badgeMap: Map<string, string>
  categoryLabelMap: Map<string, string>
  /** 다중선택 카테고리 일괄변경 다이얼로그의 선택지 — 데스크톱 테이블에만 전달한다(20260907_1643) */
  categories: PoiCategoryRow[]
  /** 현재 필터 조건에 맞는 전체 건수(페이지당 건수가 아니다) — 전체 선택 배너에 쓴다(20260924_0941) */
  totalCount: number
}

export function PoiList({ pois, badgeMap, categoryLabelMap, categories, totalCount }: PoiListProps) {
  // `hidden md:block`으로 카드 그리드와 테이블을 둘 다 마운트하면 렌더 비용이 이중으로 든다
  // (20260826_011 A4) — 실제 뷰포트에 맞는 한쪽만 마운트한다.
  const isDesktop = useIsDesktop()
  if (isDesktop === null) return null

  if (!isDesktop) {
    return (
      <div className="grid grid-cols-1 gap-3">
        {pois.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/50 py-10 text-center">
            <p className="text-sm text-muted-foreground">등록된 장소가 없습니다.</p>
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

  return (
    <PoiTable
      pois={pois}
      badgeMap={badgeMap}
      categoryLabelMap={categoryLabelMap}
      categories={categories}
      totalCount={totalCount}
    />
  )
}
