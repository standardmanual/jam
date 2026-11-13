import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { hexToRgb } from '@/lib/admin/badgeImageGenerator/prompt'

/** 아이템 배지 이미지 생성기 프리셋 관리 (티켓 20261113_1131 1번) */

const VERSIONED_FIELDS = ['composition_text', 'forbid_text', 'model', 'negative_prompt', 'background_color', 'style_id'] as const
type VersionedField = (typeof VERSIONED_FIELDS)[number]

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined
}

function validHex(hex: string): boolean {
  try {
    hexToRgb(hex)
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()

  const { data: presets, error } = await supabase
    .from('badge_image_presets')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: applied, error: appliedErr } = await supabase
    .from('badge_image_generations')
    .select('preset_id')
    .eq('status', 'applied')
    .limit(10000)
  if (appliedErr) return NextResponse.json({ error: appliedErr.message }, { status: 500 })

  const counts = new Map<string, number>()
  for (const g of applied ?? []) {
    if (g.preset_id) counts.set(g.preset_id, (counts.get(g.preset_id) ?? 0) + 1)
  }
  return NextResponse.json({
    presets: (presets ?? []).map((p) => ({ ...p, appliedCount: counts.get(p.id) ?? 0 })),
  })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 })

  const name = str(body.name)
  const styleId = str(body.style_id)
  const composition = str(body.composition_text)
  const forbid = str(body.forbid_text)
  if (!name || !styleId || !composition || !forbid) {
    return NextResponse.json({ error: '이름·style_id·고정 문장 2개는 필수입니다.' }, { status: 400 })
  }
  const bg = str(body.background_color)
  if (bg !== undefined && !validHex(bg)) {
    return NextResponse.json({ error: '배경색은 hex 형식이어야 합니다.' }, { status: 400 })
  }

  const model = str(body.model)
  const negative = str(body.negative_prompt)
  const { data, error } = await createServiceClient()
    .from('badge_image_presets')
    .insert({
      name,
      style_id: styleId,
      composition_text: composition,
      forbid_text: forbid,
      ...(model ? { model } : {}),
      ...(negative !== undefined ? { negative_prompt: negative } : {}),
      ...(bg ? { background_color: bg } : {}),
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preset: { ...data, appliedCount: 0 } })
}

export async function PATCH(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const id = body ? str(body.id) : undefined
  if (!body || !id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { data: current, error: curErr } = await supabase
    .from('badge_image_presets')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: '프리셋을 찾을 수 없습니다.' }, { status: 404 })

  const patch: Partial<Record<VersionedField, string>> = {}
  let versionChanged = false
  for (const f of VERSIONED_FIELDS) {
    const v = str(body[f])
    if (v === undefined) continue
    if ((f === 'composition_text' || f === 'forbid_text' || f === 'style_id' || f === 'model') && !v) {
      return NextResponse.json({ error: `${f} 값은 비울 수 없습니다.` }, { status: 400 })
    }
    if (f === 'background_color' && !validHex(v)) {
      return NextResponse.json({ error: '배경색은 hex 형식이어야 합니다.' }, { status: 400 })
    }
    if (v !== current[f]) {
      patch[f] = v
      versionChanged = true
    }
  }
  const name = str(body.name)
  const isActive = typeof body.is_active === 'boolean' ? body.is_active : undefined

  const { data, error } = await supabase
    .from('badge_image_presets')
    .update({
      ...patch,
      ...(name ? { name } : {}),
      ...(isActive !== undefined ? { is_active: isActive } : {}),
      ...(versionChanged ? { version: current.version + 1 } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preset: data })
}
