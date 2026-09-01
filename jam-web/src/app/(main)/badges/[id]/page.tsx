import { notFound, redirect } from 'next/navigation'
import SafeImage from '@/components/SafeImage'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ActivityType, BadgeCondition, BadgeRarity, BadgeRow, ItemBookRow, PoiRow, UserActivityBadgeRow, UserCheckinBadgeEarnRow } from '@/types/database'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import TopNav from '@/components/ui/TopNav'
import ListRowCard from '@/components/ui/ListRowCard'
import { BookIcon, ChevronRightIcon } from '@/components/ui/icons'
import PoiMapButton from './PoiMapButton'
import PoiEarnHistory from './PoiEarnHistory'
import StravaLink from '@/components/StravaLink'
import LocalDate from '@/components/LocalDate'
import ItemEarnHistory from './ItemEarnHistory'
import BadgeHeroSection from './BadgeHeroSection'
import BadgeConditionCard from './BadgeConditionCard'
import BadgeShareButton from './BadgeShareButton'
import { d, t } from '@/lib/i18n'
import { formatPaceSecPerKm } from '@/types/strava'
import { getBadgeBackgroundAnimation, getBadgeBackgroundStyle, getBadgeBackgroundVideoUrl, getBadgeThemedTextStyle, hasBadgeBackgroundTheme } from '@/lib/badgeBackgroundTheme'
import BadgeBackgroundVideoTiles from '@/components/BadgeBackgroundVideoTiles'

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
        const { data: subjectRaw, error: subjectError } = await service
      .from('users')
      .select('id, username')
      .eq('username', u.toLowerCase())
      .maybeSingle()
    if (subjectError) console.error('[badges/[id]/page] 대상 유저(users) 조회 실패', subjectError)
    if (subjectRaw) {
      subjectId = (subjectRaw as { id: string; username: string }).id
      subjectUsername = (subjectRaw as { id: string; username: string }).username
    }
  }
  const isOwnBadge = subjectId === user.id

  const [
    { data: badge, error: badgeError },
    { data: earnedRow, error: earnedRowError },
    { data: ownedBadgesRaw, error: ownedBadgesError },
    { data: stravaConnectionRaw, error: stravaConnectionError },
  ] = await Promise.all([
    // 소프트 삭제된 배지(badges.deleted_at)는 직접 접근 시 존재하지 않는 배지와 동일하게 취급한다
    // (20260824_007) — 없으면 아래 notFound()로 빠진다. 이후 이 배지에 종속된 소속 컬렉션·
    // POI 역조회 조회는 notFound() 이후 코드라 자동으로 함께 막힌다.
    supabase.from('badges').select('*').eq('id', id).is('deleted_at', null).single(),
        service
      .from('user_activity_badges')
      .select('*, poi:triggered_by_poi_id(id, name, latitude, longitude, radius_meters)')
      .eq('user_id', subjectId)
      .eq('badge_id', id)
      .maybeSingle(),
        service.from('user_activity_badges').select('badge_id').eq('user_id', subjectId),
    // 공유 버튼 사전 비활성화 판정용 — 배지 소유자(subjectId)가 스트라바에 연동돼 있는지
    // 미리 조회한다(20260821_004 재작업: 클릭 후가 아니라 클릭 전에 판별해야 함).
    service.from('strava_connections').select('user_id').eq('user_id', subjectId).maybeSingle(),
  ])
  // 20260901_1848: 이 파일이 티켓 20260824_017에서 "조회 실패가 빈 목록으로 위장된다"고
  // 지적된 원 사례다 — badgeError는 특히 !badge → notFound()(404)로 위장되던 지점.
  if (badgeError) console.error('[badges/[id]/page] badges 단건 조회 실패', badgeError)
  if (earnedRowError) console.error('[badges/[id]/page] user_activity_badges(획득 여부) 조회 실패', earnedRowError)
  if (ownedBadgesError) console.error('[badges/[id]/page] user_activity_badges(선행배지 보유판정용) 조회 실패', ownedBadgesError)
  if (stravaConnectionError) console.error('[badges/[id]/page] strava_connections 조회 실패', stravaConnectionError)
  const stravaConnected = Boolean(stravaConnectionRaw)

  if (!badge) notFound()

  const badgeRow = badge as BadgeRow
  const earned = earnedRow as (UserActivityBadgeRow & { poi: PoiRow | null }) | null

  // [20260819_011] 배경은 아래 고정 배경 레이어 한 곳에서만 그린다. TopNav에 배경을 한 번 더
  // 주입하면(20260818_003 동작) 헤더 박스와 레이어 박스의 비율이 달라 같은 이미지가 서로 다른
  // 배율로 잘려 경계에 이음매가 보였다. 배경이 있는 배지에서는 TopNav를 투명하게 두어 아래
  // 고정 레이어가 그대로 비쳐 보이게 하고, 배경이 없으면 기존과 동일하게 --color-surface를
  // 유지한다(회귀 방지).
  const themedBackground = hasBadgeBackgroundTheme(badgeRow)
  // [20260901_1944] 이미지 카드 "안"에서 실행하는 블롭 애니메이션. 전체 배경 레이어와 렌더링
  // 지점이 다르며, 애니메이션이 켜져 있으면 위 두 함수가 전체 레이어를 비운다(우선순위 규칙은
  // badgeBackgroundTheme.ts 한 곳에서 결정).
  const badgeCardAnimation = getBadgeBackgroundAnimation(badgeRow)
  const topNavStyle: React.CSSProperties = { background: themedBackground ? 'transparent' : 'var(--color-surface)' }

  // 뷰포트 전체(헤더 아래~본문~푸터)를 덮는 고정 배경 레이어 — [20260818_002 스코프 수정]
  // (main)/layout.tsx의 main(비-positioned, bg-surface 불투명)보다 위, TopNav(sticky, z-30)보다는
  // 아래 z-index로 배치해 배경이 자동으로 비쳐 보이게 한다.
  // [20260819_011] 배경을 실제로 그리는 유일한 지점이다 — TopNav와 Hero 카드는 배경을 그리지
  // 않고 투명 처리만 하므로, 같은 이미지가 서로 다른 배율로 여러 번 잘려 이음매가 생기지 않는다.
  // pointerEvents: 'none' — 순수 시각 배경 레이어이므로 클릭/탭 이벤트를 가로채지 않고 아래
  // 콘텐츠(링크·버튼)로 그대로 통과시킨다. (게이트 리뷰에서 발견된 클릭 차단 회귀 수정)
  // [20260818_004 버그 수정] inset:0은 뷰포트 전체 폭을 덮어 (main)/layout.tsx의
  // max-w-[430px] mx-auto 앱 컬럼(TopNav와 동일 폭) 바깥(데스크톱 검은 여백)까지 배경색이
  // 새어나갔다. left:50% + translateX(-50%) + maxWidth:430px로 앱 컬럼과 동일한 폭·중앙정렬로
  // 제한하되, fixed 특성(스크롤에 안 끌려감)은 그대로 유지한다.
  // [20260819_012] 애니메이션 배경은 어드민에서 구운 반복 MP4를 이 레이어 안에서 재생한다.
  // - 유저단에는 WebGL을 로드하지 않는다는 전체 설계 원칙 유지 — <video>로 재생만 한다.
  // - iOS 자동재생 4종 세트(autoPlay·muted·loop·playsInline)는 하나라도 빠지면 재생되지 않는다.
  // - poster에는 같은 시점에 구운 정지 PNG를 쓴다. CSS 배경 이미지(getBadgeBackgroundStyle)도
  //   그대로 유지되므로 영상 로드 전/실패 시, 그리고 타일 상한을 넘는 초장신 페이지 최하단까지
  //   같은 정지 이미지가 이어져 보인다.
  // - [20260819_017 버그 수정] 영상은 430×860(정사각 타일 2장)으로 구워져 있는데 <video>는
  //   background-repeat처럼 타일링할 수 없어, 예전에는 <video> 하나만 얹어 레이어 상단 860px
  //   까지만 애니메이션이 보이고 그보다 긴 페이지의 아래쪽은 정지 이미지가 그대로 노출됐다.
  //   BadgeBackgroundVideoTiles가 같은 영상을 세로로 필요한 만큼(콘텐츠 실제 높이 기준, 상한
  //   있음) 반복 배치해 페이지 전체를 덮는다.
  // - prefers-reduced-motion: reduce 대응은 globals.css의 .badge-background-video 규칙에서
  //   display:none으로 처리한다(그 경우 아래 CSS 배경 poster가 그대로 보인다).
  //   같은 이유로 display:block도 인라인이 아니라 그 클래스에 둔다.
  // - pointerEvents:'none'은 레이어와 영상 양쪽에 유지한다(클릭 차단 회귀 방지).
  // [20260901_1944] 카드 안 블롭 애니메이션이 켜져 있으면 이 레이어는 CSS·영상 모두 비어야 한다.
  // 그 판단은 getBadgeBackgroundStyle / getBadgeBackgroundVideoUrl 두 함수가 모두 담당하므로
  // 여기서는 별도 분기를 두지 않는다 — 호출부가 우선순위를 각자 해석하지 않는다는 원칙.
  const badgeBackgroundVideoUrl = getBadgeBackgroundVideoUrl(badgeRow)
  const badgeBackgroundLayer = (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '430px',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        ...getBadgeBackgroundStyle(badgeRow),
      }}
    >
      {badgeBackgroundVideoUrl && (
        <BadgeBackgroundVideoTiles
          src={badgeBackgroundVideoUrl}
          poster={badgeRow.background_image_url}
        />
      )}
    </div>
  )

  // 본문 콘텐츠(hero/info/action-section, Footer)는 위 고정 배경 레이어(z-index:0, positioned)보다
  // 페인트 순서상 앞서도록 각 섹션에 relative z-10을 부여한다(BadgeHeroSection·Footer 컴포넌트
  // 내부, 아래 info/action-section div에 개별 적용) — [20260818_003, 20260818_002 잔여 이슈 수정].
  // 실제 배경색/배경 이미지가 채워진 상태에서 흰 텍스트 가독성을 보정하기 위한 최소한의 텍스트
  // 그림자. 둘 다 없으면 기존과 동일(그림자 없음)하다. (20260819_008 — background_image_url 추가)
  const themedTextStyle: React.CSSProperties = getBadgeThemedTextStyle(themedBackground)

  // Phase 16: checkin 타입 배지는 반복 획득 가능 — 단건이 아니라 이력 전체를 최신순으로 조회
  let checkinEarns: (UserCheckinBadgeEarnRow & { poi: PoiRow | null })[] = []
  if (badgeRow.type === 'checkin') {
        const { data: checkinEarnsRaw, error: checkinEarnsError } = await service
      .from('user_checkin_badge_earns')
      .select('*, poi:poi_id(id, name, latitude, longitude, radius_meters)')
      .eq('user_id', subjectId)
      .eq('badge_id', id)
      .order('earned_at', { ascending: false })
    if (checkinEarnsError) console.error('[badges/[id]/page] user_checkin_badge_earns 조회 실패', checkinEarnsError)
    checkinEarns = (checkinEarnsRaw ?? []) as (UserCheckinBadgeEarnRow & { poi: PoiRow | null })[]
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
        const { data: subjectInventory, error: subjectInventoryError } = await service
      .from('inventory')
      .select('id')
      .eq('user_id', subjectId)
      .maybeSingle()
    if (subjectInventoryError) console.error('[badges/[id]/page] inventory 조회 실패', subjectInventoryError)
    if (subjectInventory) {
            const { data: itemsRaw, error: itemsError } = await service
        .from('inventory_items')
        .select('id, serial_number, serial_prefix, obtained_at, expires_at, obtained_by, dropped_at')
        .eq('inventory_id', (subjectInventory as { id: string }).id)
        .eq('badge_id', id)
        .order('obtained_at', { ascending: false })
      if (itemsError) console.error('[badges/[id]/page] inventory_items(보유 개체) 조회 실패', itemsError)
      allItemInventory = (itemsRaw ?? []) as ItemInventoryInfo[]
    }

    if (badgeRow.item_book_id) {
      const { data: itemBookRaw, error: itemBookError } = await supabase
        .from('item_books')
        .select('*')
        .eq('id', badgeRow.item_book_id)
        .maybeSingle()
      if (itemBookError) console.error('[badges/[id]/page] item_books 조회 실패', itemBookError)
      itemBook = itemBookRaw as ItemBookRow | null
    }
  }

  // 획득 여부 — checkin 타입은 이력 1건 이상, item 타입은 드랍되지 않은 아이템 보유 여부, 그 외는 기존 단건 조회 결과
  const hasEarned =
    badgeRow.type === 'checkin'
      ? checkinEarns.length > 0
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
    // 소프트 삭제된 선행 배지는 조회 대상에서 제외한다(20260824_007) — 필터로 매치가 안 되면
    // 아래 map에서 해당 항목만 걸러내 목록에서 빠지고 나머지 선행 배지는 그대로 유지한다.
    const { data: prereqBadgesRaw, error: prereqBadgesError } = await supabase
      .from('badges')
      .select('id, name, image_url, description, rarity')
      .in('name', prereqs)
      .is('deleted_at', null)
    if (prereqBadgesError) console.error('[badges/[id]/page] 선행 배지 조회 실패', prereqBadgesError)
    const prereqBadges = (prereqBadgesRaw ?? []) as {
      id: string
      name: string
      image_url: string | null
      description: string | null
      rarity: string
    }[]
    prereqStatus = prereqs
      .map((name) => {
        const match = prereqBadges.find((b) => b.name === name)
        if (!match) return null
        return {
          id: match.id,
          name,
          image_url: match.image_url,
          description: match.description,
          rarity: match.rarity,
          owned: ownedBadgeIds.has(match.id),
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
  }

  // triggered_by_poi_id join 결과(활동 배지) 또는 최근 체크인 이력의 지점 — 이미 획득한
  // 이력이라 is_active와 무관하게 그대로 노출한다(소급 적용 금지, 20260830_1620).
  // 미획득 체크인 배지는 이력이 없으므로 linked_badge_id로 직접 조회한다 — 이 경우는
  // "아직 안 갔다면 여기로 가보라"는 안내(PoiMapButton)라 운영 종료된 지점을 가리키면
  // 안 되므로 is_active=true인 지점만 찾는다.
  let poi: PoiRow | null = earned?.poi ?? checkinEarns[0]?.poi ?? null
  if (!poi && badgeRow.type === 'checkin') {
    const { data: linkedPoi, error: linkedPoiError } = await supabase
      .from('poi')
      .select('id, name, latitude, longitude, radius_meters')
      .eq('linked_badge_id', id)
      .eq('is_active', true)
      .maybeSingle()
    if (linkedPoiError) console.error('[badges/[id]/page] 연결 POI(안내용) 조회 실패', linkedPoiError)
    poi = linkedPoi as PoiRow | null
  }

  // ========== 변형 2: 아이템 배지 ==========
  if (badgeRow.type === 'item') {
    const activeItem = allItemInventory.find(item => !item.dropped_at) ?? null
    const expiresAt = activeItem?.expires_at ?? null
    const expiring = isExpiringSoon(expiresAt)

    return (
      <div className="min-h-full bg-surface text-text" style={themedTextStyle}>
        {badgeBackgroundLayer}
        <TopNav
          title={d.common.back}
          backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined}
          headerStyle={topNavStyle}
          rightSlot={
            isOwnBadge && (
              <BadgeShareButton
                badgeId={id}
                badgeType="item"
                imageUrl={badgeRow.image_url}
                badgeName={badgeRow.name}
                hasEarned={hasEarned}
                stravaConnected={stravaConnected}
                subjectUsername={subjectUsername ?? undefined}
              />
            )
          }
        />

        <BadgeHeroSection badge={badgeRow} hasEarned={hasEarned} backgroundAnimation={badgeCardAnimation} />

        {/* info-section — 본인 뷰이거나 미보유 안내가 필요한 경우만 렌더링 */}
        {(isOwnBadge || !hasEarned) && (
          <div className="relative z-10 flex flex-col gap-4 pt-[32px] px-6 pb-[32px]">
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
          <div className="relative z-10 flex flex-col gap-4 px-6 pt-[32px] pb-[40px]">
            {/* 속한 컬렉션 링크 */}
            {itemBook && (
              <ListRowCard
                href={`/collections/${itemBook.id}${!isOwnBadge && subjectUsername ? `?u=${subjectUsername}` : ''}`}
                icon={
                  /* 컬렉션 이미지는 어드민 자유 입력이 가능했던 필드다. next/image에 직접 넘기면
                     미등록 호스트 하나로 배지 상세 화면 전체가 500이 되므로 SafeImage로 렌더한다
                     (20260824_005). 폴백은 이미지가 없을 때와 같은 BookIcon 플레이스홀더 —
                     아이콘 자리가 비어 링크 행의 정렬이 무너지지 않는다. */
                  <SafeImage
                    src={itemBook.image_url}
                    alt={itemBook.name}
                    width={44}
                    height={44}
                    className="w-full h-full object-contain p-1"
                    containerClassName="w-11 h-11 rounded-[var(--radius-cards)] overflow-hidden shrink-0"
                    fallback={
                      <div className="w-11 h-11 rounded-[var(--radius-cards)] bg-white/8 flex items-center justify-center shrink-0">
                        <BookIcon className="w-5 h-5 text-[var(--color-text-secondary)]" />
                      </div>
                    }
                  />
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

  // ========== 변형 3: 체크인 배지 ==========
  if (badgeRow.type === 'checkin') {
    return (
      <div className="min-h-full bg-surface text-text" style={themedTextStyle}>
        {badgeBackgroundLayer}
        <TopNav
          title={d.common.back}
          backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined}
          headerStyle={topNavStyle}
          rightSlot={
            isOwnBadge && (
              <BadgeShareButton
                badgeId={id}
                badgeType="checkin"
                imageUrl={badgeRow.image_url}
                badgeName={badgeRow.name}
                hasEarned={hasEarned}
                stravaConnected={stravaConnected}
                subjectUsername={subjectUsername ?? undefined}
              />
            )
          }
        />

        <BadgeHeroSection badge={badgeRow} hasEarned={hasEarned} backgroundAnimation={badgeCardAnimation} />

        {/* info-section */}
        <div className="relative z-10 flex flex-col gap-4 pt-[32px] px-6 pb-[32px]">
          {poi && <PoiMapButton lat={poi.latitude} lng={poi.longitude} poiName={poi.name} />}
          {/* 획득 조건 문구는 ko.ts의 conditionCheckinBody 한 곳에서 관리한다(20260826_004) —
              이전에는 이 하드코딩과 i18n 키가 서로 다른 내용으로 갈라져 있었다. */}
          <BadgeConditionCard text={d.badges.conditionCheckinBody} />
          <PoiEarnHistory poiEarns={checkinEarns.map((e) => ({
            id: e.id,
            earned_at: e.earned_at,
            triggered_by_activity_name: e.triggered_by_activity_name ?? null,
            triggered_by_distance_km: e.triggered_by_distance_km ?? null,
            triggered_by_activity_date: e.triggered_by_activity_date ?? null,
            triggered_by_strava_id: e.triggered_by_strava_id ?? null,
          }))} />
        </div>

        {/* action-section */}
        <div className="relative z-10 flex flex-col gap-4 pt-[32px] px-6 pb-[40px]">
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
            {t(d.badges.checkinSafetyNotice, { radius: String(poi?.radius_meters ?? 50) })}
          </p>
        </div>
      </div>
    )
  }

  // ========== 변형 1: 액티비티 배지 (catch-all) ==========
  return (
    <div className="min-h-full bg-surface text-text" style={themedTextStyle}>
      {badgeBackgroundLayer}
      <TopNav
        title={d.common.back}
        backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined}
        headerStyle={topNavStyle}
        rightSlot={
          isOwnBadge && (
            <BadgeShareButton
              badgeId={id}
              badgeType="activity"
              imageUrl={badgeRow.image_url}
              badgeName={badgeRow.name}
              hasEarned={hasEarned}
              stravaConnected={stravaConnected}
              subjectUsername={subjectUsername ?? undefined}
            />
          )
        }
      />

      <BadgeHeroSection badge={badgeRow} hasEarned={hasEarned} backgroundAnimation={badgeCardAnimation} />

      {/* info-section */}
      <div className="relative z-10 flex flex-col gap-4 pt-[32px] px-6 pb-[32px]">
        {/* 획득 조건 다크 카드 */}
        <BadgeConditionCard text={formatConditionText(badgeRow.condition_json, badgeRow.name)} />

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
      <div className="relative z-10 flex flex-col gap-4 pt-[32px] px-6 pb-[40px]">
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
