import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BadgeRow, UserActivityBadgeRow, ItemBookRow } from '@/types/database'
import BadgesClient from './BadgesClient'

export default async function BadgesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: earnedBadges }, { data: itemBooks }] = await Promise.all([
    supabase
      .from('user_activity_badges')
      .select('*, badge:badges(*)')
      .eq('user_id', user.id)
      .order('earned_at', { ascending: false }),
    supabase.from('item_books').select('*'),
  ])

  const badges: Array<{ badge: BadgeRow; earned: UserActivityBadgeRow }> = (
    (earnedBadges ?? []) as Array<{ badge: BadgeRow } & UserActivityBadgeRow>
  ).map((r) => ({ badge: r.badge, earned: r }))

  return <BadgesClient badges={badges} itemBooks={(itemBooks ?? []) as ItemBookRow[]} />
}
