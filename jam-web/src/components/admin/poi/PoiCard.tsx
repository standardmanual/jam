'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { PoiRow } from '@/types/database'

interface PoiCardProps {
  poi: PoiRow
  linkedBadgeName?: string
  categoryLabel?: string
}

export function PoiCard({ poi, linkedBadgeName, categoryLabel }: PoiCardProps) {
  return (
    <Link href={`/admin/poi/${poi.id}`}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="truncate text-base">{poi.name}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {categoryLabel || poi.category}
              </CardDescription>
            </div>
            {linkedBadgeName && (
              <Badge variant="outline" className="whitespace-nowrap text-xs">
                {linkedBadgeName}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">위치</span>
              <span className="font-mono">
                {poi.latitude.toFixed(4)}, {poi.longitude.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">반경</span>
              <span>{poi.radius_meters}m</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
