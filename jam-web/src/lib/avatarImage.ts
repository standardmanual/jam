import sharp from 'sharp'

export type AvatarFormat = 'jpeg' | 'png' | 'webp'

const ALLOWED_FORMATS: readonly string[] = ['jpeg', 'png', 'webp']

/**
 * 아바타 업로드 이미지 정제 (티켓 20260929_1317)
 *
 * 휴대폰 사진의 EXIF에는 GPS 좌표·기기 정보가 들어 있어, 원본 그대로 공개 버킷에 올리면 공개 URL로
 * 노출된다. sharp는 `withMetadata`/`keepMetadata`를 부르지 않으면 EXIF·XMP·IPTC를 출력에 쓰지 않는다.
 * 이 기본 동작이 제거 수단이므로 메타데이터 유지 옵션을 절대 추가하지 않는다.
 * 방향(Orientation)은 지우기 전에 `rotate()`로 픽셀에 적용해 세로 사진이 눕지 않게 한다.
 *
 * 출력 형식은 클라이언트가 보낸 MIME이 아니라 sharp가 디코드한 실제 형식이다.
 * 허용 외 형식이거나 디코드에 실패하면 throw한다(라우트가 400으로 변환).
 */
export async function sanitizeAvatarImage(
  input: Buffer,
): Promise<{ buffer: Buffer; format: AvatarFormat }> {
  const { format } = await sharp(input).metadata()
  if (!format || !ALLOWED_FORMATS.includes(format)) {
    throw new Error(`허용하지 않는 이미지 형식: ${format ?? '알 수 없음'}`)
  }

  const image = sharp(input).rotate()
  const buffer =
    format === 'jpeg'
      ? await image.jpeg({ quality: 90 }).toBuffer()
      : format === 'png'
        ? await image.png().toBuffer()
        : await image.webp({ quality: 90 }).toBuffer()

  return { buffer, format: format as AvatarFormat }
}
