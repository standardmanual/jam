import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { buildComposition, parseStoredComposition } from '@/lib/admin/shaderLab/composition'

/** 쉐이더 랩 — 컴포지션 단건 조회/수정/삭제 API (티켓 20260912_1951) */

const MAX_NAME_LENGTH = 60

interface CompositionRow {
  id: string
  name: string
  scene_json: unknown
  created_at: string
  created_by: string | null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('shader_lab_compositions')
    .select('id, name, scene_json, created_at, created_by')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '컴포지션을 찾을 수 없습니다.' }, { status: 404 })

  const row = data as CompositionRow
  return NextResponse.json({
    composition: {
      id: row.id,
      name: row.name,
      layers: parseStoredComposition(row.scene_json),
      createdAt: row.created_at,
      createdBy: row.created_by,
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const name = typeof (body as { name?: unknown })?.name === 'string' ? (body as { name: string }).name.trim() : ''
  if (!name) return NextResponse.json({ error: '이름을 입력하세요.' }, { status: 400 })
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `이름은 ${MAX_NAME_LENGTH}자 이하로 입력하세요.` }, { status: 400 })
  }

  const layers = parseStoredComposition({ layers: (body as { layers?: unknown })?.layers })
  const composition = buildComposition(layers)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('shader_lab_compositions')
    .update({ name, scene_json: composition })
    .eq('id', id)
    .select('id, name, scene_json, created_at, created_by')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '컴포지션을 찾을 수 없습니다.' }, { status: 404 })

  const row = data as CompositionRow
  return NextResponse.json({ composition: { id: row.id, name: row.name, createdAt: row.created_at, createdBy: row.created_by } })
}

/** 하드 삭제(`shader_text_presets` 전례와 동일 — 운영 편의 데이터라 소프트 삭제 불필요). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()
  const { error } = await supabase.from('shader_lab_compositions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
