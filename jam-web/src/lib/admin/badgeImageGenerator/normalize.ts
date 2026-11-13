import sharp from 'sharp'
import { hexToRgb } from './prompt'

export const CANVAS_PX = 1024
export const BOX_PX = 870
const ALPHA_THRESHOLD = 16
const EDGE_PX = 4
const EDGE_RGB_DISTANCE = 40
const EDGE_RATIO = 0.01

/**
 * 규격 후처리: 알파 16 초과 영역으로 자르고 → 긴 변 870px로 비율 유지 → 1024 투명 캔버스 정중앙 → PNG
 */
export async function normalizeBadgeImage(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('이미지에 보이는 영역이 없습니다.')

  const cropped = await sharp(data, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .resize({ width: BOX_PX, height: BOX_PX, fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer()
  const meta = await sharp(cropped).metadata()
  const left = Math.round((CANVAS_PX - (meta.width ?? 0)) / 2)
  const top = Math.round((CANVAS_PX - (meta.height ?? 0)) / 2)

  return sharp({
    create: { width: CANVAS_PX, height: CANVAS_PX, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: cropped, left, top }])
    .png()
    .toBuffer()
}

/**
 * 원본 후보의 바깥 4px 테두리에서 배경색과 RGB 거리 40 이상 다른 픽셀이
 * 테두리 전체 픽셀의 1% 이상이면 true(그림이 잘렸을 가능성).
 */
export async function candidateTouchesEdge(png: Buffer, bgHex: string): Promise<boolean> {
  const [br, bg, bb] = hexToRgb(bgHex)
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  let total = 0
  let diff = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= EDGE_PX && x < width - EDGE_PX && y >= EDGE_PX && y < height - EDGE_PX) continue
      total++
      const i = (y * width + x) * 3
      const d = Math.sqrt((data[i] - br) ** 2 + (data[i + 1] - bg) ** 2 + (data[i + 2] - bb) ** 2)
      if (d >= EDGE_RGB_DISTANCE) diff++
    }
  }
  return total > 0 && diff / total >= EDGE_RATIO
}
