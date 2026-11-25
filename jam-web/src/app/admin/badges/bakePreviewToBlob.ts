
/**
 * canvas → PNG Blob 변환 헬퍼.
 * 20260821_004에서 배지 공유 이미지(`buildBadgeImageBlob.ts`)가 재사용하기 위해 export한다 —
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
