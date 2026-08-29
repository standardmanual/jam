/**
 * 아이템배지(InventoryItem) 개체의 "현재 상태" 파생 로직 — 티켓 20260829_2139
 *
 * `inventory_items`에는 상태를 나타내는 단일 컬럼이 없다(20260829_2101의 확정 모델 —
 * Held/Dropped/AtPoi/Slotted/Consumed/Orphaned/Destroyed는 여러 컬럼·연관 테이블 조합으로
 * 파생해야 한다). 이 파일은 그 파생 규칙과 화면 표기 라벨을 한 곳에 모은다 — 목록/상세
 * 화면이 각자 다른 기준으로 상태를 계산하면 서로 다른 답이 나올 수 있기 때문이다.
 *
 * 파생 규칙(20260829_2101 상태 전이 다이어그램과 1:1 대응):
 *   - destroyed_at IS NOT NULL → Consumed 또는 Destroyed
 *     (Consume/Expire 둘 다 같은 destroyed_at 컬럼을 쓰므로, 마지막 Consume/Expire
 *     CustodyEvent로 원인을 구분한다 — destroyReasonEvent 파라미터)
 *   - inventory_id IS NOT NULL → Held 또는 Slotted(slotted_in 유무)
 *   - inventory_id IS NULL, 파괴 안 됨, 참조하는 활성 poi_drops 있음 → Dropped(유저) 또는
 *     AtPoi(시스템) — poi_drops.source로 구분
 *   - 위 어디에도 해당 안 됨(소유자 없음 + 활성 드랍 없음 + 파괴 안 됨) → Orphaned
 */
import type { CustodyEventType, PoiDropSource } from '@/types/database'

export type ItemBadgeStatus =
  | 'Held'
  | 'Dropped'
  | 'AtPoi'
  | 'Slotted'
  | 'Consumed'
  | 'Orphaned'
  | 'Destroyed'

export const ITEM_BADGE_STATUS_LABEL: Record<ItemBadgeStatus, string> = {
  Held: '보유중',
  Dropped: '드랍됨 (유저)',
  AtPoi: '드랍됨 (시스템)',
  Slotted: '장착중',
  Consumed: '소모됨',
  Orphaned: '소유자 없음',
  Destroyed: '파괴됨(만료)',
}

/** 상태 필터 드롭다운 옵션 — 브레드보드에 명시된 순서 그대로 */
export const ITEM_BADGE_STATUS_OPTIONS: { value: ItemBadgeStatus; label: string }[] = (
  ['Held', 'Dropped', 'AtPoi', 'Slotted', 'Consumed', 'Orphaned', 'Destroyed'] as ItemBadgeStatus[]
).map((value) => ({ value, label: ITEM_BADGE_STATUS_LABEL[value] }))

/** 상태 배지 색상 — 보유/장착=긍정, 드랍=중립, 소모/파괴=경고, 고아=주의 */
export const ITEM_BADGE_STATUS_COLOR: Record<ItemBadgeStatus, string> = {
  Held: 'bg-emerald-100 text-emerald-800',
  Slotted: 'bg-blue-100 text-blue-800',
  Dropped: 'bg-amber-100 text-amber-800',
  AtPoi: 'bg-amber-100 text-amber-800',
  Orphaned: 'bg-orange-100 text-orange-800',
  Consumed: 'bg-neutral-200 text-neutral-700',
  Destroyed: 'bg-neutral-200 text-neutral-700',
}

export const CUSTODY_EVENT_LABEL: Record<CustodyEventType, string> = {
  Minted: '발급',
  UserDrop: '유저 드랍',
  Pickup: '픽업',
  Expire: '만료 소각',
  Slot: '컬렉션 장착',
  Unslot: '장착 해제',
  Consume: '조합 소모',
  Orphan: '소유자 탈퇴',
  AdminDestroy: '어드민 영구 폐기',
  AdminReassign: '어드민 재배정',
}

/** 배지(도안) 등급 라벨 — 다른 어드민 화면(BadgeCard.tsx 등)과 동일한 표기 */
export const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  legend: 'Legend',
  mythic: 'Mythic',
}

export const RARITY_BADGE_COLOR: Record<string, string> = {
  common: 'bg-gray-200 text-gray-800',
  rare: 'bg-blue-200 text-blue-800',
  legend: 'bg-violet-200 text-violet-800',
  mythic: 'bg-amber-200 text-amber-800',
}

interface DeriveItemBadgeStatusInput {
  destroyedAt: string | null
  inventoryId: string | null
  slottedIn: string | null
  /** 이 개체를 가리키는 활성(is_available=true) poi_drops row 존재 여부 */
  hasActivePoiDrop: boolean
  activePoiDropSource: PoiDropSource | null
  /** destroyedAt이 있을 때만 의미 있음 — 이 개체에 기록된 마지막 Consume/Expire 이벤트 종류.
   *  둘 다 없으면(레거시 데이터 등) 보수적으로 Destroyed(만료)로 표기한다. */
  destroyReasonEvent: 'Consume' | 'Expire' | null
}

export function deriveItemBadgeStatus(input: DeriveItemBadgeStatusInput): ItemBadgeStatus {
  if (input.destroyedAt) {
    return input.destroyReasonEvent === 'Consume' ? 'Consumed' : 'Destroyed'
  }
  if (input.inventoryId) {
    return input.slottedIn ? 'Slotted' : 'Held'
  }
  if (input.hasActivePoiDrop) {
    return input.activePoiDropSource === 'user' ? 'Dropped' : 'AtPoi'
  }
  return 'Orphaned'
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
