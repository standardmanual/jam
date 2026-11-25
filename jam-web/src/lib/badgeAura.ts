/**
 * 배지 상세 티켓(`BadgeTicket`)이 쓰는 입자(그레인) 질감 상수.
 * Aura 그라데이션은 티켓 20261125_1649에서 걷었고, 입자만 남았다.
 */

/** 입자 하나의 타일 크기(px)와 곱하기로 얹는 세기 */
export const AURA_GRAIN_SIZE_PX = 180
export const AURA_GRAIN_OPACITY = 0.22
const GRAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${AURA_GRAIN_SIZE_PX}" height="${AURA_GRAIN_SIZE_PX}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`
/** 입자 노이즈의 `background-image` 값. 코드로 만든 SVG라 이미지 파일·네트워크 요청이 없다 */
export const AURA_GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`
