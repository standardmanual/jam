/**
 * 홈 화면·어드민 레이아웃이 쓰는 색 덮어쓰기 읽기 — 서버 전용 (티켓 20261121_2145).
 *
 * `unstable_cache`로 짧게 캐시한다(태그 `feed-colors`). 어드민이 색을 적용하면 `invalidateFeedColors()`로 태그를 무효화해 바로 반영한다.
 * 읽기가 실패하면 빈 덮어쓰기(기본값)를 돌려주고 서버 로그에 남긴다 — 홈 화면은 덮어쓰기 없이도 그려진다.
 * 캐시 안에서는 쿠키를 읽지 않는 서비스 클라이언트(`createServiceClient`)를 쓴다.
 *
 * 캐시 방식: 이 프로젝트는 Cache Components(`use cache`)를 켜지 않아 `unstable_cache`가 맞다(`next.config.ts`에 `cacheComponents` 없음).
 * 무효화: `revalidateTag(태그, { expire: 0 })` — 두 번째 인자는 필수고(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md`),
 * `{ expire: 0 }`은 낡은 값을 더 보여 주지 않고 다음 요청이 바로 새로 읽는다(적용 직후 화면에 바로 반영돼야 하는 어드민 동작에 맞다).
 */
import { revalidateTag, unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import type { FeedColorOverrides } from './feedColorOverrides'
import { fetchFeedColorOverrides } from './feedColorOverridesRead'

export const FEED_COLORS_CACHE_TAG = 'feed-colors'

/** 캐시 재검증 시간(초). 무효화가 빠뜨린 경우에도 이 시간 안에 새 값이 반영된다. */
export const FEED_COLORS_REVALIDATE_SECONDS = 60

const readCached = unstable_cache(
  async (): Promise<FeedColorOverrides> => fetchFeedColorOverrides(createServiceClient(), '[홈피드 색 덮어쓰기 조회 오류]'),
  ['feed-color-overrides'],
  { tags: [FEED_COLORS_CACHE_TAG], revalidate: FEED_COLORS_REVALIDATE_SECONDS },
)

/** 캐시된 덮어쓰기. 어떤 이유로든 읽지 못하면 `{}`(기본값)이다. */
export async function getFeedColorOverrides(): Promise<FeedColorOverrides> {
  try {
    return await readCached()
  } catch (err) {
    console.error('[홈피드 색 덮어쓰기 캐시 읽기 오류]', err)
    return {}
  }
}

/** 어드민이 색을 적용·복원한 직후 부른다. 다음 요청부터 새 값을 읽는다. */
export function invalidateFeedColors(): void {
  revalidateTag(FEED_COLORS_CACHE_TAG, { expire: 0 })
}
