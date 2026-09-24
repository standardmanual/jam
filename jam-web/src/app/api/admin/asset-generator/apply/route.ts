import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { APPLY_GENERATED_IMAGE_BUCKET, MAX_APPLY_IMAGE_BYTES } from '@/lib/admin/applyGeneratedImageConstants'
import { convertBadgeImageToWebp } from '@/lib/admin/badgeImageWebp'

/**
 * 에셋 제너레이터 적용 탭 → 배지 반영 API (티켓 20260924_2200)
 *
 * `shader-lab/apply`(공용 `applyGeneratedImage` 함수)와 달리 이 라우트는 원본 PNG를 그대로
 * `image_url`에 걸지 않는다: 원본은 보관용으로만 올리고, sharp로 표시 규격(긴 변 400px,
 * PRD asset-generator/PRD.md §9)까지 축소한 WebP를 만들어 `image_url`에 반영하며
 * `image_source`도 함께 기록한다. 배지 전용 + 2단계 업로드 + 컬럼 2개 갱신이라
 * `applyGeneratedImage`(단일 PNG 업로드 + image_url 1개 갱신) 시그니처로는 표현할 수 없어
 * 그 함수는 그대로 두고(시그니처 불변) 이 라우트에 인라인으로 둔다.
 *
 * 저장 경로는 도구별 폴더 관례(shader-lab이 `{대상}/shader-lab/{id}.png`를 쓰는 것과 같은
 * 이유)를 따라 `badges/asset-generator/{badgeId}.{png|webp}`로 고정한다.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const badgeId = typeof form.get('badgeId') === 'string' ? String(form.get('badgeId')).trim() : ''
  if (!badgeId) return NextResponse.json({ error: '배지를 선택하세요.' }, { status: 400 })

  const file = form.get('image')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: '이미지 파일이 없습니다.' }, { status: 400 })
  }
  if (file.type !== 'image/png') {
    return NextResponse.json({ error: 'PNG 이미지만 반영할 수 있습니다.' }, { status: 400 })
  }
  if (file.size > MAX_APPLY_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `이미지가 너무 큽니다(${(file.size / 1024 / 1024).toFixed(1)}MB). 5MB 이하만 반영할 수 있습니다.` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data: badgeRow, error: findErr } = await supabase
    .from('badges')
    .select('id, name')
    .eq('id', badgeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!badgeRow) return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })

  const png = Buffer.from(await file.arrayBuffer())
  let webp: Buffer
  try {
    webp = await convertBadgeImageToWebp(png)
  } catch {
    return NextResponse.json({ error: '이미지를 WebP로 변환하지 못했습니다.' }, { status: 500 })
  }

  const pngPath = `badges/asset-generator/${badgeId}.png`
  const webpPath = `badges/asset-generator/${badgeId}.webp`

  const { error: pngUploadErr } = await supabase.storage
    .from(APPLY_GENERATED_IMAGE_BUCKET)
    .upload(pngPath, png, { contentType: 'image/png', upsert: true })
  if (pngUploadErr) {
    return NextResponse.json({ error: `원본 이미지 업로드 실패: ${pngUploadErr.message}` }, { status: 500 })
  }

  const { error: webpUploadErr } = await supabase.storage
    .from(APPLY_GENERATED_IMAGE_BUCKET)
    .upload(webpPath, webp, { contentType: 'image/webp', upsert: true })
  if (webpUploadErr) {
    return NextResponse.json({ error: `WebP 이미지 업로드 실패: ${webpUploadErr.message}` }, { status: 500 })
  }

  const {
    data: { publicUrl: pngPublicUrl },
  } = supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET).getPublicUrl(pngPath)
  const {
    data: { publicUrl: webpPublicUrl },
  } = supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET).getPublicUrl(webpPath)
  const originalUrl = pngPublicUrl
  const webpUrl = `${webpPublicUrl}?v=${Date.now()}`

  const { error: updateErr } = await supabase
    .from('badges')
    .update({ image_url: webpUrl, image_source: 'admin-generator' })
    .eq('id', badgeId)
  if (updateErr) {
    return NextResponse.json(
      { error: `이미지는 업로드됐지만 반영에 실패했습니다: ${updateErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    id: badgeId,
    name: badgeRow.name,
    originalUrl,
    webpUrl,
    webpBytes: webp.length,
  })
}
