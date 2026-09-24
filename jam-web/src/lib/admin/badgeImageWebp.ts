import sharp from 'sharp'

/**
 * 배지 대표 이미지 WebP 표시 규격 변환 (티켓 20260924_2200)
 *
 * 규격 근거(PRD asset-generator/PRD.md §9) — 서비스에서 `badges.image_url`을 그리는
 * 컴포넌트를 코드로 실측한 표시 크기(가장 큰 값 × 2 = 표시 규격):
 *   `BadgeGridCard`·`BadgeTrophyGridCard` 90px, `combine/RecipeRewardRow.tsx` 40px,
 *   `missions/[id]/MissionDetailClient.tsx` 52px, `combine/CombineClient.tsx` 64px,
 *   `PoiCarouselModal.tsx` 80px, `(main)/FeedSection.tsx` 40px·112px,
 *   `(main)/drops/BadgeDetailSheet.tsx` 176px, `(main)/badges/[id]/BadgeHeroSection.tsx`
 *   200px(최댓값) → 표시 규격 200 × 2 = 400px.
 *
 * 원본(에셋 제너레이터 스테이지, 긴 변 1280px 고정 — `assetGeneratorHelpers.ts`의
 * `STAGE_MAX_LONG_SIDE_PX`)을 긴 변 기준으로 축소한다. `fit: 'inside'`가 비율을 유지한 채
 * 가로·세로 모두 이 값 이하로 맞춘다 — 정사각(1:1)·4:5·9:16 스테이지 비율 모두 같은 함수로
 * 처리된다. `withoutEnlargement`로 원본이 이미 기준보다 작아도 확대하지 않는다.
 */
export const BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX = 400

export async function convertBadgeImageToWebp(png: Buffer): Promise<Buffer> {
  return sharp(png)
    .resize({
      width: BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX,
      height: BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer()
}
