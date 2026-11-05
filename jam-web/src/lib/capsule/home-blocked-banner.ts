/**
 * 홈 상단 캡슐 막힘 배너가 쓸 값을 읽는다 — 서버 전용 (티켓 20261105_0104 T4, 채원 사전 판정 2026-11-05)
 *
 * 홈 page.tsx가 다른 조회와 함께 시작한다. 막힘 판정은 DB 함수 `capsule_receive_blocked`(`readCapsuleReceiveBlocked`)가 단일 원천이라
 * 여기서 같은 판정을 다시 구현하지 않는다. 조회가 실패하면 홈 전체를 500으로 만들지 않고 배너만 생략한다(null, 서버 로그만).
 * 동기화 입구의 막힘 검사는 서버에서 따로 이유를 알리므로, 이 «실패하면 생략»은 화면용이다(`suspension/home-banner.ts`와 같은 패턴).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { readCapsuleReceiveBlocked } from './receive-block'
import type { HomeCapsuleBlockedBannerView } from './receive-block-contract'

/** 배너 컴포넌트가 받는 원시값 */
export type HomeCapsuleBlockedBanner = HomeCapsuleBlockedBannerView

/** 막혔으면 배너 값, 아니거나 조회가 실패하면 null. 던지지 않는다. */
export async function loadHomeCapsuleBlockedBanner(supabase: SupabaseClient, userId: string): Promise<HomeCapsuleBlockedBanner | null> {
  try {
    const result = await readCapsuleReceiveBlocked(supabase, userId)
    return result.blocked ? { shortfall: Math.max(1, result.shortfall) } : null
  } catch (error) {
    console.error('[home/page] 캡슐 막힘 조회 실패 — 배너를 생략한다', error)
    return null
  }
}
