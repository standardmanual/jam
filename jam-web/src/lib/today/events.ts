/**
 * 투데이 카드 이벤트 기록·집계 (티켓 20260924_0004)
 *
 * `today_card_events`(마이그레이션 183)에 노출·열람·후속 행동을 유형 ID와 함께 남긴다.
 * 유저 식별자는 어떤 형태로도 인자로 받지도, 저장하지도 않는다(PRD content-automation/PRD.md
 * §9 "개인 식별자는 저장하지 않는다", 결정 4-6). content_type_id는 기록 시점 카드의 값을
 * 그대로 복제해 저장한다 — 카드가 나중에 유형을 바꾸거나 삭제돼도 이벤트의 유형 귀속이
 * 흔들리지 않는다(마이그레이션 183 COMMENT).
 */
import { createServiceClient } from '@/lib/supabase/server'

export const TODAY_CARD_EVENT_TYPES = ['impression', 'click', 'followup'] as const
export type TodayCardEventType = (typeof TODAY_CARD_EVENT_TYPES)[number]

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_FOLLOWUP_ACTION_LENGTH = 80

export interface TodayCardEventInput {
  cardId: string
  event: TodayCardEventType
  followupAction: string | null
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
  const { cardId, event, followupAction } = body as Record<string, unknown>

  if (typeof cardId !== 'string' || !UUID_RE.test(cardId)) {
    return { ok: false, error: 'cardId가 올바른 UUID 형식이 아닙니다.' }
  }
  if (typeof event !== 'string' || !TODAY_CARD_EVENT_TYPES.includes(event as TodayCardEventType)) {
    return { ok: false, error: `event는 ${TODAY_CARD_EVENT_TYPES.join('/')} 중 하나여야 합니다.` }
  }

  let normalizedFollowupAction: string | null = null
  if (followupAction !== undefined && followupAction !== null) {
    if (
      typeof followupAction !== 'string' ||
      followupAction.length === 0 ||
      followupAction.length > MAX_FOLLOWUP_ACTION_LENGTH
    ) {
      return { ok: false, error: `followupAction은 1~${MAX_FOLLOWUP_ACTION_LENGTH}자 문자열이어야 합니다.` }
    }
    normalizedFollowupAction = followupAction
  }
  if (event === 'followup' && !normalizedFollowupAction) {
    return { ok: false, error: 'followup 이벤트는 followupAction이 필요합니다.' }
  }

  return {
    ok: true,
    value: { cardId, event: event as TodayCardEventType, followupAction: normalizedFollowupAction },
  }
}

export type RecordTodayCardEventResult = { ok: true } | { ok: false; error: string }

/**
 * 카드의 `content_type_id`를 조회해 함께 insert한다. 인자로도, insert 페이로드로도 유저
 * 식별자를 받거나 담지 않는다 — 호출부(API 라우트)는 로그인 여부만 확인하고 유저 ID는 이
 * 함수에 넘기지 않는다.
 */
export async function recordTodayCardEvent(input: TodayCardEventInput): Promise<RecordTodayCardEventResult> {
  const supabase = createServiceClient()

  const { data: card, error: cardError } = await supabase
    .from('today_cards')
    .select('content_type_id')
    .eq('id', input.cardId)
    .maybeSingle()

  if (cardError) return { ok: false, error: cardError.message }
  if (!card) return { ok: false, error: '카드를 찾을 수 없습니다.' }

  const { error: insertError } = await supabase.from('today_card_events').insert({
    card_id: input.cardId,
    content_type_id: card.content_type_id,
    event: input.event,
    followup_action: input.followupAction,
  })

  if (insertError) return { ok: false, error: insertError.message }
  return { ok: true }
}

export interface TodayCardEventAggregateRow {
  contentTypeId: string | null
  event: TodayCardEventType
  count: number
}

/**
 * 기간(`from` 이상 `to` 미만, ISO 문자열) 안의 이벤트를 유형 ID×이벤트별 건수로 집계한다.
 * `computeKpiWeeklyMetrics`(kpiWeekly.ts)와 같은 방식 — 원본 행을 읽어 서버에서 그룹핑한다.
 */
export async function aggregateTodayCardEvents(from: string, to: string): Promise<TodayCardEventAggregateRow[]> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('today_card_events')
    .select('content_type_id, event')
    .gte('occurred_at', from)
    .lt('occurred_at', to)

  if (error) throw error

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const key = `${row.content_type_id ?? ''}\u0000${row.event}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries()).map(([key, count]) => {
    const [contentTypeId, event] = key.split('\u0000')
    return {
      contentTypeId: contentTypeId === '' ? null : contentTypeId,
      event: event as TodayCardEventType,
      count,
    }
  })
}
