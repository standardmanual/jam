import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { MAX_PRESET_NAME_LENGTH, parseShaderTextStyle, serializeShaderTextStyle } from '@/lib/admin/shaderTextDissolve'

/**
 * 쉐이더 텍스트 생성기 — 스타일 프리셋 목록/저장 API (티켓 20260912_1532)
 *
 * `shader_text_presets`(마이그레이션 167) 신규 테이블. 여러 관리자·PC 간 공유하기 위해
 * (기존 `localStorage` 방식이 아니라) DB에 저장한다. 프리셋은 **스타일 값만** 담는다 —
 * 문구(`text`)는 빼서 프리셋을 불러올 때마다 입력해 둔 문구가 지워지지 않게 한다.
 */

interface PresetRow {
  id: string
  name: string
  params: unknown
  created_at: string
  created_by: string | null
}

function toPreset(row: PresetRow) {
  return {
    id: row.id,
    name: row.name,
    style: parseShaderTextStyle(row.params),
    createdAt: row.created_at,
    createdBy: row.created_by,
  }
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('shader_text_presets')
    .select('id, name, params, created_at, created_by')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const presets = ((data ?? []) as PresetRow[]).map(toPreset).filter((p) => p.style !== null)
  return NextResponse.json({ presets })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const name = typeof (body as { name?: unknown })?.name === 'string' ? (body as { name: string }).name.trim() : ''
  if (!name) return NextResponse.json({ error: '프리셋 이름을 입력하세요.' }, { status: 400 })
  if (name.length > MAX_PRESET_NAME_LENGTH) {
    return NextResponse.json({ error: `프리셋 이름은 ${MAX_PRESET_NAME_LENGTH}자 이하로 입력하세요.` }, { status: 400 })
  }

  const style = parseShaderTextStyle((body as { style?: unknown })?.style)
  if (!style) return NextResponse.json({ error: '스타일 값을 해석하지 못했습니다.' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('shader_text_presets')
    .insert({ name, params: serializeShaderTextStyle(style), created_by: admin.email })
    .select('id, name, params, created_at, created_by')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ preset: toPreset(data as PresetRow) })
}
