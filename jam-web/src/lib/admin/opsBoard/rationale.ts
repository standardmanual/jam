/**
 * 기획 이유 칩·핵심 항목·종류별 묶음 (티켓 20261026_2024 1회차, 어드민 상황판 PRD §6.3). 순수 함수이고 서버 전용 모듈을 가져오지 않는다.
 *
 * 항목의 이유·핵심 표시는 수정본이 있으면 수정본에서 읽는다(`edited ?? original`). 새 필드가 없는 옛 묶음은 모두 빈 결과다.
 */
import {
  MAX_HIGHLIGHTS_PER_BUNDLE,
  OPS_ITEM_KINDS,
  OPS_RATIONALE_KINDS,
  type OpsRationaleKind,
} from '@/lib/admin/opsInbox/constants'
import { readOpsItemHighlight, readOpsItemRationales, type OpsItemRationale } from '@/lib/admin/opsInbox/rationaleRead'
import { isDecidable } from '@/lib/admin/opsInbox/selection'
import type { Json } from '@/types/database.generated'

/** 이유 칩 종류 이름. */
export const RATIONALE_KIND_LABELS: Record<OpsRationaleKind, string> = {
  trend: '트렌드',
  season: '시즌',
  weather: '날씨',
  signal: '신호',
  pattern: '패턴',
}

const PATTERN_PROPOSAL_KIND = 'pattern_proposal'
/** 이유를 세지 않는 항목 상태: 반려·취소. */
const UNCOUNTED_STATUSES: readonly string[] = ['rejected', 'cancelled']

interface RationaleItem {
  id: string
  position: number
  kind: string | null
  status: string
  original: Json
  edited: Json | null
}

/** 항목의 이유 목록(최대 3개). 수정본이 있으면 수정본에서 읽는다. */
export function itemRationaleChips(item: Pick<RationaleItem, 'original' | 'edited'>): OpsItemRationale[] {
  return readOpsItemRationales(item.edited ?? item.original)
}

export interface BundleRationaleChip {
  kind: OpsRationaleKind
  count: number
}

/** 묶음 안 모든 항목의 이유를 종류별로 센다. 많은 순이고 같으면 종류 순서다. 반려·취소 항목은 세지 않는다. */
export function bundleRationaleChips(items: readonly RationaleItem[]): BundleRationaleChip[] {
  const counts = new Map<OpsRationaleKind, number>()
  for (const item of items) {
    if (UNCOUNTED_STATUSES.includes(item.status)) continue
    for (const rationale of itemRationaleChips(item)) counts.set(rationale.kind, (counts.get(rationale.kind) ?? 0) + 1)
  }
  return OPS_RATIONALE_KINDS.filter((kind) => counts.has(kind))
    .map((kind) => ({ kind, count: counts.get(kind) ?? 0 }))
    .sort((a, b) => b.count - a.count) // 같은 수는 종류 순서(정렬이 안정적이다)
}

/**
 * 「이번 기획의 핵심」 항목: 핵심 표시가 참인 항목(`position` 순, 최대 5개). 하나도 없으면 확인 필요 항목으로 대신한다(최대 5개).
 * `fallback`은 어느 쪽인지 알려 준다 — 화면 제목이 달라진다. 둘 다 없으면 빈 배열이다.
 */
export function highlightItems<T extends RationaleItem>(
  items: readonly T[],
  needsCheckIds: ReadonlySet<string>
): { items: T[]; fallback: boolean } {
  const byPosition = [...items].sort((a, b) => a.position - b.position)
  const highlighted = byPosition.filter((item) => readOpsItemHighlight(item.edited ?? item.original))
  if (highlighted.length > 0) return { items: highlighted.slice(0, MAX_HIGHLIGHTS_PER_BUNDLE), fallback: false }
  return { items: byPosition.filter((item) => needsCheckIds.has(item.id)).slice(0, MAX_HIGHLIGHTS_PER_BUNDLE), fallback: true }
}

export interface KindGroup {
  kind: string | null
  itemIds: string[]
}

/**
 * 결정할 수 있는 항목(체크박스가 있는 검토중 항목, 패턴 제안 제외)을 종류별로 묶는다.
 * 종류 순서는 `OPS_ITEM_KINDS` 순서이고 허용값 밖 종류는 맨 뒤다.
 */
export function kindGroups(items: readonly Pick<RationaleItem, 'id' | 'kind' | 'status'>[]): KindGroup[] {
  const groups = new Map<string | null, string[]>()
  for (const item of items) {
    if (!isDecidable(item) || item.kind === PATTERN_PROPOSAL_KIND) continue
    groups.set(item.kind, [...(groups.get(item.kind) ?? []), item.id])
  }
  const order = OPS_ITEM_KINDS as readonly (string | null)[]
  const rank = (kind: string | null) => {
    const at = order.indexOf(kind)
    return at < 0 ? order.length : at
  }
  return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0])).map(([kind, itemIds]) => ({ kind, itemIds }))
}
