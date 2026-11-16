import sharp from 'sharp'

/**
 * 에셋 제너레이터 적용 이미지 WebP 표시 규격 변환 (티켓 20260924_2200, 규격 통일 20260926_2312)
 *
 * 규격 근거(PRD asset-generator/PRD.md §9) — 배지·미션·컬렉션·홈피드 구분 없이 긴 변 1024px로
 * 통일한다. 사용자 원칙(2026-11-16: «긴 변 1024 또는 1024×1024»)이다. 이전에는 미션 상세의 최대
 * 표시 크기 640px의 2배인 1280px였고, 그 전에 올린 이미지는 1280px 이하 그대로다. 작은 칸(배지
 * 그리드 등)은 Next 이미지 최적화가 화면 크기에 맞게 줄여 내려준다.
 *
 * 원본(에셋 제너레이터 스테이지, 긴 변 1024px 고정 — `assetGeneratorHelpers.ts`의
 * `STAGE_MAX_LONG_SIDE_PX`)을 긴 변 기준으로 축소한다. `fit: 'inside'`가 비율을 유지한 채
 * 가로·세로 모두 이 값 이하로 맞춘다 — 정사각(1:1)·4:5·9:16·16:9 스테이지 비율 모두 같은 함수로
 * 처리된다. `withoutEnlargement`로 원본이 이미 기준보다 작아도 확대하지 않는다.
 */
export const BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX = 1024

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
