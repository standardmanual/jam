/**
 * PUT·DELETE /api/admin/activity-badge-templates/[classKey] (티켓 20261116_0234)
 * PUT: SVG를 정화하고 이름·값 자리를 읽어 저장한다. DELETE: 그 분류의 템플릿을 지운다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { isTemplateClassKey, toTemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import { validateTemplateSvg } from '@/lib/admin/activityBadgeTemplate/validateTemplate'

type Ctx = { params: Promise<{ classKey: string }> }

const bad = (error: string) => NextResponse.json({ error }, { status: 400 })
const BAD_CLASS = '분류를 알 수 없어요. 운동 수치, 쌓은 날, 이어 온 날, 횟수와 양 중에서 골라 주세요.'

export async function PUT(req: NextRequest, { params }: Ctx) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없어요.' }, { status: 403 })

  const { classKey } = await params
  if (!isTemplateClassKey(classKey)) return bad(BAD_CLASS)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return bad('요청 내용을 읽지 못했어요. 템플릿 SVG를 다시 올려 주세요.')
  }
  const result = validateTemplateSvg((body as { svg?: unknown } | null)?.svg)
  if (!result.ok) return bad(result.error)
  const { svg, removed, slots } = result

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('activity_badge_templates')
    .upsert(
      {
        class_key: classKey,
        svg,
        slots: JSON.parse(JSON.stringify(slots)),
        updated_by: admin.email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'class_key' }
    )
    .select('class_key, svg, slots, updated_at, updated_by')
    .single()
  if (error || !data) {
    return NextResponse.json(
      { error: '템플릿을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }
  return NextResponse.json({ template: toTemplateItem(classKey, data), removed })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없어요.' }, { status: 403 })

  const { classKey } = await params
  if (!isTemplateClassKey(classKey)) return bad(BAD_CLASS)

  const supabase = createServiceClient()
  const { error } = await supabase.from('activity_badge_templates').delete().eq('class_key', classKey)
  if (error) {
    return NextResponse.json(
      { error: '템플릿을 지우지 못했어요. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true })
}
