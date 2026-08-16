import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ActivityType, BadgeCondition, BadgeRarity, BadgeRow, ItemBookRow, PoiRow, UserActivityBadgeRow, UserPoiBadgeEarnRow } from '@/types/database'
import RarityBadge from '@/components/ui/Badge'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import TopNav from '@/components/ui/TopNav'
import ListRowCard from '@/components/ui/ListRowCard'
import { MedalIcon, BookIcon, ChevronRightIcon } from '@/components/ui/icons'
import Link from 'next/link'
import PoiMapButton from './PoiMapButton'
import PoiEarnHistory from './PoiEarnHistory'
import StravaLink from '@/components/StravaLink'
import LocalDate from '@/components/LocalDate'
import ItemEarnHistory from './ItemEarnHistory'
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

const DAY_OF_WEEK_LABELS: Record<string, string> = {
  sunday: '일요일',
  monday: '월요일',
  tuesday: '화요일',
  wednesday: '수요일',
  thursday: '목요일',
  friday: '금요일',
  saturday: '토요일',
}

// 배열이 정확히 월~금(순서 무관)이면 "월~금"으로 요약
function dayOfWeekArrayLabel(days: string[]): string {
  const weekdaySet = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
  if (days.length === 5 && days.every((d) => weekdaySet.has(d))) return '월~금'
  return days.map((d) => DAY_OF_WEEK_LABELS[d] ?? d).join(', ')
}

// 단일 월 또는 월 배열(예: 장마철 6~7월)을 사람이 읽기 쉬운 라벨로 변환
function monthLabel(month: number | number[]): string {
  if (Array.isArray(month)) {
    return month.map((m) => MONTH_LABELS[m] ?? `${m}월`).join('·')
  }
  return MONTH_LABELS[month] ?? `${month}월`
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

function formatConditionText(condition: BadgeCondition | null, badgeName: string): string {
  if (condition?.mission_reward) {
    return `'${badgeName}' 미션을 완료하면 받을 수 있는 배지예요.`
  }
  if (!condition || Object.keys(condition).length === 0) {
    return '관리자가 직접 발급하는 배지예요.'
  }

  const actType = condition.activity_type ? ACTIVITY_LABELS[condition.activity_type] : '활동'
  const parts: string[] = []

  if (condition.distance_km !== undefined) {
    parts.push(`${actType}으로 누적 ${condition.distance_km}km 이상 달성`)
  }
  // day_of_week: 배열 + total_count 동시 지정이면 "요일별 독립 카운터" 모드이므로
  // 일반 total_count 문구 대신 합쳐진 문구 하나로 표현하고, 아래 total_count 블록은 건너뛴다.
  const dayOfWeekHandlesTotalCount = Array.isArray(condition.day_of_week) && condition.total_count !== undefined
  if (condition.day_of_week !== undefined) {
    if (Array.isArray(condition.day_of_week)) {
      if (dayOfWeekHandlesTotalCount) {
        parts.push(`${dayOfWeekArrayLabel(condition.day_of_week)} 각 요일마다 ${actType} ${condition.total_count}회씩 완료`)
      } else {
        parts.push(`${dayOfWeekArrayLabel(condition.day_of_week)}에 ${actType} 활동`)
      }
    } else {
      parts.push(`매주 ${DAY_OF_WEEK_LABELS[condition.day_of_week] ?? condition.day_of_week}에 ${actType} 활동`)
    }
  }
  if (condition.total_count !== undefined && !dayOfWeekHandlesTotalCount) {
    parts.push(`${actType} ${condition.total_count}회 이상 완료`)
  }
  if (condition.active_days_count !== undefined) {
    parts.push(`${actType}로 누적 ${condition.active_days_count}일 이상 활동`)
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
    const label = condition.month ? `${monthLabel(condition.month)} 한 달간` : '한 달간'
    parts.push(`${label} ${actType}으로 ${condition.monthly_km}km 이상 달성`)
  } else if (condition.month !== undefined) {
    parts.push(`${monthLabel(condition.month)}에 ${actType} 활동 완료`)
  }
  if (condition.season_count !== undefined && condition.season) {
    parts.push(`${SEASON_LABELS[condition.season] ?? condition.season}에 ${actType} ${condition.season_count}회 이상 완료`)
  }
  if (condition.season_count_all !== undefined) {
    parts.push(`봄·여름·가을·겨울 각 계절 ${actType} ${condition.season_count_all}회 이상 완료`)
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
        const { data: subjectRaw } = await service
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
        service
      .from('user_activity_badges')
      .select('*, poi:triggered_by_poi_id(id, name, latitude, longitude, radius_meters)')
      .eq('user_id', subjectId)
      .eq('badge_id', id)
      .maybeSingle(),
        service.from('user_activity_badges').select('badge_id').eq('user_id', subjectId),
  ])

  if (!badge) notFound()

  const badgeRow = badge as BadgeRow
  const earned = earnedRow as (UserActivityBadgeRow & { poi: PoiRow | null }) | null

  // Phase 16: poi 타입 배지는 반복 획득 가능 — 단건이 아니라 이력 전체를 최신순으로 조회
  let poiEarns: (UserPoiBadgeEarnRow & { poi: PoiRow | null })[] = []
  if (badgeRow.type === 'poi') {
        const { data: poiEarnsRaw } = await service
      .from('user_poi_badge_earns')
      .select('*, poi:poi_id(id, name, latitude, longitude, radius_meters)')
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
    dropped_at: string | null
  }
  let allItemInventory: ItemInventoryInfo[] = []
  let itemBook: ItemBookRow | null = null
  if (badgeRow.type === 'item') {
        const { data: subjectInventory } = await service
      .from('inventory')
      .select('id')
      .eq('user_id', subjectId)
      .maybeSingle()
    if (subjectInventory) {
            const { data: itemsRaw } = await service
        .from('inventory_items')
        .select('id, serial_number, serial_prefix, obtained_at, expires_at, obtained_by, dropped_at')
        .eq('inventory_id', (subjectInventory as { id: string }).id)
        .eq('badge_id', id)
        .order('obtained_at', { ascending: false })
      allItemInventory = (itemsRaw ?? []) as ItemInventoryInfo[]
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

  // 획득 여부 — poi 타입은 이력 1건 이상, item 타입은 드랍되지 않은 아이템 보유 여부, 그 외는 기존 단건 조회 결과
  const hasEarned =
    badgeRow.type === 'poi'
      ? poiEarns.length > 0
      : badgeRow.type === 'item'
        ? allItemInventory.some(item => !item.dropped_at)
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
  // 미획득 POI 배지는 이력이 없으므로 linked_badge_id로 직접 조회
  let poi: PoiRow | null = earned?.poi ?? poiEarns[0]?.poi ?? null
  if (!poi && badgeRow.type === 'poi') {
    const { data: linkedPoi } = await supabase
      .from('poi')
      .select('id, name, latitude, longitude, radius_meters')
      .eq('linked_badge_id', id)
      .maybeSingle()
    poi = linkedPoi as PoiRow | null
  }

  // ========== 변형 2: 아이템 배지 ==========
  if (badgeRow.type === 'item') {
    const activeItem = allItemInventory.find(item => !item.dropped_at) ?? null
    const expiresAt = activeItem?.expires_at ?? null
    const expiring = isExpiringSoon(expiresAt)

    return (
      <div className="min-h-full bg-surface text-text">
        <TopNav title={d.common.back} backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined} headerStyle={{ background: 'var(--color-surface)' }} />

        {/* hero-section */}
        <div className="px-6 pt-[40px] pb-[32px]">
          <div className="w-full aspect-square rounded-[var(--radius-cards)] bg-surface-elevated flex flex-col p-6">
            <div className="flex-1 flex items-center justify-center">
              {badgeRow.image_url ? (
                <div className="w-[200px] h-[200px] flex items-center justify-center">
                  <Image
                    src={badgeRow.image_url}
                    alt={badgeRow.name}
                    width={200}
                    height={200}
                    className={['object-contain w-full h-full', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')}
                  />
                </div>
              ) : (
                <MedalIcon className={['w-28 h-28', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')} />
              )}
            </div>
            <div className="flex flex-col items-center gap-2 pt-4">
              <RarityBadge rarity={badgeRow.rarity} />
              <h1 className="text-[length:var(--text-heading-sm)] font-bold text-text text-center leading-[var(--leading-heading-sm)]">{badgeRow.name}</h1>
            </div>
          </div>
          {badgeRow.description && (
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)] text-center leading-[var(--leading-body)] mt-6">{badgeRow.description}</p>
          )}
        </div>

        {/* info-section — 본인 뷰이거나 미보유 안내가 필요한 경우만 렌더링 */}
        {(isOwnBadge || !hasEarned) && (
          <div className="flex flex-col gap-4 pt-[32px] px-6 pb-[32px]">
            {isOwnBadge && allItemInventory.length > 0 && (
              <ItemEarnHistory items={allItemInventory.map(item => ({
                id: item.id,
                serial: `${item.serial_prefix ?? '????'}${String(item.serial_number).padStart(6, '0')}`,
                obtained_at: item.obtained_at,
                expires_at: item.expires_at,
              }))} />
            )}

            {!hasEarned && (
              <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6 text-center">
                <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{d.badges.notEarnedTitle}</p>
                <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)]/60 mt-1">{d.badges.notEarnedBody}</p>
              </div>
            )}
          </div>
        )}

        {/* desc-section — 컬렉션 링크 또는 만료 임박 안내가 있을 때만 렌더링 */}
        {(itemBook || expiring) && (
          <div className="flex flex-col gap-4 px-6 pt-[32px] pb-[40px]">
            {/* 속한 컬렉션 링크 */}
            {itemBook && (
              <ListRowCard
                href={`/itembooks/${itemBook.id}${!isOwnBadge && subjectUsername ? `?u=${subjectUsername}` : ''}`}
                icon={
                  itemBook.image_url ? (
                    <div className="w-11 h-11 rounded-[var(--radius-cards)] overflow-hidden shrink-0">
                      <Image src={itemBook.image_url} alt={itemBook.name} width={44} height={44} className="w-full h-full object-contain p-1" />
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-[var(--radius-cards)] bg-white/8 flex items-center justify-center shrink-0">
                      <BookIcon className="w-5 h-5 text-[var(--color-text-secondary)]" />
                    </div>
                  )
                }
                title={itemBook.name}
                trailing={<ChevronRightIcon className="w-4 h-4 text-[var(--color-text-secondary)]" />}
              />
            )}

            {/* 만료 임박 안내 */}
            {expiring && (
              <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
                <p className="text-[length:var(--text-body)] text-text">{d.inventory.expiringSoonTitle}</p>
                <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)] mt-0.5">{d.inventory.expiringSoonBody}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ========== 변형 3: POI 배지 ==========
  if (badgeRow.type === 'poi') {
    return (
      <div className="min-h-full bg-surface text-text">
        <TopNav title={d.common.back} backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined} headerStyle={{ background: 'var(--color-surface)' }} />

        {/* hero-section */}
        <div className="px-6 pt-[40px] pb-[32px]">
          <div className="w-full aspect-square rounded-[var(--radius-cards)] bg-surface-elevated flex flex-col p-6">
            <div className="flex-1 flex items-center justify-center">
              {badgeRow.image_url ? (
                <div className="w-[200px] h-[200px] flex items-center justify-center">
                  <Image
                    src={badgeRow.image_url}
                    alt={badgeRow.name}
                    width={200}
                    height={200}
                    className={['object-contain w-full h-full', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')}
                  />
                </div>
              ) : (
                <MedalIcon className={['w-28 h-28', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')} />
              )}
            </div>
            <div className="flex flex-col items-center gap-2 pt-4">
              <RarityBadge rarity={badgeRow.rarity} />
              <h1 className="text-[length:var(--text-heading-sm)] font-bold text-text text-center leading-[var(--leading-heading-sm)]">{badgeRow.name}</h1>
            </div>
          </div>
          {badgeRow.description && (
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)] text-center leading-[var(--leading-body)] mt-6">{badgeRow.description}</p>
          )}
        </div>

        {/* info-section */}
        <div className="flex flex-col gap-4 pt-[32px] px-6 pb-[32px]">
          {poi && <PoiMapButton lat={poi.latitude} lng={poi.longitude} poiName={poi.name} />}
          <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6 flex flex-col gap-2">
            <p className="text-[length:var(--text-body)] font-bold text-text">{d.badges.conditionTitle}</p>
            <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] leading-[var(--leading-loose)]">이 장소를 경유하는 활동이 기록되면 획득돼요.</p>
          </div>
          <PoiEarnHistory poiEarns={poiEarns.map((e) => ({
            id: e.id,
            earned_at: e.earned_at,
            triggered_by_activity_name: e.triggered_by_activity_name ?? null,
            triggered_by_distance_km: e.triggered_by_distance_km ?? null,
            triggered_by_activity_date: e.triggered_by_activity_date ?? null,
            triggered_by_strava_id: e.triggered_by_strava_id ?? null,
          }))} />
        </div>

        {/* action-section */}
        <div className="flex flex-col gap-4 pt-[32px] px-6 pb-[40px]">
          {badgeRow.patch_available && (
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="h-14 w-full rounded-full bg-surface-elevated text-[length:var(--text-body)] text-text inline-flex items-center justify-center active:scale-95 transition-transform duration-100"
            >
              {d.badges.physicalPatchButton} ↗
            </a>
          )}

          {!hasEarned && (
            <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6 text-center">
              <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{d.badges.notEarnedTitle}</p>
              <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)]/60 mt-1">{d.badges.notEarnedBody}</p>
            </div>
          )}

          <p className="text-center text-[length:var(--text-body)] text-[var(--color-text-secondary)] leading-[var(--leading-body)] px-4">
            {t(d.badges.poiSafetyNotice, { radius: String(poi?.radius_meters ?? 50) })}
          </p>
        </div>
      </div>
    )
  }

  // ========== 변형 1: 액티비티 배지 (catch-all) ==========
  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.common.back} backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined} headerStyle={{ background: 'var(--color-surface)' }} />

      {/* hero-section */}
      <div className="px-6 pt-[40px] pb-[32px]">
        <div className="w-full aspect-square rounded-[var(--radius-cards)] bg-surface-elevated flex flex-col p-6">
          <div className="flex-1 flex items-center justify-center">
            {badgeRow.image_url ? (
              <div className="w-[200px] h-[200px] flex items-center justify-center">
                <Image
                  src={badgeRow.image_url}
                  alt={badgeRow.name}
                  width={200}
                  height={200}
                  className={['object-contain w-full h-full', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')}
                />
              </div>
            ) : (
              <MedalIcon className={['w-28 h-28', !hasEarned ? 'grayscale opacity-50' : ''].join(' ')} />
            )}
          </div>
          <div className="flex flex-col items-center gap-2 pt-4">
            <RarityBadge rarity={badgeRow.rarity} />
            <h1 className="text-[length:var(--text-heading-sm)] font-bold text-text text-center leading-[var(--leading-heading-sm)]">{badgeRow.name}</h1>
          </div>
        </div>
        {badgeRow.description && (
          <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)] text-center leading-[var(--leading-body)] mt-6">{badgeRow.description}</p>
        )}
      </div>

      {/* info-section */}
      <div className="flex flex-col gap-4 pt-[32px] px-6 pb-[32px]">
        {/* 획득 조건 다크 카드 */}
        <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6 flex flex-col gap-2">
          <p className="text-[length:var(--text-body)] font-bold text-text">{d.badges.conditionTitle}</p>
          <p className="text-[length:var(--text-small)] text-[var(--color-text-secondary)] leading-[var(--leading-loose)]">
            {formatConditionText(badgeRow.condition_json, badgeRow.name)}
          </p>
        </div>

        {/* 선행 배지 조건 */}
        {prereqStatus.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[length:var(--text-body)] font-bold text-text">{d.badges.prerequisiteTitle}</p>
            <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
              {prereqStatus.map((p) => (
                <BadgeGridCard
                  key={p.id}
                  name={p.name}
                  imageUrl={p.image_url}
                  rarity={p.rarity as BadgeRarity}
                  href={`/badges/${p.id}${!isOwnBadge && subjectUsername ? `?u=${subjectUsername}` : ''}`}
                  earned={p.owned}
                />
              ))}
            </div>
          </div>
        )}

        {/* 포인트 보상 */}
        {badgeRow.point_reward > 0 && (
          <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
            <p className="text-[length:var(--text-body)] text-text">
              {hasEarned
                ? t(d.badges.pointRewardEarned, { points: badgeRow.point_reward.toLocaleString('ko-KR') })
                : t(d.badges.pointRewardPending, { points: badgeRow.point_reward.toLocaleString('ko-KR') })}
            </p>
          </div>
        )}
      </div>

      {/* action-section */}
      <div className="flex flex-col gap-4 pt-[32px] px-6 pb-[40px]">
        {/* 실물 패치 버튼 */}
        {badgeRow.patch_available && (
          <a
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            className="h-14 w-full rounded-full bg-surface-elevated text-[length:var(--text-body)] text-text inline-flex items-center justify-center active:scale-95 transition-transform duration-100"
          >
            {d.badges.physicalPatchButton} ↗
          </a>
        )}

        {/* 획득 정보 (획득한 경우) */}
        {earned && (
          <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6">
            <p className="text-[length:var(--text-body)] font-bold text-text mb-4">{d.badges.earnInfoTitle}</p>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{d.badges.earnedAt}</span>
                <span className="text-[length:var(--text-small)] text-text">
                  <LocalDate iso={earned.earned_at} options={{ year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }} />
                </span>
              </div>
              {earned.triggered_by_activity_name && (
                <div className="flex justify-between items-center">
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{d.badges.triggerActivity}</span>
                  <span className="text-[length:var(--text-small)] text-text truncate max-w-[180px] text-right">{earned.triggered_by_activity_name}</span>
                </div>
              )}
              {earned.triggered_by_distance_km && (
                <div className="flex justify-between items-center">
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{d.badges.triggerDistance}</span>
                  <span className="text-[length:var(--text-small)] text-text">{t(d.badges.triggerDistanceValue, { km: earned.triggered_by_distance_km })}</span>
                </div>
              )}
              {earned.triggered_by_activity_date && (
                <div className="flex justify-between items-center">
                  <span className="text-[length:var(--text-small)] text-[var(--color-text-secondary)]">{d.badges.triggerDate}</span>
                  <span className="text-[length:var(--text-small)] text-text">
                    <LocalDate iso={earned.triggered_by_activity_date} options={{ year: 'numeric', month: 'long', day: 'numeric' }} />
                  </span>
                </div>
              )}
              {earned.triggered_by_strava_id && (
                <div className="mt-1">
                  <StravaLink stravaId={earned.triggered_by_strava_id} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 미획득 안내 */}
        {!hasEarned && (
          <div className="bg-surface-elevated rounded-[var(--radius-cards)] p-6 text-center">
            <p className="text-[length:var(--text-body)] text-[var(--color-text-secondary)]">{d.badges.notEarnedTitle}</p>
            <p className="text-[length:var(--text-caption)] text-[var(--color-text-secondary)]/60 mt-1">{d.badges.notEarnedBody}</p>
          </div>
        )}
      </div>
    </div>
  )
}
