'use client'

import Link from 'next/link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { PoiListRow } from './PoiList'

interface PoiTableProps {
  pois: PoiListRow[]
  badgeMap: Map<string, string>
  categoryLabelMap: Map<string, string>
}

export function PoiTable({ pois, badgeMap, categoryLabelMap }: PoiTableProps) {
  if (pois.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 py-10 text-center">
        <p className="text-sm text-muted-foreground">등록된 POI가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">이름</TableHead>
            <TableHead className="font-semibold">카테고리</TableHead>
            <TableHead className="font-semibold">위도 / 경도</TableHead>
            <TableHead className="font-semibold">반경</TableHead>
            <TableHead className="font-semibold">연결 배지</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pois.map((poi) => (
            <TableRow
              key={poi.id}
              className="hover:bg-muted/50 transition-colors cursor-pointer"
            >
              <TableCell>
                <Link
                  href={`/admin/poi/${poi.id}`}
                  className="font-medium hover:underline"
                >
                  {poi.name}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {categoryLabelMap.get(poi.category) || poi.category}
              </TableCell>
              <TableCell className="text-xs font-mono">
                {poi.latitude.toFixed(4)}, {poi.longitude.toFixed(4)}
              </TableCell>
              <TableCell className="text-sm">{poi.radius_meters}m</TableCell>
              <TableCell className="text-sm">
                {poi.linked_badge_id
                  ? badgeMap.get(poi.linked_badge_id) || poi.linked_badge_id
                  : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
