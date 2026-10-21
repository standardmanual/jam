import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SearchParamsPromise } from '@/lib/searchParams'
import { hasTribe, TRIBE_SELECT_PATH } from '@/lib/tribe/gate-contract'

/**
 * `/profile`은 실제 화면이 아니라 `/{username}`으로 넘기는 경유지다.
 * 최초 Strava 연동 콜백이 붙이는 `?reveal=1`(획득 배지 연출 플래그, 20260824_003)과
 * `?strava=connected|error&reason=...`(연동 결과 피드백, 20260824_008)은 이 리다이렉트에서
 * 사라지므로 목적지 URL에 다시 실어준다.
 *
 * 여기서 읽는 키(`reveal`·`strava`·`reason`)는 고정돼 있지만, 아래서 각 값을
 * `typeof === 'string'`으로 직접 걸러 배열 케이스를 흡수하므로 `Record` 형태를 써도 안전하다
 * (티켓 20260906_1350).
 *
 * 트라이브를 고르지 않은 유저는 아이디가 있어도 `/onboarding`(트라이브 고르기)으로 보낸다(티켓 20261021_1247). `(main)` 레이아웃의
 * 트라이브 게이트와 같은 기준(`hasTribe`)이라, 두 곳이 서로 다른 곳으로 보내는 일이 없다.
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: SearchParamsPromise
}) {
  const { reveal, strava, reason } = await searchParams

  const forwardedParams = new URLSearchParams()
  if (reveal === '1') forwardedParams.set('reveal', '1')
  if (typeof strava === 'string') forwardedParams.set('strava', strava)
  if (typeof reason === 'string') forwardedParams.set('reason', reason)
  const forwardQuery = forwardedParams.toString() ? `?${forwardedParams.toString()}` : ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data } = await service
    .from('users')
    .select('username, tribe_id')
    .eq('id', user.id)
    .maybeSingle()

  const row = data as { username: string | null; tribe_id: string | null } | null
  if (!hasTribe(row?.tribe_id)) redirect(TRIBE_SELECT_PATH)
  if (row?.username) redirect(`/${row.username}${forwardQuery}`)
  redirect(TRIBE_SELECT_PATH)
}
