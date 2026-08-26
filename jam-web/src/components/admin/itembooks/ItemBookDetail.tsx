'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { Badge } from '@/components/admin/ui/badge'
import type { ItemBookRow } from '@/types/database'

interface ItemBookDetailProps {
  itemBook: ItemBookRow
  requiredActivityBadgeName?: string
  rewardBadgeName?: string
  factionName?: string
  itemBadgeCount?: number
}

export function ItemBookDetail({
  itemBook,
  requiredActivityBadgeName,
  rewardBadgeName,
  factionName,
  itemBadgeCount = 0,
}: ItemBookDetailProps) {
  return (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-2xl">{itemBook.name}</CardTitle>
              {factionName && (
                <p className="text-sm text-muted-foreground mt-1">{factionName}</p>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {itemBook.description && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">설명</p>
              <p className="text-sm">{itemBook.description}</p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">필수 액티비티 배지</p>
              <p className="text-sm">
                {requiredActivityBadgeName ? (
                  <Badge variant="outline">{requiredActivityBadgeName}</Badge>
                ) : (
                  '없음'
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">아이템 배지 수</p>
              <p className="text-sm font-semibold">{itemBadgeCount}개</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">보상 배지</p>
              <p className="text-sm">
                {rewardBadgeName ? (
                  <Badge>{rewardBadgeName}</Badge>
                ) : (
                  '없음'
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
