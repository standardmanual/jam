import { createClient } from '@/lib/supabase/server'
import BadgeRevealSpikeClient, { type SpikeBadge } from './BadgeRevealSpikeClient'

/**
 * 배지 획득 3D 캐러셀 검증용 스파이크 페이지 (20260823_007).
 *
 * - 정식 기능이 아니다. 링크를 걸지 않아 노출되지 않고, `/spike`는 프록시 공개 경로다.
 * - 🔴 **배지를 발급하지 않는다.** 스테이징이 프로덕션과 같은 Supabase를 쓰기 때문에
 *   드랍/배지 엔진을 호출하면 실제 DB가 오염된다(`user_activity_badges`의
 *   UNIQUE(user_id, badge_id) 때문에 한 번 발급하면 같은 계정으로 재테스트 불가).
 *   이 페이지는 `badges` 테이블 **조회 전용**이며 어떤 테이블에도 쓰지 않는다.
 * - RLS를 그대로 통과하는 세션 클라이언트로만 조회한다(service_role 사용 안 함).
 *   세션이 없으면 조회 결과가 비므로 화면에서 예시 데이터로 대체한다.
 */
export const dynamic = 'force-dynamic'

type BadgeRow = {
  id: string
  name: string
  description: string | null
  image_url: string | null
  rarity: SpikeBadge['rarity']
  type: string
}

export default async function BadgeRevealSpikePage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('badges')
    .select('id, name, description, image_url, rarity, type')
    .is('deleted_at', null)
    .limit(30)

  const badges: SpikeBadge[] = ((data ?? []) as BadgeRow[]).map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description ?? '',
    imageUrl: b.image_url ?? '',
    rarity: b.rarity,
  }))

  return <BadgeRevealSpikeClient badges={badges} />
}
