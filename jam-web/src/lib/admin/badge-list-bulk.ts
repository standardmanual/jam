/**
 * 배지 목록 일괄 처리 전용 순수 판정(티켓 20260924_0944) — `api/admin/badges/list-bulk/route.ts`가
 * 그대로 쓴다. `lib/admin/badge-bulk.ts`(배지 일괄 변경 도구 `/api/admin/badges/bulk` 전용)와는
 * 별개다 — 이름이 겹치지 않도록 `badge-list-bulk`로 둔다.
 */
import type { BadgeType } from '@/types/database'
import type { BulkSkip } from './bulk/shared'

export interface BadgeTribeAssignmentCandidate {
  type: BadgeType
  item_book_id: string | null
}

export interface BadgeTribeAssignmentClassification {
  /** 트라이브를 지정할 수 있는 id */
  assignable: string[]
  skipped: BulkSkip[]
}

/**
 * 트라이브 일괄 지정 대상을 "지정 가능"과 "건너뜀"으로 나눈다(상위 티켓 §4.1 배지 행).
 *
 * - 체크인 배지: 저장 API(`badges/[id]/route.ts`)가 트라이브를 항상 null로 강제하므로 건너뛴다.
 * - 소속 컬렉션(`item_book_id`)이 있고 그 컬렉션의 트라이브가 지정하려는 트라이브와 다르면
 *   건너뛴다 — 드랍 엔진은 배지가 아니라 **컬렉션**의 트라이브를 읽는다
 *   (`lib/drop-engine/index.ts`의 `tribeOfBook`), 그래서 배지의 트라이브만 바꾸면 실제 드랍
 *   가중치와 어긋나는 값이 남는다.
 */
export function classifyBadgeTribeAssignment(
  ids: string[],
  candidates: Map<string, BadgeTribeAssignmentCandidate>,
  tribeIdByItemBookId: Map<string, string | null>,
  targetTribeId: string
): BadgeTribeAssignmentClassification {
  const assignable: string[] = []
  const skipped: BulkSkip[] = []

  for (const id of ids) {
    const candidate = candidates.get(id)
    if (!candidate) {
      skipped.push({ id, reason: '배지를 찾을 수 없습니다.' })
      continue
    }

    if (candidate.type === 'checkin') {
      skipped.push({ id, reason: '체크인 배지는 트라이브를 지정할 수 없습니다.' })
      continue
    }

    if (candidate.item_book_id) {
      const bookTribeId = tribeIdByItemBookId.get(candidate.item_book_id) ?? null
      if (bookTribeId !== targetTribeId) {
        skipped.push({ id, reason: '소속 컬렉션의 트라이브와 달라 지정할 수 없습니다.' })
        continue
      }
    }

    assignable.push(id)
  }

  return { assignable, skipped }
}
