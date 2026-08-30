/**
 * 체크인 배지 이미지 생성 — 어드민에 노출할 디자인 목록 (티켓 20260830_1252, 단건 선택 방식으로
 * 재설계: 20260830_1349).
 *
 * `scripts/badge-image-gen/configs/*.config.js`에 이미 정의된 디자인 중, 현재 서비스에서
 * 실제로 쓰는(최신) 디자인만 화이트리스트로 노출한다. `subway-poi-badge`·`mountain-poi-badge`
 * (v1)는 각각 metro-poi-badge·mountain-poi-badge-v2로 대체된 구디자인이라 어드민에는 노출하지
 * 않는다 — CLI로 필요 시 직접 실행할 수 있으므로 코드에서 지우지는 않는다.
 *
 * `configId`는 API 라우트가 `require('.../configs/${configId}.config.js')`에 그대로 쓰는
 * 값이다. **반드시 이 화이트리스트에 있는 값만 통과시켜야 한다** — 클라이언트가 임의
 * 문자열을 보내 경로 바깥 파일을 require하지 못하도록 API 라우트에서도 이 배열로 재검증한다.
 *
 * `poiCategories`는 이 디자인이 원래 배치 대상으로 삼던 `poi.category` 값 목록이다.
 * 단건 검색 화면의 "카테고리 필터" 옵션이 이 배열을 그대로 노출한다 — 새 디자인을 추가할 때
 * 이 목록에 config만 추가하면 검색 카테고리 옵션에도 자동으로 반영된다(20260830_1349).
 */
export interface BadgeImageDesign {
  configId: string
  label: string
  description: string
  poiCategories: string[]
}

export const BADGE_IMAGE_DESIGNS: BadgeImageDesign[] = [
  {
    configId: 'metro-poi-badge',
    label: 'METRO — 지하철역·대중교통',
    description: "poi.category IN ('train_subway','transit')에 연결된 체크인 배지",
    poiCategories: ['train_subway', 'transit'],
  },
  {
    configId: 'mountain-poi-badge-v2',
    label: 'MOUNTAIN — 산',
    description: "poi.category='mountain'에 연결된 체크인 배지",
    poiCategories: ['mountain'],
  },
]

export function isKnownBadgeImageDesign(configId: string): boolean {
  return BADGE_IMAGE_DESIGNS.some((d) => d.configId === configId)
}

export function findBadgeImageDesign(configId: string): BadgeImageDesign | undefined {
  return BADGE_IMAGE_DESIGNS.find((d) => d.configId === configId)
}
