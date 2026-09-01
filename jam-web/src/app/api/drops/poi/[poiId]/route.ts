// GET /api/drops/poi/[poiId] — POI에 드랍된 픽업 가능 아이템 목록
//
// 20260826_002: `error` 필드는 안정적인 snake_case 코드만 담는다. DB 원문 오류(detail)는
// 응답에 싣지 않고 서버 로그로만 남긴다 — 클라이언트가 그대로 토스트에 노출하던 경로였다.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { excludedTestUserIds } from '@/lib/env/test-accounts'
import { getDisplayName } from '@/lib/utils'

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
  // 20260829_2101: inventory_items(serial_prefix, serial_number)도 함께 조회한다 — 개체
  // 정체성 모델에서는 poi_drops가 항상 이미 발급된 개체를 가리키므로 픽업 전에도
  // 일련번호가 이미 확정돼 있다(배지 상세 바텀시트의 드랍 컨텍스트 카드에 노출).
  const { data, error } = await service
    .from('poi_drops')
    // inventory_items와는 FK가 두 갈래다 — 레거시 inventory_items.drop_id(픽업 이력)와
    // 20260829_2101 개체정체성 모델의 poi_drops.inventory_item_id(현재 드랍이 가리키는
    // 개체). 관계명을 명시하지 않으면 PostgREST가 PGRST201로 거부해 목록 조회 자체가
    // 실패한다 — 여기서는 후자를 써야 하므로 명시적으로 지정한다.
    .select(`id, badge_id, dropped_at, dropper_user_id, badges ( name, rarity, image_url ), inventory_items!poi_drops_inventory_item_id_fkey ( serial_prefix, serial_number )`)
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
    // 마이그레이션 이전에 완료된 과거 드랍은 소급 연결되지 않아 null일 수 있다.
    inventory_items: { serial_prefix: string | null; serial_number: number } | null
  }
  const rows = (data ?? []) as unknown as PoiDropRow[]

  // dropper username 별도 조회 (FK 중복으로 조인 불가)
  // 프로덕션에서는 스테이징 전용 테스트 계정을 조회 대상에서 빼 이름 대신 '익명'으로 표시한다.
  const excludedIds = excludedTestUserIds()
  const dropperIds = [...new Set(rows
    .map((d) => d.dropper_user_id)
    .filter((id): id is string => Boolean(id) && !excludedIds.includes(id as string)))]
  // users.username은 DB에서 NULL 허용이다(가입 직후 미설정). getDisplayName()이 null을 받아
  // display_name → '' 순으로 폴백하므로 여기서도 nullable을 그대로 표기한다.
  let usersData: { id: string; username: string | null; display_name: string | null }[] = []
  if (dropperIds.length > 0) {
    const usersRes = await service.from('users').select('id, username, display_name').in('id', dropperIds)
    if (usersRes.error) console.error('[poi drops] 드랍퍼 유저 정보 조회 실패', usersRes.error)
    usersData = usersRes.data ?? []
  }
  const nameById: Record<string, string> = {}
  for (const u of usersData) nameById[u.id] = getDisplayName(u)

  const drops = rows.map((d) => ({
    id: d.id,
    badge_id: d.badge_id,
    badge_name: d.badges?.name,
    badge_rarity: d.badges?.rarity,
    badge_image_url: d.badges?.image_url,
    dropper_name: (d.dropper_user_id ? nameById[d.dropper_user_id] : undefined) ?? '익명',
    dropped_at: d.dropped_at,
    serial: d.inventory_items
      ? `${d.inventory_items.serial_prefix ?? '????'}${String(d.inventory_items.serial_number).padStart(6, '0')}`
      : null,
  }))

  return NextResponse.json({ drops })
}
