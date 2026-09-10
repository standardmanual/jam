import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  getCombinePolicy,
  updateCombinePolicy,
  DEFAULT_COMBINE_POLICY,
  type CombinePolicy,
} from '@/lib/combine/policy'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const policy = await getCombinePolicy()
  return NextResponse.json({ policy })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json()) as Partial<CombinePolicy>

  const patch: Partial<CombinePolicy> = {}
  for (const key of Object.keys(DEFAULT_COMBINE_POLICY) as (keyof CombinePolicy)[]) {
    const v = body[key]
    if (v === undefined) continue
    const n = typeof v === 'string' ? parseFloat(v) : v
    if (typeof n !== 'number' || Number.isNaN(n) || n < 0) {
      return NextResponse.json({ error: `${key}: 0 이상의 숫자여야 합니다.` }, { status: 400 })
    }
    patch[key] = n
  }

  // 마이그레이션 153에서 확률·티어 필드가 전부 사라져 교차 검증(0~1 범위, 티어 오름차순)의
  // 대상이 없어졌다 — 남은 검증은 위 루프의 "0 이상 정수" 하나다.
  const points = patch.fail_reward_points
  if (points !== undefined && !Number.isInteger(points)) {
    return NextResponse.json({ error: 'fail_reward_points: 정수여야 합니다.' }, { status: 400 })
  }

  try {
    await updateCombinePolicy(patch)
  } catch (e) {
    // 어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 함께 노출한다
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        error: `조합 정책이 저장되지 않았어요. 데이터베이스가 요청을 거부했어요. 다시 시도해도 같으면 괄호 안 오류 내용을 개발자에게 전달해 주세요. (${detail})`,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ policy: await getCombinePolicy() })
}
