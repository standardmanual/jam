import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { APPLY_GENERATED_IMAGE_BUCKET } from '@/lib/admin/applyGeneratedImageConstants'
import { convertBadgeImageToWebp } from '@/lib/admin/badgeImageWebp'
import { checkImageHasNoText } from '@/lib/admin/badgeImageGenerator/claude'
import { itemSlug } from '@/lib/admin/badgeImageGenerator/items'
import { normalizeBadgeImage } from '@/lib/admin/badgeImageGenerator/normalize'
import { downloadImage, removeBackground } from '@/lib/admin/badgeImageGenerator/recraft'

export const maxDuration = 120

const ITEM_ROW_COUNT = 4

/**
 * 후보 적용 (티켓 20261113_1131 5번)
 * 순서: 배경 제거 → 규격 후처리 → 글자 검사 → (여기서부터 쓰기) 업로드 → 4행 갱신 → 기록.
 * 글자 검사에 실패하면 DB·저장소를 건드리지 않고 409로 멈춘다.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { generationId?: string; index?: number } | null
  if (!body?.generationId || (body.index !== 0 && body.index !== 1)) {
    return NextResponse.json({ error: 'generationId와 index(0 또는 1)가 필요합니다.' }, { status: 400 })
  }
  const index = body.index
  const supabase = createServiceClient()

  const { data: gen, error: genErr } = await supabase
    .from('badge_image_generations')
    .select('*')
    .eq('id', body.generationId)
    .maybeSingle()
  if (genErr) return NextResponse.json({ error: genErr.message }, { status: 500 })
  if (!gen) return NextResponse.json({ error: '생성 기록을 찾을 수 없습니다.' }, { status: 404 })
  if (gen.status !== 'generated') {
    return NextResponse.json({ error: '적용할 수 없는 상태의 기록입니다.' }, { status: 409 })
  }
  const candidateUrl = gen.candidate_urls[index]
  if (!candidateUrl) return NextResponse.json({ error: '해당 번호의 후보가 없습니다.' }, { status: 400 })

  let png: Buffer
  try {
    const original = await downloadImage(candidateUrl)
    const transparent = await removeBackground(original)
    png = await normalizeBadgeImage(transparent)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '이미지 처리에 실패했습니다.' }, { status: 502 })
  }

  if (!(await checkImageHasNoText(png))) {
    return NextResponse.json({ error: 'text_detected' }, { status: 409 })
  }

  // ---- 여기부터 쓰기 ----
  let webp: Buffer
  try {
    webp = await convertBadgeImageToWebp(png)
  } catch {
    return NextResponse.json({ error: '이미지를 WebP로 변환하지 못했습니다.' }, { status: 500 })
  }

  const base = `badges/item/${gen.item_book_id}/${itemSlug(gen.item_name)}-${gen.id}`
  const pngPath = `${base}.png`
  const webpPath = `${base}.webp`
  const bucket = supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET)
  const { error: pngErr } = await bucket.upload(pngPath, png, { contentType: 'image/png', upsert: true })
  if (pngErr) return NextResponse.json({ error: `원본 이미지 업로드 실패: ${pngErr.message}` }, { status: 500 })
  const { error: webpErr } = await bucket.upload(webpPath, webp, { contentType: 'image/webp', upsert: true })
  if (webpErr) return NextResponse.json({ error: `WebP 이미지 업로드 실패: ${webpErr.message}` }, { status: 500 })
  const webpUrl = `${bucket.getPublicUrl(webpPath).data.publicUrl}?v=${Date.now()}`

  const { data: rows, error: rowsErr } = await supabase
    .from('badges')
    .select('id, image_url')
    .eq('item_book_id', gen.item_book_id)
    .eq('name', gen.item_name)
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  if ((rows ?? []).length !== ITEM_ROW_COUNT) {
    return NextResponse.json(
      { error: `아이템 배지가 ${ITEM_ROW_COUNT}행이 아닙니다(${(rows ?? []).length}행). 반영하지 않았습니다.` },
      { status: 500 }
    )
  }
  const previousImageUrl = rows!.find((r) => r.image_url)?.image_url ?? null

  const { data: updated, error: updErr } = await supabase
    .from('badges')
    .update({ image_url: webpUrl, image_source: 'admin-generator' })
    .in(
      'id',
      rows!.map((r) => r.id)
    )
    .select('id')
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  if ((updated ?? []).length !== ITEM_ROW_COUNT) {
    return NextResponse.json({ error: `${ITEM_ROW_COUNT}행 갱신이 완료되지 않았습니다.` }, { status: 500 })
  }

  const { error: recErr } = await supabase
    .from('badge_image_generations')
    .update({
      status: 'applied',
      applied_index: index,
      applied_url: webpUrl,
      previous_image_url: previousImageUrl,
      applied_at: new Date().toISOString(),
    })
    .eq('id', gen.id)
  if (recErr) {
    return NextResponse.json({ error: `이미지는 반영됐지만 기록에 실패했습니다: ${recErr.message}` }, { status: 500 })
  }
  return NextResponse.json({ imageUrl: webpUrl, previousImageUrl })
}
