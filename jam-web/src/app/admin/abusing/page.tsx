import { getAdminUser } from '@/lib/admin/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import AbusingClient from './AbusingClient'

export const dynamic = 'force-dynamic'

export default async function AbusingPage() {
  const admin = await getAdminUser()
  if (!admin) redirect('/admin/login')

  const supabase = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [policy, { data: bans }, { data: poiBlocks }] = await Promise.all([
    getAbusingPolicy(),
    (supabase as any)
      .from('user_shadow_bans')
      .select('*, user:user_id(id, email, display_name)')
      .order('created_at', { ascending: false })
      .limit(200),
    (supabase as any)
      .from('poi_blocks')
      .select('*, user:user_id(id, email, display_name), poi:poi_id(id, name)')
      .gt('blocked_until', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  return (
    <AbusingClient
      policy={policy}
      bans={bans ?? []}
      poiBlocks={poiBlocks ?? []}
    />
  )
}
