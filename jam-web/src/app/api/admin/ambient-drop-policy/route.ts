import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  getAmbientDropPolicy,
  updateAmbientDropPolicy,
  DEFAULT_AMBIENT_DROP_POLICY,
  type AmbientDropPolicy,
} from '@/lib/ambient-drop/policy'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const policy = await getAmbientDropPolicy()
  return NextResponse.json({ policy })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json()) as Partial<AmbientDropPolicy>

  const patch: Partial<AmbientDropPolicy> = {}
  for (const key of Object.keys(DEFAULT_AMBIENT_DROP_POLICY) as (keyof AmbientDropPolicy)[]) {
    const v = body[key]
    if (v === undefined) continue
    const n = typeof v === 'string' ? parseFloat(v) : v
    if (typeof n !== 'number' || Number.isNaN(n) || n < 0) {
      return NextResponse.json({ error: `${key}: 0 이상의 숫자여야 합니다.` }, { status: 400 })
    }
    patch[key] = n
  }

  const merged = { ...(await getAmbientDropPolicy()), ...patch }

  // rarity 분포 합 = 1 검증 (mythic 없음, ±0.001 허용)
  const raritySum = merged.rarity_common + merged.rarity_rare + merged.rarity_legendary
  if (Math.abs(raritySum - 1) > 0.001) {
    return NextResponse.json(
      { error: `rarity 분포 합이 1이어야 합니다. (현재 ${raritySum.toFixed(3)})` },
      { status: 400 }
    )
  }

  if (merged.min_target_total > merged.max_target_total) {
    return NextResponse.json(
      { error: 'min_target_total은 max_target_total 이하여야 합니다.' },
      { status: 400 }
    )
  }

  await updateAmbientDropPolicy(patch)
  return NextResponse.json({ policy: await getAmbientDropPolicy() })
}
