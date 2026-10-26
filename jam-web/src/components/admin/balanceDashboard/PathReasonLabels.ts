/**
 * 컬렉션별 획득 경로 화면의 문구 (티켓 20261022_1136 2회)
 *
 * 길 이름과 길이 닫힌 사유의 한국어 문구를 한 곳에 모은다. 문구는 해요체이고 `UX_WRITING_GUIDELINE.md`의 용어를 따른다
 * (드랍·믹스·미션·동기화·캡슐 열기·등급 올리기·잠김·컬렉션·아이템 배지·트라이브). 사유 상수는 얻을 길 계산의 `ITEM_PATH_REASONS`이고,
 * 새 사유가 생기면 여기에 문구가 없어 시험이 실패한다(`Record`라 타입 검사도 걸린다).
 */
import type { ItemPathReason, ItemPathStatus } from '@/lib/admin/itemPaths/types'
import type { PathKey } from '@/lib/admin/itemPaths/pathView'

/** 길 이름 */
export const PATH_LABELS: Record<PathKey, string> = {
  drop: '드랍',
  mix: '믹스',
  mission: '미션',
  syncCapsule: '동기화·캡슐',
  tierUp: '등급 올리기',
}

/** 길이 닫힌 사유 */
export const PATH_REASON_LABELS: Record<ItemPathReason, string> = {
  collection_inactive: '컬렉션이 비활성 상태예요',
  collection_not_launched: '컬렉션이 아직 공개되지 않았어요',
  collection_ended: '컬렉션 기간이 끝났어요',
  collection_drop_excluded: '컬렉션이 드랍에서 빠져 있어요',
  item_drop_excluded: '아이템 배지가 드랍에서 빠져 있어요',
  item_out_of_period: '아이템 배지가 유효기간 밖이에요',
  collection_no_tribe: '컬렉션에 소속 트라이브가 없어요',
  item_no_rarity: '아이템 배지에 등급이 없어요',
  tier_up_rarity_pair_missing: '컬렉션에 바로 아래나 위 등급의 아이템 배지가 없어요',
  no_recipe: '이 아이템 배지를 주는 레시피가 없어요',
  recipe_scheduled: '레시피가 아직 공개되지 않았어요',
  recipe_ended: '레시피가 끝났어요',
  no_mission: '이 아이템 배지를 주는 미션이 없어요',
  mission_hidden: '미션이 숨겨져 있어요',
  mission_not_exposed: '미션이 아직 노출되지 않았어요',
  mission_not_started: '미션이 아직 시작되지 않았어요',
  mission_ended: '미션이 끝났어요',
}

/** 아이템 상태 이름 */
export const STATUS_LABELS: Record<ItemPathStatus, string> = {
  open: '열림',
  blocked: '막힘',
  drop_excluded: '드랍 제외',
}

/** 잠김으로 만든 아이템 배지가 어느 길로 얻어도 잠긴 채 받는다는 표시 */
export const LOCKED_ON_RECEIVE_LABEL = '잠긴 채 받고 잼으로 열어요'

/** 필요한 양을 정하지 않은 잠긴 아이템 배지는 등급 기본값을 쓴다(정책 표의 값은 읽지 않는다) */
export const DEFAULT_UNLOCK_REQUIRED_LABEL = '등급 기본값'

/** 잠긴 채 받는 모습의 한 줄 — 정한 양이 있으면 «잼 N만큼», 없으면 «등급 기본값» */
export function lockLabel(unlockRequired: number | null): string {
  const amount = unlockRequired === null ? DEFAULT_UNLOCK_REQUIRED_LABEL : `잼 ${unlockRequired.toLocaleString('ko-KR')}만큼`
  return `${LOCKED_ON_RECEIVE_LABEL} (필요한 양 ${amount})`
}
