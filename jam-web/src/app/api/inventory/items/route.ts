// GET /api/inventory/items — 드랍 가능한 인벤토리 아이템 목록 (dropped_at IS NULL, slotted_in IS NULL)

import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getOrCreateInventoryId } from '@/lib/inventory/get-or-create'
import { d } from '@/lib/i18n'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: d.common.authRequired }, { status: 401 })

  const service = createServiceClient()

  // 인벤토리 조회 — 없으면 즉석 생성한다(get-or-create, 티켓 20260906_2217 회귀 방지).
  const inventoryId = await getOrCreateInventoryId(service, user.id)

  if (!inventoryId) return NextResponse.json({ items: [] })

  const { data, error } = await service
    .from('inventory_items')
    .select(`
      id,
      badge_id,
      dropped_at,
      serial_prefix,
      serial_number,
      expires_at,
      locked,
      unlock_points_required,
      badges ( name, rarity, image_url, deleted_at )
    `)
    .eq('inventory_id', inventoryId)
    .is('dropped_at', null)
    .is('slotted_in', null)
    .order('obtained_at', { ascending: false })

  if (error) return NextResponse.json({ error: d.inventory.fetchFailed }, { status: 500 })

  // 소프트 삭제된 배지(badges.deleted_at)는 드랍 선택 목록에서 제외한다 —
  // 메인 인벤토리 목록(inventory/page.tsx)과 동일하게 조인 결과를 사후 필터한다.
  // Supabase 조인 결과의 생성 타입은 `badges`를 배열로 추론해 아래 접근과 맞지 않는다.
  // 실제 응답 모양을 한 번만 명시해 두고 이후에는 타입이 붙은 값으로 다룬다(any 제거).
  type InventoryItemRow = {
    id: string
    badge_id: string
    dropped_at: string | null
    // 20260908_0040: 드랍 시트가 같은 배지의 여러 개체를 구분할 수 있게 일련번호·만료일을 싣는다.
    serial_prefix: string | null
    serial_number: number
    expires_at: string | null
    locked: boolean | null
    unlock_points_required: number | null
    badges: { name: string; rarity: string; image_url: string | null; deleted_at: string | null } | null
  }

  const items = ((data ?? []) as unknown as InventoryItemRow[])
    .filter((row) => row.badges && !row.badges.deleted_at)
    .map((row) => {
      // 잠긴 개체는 어떤 아이템 배지인지 알 수 있는 값(배지 id·이름·그림·일련번호 접두사)을 내리지 않고 «잠김 표시 + 등급»만 싣는다
      // (운영 로직 7.3절, 티켓 20261018_0051 2회). 드랍은 서버가 막지만 목록 응답이 먼저 이름을 드러내면 가림이 무의미하다.
      // `badge_id`는 드랍 목록이 배지 종류(badge_id)별로 묶는 키라 비우면 등급이 다른 잠긴 개체가 한 카드로 섞인다 — 등급별 합성 키를 쓴다.
      if (row.locked === true) {
        return {
          id: row.id,
          badge_id: `locked:${row.badges?.rarity ?? 'common'}`,
          badge_name: d.lockedItem.card.name,
          badge_rarity: row.badges?.rarity,
          badge_image_url: null,
          serial_prefix: null,
          serial_number: row.serial_number,
          expires_at: row.expires_at,
          locked: true,
          // 개체 선택 시트 행의 구분 값 — 여는 비용은 포인트다(티켓 20261028_1741 2회)
          unlock_points_required: row.unlock_points_required,
        }
      }
      return {
        id: row.id,
        badge_id: row.badge_id,
        badge_name: row.badges?.name,
        badge_rarity: row.badges?.rarity,
        badge_image_url: row.badges?.image_url,
        serial_prefix: row.serial_prefix,
        serial_number: row.serial_number,
        expires_at: row.expires_at,
      }
    })

  return NextResponse.json({ items })
}
