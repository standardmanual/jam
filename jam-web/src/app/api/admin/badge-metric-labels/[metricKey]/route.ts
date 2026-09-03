import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ metricKey: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { metricKey } = await params
  const { label_ko, unit_ko = null } = await req.json()
  if (!label_ko) return NextResponse.json({ error: 'label_ko는 필수입니다.' }, { status: 400 })
  if (unit_ko !== null && typeof unit_ko !== 'string') {
    return NextResponse.json({ error: 'unit_ko는 문자열이거나 없어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('badge_metric_labels')
    .update({ label_ko, unit_ko: unit_ko || null, updated_at: new Date().toISOString() })
    .eq('metric_key', metricKey)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ label: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ metricKey: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { metricKey } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from('badge_metric_labels').delete().eq('metric_key', metricKey)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
