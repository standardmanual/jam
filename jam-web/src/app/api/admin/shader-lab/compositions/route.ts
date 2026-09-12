import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { buildComposition, parseStoredComposition } from '@/lib/admin/shaderLab/composition'

/**
 * 쉐이더 랩 — 컴포지션 목록/저장 API (티켓 20260912_1951)
 *
 * 1차는 최소 지속성만 갖춘다(레이어 스택 + 파라미터, 작업 유실 방지 수준). 정식 저장 스키마는
 * 3차(배지·컬렉션·미션 자동 등록)에서 확정한다 — `shader_lab_compositions` 마이그레이션 참고.
 */

const MAX_NAME_LENGTH = 60

interface CompositionRow {
  id: string
  name: string
  scene_json: unknown
  created_at: string
  created_by: string | null
}

function toSummary(row: CompositionRow) {
  return { id: row.id, name: row.name, createdAt: row.created_at, createdBy: row.created_by }
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('shader_lab_compositions')
    .select('id, name, scene_json, created_at, created_by')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const compositions = ((data ?? []) as CompositionRow[]).map(toSummary)
  return NextResponse.json({ compositions })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

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
    .insert({ name, scene_json: composition, created_by: admin.email })
    .select('id, name, scene_json, created_at, created_by')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ composition: toSummary(data as CompositionRow) })
}
