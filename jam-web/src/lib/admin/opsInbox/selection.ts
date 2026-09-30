/**
 * 일괄 승인 체크 상태와 다음 결정 항목 고르기 (티켓 20260930_1818, 순수 함수 — 화면 `OpsDecisionWorkspace`가 쓴다).
 *
 * 체크는 **검토중** 항목에만 있다. 기본 체크는 형식 오류가 없는 항목이고, 형식 오류 항목은 기본 해제(제외)다(채원 설계 승인 항목 4).
 * 사람이 바꾼 체크는 항목의 수정 시각(`updatedAt`)과 함께 기억한다 — 서버 화면을 다시 읽어 항목이 바뀌면(수정·되돌리기로
 * 형식 오류가 사라진 경우 등) 그 기억은 저절로 무효가 되고 새 항목 기준의 기본값으로 돌아간다. 따로 초기화하는 코드가 없다.
 */
import { groupItemsByDay } from '@/lib/admin/opsInbox/itemView'

export interface CheckOverride {
  checked: boolean
  /** 체크를 바꿀 때 본 항목의 수정 시각. 항목의 수정 시각이 달라지면 이 기억은 버린다. */
  updatedAt: string
}

export type CheckOverrides = Readonly<Record<string, CheckOverride>>

export interface SelectableItem {
  id: string
  position: number
  startsAt: string | null
  status: string
  formatErrors: readonly string[]
  updatedAt: string
}

/** 결정할 수 있는(체크박스가 있는) 항목: 검토중. 도착 항목은 검토중으로 바뀐 뒤부터다. */
export function isDecidable(item: Pick<SelectableItem, 'status'>): boolean {
  return item.status === 'reviewing'
}

/** 기본 체크: 형식 오류가 없는 항목. */
export function isCheckedByDefault(item: Pick<SelectableItem, 'formatErrors'>): boolean {
  return item.formatErrors.length === 0
}

export function isItemChecked(item: SelectableItem, overrides: CheckOverrides): boolean {
  if (!isDecidable(item)) return false
  const override = overrides[item.id]
  if (override && override.updatedAt === item.updatedAt) return override.checked
  return isCheckedByDefault(item)
}

export interface CheckSplit<T> {
  /** 결정할 수 있는 항목 전부(검토중). */
  decidable: T[]
  /** 체크한 항목(승인할 것). */
  checked: T[]
  /** 체크하지 않은 결정 전 항목(제외할 것). */
  excluded: T[]
}

export function splitByChecked<T extends SelectableItem>(items: readonly T[], overrides: CheckOverrides): CheckSplit<T> {
  const decidable = items.filter(isDecidable)
  const checked = decidable.filter((item) => isItemChecked(item, overrides))
  return { decidable, checked, excluded: decidable.filter((item) => !checked.includes(item)) }
}

/** 체크를 바꾼 기억을 더한다(다른 항목의 기억은 그대로). */
export function withCheck(overrides: CheckOverrides, item: Pick<SelectableItem, 'id' | 'updatedAt'>, checked: boolean): CheckOverrides {
  return { ...overrides, [item.id]: { checked, updatedAt: item.updatedAt } }
}

/** 결정할 수 있는 항목 전부를 한꺼번에 체크하거나 해제한다. */
export function withAllChecked(overrides: CheckOverrides, decidable: readonly SelectableItem[], checked: boolean): CheckOverrides {
  const next: Record<string, CheckOverride> = { ...overrides }
  for (const item of decidable) next[item.id] = { checked, updatedAt: item.updatedAt }
  return next
}

/**
 * 결정을 마친 항목 다음으로 보여 줄 항목. 목록에 보이는 순서(공개 시각 날짜별)에서 그 항목 뒤의 첫 검토중 항목이고,
 * 뒤에 없으면 앞쪽의 첫 검토중 항목이다. 남은 검토중 항목이 없으면 null(선택을 그대로 둔다).
 */
export function nextDecidableItemId(items: readonly SelectableItem[], afterId: string): string | null {
  const ordered = groupItemsByDay(items).flatMap((group) => group.items)
  const at = ordered.findIndex((item) => item.id === afterId)
  const candidates = at < 0 ? ordered : [...ordered.slice(at + 1), ...ordered.slice(0, at)]
  return candidates.find((item) => item.id !== afterId && isDecidable(item))?.id ?? null
}
