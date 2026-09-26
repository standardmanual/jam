import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser, requireAdminRead } from '@/lib/admin/auth'
import { APPLY_GENERATED_IMAGE_BUCKET } from '@/lib/admin/applyGeneratedImageConstants'
import { isSafePresetPathSegment } from '@/lib/admin/presetStoragePath'
import { toAssetPreset, type AssetPresetRow } from '@/lib/asset-generator'

/**
 * 에셋 제너레이터 — 프리셋 단건 조회/삭제 API (티켓 20260924_2159)
 * 조회(GET)는 `x-admin-read-token`으로도 호출할 수 있다(티켓 20260926_1203). 삭제(DELETE)는 세션 인증만 받는다.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('asset_presets')
    .select('id, name, target_type, stage_ratio, layers, created_by, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '프리셋을 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({ preset: toAssetPreset(data as AssetPresetRow) })
}

/**
 * 프리셋 삭제(하드 삭제, 소프트 삭제 불필요 — `shader_lab_compositions` 전례와 동일). 저장소
 * 폴더(`asset-generator/presets/{id}/`)의 파일을 먼저 지우고, 그 뒤 테이블 행을 지운다 —
 * 순서를 반대로 하면 스토리지 삭제가 실패했을 때 재시도할 방법이 없어(행이 이미 없어 화면
 * 목록에서 사라진다) orphan 파일이 영원히 남는다.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  const { id } = await params
  // URL의 id가 스토리지 폴더 경로에 그대로 들어가므로 형식이 틀리면 list·remove 전에 거절한다(티켓 20260926_0201).
  if (!isSafePresetPathSegment(id)) {
    return NextResponse.json({ error: '프리셋 ID 형식이 올바르지 않습니다.' }, { status: 400 })
  }
  const supabase = createServiceClient()
  const folderPath = `asset-generator/presets/${id}`

  const { data: files, error: listErr } = await supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET).list(folderPath)
  if (listErr) return NextResponse.json({ error: `이미지 목록 조회 실패: ${listErr.message}` }, { status: 500 })

  if (files && files.length > 0) {
    const paths = files.map((file) => `${folderPath}/${file.name}`)
    const { error: removeErr } = await supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET).remove(paths)
    if (removeErr) return NextResponse.json({ error: `이미지 삭제 실패: ${removeErr.message}` }, { status: 500 })
  }

  const { error } = await supabase.from('asset_presets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
