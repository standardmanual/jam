import sharp from 'sharp'

/**
 * 이미지 버퍼의 평균 컬러를 hex(#rrggbb)로 계산한다 (배지 배경색 자동 추출 — 20260818_003).
 *
 * 1×1 픽셀로 리사이즈해 전체 평균 색상을 얻는 방식. 알파 채널이 있는 이미지는 흰 배경에
 * 합성한 뒤 계산한다. SVG 등 처리 중 오류가 나면 null을 반환하고, 호출부는 값을 비워둔 채
 * 계속 진행해야 한다(계산 실패가 업로드/저장 자체를 막지 않음).
 */
export async function computeAverageColorHex(buffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(buffer)
      .flatten({ background: '#ffffff' })
      .resize(1, 1, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    if (info.channels < 3 || data.length < 3) return null

    const toHex = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
    return `#${toHex(data[0])}${toHex(data[1])}${toHex(data[2])}`
  } catch {
    return null
  }
}
