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
  categoryLabel?: string
}

export function PoiDetail({ poi, linkedBadgeName, categoryLabel }: PoiDetailProps) {
  return (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-2xl">{poi.name}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {categoryLabel || poi.category}
              </p>
            </div>
            {linkedBadgeName && (
              <Badge variant="outline">{linkedBadgeName}</Badge>
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
