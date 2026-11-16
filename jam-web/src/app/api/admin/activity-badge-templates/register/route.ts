import { after, NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { warmImageVariants } from '@/lib/images/warmImageVariants'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { APPLY_GENERATED_IMAGE_BUCKET, MAX_APPLY_IMAGE_BYTES } from '@/lib/admin/applyGeneratedImageConstants'
import { BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX, convertBadgeImageToWebp } from '@/lib/admin/badgeImageWebp'
import { parseTemplateBadgeParams } from '@/lib/admin/activityBadgeTemplate/templateParams'
import type { Json } from '@/types/database.generated'

/**
 * 템플릿으로 만든 액티비티 배지 이미지 등록 API (티켓 20261116_0728, 상위 20261115_2353)
 *
 * 브라우저가 구운 PNG(긴 변 1024px)를 받아 WebP로 바꿔 두 파일을 올리고 배지에 반영한다.
 * 저장 방식은 `asset-generator/apply`를 따르되, 다른 도구의 원본과 덮어쓰지 않도록 경로를
 * `badges/activity-template/{id}`로 따로 둔다. `image_source`는 CHECK 제약(마이그레이션 186) 때문에
 * 수동 제작 값 `'admin-generator'`를 쓰고, 어떤 도구인지는 `image_gen_params.kind`로 가린다.
 */

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return fail('권한이 없습니다.', 403)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail('요청 내용을 읽지 못했어요. 다시 시도해 주세요.', 400)
  }

  const badgeId = typeof form.get('badgeId') === 'string' ? String(form.get('badgeId')).trim() : ''
  if (!badgeId) return fail('배지를 골라 주세요.', 400)

  const rawParams = form.get('params')
  let params = null
  if (typeof rawParams === 'string') {
    try {
      params = parseTemplateBadgeParams(JSON.parse(rawParams))
    } catch {
      params = null
    }
  }
  if (!params) return fail('조정값을 읽지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.', 400)

  const file = form.get('image')
  if (!(file instanceof File) || file.size === 0 || file.type !== 'image/png') {
    return fail('PNG 이미지가 없어요. 다시 시도해 주세요.', 400)
  }
  if (file.size > MAX_APPLY_IMAGE_BYTES) return fail('이미지가 너무 커요. 5MB 이하만 등록할 수 있어요.', 400)

  const png = Buffer.from(await file.arrayBuffer())
  const sizeError = '이미지 크기가 맞지 않아요. 긴 변이 1024px인 이미지만 등록할 수 있어요.'
  try {
    const meta = await sharp(png).metadata()
    if (Math.max(meta.width ?? 0, meta.height ?? 0) !== BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX) {
      return fail(sizeError, 400)
    }
  } catch {
    return fail(sizeError, 400)
  }

  const supabase = createServiceClient()
  // badgeId가 Storage 경로에 그대로 들어가므로 실제 액티비티 배지인지 먼저 확인한다.
  const { data: badgeRow, error: badgeErr } = await supabase
    .from('badges')
    .select('id, name')
    .eq('id', badgeId)
    .eq('type', 'activity')
    .is('deleted_at', null)
    .maybeSingle()
  if (badgeErr) return fail('배지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.', 500)
  if (!badgeRow) return fail('액티비티 배지를 찾지 못했어요.', 404)
  const badge = badgeRow as { id: string; name: string }

  const saveError = '이미지를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
  let webp: Buffer
  try {
    webp = await convertBadgeImageToWebp(png)
  } catch {
    return fail(saveError, 500)
  }

  const pngPath = `badges/activity-template/${badge.id}.png`
  const webpPath = `badges/activity-template/${badge.id}.webp`
  const bucket = supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET)

  const { error: pngErr } = await bucket.upload(pngPath, png, { contentType: 'image/png', upsert: true })
  if (pngErr) return fail(saveError, 500)
  const { error: webpErr } = await bucket.upload(webpPath, webp, { contentType: 'image/webp', upsert: true })
  if (webpErr) return fail(saveError, 500)

  const originalUrl = bucket.getPublicUrl(pngPath).data.publicUrl
  const imageUrl = `${bucket.getPublicUrl(webpPath).data.publicUrl}?v=${Date.now()}`

  const { error: updateErr } = await supabase
    .from('badges')
    .update({ image_url: imageUrl, image_gen_params: params as unknown as Json, image_source: 'admin-generator' })
    .eq('id', badge.id)
  if (updateErr) return fail('이미지는 올렸지만 배지에 반영하지 못했어요. 잠시 후 다시 시도해 주세요.', 500)

  const origin = new URL(req.url).origin
  after(() => warmImageVariants(imageUrl, origin))

  return NextResponse.json({
    badgeId: badge.id,
    badgeName: badge.name,
    imageUrl,
    originalUrl,
    webpBytes: webp.length,
  })
}
