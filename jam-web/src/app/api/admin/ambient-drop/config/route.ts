import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  getAmbientDropConfig,
  updateAmbientDropConfig,
  type AmbientDropConfig,
} from '@/lib/ambient-drop/config'
import type { AmbientDropAxisMode } from '@/types/database'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isAxisMode(v: unknown): v is AmbientDropAxisMode {
  return v === 'explicit' || v === 'random'
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = await getAmbientDropConfig()
  return NextResponse.json({ config })
}

/** 폼 전체 저장 — DropPolicyForm/PUT(/api/admin/drop-policy)과 동일 패턴 */
export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json()) as Record<string, unknown>
  const current = await getAmbientDropConfig()

  const auto_enabled = typeof body.auto_enabled === 'boolean' ? body.auto_enabled : current.auto_enabled
  const all_random = typeof body.all_random === 'boolean' ? body.all_random : current.all_random

  const exclusion_window_minutes =
    body.exclusion_window_minutes === undefined ? current.exclusion_window_minutes : Number(body.exclusion_window_minutes)
  if (Number.isNaN(exclusion_window_minutes) || exclusion_window_minutes < 0) {
    return NextResponse.json({ error: 'exclusion_window_minutes는 0 이상의 숫자여야 합니다.' }, { status: 400 })
  }

  const category_mode = body.category_mode === undefined ? current.category_mode : body.category_mode
  if (!isAxisMode(category_mode)) {
    return NextResponse.json({ error: 'category_mode는 explicit 또는 random이어야 합니다.' }, { status: 400 })
  }
  const category_slug =
    body.category_slug === undefined ? current.category_slug : (body.category_slug as string | null)
  if (category_slug !== null && typeof category_slug !== 'string') {
    return NextResponse.json({ error: 'category_slug는 문자열 또는 null이어야 합니다.' }, { status: 400 })
  }

  const rarity_mode = body.rarity_mode === undefined ? current.rarity_mode : body.rarity_mode
  if (!isAxisMode(rarity_mode)) {
    return NextResponse.json({ error: 'rarity_mode는 explicit 또는 random이어야 합니다.' }, { status: 400 })
  }
  const rarity_common = body.rarity_common === undefined ? current.rarity_common : Number(body.rarity_common)
  const rarity_rare = body.rarity_rare === undefined ? current.rarity_rare : Number(body.rarity_rare)
  const rarity_legend = body.rarity_legend === undefined ? current.rarity_legend : Number(body.rarity_legend)
  const rarity_mythic = body.rarity_mythic === undefined ? current.rarity_mythic : Number(body.rarity_mythic)
  for (const [key, v] of Object.entries({ rarity_common, rarity_rare, rarity_legend, rarity_mythic })) {
    if (Number.isNaN(v) || v < 0) {
      return NextResponse.json({ error: `${key}: 0 이상의 숫자여야 합니다.` }, { status: 400 })
    }
  }
  if (rarity_mode === 'explicit') {
    const raritySum = rarity_common + rarity_rare + rarity_legend + rarity_mythic
    if (Math.abs(raritySum - 1) > 0.001) {
      return NextResponse.json(
        { error: `등급 비율 합이 1이어야 합니다. (현재 ${raritySum.toFixed(3)})` },
        { status: 400 }
      )
    }
  }

  const collection_mode = body.collection_mode === undefined ? current.collection_mode : body.collection_mode
  if (!isAxisMode(collection_mode)) {
    return NextResponse.json({ error: 'collection_mode는 explicit 또는 random이어야 합니다.' }, { status: 400 })
  }
  // collection_mode='explicit' + collection_ids=[] 조합도 그대로 허용한다 — "전체 컬렉션"을
  // 뜻한다(티켓 20260826_009 예시: "전체 컬렉션 중 legend 등급 무작위 드랍"과 동일한 표현).
  const collection_ids = body.collection_ids === undefined ? current.collection_ids : body.collection_ids
  if (!Array.isArray(collection_ids) || !collection_ids.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))) {
    return NextResponse.json({ error: 'collection_ids는 UUID 문자열 배열이어야 합니다.' }, { status: 400 })
  }

  const batch_size = body.batch_size === undefined ? current.batch_size : Number(body.batch_size)
  if (Number.isNaN(batch_size) || batch_size < 1) {
    return NextResponse.json({ error: 'batch_size는 1 이상의 숫자여야 합니다.' }, { status: 400 })
  }
  const max_active_per_poi =
    body.max_active_per_poi === undefined ? current.max_active_per_poi : Number(body.max_active_per_poi)
  if (Number.isNaN(max_active_per_poi) || max_active_per_poi < 1) {
    return NextResponse.json({ error: 'max_active_per_poi는 1 이상의 숫자여야 합니다.' }, { status: 400 })
  }

  const patch: AmbientDropConfig = {
    auto_enabled,
    exclusion_window_minutes,
    all_random,
    category_mode,
    category_slug,
    rarity_mode,
    rarity_common,
    rarity_rare,
    rarity_legend,
    rarity_mythic,
    collection_mode,
    collection_ids: collection_ids as string[],
    batch_size,
    max_active_per_poi,
  }

  try {
    await updateAmbientDropConfig(patch)
  } catch (err) {
    // category_slug가 poi_categories.slug FK를 위반하는 경우 등 — 존재하지 않는 카테고리
    const message = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.'
    return NextResponse.json({ error: `category_slug 등 참조 값을 확인해주세요: ${message}` }, { status: 400 })
  }
  return NextResponse.json({ config: await getAmbientDropConfig() })
}
