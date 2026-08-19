/**
 * 업로드된 File(objectURL)을 HTMLImageElement로 로드한다 (20260819_001 스파이크, 서버 업로드 없음).
 * `crossOrigin`(20260819_008 추가) — 이미 등록된 배지 이미지(Storage 원격 URL)를 소스로 재사용할
 * 때, 이후 캔버스 합성 결과를 `toDataURL`/`toBlob`으로 읽어야 하므로 CORS 허용 로드가 필요하다.
 * 기본값은 undefined(설정 안 함)로, objectURL(동일 출처) 로드인 기존 동작에는 영향 없다.
 */
export function loadImageFromUrl(url: string, options?: { crossOrigin?: 'anonymous' }): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (options?.crossOrigin) img.crossOrigin = options.crossOrigin
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    img.src = url
  })
}
