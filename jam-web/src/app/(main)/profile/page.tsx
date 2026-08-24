import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/**
 * `/profile`은 실제 화면이 아니라 `/{username}`으로 넘기는 경유지다.
 * 최초 Strava 연동 콜백이 붙이는 `?reveal=1`(획득 배지 연출 플래그)은 이 리다이렉트에서
 * 사라지므로 목적지 URL에 다시 실어준다 (20260824_003).
 */
export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { reveal } = await searchParams
  const revealQuery = reveal === '1' ? '?reveal=1' : ''


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
  if (username) redirect(`/${username}${revealQuery}`)
  redirect('/onboarding')
}
