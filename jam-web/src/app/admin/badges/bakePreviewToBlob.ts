/**
 * 배경 제너레이터 라이브 미리보기 DOM 노드를 static PNG Blob으로 굽는(bake) 유틸 (20260819_008).
 *
 * `BackgroundGeneratorPreview`가 실제로 화면에 렌더링한 결과(패턴/애니메이션 결과 위에 Paper
 * 필터가 적용된 최종 합성 노드 — `<img>` 또는 Paper 셰이더 `<canvas>`)를 "지금 보이는 그대로"
 * 캡처한다. 별도 오프스크린 재렌더링 파이프라인을 새로 만들지 않는다.
 *
 * - 필터가 적용된 상태(Paper 셰이더)면 컨테이너 안의 `<canvas>`를 그대로 `toBlob()`한다.
 *   (Paper 셰이더 컴포넌트에는 `webGlContextAttributes={{ preserveDrawingBuffer: true }}`가
 *   적용돼 있어 컴포지팅 이후에도 드로잉 버퍼가 비워지지 않는다 — `FilterPreview.tsx` 참고.)
 * - 필터 없음(`<img>`, 패턴/애니메이션의 평면화 결과 data URL)이면 지정한 크기의 2D 캔버스에
 *   그려서 `toBlob()`한다.
 */
export async function bakePreviewToBlob(container: HTMLElement, size: number): Promise<Blob> {
  const canvas = container.querySelector('canvas')
  if (canvas) {
    return canvasToBlob(canvas)
  }

  const img = container.querySelector('img')
  if (img) {
    if (!img.complete || img.naturalWidth === 0) {
      await new Promise<void>((resolve, reject) => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => reject(new Error('배경 이미지를 불러오지 못했습니다.')), { once: true })
      })
    }
    const bakeCanvas = document.createElement('canvas')
    bakeCanvas.width = size
    bakeCanvas.height = size
    const ctx = bakeCanvas.getContext('2d')
    if (!ctx) throw new Error('배경 이미지를 구울 캔버스를 만들지 못했습니다.')
    ctx.drawImage(img, 0, 0, size, size)
    return canvasToBlob(bakeCanvas)
  }

  throw new Error('구울 배경 미리보기를 찾지 못했습니다.')
}

/**
 * canvas → PNG Blob 변환 헬퍼.
 * 20260821_004에서 배지 공유 이미지(`buildBadgeShareBlob.ts`)가 재사용하기 위해 export한다 —
 * 이쪽은 Paper 셰이더/img 노드를 그대로 캡처하는 반면, 배지 공유는 Canvas 2D API로 직접 합성한
 * canvas를 넘긴다는 차이만 있고 최종 PNG 변환 로직은 동일하다.
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('미리보기를 이미지 파일로 변환하지 못했습니다.'))
    }, 'image/png')
  })
}
