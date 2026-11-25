/**
 * 배지 상세 티켓(`BadgeTicket`)이 쓰는 입자(그레인) 질감 상수.
 * 티켓 20261125_1650에서 옛 `badgeAura.ts`에서 이름과 상수를 그레인 용도에 맞게 정리했다.
 */

/** 입자 하나의 타일 크기(px)와 곱하기로 얹는 세기 */
export const GRAIN_SIZE_PX = 180
export const GRAIN_OPACITY = 0.22
const GRAIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${GRAIN_SIZE_PX}" height="${GRAIN_SIZE_PX}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`
/** 입자 노이즈의 `background-image` 값. 코드로 만든 SVG라 이미지 파일·네트워크 요청이 없다 */
export const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`
