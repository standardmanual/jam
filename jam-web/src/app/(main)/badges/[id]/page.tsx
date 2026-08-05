import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ActivityType, BadgeCondition, BadgeRow, ItemBookRow, PoiRow, UserActivityBadgeRow, UserPoiBadgeEarnRow } from '@/types/database'
import RarityBadge from '@/components/ui/badge'
import Card from '@/components/ui/card'
import TopNav from '@/components/ui/topnav'
import { MedalIcon, BookIcon, ChevronRightIcon } from '@/components/ui/icons'
import Link from 'next/link'
import PoiMapButton from './PoiMapButton'
import LocalDate from '@/components/LocalDate'
import InventoryItemHistorySheet from '../../inventory/[itemId]/InventoryItemHistorySheet'
import { d, t } from '@/lib/i18n'
import { formatPaceSecPerKm } from '@/types/strava'

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  cycling: '자전거 타기',
  running: '러닝',
  trail_running: '트레일러닝',
  hiking: '하이킹',
  walking: '걷기',
}

const SEASON_LABELS: Record<string, string> = {
  spring: '봄(3~5월)',
  summer: '여름(6~8월)',
  fall: '가을(9~11월)',
  winter: '겨울(12~2월)',
  all: '전 계절',
}

const MONTH_LABELS: Record<number, string> = {
  1: '1월', 2: '2월', 3: '3월', 4: '4월', 5: '5월', 6: '6월',
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
}

// "HH:MM" 시작 시간을 사람이 읽기 쉬운 시간대 이름으로 변환
function timeSlotLabel(start: string): string {
  const [h] = start.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  if (h >= 4 && h < 8) return '새벽'
  if (h >= 8 && h < 11) return '아침'
  if (h >= 11 && h < 14) return '점심'
  if (h >= 14 && h < 18) return '오후'
  if (h >= 18 && h < 22) return '저녁'
  return '심야'
}

function formatConditionText(condition: BadgeCondition | null): string {
  if (!condition || Object.keys(condition).length === 0) {
    return '관리자가 직접 발급하는 배지예요.'
  }

  const actType = condition.activity_type ? ACTIVITY_LABELS[condition.activity_type] : '활동'
  const parts: string[] = []

  if (condition.distance_km !== undefined) {
    parts.push(`${actType}으로 누적 ${condition.distance_km}km 이상 달성`)
  }
  if (condition.total_count !== undefined) {
    parts.push(`${actType} ${condition.total_count}회 이상 완료`)
  }
  if (condition.streak_days !== undefined) {
    parts.push(`${condition.streak_days}일 연속으로 활동 완료`)
  }
  if (condition.elevation_gain_m !== undefined) {
    parts.push(`누적 고도 상승 ${condition.elevation_gain_m}m 이상 달성`)
  }
  if (condition.min_speed_kmh !== undefined) {
    parts.push(`단일 ${actType} 활동의 평균 속도 ${condition.min_speed_kmh}km/h 이상`)
  }
  if (condition.max_pace_sec_per_km !== undefined) {
    parts.push(`단일 ${actType} 활동의 평균 페이스 ${formatPaceSecPerKm(condition.max_pace_sec_per_km)} 이내`)
  }
  if (condition.duration_minutes !== undefined) {
    parts.push(`단일 ${actType} 활동 ${condition.duration_minutes}분 이상 이동`)
  }
  if (condition.weekend_duration_hours !== undefined) {
    parts.push(`주말 ${actType} 활동 ${condition.weekend_duration_hours}시간 이상 이동`)
  }
  if (condition.weekly_count !== undefined) {
    parts.push(`한 주에 ${actType} ${condition.weekly_count}회 이상 완료`)
  }
  if (condition.monthly_km !== undefined) {
    const monthLabel = condition.month ? `${MONTH_LABELS[condition.month] ?? `${condition.month}월`} 한 달간` : '한 달간'
    parts.push(`${monthLabel} ${actType}으로 ${condition.monthly_km}km 이상 달성`)
  } else if (condition.month !== undefined) {
    parts.push(`${MONTH_LABELS[condition.month] ?? `${condition.month}월`}에 ${actType} 활동 완료`)
  }
  if (condition.season_count !== undefined && condition.season) {
    parts.push(`${SEASON_LABELS[condition.season] ?? condition.season}에 ${actType} ${condition.season_count}회 이상 완료`)
  }
  if (condition.temperature_min_c !== undefined) {
    parts.push(`활동 중 기온이 ${condition.temperature_min_c}°C 이상인 조건에서 ${actType} 완료`)
  }
  if (condition.temperature_max_c !== undefined) {
    parts.push(`활동 중 기온이 ${condition.temperature_max_c}°C 이하인 조건에서 ${actType} 완료`)
  }
  if (condition.time_range) {
    const { start, end } = condition.time_range
    const slot = timeSlotLabel(start)
    parts.push(`${slot ? `${slot} 시간대(${start}~${end})` : `${start}~${end} 시간대`}에 ${actType} 활동`)
  }
  if (parts.length === 0) {
    return '관리자가 직접 발급하는 배지예요.'
  }

  // 서로 다른 활동에서 각각 달성해도 인정되는 속성 조건이 2개 이상이면 안내 추가
  const perActivityAttrs = [
    condition.min_speed_kmh,
    condition.max_pace_sec_per_km,
    condition.duration_minutes,
    condition.elevation_gain_m,
    condition.temperature_min_c,
    condition.temperature_max_c,
  ].filter((v) => v !== undefined).length
  const crossAttrNote = perActivityAttrs >= 2
    ? ' (각 조건은 서로 다른 활동에서 달성해도 인정돼요)'
    : ''

  return parts.join(', ') + '하면 획득할 수 있어요.' + crossAttrNote
}

interface BadgeDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ u?: string }>
}

export default async function BadgeDetailPage({ params, searchParams }: BadgeDetailPageProps) {
  const { id } = await params
  const { u } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // ?u=username — 다른 유저의 프로필/피드에서 진입한 경우 그 유저 기준으로 획득 정보를 보여준다
  // user_activity_badges는 RLS로 본인 행만 조회 가능해서, 다른 유저 조회는 service client 필요
  const service = createServiceClient()
  let subjectId = user.id
  let subjectUsername: string | null = null
  if (u) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: subjectRaw } = await (service as any)
      .from('users')
      .select('id, username')
      .eq('username', u.toLowerCase())
      .maybeSingle()
    if (subjectRaw) {
      subjectId = (subjectRaw as { id: string; username: string }).id
      subjectUsername = (subjectRaw as { id: string; username: string }).username
    }
  }
  const isOwnBadge = subjectId === user.id

  const [{ data: badge }, { data: earnedRow }, { data: ownedBadgesRaw }] = await Promise.all([
    supabase.from('badges').select('*').eq('id', id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_activity_badges')
      .select('*, poi:triggered_by_poi_id(id, name, latitude, longitude)')
      .eq('user_id', subjectId)
      .eq('badge_id', id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_activity_badges').select('badge_id').eq('user_id', subjectId),
  ])

  if (!badge) notFound()

  const badgeRow = badge as BadgeRow
  const earned = earnedRow as (UserActivityBadgeRow & { poi: PoiRow | null }) | null

  // Phase 16: poi 타입 배지는 반복 획득 가능 — 단건이 아니라 이력 전체를 최신순으로 조회
  let poiEarns: (UserPoiBadgeEarnRow & { poi: PoiRow | null })[] = []
  if (badgeRow.type === 'poi') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: poiEarnsRaw } = await (service as any)
      .from('user_poi_badge_earns')
      .select('*, poi:poi_id(id, name, latitude, longitude)')
      .eq('user_id', subjectId)
      .eq('badge_id', id)
      .order('earned_at', { ascending: false })
    poiEarns = (poiEarnsRaw ?? []) as (UserPoiBadgeEarnRow & { poi: PoiRow | null })[]
  }

  // item 타입(아이템배지)은 activity 조건이 아니라 인벤토리 소유(inventory_items)로 판정된다 —
  // user_activity_badges에는 기록되지 않으므로, 아이템북에 슬롯팅했든 인벤토리에만 있든
  // 물리적으로 소유 중이면 실제로 획득한 것으로 취급해야 한다.
  type ItemInventoryInfo = {
    id: string
    serial_number: number
    serial_prefix: string | null
    obtained_at: string
    expires_at: string | null
    obtained_by: string
  }
  let itemInventory: ItemInventoryInfo | null = null
  let itemBook: ItemBookRow | null = null
  if (badgeRow.type === 'item') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: subjectInventory } = await (service as any)
      .from('inventory')
      .select('id')
      .eq('user_id', subjectId)
      .maybeSingle()
    if (subjectInventory) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: itemRaw } = await (service as any)
        .from('inventory_items')
        .select('id, serial_number, serial_prefix, obtained_at, expires_at, obtained_by')
        .eq('inventory_id', (subjectInventory as { id: string }).id)
        .eq('badge_id', id)
        .is('dropped_at', null)
        .order('obtained_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      itemInventory = itemRaw as ItemInventoryInfo | null
    }

    if (badgeRow.item_book_id) {
      const { data: itemBookRaw } = await supabase
        .from('item_books')
        .select('*')
        .eq('id', badgeRow.item_book_id)
        .maybeSingle()
      itemBook = itemBookRaw as ItemBookRow | null
    }
  }

  // 획득 여부 — poi 타입은 이력 1건 이상, item 타입은 인벤토리 소유 여부, 그 외는 기존 단건 조회 결과
  const hasEarned =
    badgeRow.type === 'poi'
      ? poiEarns.length > 0
      : badgeRow.type === 'item'
        ? itemInventory != null
        : Boolean(earned)

  // 선행 배지 정보 조회
  const prereqs = badgeRow.condition_json?.prerequisite_badge_names ?? []
  let prereqStatus: {
    id: string
    name: string
    image_url: string | null
    description: string | null
    rarity: string
    owned: boolean
  }[] = []
  if (prereqs.length > 0) {
    const ownedBadgeIds = new Set((ownedBadgesRaw ?? []).map((b: { badge_id: string }) => b.badge_id))
    const { data: prereqBadgesRaw } = await supabase
      .from('badges')
      .select('id, name, image_url, description, rarity')
      .in('name', prereqs)
    const prereqBadges = (prereqBadgesRaw ?? []) as {
      id: string
      name: string
      image_url: string | null
      description: string | null
      rarity: string
    }[]
    prereqStatus = prereqs.map((name) => {
      const match = prereqBadges.find((b) => b.name === name)
      return {
        id: match?.id ?? '',
        name,
        image_url: match?.image_url ?? null,
        description: match?.description ?? null,
        rarity: match?.rarity ?? 'common',
        owned: match ? ownedBadgeIds.has(match.id) : false,
      }
    })
  }

  // triggered_by_poi_id join 결과(활동 배지) 또는 최근 POI 획득 이력의 POI
  const poi: PoiRow | null = earned?.poi ?? poiEarns[0]?.poi ?? null

  // 아이템배지는 activity/poi 배지와 조건 구조가 완전히 달라 인벤토리 상세(/inventory/[itemId])와
  // 동일한 화면 구성(일련번호/획득방법/획득일/만료일 카드)으로 보여준다. 소유 여부에 따라
  // 값만 채워지거나 비어 보이도록(—) 하고, 레이아웃 자체는 항상 동일하게 유지한다.
  if (badgeRow.type === 'item') {
    const OBTAIN_LABELS: Record<string, string> = {
      drop: d.inventory.obtainByDrop,
      drop_event: d.inventory.obtainByDropEvent,
      pickup: d.inventory.obtainByPickup,
      system: d.inventory.obtainBySystem,
      system_event: d.inventory.obtainBySystem,
    }
    const expiresAt = itemInventory?.expires_at ?? null
    const expiring = isExpiringSoon(expiresAt)
    const serial = itemInventory
      ? `${itemInventory.serial_prefix ?? '????'}${String(itemInventory.serial_number).padStart(6, '0')}`
      : null

    return (
      <div className="min-h-full bg-surface text-text">
        <TopNav title={d.common.back} backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined} />

        <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-32)]">
          {/* 배지 이미지 */}
          <div className="flex flex-col items-center mb-[var(--spacing-24)]">
            <div
              className={[
                'w-32 h-32 rounded-[var(--radius-cards)] overflow-hidden bg-surface-inverse shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center mb-[var(--spacing-16)]',
                !hasEarned ? 'grayscale opacity-50' : '',
              ].join(' ')}
            >
              {badgeRow.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={badgeRow.image_url} alt={badgeRow.name} className="object-contain w-full h-full p-3" />
              ) : (
                <MedalIcon className="w-12 h-12 text-text-inverse/40" />
              )}
            </div>
            <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] text-center mb-2">{badgeRow.name}</h1>
            <div className="flex items-center gap-2">
              <RarityBadge rarity={badgeRow.rarity} />
              {serial ? (
                <span className="text-text/40 text-[11px] font-mono">{serial}</span>
              ) : (
                <span className="text-[10px] leading-none px-1.5 py-0.5 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border)] text-text/50">
                  {d.badges.notEarnedTag}
                </span>
              )}
            </div>
          </div>

          {/* 정보 카드 */}
          <Card className="p-0 overflow-hidden mb-[var(--spacing-16)]">
            <div className="px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
              <p className="text-[10px] uppercase text-text-inverse/50">{d.inventory.infoSectionTitle}</p>
            </div>
            <div>
              <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.serialNumber}</span>
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-mono tracking-widest">{serial ?? '—'}</span>
              </div>
              {itemInventory && isOwnBadge ? (
                <InventoryItemHistorySheet itemId={itemInventory.id} obtainedBy={itemInventory.obtained_by} />
              ) : (
                <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.obtainMethod}</span>
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
                    {itemInventory ? (OBTAIN_LABELS[itemInventory.obtained_by] ?? d.inventory.obtainBySystem) : '—'}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.obtainedAt}</span>
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
                  {itemInventory ? (
                    <LocalDate iso={itemInventory.obtained_at} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} />
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.expiresAt}</span>
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
                  {itemInventory ? (
                    expiresAt ? (
                      <LocalDate iso={expiresAt} options={{ year: 'numeric', month: '2-digit', day: '2-digit' }} />
                    ) : (
                      d.inventory.expiresNone
                    )
                  ) : (
                    '—'
                  )}
                  {expiring && ` · ${d.inventory.expiringSoonTitle}`}
                </span>
              </div>
              <div className="flex justify-between items-center px-[var(--spacing-16)] py-[var(--spacing-16)]">
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/50">{d.inventory.rarity}</span>
                <RarityBadge rarity={badgeRow.rarity} />
              </div>
            </div>
          </Card>

          {/* 배지 설명 */}
          <Card className="p-0 overflow-hidden">
            <div className="px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
              <p className="text-[10px] uppercase text-text-inverse/50">{d.inventory.descSectionTitle}</p>
            </div>
            <div className="px-[var(--spacing-16)] py-[var(--spacing-16)]">
              <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/80">
                {badgeRow.description || d.inventory.noDescription}
              </p>
            </div>
          </Card>

          {/* 연결된 아이템북 */}
          {itemBook && (
            <Link href={`/itembooks/${itemBook.id}${!isOwnBadge && subjectUsername ? `?u=${subjectUsername}` : ''}`}>
              <Card className="mt-[var(--spacing-16)] flex items-center gap-[var(--spacing-16)] active:scale-[0.98] transition-transform duration-100">
                {itemBook.image_url ? (
                  <div className="w-11 h-11 rounded-[var(--radius-cards)] overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border-inverse)] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={itemBook.image_url} alt={itemBook.name} className="w-full h-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center shrink-0">
                    <BookIcon className="w-5 h-5 text-text-inverse/50" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase text-text-inverse/50">{d.inventory.belongsToItembook}</p>
                  <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">{itemBook.name}</p>
                </div>
                <ChevronRightIcon className="w-4 h-4 text-text-inverse/30 shrink-0" />
              </Card>
            </Link>
          )}

          {expiring && (
            <Card className="mt-[var(--spacing-16)]">
              <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.inventory.expiringSoonTitle}</p>
              <p className="text-[11px] text-text-inverse/60 mt-0.5">{d.inventory.expiringSoonBody}</p>
            </Card>
          )}

          {/* 미보유 안내 */}
          {!hasEarned && (
            <Card className="mt-[var(--spacing-16)] text-center py-[var(--spacing-16)]">
              <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{d.badges.notEarnedTitle}</p>
              <p className="text-[11px] text-text-inverse/40 mt-1">{d.badges.notEarnedBody}</p>
            </Card>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.common.back} backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined} />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-32)] flex flex-col gap-[var(--spacing-24)]">
        {/* 배지 이미지 (대형) */}
        <div className="flex flex-col items-center gap-[var(--spacing-16)] py-[var(--spacing-16)]">
          <div
            className={[
              'w-44 h-44 rounded-[var(--radius-cards)] bg-surface-inverse shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center overflow-hidden',
              !hasEarned ? 'grayscale opacity-50' : '',
            ].join(' ')}
          >
            {badgeRow.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={badgeRow.image_url} alt={badgeRow.name} className="w-full h-full object-contain p-[var(--spacing-16)]" />
            ) : (
              <MedalIcon className="w-16 h-16 text-text-inverse/40" />
            )}
          </div>

          <div className="text-center">
            <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)] mb-2">{badgeRow.name}</h1>
            <RarityBadge rarity={badgeRow.rarity} />
          </div>
        </div>

        {/* 배지 설명 */}
        <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/70 px-1">{badgeRow.description}</p>

        {/* 잼 포인트 안내 — 이 배지에 포인트가 붙어 있을 때만 */}
        {badgeRow.point_reward > 0 && (
          <Card>
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
              {hasEarned
                ? t(d.badges.pointRewardEarned, { points: badgeRow.point_reward.toLocaleString('ko-KR') })
                : t(d.badges.pointRewardPending, { points: badgeRow.point_reward.toLocaleString('ko-KR') })}
            </p>
          </Card>
        )}

        {/* 선행 배지 조건 (prerequisite) */}
        {prereqStatus.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="px-[var(--spacing-16)] py-[var(--spacing-16)] shadow-[inset_0_-1px_0_0_var(--color-border-inverse)]">
              <p className="text-[10px] uppercase text-text-inverse/50">{d.badges.prerequisiteTitle}</p>
            </div>
            <div className="px-[var(--spacing-16)] py-[var(--spacing-16)]">
              <p className="text-[11px] text-text-inverse/60 mb-[var(--spacing-16)]">{d.badges.prerequisiteBody}</p>
              <div className="flex flex-col gap-[var(--spacing-16)]">
                {prereqStatus.map((p) => (
                  <Link key={p.id} href={`/badges/${p.id}${!isOwnBadge && subjectUsername ? `?u=${subjectUsername}` : ''}`}>
                    <div className="flex items-center gap-[var(--spacing-12)] rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] p-[var(--spacing-12)] active:scale-[0.98] transition-transform duration-100">
                      {/* 배지 이미지 */}
                      <div
                        className={[
                          'w-12 h-12 rounded-[var(--radius-cards)] bg-surface-inverse shadow-[inset_0_0_0_1px_var(--color-border-inverse)] flex items-center justify-center shrink-0 overflow-hidden',
                          !p.owned ? 'grayscale opacity-50' : '',
                        ].join(' ')}
                      >
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-2" />
                        ) : (
                          <MedalIcon className="w-5 h-5 text-text-inverse/40" />
                        )}
                      </div>

                      {/* 배지 정보 */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-medium truncate">
                          {p.name}
                        </h3>
                        <p className="text-[11px] text-text-inverse/60 line-clamp-2 mt-0.5">
                          {p.description || '선행 배지'}
                        </p>
                      </div>

                      {/* 링크 표시 */}
                      <div className="flex items-center gap-1 shrink-0">
                        {p.owned && (
                          <span className="text-[10px] text-text-inverse/40 font-medium">획득함</span>
                        )}
                        <ChevronRightIcon className="w-4 h-4 text-text-inverse/30" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* 획득 조건 — POI 배지는 하단 안전 안내 문구로 대체하므로 표시하지 않는다 */}
        {badgeRow.type !== 'poi' && (
          <Card>
            <h2 className="text-[10px] uppercase text-text-inverse/40 mb-2">{d.badges.conditionTitle}</h2>
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/80">
              {formatConditionText(badgeRow.condition_json)}
            </p>
          </Card>
        )}

        {/* 획득 이력 (poi 타입 — 반복 획득) */}
        {badgeRow.type === 'poi' && poiEarns.length > 0 && (
          <Card>
            <div className="flex items-baseline justify-between mb-[var(--spacing-16)]">
              <h2 className="text-[10px] uppercase text-text-inverse/50">{d.badges.earnHistoryTitle}</h2>
              <span className="text-[11px] text-text-inverse/60">{t(d.badges.earnHistoryCount, { count: poiEarns.length })}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {poiEarns.map((e) => (
                <li key={e.id} className="rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] px-[var(--spacing-16)] py-2 flex flex-col gap-1">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate">
                      {e.poi?.name ?? d.badges.earnHistoryUnknownPlace}
                    </span>
                    <span className="text-[11px] text-text-inverse/60 shrink-0">
                      <LocalDate iso={e.earned_at} options={{ year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }} />
                    </span>
                  </div>
                  {e.triggered_by_activity_name && (
                    <span className="text-[11px] text-text-inverse/50 truncate">{e.triggered_by_activity_name}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* 획득 정보 */}
        {earned && (
          <Card>
            <h2 className="text-[10px] uppercase text-text-inverse/50 mb-[var(--spacing-16)]">{d.badges.earnInfoTitle}</h2>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{d.badges.earnedAt}</span>
                <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]"><LocalDate iso={earned.earned_at} options={{ year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }} /></span>
              </div>
              {earned.triggered_by_activity_name && (
                <div className="flex justify-between items-center">
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{d.badges.triggerActivity}</span>
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] truncate max-w-[180px] text-right">
                    {earned.triggered_by_activity_name}
                  </span>
                </div>
              )}
              {earned.triggered_by_distance_km && (
                <div className="flex justify-between items-center">
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{d.badges.triggerDistance}</span>
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{t(d.badges.triggerDistanceValue, { km: earned.triggered_by_distance_km })}</span>
                </div>
              )}
              {earned.triggered_by_activity_date && (
                <div className="flex justify-between items-center">
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{d.badges.triggerDate}</span>
                  <span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
                    <LocalDate iso={earned.triggered_by_activity_date} options={{ year: 'numeric', month: 'long', day: 'numeric' }} />
                  </span>
                </div>
              )}
              {earned.triggered_by_strava_id && (
                <a
                  href={`https://www.strava.com/activities/${earned.triggered_by_strava_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center justify-center w-full min-h-11 rounded-[var(--radius-nav-buttons)] text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] active:scale-95 transition-transform duration-100"
                >
                  {d.badges.viewOnStrava} ↗
                </a>
              )}
            </div>
          </Card>
        )}

        {/* POI 위치 보기 — 박스 없이 버튼만 노출 */}
        {poi && <PoiMapButton lat={poi.latitude} lng={poi.longitude} poiName={poi.name} />}

        {/* 액션 버튼들 */}
        <div className="flex flex-col gap-[var(--spacing-16)]">
          {badgeRow.patch_available && (
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full min-h-11 rounded-[var(--radius-nav-buttons)] text-[length:var(--text-body)] leading-[var(--leading-body)] shadow-[inset_0_0_0_1px_var(--color-border)] active:scale-95 transition-transform duration-100"
            >
              {d.badges.physicalPatchButton} ↗
            </a>
          )}
        </div>

        {/* 미획득 안내 */}
        {!hasEarned && (
          <Card className="text-center py-[var(--spacing-16)]">
            <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/60">{d.badges.notEarnedTitle}</p>
            <p className="text-[11px] text-text-inverse/40 mt-1">{d.badges.notEarnedBody}</p>
          </Card>
        )}

        {/* POI 배지 안전 안내 — 반경 50m 동선 조건 + 무리한 접근 자제 요청 */}
        {badgeRow.type === 'poi' && (
          <p className="text-center text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/50 px-[var(--spacing-16)]">
            {d.badges.poiSafetyNotice}
          </p>
        )}
      </div>
    </div>
  )
}
