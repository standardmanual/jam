import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  getInventoryPolicy,
  getInventoryUserCount,
  updateInventoryMaxSlots,
  INVENTORY_MAX_SLOTS_OVER_LIMIT_PREFIX,
  INVENTORY_MAX_SLOTS_INVALID_PREFIX,
} from '@/lib/inventory/policy'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [policy, affectedUserCount] = await Promise.all([getInventoryPolicy(), getInventoryUserCount()])
  return NextResponse.json({ policy, affectedUserCount })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json()) as { max_slots?: unknown }
  const raw = body.max_slots
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw

  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    return NextResponse.json(
      {
        error:
          '인벤토리 최대치가 저장되지 않았어요. 값이 1 이상의 정수가 아니에요. 값을 확인하고 다시 저장해 주세요.',
      },
      { status: 400 }
    )
  }

  try {
    const updatedCount = await updateInventoryMaxSlots(n)
    return NextResponse.json({ policy: await getInventoryPolicy(), updatedCount })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)

    if (detail.startsWith(INVENTORY_MAX_SLOTS_OVER_LIMIT_PREFIX)) {
      const reason = detail.slice(INVENTORY_MAX_SLOTS_OVER_LIMIT_PREFIX.length).trim()
      return NextResponse.json(
        {
          error: `인벤토리 최대치가 저장되지 않았어요. ${reason} 더 큰 값을 입력하거나, 해당 유저의 아이템을 정리한 뒤 다시 저장해 주세요.`,
        },
        { status: 400 }
      )
    }

    if (detail.startsWith(INVENTORY_MAX_SLOTS_INVALID_PREFIX)) {
      return NextResponse.json(
        {
          error: '인벤토리 최대치가 저장되지 않았어요. 값이 1 이상의 정수가 아니에요. 값을 확인하고 다시 저장해 주세요.',
        },
        { status: 400 }
      )
    }

    // 어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 함께 노출한다
    return NextResponse.json(
      {
        error: `인벤토리 최대치가 저장되지 않았어요. 데이터베이스가 요청을 거부했어요. 다시 시도해도 같으면 괄호 안 오류 내용을 개발자에게 전달해 주세요. (${detail})`,
      },
      { status: 500 }
    )
  }
}
