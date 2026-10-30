/**
 * Strava 활동 동기화 핵심 로직
 * - strava_connections에서 토큰 조회 및 갱신
 * - last_synced_at 이후 활동만 가져오기 (색인 지연 대비 overlap 포함)
 * - strava_activities로 멱등 처리 (이미 처리된 활동은 재처리하지 않음)
 * - 배지 엔진 호출
 * - last_synced_at 업데이트
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { decrypt, encrypt } from '@/lib/utils'
import { getAllActivities, getActivityStreams, refreshStravaToken, type ActivityStreams } from '@/lib/strava/api'
import {
  StravaDisconnectedError,
  isStravaAuthFailureError,
  isStravaRevokedError,
  type StravaDisconnectReason,
} from '@/lib/strava/connection-state'
import { markStravaDisconnected } from '@/lib/strava/connection-write'
import { countPendingItems, SyncPendingItemsError } from '@/lib/strava/pending-items'
import { assertNotSuspended, getSuspensionPeriods } from '@/lib/suspension/suspension'
import { assertHasTribe } from '@/lib/tribe/gate'
import { isDuringSuspension } from '@/lib/suspension/suspension-contract'
import { qualifyActivity, MIN_QUALIFIED_MOVING_TIME_SEC, type FilterReason, type SourceMeta } from '@/lib/strava/qualification'
import { detectAndExcludeTransitSegments, needsTransitStreams } from '@/lib/strava/transitSegment'
import { applyTypeMismatch } from '@/lib/strava/typeMismatch'
import { evaluateBadges } from '@/lib/badge-engine/index'
import { issueSyncItemBadges } from '@/lib/drop-engine/syncIssueRun'
import { matchPoisForActivity } from '@/lib/poi/matcher'
import { isActivityWithinBadgeWindow } from '@/lib/poi/checkin-window'
import { awardPoints } from '@/lib/points'
import { awardBadgeReceiveScore } from '@/lib/chapter/badgeReceive'
import { checkItemBookCompletion } from '@/lib/itembook/checker'
import { findCompletableItemBooks } from '@/lib/itembook/completable'
import { checkMissions } from '@/lib/missions/checker'
import { recordFeedEvent } from '@/lib/activity-feed'
import { createNotification, dailyGroupKey } from '@/lib/notifications'
import { recordActivityRecap } from '@/lib/notifications/recap'
import { selectCompletableDrafts } from '@/lib/notifications/batch/collections'
import type { CreateNotificationInput, NotificationType } from '@/lib/notifications'
import { getAbusingPolicy, DEFAULT_POLICY, effectiveVehicleSpeedFilterKmh } from '@/lib/abusing/policy'
import { classifyStravaSyncFailure, recordStravaSyncFailure } from '@/lib/strava/syncFailures'
import { recordOnboardingQuestCompletion } from '@/lib/onboarding-quest/completion'
// JAM 2.0 잼 정산과 대량 수령 경보(티켓 20261017_1423) — 서버 전용 모듈. 이 파일에서만 부른다.
import { getJamPolicy } from '@/lib/jam/policy'
import { settleActivities, type JamSettlementItem } from '@/lib/jam/settlement'
import { runSyncCapsuleAutoFill } from '@/lib/capsule/sync-auto-fill'
import { alertMassEarnIfNeeded, readMassEarnBaseline } from '@/lib/jam/massEarnAlert'
// JAM! 카테고리 — 서비스 사용량 배지(티켓 20260910_1557). 카운터 증가·판정 로직은
// recordDailySyncAndEvaluate() 한 곳(usageBadges.ts)에 있다 — 이 파일은 synced>0 게이트만 쥔다.
import { recordDailySyncAndEvaluate, evaluateCheckinUsageBadges, type UsageBadgeEarned } from '@/lib/badge-engine/usageBadges'
// JAM! 행동 지표(미션·컬렉션·가입 경과일·활동일·체크인 일수) 판정 — 동기화 끝에서 한 번 부른다
// (티켓 20261001_0633). 호출 지점별로 어떤 키를 넘기는지는 jamActionProgressTriggers.ts가 정한다.
import { evaluateJamActionBadges, type JamActionTrigger } from '@/lib/badge-engine/jamActionBadges'
import { JAM_EMPTY_SYNC_TRIGGERS, JAM_SYNC_TRIGGERS, jamTriggersForCapsuleOpen } from '@/lib/badge-engine/jamActionProgressTriggers'
import {
  getJamActivityType,
  metersToKm,
  metersPerSecToKmH,
  extractExtendedActivityFields,
  normalizeCadenceForActivityType,
} from '@/types/strava'
import type { StravaSummaryActivity, NormalizedActivity } from '@/types/strava'
import type {
  StravaConnectionRow,
  BadgeType,
  BadgeRarity,
  PoiRow,
  StravaActivityRow,
} from '@/types/database'

/** 싱크 1회당 POI 매칭(Streams API)을 수행할 최대 활동 수 (최신순). Strava rate limit·타임아웃 방지 */
const MAX_POI_MATCH_ACTIVITIES_PER_SYNC = 10
/** 어뷰징 필터(구간 검사용 Streams 조회 포함)를 한 번에 병렬로 검사하는 활동 수 — Strava 호출 폭주 방지 */
const ABUSING_CHECK_CONCURRENCY = 5
/** strava_activities에 한 번에 올리는 행 수 상한 — 걸러진 이력이 많은 첫 동기화용 */
const RECORD_UPSERT_CHUNK_SIZE = 200
/**
 * 커서 overlap — Strava/Garmin 쪽 색인 지연으로 활동이 마지막으로 가져온 활동의 시작
 * 시각 시점엔 목록에 안 잡혔다가 뒤늦게 나타나는 경우를 대비해, 매번 이만큼 앞선
 * 시각부터 다시 조회한다(티켓 20260922_2207 — 기준을 last_synced_at에서
 * strava_activities 최신 start_date로 바꿨다). strava_activities 멱등 처리 덕분에
 * 겹치는 구간을 다시 훑어도 중복 보상은 없다.
 *
 * 며칠 단위로 넓히지 않는 이유: 첫 싱크는 최신 1건만 처리하므로(아래 4-2 근처 분기) 그
 * 값이 곧 다음 조회의 하한이 된다 — overlap을 넓히면 첫 싱크가 일부러 건너뛴 과거
 * 이력이 두 번째 동기화에서 한꺼번에 들어와 온보딩 순간 배지가 쏟아지는 문제
 * (20260801_001)가 되살아난다.
 */
export const SYNC_OVERLAP_SECONDS = 15 * 60

/**
 * 동기화 응답에 실어보내는 "이번에 획득한 배지" 요약 (20260823_007).
 * 획득 연출(BadgeRevealCarousel)이 카드 한 장을 그리는 데 필요한 최소 필드만 담는다.
 */
export interface EarnedBadgeSummary {
  id: string
  name: string
  description: string
  /** badges.image_url이 null이면 빈 문자열 — 기존 페이로드 관례와 동일 */
  imageUrl: string
  /**
   * 등급형은 등급 문자열, **무한레벨형은 `null`**(마이그레이션 130). 획득 연출은 이 값을
   * 그대로 `RarityBadge`에 넘긴다 — 중간에서 `?? 'common'`으로 접으면 Lv.N 배지가
   * Common 칩을 달고 나온다 (티켓 20260905_0030).
   */
  rarity: BadgeRarity | null
  /**
   * 레벨형 배지의 Lv.N. 등급형·반복형은 null이다(마이그레이션 130 — rarity와 배타).
   * 획득 연출이 등급 칩과 Lv.N 칩 중 무엇을 그릴지 가르는 유일한 근거다 (20260905_0038 B).
   */
  level: number | null
  /**
   * 지금까지 이 배지를 획득한 횟수(`user_activity_badges.earn_count`).
   * 반복형은 첫 발급 시점에 이미 쌓인 회차를 전부 심으므로 1보다 클 수 있다.
   * 그 이후의 회차 증가는 발급이 아니라 연출을 다시 만들지 않는다(20260905_0030 §2) —
   * 즉 «×N»을 말할 수 있는 자리는 이 첫 연출뿐이다.
   */
  earnCount: number
  type: BadgeType
}

/**
 * 이번 싱크에서 발급된 배지 id 목록으로 badges 테이블을 1회 조회해 상세를 채운다.
 *
 * - PostgREST는 `.in()` 결과 순서를 보장하지 않으므로 **id 수집 순서(=획득 순서)로 다시 정렬**한다.
 * - 소프트 삭제된 배지(deleted_at IS NOT NULL)는 제외한다.
 */
async function fetchEarnedBadgeDetails(
  supabase: SupabaseClient,
  badgeIds: string[],
  /** 회차(earn_count) 조회 대상 유저. 없으면 전부 1로 둔다(회차를 모르면 ×N을 그리지 않는다) */
  userId?: string
): Promise<EarnedBadgeSummary[]> {
  if (badgeIds.length === 0) return []

  // 같은 배지가 두 경로에서 중복 수집될 여지를 차단 (최초 획득 순서 유지)
  const orderedIds = Array.from(new Set(badgeIds))

  const [{ data, error }, { data: earnRows, error: earnError }] = await Promise.all([
    supabase
      .from('badges')
      .select('id, name, description, image_url, rarity, level, type')
      .in('id', orderedIds)
      .is('deleted_at', null),
    // 회차는 badges가 아니라 소유 행에 있다(20260905_0038 B). 아이템 배지처럼 이 테이블에
    // 행이 없는 종류는 조회되지 않고 기본값 1로 남는다.
    userId
      ? supabase.from('user_activity_badges').select('badge_id, earn_count').eq('user_id', userId).in('badge_id', orderedIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (error) {
    // 상세 조회 실패가 동기화 자체를 막지는 않는다 — 연출만 생략된다.
    console.error('[fetchEarnedBadgeDetails] 획득 배지 상세 조회 오류:', error)
    return []
  }
  if (earnError) {
    // 회차만 못 읽은 것이라 연출 자체는 그대로 진행한다(×N만 생략된다).
    console.error('[fetchEarnedBadgeDetails] 획득 회차 조회 오류:', earnError)
  }

  type EarnedBadgeRow = {
    id: string
    name: string
    description: string | null
    image_url: string | null
    rarity: BadgeRarity | null
    level: number | null
    type: BadgeType
  }
  const byId = new Map<string, EarnedBadgeRow>()
  for (const row of (data ?? []) as EarnedBadgeRow[]) byId.set(row.id, row)
  const earnCountById = new Map<string, number>()
  for (const row of (earnRows ?? []) as { badge_id: string; earn_count: number | null }[]) {
    earnCountById.set(row.badge_id, row.earn_count ?? 1)
  }

  return orderedIds
    .map((id) => byId.get(id))
    .filter((row): row is EarnedBadgeRow => Boolean(row))
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      imageUrl: row.image_url ?? '',
      rarity: row.rarity,
      level: row.level,
      earnCount: earnCountById.get(row.id) ?? 1,
      type: row.type,
    }))
}

/**
 * 응답에 **상세를 실어 내려보내는** 배지 카드 수 상한 (20260823_008).
 * 상한을 서버 한 곳에만 두어 스파이크·서비스·타입 문서로 규칙이 갈라지지 않게 한다.
 * 넘치는 만큼은 상세 없이 개수(earnedBadgesMore)로만 전달한다 —
 * 장기 미접속 후 싱크로 배지를 대량 획득해도 description 포함 페이로드가 커지지 않는다.
 */
export const EARNED_BADGE_DETAIL_LIMIT = 10

/** 획득 연출용 응답 조각. `/api/strava/sync`와 최근 획득 조회 API가 같은 계약을 쓴다. */
export interface EarnedBadgePayload {
  /** 획득 순서대로 최대 EARNED_BADGE_DETAIL_LIMIT건 */
  earnedBadges: EarnedBadgeSummary[]
  /** 상세를 싣지 못한 잔여 개수. 0이면 "전체 보기" 카드가 뜨지 않는다 */
  earnedBadgesMore: number
  /**
   * 유저가 지금까지 소유한 배지(`user_activity_badges` 전체 행)가 이번에 되읽은 배지들뿐인지 —
   * GA4 first_badge_earned 판정용 (20260903_1034). badgeIds가 비어 있으면 false.
   * `user_activity_badges`는 배지 종류(활동/아이템/POI/미션·컬렉션 보상) 무관하게 소유권을
   * 기록하는 단일 테이블이라, 이 카운트 비교만으로 "정말 처음 받은 배지인지"를 판정할 수 있다.
   */
  isFirstBadgeEver: boolean
}

/**
 * 발급된 배지 id 목록 → 획득 연출용 응답 조각.
 * 상세 조회는 전체를 한 번에 하고(소프트 삭제 제외·중복 제거가 여기서 끝난다),
 * **응답에 싣는 단계에서만** 상한으로 자른다 — 잔여 개수가 정확해진다.
 */
export async function buildEarnedBadgePayload(
  supabase: SupabaseClient,
  badgeIds: string[],
  userId: string
): Promise<EarnedBadgePayload> {
  const all = await fetchEarnedBadgeDetails(supabase, badgeIds, userId)
  const earnedBadges = all.slice(0, EARNED_BADGE_DETAIL_LIMIT)

  let isFirstBadgeEver = false
  if (all.length > 0) {
    const { count, error: countError } = await supabase
      .from('user_activity_badges')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (countError) {
      console.error('[buildEarnedBadgePayload] user_activity_badges 카운트 조회 오류:', countError)
    } else {
      isFirstBadgeEver = (count ?? 0) === all.length
    }
  }

  return { earnedBadges, earnedBadgesMore: all.length - earnedBadges.length, isFirstBadgeEver }
}

/**
 * ① 활동 결산에 **활동배지**를 싣는다 — 티켓 20260827_014
 *
 * 20260824_019의 #1(활동배지)·#2(희귀 배지) 두 소식을 결산 한 행으로 합쳤다. 희귀 배지는
 * 별행으로 승격하지 않고 결산 안에서 헤드라인을 가져간다(E1) — 별행으로 두면 같은 활동의
 * 보상이 알림함에서 다시 쪼개진다.
 *
 * 배지 엔진은 배치 전체를 한 번에 평가하므로 개별 활동에 귀속시킬 수 없다. 결산의 묶음
 * 단위가 KST 하루라 귀속이 필요 없어졌다.
 *
 * **JAM! 사용량 배지(활동배지 아님)도 이 함수로 알린다 — 티켓 20260910_2258.** 이 함수는
 * badge id 목록을 `badges`로 되읽어 결산에 싣는 것일 뿐 배지 «종류»를 가정하지 않으므로,
 * `id`만 넘기면 사용량 배지도 그대로 처리된다. 새 알림 타입·문구를 만들지 않고 기존
 * `activity_recap` 결산에 그대로 합류시키는 것이 이 재사용의 목적이다. 호출부 2곳:
 * - `processFetchedActivities`(이 파일) — 동기화로 발급된 활동배지 + JAM! 배지(사용량:
 *   하루 동기화 횟수)를 함께 넘긴다.
 * - `follows/route.ts` — 팔로우/팔로워 수로 발급된 JAM! 배지를 넘긴다(activityIds는 빈
 *   배열 — 귀속시킬 활동이 없다).
 */
export async function notifyActivityBadgesEarned(
  supabase: SupabaseClient,
  userId: string,
  activityBadgeIds: string[],
  /** 이번 배치가 처리한 활동들 — 결산이 「활동 N건에서」로 올라갈지(F2)의 근거다 */
  activityIds: number[]
): Promise<void> {
  if (activityBadgeIds.length === 0) return

  const orderedIds = Array.from(new Set(activityBadgeIds))
  const { data, error } = await supabase
    .from('badges')
    .select('id, name, rarity')
    .in('id', orderedIds)
    .is('deleted_at', null)

  if (error) {
    // 소식이 하나 덜 나갈 뿐 동기화 자체를 막지 않는다
    console.error('[notifyActivityBadgesEarned] 배지 조회 오류 — 소식 생성 생략:', error)
    return
  }

  // rarity는 v5에서 nullable이다(마이그레이션 130). 여기서 `BadgeRarity`로 못박아 캐스팅하면
  // 무한레벨형이 타입상 등급을 가진 것처럼 통과해 결산에서 Common으로 표시된다 —
  // payload가 JSONB라 그 아래로는 타입이 잡아주지 못한다 (티켓 20260905_0030).
  type Row = { id: string; name: string; rarity: BadgeRarity | null }
  const byId = new Map(((data ?? []) as Row[]).map((r) => [r.id, r]))
  const rows = orderedIds.map((id) => byId.get(id)).filter((r): r is Row => Boolean(r))
  if (rows.length === 0) return

  await recordActivityRecap(userId, {
    activity_ids: activityIds,
    activity_badges: rows.map((r) => ({ id: r.id, name: r.name, rarity: r.rarity })),
  })
}

/**
 * JAM! 행동 지표(미션·컬렉션·가입 경과일·활동일·체크인 일수) 판정 — 동기화가 끝날 때 부른다 (티켓 20261001_0633)
 *
 * 판정이 던져도 동기화는 정상 완료돼야 하므로 `try/catch`로 격리한다(실패하면 로그만 남기고 빈 배열).
 * **주입된 `supabase`를 그대로 넘긴다** — 동기화는 클라이언트 주입 사슬을 유지한다(20260831_1300).
 * 획득 배지는 호출부가 결산(`notifyActivityBadgesEarned`)과 `earnedBadgeIds`에 합친다.
 */
async function evaluateJamActionSafely(
  supabase: SupabaseClient,
  userId: string,
  triggers: readonly JamActionTrigger[]
): Promise<UsageBadgeEarned[]> {
  try {
    return await evaluateJamActionBadges(userId, triggers, supabase)
  } catch (error) {
    console.error(`[evaluateJamActionSafely] JAM! 행동 지표 판정 실패 (userId: ${userId}, triggers: ${triggers.join(',')}):`, error)
    return []
  }
}

/**
 * StravaSummaryActivity → NormalizedActivity 변환
 *
 * v5 확장 6필드(티켓 20260905_0029)를 함께 읽는다. 전부 목록 엔드포인트 응답에 이미 오던
 * 값이라 추가 API 호출이 없다. 값이 없는 확장 필드는 **키 자체가 생기지 않는다**
 * (`extractExtendedActivityFields` 주석 참고) — 백필도 같은 함수를 쓴다.
 *
 * **테스트에서 참조하므로 export한다** (`__tests__/normalize-activity.test.ts`).
 */
export function normalizeActivity(activity: StravaSummaryActivity): NormalizedActivity {
  const jamActivityType = getJamActivityType(activity)
  const extended = extractExtendedActivityFields(activity)
  // 저장 시점 ×2 정규화(티켓 20260906_0110 ⑤) — 러닝·트레일러닝만, 자전거는 원값 그대로.
  // 값이 없으면(cadence 미제공) 키 자체를 만들지 않는다 — `extractExtendedActivityFields`의
  // 「값이 없으면 키가 없다」 관례를 여기서 깨지 않는다.
  const normalizedCadence = normalizeCadenceForActivityType(jamActivityType, extended.avgCadence)
  return {
    stravaId: activity.id,
    name: activity.name,
    distanceKm: metersToKm(activity.distance),
    movingTimeSec: activity.moving_time,
    elevationGainM: activity.total_elevation_gain,
    jamActivityType,
    startDate: activity.start_date,
    startDateLocal: activity.start_date_local,
    averageSpeedKmh: metersPerSecToKmH(activity.average_speed),
    startLatLng: activity.start_latlng.length === 2
      ? (activity.start_latlng as [number, number])
      : null,
    endLatLng: activity.end_latlng.length === 2
      ? (activity.end_latlng as [number, number])
      : null,
    weatherTempC: activity.average_temp ?? null,
    ...extended,
    ...(normalizedCadence !== undefined ? { avgCadence: normalizedCadence } : {}),
  }
}

/**
 * 이미 처리된(strava_activities에 기록된) strava_id 집합 조회.
 * **걸러진 행(`filter_reason`이 있는 행)도 포함한다** — 같은 활동을 다시 가져와 다시 거르거나 다시
 * 정산하지 않기 위해서다(티켓 20261017_1421). 이력 조회(`getActivityHistory`)와 정반대로 둔다.
 */
export async function getProcessedStravaIds(
  supabase: SupabaseClient,
  userId: string,
  stravaIds: number[]
): Promise<Set<number>> {
  if (stravaIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('strava_activities')
    .select('strava_id')
    .eq('user_id', userId)
    .in('strava_id', stravaIds)

  if (error) {
    // 테이블이 아직 없거나(마이그레이션 미적용) 오류 시 — 안전하게 "미처리"로 간주해
    // 기존 동작(매번 처리)으로 폴백한다. 멱등 보장이 깨지는 대신 완전 중단은 피함.
    console.error('[getProcessedStravaIds] 조회 오류 — 미처리로 폴백:', error)
    return new Set()
  }
  return new Set((data as { strava_id: number }[]).map((r) => r.strava_id))
}

/** strava_activities에 기록할 활동 1건 — 인정(`filterReason` null)과 걸러짐을 한 모양으로 담는다 */
interface ProcessedActivityRecord {
  activity: NormalizedActivity
  /** NULL이면 인정. 값이 있으면 걸러진 사유 */
  filterReason: FilterReason | null
  /** 인정 판정에 쓴 원본 값의 유무·모양 요약 (경로 요약 본문·좌표는 담지 않는다) */
  sourceMeta: SourceMeta
}

/** 처리 완료된 활동들을 strava_activities에 기록 (멱등 처리 기준 데이터). 걸러진 활동도 사유와 함께 기록한다 */
async function recordProcessedActivities(
  supabase: SupabaseClient,
  userId: string,
  records: ProcessedActivityRecord[],
  processedVia: StravaActivityRow['processed_via']
): Promise<void> {
  if (records.length === 0) return
  const rows = records.map(({ activity: a, filterReason, sourceMeta }) => ({
    user_id: userId,
    strava_id: a.stravaId,
    start_date: a.startDate,
    jam_activity_type: a.jamActivityType,
    distance_km: a.distanceKm,
    normalized: a,
    processed_via: processedVia,
    filter_reason: filterReason,
    source_meta: sourceMeta,
  }))
  // 첫 동기화는 걸러진 이력이 수백 건일 수 있어 한 번에 올리지 않고 나눠 올린다
  for (let i = 0; i < rows.length; i += RECORD_UPSERT_CHUNK_SIZE) {
    const { error } = await supabase
      .from('strava_activities')
      .upsert(rows.slice(i, i + RECORD_UPSERT_CHUNK_SIZE), { onConflict: 'user_id,strava_id' })
    if (error) {
      console.error('[recordProcessedActivities] 기록 오류:', error)
    }
  }
}

/** processFetchedActivities의 반환 모양 */
interface ProcessFetchedResult {
  badges: number
  itemBooksCompleted: number
  missionsCompleted: number
  /** 이번 처리에서 발급된 배지 id — 획득 순서(체크인 → 아이템 배지 → 액티비티 → 컬렉션·미션 보상 → 사용량 → JAM! 행동 지표) */
  earnedBadgeIds: string[]
  /** 이번 처리에서 새로 완료된 미션 id — GA4 mission_complete 계측용 (20260903_1034) */
  completedMissionIds: string[]
  /** 이번에 정산한 «인정 활동» 수 — 걸러진 활동과 첫 동기화에서 정산하지 않은 활동은 세지 않는다 */
  settledCount: number
  /** 이번 동기화로 원장에 기록된 잼의 합계. 정산할 활동이 없는 경로는 0이다(티켓 20261017_1423) */
  jamEarned: number
  /** 이번 동기화로 새로 보류된 아이템 배지 개수. 보류가 없으면 0이다(티켓 20261017_1425) */
  pendingItems: number
  /** 활동별 잼 정산 결과— 아이템 배지 발급(2-4)이 개수 계산에 쓸 수 있게 남긴다. 응답에는 싣지 않는다 */
  jamSettlements: JamSettlementItem[]
}

/**
 * 정산할 활동이 0건일 때의 평가 — 배지 평가와 JAM! 가입 경과일 판정만 돈다.
 *
 * 티켓 20260906_1430 — 새 활동이 0건이어도 배지 평가만은 항상 실행한다.
 *
 * 이 이른 반환이 함수 전체(POI 매칭·아이템 드랍·아이템북 완성 체크·미션·배지 평가)를
 * 통째로 건너뛰게 만들어, 아래 §"일반 배지 엔진 호출" 지점의 게이트를 배지 평가에서만
 * 벗겨도 실제로는 여기서 이미 막혀 있었다 — 카탈로그가 늘어난 뒤 유저의 다음 실제
 * 활동까지 배지 엔진이 단 한 번도 돌지 않는 사고(jamfather 22일 미발급, 티켓
 * 20260906_1426 실측)의 원인이 바로 이 이른 반환이다.
 *
 * 아이템 배지 발급(issueSyncItemBadges)·미션(checkMissions)·아이템북 완성 체크는 "활동 1건마다 시도"가
 * 전제라 이 이른 반환을 그대로 유지해 건너뛴다 — 배지 평가와 그 직접 부수효과(결산
 * 소식)만 벗긴다. evaluateBadges는 내부에서 이력 전체를 다시 읽으므로 빈 배열을
 * 넘겨도 이미 조건을 채운 배지를 잡아낼 수 있다.
 *
 * 첫 동기화에서 인정 활동이 하나도 없으면 첫 동기화를 마친 것으로 보지 않는다(운영 로직 3.4절,
 * 티켓 20261017_1421) — `users.initial_sync_done`을 true로 바꾸지 않고 다음 동기화에서 다시 찾는다.
 */
async function evaluateWithoutNewActivities(
  supabase: SupabaseClient,
  userId: string,
  isFirstSync: boolean
): Promise<ProcessFetchedResult> {
  // 새 활동이 없어도 가득 찬 채 남은 캡슐(인벤토리를 비웠거나 트라이브를 고른 뒤)은 «다음 동기화의 맨 앞에서» 열려야 한다(티켓 20261028_1733 3회).
  // 던지지 않는다. 챕터 오름 처리의 챕터 배지 판정은 건너뛰므로(열기 없이 보류만 생긴 오름도 같다, 티켓 20261028_1734 3회) 챕터가 올랐으면 아래 판정에 `chapter_reached`를 더해 이어서 읽는다.
  const capsuleStep = await runSyncCapsuleAutoFill(supabase, userId)
  const activityBadgeIds = isFirstSync
    ? await evaluateBadges(userId, [], { skipInitialSyncFlagUpdate: true })
    : await evaluateBadges(userId, [])
  // JAM! 행동 지표 중 가입 경과일만 판정한다 — 날짜가 지나면 값이 바뀌는 지표는 이것뿐이라, 새 활동이 없는
  // 동기화에서도 따라잡는다(티켓 20261001_0633, R4). 오래 쉰 계정은 배지의 보조 키(최근 30일 활동일)가 막는다.
  // 획득은 결산과 earnedBadgeIds에 합치되, 반환의 `badges` 수에는 넣지 않는다(사용량 배지와 같다).
  const jamBadgeIds = (
    await evaluateJamActionSafely(
      supabase,
      userId,
      [
        ...JAM_EMPTY_SYNC_TRIGGERS,
        ...(capsuleStep.opened || capsuleStep.chapterRose ? (['chapter_reached'] as const) : []),
        ...(capsuleStep.opened ? jamTriggersForCapsuleOpen() : []),
      ]
    )
  ).map((b) => b.id)
  await notifyActivityBadgesEarned(supabase, userId, [...activityBadgeIds, ...jamBadgeIds], [])
  return {
    badges: activityBadgeIds.length,
    itemBooksCompleted: 0,
    missionsCompleted: 0,
    earnedBadgeIds: [...activityBadgeIds, ...jamBadgeIds],
    completedMissionIds: [],
    settledCount: 0,
    jamEarned: 0,
    pendingItems: 0,
    jamSettlements: [],
  }
}

/**
 * 이번에 새로 확인된 활동들을 인정 판정으로 거른 뒤, 인정된 활동만 배지·드랍·미션 엔진에 넣고
 * strava_activities에 기록한다. 걸러진 활동은 사유와 함께 기록만 한다.
 *
 * 처리 순서(운영 로직 3.4절, 티켓 20261017_1421): ① 인정 기준으로 거르기 → ② 어뷰징 필터(교통수단
 * 구간 검사, 종목 불일치, 차량 속도) → 첫 동기화의 «최근 1건» 선택 → ③ 정산(체크인, 아이템 배지 드랍, 배지, 아이템북, 미션).
 * 체크인은 ②를 지난 활동에만 돈다.
 */
export async function processFetchedActivities(
  supabase: SupabaseClient,
  userId: string,
  accessToken: string,
  rawActivities: StravaSummaryActivity[],
  isFirstSync: boolean,
  processedVia: StravaActivityRow['processed_via'] = 'sync'
): Promise<ProcessFetchedResult> {
  if (rawActivities.length === 0) {
    return evaluateWithoutNewActivities(supabase, userId, isFirstSync)
  }

  // 정지 기간 활동 미정산(티켓 20261017_1426, 운영 로직 16.4절) — 정지를 건 시점부터 푼 시점까지 «시작한» 활동은
  // 풀린 뒤에 동기화해도 정산하지 않는다. 구간은 한 번만 읽는다. 읽지 못하면 던져 동기화하지 않는다.
  const suspensionPeriods = await getSuspensionPeriods(supabase, userId)

  // ① 인정 판정 — 다섯 기준을 갖춘 활동만 정산 대상이 된다. 걸러진 활동은 아래에서 사유와 함께 기록만 한다.
  const qualifiedEntries: { raw: StravaSummaryActivity; sourceMeta: SourceMeta }[] = []
  const rejectedRecords: ProcessedActivityRecord[] = []
  for (const raw of rawActivities) {
    const result = qualifyActivity(raw)
    if (isDuringSuspension(Date.parse(raw.start_date), suspensionPeriods)) {
      // 활동 행은 남기고(다시 가져와 처리하지 않도록) 정산은 하지 않는다. 인정 판정 사유보다 먼저 붙는다.
      rejectedRecords.push({
        activity: normalizeActivity(raw),
        filterReason: 'suspended',
        sourceMeta: result.sourceMeta,
      })
      continue
    }
    if (result.qualified) {
      qualifiedEntries.push({ raw, sourceMeta: result.sourceMeta })
    } else {
      rejectedRecords.push({
        activity: normalizeActivity(raw),
        filterReason: result.filterReason,
        sourceMeta: result.sourceMeta,
      })
    }
  }

  if (qualifiedEntries.length === 0) {
    // 인정 활동이 없다 — 걸러진 활동만 기록하고 빈 배치와 같게 처리한다(첫 동기화는 마친 것으로 보지 않는다)
    await recordProcessedActivities(supabase, userId, rejectedRecords, processedVia)
    return evaluateWithoutNewActivities(supabase, userId, isFirstSync)
  }

  // 획득 연출용 — 발급된 배지 id를 발급 순서대로 모은다 (엔진 내부 로직은 건드리지 않고
  // 각 경로가 돌려주는 id만 이어 붙인다).
  const earnedBadgeIds: string[] = []

  // 어뷰징 정책 — 정식 로더로 한 번만 읽어 아래 구간 검사·종목 불일치·차량 속도 필터가 같은 스냅샷을
  // 공유한다. 주입된 supabase 클라이언트를 그대로 넘겨 클라이언트 주입 사슬을 유지한다(20260831_1300).
  const abusingPolicy = await getAbusingPolicy(supabase)

  // 비정상 값 해석(유한·양수가 아니면 기본값)은 effectiveVehicleSpeedFilterKmh 한 곳에 있다 —
  // JAM! 행동 지표의 「활동한 날」 판정(jamActionDayMetrics.ts)이 같은 규칙을 쓴다(티켓 20261001_0633).
  // 20260831_1300 — 이전에는 여기서 abusing_policy를 직접 select해 정식 경로(getAbusingPolicy)의
  // NUMERIC 정규화·조회 실패 로그·키 누락 관측·`id = 1` 조건을 전부 건너뛰었고, truthy 검사
  // 때문에 임계값 0이 조용히 60으로 둔갑했다.
  const configuredVehicleSpeedFilterKmh = abusingPolicy.vehicle_speed_filter_kmh
  const vehicleSpeedFilterKmh = effectiveVehicleSpeedFilterKmh(abusingPolicy)
  if (vehicleSpeedFilterKmh !== configuredVehicleSpeedFilterKmh) {
    // 페일세이프 — 필터식이 `평균속도 <= 임계값`이라 임계값이 0 이하면 사실상 모든 활동이
    // 탈락하고, 통과한 활동만 배지뿐 아니라 아이템 드랍·미션까지 흘러가므로 핵심
    // 보상 루프 전체가 멈춘다. 그래서 폴백 방향을 **핵심 루프를 살리는 쪽**(기본 임계값)으로
    // 고르되, 무음으로 넘기지 않고 로그를 남긴다 (DEV_PROCESS_GUARDRAILS 패턴 9 규칙 1·6).
    // 하한(MIN_VEHICLE_SPEED_FILTER_KMH)은 여기서 재검사하지 않는다 — 정책 검증은 저장
    // 경로(밸런스 설정 «어뷰징» 구역의 칸 정의, lib/admin/balance/abusing.ts)가 소유한다. 운영자가 의도적으로 넣은 값을 소비 지점이 조용히
    // 덮어쓰면 "저장한 값과 실제 동작이 다른" 같은 종류의 불일치가 재발한다.
    console.error(
      `[processFetchedActivities] vehicle_speed_filter_kmh 값이 비정상(${configuredVehicleSpeedFilterKmh}) — ` +
        `기본값 ${DEFAULT_POLICY.vehicle_speed_filter_kmh}km/h로 폴백, userId: ${userId}`
    )
  }

  // 같은 활동의 Streams는 한 번만 조회한다 — 구간 검사(최대 속도 사전 거름)와 체크인 경로 매칭이 같은
  // 조회를 나눠 쓴다. 조회 실패(null)도 캐시해 같은 활동을 다시 부르지 않는다(fail-open 그대로).
  const streamsByActivityId = new Map<number, Promise<ActivityStreams | null>>()
  const getStreamsOnce = (rawActivity: StravaSummaryActivity): Promise<ActivityStreams | null> => {
    let pending = streamsByActivityId.get(rawActivity.id)
    if (!pending) {
      pending = getActivityStreams(rawActivity.id, accessToken)
      streamsByActivityId.set(rawActivity.id, pending)
    }
    return pending
  }

  // ② 어뷰징 필터 — 구간 검사(교통수단 구간 재산정) → 종목 불일치 → 차량 속도 순으로 활동 1건을 판정한다.
  // 체크인보다 **먼저** 돈다(티켓 20261017_1421): 예전엔 체크인이 속도 필터보다 앞서 돌아 걸러질 활동도
  // 체크인 배지를 받았다. 구간 검사용 Streams는 최대 속도가 종목 기준을 넘은 활동에만 조회한다
  // (`needsTransitStreams`) — 기준을 넘는 구간이 있으려면 최대 속도가 기준을 넘어야 하므로 판정 결과는 같고
  // 호출만 줄어든다. 스트림 조회 실패(null)는 fail-open으로 원본을 그대로 돌려준다(20260909_1012).
  const checkAbusingFilters = async (entry: { raw: StravaSummaryActivity; sourceMeta: SourceMeta }) => {
    let activity = normalizeActivity(entry.raw)
    if (needsTransitStreams(activity, abusingPolicy)) {
      const streams = await getStreamsOnce(entry.raw)
      activity = detectAndExcludeTransitSegments(
        activity,
        streams ? { velocitySmooth: streams.velocitySmooth, time: streams.time } : null,
        abusingPolicy
      )
    }
    // 뺀 구간을 제외한 움직인 시간이 10분 미만이면 인정하지 않는다(운영 로직 3.3·16.2절)
    if (!(activity.movingTimeSec >= MIN_QUALIFIED_MOVING_TIME_SEC)) {
      return { activity, sourceMeta: entry.sourceMeta, raw: entry.raw, filterReason: 'too_short' as FilterReason | null }
    }
    const mismatch = applyTypeMismatch(activity, abusingPolicy)
    activity = mismatch.activity
    const sourceMeta: SourceMeta = mismatch.changedFrom
      ? { ...entry.sourceMeta, typeMismatchFrom: mismatch.changedFrom }
      : entry.sourceMeta
    // 걸러진 활동은 `vehicle_speed` 사유로 저장만 한다 — 체크인·드랍·배지·미션에 넣지 않는다.
    const filterReason: FilterReason | null =
      activity.averageSpeedKmh > vehicleSpeedFilterKmh ? 'vehicle_speed' : null
    return { activity, sourceMeta, raw: entry.raw, filterReason }
  }
  type AbusingChecked = Awaited<ReturnType<typeof checkAbusingFilters>>

  // 첫 동기화(신규 연동)는 과거 이력 전체를 소급 정산하지 않고, **인정 기준과 어뷰징 필터를 모두 통과한 활동
  // 가운데 가장 최근 1건**만 반영한다(운영 로직 3.4절). 최신 활동부터 차례로 검사해 통과한 첫 활동에서 멈추고,
  // 가장 최근 활동이 걸러지면 그 전 활동을 본다(필요한 활동만 Streams를 조회한다). 통과한 활동이 없으면 아래에서
  // 첫 동기화를 마친 것으로 보지 않는다. (배지 평가가 과거 이력 전체를 한 번에 넣으면 온보딩 순간 여러 등급이
  // 동시에 터져 나오는 등 성장 경험이 왜곡되는 문제가 있었음 — 아이템 배지도 정산한 그 1건에만 발급한다)
  const checkedEntries: AbusingChecked[] = []
  if (isFirstSync) {
    const newestFirst = [...qualifiedEntries].sort((a, b) => {
      const diff = new Date(b.raw.start_date).getTime() - new Date(a.raw.start_date).getTime()
      return diff !== 0 ? diff : b.raw.id - a.raw.id
    })
    for (const entry of newestFirst) {
      const checked = await checkAbusingFilters(entry)
      checkedEntries.push(checked)
      if (checked.filterReason === null) break
    }
  } else {
    // Strava Streams 호출이 한꺼번에 몰리지 않도록 몇 건씩 나눠 병렬로 검사한다(결과 순서는 입력 순서 그대로)
    for (let i = 0; i < qualifiedEntries.length; i += ABUSING_CHECK_CONCURRENCY) {
      checkedEntries.push(
        ...(await Promise.all(qualifiedEntries.slice(i, i + ABUSING_CHECK_CONCURRENCY).map(checkAbusingFilters)))
      )
    }
  }
  const abusingRejectedRecords: ProcessedActivityRecord[] = checkedEntries
    .filter((c) => c.filterReason !== null)
    .map((c) => ({ activity: c.activity, filterReason: c.filterReason, sourceMeta: c.sourceMeta }))
  const passedEntries = checkedEntries.filter((c) => c.filterReason === null)
  // 모든 필터를 통과한 활동 — 이후 정산(체크인·드랍·배지·미션)에 쓰는 «인정 활동» 목록
  const activitiesFiltered: NormalizedActivity[] = passedEntries.map((c) => c.activity)

  if (passedEntries.length === 0 && isFirstSync) {
    // 인정 기준과 어뷰징 필터를 모두 통과한 활동이 없다 — 걸러진 활동만 기록하고 첫 동기화는 마친 것으로
    // 보지 않는다(users.initial_sync_done 불변). 다음 동기화에서 다시 찾는다.
    await recordProcessedActivities(supabase, userId, [...abusingRejectedRecords, ...rejectedRecords], processedVia)
    return evaluateWithoutNewActivities(supabase, userId, isFirstSync)
  }

  let poiBadgesEarned = 0

  /**
   * 소식 #4(체크인 배지 획득) 재료 — 활동 1건이 묶음 단위라 활동별로 모은다.
   * (같은 활동에서 지점을 여러 곳 지나면 "북한산 외 2곳" 한 건으로 나가야 한다)
   * 20260826_001 — 최초 획득/반복 획득이 한 활동에 섞일 수 있어 그 여부(isFirstEarns)와
   * 체크인 횟수(visitCounts)도 badgeIds/poiNames와 같은 순서로 나란히 쌓는다.
   */
  const poiEarnsByActivity = new Map<
    number,
    { badgeIds: string[]; poiNames: string[]; isFirstEarns: boolean[]; visitCounts: number[] }
  >()

  // 체크인 경로 매칭 — 어뷰징 필터를 지난 활동 중 최신 N개만 Streams로 경로를 조회한다(백필 시 Strava API 폭주
  // 방지, 최신 10건 제한은 그대로). 구간 검사에서 이미 조회한 활동은 다시 부르지 않는다. 걸러진 활동은 체크인하지
  // 않는다 — 체크인은 어뷰징 필터 뒤에 돈다(티켓 20261017_1421).
  const poiMatchTargets = [...passedEntries]
    .sort((a, b) => new Date(b.raw.start_date).getTime() - new Date(a.raw.start_date).getTime())
    .slice(0, MAX_POI_MATCH_ACTIVITIES_PER_SYNC)
  const routesByActivity = await Promise.all(
    poiMatchTargets.map(async ({ raw: rawActivity }) => ({
      rawActivity,
      route: (await getStreamsOnce(rawActivity))?.route ?? null,
    }))
  )

  const poiMatchResults: { rawActivity: StravaSummaryActivity; matchedPois: PoiRow[] }[] = []
  for (const { rawActivity, route } of routesByActivity) {
    if (!route) continue // 실내 활동 또는 경로 데이터 없음 — 건너뜀
    const matchedPois = await matchPoisForActivity(route, supabase)
    if (matchedPois.length > 0) poiMatchResults.push({ rawActivity, matchedPois })
  }

  const linkedBadgeIds = Array.from(
    new Set(
      poiMatchResults.flatMap(({ matchedPois }) =>
        matchedPois.map((poi) => poi.linked_badge_id).filter((id): id is string => Boolean(id))
      )
    )
  )
  // `category`(어드민 직접 지정 카테고리) — 체크인 배지 발급 직후 JAM! 카테고리 체크인 지표
  // (`checkin_category_count`, 티켓 20260914_1725)를 평가할 때 effective category 판정에 쓴다.
  // `valid_from`·`valid_until`(공개 기간)·`point_reward`(처음 받을 때 포인트)는 체크인 발급 판정에 쓴다(티켓 20261018_1814).
  type LinkedBadge = {
    id: string
    type: BadgeType
    name: string
    image_url: string | null
    rarity: BadgeRarity
    category: string | null
    valid_from: string | null
    valid_until: string | null
    point_reward: number
  }
  const badgeById = new Map<string, LinkedBadge>()
  if (linkedBadgeIds.length > 0) {
    const { data: linkedBadgesRaw, error: linkedBadgeError } = await supabase
      .from('badges')
      .select('id, type, name, image_url, rarity, category, valid_from, valid_until, point_reward')
      .in('id', linkedBadgeIds)
      .is('deleted_at', null)
    if (linkedBadgeError) {
      console.error('[processFetchedActivities] POI 연결 배지 조회 오류:', linkedBadgeError)
    }
    for (const badge of (linkedBadgesRaw ?? []) as LinkedBadge[]) {
      badgeById.set(badge.id, badge)
    }
  }

  // 섀도우밴 게이트는 없앴다(티켓 20261017_1426) — JAM 2.0의 제재는 이용 정지 하나다.
  // 정지 중인 유저는 동기화 입구(syncStravaActivities)에서 막히고, 정지 기간 활동은 정산하지 않는다.

  // 배지 타입별 발급
  //   - checkin 타입: user_checkin_badge_earns에 매번 새 행(반복 획득). 보유 여부 체크 없음.
  //     공개 기간 안일 때만 기록하고, 처음 받을 때만 배지 등급 포인트를 준다(티켓 20261018_1814).
  //   - 그 외(activity 등): 장소 연결로는 발급하지 않는다 — 장소 연결은 체크인 배지로만 한다(옛 poi_match 경로 삭제).
  for (const { rawActivity, matchedPois } of poiMatchResults) {
    const normalized = activitiesFiltered.find((a) => a.stravaId === rawActivity.id)

    for (const poi of matchedPois) {
      if (!poi.linked_badge_id) continue
      const badge = badgeById.get(poi.linked_badge_id)
      if (!badge) continue
      if (badge.type !== 'checkin') continue

      // 공개 기간은 «새로 받을 수 있는 기간»이다. 활동 시작 시각이 기간 밖이면 방문 기록·포인트·피드 모두
      // 남기지 않고 없던 일로 넘긴다(결정 3·4). 이미 받은 배지에는 기한이 없다.
      if (!isActivityWithinBadgeWindow(rawActivity.start_date, badge.valid_from, badge.valid_until)) continue

      // 방문 기록 한 줄 넣기와 «이 배지를 처음 받는지» 판정은 DB 함수 한 번으로 한다(마이그레이션 241) — 유저·배지
      // 단위 잠금 안에서 세고 넣으므로 동시 동기화에서도 «처음»이 한 번만 나온다. 체크인 배지는 체크인할 때마다
      // 반복 획득되는 설계라(badge_id 단위 — 배지 상세 화면 PoiEarnHistory도 같은 기준으로 이력을 모은다),
      // 20260826_001부터는 최초 획득이든 반복 획득이든 항상 피드에 남기되 "몇 번째 체크인인지"를 함께 기록해
      // 문구를 구분한다.
      // 20260824_006 — start_date_local은 로컬 벽시계에 Z를 붙인 값이라(UTC가 아님) 그대로 넣으면 최대
      // +9시간 미래로 오해석된다. 이 필드는 체크인 배지 상세 화면(PoiEarnHistory)에 체크인 일시로 노출되므로
      // 반드시 UTC 값인 start_date만 쓴다.
      const { data: earnResult, error: earnError } = await supabase.rpc('record_checkin_earn', {
        p_user_id: userId,
        p_badge_id: badge.id,
        p_poi_id: poi.id,
        p_strava_id: rawActivity.id,
        p_activity_name: rawActivity.name,
        // 생성 타입은 NUMERIC 인자를 null 불허로 옮기지만 DB 칸(triggered_by_distance_km)은 NULL을 받는다 —
        // 거리를 모르면 예전처럼 NULL로 남긴다(0으로 지어내지 않는다). 이 한 인자만 좁혀 단언한다.
        p_distance_km: (normalized?.distanceKm ?? null) as number,
        p_activity_date: rawActivity.start_date,
      })
      if (earnError) {
        console.error(`[processFetchedActivities] 체크인 배지 이력 기록 오류 (poi_id: ${poi.id}):`, earnError)
        continue
      }
      const earn = (earnResult ?? {}) as { duplicate?: boolean; visit_count?: number; is_first?: boolean }
      // 같은 활동을 다시 동기화한 경우 — 방문 기록·포인트·피드 모두 새로 만들지 않는다.
      if (earn.duplicate) continue
      const visitCount = earn.visit_count ?? 1
      const isFirstEarn = earn.is_first === true

      // 처음 받을 때만 배지 등급 포인트를 준다. 실패해도 방문 기록·피드는 그대로 진행한다
      // (awardPoints가 실패를 기록하고 null을 돌려준다 — 수동 재처리 대상).
      if (isFirstEarn) {
        await awardPoints(userId, badge.point_reward, 'badge_point_reward', { sourceBadgeId: badge.id })
        // 챕터 점수 «배지 받기» (티켓 20261019_1315 2a회, 운영 로직 12.2절). 체크인 배지는 반복 획득되지만 점수는 **처음 받을 때만** 센다 —
        // 두 번째부터는 `is_first`가 false라 여기 오지 않는다(같은 활동 재동기화는 위 `duplicate`에서 이미 건너뛴다). 체크인 배지는 숨김일 수 없고(DB 제약 243)
        // 조건이 없어 `is_hidden`·`condition_json`을 읽지 않는다. 던지지 않아 방문 기록·피드·응답을 바꾸지 않는다.
        await awardBadgeReceiveScore(supabase, { userId, badge: { id: badge.id, type: badge.type }, origin: { triggeredBy: 'strava_sync' } })
      }

      poiBadgesEarned++
      earnedBadgeIds.push(badge.id)
      const poiEarn = poiEarnsByActivity.get(rawActivity.id) ?? { badgeIds: [], poiNames: [], isFirstEarns: [], visitCounts: [] }
      poiEarn.badgeIds.push(badge.id)
      poiEarn.poiNames.push(poi.name)
      poiEarn.isFirstEarns.push(isFirstEarn)
      poiEarn.visitCounts.push(visitCount)
      poiEarnsByActivity.set(rawActivity.id, poiEarn)
      console.info(`[processFetchedActivities] 체크인 배지 획득 — userId: ${userId}, poi: ${poi.name}, badge_id: ${badge.id}, visitCount: ${visitCount}`)

      // JAM! 카테고리 — 체크인 배지 보유 조건 2종 (티켓 20260914_1725). 이 체크인 배지
      // insert가 DB에 커밋된 직후라 「지정 카테고리 n개 이상」·「지정 목록 중 n개 이상」
      // 판정이 이번 건까지 반영된 최신 보유 현황을 본다. 실패해도 체크인 배지 자체의 발급·
      // 동기화 API 응답은 계속 진행돼야 하므로 try/catch로 격리한다(daily_sync_count와
      // 같은 패턴, 위 recordDailySyncAndEvaluate 주석 참고).
      try {
        const checkinUsageEarned = await evaluateCheckinUsageBadges(userId, supabase)
        earnedBadgeIds.push(...checkinUsageEarned.map((b) => b.id))
      } catch (checkinUsageBadgeError) {
        console.error(`[processFetchedActivities] 체크인 사용량 배지 평가 실패 (userId: ${userId}):`, checkinUsageBadgeError)
      }

      // 20260826_001 — isFirstEarn 여부와 무관하게 항상 기록한다. poi_name·visit_count를
      // 함께 실어 프론트(FeedSection)가 "체크인 했어요" / "N번째 체크인 했어요"로
      // 분기하게 한다(20260826_004).
      // ⚠️ 체크인 배지는 별도 feed_event_type이 아니라 badge_earned + metadata로 남는다.
      //    이 두 필드가 곧 "이 badge_earned는 체크인"이라는 유일한 표식이다.
      await recordFeedEvent(userId, 'badge_earned', {
        badge_id: badge.id,
        badge_name: badge.name,
        badge_image_url: badge.image_url ?? '',
        rarity: badge.rarity,
        poi_name: poi.name,
        visit_count: visitCount,
      }, rawActivity.start_date, rawActivity.id)
    }
  }

  // 소식 #4(체크인 배지 획득) — 티켓 20260824_019. 활동 1건이 묶음 단위.
  // 20260826_001 — 한 활동에서 최초 획득과 반복 획득이 섞이면 최초 획득 쪽을 대표(헤드라인)로
  // 쓴다. "새로 획득"이 "몇 번째 체크인"보다 알림 가치가 크다고 판단했고(배지=신남 톤 유지),
  // 나머지는 기존 slotPlaceMore("{name} 외 {count}곳") 패턴 그대로 뭉친다 — 알림을 2건으로
  // 쪼개면 groupKey·appendKeys 구조를 바꿔야 해서 배보다 배꼽이 크다. 최초 획득이 하나도
  // 없으면(전부 반복 획득) 첫 번째 항목을 대표로 쓴다.
  for (const [activityId, earn] of poiEarnsByActivity) {
    await recordActivityRecap(userId, {
      activity_ids: [activityId],
      checkin_badges: earn.badgeIds.map((badgeId, i) => ({
        badge_id: badgeId,
        poi_name: earn.poiNames[i],
        first: earn.isFirstEarns[i],
        visit: earn.visitCounts[i],
      })),
    })
  }

  // 아이템 배지 발급 자리 표시 — 티켓 20261017_1424 2회
  // 발급은 잼 정산(아래 settleActivities) 뒤에 한다. 개수가 활동의 잼에 비례하고, 발급 기록이 `strava_activities.id`를 키로 쓰는데
  // 활동은 정산 직전에야 저장되기 때문이다. 획득 순서(체크인 → 아이템 배지 → 액티비티 → …)는 응답 계약이라, 여기의 위치를 기억해 두었다가
  // 발급한 배지 id를 그 자리에 끼워 넣는다.
  const itemBadgeInsertAt = earnedBadgeIds.length

  // 일반 배지 엔진 호출 — 새 활동이 0건이어도 항상 실행한다 (티켓 20260906_1430).
  // evaluateBadgesDetailed는 내부에서 이력 전체(getActivityHistory)를 이번 배치와 합쳐
  // 평가하므로, 빈 배치를 넘겨도 "카탈로그가 늘어난 뒤 조건은 충족인데 미발급"인 배지를
  // 이 호출 한 번으로 따라잡을 수 있다. 아이템 배지 발급(issueSyncItemBadges)·미션(checkMissions)은 "활동
  // 1건마다 시도"가 전제라 이 게이트를 그대로 유지한다 — 배지 평가만 벗긴다.
  const activityBadgeIds = await evaluateBadges(userId, activitiesFiltered)
  const badgesEarned = activityBadgeIds.length
  earnedBadgeIds.push(...activityBadgeIds)

  // ① 결산에 활동배지를 싣는 알림 호출은 JAM! 사용량 배지 평가(아래, recordDailySyncAndEvaluate)
  // 이후로 미룬다 — 활동배지와 JAM! 배지를 한 결산 행에 함께 실어야 하기 때문이다
  // (티켓 20260910_2258). 실제 호출은 이 함수 하단 참고.

  // 아이템북 완성 체크 + reward_badge 발급
  const { completedIds, rewardBadgesIssued, rewardBadgeIds } = await checkItemBookCompletion(userId)
  earnedBadgeIds.push(...rewardBadgeIds)
  if (completedIds.length > 0) {
    console.info(`[processFetchedActivities] 아이템북 완성 — userId: ${userId}, 완성 수: ${completedIds.length}, 보상 배지: ${rewardBadgesIssued}`)
  }

  // 소식 #11(컬렉션 완성 가능) — 티켓 20260824_019
  // "완성 시점"이 아니라 **"완성할 수 있는데 아직 안 넣은" 시점**의 소식이다.
  //
  // mode='once' + 컬렉션 단위 group_key로 컬렉션당 1회만 나간다. 이 조건은 유저가
  // 장착할 때까지 계속 참이라, merge로 두면 동기화할 때마다 updated_at이 갱신돼
  // dot이 매번 다시 켜진다(반복 발송 = 다크패턴, PRD §2-4).
  // 20260827_014 — R11(대상 2건 이상이면 한 행)을 적용한다. 키 계산은 배치와 **같은
  // 함수**를 쓴다: 두 경로가 각자 키를 만들면 같은 상태가 두 행이 된다.
  for (const draft of selectCompletableDrafts(userId, await findCompletableItemBooks(userId))) {
    await createNotification(draft as CreateNotificationInput<NotificationType>)
  }

  // 멱등 처리 기준 데이터 기록 — 이번에 "새로" 확인된 활동을 처리 완료로 표시.
  // 성공적으로 여기까지 도달한 경우에만 기록하므로, 중간에 실패하면 다음 시도에서 자연스럽게 재처리된다.
  // 인정 판정에서 걸러진 활동과 차량 속도로 걸러진 활동도 사유와 함께 기록한다(이력에는 들어가지 않는다).
  //
  // 잼 정산(티켓 20261017_1423, 운영 로직 4.2절): 활동 id(`strava_activities.id`)가 원장의 키라 활동을 저장한 **뒤**에
  // 정산한다. 대량 수령 경보의 기준선(지난 4주 주간 평균)은 이번 정산 행이 섞이지 않게 저장·정산 **전에** 읽는다.
  // 둘 다 던지지 않는다 — 정산이나 경보가 실패해도 동기화는 계속된다.
  const jamPolicy = await getJamPolicy(supabase)
  const massEarnBaseline = await readMassEarnBaseline(supabase, userId, jamPolicy)

  await recordProcessedActivities(
    supabase,
    userId,
    [
      ...passedEntries.map((c) => ({ activity: c.activity, filterReason: null, sourceMeta: c.sourceMeta })),
      ...abusingRejectedRecords,
      ...rejectedRecords,
    ],
    processedVia
  )

  // 정산 대상은 인정 필터와 어뷰징 필터를 모두 통과한 활동(passedEntries)뿐이다. 첫 동기화는 위에서 이미 최근 1건만
  // 남겼다. 이용 정지 중 정산 차단은 2-6의 몫이라 여기서 하지 않는다. 모은 잼의 챕터 점수는 `settleActivities` 안에서 센다(티켓 20261019_1315).
  const jamSettlement = await settleActivities(
    supabase,
    userId,
    passedEntries.map((c) => ({
      stravaId: c.activity.stravaId,
      startDate: c.activity.startDate,
      movingTimeSec: c.activity.movingTimeSec,
      jamActivityType: c.activity.jamActivityType,
      sportType: c.sourceMeta.sportType,
      type: c.sourceMeta.type,
    })),
    jamPolicy
  )

  // 캡슐 자동 채움 (티켓 20261028_1733 3회, 운영 로직 5장): 정산으로 지갑에 들어온 잼(과 지난번에 열지 못해 가득 찬 채 남은 캡슐)으로
  // «열기 → 채우기 → 가득 차면 열기»를 지갑이 빌 때까지 되풀이한다. 던지지 않는다 — 채움·열기·기록이 실패해도 동기화는 계속된다.
  // 열기마다의 챕터 배지 판정은 건너뛴다: 아래 동기화 끝 판정(`JAM_SYNC_TRIGGERS`의 `chapter_reached`)이 DB의 지금 챕터를 읽어 이어서 판정한다.
  // 자동으로 열린 결과는 «아직 보지 않은 캡슐 결과» 한 건으로 남는다(`runSyncCapsuleAutoFill`).
  const capsuleStep = await runSyncCapsuleAutoFill(supabase, userId)
  await alertMassEarnIfNeeded({ userId, earned: jamSettlement.total, baseline: massEarnBaseline, policy: jamPolicy })

  // 정산한 모든 활동에 아이템 배지를 발급한다(티켓 20261017_1424 2회, 운영 로직 6.2절). 소속 트라이브가 없으면 아이템 배지만 건너뛴다.
  // 던지지 않는다 — 활동 하나의 실패는 실패 기록 테이블에 남기고 다음 활동으로 계속한다(티켓 20261014_1320).
  // 순차 처리 유지 필수 — 발급이 user_drop_state(common_streak)와 인벤토리 슬롯을 읽고 쓰므로 병렬화하면 안 된다.
  const passedActivityByStravaId = new Map(passedEntries.map((c) => [c.activity.stravaId, c.activity]))
  const issueTargets = jamSettlement.items.map((item) => {
    const activity = passedActivityByStravaId.get(item.stravaId)
    return {
      stravaId: item.stravaId,
      activityId: item.activityId,
      startDate: activity?.startDate ?? item.earnedOn,
      jam: item.amount,
      isHiking: activity?.jamActivityType === 'hiking',
    }
  })
  const recordDropFailure = (stravaId: number | null, err: unknown) =>
    recordStravaSyncFailure(
      supabase,
      userId,
      'drop_attempt_failed',
      `${stravaId === null ? 'batch' : `stravaId=${stravaId}`}: ${err instanceof Error ? err.message : String(err)}`
    )
  // 이번 동기화로 받을 아이템 배지 전체가 빈칸보다 많으면 지급하지 않고 전부 보류한다(티켓 20261017_1425, 운영 로직 6.4절).
  let itemBadgeIds: string[] = []
  let pendingItems = 0
  if (issueTargets.length > 0) {
    try {
      const issued = await issueSyncItemBadges(supabase, userId, jamPolicy, issueTargets, {
        onActivityError: (target, err) => recordDropFailure(target.stravaId, err),
      })
      itemBadgeIds = issued.issuedBadgeIds
      pendingItems = issued.pendingCount
    } catch (err) {
      // 활동 단위 실패는 위 콜백이 흡수한다. 여기는 조회 단계처럼 활동 밖에서 던진 경우다 — 발급만 포기하고 동기화는 계속한다.
      console.error(`[processFetchedActivities] 아이템 배지 발급 실패 — userId: ${userId}:`, err)
      await recordDropFailure(null, err)
    }
  }
  earnedBadgeIds.splice(itemBadgeInsertAt, 0, ...itemBadgeIds)

  // Phase 16: 다이나믹 미션 달성 체크
  // 아이템 배지 발급 **뒤**에 판정한다 — 아이템 수집 미션(`item_collect`)이 인벤토리의 보유 현황을 읽어서, 이번 동기화로 받은
  // 개체가 반영되기 전에 판정하면 한 번 늦게 달성된다. 이전에는 발급이 미션 판정 앞에 있었다. 거리·활동 수 미션은 이력 전체로
  // 판정하므로(`mergeActivityHistory`) 활동 기록 저장 뒤에 돌아도 같은 결과다.
  const { completedMissionIds, awardedBadgeIds } = await checkMissions(userId, activitiesFiltered)
  earnedBadgeIds.push(...awardedBadgeIds)
  if (completedMissionIds.length > 0) {
    console.info(`[processFetchedActivities] 미션 달성 — userId: ${userId}, 수: ${completedMissionIds.length}`)
  }

  // JAM! 카테고리 — 서비스 사용량 배지: 하루 동기화 횟수 (티켓 20260910_1557).
  //
  // 이 지점은 정산할 활동이 0건일 때의 이른 반환(`evaluateWithoutNewActivities`)을 지난 뒤라 —
  // "synced > 0"(= 이번 배치로 새 활동을 실제로 받아온 경우)일 때만 도달한다. 카운터
  // 증가·판정 로직은 recordDailySyncAndEvaluate() 한 곳(usageBadges.ts)에 있다 — 실패해도
  // 동기화 자체(위에서 이미 끝난 활동 배지·아이템 드랍·미션 등)는 계속 진행돼야 하므로
  // try/catch로 격리한다. 획득 배지는 earnedBadgeIds에 합류시켜 상위(syncStravaActivities)의
  // buildEarnedBadgePayload가 한 번에 상한·순서·isFirstBadgeEver를 처리하게 한다.
  let usageEarned: UsageBadgeEarned[] = []
  try {
    usageEarned = await recordDailySyncAndEvaluate(userId, supabase)
    earnedBadgeIds.push(...usageEarned.map((b) => b.id))
  } catch (usageBadgeError) {
    console.error(`[processFetchedActivities] daily_sync_count 사용량 배지 평가 실패 (userId: ${userId}):`, usageBadgeError)
  }

  // JAM! 행동 지표 — 미션 완료·컬렉션 완성·가입 경과일·주간 활동일·같은 지점 체크인 일수 (티켓 20261001_0633).
  //
  // 동기화가 끝나는 이 자리에서 한 번에 판정한다. 활동 기록 저장(recordProcessedActivities)이 위에서
  // 이미 끝나 주간 활동일이 이번 배치를 본다. 체크인 루프나 미션 판정 직후에 따로 부르면 활동 기록이 아직
  // 없어 이번 배치를 못 보고, 호출이 세 번이면 배지 읽기도 세 번이다. 미션 완료·컬렉션 보정은 이 시점에
  // 이미 DB에 있다. 판정이 던져도 동기화는 계속된다(evaluateJamActionSafely).
  // 자동 채움으로 캡슐이 열렸으면 캡슐 열기 지표(연 횟수·다른 트라이브 아이템 종류 수)를 같은 판정에서 함께 다시 본다 — 열기 위치가 사용자 행동에서
  // 동기화로 옮겼다(옛 `/api/capsule/open`은 티켓 20261028_1742 1회에서 지웠다). 판정 키는 `jamTriggersForCapsuleOpen`이다. 열린 개체는 인벤토리에 이미 들어가 있다.
  const jamEarned = await evaluateJamActionSafely(
    supabase,
    userId,
    capsuleStep.opened ? [...JAM_SYNC_TRIGGERS, ...jamTriggersForCapsuleOpen()] : JAM_SYNC_TRIGGERS
  )
  earnedBadgeIds.push(...jamEarned.map((b) => b.id))

  // ① 결산에 활동배지 + JAM! 사용량 배지 + JAM! 행동 지표 배지를 함께 싣는다 (묶음 단위는 KST 하루라 대표
  // 활동을 고를 필요가 없다). 이전에는 이 호출이 활동배지 평가 직후(현재는 위로 이동)에 있어
  // JAM! 배지가 평가되기 전에 알림 결산이 이미 끝나 있었다 — JAM! 배지 획득이 알림함에
  // 전혀 반영되지 않는 원인이었다(티켓 20260910_2258).
  await notifyActivityBadgesEarned(
    supabase,
    userId,
    [...activityBadgeIds, ...usageEarned.map((b) => b.id), ...jamEarned.map((b) => b.id)],
    activitiesFiltered.map((a) => a.stravaId)
  )

  return {
    badges: badgesEarned + poiBadgesEarned + rewardBadgesIssued,
    itemBooksCompleted: completedIds.length,
    missionsCompleted: completedMissionIds.length,
    earnedBadgeIds,
    completedMissionIds,
    settledCount: passedEntries.length,
    jamEarned: jamSettlement.total,
    pendingItems,
    jamSettlements: jamSettlement.items,
  }
}

/**
 * 연결이 끊겼음을 알리고 저장한 뒤, 호출부가 던질 `StravaDisconnectedError`를 돌려준다
 * (토큰 갱신 실패·Strava 401 철회 공통, 티켓 20261017_1422).
 *
 * 소식 #40(Strava 끊김) — 티켓 20260824_019
 * 갱신 실패는 사실상 서비스 중단(배지 발급이 완전히 멈춘다)인데 현재 유저가
 * 알 방법이 없다. 이 기능 도입의 가장 실용적인 명분이다.
 *
 * group_key를 KST 하루 단위로 둔다: 스펙상 #40은 "묶지 않는 소식"이지만,
 * 연결이 끊긴 상태에서는 동기화를 누를 때마다 이 지점을 지나 같은 소식이
 * 무한히 쌓인다. 하루 1건이면 "개별 소식"의 성격은 유지하면서 폭주만 막는다.
 * (끊김 저장 뒤에는 동기화가 시작 전에 멈추므로 이 지점을 다시 지나지 않는다.)
 */
async function recordStravaDisconnect(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  reason: StravaDisconnectReason,
  cause: unknown
): Promise<StravaDisconnectedError> {
  await createNotification({
    userId,
    type: 'strava_disconnected',
    groupKey: dailyGroupKey('strava_disconnected'),
    mode: 'once',
  })
  await markStravaDisconnected(userId, reason, { supabase })
  return new StravaDisconnectedError(reason, { cause })
}

/**
 * 특정 유저의 Strava 활동을 동기화하고 배지를 평가합니다.
 * @returns synced: 동기화된 활동 수, badges: 신규 발급된 배지 수,
 *          earnedBadges: 이번에 획득한 배지 상세(획득 순서. 최대 EARNED_BADGE_DETAIL_LIMIT건.
 *          없으면 빈 배열 — 필드는 항상 존재),
 *          earnedBadgesMore: 상한을 넘겨 상세를 싣지 못한 잔여 개수,
 *          isFirstBadgeEver: 이번에 받은 배지가 유저의 전체 첫 배지인지 (GA4 first_badge_earned),
 *          completedMissionIds: 이번에 새로 완료된 미션 id (GA4 mission_complete)
 *          jamEarned: 이번 동기화로 받은 잼의 합계(받은 잼이 없으면 0, 티켓 20261017_1423)
 *          pendingItems: 이번 동기화로 새로 보류된 아이템 배지 개수(없으면 0, 티켓 20261017_1425)
 * @throws SyncPendingItemsError 고르지 않은 보류가 남아 있으면 가져오기·정산 없이 던진다(`/api/strava/sync`가 409로 알린다)
 * @throws TribeRequiredError 트라이브를 고르지 않았으면 가져오기·정산 없이 던진다(`/api/strava/sync`가 403 `tribe_required`로 알린다, 티켓 20261021_1247)
 */
export async function syncStravaActivities(
  userId: string
): Promise<{
  synced: number
  badges: number
  itemBooksCompleted: number
  missionsCompleted: number
  earnedBadges: EarnedBadgeSummary[]
  earnedBadgesMore: number
  isFirstBadgeEver: boolean
  completedMissionIds: string[]
  /** 이번 동기화로 받은 잼의 합계. 받은 잼이 없으면 0 (티켓 20261017_1423) */
  jamEarned: number
  /** 이번 동기화로 새로 보류된 아이템 배지 개수. 보류가 없으면 0 (티켓 20261017_1425) */
  pendingItems: number
}> {
  const supabase = createServiceClient()

  // 0. 트라이브를 고르지 않은 유저는 동기화하지 않는다(티켓 20261021_1247, 운영 로직 2장). 동기화로 받는 아이템 배지가 모두 소속 트라이브의 것이라
  //    트라이브가 없으면 줄 아이템 배지를 정할 수 없다. 연결 조회보다 먼저 막아, 연결이 없는 트라이브 없는 유저도 «연동 정보 없음» 500이 아니라
  //    트라이브 게이트로 알린다. 읽지 못하면 «있음»으로 보지 않고 던진다. 수동 경로(/api/strava/sync)가 403으로 바꾸고, 콜백은 이 앞에서 먼저 막는다.
  await assertHasTribe(supabase, userId)

  // 1. strava_connections 조회
  const { data: connectionRaw, error: connError } = await supabase
    .from('strava_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  const connection = connectionRaw as StravaConnectionRow | null

  if (connError || !connection) {
    throw new Error(`[syncStravaActivities] Strava 연동 정보 없음 — userId: ${userId}`)
  }

  // 끊긴 연결은 동기화하지 않는다 — 토큰 갱신 실패·철회·유저가 끊은 경우 모두 같은 «끊김»이다
  // (티켓 20261017_1422). 수동 경로(/api/strava/sync)가 이 오류를 409로 알린다.
  if (connection.disconnected_at) {
    throw new StravaDisconnectedError(connection.disconnect_reason)
  }

  // 이용 정지 중이면 동기화하지 않는다(티켓 20261017_1426, 운영 로직 16.4절). 가진 잼·아이템 배지·배지·포인트는 그대로 둔다.
  // 정지 여부를 읽지 못하면 던져 동기화하지 않는다. 수동 경로(/api/strava/sync)와 콜백 직후 동기화가 모두 이 함수를 지난다.
  await assertNotSuspended(supabase, userId)

  // 고르지 않은 보류가 있으면 동기화하지 않는다(티켓 20261017_1425, 운영 로직 6.4절). 새 보류가 더 쌓이면 한 번의 고르기가
  // 그것까지 «고르지 않음»으로 닫아 버리므로, 가져오기·정산 전에 막는다. 보류 개수를 읽지 못하면 던져 동기화하지 않는다.
  const pendingBefore = await countPendingItems(supabase, userId)
  if (pendingBefore > 0) {
    console.info(`[syncStravaActivities] 보류 ${pendingBefore}개가 남아 있어 동기화하지 않음 (userId: ${userId})`)
    throw new SyncPendingItemsError(pendingBefore)
  }

  // 2. 토큰 복호화
  let accessToken = await decrypt(connection.access_token)
  const refreshToken = await decrypt(connection.refresh_token)
  const expiresAt = new Date(connection.token_expires_at).getTime()

  // 3. 토큰 만료 확인 → 만료 시 갱신
  if (Date.now() >= expiresAt - 60_000) { // 1분 여유
    let refreshed: Awaited<ReturnType<typeof refreshStravaToken>>
    try {
      refreshed = await refreshStravaToken(refreshToken)
    } catch (err) {
      await recordStravaSyncFailure(
        supabase,
        userId,
        'token_refresh_failed',
        err instanceof Error ? err.message : String(err)
      )
      // 인증 오류(400·401·403)의 갱신 실패만 연결 끊김이다 — 끊김을 저장하고 «끊김» 오류로 던진다.
      // 5xx·네트워크 오류·시간 초과는 일시 실패라 끊김으로 저장하지 않는다. 실패 기록과 소식은
      // 남기고, 다음 동기화에서 다시 시도한다(티켓 20261017_1422 서버 보정 a).
      if (isStravaAuthFailureError(err)) {
        throw await recordStravaDisconnect(supabase, userId, 'token_refresh_failed', err)
      }
      await createNotification({
        userId,
        type: 'strava_disconnected',
        groupKey: dailyGroupKey('strava_disconnected'),
        mode: 'once',
      })
      throw err
    }
    accessToken = refreshed.access_token

    const [encAccess, encRefresh] = await Promise.all([
      encrypt(refreshed.access_token),
      encrypt(refreshed.refresh_token),
    ])

    const updatePayload = {
      access_token: encAccess,
      refresh_token: encRefresh,
      token_expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
    }
    const { error: updateError } = await supabase
      .from('strava_connections')
      .update(updatePayload)
      .eq('user_id', userId)

    if (updateError) {
      console.error('[syncStravaActivities] 갱신된 토큰 저장 실패:', updateError)
    }
  }

  // 4. 마지막으로 가져온 활동의 시작 시각 - overlap 이후 활동만 조회 (색인 지연 대비 —
  //    상단 SYNC_OVERLAP_SECONDS 주석 참고). Strava의 after는 활동 시작 시각 기준으로
  //    거르므로, 커서도 같은 기준(strava_activities 최신 start_date)이어야 한다 —
  //    동기화를 누른 벽시계 시각(last_synced_at)을 쓰면 "활동 길이 + 업로드 지연이
  //    overlap보다 길 때" 성공(0건) 동기화가 커서를 활동 시작 시각보다 앞으로 밀어내
  //    그 활동을 영구 누락시킨다 (티켓 20260922_2207 실측). 행이 없는 유저(연동만 하고
  //    활동 없음·어드민 초기화 직후)는 지금처럼 after 없이 최신 페이지 1회 조회한다.
  // 첫 동기화 대기 중(다른 Strava 계정으로 새로 연결한 행)이면 커서를 읽지 않는다 — 이 유저의
  // strava_activities에는 이전 계정의 활동이 남아 있어, 그 최신 시각을 커서로 쓰면 새 계정의
  // 오래된 활동이 조회에서 빠진다(티켓 20261017_1422).
  const firstSyncPending = connection.first_sync_pending === true
  const { data: latestActivity, error: latestActivityError } = firstSyncPending
    ? { data: null, error: null }
    : await supabase
        .from('strava_activities')
        .select('start_date')
        .eq('user_id', userId)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
  if (latestActivityError) {
    console.error(
      `[syncStravaActivities] 커서 조회 실패 — userId: ${userId}:`,
      latestActivityError,
    )
  }
  const afterTimestamp = latestActivity?.start_date
    ? Math.max(0, Math.floor(new Date(latestActivity.start_date).getTime() / 1000) - SYNC_OVERLAP_SECONDS)
    : undefined

  // 4-1. 동시 싱크 잠금 (낙관적 잠금) — 처리 시작 전에 last_synced_at을 선점 갱신한다.
  //      같은 커서로 들어온 두 번째 요청은 갱신 0행 → 즉시 종료 (드랍·피드 중복 방지).
  //      last_synced_at은 조회 커서 역할이 없다 — 이 잠금 키·실패 시 롤백(아래 catch) 용도로만 쓴다.
  const lockNow = new Date().toISOString()
  let lockQuery = supabase
    .from('strava_connections')
    .update({ last_synced_at: lockNow })
    .eq('user_id', userId)
  lockQuery =
    connection.last_synced_at === null
      ? lockQuery.is('last_synced_at', null)
      : lockQuery.eq('last_synced_at', connection.last_synced_at)
  const { data: lockRows, error: lockError } = await lockQuery.select('user_id')
  if (lockError || !lockRows || lockRows.length === 0) {
    console.info(`[syncStravaActivities] 동시 싱크 감지 — 건너뜀 (userId: ${userId})`)
    return { synced: 0, badges: 0, itemBooksCompleted: 0, missionsCompleted: 0, earnedBadges: [], earnedBadgesMore: 0, isFirstBadgeEver: false, completedMissionIds: [], jamEarned: 0, pendingItems: 0 }
  }

  // 4-2. 첫 싱크 여부 (초기화 직후·신규 연동) — 정산·아이템 배지를 최근 1건으로 제한하는 데 사용
  const { data: userRow } = await supabase
    .from('users')
    .select('initial_sync_done')
    .eq('id', userId)
    .maybeSingle()
  // 연결의 first_sync_pending이 true면 users.initial_sync_done과 상관없이 첫 동기화 규칙을 쓴다
  // (다른 Strava 계정 연결, 티켓 20261017_1422). 옛 initial_sync_done의 뜻은 바꾸지 않는다.
  const isFirstSync =
    firstSyncPending || !(userRow as { initial_sync_done?: boolean } | null)?.initial_sync_done

  // 4-3. 실제 조회·처리는 여기서부터 — 잠금은 이미 선점됐으므로, 이 구간에서
  // 예외가 나면(Strava API 오류, 서버리스 강제 종료 등) last_synced_at을 잠금 이전
  // 값으로 되돌린다. 되돌리지 않으면 커서만 앞으로 밀린 채 아무것도 처리되지 않은
  // 상태로 남아, 다음 재시도부터 그보다 오래된 활동(가입 전 이력 등)을 영영 조회
  // 대상에서 놓치게 된다 (2026-08-10 신규 유저 미발급 인시던트의 원인).
  try {
    // 한 페이지 상한(200건)을 넘으면 끝까지 페이지를 넘겨 가져온다 — 처리 건수에 상한을 두지 않는다(운영 로직 6.2절)
    const fetchedActivities = await getAllActivities(accessToken, afterTimestamp)

    // 5. 멱등 처리 — overlap으로 다시 잡힌 것 중 이미 처리된 활동은 제외
    const processedIds = await getProcessedStravaIds(supabase, userId, fetchedActivities.map((a) => a.id))
    // 걸러진 활동도 «처리한 것»에 포함돼(getProcessedStravaIds) 다시 거르지 않는다.
    // 첫 동기화의 «인정 활동 가운데 최근 1건» 제한은 인정 판정 뒤에 해야 하므로 processFetchedActivities가 한다.
    const rawActivities = fetchedActivities.filter((a) => !processedIds.has(a.id))

    console.info(
      `[syncStravaActivities] userId: ${userId}, afterTimestamp: ${afterTimestamp ?? 'none'}, ` +
      `Strava 반환: ${fetchedActivities.length}건, 신규(미처리): ${rawActivities.length}건` +
      `${isFirstSync ? ' (첫 싱크 — 인정 활동 최근 1건 제한)' : ''}`
    )

    const { badges, itemBooksCompleted, missionsCompleted, earnedBadgeIds, completedMissionIds, settledCount, jamEarned, pendingItems } = await processFetchedActivities(
      supabase,
      userId,
      accessToken,
      rawActivities,
      isFirstSync,
      'sync'
    )

    // 인정 활동을 정산한 동기화가 끝나면 첫 동기화 대기를 푼다. 정산이 0건이면 그대로 두고
    // 다음 동기화에서 다시 찾는다(운영 로직 3.4절). 실패해도 동기화 결과는 그대로 돌려준다.
    if (firstSyncPending && settledCount >= 1) {
      const { error: pendingError } = await supabase
        .from('strava_connections')
        .update({ first_sync_pending: false })
        .eq('user_id', userId)
        .eq('strava_athlete_id', connection.strava_athlete_id)
      if (pendingError) {
        console.error(`[syncStravaActivities] first_sync_pending 해제 실패 (userId: ${userId}):`, pendingError)
      }
    }

    // 온보딩 퀘스트 완료 판정(T6) — 정산한 인정 활동이 1건 이상일 때만 시도한다.
    // 0건이면 호출하지 않는다(불필요한 조회 생략). 절대 throw하지 않으므로 동기화 흐름에
    // 영향을 주지 않는다. 지급된 완료 배지(T7b)가 있으면 기존 배지 획득 카드에 함께 실리도록
    // earnedBadgeIds에 합류시킨다(사용자 결정 2) — 중복 제거는 already-includes 체크로 충분하다.
    // 티켓 20261021_1248: 완료는 실제 2단계(첫 동기화·잠긴 개체 열기)와 연출이 둘 다 끝나야 하므로,
    // 보통 이 동기화가 마지막 조건이 되지 못한다(②는 이 동기화로 받은 잠긴 개체를 유저가 직접 열어야 한다). 이 자리에서 배지가 지급되는 경우는
    // 대부분 앞선 호출의 지급 실패를 다시 시도하는 때다. 열기·단계 기록·건너뛰기 호출에서 지급된 배지는 배지 획득 카드 없이
    // 피드 기록(`badge_earned`)과 포인트 소식으로 남는다.
    if (settledCount >= 1) {
      const grantedBadgeId = await recordOnboardingQuestCompletion(supabase, userId)
      if (grantedBadgeId && !earnedBadgeIds.includes(grantedBadgeId)) {
        earnedBadgeIds.push(grantedBadgeId)
      }
    }

    // 획득 배지 상세는 엔진 4경로를 각각 개조하는 대신, 수집된 id로 여기서 1회만 조회한다.
    // 카드 상한(10장)도 여기서 적용한다 — 클라이언트는 받은 배열을 그대로 그린다.
    // (earnedBadgeIds는 processFetchedActivities 안에서 daily_sync_count 사용량 배지까지
    // 이미 합류된 최종 목록이다 — 티켓 20260910_1557)
    const { earnedBadges, earnedBadgesMore, isFirstBadgeEver } = await buildEarnedBadgePayload(supabase, earnedBadgeIds, userId)

    // last_synced_at은 4-1 잠금 단계에서 이미 선점 갱신됨 (여기서 재갱신하면
    // 처리 중 업로드된 활동이 다음 싱크에서 누락되는 갭이 생기므로 하지 않는다)

    return {
      synced: settledCount,
      badges,
      itemBooksCompleted,
      missionsCompleted,
      earnedBadges,
      earnedBadgesMore,
      isFirstBadgeEver,
      completedMissionIds,
      jamEarned,
      pendingItems,
    }
  } catch (err) {
    console.error(`[syncStravaActivities] 처리 중 오류 — last_synced_at 롤백 (userId: ${userId}):`, err)
    await recordStravaSyncFailure(
      supabase,
      userId,
      classifyStravaSyncFailure(err),
      err instanceof Error ? err.message : String(err)
    )
    const { error: rollbackError } = await supabase
      .from('strava_connections')
      .update({ last_synced_at: connection.last_synced_at })
      .eq('user_id', userId)
      .eq('last_synced_at', lockNow) // 그 사이 다른 요청이 갱신했다면 덮어쓰지 않음
    if (rollbackError) {
      console.error(`[syncStravaActivities] 롤백 실패 (userId: ${userId}):`, rollbackError)
    }
    // Strava가 401로 철회를 알리면 토큰 갱신 실패와 같은 «끊김»이다(티켓 20261017_1422)
    if (isStravaRevokedError(err)) {
      throw await recordStravaDisconnect(supabase, userId, 'token_revoked', err)
    }
    throw err
  }
}
