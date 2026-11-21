/**
 * 색 덮어쓰기 표(`feed_color_overrides`, 마이그레이션 352) 읽기 (티켓 20261121_2145).
 *
 * 호출하는 쪽이 서비스 클라이언트를 넘긴다. 이 파일은 Supabase·`next/*`를 값으로 가져오지 않아(`import type`만) 번들 경계가 있는
 * 파일(`lib/admin/feedCardServer.ts` → 운영 묶음 핸들러)도 가져올 수 있다. 캐시를 얹은 서버 전용 읽기는 `feedColorOverridesServer.ts`다.
 *
 * 읽기가 실패해도 던지지 않는다 — 표가 없거나 읽지 못하면 빈 덮어쓰기(기본값)로 돌려주고 서버 로그에 남긴다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { buildFeedPalette, normalizeOverrides, type FeedColorOverrides } from './feedColorOverrides'
import type { FeedPalette } from './feedAssign'

type ServiceClient = ReturnType<typeof createServiceClient>

/** 표의 모든 행을 읽어 정리한다(모르는 키·잘못된 hex는 버린다). 실패하면 `{}`이고 `logLabel`로 로그를 남긴다. */
export async function fetchFeedColorOverrides(
  client: ServiceClient,
  logLabel = '[홈피드 색 덮어쓰기 조회 오류]',
): Promise<FeedColorOverrides> {
  try {
    const { data, error } = await client.from('feed_color_overrides').select('color_key, hex')
    if (error) {
      console.error(logLabel, error)
      return {}
    }
    return normalizeOverrides(data ?? [])
  } catch (err) {
    console.error(logLabel, err)
    return {}
  }
}

/** 덮어쓴 값을 합친 팔레트를 읽는다. 실패하면 기본 팔레트다. */
export async function fetchFeedPalette(client: ServiceClient, logLabel?: string): Promise<FeedPalette> {
  return buildFeedPalette(await fetchFeedColorOverrides(client, logLabel))
}
