import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { awardPoints, getWallet } from '@/lib/points'
import { isValidAdminReason, HIGH_VALUE_THRESHOLD } from '@/lib/points/reasons'

/**
 * 어드민 포인트 지급/회수 실행.
 * body: { userId, amount(부호 포함: +지급/−회수), reasonLabel, note?, confirmed? }
 *
 * - reasonLabel은 reasons.ts 고정 목록 값만 허용(API 레벨 검증).
 * - reasonLabel='other'이면 note 필수.
 * - |amount| >= 기준액(1,000P)인데 confirmed:true가 없으면 422 거부
 *   (프론트를 건너뛴 직접 호출·오탈자 방어선).
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
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0) {
    return NextResponse.json({ error: '금액은 0이 아닌 정수여야 합니다.' }, { status: 400 })
  }
  if (!isValidAdminReason(reasonLabel)) {
    return NextResponse.json({ error: '허용되지 않은 사유입니다.' }, { status: 400 })
  }
  const trimmedNote = typeof note === 'string' ? note.trim() : ''
  if (reasonLabel === 'other' && trimmedNote.length === 0) {
    return NextResponse.json({ error: '"기타" 사유는 내용을 입력해야 합니다.' }, { status: 400 })
  }

  // 고액 이중 확인 — 서버 방어선
  if (Math.abs(amount) >= HIGH_VALUE_THRESHOLD && confirmed !== true) {
    return NextResponse.json(
      {
        error: `${Math.abs(amount).toLocaleString('ko-KR')}P는 기준액(${HIGH_VALUE_THRESHOLD.toLocaleString('ko-KR')}P) 이상입니다. 확인이 필요합니다.`,
        requiresConfirmation: true,
      },
      { status: 422 }
    )
  }

  const reason = amount > 0 ? 'admin_grant' : 'admin_deduct'
  const tx = await awardPoints(userId, amount, reason, {
    adminReasonLabel: reasonLabel,
    adminReasonNote: reasonLabel === 'other' ? trimmedNote : null,
  })

  if (!tx) {
    return NextResponse.json({ error: '지급/회수 처리에 실패했습니다.' }, { status: 500 })
  }

  const balance = await getWallet(userId)
  return NextResponse.json({ transaction: tx, balance })
}
