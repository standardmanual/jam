// GET /api/drops/poi/[poiId] — POI에 드랍된 픽업 가능 아이템 목록
//
// 20260826_002: `error` 필드는 안정적인 snake_case 코드만 담는다. DB 원문 오류(detail)는
// 응답에 싣지 않고 서버 로그로만 남긴다 — 클라이언트가 그대로 토스트에 노출하던 경로였다.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { excludedTestUserIds } from '@/lib/env/test-accounts'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ poiId: string }> }
) {
  const { poiId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // poi_drops + badges 조인 (users 조인은 FK 중복으로 별도 조회)
  const { data, error } = await service
    .from('poi_drops')
    .select(`id, badge_id, dropped_at, dropper_user_id, badges ( name, rarity, image_url )`)
    .eq('poi_id', poiId)
    .eq('is_available', true)
    .order('dropped_at', { ascending: true })

  if (error) {
    console.error('[poi drops] 조회 오류:', error.message)
    return NextResponse.json({ error: 'drops_load_failed' }, { status: 500 })
  }

  // Supabase 조인 결과의 생성 타입은 `badges`를 배열로 추론해 아래 접근과 맞지 않는다.
  // 실제 응답 모양을 한 번만 명시해 두고 이후에는 타입이 붙은 값으로 다룬다(any 제거).
  type PoiDropRow = {
    id: string
    badge_id: string
    dropped_at: string
    dropper_user_id: string | null
    badges: { name: string; rarity: string; image_url: string | null } | null
  }
  const rows = (data ?? []) as unknown as PoiDropRow[]

  // dropper username 별도 조회 (FK 중복으로 조인 불가)
  // 프로덕션에서는 스테이징 전용 테스트 계정을 조회 대상에서 빼 이름 대신 '익명'으로 표시한다.
  const excludedIds = excludedTestUserIds()
  const dropperIds = [...new Set(rows
    .map((d) => d.dropper_user_id)
    .filter((id): id is string => Boolean(id) && !excludedIds.includes(id as string)))]
  const usersData: { id: string; username: string }[] = dropperIds.length > 0
    ? ((await service.from('users').select('id, username').in('id', dropperIds)).data ?? [])
    : []
  const nameById: Record<string, string> = {}
  for (const u of usersData) nameById[u.id] = u.username

  const drops = rows.map((d) => ({
    id: d.id,
    badge_id: d.badge_id,
    badge_name: d.badges?.name,
    badge_rarity: d.badges?.rarity,
    badge_image_url: d.badges?.image_url,
    dropper_name: (d.dropper_user_id ? nameById[d.dropper_user_id] : undefined) ?? '익명',
    dropped_at: d.dropped_at,
  }))

  return NextResponse.json({ drops })
}
