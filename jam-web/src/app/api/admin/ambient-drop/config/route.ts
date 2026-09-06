import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  getAmbientDropConfig,
  updateAmbientDropConfig,
  type AmbientDropConfig,
} from '@/lib/ambient-drop/config'
import {
  AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES,
  isValidScheduleHourKst,
} from '@/lib/ambient-drop/schedule'
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

  const schedule_hour_kst =
    body.schedule_hour_kst === undefined ? current.schedule_hour_kst : Number(body.schedule_hour_kst)
  if (!isValidScheduleHourKst(schedule_hour_kst)) {
    return NextResponse.json({ error: 'schedule_hour_kst는 0~23 사이의 정수여야 합니다.' }, { status: 400 })
  }

  const exclusion_window_minutes =
    body.exclusion_window_minutes === undefined ? current.exclusion_window_minutes : Number(body.exclusion_window_minutes)
  if (
    Number.isNaN(exclusion_window_minutes) ||
    exclusion_window_minutes < 0 ||
    exclusion_window_minutes > AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES
  ) {
    return NextResponse.json(
      {
        error: `상호 배제 창은 0~${AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES}분 사이여야 해요. 720분을 넘기면 「지금 배포」가 하루 종일 막혀요. 예약 배포와 겹치는 것만 막으면 되니 15분 안팎이면 충분해요.`,
      },
      { status: 400 }
    )
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
  const rarity_epic = body.rarity_epic === undefined ? current.rarity_epic : Number(body.rarity_epic)
  const rarity_mystic = body.rarity_mystic === undefined ? current.rarity_mystic : Number(body.rarity_mystic)
  for (const [key, v] of Object.entries({ rarity_common, rarity_rare, rarity_epic, rarity_mystic })) {
    if (Number.isNaN(v) || v < 0) {
      return NextResponse.json({ error: `${key}: 0 이상의 숫자여야 합니다.` }, { status: 400 })
    }
  }
  if (rarity_mode === 'explicit') {
    const raritySum = rarity_common + rarity_rare + rarity_epic + rarity_mystic
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
  // 뜻한다(티켓 20260826_009 예시: "전체 컬렉션 중 epic 등급 무작위 드랍"과 동일한 표현).
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

  // last_auto_run_on은 예약 배포 선점용 시스템 전용 필드다 — 어드민이 쓰지 못하게 patch에서 제외한다.
  const patch: Omit<AmbientDropConfig, 'last_auto_run_on'> = {
    auto_enabled,
    schedule_hour_kst,
    exclusion_window_minutes,
    all_random,
    category_mode,
    category_slug,
    rarity_mode,
    rarity_common,
    rarity_rare,
    rarity_epic,
    rarity_mystic,
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
