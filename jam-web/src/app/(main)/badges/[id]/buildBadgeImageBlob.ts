/**
 * 배지 공유용 300×300 투명 PNG Blob 생성 (티켓 20260911_1102, 20261115_1249).
 *
 * 공유 시트가 보이고 복사·저장·더보기로 내보내는 이미지는 배지 원본 한 장뿐이다. 배지 이미지를
 * 오프스크린 `<canvas>`에 비율을 지켜 가운데에 그린 뒤, 어드민 `bakePreviewToBlob.ts`와 같은
 * `canvasToBlob()` 유틸로 PNG를 뽑는다. (Strava 기록이 담긴 1080×1920 공유 카드는
 * 티켓 20261115_1249에서 폐지했다.)
 */
import { loadImageFromUrl } from '@/lib/backgroundGenerator/loadImage'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'

/** 배지 이미지 공유용 정사각형 변환 크기 */
const BADGE_IMAGE_ONLY_SIZE = 300

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxX: number,
  boxY: number,
  boxSize: number
): void {
  const ratio = Math.min(boxSize / img.naturalWidth, boxSize / img.naturalHeight)
  const w = img.naturalWidth * ratio
  const h = img.naturalHeight * ratio
  const x = boxX + (boxSize - w) / 2
  const y = boxY + (boxSize - h) / 2
  ctx.drawImage(img, x, y, w, h)
}

/** 배지 원본 이미지를 300×300 정사각형 투명 PNG Blob으로 변환한다. */
export async function buildBadgeImageBlob(imageUrl: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = BADGE_IMAGE_ONLY_SIZE
  canvas.height = BADGE_IMAGE_ONLY_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('공유 이미지를 그릴 캔버스를 만들지 못했어요.')

  const badgeImg = await loadImageFromUrl(imageUrl, { crossOrigin: 'anonymous' })
  drawContain(ctx, badgeImg, 0, 0, BADGE_IMAGE_ONLY_SIZE)

  return canvasToBlob(canvas)
}
