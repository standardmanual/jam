import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { getDropPolicy, updateDropPolicy, DEFAULT_DROP_POLICY, type DropPolicy } from '@/lib/drop-engine/policy'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const policy = await getDropPolicy()
  return NextResponse.json({ policy })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json()) as Partial<DropPolicy>

  // 허용 키만 추출 + 숫자 검증
  const patch: Partial<DropPolicy> = {}
  for (const key of Object.keys(DEFAULT_DROP_POLICY) as (keyof DropPolicy)[]) {
    const v = body[key]
    if (v === undefined) continue
    const n = typeof v === 'string' ? parseFloat(v) : v
    if (typeof n !== 'number' || Number.isNaN(n) || n < 0) {
      return NextResponse.json({ error: `${key}: 0 이상의 숫자여야 합니다.` }, { status: 400 })
    }
    patch[key] = n
  }

  const merged = { ...(await getDropPolicy()), ...patch }

  // rarity 분포 합 = 1 검증 (±0.001 허용)
  const raritySum =
    merged.rarity_common + merged.rarity_rare + merged.rarity_legendary + merged.rarity_mythic
  if (Math.abs(raritySum - 1) > 0.001) {
    return NextResponse.json(
      { error: `rarity 분포 합이 1이어야 합니다. (현재 ${raritySum.toFixed(3)})` },
      { status: 400 }
    )
  }

  // 세계관 버킷 합 ≤ 1 검증 (나머지는 탐험이 흡수)
  const bucketSum = merged.momentum_weight + merged.adjacent_weight + merged.explore_weight
  if (bucketSum > 1.001) {
    return NextResponse.json(
      { error: `모멘텀+인접+탐험 합이 1 이하여야 합니다. (현재 ${bucketSum.toFixed(3)})` },
      { status: 400 }
    )
  }

  await updateDropPolicy(patch)
  return NextResponse.json({ policy: await getDropPolicy() })
}
