// 주소 목록을 낮은 우선순위로 브라우저 캐시에 받는다. 배지함·인벤토리 미리 받기(BadgeImageWarmup)와
// 드랍 지도 미리 받기가 함께 쓴다(티켓 20261115_1455). 실패는 조용히 넘긴다 — 미리 받기는 덤이다.

const BATCH_SIZE = 6

function loadOne(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.fetchPriority = 'low'
    img.decoding = 'async'
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = src
  })
}

/** 주소를 6장씩 차례로 받는다. 한 묶음이 끝나야 다음 묶음을 시작한다. */
export async function warmImageSrcs(srcs: string[]): Promise<void> {
  for (let i = 0; i < srcs.length; i += BATCH_SIZE) {
    await Promise.all(srcs.slice(i, i + BATCH_SIZE).map(loadOne))
  }
}
