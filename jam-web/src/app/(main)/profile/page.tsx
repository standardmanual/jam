import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { UserRow, StravaConnectionRow, ActivityFeedRow } from '@/types/database'
import ProfileClient from './ProfileClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  const [profileResult, stravaResult, feedResult] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('strava_connections').select('*').eq('user_id', user.id).maybeSingle(),
    service
      .from('user_activity_feed')
      .select('*')
      .eq('user_id', user.id)
      .order('event_at', { ascending: false })
      .limit(50),
  ])

  return (
    <ProfileClient
      profile={profileResult.data as UserRow | null}
      strava={stravaResult.data as StravaConnectionRow | null}
      feedItems={(feedResult.data ?? []) as ActivityFeedRow[]}
    />
  )
}
