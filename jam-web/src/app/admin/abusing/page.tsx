import { getAdminUser } from '@/lib/admin/auth'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { getAbusingPolicy, findPolicyRateMismatches } from '@/lib/abusing/policy'
import AbusingClient from './AbusingClient'
import type { BanRow } from './BanTable'

export const dynamic = 'force-dynamic'

export default async function AbusingPage() {
  const admin = await getAdminUser()
  if (!admin) redirect('/admin/login')

  const supabase = createServiceClient()

    const [policy, { data: bans }, { data: poiBlocks }] = await Promise.all([
    getAbusingPolicy(),
    supabase
      .from('user_shadow_bans')
      .select('*, user:user_id(id, email, username)')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('poi_blocks')
      .select('*, user:user_id(id, email, username), poi:poi_id(id, name)')
      .gt('blocked_until', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  // user_shadow_bans.ban_level은 TEXT + CHECK('soft','hard') 제약이라(migrations/010) 값 집합이
  // DB에서 보장되지만, 생성 타입은 TEXT를 그대로 string으로 옮긴다. 나머지 컬럼은 계속 구조
  // 검사를 받도록 이 한 필드만 좁혀서 넘긴다(전체 `as BanRow[]` 캐스팅이면 컬럼명 오타도 통과).
  const banRows: BanRow[] = (bans ?? []).map((b) => ({
    ...b,
    ban_level: b.ban_level as BanRow['ban_level'],
  }))

  return (
    <AbusingClient
      policy={policy}
      policyMismatch={findPolicyRateMismatches(policy)}
      bans={banRows}
      poiBlocks={poiBlocks ?? []}
    />
  )
}
