import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { getAbusingPolicy, updateAbusingPolicy } from '@/lib/abusing/policy'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const policy = await getAbusingPolicy()
  return NextResponse.json({ policy })
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  await updateAbusingPolicy(body)
  return NextResponse.json({ ok: true })
}
