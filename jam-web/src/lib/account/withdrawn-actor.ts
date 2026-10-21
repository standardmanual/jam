/**
 * 탈퇴한 유저의 행위자 판정 (티켓 20261021_1249 2회, 운영 로직 17.2절).
 *
 * 유저를 지우면 이력의 *_user_id는 SET NULL로 비고(마이그레이션 108), 이름 칸도 비워진다(마이그레이션 263·264).
 * 그래서 «비어 있다»만으로는 탈퇴인지 원래 비었는지 알 수 없다. 이 모듈은 이벤트 종류별로 «필수 칸»을 정해 두고,
 * 필수 칸의 *_user_id가 NULL이면 탈퇴로 판정한다. 필수가 아닌 칸의 NULL은 원래 비어 있는 것이다.
 *
 * 순수 함수만 둔다(DB·네트워크 없음). 표시 문구는 `ko.withdrawnUser` 한 곳에 있다.
 */
import type { CustodyEventRow, CustodyEventType, PoiDropSource } from '@/types/database'

export type CustodySlot = 'from' | 'to' | 'actor'

/**
 * 이벤트 종류별 필수 칸. Pickup의 `from`은 유저 드랍을 줍는 경우에만 필수라 여기 두지 않고 `withdrawnSlots`가 따로 본다.
 * - Minted·Expire: 셋 다 원래 빈다(시스템이 만들고 시스템이 소각).
 * - UserDrop: 드랍한 유저(from). Pickup: 줍는 유저(to). Orphan: 소유자(from, 소유자 탈퇴 기록).
 * - Slot·Unslot·Consume·AdminDestroy: 실행한 유저(actor). AdminReassign: 받는 유저(to)와 실행한 어드민(actor).
 */
const REQUIRED_SLOTS: Record<CustodyEventType, readonly CustodySlot[]> = {
  Minted: [],
  Expire: [],
  UserDrop: ['from'],
  Pickup: ['to'],
  Slot: ['actor'],
  Unslot: ['actor'],
  Consume: ['actor'],
  AdminDestroy: ['actor'],
  Orphan: ['from'],
  AdminReassign: ['to', 'actor'],
}

type CustodyUserIds = Pick<CustodyEventRow, 'from_user_id' | 'to_user_id' | 'actor_user_id'>

const USER_ID_KEY: Record<CustodySlot, keyof CustodyUserIds> = {
  from: 'from_user_id',
  to: 'to_user_id',
  actor: 'actor_user_id',
}

/**
 * 이 이벤트에서 «탈퇴한 유저»로 보여야 하는 칸을 돌려준다.
 *
 * @param dropSource `Pickup` 이벤트에서만 쓴다. 같은 개체의 `poi_drops` 중 `picked_up_at`이 이 이벤트 시각과 같은 행의 `source`.
 *   `'user'`면 줍힌 드랍을 유저가 놓은 것이라 `from`이 필수가 된다. `'system'`이거나 짝을 못 찾았으면(null·undefined)
 *   `from`이 원래 비어 있는 것으로 보고 아무것도 그리지 않는다.
 */
export function withdrawnSlots(
  event: CustodyUserIds & Pick<CustodyEventRow, 'event_type'>,
  dropSource?: PoiDropSource | null
): Record<CustodySlot, boolean> {
  const required = new Set<CustodySlot>(REQUIRED_SLOTS[event.event_type])
  if (event.event_type === 'Pickup' && dropSource === 'user') required.add('from')

  return {
    from: required.has('from') && event.from_user_id === null,
    to: required.has('to') && event.to_user_id === null,
    actor: required.has('actor') && event.actor_user_id === null,
  }
}

/** 드랍 한 건의 드랍한 유저가 탈퇴했는가. 시스템(앰비언트) 드랍은 원래 드랍한 유저가 없으므로 해당하지 않는다 */
export function isWithdrawnDrop(drop: { source: PoiDropSource; dropper_user_id: string | null }): boolean {
  return drop.source === 'user' && drop.dropper_user_id === null
}

/** 한 칸의 표시 정보. `user`는 살아 있는 유저(이름 칸이 값을 가진 경우만), `withdrawn`은 탈퇴 표시 */
export type CustodyActorView = { kind: 'user'; userId: string; name: string } | { kind: 'withdrawn' }

export interface CustodyActorViews {
  from: CustodyActorView | null
  to: CustodyActorView | null
  actor: CustodyActorView | null
}

/**
 * 어드민 이력 한 줄의 from·to·actor 표시 정보를 만든다. null이면 그 칸을 그리지 않는다.
 * - *_user_id가 값이 있으면 이름이 있을 때만 유저로 보인다(이름이 없으면 지금처럼 그리지 않는다).
 * - *_user_id가 NULL이면 이름 문자열이 남아 있어도 무시한다(마이그레이션 264 이전의 옛 스냅샷). 필수 칸이면 탈퇴, 아니면 그리지 않는다.
 */
export function resolveCustodyActors(
  event: CustodyUserIds &
    Pick<CustodyEventRow, 'event_type' | 'from_username' | 'to_username' | 'actor_username'>,
  dropSource?: PoiDropSource | null
): CustodyActorViews {
  const withdrawn = withdrawnSlots(event, dropSource)
  const names: Record<CustodySlot, string | null> = {
    from: event.from_username,
    to: event.to_username,
    actor: event.actor_username,
  }

  const view = (slot: CustodySlot): CustodyActorView | null => {
    const userId = event[USER_ID_KEY[slot]]
    if (userId !== null) {
      const name = names[slot]
      return name ? { kind: 'user', userId, name } : null
    }
    return withdrawn[slot] ? { kind: 'withdrawn' } : null
  }

  return { from: view('from'), to: view('to'), actor: view('actor') }
}

/**
 * `Pickup` 이벤트와 짝인 `poi_drops` 행의 source를 찾는다. 짝은 `picked_up_at`이 이벤트 시각(`created_at`)과 같은 행이다.
 * 문자열 표기가 달라도(Z, +00:00) 같은 시각이면 같은 것으로 본다. 짝이 없으면 null이다(2026-10-21 실측: 105건 중 5건).
 */
export function findPickupDropSource(
  event: Pick<CustodyEventRow, 'event_type' | 'created_at'>,
  drops: ReadonlyArray<{ source: PoiDropSource; picked_up_at: string | null }>
): PoiDropSource | null {
  if (event.event_type !== 'Pickup') return null
  const at = Date.parse(event.created_at)
  if (Number.isNaN(at)) return null
  const match = drops.find((d) => d.picked_up_at !== null && Date.parse(d.picked_up_at) === at)
  return match?.source ?? null
}
