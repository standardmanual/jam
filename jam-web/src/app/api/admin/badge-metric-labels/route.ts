import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

// 소문자/숫자/밑줄만 허용 — condition_json 필드 키·day_of_week/season 값과 동일한 표기 규칙
// (poi-categories의 SLUG_RE와 동일 패턴, 티켓 20260904_0430)
const METRIC_KEY_RE = /^[a-z][a-z0-9_]*$/

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('badge_metric_labels').select('*').order('metric_key')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ labels: data })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { metric_key, label_ko, unit_ko = null } = body

  if (!metric_key || !label_ko) {
    return NextResponse.json({ error: 'metric_key, label_ko는 필수입니다.' }, { status: 400 })
  }
  if (!METRIC_KEY_RE.test(metric_key)) {
    return NextResponse.json(
      { error: 'metric_key는 영문 소문자/숫자/밑줄만 가능하며 알파벳으로 시작해야 합니다. 예: distance_km' },
      { status: 400 }
    )
  }
  if (unit_ko !== null && typeof unit_ko !== 'string') {
    return NextResponse.json({ error: 'unit_ko는 문자열이거나 없어야 합니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const insertPayload = { metric_key, label_ko, unit_ko: unit_ko || null }
  const badgeMetricLabelsQuery = supabase.from('badge_metric_labels')
  const insertQuery = badgeMetricLabelsQuery.insert(insertPayload)
  const { data, error } = await insertQuery.select().single()

  if (error) {
    const message = error.code === '23505' ? '이미 존재하는 metric_key입니다.' : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }
  return NextResponse.json({ label: data }, { status: 201 })
}
