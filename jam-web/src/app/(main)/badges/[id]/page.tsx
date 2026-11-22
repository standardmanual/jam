import { notFound, redirect } from 'next/navigation'
import SafeImage from '@/components/SafeImage'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { isItemBookViewable } from '@/lib/itembook/visibility'
import { BadgeRarity, BadgeRow, ItemBookRow, PoiRow, UserActivityBadgeRow, UserCheckinBadgeEarnRow } from '@/types/database'
import BadgeGridCard from '@/components/ui/BadgeGridCard'
import TopNav from '@/components/ui/TopNav'
import { ListRow } from '@/components/ui/ListRow'
import { Card } from '@ds/components/cards/Card'
import { MagicBookIcon, CoinIcon } from '@/components/ui/icons'
import PoiMapButton from './PoiMapButton'
import PoiEarnHistory from './PoiEarnHistory'
import StravaLink from '@/components/StravaLink'
import LocalDate from '@/components/LocalDate'
import ItemEarnHistory from './ItemEarnHistory'
import TicketPhoto from './TicketPhoto'
import TicketTitleBoxes from './TicketTitleBoxes'
import { ItemSerialCode } from '@ds/components/patterns/ItemSerialCode'
import BadgeConditionCard from './BadgeConditionCard'
import VisitCountChip from '@/components/ui/VisitCountChip'
import { formatBadgeConditionText, formatBadgeConditionSpec } from '@/lib/badgeConditionText'
import BadgeShareButton from './BadgeShareButton'
import { d, t } from '@/lib/i18n'
import { tPoint } from '@/lib/i18n/tPoint'
import { getBadgeBackgroundAnimation } from '@/lib/badgeBackgroundTheme'
import BadgeTicket from './BadgeTicket'
import { formatTicketDate, pickTicketColor } from '@/lib/badgeTicket/ticketColor'
import { singleQueryParam, type SearchParamValue } from '@/lib/searchParams'
import { excludeHiddenUnearned, isHiddenUnearned } from '@/lib/badge-engine/hiddenBadges'

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

/**
 * ⚠️ `u`의 타입을 `string`으로 좁히지 말 것 — `?u=a&u=b`처럼 같은 키가 두 번 오면 Next가
 * 배열을 넘긴다. 아래 `singleQueryParam`이 그 배열을 「값 없음」(= 내 기준으로 보기)으로
 * 흡수한다 (티켓 20260906_1312 — 이 화면이 실제로 500이었다).
 */
interface BadgeDetailPageProps {
  params: Promise<{ id: string }>
  /**
   * `item` — 보고 있는 아이템배지 **개체**(`inventory_items.id`). 20260907_2059.
   * 인벤토리 카드·컬렉션 슬롯에서 진입할 때 "어느 개체를 눌렀는가"를 싣는다.
   * 없거나 무효하면 아래에서 조용히 기존 대표 개체(최신 획득분)로 폴백한다.
   */
  searchParams: Promise<{ u?: SearchParamValue; item?: SearchParamValue }>
}

export default async function BadgeDetailPage({ params, searchParams }: BadgeDetailPageProps) {
  const { id } = await params
  const rawSearchParams = await searchParams
  const u = singleQueryParam(rawSearchParams.u)
  const requestedItemId = singleQueryParam(rawSearchParams.item)
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
  ] = await Promise.all([
    // 소프트 삭제된 배지(badges.deleted_at)는 직접 접근 시 존재하지 않는 배지와 동일하게 취급한다
    // (20260824_007) — 없으면 아래 notFound()로 빠진다. 이후 이 배지에 종속된 소속 컬렉션·
    // POI 역조회 조회는 notFound() 이후 코드라 자동으로 함께 막힌다.
    // 20261005_1151: .maybeSingle() — 정책(마이그레이션 216)이 공개 전 활동 배지·비공개 컬렉션 소속 배지를
    // 0행으로 돌려주므로 0행은 오류가 아니라 같은 404다(.single()이면 PGRST116이 아래 badgeError 로그에 남는다).
    supabase.from('badges').select('*').eq('id', id).is('deleted_at', null).maybeSingle(),
        service
      .from('user_activity_badges')
      .select('*, poi:triggered_by_poi_id(id, name, latitude, longitude, radius_meters)')
      .eq('user_id', subjectId)
      .eq('badge_id', id)
      .maybeSingle(),
        service.from('user_activity_badges').select('badge_id').eq('user_id', subjectId),
  ])
  // 20260901_1848: 이 파일이 티켓 20260824_017에서 "조회 실패가 빈 목록으로 위장된다"고
  // 지적된 원 사례다 — badgeError는 특히 !badge → notFound()(404)로 위장되던 지점.
  if (badgeError) console.error('[badges/[id]/page] badges 단건 조회 실패', badgeError)
  if (earnedRowError) console.error('[badges/[id]/page] user_activity_badges(획득 여부) 조회 실패', earnedRowError)
  if (ownedBadgesError) console.error('[badges/[id]/page] user_activity_badges(선행배지 보유판정용) 조회 실패', ownedBadgesError)

  if (!badge) notFound()

  const badgeRow = badge as BadgeRow
  const earned = earnedRow as (UserActivityBadgeRow & { poi: PoiRow | null }) | null

  // 숨김 배지는 받기 전까지 존재하지 않는 배지와 같은 404다 — 이름·조건·그림이 어디에도 내려가지 않는다
  // (티켓 20261018_1815 3회). 조회 주체(`?u=` 대상 또는 나)가 받았으면 다른 배지처럼 보인다.
  if (isHiddenUnearned(badgeRow, new Set(earned ? [badgeRow.id] : []))) notFound()

  // [20261122_1222] 전체 화면 배경 테마 레이어는 그리지 않는다(티켓 틀로 대체). 이미지 카드 «안» 블롭 애니메이션만 남긴다
  // (우선순위 규칙은 badgeBackgroundTheme.ts 한 곳). 히어로에는 themedBackground 끔을 넘겨 오라 배경이 나오게 한다.
  const badgeCardAnimation = getBadgeBackgroundAnimation(badgeRow)

  // 티켓색은 서버가 요청마다 고른다(원색 5개, 이미지 색과 겹치면 제외). 클라이언트에서 칠하지 않는다.
  const ticketColor = pickTicketColor(badgeRow.bg_colors ?? [])
  // 페이지 바탕은 다른 화면과 같은 기본 --background다(크림 덮어쓰기는 2026-11-22 사용자 지시로 걷었다, 티켓 20261122_1424). 절취선 점·홈도 이 값을 따른다.
  const shareWrapStyle: React.CSSProperties = { padding: '24px 16px calc(32px + env(safe-area-inset-bottom))' }
  // 공유 버튼이 없을 때(미획득·타인 배지)도 티켓과 푸터 사이에 버튼 아래와 같은 여백을 둔다(티켓 20261122_1442, 사용자 지적)
  const noShareSpacerStyle: React.CSSProperties = { paddingBottom: 'calc(32px + env(safe-area-inset-bottom))' }

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
    /** 파괴(조합 소모/미픽업 만료)된 개체 — `?item`으로 지목돼도 대표로 쓰지 않는다(20260907_2059) */
    destroyed_at: string | null
    /** 잠긴 개체(마이그레이션 231) — 이 화면의 어떤 값에도 쓰지 않는다(아래 가림) */
    locked?: boolean
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
        .select('id, serial_number, serial_prefix, obtained_at, expires_at, obtained_by, dropped_at, destroyed_at, locked')
        .eq('inventory_id', (subjectInventory as { id: string }).id)
        .eq('badge_id', id)
        .order('obtained_at', { ascending: false })
      if (itemsError) console.error('[badges/[id]/page] inventory_items(보유 개체) 조회 실패', itemsError)
      const subjectItems = (itemsRaw ?? []) as ItemInventoryInfo[]
      // 잠긴 개체는 열기 전에 이름·그림·설명·컬렉션·트라이브·일련번호를 어느 화면에도 보이지 않는다(운영 로직 7.3절, 티켓 20261018_0054 2회).
      // `?item`이 내 잠긴 개체를 가리키면 이 화면(배지 이름·그림·일련번호)을 그리지 않고 잠긴 상세로 보낸다.
      // 그 밖의 경우에도 잠긴 개체는 보유 목록에서 뺀다 — 대표 개체(일련번호), 이력 목록, 획득 여부, 만료 안내가 잠긴 개체의 값으로 채워지지 않게 한다.
      if (
        isOwnBadge &&
        requestedItemId &&
        subjectItems.some((item) => item.id === requestedItemId && item.locked === true && !item.dropped_at && !item.destroyed_at)
      ) {
        redirect(`/inventory/${encodeURIComponent(requestedItemId)}`)
      }
      allItemInventory = subjectItems.filter((item) => item.locked !== true)
    }

    if (badgeRow.item_book_id) {
      const { data: itemBookRaw, error: itemBookError } = await supabase
        .from('item_books')
        .select('*')
        .eq('id', badgeRow.item_book_id)
        .maybeSingle()
      if (itemBookError) console.error('[badges/[id]/page] item_books 조회 실패', itemBookError)
      // 카드는 «열람 가능»할 때만 그린다 — 링크 대상 `/collections/[id]`가 404이면 안 되기 때문이다
      // (판정은 visibility.ts, 티켓 20261106_1230). 켜진 컬렉션이거나, 꺼졌어도 이 화면 주인이 열린 개체를 가졌으면
      // (= 발급 기록이 있다) 그린다. 잠긴 개체는 allItemInventory에서 이미 빠져 있어 꺼진 컬렉션이 드러나지 않는다.
      const itemBookCandidate = itemBookRaw as ItemBookRow | null
      itemBook =
        itemBookCandidate && isItemBookViewable(itemBookCandidate, allItemInventory.length > 0, new Date().toISOString())
          ? itemBookCandidate
          : null
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
    bg_colors: string[] | null
    owned: boolean
  }[] = []
  if (prereqs.length > 0) {
    const ownedBadgeIds = new Set((ownedBadgesRaw ?? []).map((b: { badge_id: string }) => b.badge_id))
    // 소프트 삭제된 선행 배지는 조회 대상에서 제외한다(20260824_007) — 필터로 매치가 안 되면
    // 아래 map에서 해당 항목만 걸러내 목록에서 빠지고 나머지 선행 배지는 그대로 유지한다.
    const { data: prereqBadgesRaw, error: prereqBadgesError } = await supabase
      .from('badges')
      .select('id, name, image_url, description, rarity, is_hidden, bg_colors')
      .in('name', prereqs)
      .is('deleted_at', null)
    if (prereqBadgesError) console.error('[badges/[id]/page] 선행 배지 조회 실패', prereqBadgesError)
    // 받기 전 숨김 배지는 선행 배지 목록에서도 뺀다 — 이름·그림·설명이 이 화면으로 새지 않게 한다(티켓 20261018_1815 3회)
    const prereqBadges = excludeHiddenUnearned(
      (prereqBadgesRaw ?? []) as {
        id: string
        name: string
        image_url: string | null
        description: string | null
        rarity: string
        is_hidden: boolean
        bg_colors: string[] | null
      }[],
      ownedBadgeIds
    )
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
          bg_colors: match.bg_colors,
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
    // [20260907_2059] `?item`으로 지목된 개체가 **이 조회 주체의 인벤토리 안에, 이 배지로,
    // 살아 있는 상태로** 존재할 때만 대표로 채택한다. allItemInventory는 이미
    // `inventory_id = subjectId의 인벤토리` + `badge_id = id`로 좁혀 조회한 목록이므로,
    // 그 안에서 id가 일치하는지 보는 것만으로 소유·배지 일치 검증이 끝난다(추가 쿼리 없음).
    // 무효한 값(타인 소유·타 배지·파괴·오타)은 notFound()가 아니라 조용히 아래 폴백으로
    // 떨어뜨린다 — 공유된 링크가 깨져 보이지 않게 하기 위함이다.
    const requestedItem = requestedItemId
      ? allItemInventory.find(
          (item) => item.id === requestedItemId && !item.dropped_at && !item.destroyed_at
        ) ?? null
      : null
    const activeItem = requestedItem ?? allItemInventory.find(item => !item.dropped_at) ?? null
    const expiresAt = activeItem?.expires_at ?? null
    const expiring = isExpiringSoon(expiresAt)
    // 대표 개체(`?item`으로 지목된 개체 → 없으면 현재 보유 중인 것 중 최신 획득분)의 일련번호 —
    // ItemSerialCode 대형 표시용(20260903_1423). 여러 개체를 보유해도
    // (allItemInventory.length > 1) 대표 1개만 크게 보여주고, 나머지는 아래 ItemEarnHistory
    // 목록에서 확인한다.
    const representativeSerial = activeItem
      ? `${activeItem.serial_prefix ?? '????'}${String(activeItem.serial_number).padStart(6, '0')}`
      : null

    return (
      <div className="min-h-dvh text-foreground bg-background">
        <TopNav
          title={d.common.back}
          backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined}
        />

        <BadgeTicket
          color={ticketColor}
          kindLabel={d.badges.ticketKindItem}
          dateText={formatTicketDate(activeItem?.obtained_at)}
          photo={<TicketPhoto badge={badgeRow} hasEarned={hasEarned} backgroundAnimation={badgeCardAnimation} />}
          afterPhoto={
            <>
              <TicketTitleBoxes badge={badgeRow} />
              {/* 대표 개체 일련번호 — 본인 뷰 + 현재 보유 중인 개체가 있을 때만, 글자 상자 아래에 노출한다(height=50, 20260903_1423). */}
              {isOwnBadge && representativeSerial ? (
                <div className="relative z-10 flex justify-center px-4 pt-0 pb-6">
                  <ItemSerialCode code={representativeSerial} height={50} />
                </div>
              ) : null}
            </>
          }
          body={
            <>
              {/* info-section — 본인 뷰이거나 미보유 안내가 필요한 경우만 렌더링 */}
              {(isOwnBadge || !hasEarned) && (
                <div className="relative z-10 flex flex-col gap-5 px-4 pb-3">
                  {isOwnBadge && allItemInventory.length > 0 && (
                    // activeItemId — 히어로에 일련번호가 크게 표시된 개체를 그대로 넘긴다(20260907_2059 보완).
                    <ItemEarnHistory
                      hideTitle
                      activeItemId={activeItem?.id ?? null}
                      items={allItemInventory.map(item => ({
                        id: item.id,
                        serial: `${item.serial_prefix ?? '????'}${String(item.serial_number).padStart(6, '0')}`,
                        obtained_at: item.obtained_at,
                        expires_at: item.expires_at,
                      }))}
                    />
                  )}

                  {!hasEarned && (
                    <Card className="text-center">
                      <p className="text-base text-[var(--muted)]">{d.badges.notEarnedTitle}</p>
                    </Card>
                  )}
                </div>
              )}

              {/* desc-section — 컬렉션 링크 또는 만료 임박 안내가 있을 때만 렌더링 */}
              {(itemBook || expiring) && (
                <div className="relative z-10 flex flex-col gap-5 px-4 pt-3 pb-6">
                  {/* 속한 컬렉션 링크 */}
                  {itemBook && (
                    <ListRow
                      href={`/collections/${itemBook.id}${!isOwnBadge && subjectUsername ? `?u=${subjectUsername}` : ''}`}
                      leadShape="tile"
                      lead={
                        /* 컬렉션 이미지는 어드민 자유 입력이 가능했던 필드다. next/image에 직접 넘기면
                           미등록 호스트 하나로 배지 상세 화면 전체가 500이 되므로 SafeImage로 렌더한다
                           (20260824_005). 폴백은 이미지가 없을 때 MagicBookIcon. */
                        <SafeImage
                          src={itemBook.image_url}
                          alt=""
                          width={48}
                          height={48}
                          fallback={<MagicBookIcon className="w-5 h-5 text-muted" />}
                        />
                      }
                      title={itemBook.name}
                      chevron
                    />
                  )}

                  {/* 만료 임박 안내 */}
                  {expiring && (
                    <Card>
                      <p className="text-base text-foreground">{d.inventory.expiringSoonTitle}</p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">{d.inventory.expiringSoonBody}</p>
                    </Card>
                  )}
                </div>
              )}
            </>
          }
        />

        {/* 공유하기 — 티켓 밖 하단. 본인이 획득한 배지에서만 보인다(미획득·타인 배지에는 두지 않는다) */}
        {isOwnBadge && hasEarned ? (
          <div style={shareWrapStyle}>
            <BadgeShareButton
              badgeId={id}
              badgeType="item"
              imageUrl={badgeRow.image_url}
              badgeName={badgeRow.name}
              hasEarned={hasEarned}
            />
          </div>
        ) : (
          <div aria-hidden="true" style={noShareSpacerStyle} />
        )}
      </div>
    )
  }

  // ========== 변형 3: 체크인 배지 ==========
  if (badgeRow.type === 'checkin') {
    return (
      <div className="min-h-dvh text-foreground bg-background">
        <TopNav
          title={d.common.back}
          backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined}
        />

        <BadgeTicket
          color={ticketColor}
          kindLabel={d.badges.ticketKindCheckin}
          dateText={formatTicketDate(checkinEarns[0]?.earned_at)}
          /* 방문 횟수 칩 — 아이템 배지의 등급 칩과 같은 자리(카드 안 이름 바로 위)에 «×N»을 둔다. 2회 이상일 때만 그린다(2026-11-09 사용자 지시) */
          photo={<TicketPhoto badge={badgeRow} hasEarned={hasEarned} backgroundAnimation={badgeCardAnimation} />}
          afterPhoto={<TicketTitleBoxes badge={badgeRow} chipExtra={checkinEarns.length > 1 ? <VisitCountChip count={checkinEarns.length} /> : undefined} />}
          body={
            <>
              {/* info-section — 체크인 배지는 «획득 조건» 카드를 두지 않는다(2026-11-09 사용자 지시) */}
              <div className="relative z-10 flex flex-col gap-5 px-4 pb-3">
                {poi && <PoiMapButton lat={poi.latitude} lng={poi.longitude} poiName={poi.name} />}
                <PoiEarnHistory hideTitle poiEarns={checkinEarns.map((e) => ({
                  id: e.id,
                  earned_at: e.earned_at,
                  triggered_by_activity_name: e.triggered_by_activity_name ?? null,
                  triggered_by_distance_km: e.triggered_by_distance_km ?? null,
                  triggered_by_activity_date: e.triggered_by_activity_date ?? null,
                  triggered_by_strava_id: e.triggered_by_strava_id ?? null,
                }))} />
              </div>

              {/* action-section */}
              <div className="relative z-10 flex flex-col gap-5 pt-3 px-4 pb-6">
                {badgeRow.patch_available && (
                  <a
                    href="#"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-14 w-full rounded-full bg-surface text-base text-foreground inline-flex items-center justify-center active:scale-95 transition-transform duration-100"
                  >
                    {d.badges.physicalPatchButton} ↗
                  </a>
                )}

                {!hasEarned && (
                  <Card className="text-center">
                    <p className="text-base text-[var(--muted)]">{d.badges.notEarnedTitle}</p>
                  </Card>
                )}
              </div>
            </>
          }
        />

        {/* 공유하기 — 티켓 밖 하단 */}
        {isOwnBadge && hasEarned ? (
          <div style={shareWrapStyle}>
            <BadgeShareButton
              badgeId={id}
              badgeType="checkin"
              imageUrl={badgeRow.image_url}
              badgeName={badgeRow.name}
              hasEarned={hasEarned}
            />
          </div>
        ) : (
          <div aria-hidden="true" style={noShareSpacerStyle} />
        )}
      </div>
    )
  }

  // ========== 변형 1: 액티비티 배지 (catch-all) ==========
  return (
    <div className="min-h-dvh text-foreground bg-background">
      <TopNav
        title={d.common.back}
        backHref={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined}
      />

      <BadgeTicket
        color={ticketColor}
        kindLabel={d.badges.ticketKindActivity}
        dateText={formatTicketDate(earned?.earned_at)}
        photo={<TicketPhoto badge={badgeRow} hasEarned={hasEarned} backgroundAnimation={badgeCardAnimation} />}
        afterPhoto={<TicketTitleBoxes badge={badgeRow} />}
        body={
          <>
            {/* info-section */}
            <div className="relative z-10 flex flex-col gap-5 px-4 pb-3">
              {/* 획득 조건 다크 카드 */}
              <BadgeConditionCard
                hideTitle
                text={formatBadgeConditionText(badgeRow.condition_json, badgeRow.name, badgeRow.id)}
                spec={formatBadgeConditionSpec(badgeRow.condition_json)}
              />

              {/* 선행 배지 조건 */}
              {prereqStatus.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-base font-bold text-foreground">{d.badges.prerequisiteTitle}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {prereqStatus.map((p) => (
                      <BadgeGridCard
                        key={p.id}
                        name={p.name}
                        imageUrl={p.image_url}
                        bgColors={p.bg_colors}
                        rarity={p.rarity as BadgeRarity}
                        href={`/badges/${p.id}${!isOwnBadge && subjectUsername ? `?u=${subjectUsername}` : ''}`}
                        earned={p.owned}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 포인트 보상 — 미션 상세의 포인트 보상 행과 같은 모양이다(2026-11-09 사용자 지시): tint 행 + 서클 lead + «N 포인트».
                  획득 전후로 문구를 가르지 않는다. «지급했다»·«드렸다» 같은 표현을 쓰지 않고 값만 보인다. */}
              {badgeRow.point_reward > 0 && (
                <ListRow
                  tone="tint"
                  leadShape="round"
                  lead={
                    <span className="w-full h-full flex items-center justify-center" style={{ background: 'var(--accent)' }}>
                      <CoinIcon className="w-5 h-5" style={{ color: 'var(--accent-foreground)' }} />
                    </span>
                  }
                  title={tPoint(d.badges.pointRewardLine, { points: badgeRow.point_reward.toLocaleString('ko-KR') })}
                />
              )}
            </div>

            {/* action-section */}
            <div className="relative z-10 flex flex-col gap-5 pt-3 px-4 pb-6">
              {/* 실물 패치 버튼 */}
              {badgeRow.patch_available && (
                <a
                  href="#"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-14 w-full rounded-full bg-surface text-base text-foreground inline-flex items-center justify-center active:scale-95 transition-transform duration-100"
                >
                  {d.badges.physicalPatchButton} ↗
                </a>
              )}

              {/* 획득 정보 (획득한 경우) */}
              {earned && (
                <Card>
                  {/* 제목(«획득 정보»)을 뺀 뒤로 행 묶음이 카드 위아래 가운데에 오도록 위아래 모두 행 여백만큼 당긴다(티켓 20261122_1416) */}
                  <div className="flex flex-col -my-3">
                    <ListRow
                      tone="flat"
                      titleVariant="label"
                      titleLines={0}
                      title={d.badges.earnedAt}
                      value={<LocalDate iso={earned.earned_at} stamp stampBreak />}
                      valueNoWrap
                    />
                    {earned.triggered_by_activity_name && (
                      <ListRow tone="flat" titleVariant="label" titleLines={0} title={d.badges.triggerActivity} value={earned.triggered_by_activity_name} />
                    )}
                    {earned.triggered_by_distance_km && (
                      <ListRow
                        tone="flat"
                        titleVariant="label"
                        titleLines={0}
                        title={d.badges.triggerDistance}
                        value={t(d.badges.triggerDistanceValue, { km: earned.triggered_by_distance_km })}
                      />
                    )}
                    {earned.triggered_by_activity_date && (
                      <ListRow
                        tone="flat"
                        titleVariant="label"
                        titleLines={0}
                        title={d.badges.triggerDate}
                        value={<LocalDate iso={earned.triggered_by_activity_date} stamp stampBreak />}
                        valueNoWrap
                      />
                    )}
                  </div>
                  {earned.triggered_by_strava_id && (
                    <div className="mt-3">
                      <StravaLink stravaId={earned.triggered_by_strava_id} />
                    </div>
                  )}
                </Card>
              )}

              {/* 미획득 안내 */}
              {!hasEarned && (
                <Card className="text-center">
                  <p className="text-base text-[var(--muted)]">{d.badges.notEarnedTitle}</p>
                </Card>
              )}
            </div>
          </>
        }
      />

      {/* 공유하기 — 티켓 밖 하단 */}
      {isOwnBadge && hasEarned ? (
        <div style={shareWrapStyle}>
          <BadgeShareButton
            badgeId={id}
            badgeType="activity"
            imageUrl={badgeRow.image_url}
            badgeName={badgeRow.name}
            hasEarned={hasEarned}
          />
        </div>
      ) : (
        <div aria-hidden="true" style={noShareSpacerStyle} />
      )}
    </div>
  )
}
