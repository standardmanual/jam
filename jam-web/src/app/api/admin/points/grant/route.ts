import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { validateAdminGrantInput, executeAdminGrant } from '@/lib/points/admin-grant'

/**
 * 어드민 포인트 지급/회수 실행.
 * body: { userId, amount(부호 포함: +지급/−회수), reasonLabel, note?, confirmed? }
 *
 * 검증(사유 목록·기타 메모·고액 확인)과 실행은 `lib/points/admin-grant.ts`가 갖는다 —
 * 유저 일괄 지급(`api/admin/users/bulk`)과 같은 함수를 써서 규칙이 갈라지지 않게 한다.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 })

  const { userId, amount, reasonLabel, note, confirmed } = body as {
    userId?: string
    amount?: number
    reasonLabel?: string
    note?: string
    confirmed?: boolean
  }

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: '대상 유저가 지정되지 않았습니다.' }, { status: 400 })
  }

  const validated = validateAdminGrantInput({ amount, reasonLabel, note, confirmed })
  if (!validated.ok) {
    return NextResponse.json(
      validated.requiresConfirmation
        ? { error: validated.error, requiresConfirmation: true }
        : { error: validated.error },
      { status: validated.status }
    )
  }

  const executed = await executeAdminGrant(userId, validated.grant)
  if (!executed) {
    return NextResponse.json({ error: '지급/회수 처리에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ transaction: executed.transaction, balance: executed.balance })
}
