import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { loadTierCompletionCount, loadTierReadiness } from '@/lib/admin/itembookTier'

/**
 * 컬렉션 4등급 방식 켜기·끄기 (티켓 20261022_1139 1회, 상위 20261022_1131 묶음 7)
 *
 * - `GET`: 현재 켜짐 여부와 켜기 전 점검 결과(이름 점검·장착한 등급 분포·등급별 완성 기록 수).
 * - `PUT { tier_mode: boolean }`: 켜기·끄기. `PUT /api/admin/itembooks/[id]`는 `tier_mode`를 쓰지 않는다 — 이 라우트만 쓴다.
 *   - 켜기: 점검을 서버에서 다시 돌려 «여러 등급을 장착한 유저»가 있으면 409. 이름 점검은 경고일 뿐 막지 않는다.
 *   - 끄기: 등급별 완성 기록이 하나라도 있으면 409(기록이 어느 규칙에도 속하지 않게 된다).
 *   - 이미 요청한 상태면 아무것도 쓰지 않고 200(`changed: false`).
 *
 * 응답에는 숫자만 싣는다. 유저 id는 싣지 않는다. DB 오류 원문은 응답에 싣지 않고 로그에만 남긴다. 문구는 현상 → 원인 → 해결책 순서다.
 * 켜기 점검과 쓰기 사이에 다른 유저가 장착하는 틈은 원자적으로 막지 못한다(DB 변경 없이 1회 범위에서는 방법이 없다).
 */

const NOT_FOUND_MESSAGE = '컬렉션을 찾지 못했어요. 이미 삭제됐거나 주소가 잘못됐을 수 있어요. 컬렉션 목록에서 다시 열어 주세요.'
const INVALID_BODY_MESSAGE = '요청 형식이 올바르지 않아요. tier_mode는 true나 false로 보내 주세요.'
const READ_ERROR_MESSAGE = '켜기 전 점검 결과를 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const SAVE_ERROR_MESSAGE = '4등급 방식을 바꾸지 못했어요. 서버에서 저장 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

type RouteContext = { params: Promise<{ id: string }> }
type ServiceClient = ReturnType<typeof createServiceClient>

/** 컬렉션의 현재 `tier_mode`를 읽는다. 없으면 `found: false`, DB 오류면 `error`. */
async function readTierMode(
  supabase: ServiceClient,
  id: string
): Promise<{ found: true; tierMode: boolean } | { found: false } | { error: true }> {
  const { data, error } = await supabase.from('item_books').select('id, tier_mode').eq('id', id).maybeSingle()
  if (error) {
    console.error('[itembooks tier] 컬렉션 조회 오류:', error)
    return { error: true }
  }
  if (!data) return { found: false }
  return { found: true, tierMode: Boolean(data.tier_mode) }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  const book = await readTierMode(supabase, id)
  if ('error' in book) return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  if (!book.found) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 })

  try {
    const readiness = await loadTierReadiness(supabase, id)
    return NextResponse.json({ tierMode: book.tierMode, readiness })
  } catch (e) {
    console.error('[itembooks tier GET] 점검 조회 오류:', e)
    return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body: unknown = await req.json().catch(() => null)
  const requested = (body as { tier_mode?: unknown } | null)?.tier_mode
  if (typeof requested !== 'boolean') return NextResponse.json({ error: INVALID_BODY_MESSAGE }, { status: 400 })

  const supabase = createServiceClient()

  const book = await readTierMode(supabase, id)
  if ('error' in book) return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  if (!book.found) return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 404 })

  if (book.tierMode === requested) return NextResponse.json({ tierMode: requested, changed: false })

  try {
    if (requested) {
      // 켜기 — 화면 점검 결과를 믿지 않고 서버에서 다시 돌린다.
      const { distribution, canEnable } = await loadTierReadiness(supabase, id)
      if (!canEnable) {
        return NextResponse.json(
          {
            error: `4등급 방식을 켜지 못했어요. 이 컬렉션에 여러 등급을 장착한 유저가 ${distribution.multiTierUserCount}명 있어서, 켜면 그 유저의 장착이 등급 규칙과 어긋나요. 해당 유저의 장착을 정리한 뒤 다시 켜 주세요. 정리 방법은 개발자에게 물어봐 주세요.`,
            multiTierUserCount: distribution.multiTierUserCount,
          },
          { status: 409 }
        )
      }
    } else {
      const tierCompletionCount = await loadTierCompletionCount(supabase, id)
      if (tierCompletionCount > 0) {
        return NextResponse.json(
          {
            error: `4등급 방식을 끄지 못했어요. 이 컬렉션에 등급별 완성 기록이 ${tierCompletionCount}건 있어서, 끄면 그 기록이 어느 규칙에도 속하지 않게 돼요. 기록이 있는 컬렉션은 켠 채로 두세요.`,
            tierCompletionCount,
          },
          { status: 409 }
        )
      }
    }
  } catch (e) {
    console.error('[itembooks tier PUT] 점검 조회 오류:', e)
    return NextResponse.json({ error: READ_ERROR_MESSAGE }, { status: 500 })
  }

  const { error } = await supabase.from('item_books').update({ tier_mode: requested }).eq('id', id)
  if (error) {
    console.error('[itembooks tier PUT] 저장 오류:', error)
    return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
  }

  return NextResponse.json({ tierMode: requested, changed: true })
}
