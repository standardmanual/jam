// GET /api/drops/[dropId] — 단일 드랍 정보 (픽업 전 확인용)
// 실제로는 POI 기준 목록이 필요하므로 /api/drops/poi/[poiId] 참고

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { PoiDropRow } from '@/types/database'
import { getDisplayName } from '@/lib/utils'
import { d } from '@/lib/i18n'

// 20260915_2241 — ADR 0001에 맞춰 `error` 필드를 완성된 사용자 문구로 정정했다. 조사 결과
// 이 라우트를 호출하는 클라이언트 코드는 현재 없다(`/api/drops/poi/[poiId]`가 대체)
// — 그대로 두되 재사용 시 가이드에 맞는 문구가 나가도록 고쳐 둔다.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dropId: string }> }
) {
  const { dropId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.drops.sessionExpired }, { status: 401 })

  const service = createServiceClient()

  const { data, error } = await service
    .from('poi_drops')
    // inventory_items와는 FK가 두 갈래다 — 레거시 inventory_items.drop_id(픽업 이력)와
    // 20260829_2101 개체정체성 모델의 poi_drops.inventory_item_id(현재 드랍이 가리키는
    // 개체). 관계명을 명시하지 않으면 PostgREST가 PGRST201로 거부한다 — 여기서는
    // 후자를 써야 하므로 명시적으로 지정한다.
    .select(`
      *,
      badges ( name, rarity, image_url ),
      users!dropper_user_id ( username, display_name ),
      inventory_items!poi_drops_inventory_item_id_fkey ( serial_prefix, serial_number, locked )
    `)
    .eq('id', dropId)
    .single()

  // 20260901_1848: 조회 실패도 !data와 함께 "드랍 없음" 404로 위장된다 — 로그로 구분
  if (error) console.error('[api/drops/[dropId]] poi_drops 단건 조회 실패', error)
  if (error || !data) {
    return NextResponse.json({ error: d.drops.pickupDropNotFound }, { status: 404 })
  }

  const drop = data as PoiDropRow & {
    badges: { name: string; rarity: string; image_url: string }
    users: { username: string; display_name: string | null } | null
    // 20260829_2101: 개체 정체성 모델 — poi_drops가 항상 이미 발급된 inventory_items를
    // 가리키므로 픽업 전에도 일련번호가 이미 확정돼 있다. 마이그레이션 이전에 완료된
    // (is_available=false) 과거 드랍은 소급 연결되지 않아 null일 수 있다.
    inventory_items: { serial_prefix: string | null; serial_number: number; locked: boolean | null } | null
  }

  // 잠긴 개체는 이름·그림·일련번호를 싣지 않고 «잠김 표시 + 등급»만 싣는다(티켓 20261018_1812, 운영 로직 7.3절).
  if (drop.inventory_items?.locked === true) {
    return NextResponse.json({
      id: drop.id,
      poi_id: drop.poi_id,
      badge_name: d.lockedItem.card.name,
      badge_rarity: drop.badges.rarity,
      badge_image_url: null,
      dropper_name: (drop.users && getDisplayName(drop.users)) || d.drops.anonymous,
      dropped_at: drop.dropped_at,
      is_available: drop.is_available,
      is_own: drop.dropper_user_id === user.id,
      serial: null,
      locked: true,
    })
  }

  return NextResponse.json({
    id: drop.id,
    poi_id: drop.poi_id,
    badge_name: drop.badges.name,
    badge_rarity: drop.badges.rarity,
    badge_image_url: drop.badges.image_url,
    dropper_name: (drop.users && getDisplayName(drop.users)) || d.drops.anonymous,
    dropped_at: drop.dropped_at,
    is_available: drop.is_available,
    is_own: drop.dropper_user_id === user.id,
    serial: drop.inventory_items
      ? `${drop.inventory_items.serial_prefix ?? '????'}${String(drop.inventory_items.serial_number).padStart(6, '0')}`
      : null,
  })
}
