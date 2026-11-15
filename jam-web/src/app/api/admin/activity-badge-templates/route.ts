/**
 * GET /api/admin/activity-badge-templates — 분류 4개의 템플릿 목록 (티켓 20261116_0234)
 * 등록되지 않은 분류도 항상 포함한다.
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { TEMPLATE_CLASS_KEYS, toTemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없어요.' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('activity_badge_templates')
    .select('class_key, svg, slots, updated_at, updated_by')
  if (error) {
    return NextResponse.json(
      { error: '템플릿 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }
  const byKey = new Map((data ?? []).map((r) => [r.class_key, r]))
  return NextResponse.json({
    templates: TEMPLATE_CLASS_KEYS.map((k) => toTemplateItem(k, byKey.get(k))),
  })
}
