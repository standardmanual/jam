import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import {
  MAX_IMAGE_BYTES,
  parseActivityBadgeImageParams,
  serializeActivityBadgeImageParams,
} from '@/lib/admin/activityBadgeImage'

/**
 * 액티비티 배지 이미지 반영 API (티켓 20260902_1613)
 *
 * 이미지는 **어드민 브라우저가 캔버스로 이미 구워서** 보낸다(서버 렌더 없음 — 블롭 배경과
 * 글래스 판은 next/og·satori로 그릴 수 없다). 서버가 하는 일은 권한·대상 검증, Storage 업로드,
 * DB 반영 세 가지다.
 *
 * `/api/admin/badge-image/generate`(체크인)가 이미 쓰는 구조를 그대로 따른다:
 * - 파일명을 배지 id로 **고정**하고 `upsert: true`로 덮어써 Storage에 고아 파일이 쌓이지 않는다
 *   (랜덤 파일명을 쓰는 `/api/admin/upload-image`를 재사용하지 않는 이유).
 * - Storage는 배포와 무관하게 즉시 서빙되므로 업로드 직후 그 자리에서 `image_url`을 UPDATE해도
 *   "DB부터 갱신해 이미지가 깨지는" 순서 문제(20260824_020)가 생기지 않는다.
 *
 * `image_gen_params`를 함께 저장해 재편집으로 같은 이미지를 다시 열 수 있게 한다 —
 * 특히 배경의 **정지 위상(phase)** 이 없으면 같은 프레임을 재현할 수 없다.
 */

const STORAGE_BUCKET = 'images'

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

  const rawParams = form.get('params')
  if (typeof rawParams !== 'string') {
    return NextResponse.json({ error: '저작 파라미터가 없습니다.' }, { status: 400 })
  }
  let params
  try {
    params = parseActivityBadgeImageParams(JSON.parse(rawParams))
  } catch {
    params = null
  }
  if (!params) {
    return NextResponse.json({ error: '저작 파라미터를 해석하지 못했습니다.' }, { status: 400 })
  }

  const file = form.get('image')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: '이미지 파일이 없습니다.' }, { status: 400 })
  }
  if (file.type !== 'image/png') {
    return NextResponse.json({ error: 'PNG 이미지만 반영할 수 있습니다.' }, { status: 400 })
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `이미지가 너무 큽니다(${(file.size / 1024 / 1024).toFixed(1)}MB). 5MB 이하만 반영할 수 있습니다.` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  // badgeId가 실제 존재하는 액티비티 배지인지 확인한다 — 이 값이 뒤에서 Storage 경로
  // (`badges/activity/{id}.png`)에 그대로 들어가므로 임의 문자열이 통과하면 안 된다.
  const { data: badgeRow, error: badgeErr } = await supabase
    .from('badges')
    .select('id, name')
    .eq('id', badgeId)
    .eq('type', 'activity')
    .is('deleted_at', null)
    .maybeSingle()
  if (badgeErr) return NextResponse.json({ error: badgeErr.message }, { status: 500 })
  if (!badgeRow) return NextResponse.json({ error: '액티비티 배지를 찾을 수 없습니다.' }, { status: 404 })
  const badge = badgeRow as { id: string; name: string }

  const png = Buffer.from(await file.arrayBuffer())
  const storagePath = `badges/activity/${badge.id}.png`
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, png, { contentType: 'image/png', upsert: true })
  if (uploadErr) {
    return NextResponse.json({ error: `이미지 업로드 실패: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  // 같은 경로를 upsert로 덮어쓰므로 CDN·브라우저 캐시가 옛 이미지를 계속 보여줄 수 있다.
  // 캐시 무효화용 쿼리스트링을 붙여 저장해 재생성 즉시 새 이미지가 보이도록 한다.
  const imageUrl = `${publicUrl}?v=${Date.now()}`

  const { error: updateErr } = await supabase
    .from('badges')
    .update({ image_url: imageUrl, image_gen_params: serializeActivityBadgeImageParams(params) })
    .eq('id', badge.id)
  if (updateErr) {
    return NextResponse.json(
      { error: `이미지는 업로드됐지만 배지 반영에 실패했습니다: ${updateErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    badgeId: badge.id,
    badgeName: badge.name,
    imageUrl,
    bytes: file.size,
  })
}
