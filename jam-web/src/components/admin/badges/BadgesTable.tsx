'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/shadcn-button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BadgeActiveToggleButton } from './BadgeActiveToggleButton'
import type { BadgeRow, BadgeCondition, BadgeRarity, FactionRow } from '@/types/database'
import { formatPaceSecPerKm } from '@/types/strava'

const RARITY_COLOR: Record<string, string> = {
  common: 'text-gray-600',
  rare: 'text-blue-600',
  legend: 'text-violet-600',
  mythic: 'text-amber-600',
}

const RARITY_LABEL: Record<BadgeRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  legend: 'Legend',
  mythic: 'Mythic',
}

const TYPE_LABEL: Record<string, string> = {
  activity: '활동',
  item: '아이템',
  poi: 'POI',
}

const SEASON_SHORT: Record<string, string> = {
  spring: '봄',
  summer: '여름',
  fall: '가을',
  winter: '겨울',
  all: '전계절',
}

const DAY_OF_WEEK_SHORT: Record<string, string> = {
  sunday: '일',
  monday: '월',
  tuesday: '화',
  wednesday: '수',
  thursday: '목',
  friday: '금',
  saturday: '토',
}

const WEEKDAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

/** "YYYY.MM.DD" 형식으로 날짜 포맷 */
function formatYmd(iso: string): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function dayOfWeekChip(days: string | string[]): string {
  if (typeof days === 'string') return `매주 ${DAY_OF_WEEK_SHORT[days] ?? days}`
  if (
    days.length === WEEKDAY_ORDER.length &&
    WEEKDAY_ORDER.every((d) => days.includes(d))
  ) {
    return '월~금 각각'
  }
  return days.map((d) => DAY_OF_WEEK_SHORT[d] ?? d).join('·')
}

/** condition_json을 간단한 칩 목록으로 변환 */
function conditionSummary(c: BadgeCondition | null): string[] {
  if (!c) return []
  const chips: string[] = []
  if (c.distance_km !== undefined) chips.push(`누적 ${c.distance_km}km`)
  if (c.total_count !== undefined) chips.push(`${c.total_count}회`)
  if (c.streak_days !== undefined) chips.push(`${c.streak_days}일 연속`)
  if (c.active_days_count !== undefined) chips.push(`누적 ${c.active_days_count}일`)
  if (c.elevation_gain_m !== undefined) chips.push(`고도 ${c.elevation_gain_m}m`)
  if (c.min_speed_kmh !== undefined) chips.push(`${c.min_speed_kmh}km/h+`)
  if (c.max_pace_sec_per_km !== undefined)
    chips.push(`${formatPaceSecPerKm(c.max_pace_sec_per_km)} 이내`)
  if (c.duration_minutes !== undefined) chips.push(`${c.duration_minutes}분+`)
  if (c.weekend_duration_hours !== undefined) chips.push(`주말 ${c.weekend_duration_hours}h`)
  if (c.weekly_count !== undefined) chips.push(`주 ${c.weekly_count}회`)
  if (c.day_of_week !== undefined) chips.push(dayOfWeekChip(c.day_of_week))
  if (c.monthly_km !== undefined)
    chips.push(`${c.month ? `${[c.month].flat().join('·')}월 ` : '월간 '}${c.monthly_km}km`)
  else if (c.month !== undefined) chips.push(`${[c.month].flat().join('·')}월`)
  if (c.season_count !== undefined && c.season)
    chips.push(`${SEASON_SHORT[c.season] ?? c.season} ${c.season_count}회`)
  if (c.season_count_all !== undefined) chips.push(`4계절 각 ${c.season_count_all}회`)
  if (c.temperature_min_c !== undefined) chips.push(`≥${c.temperature_min_c}°C`)
  if (c.temperature_max_c !== undefined) chips.push(`≤${c.temperature_max_c}°C`)
  if (c.time_range) chips.push(`${c.time_range.start}~${c.time_range.end}`)
  return chips
}

interface BadgesTableProps {
  badges: BadgeRow[]
  factionMap?: Map<string, string>
}

export default function BadgesTable({ badges, factionMap = new Map() }: BadgesTableProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="w-12">이미지</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>타입</TableHead>
            <TableHead>희귀도</TableHead>
            <TableHead>세계관</TableHead>
            <TableHead>활동</TableHead>
            <TableHead>조건</TableHead>
            <TableHead>패치</TableHead>
            <TableHead className="w-40">액션</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {badges.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                등록된 배지가 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            badges.map((badge) => (
              <TableRow key={badge.id} className="hover:bg-gray-50">
                {/* 이미지 */}
                <TableCell>
                  <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                    {badge.image_url ? (
                      <Image
                        src={badge.image_url}
                        alt={badge.name}
                        width={40}
                        height={40}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </div>
                </TableCell>

                {/* 이름 */}
                <TableCell className="font-medium">{badge.name}</TableCell>

                {/* 상태 */}
                <TableCell className="text-sm">
                  {badge.deleted_at ? (
                    <span className="inline-flex items-center px-2 py-1 bg-red-50 border border-red-200 rounded-full text-red-600 text-xs font-semibold whitespace-nowrap">
                      비활성화됨 · {formatYmd(badge.deleted_at)} 회수
                    </span>
                  ) : (
                    <span className="text-gray-500 text-xs">활성</span>
                  )}
                </TableCell>

                {/* 타입 */}
                <TableCell className="text-sm">
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                    {TYPE_LABEL[badge.type] || badge.type}
                  </span>
                </TableCell>

                {/* 희귀도 */}
                <TableCell>
                  <span className={`font-semibold text-sm ${RARITY_COLOR[badge.rarity] || ''}`}>
                    {RARITY_LABEL[badge.rarity as BadgeRarity] || badge.rarity}
                  </span>
                </TableCell>

                {/* 세계관 */}
                <TableCell className="text-sm">
                  {badge.faction_id ? (factionMap.get(badge.faction_id) ?? '—') : '—'}
                </TableCell>

                {/* 활동 종류 */}
                <TableCell className="text-sm">
                  {badge.activity_types?.length ? badge.activity_types.join(', ') : '—'}
                </TableCell>

                {/* 조건 */}
                <TableCell>
                  {(() => {
                    const chips = conditionSummary(badge.condition_json as BadgeCondition | null)
                    if (chips.length === 0) return <span className="text-gray-500 text-xs">없음</span>
                    return (
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {chips.slice(0, 2).map((chip, i) => (
                          <span
                            key={i}
                            className="text-xs bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 whitespace-nowrap"
                          >
                            {chip}
                          </span>
                        ))}
                        {chips.length > 2 && (
                          <span className="text-xs text-gray-500">+{chips.length - 2}</span>
                        )}
                      </div>
                    )
                  })()}
                </TableCell>

                {/* 패치 */}
                <TableCell className="text-sm">
                  {badge.patch_available ? (
                    <span className="text-emerald-600 font-medium">
                      {badge.patch_price_krw?.toLocaleString()}원
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </TableCell>

                {/* 액션 */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <BadgeActiveToggleButton badgeId={badge.id} isActive={!badge.deleted_at} />
                    <Link href={`/admin/badges/${badge.id}`}>
                      <Button variant="outline" size="sm" className="h-8">
                        상세보기
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
