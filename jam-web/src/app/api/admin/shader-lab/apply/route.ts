import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { applyGeneratedImage, MAX_APPLY_IMAGE_BYTES } from '@/lib/admin/applyGeneratedImage'
import type { ApplyGeneratedImageTable } from '@/lib/admin/applyGeneratedImage'

// 쉐이더 랩 -> 배지/미션/컬렉션 적용 API (티켓 20260913_0414)
// 캔버스 PNG를 FormData로 받아 target(badge/mission/collection)에 따라 대상 테이블을 정하고,
// applyGeneratedImage 공용 함수로 Storage 업로드 + 이미지 컬럼 갱신을 수행한다.
// 경로는 도구별 분리 관례(shader-text가 badges/shader-text/{id}.png를 쓰는 것과 같은 이유)를
// 따라 {대상폴더}/shader-lab/{id}.png로 고정한다.
type ApplyTarget = 'badge' | 'mission' | 'collection'

const VALID_TARGETS: ApplyTarget[] = ['badge', 'mission', 'collection']

const TARGET_TABLE: Record<ApplyTarget, ApplyGeneratedImageTable> = {
  badge: `badges`,
  mission: `missions`,
  collection: `item_books`,
}

const TARGET_PATH_PREFIX: Record<ApplyTarget, string> = {
  badge: `badges/shader-lab`,
  mission: `missions/shader-lab`,
  collection: `itembooks/shader-lab`,
}

const TARGET_LABEL: Record<ApplyTarget, string> = {
  badge: `배지`,
  mission: `미션`,
  collection: `컬렉션`,
}

type ResolveTargetRowResult = { ok: true; name: string } | { ok: false; status: number; error: string }

async function resolveTargetRow(
  supabase: ReturnType<typeof createServiceClient>,
  target: ApplyTarget,
  id: string
): Promise<ResolveTargetRowResult> {
  if (target === 'badge') {
    const { data, error } = await supabase
      .from('badges')
      .select('id, name')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) return { ok: false, status: 500, error: error.message }
    if (!data) return { ok: false, status: 404, error: `배지를 찾을 수 없습니다.` }
    return { ok: true, name: data.name }
  }
  if (target === 'mission') {
    const { data, error } = await supabase.from('missions').select('id, title').eq('id', id).maybeSingle()
    if (error) return { ok: false, status: 500, error: error.message }
    if (!data) return { ok: false, status: 404, error: `미션을 찾을 수 없습니다.` }
    return { ok: true, name: data.title }
  }
  const { data, error } = await supabase.from('item_books').select('id, name').eq('id', id).maybeSingle()
  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 404, error: `컬렉션을 찾을 수 없습니다.` }
  return { ok: true, name: data.name }
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: `권한이 없습니다.` }, { status: 403 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: `요청 형식이 올바르지 않습니다.` }, { status: 400 })
  }

  const targetRaw = typeof form.get('target') === 'string' ? String(form.get('target')) : ''
  const target = (VALID_TARGETS as string[]).includes(targetRaw) ? (targetRaw as ApplyTarget) : null
  if (!target) return NextResponse.json({ error: `적용 대상 타입이 올바르지 않습니다.` }, { status: 400 })

  const id = typeof form.get('id') === 'string' ? String(form.get('id')).trim() : ''
  if (!id) return NextResponse.json({ error: `${TARGET_LABEL[target]}을(를) 선택하세요.` }, { status: 400 })

  const file = form.get('image')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: `이미지 파일이 없습니다.` }, { status: 400 })
  }
  if (file.type !== 'image/png') {
    return NextResponse.json({ error: `PNG 이미지만 반영할 수 있습니다.` }, { status: 400 })
  }
  if (file.size > MAX_APPLY_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `이미지가 너무 큽니다(${(file.size / 1024 / 1024).toFixed(1)}MB). 5MB 이하만 반영할 수 있습니다.` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const row = await resolveTargetRow(supabase, target, id)
  if (!row.ok) return NextResponse.json({ error: row.error }, { status: row.status })

  const png = Buffer.from(await file.arrayBuffer())
  const path = `${TARGET_PATH_PREFIX[target]}/${id}.png`
  const outcome = await applyGeneratedImage({ table: TARGET_TABLE[target], id, path, png })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })

  return NextResponse.json({ id, name: row.name, imageUrl: outcome.imageUrl, bytes: file.size })
}
