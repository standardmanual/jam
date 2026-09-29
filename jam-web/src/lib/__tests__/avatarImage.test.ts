/**
 * 아바타 이미지 정제 — EXIF(GPS) 제거·방향 적용·형식 유지 (티켓 20260929_1317)
 * 실행: `npx vitest run src/lib/__tests__/avatarImage.test.ts`
 */
import sharp from 'sharp'
import { sanitizeAvatarImage } from '../avatarImage'

const BG = { r: 200, g: 50, b: 50 }

/** GPS(IFD3)·Make(IFD0)·Orientation=6이 든 40x20 JPEG */
async function makeJpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: BG } })
    .withExif({
      IFD0: { Make: 'TestPhone' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '37/1 33/1 59/1' },
    })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer()
}

describe('sanitizeAvatarImage', () => {
  it('입력 픽스처에는 EXIF와 방향이 실제로 들어 있다(테스트 전제)', async () => {
    const meta = await sharp(await makeJpegWithGps()).metadata()
    expect(meta.exif).toBeDefined()
    expect(meta.orientation).toBe(6)
  })

  it('JPEG의 EXIF·XMP·IPTC와 방향 태그를 제거한다', async () => {
    const { buffer, format } = await sanitizeAvatarImage(await makeJpegWithGps())
    const meta = await sharp(buffer).metadata()

    expect(format).toBe('jpeg')
    expect(meta.format).toBe('jpeg')
    expect(meta.exif).toBeUndefined()
    expect(meta.xmp).toBeUndefined()
    expect(meta.iptc).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
  })

  it('방향을 픽셀에 적용해 가로·세로가 뒤바뀐다(40x20 → 20x40)', async () => {
    const { buffer } = await sanitizeAvatarImage(await makeJpegWithGps())
    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(20)
    expect(meta.height).toBe(40)
  })

  it.each(['png', 'webp'] as const)('%s 입력은 같은 형식으로 유지한다', async (fmt) => {
    const input = await sharp({ create: { width: 30, height: 30, channels: 3, background: BG } })
      [fmt]()
      .toBuffer()
    const { buffer, format } = await sanitizeAvatarImage(input)
    expect(format).toBe(fmt)
    expect((await sharp(buffer).metadata()).format).toBe(fmt)
  })

  it('허용 외 형식(GIF)은 reject한다', async () => {
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: BG } })
      .gif()
      .toBuffer()
    await expect(sanitizeAvatarImage(gif)).rejects.toThrow()
  })

  it('이미지가 아닌 바이트는 reject한다', async () => {
    await expect(sanitizeAvatarImage(Buffer.from('not an image at all'))).rejects.toThrow()
  })
})
