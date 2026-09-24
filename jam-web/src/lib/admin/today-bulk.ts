/**
 * 투데이 콘텐츠 일괄 처리 판정(티켓 20260924_0947) — DB 접근 없는 순수 함수만 둔다.
 * `api/admin/today/bulk/route.ts`가 카드 기간을 읽어 온 뒤 이 함수로 처리 대상과 건너뜀을 가른다.
 */
import type { BulkSkip } from './bulk/shared'

export interface TodayCardPeriodRow {
  id: string
  title: string
  starts_at: string
  ends_at: string
}

export interface EndPeriodClassification {
  /** `ends_at`을 지금으로 바꿀 카드 ID(요청 순서 유지) */
  endable: string[]
  skipped: BulkSkip[]
}

/**
 * 기간 종료(`ends_at = now`) 대상 분류 — 이미 종료된 카드는 건너뛴다(상위 티켓 §4.1).
 * 아직 시작 전인 카드도 건너뛴다: `ends_at`을 지금으로 바꾸면 종료 시각이 시작 시각보다 앞서는
 * 뒤집힌 기간이 돼 카드가 어느 날짜에도 나타나지 않는다. 그런 카드는 비활성화나 삭제로 다룬다.
 * 요청한 ID가 DB에 없으면(이미 삭제됨) 건너뜀으로 알린다.
 */
export function classifyTodayEndPeriod(
  requestedIds: string[],
  cards: TodayCardPeriodRow[],
  now: Date
): EndPeriodClassification {
  const byId = new Map(cards.map((c) => [c.id, c]))
  const nowMs = now.getTime()
  const endable: string[] = []
  const skipped: BulkSkip[] = []

  for (const id of requestedIds) {
    const card = byId.get(id)
    if (!card) {
      skipped.push({ id, reason: '이미 삭제된 카드예요.' })
    } else if (new Date(card.ends_at).getTime() <= nowMs) {
      skipped.push({ id, label: card.title, reason: '이미 종료된 카드예요.' })
    } else if (new Date(card.starts_at).getTime() > nowMs) {
      skipped.push({
        id,
        label: card.title,
        reason: '아직 시작 전인 카드예요. 비활성화하거나 삭제해 주세요.',
      })
    } else {
      endable.push(id)
    }
  }

  return { endable, skipped }
}
