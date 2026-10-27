/**
 * 항목의 기획 이유·핵심 표시를 읽는 순수 함수 (티켓 20261026_2021에서 `query.ts`에 있던 것을 티켓 20261026_2024가 옮겼다).
 * 결정 패널 같은 클라이언트 컴포넌트도 쓰므로 서버 클라이언트를 가져오는 `query.ts`와 떨어뜨렸다. `query.ts`가 다시 내보낸다.
 */
import type { Json } from '@/types/database.generated'
import { MAX_RATIONALES_PER_ITEM, OPS_RATIONALE_KINDS, type OpsRationaleKind } from '@/lib/admin/opsInbox/constants'

/** 항목 하나의 기획 이유 한 개(어드민 상황판 PRD §5.2). */
export interface OpsItemRationale {
  kind: OpsRationaleKind
  label: string
  note: string | null
  sourceId: string | number | null
}

/**
 * 항목 원본(`original`, 수정본이 있으면 수정본)에서 기획 이유 목록을 꺼낸다(순수 함수). 배열이 아니면 빈 배열이고,
 * `kind`가 허용값이 아니거나 `label`이 비어 있는 원소는 빠진다. 최대 3개까지만 돌려준다.
 */
export function readOpsItemRationales(source: Json | null | undefined): OpsItemRationale[] {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return []
  const list = (source as { [key: string]: Json | undefined }).rationale
  if (!Array.isArray(list)) return []
  const rationales: OpsItemRationale[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const { kind, label, note, source_id } = entry as { [key: string]: Json | undefined }
    if (typeof kind !== 'string' || !(OPS_RATIONALE_KINDS as readonly string[]).includes(kind)) continue
    if (typeof label !== 'string' || label.trim() === '') continue
    rationales.push({
      kind: kind as OpsRationaleKind,
      label,
      note: typeof note === 'string' ? note : null,
      sourceId: typeof source_id === 'string' || typeof source_id === 'number' ? source_id : null,
    })
    if (rationales.length >= MAX_RATIONALES_PER_ITEM) break
  }
  return rationales
}

/** 항목 원본(수정본이 있으면 수정본)의 `highlight`(핵심 항목 표시). `true`일 때만 참이다. */
export function readOpsItemHighlight(source: Json | null | undefined): boolean {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return false
  return (source as { [key: string]: Json | undefined }).highlight === true
}
