import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { APPLY_GENERATED_IMAGE_BUCKET } from '@/lib/admin/applyGeneratedImageConstants'
import { DescriptionError, ensureDescription } from '@/lib/admin/badgeImageGenerator/describe'
import { buildRecraftRequest } from '@/lib/admin/badgeImageGenerator/prompt'
import { downloadImage, generateCandidates } from '@/lib/admin/badgeImageGenerator/recraft'
import { candidateTouchesEdge } from '@/lib/admin/badgeImageGenerator/normalize'

export const maxDuration = 120

/** Recraft 후보 2장 생성 (티켓 20261113_1131 4번) */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as {
    bookId?: string
    itemName?: string
    presetId?: string
    feedback?: string
  } | null
  if (!body?.bookId || !body.itemName || !body.presetId) {
    return NextResponse.json({ error: 'bookId, itemName, presetId가 필요합니다.' }, { status: 400 })
  }
  const { bookId, itemName, presetId } = body
  const supabase = createServiceClient()

  const { data: preset, error: presetErr } = await supabase
    .from('badge_image_presets')
    .select('*')
    .eq('id', presetId)
    .maybeSingle()
  if (presetErr) return NextResponse.json({ error: presetErr.message }, { status: 500 })
  if (!preset) return NextResponse.json({ error: '프리셋을 찾을 수 없습니다.' }, { status: 404 })

  let descriptionEn: string
  try {
    const d = await ensureDescription(supabase, { bookId, itemName, feedback: body.feedback })
    descriptionEn = d.descriptionEn
  } catch (e) {
    if (e instanceof DescriptionError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e instanceof Error ? e.message : '묘사 작성에 실패했습니다.' }, { status: 500 })
  }

  let requestBody
  try {
    requestBody = buildRecraftRequest(descriptionEn, preset)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '요청을 만들지 못했습니다.' }, { status: 400 })
  }

  // request_json에는 API 키가 들어갈 자리가 없다 — 키는 recraft.ts 헤더에서만 쓴다
  const { data: gen, error: genErr } = await supabase
    .from('badge_image_generations')
    .insert({
      item_book_id: bookId,
      item_name: itemName,
      preset_id: preset.id,
      preset_version: preset.version,
      prompt: requestBody.prompt,
      request_json: JSON.parse(JSON.stringify(requestBody)),
      feedback: body.feedback?.trim() || null,
      created_by: admin.id,
      status: 'generated',
    })
    .select('id')
    .single()
  if (genErr || !gen) return NextResponse.json({ error: genErr?.message ?? '기록을 만들지 못했습니다.' }, { status: 500 })

  try {
    const remoteUrls = (await generateCandidates(requestBody)).slice(0, 2)
    const urls: string[] = []
    const touchesEdge: boolean[] = []
    for (let i = 0; i < remoteUrls.length; i++) {
      const png = await downloadImage(remoteUrls[i])
      const path = `badge-image-generator/${bookId}/${gen.id}/candidate-${i}.png`
      const { error: upErr } = await supabase.storage
        .from(APPLY_GENERATED_IMAGE_BUCKET)
        .upload(path, png, { contentType: 'image/png', upsert: true })
      if (upErr) throw new Error(`후보 업로드 실패: ${upErr.message}`)
      urls.push(supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl)
      touchesEdge.push(await candidateTouchesEdge(png, preset.background_color))
    }
    const { error: updErr } = await supabase
      .from('badge_image_generations')
      .update({ candidate_urls: urls })
      .eq('id', gen.id)
    if (updErr) throw new Error(updErr.message)
    return NextResponse.json({
      generationId: gen.id,
      descriptionEn,
      prompt: requestBody.prompt,
      candidates: urls.map((url, i) => ({ url, touchesEdge: touchesEdge[i] })),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '이미지 생성에 실패했습니다.'
    await supabase.from('badge_image_generations').update({ status: 'failed', error: message }).eq('id', gen.id)
    return NextResponse.json({ error: message, generationId: gen.id }, { status: 502 })
  }
}
