import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (service as any)
    .from('users')
    .select('username')
    .eq('id', user.id)
    .maybeSingle()

  const username = (data as { username: string | null } | null)?.username
  if (username) redirect(`/${username}`)
  redirect('/onboarding')
}
