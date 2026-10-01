/**
 * 투데이 카드 이벤트 기록·집계 (티켓 20260924_0004)
 *
 * `today_card_events`(마이그레이션 183)에 노출·열람·후속 행동을 유형 ID와 함께 남긴다.
 * 유저 식별자는 어떤 형태로도 인자로 받지도, 저장하지도 않는다(PRD content-automation/PRD.md
 * §9 "개인 식별자는 저장하지 않는다", 결정 4-6). content_type_id는 기록 시점 카드의 값을
 * 그대로 복제해 저장한다 — 카드가 나중에 유형을 바꾸거나 삭제돼도 이벤트의 유형 귀속이
 * 흔들리지 않는다(마이그레이션 183 COMMENT). card_shape(그려진 모양, 마이그레이션 206)도 같은 방식으로
 * 기록 시점 값을 복제한다(티켓 20261001_1431).
 */
import { createServiceClient } from '@/lib/supabase/server'
// 화면 모듈(`cardView.ts`)은 한국어 사전을 가져와 이벤트 API 번들이 무거워진다 — 순수 판정만 `shape.ts`에서 가져온다(티켓 20261001_2244).
import { drawnShape, fallbackEmptyTileShape, resourceOfTemplate, type CardShape, type ShapeCardInput } from './shape'

export const TODAY_CARD_EVENT_TYPES = ['impression', 'click', 'followup'] as const
export type TodayCardEventType = (typeof TODAY_CARD_EVENT_TYPES)[number]

// API가 실제로 받는 이벤트 유형. `followup`(후속 행동)은 UI가 보내지 않아 수집하지 않기로
// 했다(2026-09-24 사용자 결정, 티켓 20260924_0810). DB CHECK 제약(TODAY_CARD_EVENT_TYPES 전체)은
// 그대로 두고 API 입력 검증에서만 좁힌다.
const ACCEPTED_EVENT_TYPES = ['impression', 'click'] as const satisfies readonly TodayCardEventType[]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface TodayCardEventInput {
  cardId: string
  event: TodayCardEventType
}

export type TodayCardEventValidation =
  | { ok: true; value: TodayCardEventInput }
  | { ok: false; error: string }

/**
 * POST 본문(unknown)을 검증한다. `/api/today/events`는 화면에 직접 노출되지 않는 내부 계측
 * API라 에러 문구를 UX Writing 딕셔너리(`d`)로 관리하지 않는다(어드민 전용 라우트들과 동일한
 * 관례 — 예: `admin/activity-badge-image/generate/route.ts`).
 */
export function parseTodayCardEventInput(body: unknown): TodayCardEventValidation {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: '요청 본문이 올바르지 않습니다.' }
  }
  // `followupAction`은 읽지 않는다 — 요청 본문에 있어도 무시하고 저장하지 않는다(어떤 값이든
  // 400으로 거부하지 않는다). 2026-09-24 사용자 결정, 티켓 20260924_0810.
  const { cardId, event } = body as Record<string, unknown>

  if (typeof cardId !== 'string' || !UUID_RE.test(cardId)) {
    return { ok: false, error: 'cardId가 올바른 UUID 형식이 아닙니다.' }
  }
  if (typeof event !== 'string' || !ACCEPTED_EVENT_TYPES.includes(event as (typeof ACCEPTED_EVENT_TYPES)[number])) {
    return { ok: false, error: `event는 ${ACCEPTED_EVENT_TYPES.join('/')} 중 하나여야 합니다.` }
  }

  return { ok: true, value: { cardId, event: event as TodayCardEventType } }
}

export interface ExposableCard {
  content_type_id: string | null
  /**
   * 그 카드가 지금 화면에 그려지는 모양. `shape`가 저장되지 않은 옛 카드는 전환 상수(`LEGACY_SHAPE_CUTOVER`)가 꺼져 있는 동안
   * `null`이다(옛 렌더러로 그려지므로 새 모양이 없다).
   */
  card_shape: CardShape | null
}

export type CardExposureValidation = { ok: true; card: ExposableCard } | { ok: false; error: string }

/**
 * 카드가 존재하고 `is_active`이며 `now`가 `[starts_at, ends_at]`(양끝 포함, 기존 노출 조회와 동일) 안일 때만 통과한다(티켓 20260924_0111).
 * 통과하면 조회한 카드 행을 돌려줘 `recordTodayCardEvent`가 `today_cards`를 다시 조회하지 않게 한다(티켓 20260924_0139).
 * 그려진 모양 판정에 필요한 칸(`shape`·`template_type`·`layout_type`·`cover_image_url`·`badge_ids`)도 같은 조회에서 읽는다(티켓 20261001_1431).
 */
export async function assertCardExposable(cardId: string, now: Date): Promise<CardExposureValidation> {
  const supabase = createServiceClient()
  const { data: card, error } = await supabase
    .from('today_cards')
    .select('is_active, starts_at, ends_at, content_type_id, shape, template_type, layout_type, cover_image_url, badge_ids')
    .eq('id', cardId)
    .maybeSingle()

  if (error) {
    console.error('[today/events] 카드 노출 검증 조회 오류:', error.message)
    return { ok: false, error: '카드를 확인할 수 없습니다.' }
  }
  if (!card) return { ok: false, error: '카드를 찾을 수 없습니다.' }
  if (!card.is_active) return { ok: false, error: '노출 중인 카드가 아닙니다.' }

  const nowMs = now.getTime()
  if (nowMs < new Date(card.starts_at).getTime() || nowMs > new Date(card.ends_at).getTime()) {
    return { ok: false, error: '노출 기간이 아닌 카드입니다.' }
  }
  // 생성 타입은 template_type·layout_type을 string으로 읽어 모양 판정 입력 타입으로 좁혀 넘긴다(DB CHECK가 값을 보장한다).
  return { ok: true, card: { content_type_id: card.content_type_id, card_shape: resolveDrawnShape(card as ShapeCardInput) } }
}

/**
 * 화면(`toCardView`)이 그리는 모양과 같은 값을 정한다. 저장된 `shape` → (전환 상수가 켜졌을 때만) 옛 값 판정은 `drawnShape`,
 * 「타일이 0개인 타일형 list는 brief」는 `toCardView`와 같은 함수(`fallbackEmptyTileShape`)를 쓴다.
 * 같은 카드 행이면 두 경로가 같은 입력(`shape`·`template_type`·`layout_type`·`cover_image_url`·`badge_ids`)으로 판정한다 —
 * 커버 없는 옛 큰 카드의 `square` 승격은 배지 그림 유무가 아니라 `badge_ids` 유무로 정한다(`shape.ts`).
 * 타일 수는 화면이 읽은 배지 수(삭제된 배지 제외) 대신 카드 행의 `badge_ids` 개수로 갈음한다 — 배지를 다시 조회하지 않기 위해서다.
 * 그래서 `badge_ids`가 전부 삭제된 배지인 타일형 `list`만 화면은 `brief`, 기록은 `list`로 갈린다(허용 차이, 홈피드 PRD §9).
 */
function resolveDrawnShape(card: ShapeCardInput): CardShape | null {
  const shape = drawnShape(card)
  if (!shape) return null
  return fallbackEmptyTileShape(shape, resourceOfTemplate(card.template_type), card.badge_ids?.length ?? 0)
}

export type RateLimitResult = { ok: true } | { ok: false }

// 인스턴스 메모리 Map — 서버리스라 인스턴스별 최선 노력(best-effort) 수준의 제한이다.
const rateLimitTimestamps = new Map<string, number[]>()
let lastSweepAt = 0

/** 다시 호출되지 않는 유저의 키가 쌓이지 않도록 창(window)마다 한 번, 마지막 요청이 창 밖인 키를 지운다(티켓 20260924_0139). */
function sweepExpiredKeys(now: number, windowMs: number): void {
  if (now >= lastSweepAt && now - lastSweepAt < windowMs) return
  lastSweepAt = now
  for (const [key, timestamps] of rateLimitTimestamps) {
    if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] >= windowMs) rateLimitTimestamps.delete(key)
  }
}

/** 테스트 전용 — 현재 Map에 남은 키 수. */
export function getRateLimitKeyCount(): number {
  return rateLimitTimestamps.size
}

/** `key`별 `windowMs` 동안 최대 `limit`건만 허용한다. 키는 이 함수 밖으로 넘기거나 로그로 남기지 않는다. */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweepExpiredKeys(now, windowMs)
  const recent = (rateLimitTimestamps.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    rateLimitTimestamps.set(key, recent)
    return { ok: false }
  }
  recent.push(now)
  rateLimitTimestamps.set(key, recent)
  return { ok: true }
}

export type RecordTodayCardEventResult = { ok: true } | { ok: false; error: string }

/**
 * `assertCardExposable`이 이미 조회한 카드의 `content_type_id`·그려진 모양(`card_shape`)을 함께 insert한다(카드 재조회 없음).
 * 인자로도, insert 페이로드로도 유저 식별자를 받거나 담지 않는다 — 호출부(API 라우트)는 로그인
 * 여부만 확인하고 유저 ID는 이 함수에 넘기지 않는다.
 */
export async function recordTodayCardEvent(
  input: TodayCardEventInput,
  card: ExposableCard,
): Promise<RecordTodayCardEventResult> {
  const supabase = createServiceClient()

  const { error: insertError } = await supabase.from('today_card_events').insert({
    card_id: input.cardId,
    content_type_id: card.content_type_id,
    card_shape: card.card_shape,
    event: input.event,
    // followupAction을 받지 않으므로 항상 null이다(2026-09-24 사용자 결정, 티켓 20260924_0810).
    followup_action: null,
  })

  if (insertError) return { ok: false, error: insertError.message }
  return { ok: true }
}

export interface TodayCardEventAggregateRow {
  contentTypeId: string | null
  /** 기록 시점에 그려진 모양. NULL이면 모양 도입 전 기록이거나 전환 전 옛 카드다. */
  cardShape: string | null
  event: TodayCardEventType
  count: number
}

// PostgREST 기본 행 상한(1,000)과 맞춘다. 이 값을 넘는 기간은 페이지를 나눠 반복 조회한다
// (티켓 20260924_0810 — 상한에서 조용히 잘리는 문제 대응).
const AGGREGATE_PAGE_SIZE = 1000

/**
 * 기간(`from` 이상 `to` 미만, ISO 문자열) 안의 이벤트를 유형 ID×모양×이벤트별 건수로 집계한다. 유형별 합계는 같은 유형 행을
 * 모양에 상관없이 더하면 지금과 같고, 모양별 합계는 같은 모양 행을 유형에 상관없이 더하면 된다(티켓 20261001_1431).
 * `computeKpiWeeklyMetrics`(kpiWeekly.ts)와 같은 방식 — 원본 행을 읽어 서버에서 그룹핑한다.
 * `id` 오름차순으로 `.range()` 페이지를 반복해 1,000행 상한에서 잘리지 않게 한다.
 */
export async function aggregateTodayCardEvents(from: string, to: string): Promise<TodayCardEventAggregateRow[]> {
  const supabase = createServiceClient()
  const counts = new Map<string, number>()

  for (let offset = 0; ; offset += AGGREGATE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('today_card_events')
      .select('content_type_id, card_shape, event')
      .gte('occurred_at', from)
      .lt('occurred_at', to)
      .order('id', { ascending: true })
      .range(offset, offset + AGGREGATE_PAGE_SIZE - 1)

    if (error) throw error
    for (const row of data ?? []) {
      const key = `${row.content_type_id ?? ''}\u0000${row.card_shape ?? ''}\u0000${row.event}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    if (!data || data.length < AGGREGATE_PAGE_SIZE) break
  }

  return Array.from(counts.entries()).map(([key, count]) => {
    const [contentTypeId, cardShape, event] = key.split('\u0000')
    return {
      contentTypeId: contentTypeId === '' ? null : contentTypeId,
      cardShape: cardShape === '' ? null : cardShape,
      event: event as TodayCardEventType,
      count,
    }
  })
}
