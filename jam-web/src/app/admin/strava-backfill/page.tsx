import { redirect } from 'next/navigation'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { loadBackfillOverview, type BackfillOverview } from '@/lib/strava/backfillStats'
import StravaBackfillClient from './StravaBackfillClient'

export const dynamic = 'force-dynamic'

/**
 * Strava 확장 필드 백필 실행 화면 (티켓 20260905_1242)
 *
 * 최초 렌더의 집계와 실행 직후 응답의 집계가 **같은 `loadBackfillOverview`** 를 쓴다.
 * 두 숫자를 그대로 비교할 수 있어야 「돌렸는데 얼마나 채워졌나」를 판단할 수 있다.
 *
 * 이 화면은 프로덕션에서만 동작한다 — staging에는 어드민 인증도 `ENCRYPTION_KEY`도 없다.
 * 결함이 아니라 «staging이 실유저 토큰을 다루지 않는다»는 설계다(티켓 20260905_1242).
 */
export default async function StravaBackfillPage() {
  const admin = await getAdminUser()
  if (!admin) redirect('/forbidden')

  let overview: BackfillOverview | null = null
  let loadError: string | null = null
  try {
    overview = await loadBackfillOverview(createServiceClient())
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  return <StravaBackfillClient overview={overview} loadError={loadError} />
}
