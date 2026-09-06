import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { SearchParamsPromise } from '@/lib/searchParams'

/**
 * `/profile`은 실제 화면이 아니라 `/{username}`으로 넘기는 경유지다.
 * 최초 Strava 연동 콜백이 붙이는 `?reveal=1`(획득 배지 연출 플래그, 20260824_003)과
 * `?strava=connected|error&reason=...`(연동 결과 피드백, 20260824_008)은 이 리다이렉트에서
 * 사라지므로 목적지 URL에 다시 실어준다.
 *
 * 여기서 읽는 키(`reveal`·`strava`·`reason`)는 고정돼 있지만, 아래서 각 값을
 * `typeof === 'string'`으로 직접 걸러 배열 케이스를 흡수하므로 `Record` 형태를 써도 안전하다
 * (티켓 20260906_1350).
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
    .select('username')
    .eq('id', user.id)
    .maybeSingle()

  const username = (data as { username: string | null } | null)?.username
  if (username) redirect(`/${username}${forwardQuery}`)
  redirect('/onboarding')
}
