import { isDirectStaticBadgeSrc, isOptimizableImageSrc, optimizedImageUrl } from '@/lib/imageSrc'

/**
 * 배지 그림을 올린 직후 미리 만들어 둘 변환 폭 (티켓 20261115_1620).
 * 화면이 쓰는 폭과 같다 — 카드·작은 칸 96(1배)·256(2배), 시트 대표 그림 384(176px의 2배),
 * 배지 상세 대표 그림 640(200px의 2배). 시험이 `nextImageWidthFor` 값이 이 목록에 있는지 확인한다.
 */
export const WARM_IMAGE_WIDTHS = [96, 256, 384, 640] as const

/** 요청 한 번의 시간 제한(밀리초) */
const WARM_REQUEST_TIMEOUT_MS = 8000

export interface WarmImageVariantResult {
  width: number
  /** HTTP 상태. 요청이 실패(시간 초과·연결 오류)하면 null */
  status: number | null
  /** `x-vercel-cache` 응답 헤더 값(MISS·HIT·STALE 등). 없으면 null */
  cache: string | null
}

/**
 * 그림 한 장의 변환본을 폭별로 한 번씩 요청해 변환 캐시에 넣어 둔다(예열). 서버 전용.
 * 변환 대상이 아닌 주소(정적 파일 배지·최적화할 수 없는 주소·빈 값)는 요청하지 않고 빈 배열을 돌려준다.
 * 어떤 실패도 던지지 않는다 — 업로드 결과에 영향을 주면 안 된다.
 * `Accept: image/webp`로 요청해, 크롬과 사파리가 함께 쓰는 보관분을 만든다.
 */
export async function warmImageVariants(
  imageUrl: string | null | undefined,
  origin: string
): Promise<WarmImageVariantResult[]> {
  const value = imageUrl?.trim()
  if (!value || isDirectStaticBadgeSrc(value) || !isOptimizableImageSrc(value)) return []

  return Promise.all(
    WARM_IMAGE_WIDTHS.map(async (width): Promise<WarmImageVariantResult> => {
      try {
        const path = optimizedImageUrl(value, width)
        if (!path) return { width, status: null, cache: null }
        const res = await fetch(new URL(path, origin).toString(), {
          headers: { Accept: 'image/webp' },
          signal: AbortSignal.timeout(WARM_REQUEST_TIMEOUT_MS),
        })
        // 본문을 끝까지 읽어 변환 결과가 캐시에 들어가게 하고 연결을 닫는다
        await res.arrayBuffer().catch(() => undefined)
        return { width, status: res.status, cache: res.headers.get('x-vercel-cache') }
      } catch {
        return { width, status: null, cache: null }
      }
    })
  )
}
