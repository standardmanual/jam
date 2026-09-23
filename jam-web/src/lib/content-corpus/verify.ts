/**
 * 승인 전 기계 검사 (티켓 20260923_2256, PRD §4 규칙5)
 *
 * "후보안의 대상 ID를 재조회해 활성 판정에 어긋나면 자동 반려하고 사유를 남긴다."
 * `selectCorpusForType`이 돌려준 `targets`가 편성 사이 시점에 비활성으로 바뀌었을 수
 * 있으므로, 승인 직전 다시 한 번 활성 여부만 재확인한다.
 */
import { fetchActiveBadges, fetchActiveItemBooks, fetchActiveTribes } from './active'
import type { CorpusKind, CorpusTarget } from './types'

export interface VerifyActiveTargetsDraft {
  targets: CorpusTarget[]
}

export interface VerifyActiveTargetsResult {
  ok: boolean
  reasons: string[]
}

const ACTIVE_FETCHERS: Record<CorpusKind, (ids: string[]) => Promise<{ id: string }[]>> = {
  tribe: fetchActiveTribes,
  item_book: fetchActiveItemBooks,
  badge: fetchActiveBadges,
}

const KIND_LABEL: Record<CorpusKind, string> = {
  tribe: '트라이브',
  item_book: '컬렉션',
  badge: '배지',
}

export async function verifyActiveTargets(
  draft: VerifyActiveTargetsDraft
): Promise<VerifyActiveTargetsResult> {
  const idsByKind = new Map<CorpusKind, string[]>()
  for (const target of draft.targets) {
    idsByKind.set(target.kind, [...(idsByKind.get(target.kind) ?? []), target.id])
  }

  const reasons: string[] = []
  for (const [kind, ids] of idsByKind) {
    const activeRows = await ACTIVE_FETCHERS[kind](ids)
    const activeIds = new Set(activeRows.map((row) => row.id))
    for (const id of ids) {
      if (!activeIds.has(id)) {
        reasons.push(`${KIND_LABEL[kind]} ${id}는 비활성 상태라 대상으로 쓸 수 없습니다.`)
      }
    }
  }

  return { ok: reasons.length === 0, reasons }
}
