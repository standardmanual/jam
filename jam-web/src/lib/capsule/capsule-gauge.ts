/**
 * 캡슐 게이지 수치 변환 — 순수 로직 (티켓 20261028_1739 2회, 프로토타입 `capsuleFillMath`에서 옮김)
 *
 * 캡슐 잼 비율과 그래프 눈금(채움 모양의 눈금)을 오가는 변환, 진입·이동 모션 시간을 맡는다.
 * 화면·타이머를 모르는 순수 모듈이라 서버·클라이언트 어느 쪽에서도 쓴다. 아무것도 가져오지 않는다.
 * 수치(숫자·퍼센트)는 화면에 그리지 않는다. 이 값들은 게이지 모양을 정하는 표현 값이다.
 */

/** 그래프에서 «비어 있음»을 나타내는 최소 눈금(%). 캡슐 잼 0%가 이 눈금에 대응한다 */
export const GRAPH_MIN_PERCENT = 2

/** 그래프 최대 눈금(%). 캡슐 잼 100%가 대응한다 */
export const GRAPH_MAX_PERCENT = 100

/** 진입 모션: 트랙이 이만큼(0~1) 이상 보이면 «화면에 보인다»로 친다 (티켓 20261031_1806, IntersectionObserver threshold) */
export const GAUGE_ENTRY_VISIBLE_RATIO = 0.5

/**
 * 진입 모션: 하단 플로팅 탭바가 가리는 높이(px). 관찰 영역의 아래쪽을 이만큼 줄여 «탭바 위쪽에서 절반 이상 보일 때»를 보임으로 친다.
 * `TabBar.tsx`의 알약은 높이 49, 아래 여백 `max(10, safe-area + 16 - 32)`이라 윗면이 화면 아래에서 59~67px 위다. 여유를 두어 72로 잡는다.
 */
export const GAUGE_ENTRY_TABBAR_CLEARANCE_PX = 72

/** 진입 모션: 화면에 들어온 뒤 채움이 시작되기까지의 쉼(ms) */
export const GAUGE_ENTRY_DELAY_MS = 260

/** 진입 모션: 시작 눈금에서 끝 눈금까지 차오르는 시간(ms) */
export const GAUGE_ENTRY_MS = 1500

/** 같은 화면에서 값이 바뀔 때 이동 시간의 하한(ms) */
export const GAUGE_MOVE_MIN_MS = 700

/** 같은 화면에서 값이 바뀔 때 이동 시간의 상한(ms) */
export const GAUGE_MOVE_MAX_MS = 1500

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** 캡슐 잼 비율(0~100%) → 그래프 눈금(2~100%). 잼 0%는 2%, 잼 100%는 100%다 */
export function jamPercentToGraphPercent(jamPercent: number): number {
  const p = clamp(jamPercent, 0, 100)
  return GRAPH_MIN_PERCENT + ((GRAPH_MAX_PERCENT - GRAPH_MIN_PERCENT) * p) / 100
}

/** 그래프 눈금(2~100%) → 채움 정도(0~1). 2%가 0, 100%가 1이다. 2% 아래는 0으로 본다 */
export function graphPercentToFillRatio(graphPercent: number): number {
  const g = clamp(graphPercent, GRAPH_MIN_PERCENT, GRAPH_MAX_PERCENT)
  return (g - GRAPH_MIN_PERCENT) / (GRAPH_MAX_PERCENT - GRAPH_MIN_PERCENT)
}

/** 채운 양과 필요량 → 그래프 눈금. 필요량이 0 이하이거나 숫자가 아니면 비어 있는 눈금이다 */
export function capsuleGraphPercent(filled: number, required: number): number {
  if (!(required > 0)) return GRAPH_MIN_PERCENT
  return jamPercentToGraphPercent((clamp(filled, 0, required) / required) * 100)
}

/**
 * 같은 화면에서 값이 바뀔 때의 이동 시간(ms). 옮길 거리에 비례해 늘리되 700~1500ms 안에 둔다.
 * 거리는 그래프 눈금의 차이(0~98)를 채움 정도로 환산해 잰다.
 */
export function gaugeMoveDurationMs(fromGraphPercent: number, toGraphPercent: number): number {
  const distance = Math.abs(graphPercentToFillRatio(toGraphPercent) - graphPercentToFillRatio(fromGraphPercent))
  return Math.round(clamp(GAUGE_MOVE_MIN_MS + distance * (GAUGE_MOVE_MAX_MS - GAUGE_MOVE_MIN_MS), GAUGE_MOVE_MIN_MS, GAUGE_MOVE_MAX_MS))
}
