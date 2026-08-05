'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn-card'
import { Badge } from '@/components/ui/shadcn-badge'
import type { ItemBookRow } from '@/types/database'

interface ItemBookCardProps {
  itemBook: ItemBookRow
  requiredActivityBadgeName?: string
  rewardBadgeName?: string
  factionName?: string
  itemBadgeCount?: number
}

export function ItemBookCard({
  itemBook,
  requiredActivityBadgeName,
  rewardBadgeName,
  factionName,
  itemBadgeCount = 0,
}: ItemBookCardProps) {
  return (
    <Link href={`/admin/itembooks/${itemBook.id}`}>
      <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="truncate text-base">{itemBook.name}</CardTitle>
              {factionName && (
                <CardDescription className="text-xs mt-1">
                  {factionName}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {itemBook.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {itemBook.description}
            </p>
          )}
          <div className="space-y-1 text-xs">
            {requiredActivityBadgeName && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">필수 배지</span>
                <Badge variant="outline" className="whitespace-nowrap text-xs">
                  {requiredActivityBadgeName}
                </Badge>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">아이템 배지</span>
              <span>{itemBadgeCount}개</span>
            </div>
            {rewardBadgeName && (
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">보상 배지</span>
                <Badge className="whitespace-nowrap text-xs">
                  {rewardBadgeName}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
