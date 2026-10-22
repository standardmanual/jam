import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { getJamPolicy } from '@/lib/jam/policy'
import { getAbusingPolicy } from '@/lib/abusing/policy'
import { getCombinePolicy } from '@/lib/combine/policy'
import { getInventoryPolicy } from '@/lib/inventory/policy'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { getCapsulePolicy } from '@/lib/capsule/policy'
import { POLICIES_DATA } from '@/lib/admin/policyDashboard/policiesData'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const [jamPolicy, abusingPolicy, combinePolicy, inventoryPolicy, ambientDropConfig, capsulePolicy] =
      await Promise.all([
        getJamPolicy().catch(() => null),
        getAbusingPolicy().catch(() => null),
        getCombinePolicy().catch(() => null),
        getInventoryPolicy().catch(() => null),
        getAmbientDropConfig().catch(() => null),
        getCapsulePolicy().catch(() => null),
      ])

    const liveValues: Record<string, unknown> = {
      ...(jamPolicy ?? {}),
      ...(abusingPolicy ?? {}),
      ...(combinePolicy ?? {}),
      ...(inventoryPolicy ?? {}),
      ...(ambientDropConfig ?? {}),
      ...(capsulePolicy ?? {}),
    }

    return NextResponse.json({
      policies: POLICIES_DATA,
      liveValues,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: `정책 대시보드 데이터를 불러오지 못했어요. (${message})` },
      { status: 500 }
    )
  }
}
