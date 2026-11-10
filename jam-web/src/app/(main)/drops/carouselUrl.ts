/**
 * 드랍 지도의 장소 캐러셀 모달을 주소(`/drops?poi=<장소ID>`)에 싣는 규칙 (티켓 20261110_1216).
 * 열림 상태는 주소의 `poi`에서 파생하고, 아래 순수 함수가 열림·닫힘·정리 판정을 맡는다.
 */

export const DROPS_PATH = '/drops'

/** 캐러셀을 열 때 주소로 쓰는 경로. 장소 ID는 URL 안전하도록 인코딩한다. */
export function carouselPoiHref(poiId: string): string {
  return `${DROPS_PATH}?poi=${encodeURIComponent(poiId)}`
}

interface PoiRef {
  id: string
  in_drop_range: boolean
}

export type CarouselPoiResolution =
  /** 주소에 poi가 없다 — 모달 닫힘 */
  | { status: 'none' }
  /** 장소 목록을 아직 못 받았다 — 판정을 미룬다(모달은 열지 않는다) */
  | { status: 'pending' }
  /** 근처 장소에 있고 반경 안이다 — 모달을 연다 */
  | { status: 'open'; poiId: string }
  /** 근처 장소에 없거나 반경 밖이다 — 모달 없이 /drops로 정리한다 */
  | { status: 'invalid' }

/**
 * 주소의 poi 값을 모달 열림 상태로 바꾼다.
 * `poisLoaded`는 장소 목록을 한 번이라도 성공적으로 받았는지다. 드랍·픽업 뒤 목록을
 * 다시 불러오는 동안에는 이미 받은 목록으로 판정해, 열린 모달이 깜빡 닫히지 않게 한다.
 * 반경 밖 장소는 마커를 눌러도 캐러셀이 열리지 않으므로(handlePoiSelect) 같은 기준으로 거른다.
 */
export function resolveCarouselPoi(params: {
  poiParam: string | null
  pois: readonly PoiRef[]
  poisLoaded: boolean
  /** 이미 이 모달로 열린 장소 ID. 열린 뒤 내 위치가 바뀌어 목록에서 빠져도 모달은 닫지 않는다(예전 동작 유지) */
  openedPoiId?: string | null
}): CarouselPoiResolution {
  const { poiParam, pois, poisLoaded, openedPoiId = null } = params
  if (!poiParam) return { status: 'none' }
  if (poiParam === openedPoiId) return { status: 'open', poiId: poiParam }
  if (!poisLoaded) return { status: 'pending' }
  const found = pois.find((p) => p.id === poiParam)
  if (!found || !found.in_drop_range) return { status: 'invalid' }
  return { status: 'open', poiId: found.id }
}

export type CarouselCloseAction = 'back' | 'replace'

/**
 * 캐러셀을 닫는 방법. 이 화면에서 push로 열었다면 앞 history 항목이 지도 화면이므로
 * 뒤로 가기로 닫는다. 링크·새로고침으로 바로 열려 앞 항목이 없으면(또는 앞 항목이 다른
 * 사이트일 수 있으면) 뒤로 가지 않고 `/drops`로 바꿔 치운다.
 */
export function resolveCarouselClose(openedByPush: boolean): CarouselCloseAction {
  return openedByPush ? 'back' : 'replace'
}
