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

  const merged = { ...(await getCombinePolicy()), ...patch }

  // 확률 필드는 0~1 사이여야 함
  const rateFields: (keyof CombinePolicy)[] = [
    'tier1_b_rate', 'tier2_b_rate', 'tier3_b_rate', 'pity_prob_increment', 'pity_prob_cap',
  ]
  for (const key of rateFields) {
    if (merged[key] > 1) {
      return NextResponse.json({ error: `${key}: 1 이하의 값이어야 합니다.` }, { status: 400 })
    }
  }

  // 티어 재료 상한은 오름차순이어야 함 (1 < 2 < 3)
  if (!(merged.tier1_max_items < merged.tier2_max_items && merged.tier2_max_items <= merged.tier3_max_items)) {
    return NextResponse.json(
      { error: '티어별 재료 개수 상한은 티어1 < 티어2 ≤ 티어3 순서여야 합니다.' },
      { status: 400 }
    )
  }

  // 세계관 다양성 요건도 오름차순 권장 (엄격 검증은 아님, 역전 시 경고성 차단)
  if (!(merged.tier1_min_factions <= merged.tier2_min_factions && merged.tier2_min_factions <= merged.tier3_min_factions)) {
    return NextResponse.json(
      { error: '티어별 최소 세계관 다양성은 티어1 ≤ 티어2 ≤ 티어3 순서여야 합니다.' },
      { status: 400 }
    )
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
