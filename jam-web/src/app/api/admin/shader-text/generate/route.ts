import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { MAX_IMAGE_BYTES, parseShaderTextParams, serializeShaderTextParams } from '@/lib/admin/shaderTextDissolve'

/**
 * 쉐이더 텍스트 생성 — 배지 반영 API (티켓 20260912_1532)
 *
 * `20260902_1613`(액티비티 배지 이미지 생성기)이 확립한 구조를 그대로 따른다 — 이미지는
 * 어드민 브라우저가 캔버스로 이미 구워서 보낸다(서버 렌더 없음, 디졸브 에코는 Canvas 2D
 * 합성 트릭으로 만들어 서버(next/og·satori)로는 재현할 수 없다). 서버는 권한·대상 검증,
 * Storage 업로드, DB 반영만 한다.
 *
 * - 파일명을 배지 id로 고정하고 `upsert: true`로 덮어써 Storage에 고아 파일이 쌓이지 않는다.
 * - `image_gen_params`를 함께 저장해 재편집으로 같은 이미지를 다시 열 수 있게 한다.
 * - **대상 배지 타입 제한 없음** — activity/item/checkin 어디에나 적용할 수 있다(티켓 명시).
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
    params = parseShaderTextParams(JSON.parse(rawParams))
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
  // badgeId가 실제 존재하는 배지인지 확인한다 — 이 값이 뒤에서 Storage 경로에 그대로 들어가므로
  // 임의 문자열이 통과하면 안 된다. 타입은 제한하지 않는다(티켓 명시).
  const { data: badgeRow, error: badgeErr } = await supabase
    .from('badges')
    .select('id, name')
    .eq('id', badgeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (badgeErr) return NextResponse.json({ error: badgeErr.message }, { status: 500 })
  if (!badgeRow) return NextResponse.json({ error: '배지를 찾을 수 없습니다.' }, { status: 404 })
  const badge = badgeRow as { id: string; name: string }

  const png = Buffer.from(await file.arrayBuffer())
  const storagePath = `badges/shader-text/${badge.id}.png`
  const { error: uploadErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, png, { contentType: 'image/png', upsert: true })
  if (uploadErr) {
    return NextResponse.json({ error: `이미지 업로드 실패: ${uploadErr.message}` }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
  // 같은 경로를 upsert로 덮어쓰므로 CDN·브라우저 캐시가 옛 이미지를 계속 보여줄 수 있다.
  // 캐시 무효화용 쿼리스트링을 붙여 저장해 재생성 즉시 새 이미지가 보이도록 한다.
  const imageUrl = `${publicUrl}?v=${Date.now()}`

  const { error: updateErr } = await supabase
    .from('badges')
    .update({ image_url: imageUrl, image_gen_params: serializeShaderTextParams(params) })
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
