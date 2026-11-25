import 'server-only'
import path from 'node:path'
import { extractBadgeColorsFromUrl, pickBadgeColors } from './badgeColorExtract.core.mjs'

/**
 * 배지 이미지 대표색 추출 — 서버 전용 (티켓 20261119_1651, 상위 20261119_1650)
 *
 * 알고리즘은 `badgeColorExtract.core.mjs` 한 곳에 있고(일괄 계산 스크립트와 공유), 여기서는 서버 전용으로
 * 재수출한다. `badges.bg_colors`에 저장하는 값 — 원색(보정 전) 최대 3개, 밝기 높은 순 hex 배열.
 * 화면에서는 이 값을 쓰지 않는다(Aura 제거, 티켓 20261125_1649).
 */

export { pickBadgeColors }

/**
 * 이미지 주소에서 대표색을 뽑는다. `/`로 시작하는 정적 주소는 `public/`에서 읽고, 절대 주소는 fetch한다.
 * 색이 하나도 없으면 `[]`, 어떤 실패에도 예외 없이 `null`(저장 흐름을 막지 않는다).
 */
export function extractBadgeColors(imageUrl: string): Promise<string[] | null> {
  return extractBadgeColorsFromUrl(imageUrl, { publicDir: path.join(process.cwd(), 'public') })
}
