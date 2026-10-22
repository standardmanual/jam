import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import {
  findUnavailableRewardBadgeTiers,
  loadTierRewards,
  saveTierRewards,
  unavailableBadgeMessage,
  validateTierRewardsBody,
} from '@/lib/admin/itembookTierRewards'

/**
 * 컬렉션 등급별 보상 읽기·저장 (티켓 20261022_1139 2회, 상위 20261022_1131 묶음 7)
 *
 * - `GET`: 등급 네 개의 포인트(비우면 기본값)·기본값·보상 배지(이름 포함).
 * - `PUT { tiers: [{ tier, reward_points, reward_badge_id }] }`: 등급 네 개를 한 번에 저장한다.
 *   - 4등급 방식이 꺼진 컬렉션이면 409(GET도 같다). 켜기·끄기는 `[id]/tier`가 한다.
 *   - 포인트는 비우면(null) 기본값, 0이면 지급 없음, 0 이상의 정수만 받는다(상한은 두지 않는다).
 *   - 같은 배지를 두 등급에 고르거나, 없거나 소프트 삭제된 배지를 고르면 400이다.
 *   - 두 칸이 모두 빈 등급은 행을 지운다. 이미 받은 보상은 바뀌지 않는다.
 *
 * DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다. 문구는 현상 → 원인 → 해결책 순서다.
 */

const NOT_FOUND_MESSAGE = '컬렉션을 찾지 못했어요. 이미 삭제됐거나 주소가 잘못됐을 수 있어요. 컬렉션 목록에서 다시 열어 주세요.'
const TIER_MODE_OFF_MESSAGE = '등급별 보상을 다루지 못했어요. 이 컬렉션은 4등급 방식이 꺼져 있어요. 4등급 방식을 켠 뒤에 다시 열어 주세요.'
const READ_ERROR_MESSAGE = '등급별 보상을 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const SAVE_ERROR_MESSAGE = '등급별 보상을 저장하지 못했어요. 서버에서 저장 중 오류가 났어요. 잠시 뒤 같은 값으로 다시 저장해 주세요.'

type RouteContext = { params: Promise<{ id: string }> }
type ServiceClient = ReturnType<typeof createServiceClient>

/** 컬렉션의 `tier_mode`를 읽는다. 없으면 `found: false`, DB 오류면 `error`. */
async function readTierMode(
  supabase: ServiceClient,
  id: string
): Promise<{ found: true; tierMode: boolean } | { found: false } | { error: true }> {
  const { data, error } = await supabase.from('item_books').select('id, tier_mode').eq('id', id).maybeSingle()
  if (error) {
    console.error('[itembooks tier-rewards] 컬렉션 조회 오류:', error)
    return { error: true }
  }
  if (!data) return { found: false }
  return { found: true, tierMode: Boolean(data.tier_mode) }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 })
  const supabase = createServiceClient()

  const book = await readTierMode(supabase, id)
  if ('error' in book) return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  if (!book.found) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 })
  if (!book.tierMode) return NextResponse.json({ error: TIER_MODE_OFF_MESSAGE }, { status: 409 })

  try {
    return NextResponse.json({ tiers: await loadTierRewards(supabase, id) })
  } catch (e) {
    console.error('[itembooks tier-rewards GET] 조회 오류:', e)
    return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 })

  const body: unknown = await req.json().catch(() => null)
  const parsed = validateTierRewardsBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 })

  const supabase = createServiceClient()

  const book = await readTierMode(supabase, id)
  if ('error' in book) return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  if (!book.found) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 })
  if (!book.tierMode) return NextResponse.json({ error: TIER_MODE_OFF_MESSAGE }, { status: 409 })

  try {
    const unavailable = await findUnavailableRewardBadgeTiers(supabase, parsed.tiers)
    if (unavailable.length > 0) {
      return NextResponse.json({ error: unavailableBadgeMessage(unavailable), tiers: unavailable }, { status: 400 })
    }
  } catch (e) {
    console.error('[itembooks tier-rewards PUT] 보상 배지 확인 오류:', e)
    return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  }

  try {
    await saveTierRewards(supabase, id, parsed.tiers)
  } catch (e) {
    console.error('[itembooks tier-rewards PUT] 저장 오류:', e)
    return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
