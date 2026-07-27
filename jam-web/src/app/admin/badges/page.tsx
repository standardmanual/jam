import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import type { BadgeRow, BadgeCondition, FactionRow } from '@/types/database'
import BadgesFilterBar from './BadgesFilterBar'
import Pagination from '../poi/Pagination'

const PAGE_SIZE = 30

const rarityColor: Record<string, string> = {
  common: 'text-[#6b7280]',
  rare: 'text-blue-600',
  legendary: 'text-violet-600',
  mythic: 'text-amber-600',
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', legendary: 'Legend', mythic: 'Mythic',
}

type BadgeCategory = 'basic' | 'hard' | 'composite' | 'retention'

const CATEGORY_META: Record<BadgeCategory, { label: string; cls: string }> = {
  basic: { label: '기본', cls: 'text-[#6b7280]' },
  hard: { label: '고난이도', cls: 'text-orange-600' },
  composite: { label: '복합속성', cls: 'text-cyan-400' },
  retention: { label: '리텐션', cls: 'text-pink-600' },
}

/**
 * condition_json 으로부터 배지 카테고리를 자동 판별한다.
 * - 리텐션: time_range+weekly_count / weekend_duration_hours / season+season_count
 * - 고난이도: monthly_km
 * - 복합속성: 독립 난이도 속성 2개 이상 (speed·distance·elevation·duration·temperature)
 * - 그 외: 기본
 */
function deriveBadgeCategory(cond: BadgeCondition | null): BadgeCategory {
  if (!cond) return 'basic'

  const isRetention =
    (cond.time_range != null && cond.weekly_count != null) ||
    cond.weekend_duration_hours != null ||
    (cond.season != null && cond.season_count != null)
  if (isRetention) return 'retention'

  if (cond.monthly_km != null) return 'hard'

  const difficultyAttrs = [
    cond.min_speed_kmh,
    cond.distance_km,
    cond.elevation_gain_m,
    cond.duration_minutes,
    cond.temperature_min_c,
    cond.temperature_max_c,
  ].filter((v) => v != null)
  if (difficultyAttrs.length >= 2) return 'composite'

  return 'basic'
}

const SEASON_SHORT: Record<string, string> = {
  spring: '봄', summer: '여름', fall: '가을', winter: '겨울', all: '전계절',
}

/** condition_json을 관리자 테이블용 짧은 요약 칩 목록으로 변환 */
function conditionSummary(c: BadgeCondition | null): string[] {
  if (!c) return []
  const chips: string[] = []
  if (c.distance_km !== undefined) chips.push(`누적 ${c.distance_km}km`)
  if (c.total_count !== undefined) chips.push(`${c.total_count}회`)
  if (c.streak_days !== undefined) chips.push(`${c.streak_days}일 연속`)
  if (c.elevation_gain_m !== undefined) chips.push(`고도 ${c.elevation_gain_m}m`)
  if (c.min_speed_kmh !== undefined) chips.push(`${c.min_speed_kmh}km/h+`)
  if (c.duration_minutes !== undefined) chips.push(`${c.duration_minutes}분+`)
  if (c.weekend_duration_hours !== undefined) chips.push(`주말 ${c.weekend_duration_hours}h`)
  if (c.weekly_count !== undefined) chips.push(`주 ${c.weekly_count}회`)
  if (c.monthly_km !== undefined) chips.push(`${c.month ? `${c.month}월 ` : '월간 '}${c.monthly_km}km`)
  else if (c.month !== undefined) chips.push(`${c.month}월`)
  if (c.season_count !== undefined && c.season) chips.push(`${SEASON_SHORT[c.season] ?? c.season} ${c.season_count}회`)
  if (c.temperature_min_c !== undefined) chips.push(`≥${c.temperature_min_c}°C`)
  if (c.temperature_max_c !== undefined) chips.push(`≤${c.temperature_max_c}°C`)
  if (c.time_range) chips.push(`${c.time_range.start}~${c.time_range.end}`)
  if (c.prerequisite_badge_names?.length) chips.push(`선행 ${c.prerequisite_badge_names.length}`)
  return chips
}

interface AdminBadgesPageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

export default async function AdminBadgesPage({ searchParams }: AdminBadgesPageProps) {
  const params = await searchParams
  const { activityType, type, rarity, sort } = params
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)

  const supabase = createServiceClient()

  // 필터·정렬·페이지네이션을 전부 DB 쿼리에서 처리한다(페이지 단위 조회이므로 JS 필터링 불가)
  let query = supabase.from('badges').select('*', { count: 'exact' }).is('deleted_at', null)
  if (activityType && activityType !== 'all') query = query.contains('activity_types', [activityType])
  if (type && type !== 'all') query = query.eq('type', type as BadgeRow['type'])
  if (rarity && rarity !== 'all') query = query.eq('rarity', rarity as BadgeRow['rarity'])

  if (sort === 'name_asc') query = query.order('name', { ascending: true })
  else if (sort === 'name_desc') query = query.order('name', { ascending: false })
  else query = query.order('created_at', { ascending: false })

  const from = (page - 1) * PAGE_SIZE
  query = query.range(from, from + PAGE_SIZE - 1)

  const [{ data: badgesRaw, count }, { count: totalCount }, { data: factionsRaw }] = await Promise.all([
    query,
    supabase.from('badges').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('factions').select('id, name'),
  ])

  const badges = (badgesRaw ?? []) as BadgeRow[]
  const factionMap = new Map(((factionsRaw ?? []) as Pick<FactionRow, 'id' | 'name'>[]).map((f) => [f.id, f.name]))
  const filteredCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">배지 관리</h1>
        <Link
          href="/admin/badges/new"
          className="bg-[#111111] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#242424] transition-colors text-sm"
        >
          + 배지 등록
        </Link>
      </div>

      <Suspense>
        <BadgesFilterBar total={totalCount ?? 0} filtered={filteredCount} />
      </Suspense>

      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
              <th className="px-5 py-3 font-medium">이미지</th>
              <th className="px-5 py-3 font-medium">이름</th>
              <th className="px-5 py-3 font-medium">타입</th>
              <th className="px-5 py-3 font-medium">희귀도</th>
              <th className="px-5 py-3 font-medium">카테고리</th>
              <th className="px-5 py-3 font-medium">세계관</th>
              <th className="px-5 py-3 font-medium">활동 종류</th>
              <th className="px-5 py-3 font-medium">조건</th>
              <th className="px-5 py-3 font-medium">패치</th>
            </tr>
          </thead>
          <tbody>
            {badges.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-[#898989]">
                  등록된 배지가 없습니다.
                </td>
              </tr>
            )}
            {badges.map((badge) => (
              <tr
                key={badge.id}
                className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa] transition-colors"
              >
                <td className="px-5 py-3">
                  <Link href={`/admin/badges/${badge.id}`}>
                    <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden">
                      {badge.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={badge.image_url}
                          alt={badge.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="text-[#898989] text-xs">—</span>
                      )}
                    </div>
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/badges/${badge.id}`}
                    className="font-medium hover:text-[#111111] transition-colors"
                  >
                    {badge.name}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[#374151]">{badge.type}</td>
                <td className={`px-5 py-3 font-medium ${rarityColor[badge.rarity] ?? ''}`}>
                  {RARITY_LABEL[badge.rarity] ?? badge.rarity}
                </td>
                <td className="px-5 py-3 text-xs">
                  {(() => {
                    const cat = CATEGORY_META[deriveBadgeCategory(badge.condition_json as BadgeCondition | null)]
                    return <span className={cat.cls}>{cat.label}</span>
                  })()}
                </td>
                <td className="px-5 py-3 text-[#374151] text-xs">
                  {badge.faction_id ? (factionMap.get(badge.faction_id) ?? '—') : '—'}
                </td>
                <td className="px-5 py-3 text-[#374151] text-xs">
                  {badge.activity_types?.join(', ') || '—'}
                </td>
                <td className="px-5 py-3">
                  {(() => {
                    const chips = conditionSummary(badge.condition_json as BadgeCondition | null)
                    if (chips.length === 0) return <span className="text-[#898989] text-xs">없음</span>
                    return (
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {chips.map((chip, i) => (
                          <span
                            key={i}
                            className="text-[#111111]/80 text-[11px] bg-[#111111]/10 rounded px-1.5 py-0.5 whitespace-nowrap"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    )
                  })()}
                </td>
                <td className="px-5 py-3">
                  {badge.patch_available ? (
                    <span className="text-emerald-600 text-xs">
                      {badge.patch_price_krw?.toLocaleString()}원
                    </span>
                  ) : (
                    <span className="text-[#898989] text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} searchParams={params} basePath="/admin/badges" />
    </div>
  )
}
