import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { fractionToPercent } from '@/lib/admin/balance/fields'
import {
  getAmbientDropConfig,
  updateAmbientDropConfig,
  type AmbientAxisPatch,
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

/**
 * 스위치와 세 축 고르기 저장. 본문에 숫자 8칸이 들어와도 받지 않는다(옛 화면이 열린 채 남은 경우에도 낡은 숫자로 덮어쓰지 않는다).
 * `rarity_mode`가 explicit이 되면 등급 비율 합 1을 **저장된 값(밸런스 설정이 저장한 값)** 으로 검사한다. 본문의 비율은 보지 않는다.
 */
export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json()) as Record<string, unknown>
  const current = await getAmbientDropConfig()

  const auto_enabled = typeof body.auto_enabled === 'boolean' ? body.auto_enabled : current.auto_enabled

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
  if (rarity_mode === 'explicit') {
    const raritySum = current.rarity_common + current.rarity_rare + current.rarity_epic + current.rarity_mystic
    if (Math.abs(raritySum - 1) > 0.001) {
      return NextResponse.json(
        {
          error: `등급을 「명시」로 정할 수 없어요. 저장된 등급 비율의 합이 100%가 아니라 ${fractionToPercent(raritySum)}%예요. 밸런스 설정의 시스템 드랍 구역에서 등급 비율 합을 100으로 맞춘 뒤 다시 저장해 주세요.`,
        },
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

  // 여섯 열만 쓴다. last_auto_run_on(예약 배포 선점용 시스템 전용 열)과 숫자 8열은 싣지 않는다.
  const patch: AmbientAxisPatch = {
    auto_enabled,
    category_mode,
    category_slug,
    rarity_mode,
    collection_mode,
    collection_ids: collection_ids as string[],
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
