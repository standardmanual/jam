'use client'

import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Badge } from '@/components/admin/ui/badge'
import type { PoiRow } from '@/types/database'

const MapPreview = dynamic(() => import('./MapPreview'), {
  loading: () => <div className="h-64 bg-muted animate-pulse rounded" />,
  ssr: false,
})

interface PoiDetailProps {
  poi: PoiRow
  linkedBadgeName?: string
  /** 연결 배지의 deleted_at — 있으면 소프트 삭제(비활성화)된 배지다(20260830_1547).
   *  poi.linked_badge_id FK는 배지 삭제 시 정리되지 않아, 표시 단계에서 명시해야 한다. */
  linkedBadgeDeletedAt?: string | null
  categoryLabel?: string
}

/** "YYYY.MM.DD" 형식으로 날짜 포맷 (BadgeDetail.tsx·BadgeCard.tsx·BadgesTable.tsx와 동일 컨벤션) */
function formatYmd(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

export function PoiDetail({ poi, linkedBadgeName, linkedBadgeDeletedAt, categoryLabel }: PoiDetailProps) {
  return (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-2xl">{poi.name}</CardTitle>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                    poi.is_active ? 'bg-neutral-900/10 text-neutral-900' : 'bg-white text-neutral-500 border border-neutral-200'
                  }`}
                >
                  {poi.is_active ? '활성' : '비활성'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {categoryLabel || poi.category}
              </p>
            </div>
            {linkedBadgeName && (
              <div className="flex flex-col items-end gap-1">
                <Badge variant="outline">{linkedBadgeName}</Badge>
                {linkedBadgeDeletedAt && (
                  <span className="inline-flex items-center px-2 py-1 bg-red-50 border border-red-200 rounded-full text-red-600 text-xs font-semibold whitespace-nowrap">
                    비활성화됨 · {formatYmd(linkedBadgeDeletedAt)} 회수
                  </span>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">위도</p>
              <p className="font-mono text-sm">{poi.latitude.toFixed(6)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">경도</p>
              <p className="font-mono text-sm">{poi.longitude.toFixed(6)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">반경</p>
              <p className="text-sm">{poi.radius_meters}m</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">연결 배지</p>
              <p className="text-sm">
                {linkedBadgeName || '없음'}
              </p>
              {linkedBadgeName && linkedBadgeDeletedAt && (
                <span className="inline-flex items-center px-2 py-1 bg-red-50 border border-red-200 rounded-full text-red-600 text-xs font-semibold whitespace-nowrap">
                  비활성화됨 · {formatYmd(linkedBadgeDeletedAt)} 회수
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 지도 미리보기 (데스크톱 only) */}
      <div className="hidden md:block">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">지도 미리보기</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg overflow-hidden border border-border h-64 md:h-96">
              <MapPreview
                latitude={poi.latitude}
                longitude={poi.longitude}
                radius={poi.radius_meters}
                name={poi.name}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
