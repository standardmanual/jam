/**
 * PUT·DELETE /api/admin/activity-badge-templates/[classKey] (티켓 20261116_0234)
 * PUT: SVG를 정화하고 이름·값 자리를 읽어 저장한다. DELETE: 그 분류의 템플릿을 지운다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { isTemplateClassKey, toTemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import {
  TEMPLATE_SVG_MAX_BYTES,
  TemplateSvgError,
  readTemplateSlots,
  sanitizeTemplateSvg,
} from '@/lib/admin/activityBadgeTemplate/templateSvg'

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
  const svgRaw = (body as { svg?: unknown } | null)?.svg
  if (typeof svgRaw !== 'string' || svgRaw.trim() === '') {
    return bad('SVG 내용이 비어 있어요. 피그마에서 내보낸 SVG를 올려 주세요.')
  }
  if (Buffer.byteLength(svgRaw, 'utf8') > TEMPLATE_SVG_MAX_BYTES) {
    return bad('SVG가 너무 커요. 1MB 이하로 줄여서 다시 올려 주세요.')
  }

  let svg: string
  let removed: string[]
  let slots: ReturnType<typeof readTemplateSlots>
  try {
    ;({ svg, removed } = sanitizeTemplateSvg(svgRaw))
    slots = readTemplateSlots(svg)
  } catch (e) {
    if (e instanceof TemplateSvgError) {
      return bad('SVG를 읽지 못했어요. 피그마에서 SVG로 다시 내보내 주세요.')
    }
    throw e
  }

  for (const [slotName, label] of [['name', '이름'], ['value', '값']] as const) {
    const slot = slots[slotName]
    if (!slot.found) {
      return bad(
        `${label} 자리를 찾지 못했어요. 피그마에서 ${label} 글자의 레이어 이름을 ${slotName}으로 바꾸고, 글자를 윤곽선으로 바꾸지 않은 채 다시 내보내 주세요.`
      )
    }
    if (!slot.isText) {
      return bad(
        `${label} 자리가 글자가 아니에요. 피그마에서 ${label} 글자를 윤곽선으로 바꾸지 않은 채 다시 내보내 주세요.`
      )
    }
  }

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
