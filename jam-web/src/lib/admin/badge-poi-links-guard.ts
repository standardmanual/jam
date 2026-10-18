/**
 * 배지 수정 폼의 장소 연결 저장 가드 (티켓 20261018_1813, 원인 티켓 20261006_1028)
 *
 * 체크인 배지를 저장하면 폼은 연결 장소 목록을 `poi-links` PUT으로 통째로 덮어쓴다.
 * 수정 화면이 현재 연결을 아직 불러오지 못한 채(불러오는 중·실패) 저장하면 빈 목록이 그대로
 * 전송되어 기존 연결이 모두 지워진다. 그래서 «불러오기에 성공한 뒤»에만 저장을 허용한다.
 * 새 배지(`isEdit=false`)는 불러올 연결이 없으므로 항상 허용한다.
 *
 * 서버 전용 의존이 없어 클라이언트 컴포넌트(`BadgeForm`)에서 그대로 쓴다.
 */
import type { BadgeType } from '@/types/database'

export type PoiLinksLoadState = 'idle' | 'loading' | 'loaded' | 'failed'

export const POI_LINKS_NOT_LOADED_MESSAGE =
  '연결된 장소를 아직 불러오지 못해 저장하지 않았어요. 연결이 지워질 수 있어서예요. 화면을 새로 고친 뒤 다시 저장해 주세요.'

/** 저장 직전에 부른다. null이면 저장해도 되고, 문구가 있으면 저장하지 않고 그 문구를 보여 준다. */
export function findPoiLinksNotLoadedError(type: BadgeType, isEdit: boolean, state: PoiLinksLoadState): string | null {
  if (type !== 'checkin' || !isEdit) return null
  return state === 'loaded' ? null : POI_LINKS_NOT_LOADED_MESSAGE
}

/**
 * 불러온 연결에, 불러오는 동안 화면에서 먼저 추가한 장소를 이어 붙인다(중복 제외).
 * 불러온 목록이 항상 앞에 온다.
 */
export function mergeLoadedPoiLinks<T extends { id: string }>(loaded: T[], current: T[]): T[] {
  const loadedIds = new Set(loaded.map((p) => p.id))
  return [...loaded, ...current.filter((p) => !loadedIds.has(p.id))]
}
