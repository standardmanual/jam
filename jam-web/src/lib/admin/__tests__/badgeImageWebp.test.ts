/**
 * 배지 대표 이미지 WebP 표시 규격 변환 — 티켓 20260924_2200
 * 실행: `npx vitest run src/lib/admin/__tests__/badgeImageWebp.test.ts`
 */
import sharp from 'sharp'
import { convertBadgeImageToWebp, BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX } from '../badgeImageWebp'

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 200, g: 50, b: 50, alpha: 1 } } })
    .png()
    .toBuffer()
}

describe('convertBadgeImageToWebp', () => {
  it.each([
    ['1:1', 2560, 2560],
    ['4:5', 2048, 2560],
    ['9:16', 1440, 2560],
  ] as const)('%s 비율 원본(긴 변 2560)을 긴 변 규격 상수 WebP로 축소한다(비율 유지)', async (_label, width, height) => {
    const png = await makePng(width, height)
    const webp = await convertBadgeImageToWebp(png)
    const meta = await sharp(webp).metadata()

    expect(meta.format).toBe('webp')
    expect(BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX).toBe(1280)
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX)

    // 비율 유지 확인 — sharp의 정수 반올림 오차 1px까지 허용한다
    const expectedShortSide = Math.round((Math.min(width, height) / Math.max(width, height)) * BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX)
    const actualShortSide = Math.min(meta.width ?? 0, meta.height ?? 0)
    expect(Math.abs(actualShortSide - expectedShortSide)).toBeLessThanOrEqual(1)
  })

  it('스테이지 원본(긴 변 1280)은 크기를 그대로 유지한다', async () => {
    const png = await makePng(1024, 1280)
    const webp = await convertBadgeImageToWebp(png)
    const meta = await sharp(webp).metadata()
    expect(meta.width).toBe(1024)
    expect(meta.height).toBe(1280)
  })

  it('원본이 규격(1280px)보다 작으면 확대하지 않는다', async () => {
    const png = await makePng(200, 200)
    const webp = await convertBadgeImageToWebp(png)
    const meta = await sharp(webp).metadata()
    expect(meta.width).toBe(200)
    expect(meta.height).toBe(200)
  })
})
