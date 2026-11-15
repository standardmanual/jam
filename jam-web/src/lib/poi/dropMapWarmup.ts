// 드랍 지도에서 지점 목록이 도착하면, 곧 열릴 가능성이 큰 가까운 지점의 배지 그림을 미리 받는다 (티켓 20261115_1455).
// 규칙은 docs/service/prd/asset-generator/PRD.md §9.1.

import { BADGE_CARD_DISPLAY_WIDTH, nextImageWidthFor, optimizedImageUrl } from '@/lib/imageSrc'
import { warmImageSrcs } from '@/lib/warmImages'
import type { NearbyPoi } from '@/types/drops'

/** 한 번에 고르는 지점 수 */
export const WARMUP_POI_PER_RUN = 3
/** 지도 화면이 떠 있는 동안 미리 부르는 지점의 합계 상한 */
export const WARMUP_POI_TOTAL_LIMIT = 9

type NetworkInformationLike = { saveData?: boolean }

/**
 * 미리 받을 지점을 고른다: 드랍 거리 안(`in_drop_range`)이고 드랍이 1개 이상인 지점 중 가까운 순 최대 3곳.
 * 이미 부른 지점은 제외하고, 이미 부른 수와 합쳐 9곳을 넘기지 않는다.
 */
export function pickWarmupPois(pois: NearbyPoi[], warmed: ReadonlySet<string>): NearbyPoi[] {
  const room = Math.min(WARMUP_POI_PER_RUN, WARMUP_POI_TOTAL_LIMIT - warmed.size)
  if (room <= 0) return []
  return pois
    .filter((p) => p.in_drop_range && p.available_drops_count >= 1 && !warmed.has(p.id))
    .sort((a, b) => a.distance_meters - b.distance_meters)
    .slice(0, room)
}

/**
 * 고른 지점의 드랍 응답에서 그림 주소만 얻어 카드와 같은 주소로 받는다. 응답은 어디에도 저장하지 않는다 —
 * 그사이 다른 사람이 주워 갔을 수 있어 목록은 카드가 열릴 때의 조회를 쓴다.
 * `warmed`에 지점 id를 넣어 같은 지점을 다시 부르지 않는다. 실패해도 던지지 않는다.
 */
export async function warmDropMapImages(pois: NearbyPoi[], warmed: Set<string>): Promise<void> {
  try {
    const conn = (navigator as Navigator & { connection?: NetworkInformationLike }).connection
    if (conn?.saveData) return
    const picked = pickWarmupPois(pois, warmed)
    if (picked.length === 0) return
    picked.forEach((p) => warmed.add(p.id))

    const width = nextImageWidthFor(BADGE_CARD_DISPLAY_WIDTH, window.devicePixelRatio || 1)
    const lists = await Promise.all(
      picked.map(async (p) => {
        try {
          const res = await fetch(`/api/drops/poi/${p.id}`)
          if (!res.ok) return []
          const json = (await res.json()) as { drops?: { badge_image_url?: unknown }[] }
          return (json.drops ?? []).map((drop) => drop.badge_image_url)
        } catch {
          return []
        }
      }),
    )
    const srcs = Array.from(
      new Set(
        lists
          .flat()
          .filter((u): u is string => typeof u === 'string')
          .map((u) => optimizedImageUrl(u, width))
          .filter((s): s is string => !!s),
      ),
    )
    await warmImageSrcs(srcs)
  } catch {
    // 미리 받기는 덤이다 — 실패해도 화면에 아무 영향이 없어야 한다
  }
}
