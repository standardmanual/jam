'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/shadcn-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/shadcn-card'
import { BadgeActiveToggleButton } from './BadgeActiveToggleButton'
import type { BadgeCondition, BadgeRarity } from '@/types/database'
import type { BadgeListRow } from './BadgeList'
import { badgeTypeLabel } from '@/lib/admin/badge-labels'

const RARITY_BADGE_COLOR: Record<string, string> = {
  common: 'bg-gray-200 text-gray-800',
  rare: 'bg-blue-200 text-blue-800',
  legend: 'bg-violet-200 text-violet-800',
  mythic: 'bg-amber-200 text-amber-800',
}

const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  legend: 'Legend',
  mythic: 'Mythic',
}

/** "YYYY.MM.DD" 형식으로 날짜 포맷 */
function formatYmd(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

interface BadgeCardProps {
  badge: BadgeListRow
}

export default function BadgeCard({ badge }: BadgeCardProps) {
  const condition = badge.condition_json as BadgeCondition | null
  const hasCondition = condition && Object.keys(condition).length > 0

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex gap-3">
          {/* 배지 이미지 */}
          <div className="w-12 h-12 md:w-14 md:h-14 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
            {badge.image_url ? (
              <Image
                src={badge.image_url}
                alt={badge.name}
                width={48}
                height={48}
                className="w-full h-full object-contain"
              />
            ) : (
              <span className="text-gray-400 text-xs">—</span>
            )}
          </div>

          {/* 타입, 희귀도 배지 */}
          <div className="flex flex-col justify-between flex-1">
            <div className="flex gap-2 flex-wrap">
              <span className="inline-block px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-700 rounded">
                {badgeTypeLabel(badge.type)}
              </span>
              <span
                className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                  RARITY_BADGE_COLOR[badge.rarity] || 'bg-gray-100 text-gray-700'
                }`}
              >
                {RARITY_LABEL[badge.rarity as BadgeRarity] || badge.rarity}
              </span>
              {badge.deleted_at && (
                <span className="inline-block px-2 py-1 text-xs font-semibold bg-red-50 border border-red-200 text-red-600 rounded-full whitespace-nowrap">
                  비활성화됨 · {formatYmd(badge.deleted_at)} 회수
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 배지 이름 */}
        <CardTitle className="text-base md:text-lg mt-3 line-clamp-2">{badge.name}</CardTitle>
      </CardHeader>

      <CardContent className="flex-1 pb-3">
        {/* 설명 */}
        <CardDescription className="line-clamp-2 text-xs md:text-sm mb-3">
          {badge.description || '설명 없음'}
        </CardDescription>

        {/* 조건, 패치 정보 */}
        <div className="space-y-2 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">조건:</span>
            <span className="font-medium">
              {hasCondition ? '○' : '✕'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600">패치:</span>
            <span className="font-medium">
              {badge.patch_available
                ? `${badge.patch_price_krw?.toLocaleString()}원`
                : '불가'}
            </span>
          </div>
        </div>
      </CardContent>

      {/* 액션 버튼 */}
      <div className="px-4 py-3 border-t flex gap-2">
        <BadgeActiveToggleButton badgeId={badge.id} isActive={!badge.deleted_at} className="h-11 md:h-10" />
        <Link href={`/admin/badges/${badge.id}`} className="flex-1">
          <Button variant="default" className="w-full h-11 md:h-10">
            상세보기
          </Button>
        </Link>
      </div>
    </Card>
  )
}
