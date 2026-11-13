import sharp from 'sharp'
import { candidateTouchesEdge, normalizeBadgeImage } from '../normalize'

async function barImage(): Promise<Buffer> {
  // 투명 600x400 캔버스 안에 (100,150) 위치의 300x100 불투명 빨강 막대
  return sharp({ create: { width: 600, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      {
        input: { create: { width: 300, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } },
        left: 100,
        top: 150,
      },
    ])
    .png()
    .toBuffer()
}

describe('normalizeBadgeImage', () => {
  it('300x100 막대를 긴 변 870px로 맞춰 1024 캔버스 정중앙에 둔다', async () => {
    const out = await normalizeBadgeImage(await barImage())
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(info.width).toBe(1024)
    expect(info.height).toBe(1024)
    expect(info.channels).toBe(4)

    let minX = 1024
    let maxX = -1
    let minY = 1024
    let maxY = -1
    for (let y = 0; y < 1024; y++) {
      for (let x = 0; x < 1024; x++) {
        if (data[(y * 1024 + x) * 4 + 3] > 16) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        }
      }
    }
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    expect(Math.abs(w - 870)).toBeLessThanOrEqual(2)
    expect(Math.abs(h - 290)).toBeLessThanOrEqual(2)
    expect(Math.abs((minX + maxX + 1) / 2 - 512)).toBeLessThanOrEqual(2)
    expect(Math.abs((minY + maxY + 1) / 2 - 512)).toBeLessThanOrEqual(2)
  })

  it('보이는 영역이 없으면 오류를 낸다', async () => {
    const empty = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()
    await expect(normalizeBadgeImage(empty)).rejects.toThrow()
  })
})

describe('candidateTouchesEdge', () => {
  it('테두리가 배경색뿐이면 false, 그림이 테두리에 닿으면 true', async () => {
    const white = { r: 255, g: 255, b: 255 }
    const clean = await sharp({ create: { width: 200, height: 200, channels: 3, background: white } })
      .composite([
        { input: { create: { width: 50, height: 50, channels: 3, background: { r: 0, g: 0, b: 0 } } }, left: 75, top: 75 },
      ])
      .png()
      .toBuffer()
    expect(await candidateTouchesEdge(clean, '#ffffff')).toBe(false)

    const touching = await sharp({ create: { width: 200, height: 200, channels: 3, background: white } })
      .composite([
        { input: { create: { width: 80, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } } }, left: 60, top: 0 },
      ])
      .png()
      .toBuffer()
    expect(await candidateTouchesEdge(touching, '#ffffff')).toBe(true)
  })
})
