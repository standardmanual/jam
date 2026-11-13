import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { APPLY_GENERATED_IMAGE_BUCKET } from '@/lib/admin/applyGeneratedImageConstants'
import { planImageEdit } from '@/lib/admin/badgeImageGenerator/claude'
import { buildMaskPng, EditPlanError } from '@/lib/admin/badgeImageGenerator/edit'
import { candidateTouchesEdge } from '@/lib/admin/badgeImageGenerator/normalize'
import { downloadImage, eraseRegion, imageToImage, inpaint, outpaint } from '@/lib/admin/badgeImageGenerator/recraft'

export const maxDuration = 120

const INSTRUCTION_MAX = 300

/**
 * 후처리 요청 (티켓 20261113_1332)
 * Claude가 편집 계획(어떤 Recraft 도구를 어디에)을 정하고, 실제 편집은 Recraft 편집 API가 한다.
 * 결과는 kind='edit' 생성 기록 한 줄로 남겨 기존 적용·되돌리기 흐름을 그대로 쓴다.
 */
export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as {
    generationId?: string
    index?: number
    instruction?: string
  } | null
  const instruction = body?.instruction?.trim() ?? ''
  if (!body?.generationId || typeof body.index !== 'number' || !Number.isInteger(body.index) || body.index < 0) {
    return NextResponse.json({ error: 'generationId와 index가 필요합니다.' }, { status: 400 })
  }
  if (instruction.length < 1 || instruction.length > INSTRUCTION_MAX) {
    return NextResponse.json({ error: `후처리 요청은 1~${INSTRUCTION_MAX}자로 적어 주세요.` }, { status: 400 })
  }
  const supabase = createServiceClient()

  const { data: parent, error: parentErr } = await supabase
    .from('badge_image_generations')
    .select('*')
    .eq('id', body.generationId)
    .maybeSingle()
  if (parentErr) return NextResponse.json({ error: parentErr.message }, { status: 500 })
  if (!parent) return NextResponse.json({ error: '생성 기록을 찾을 수 없습니다.' }, { status: 404 })
  if (parent.status === 'failed') {
    return NextResponse.json({ error: '실패한 기록은 후처리할 수 없습니다.' }, { status: 400 })
  }
  const sourceUrl = parent.candidate_urls[body.index]
  if (!sourceUrl) return NextResponse.json({ error: '해당 번호의 후보가 없습니다.' }, { status: 400 })

  const [{ data: preset, error: presetErr }, { data: saved, error: savedErr }] = await Promise.all([
    supabase.from('badge_image_presets').select('*').eq('id', parent.preset_id ?? '').maybeSingle(),
    supabase
      .from('badge_image_item_prompts')
      .select('description_en')
      .eq('item_book_id', parent.item_book_id)
      .eq('item_name', parent.item_name)
      .maybeSingle(),
  ])
  if (presetErr) return NextResponse.json({ error: presetErr.message }, { status: 500 })
  if (savedErr) return NextResponse.json({ error: savedErr.message }, { status: 500 })
  if (!preset) return NextResponse.json({ error: '프리셋을 찾을 수 없습니다.' }, { status: 404 })
  const descriptionEn = saved?.description_en ?? ''

  let source: Buffer
  let width: number
  let height: number
  try {
    source = await downloadImage(sourceUrl)
    const meta = await sharp(source).metadata()
    if (!meta.width || !meta.height) throw new Error('이미지 크기를 읽지 못했습니다.')
    width = meta.width
    height = meta.height
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '원본 이미지를 읽지 못했습니다.' }, { status: 502 })
  }

  let plan
  try {
    plan = await planImageEdit(source, instruction, descriptionEn)
  } catch (e) {
    if (e instanceof EditPlanError) {
      return NextResponse.json({ error: 'plan_invalid', detail: e.message }, { status: 422 })
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : '편집 계획을 만들지 못했습니다.' }, { status: 502 })
  }

  const editPrompt = plan.operation === 'erase' ? '(erase)' : plan.prompt
  // request_json에는 엔드포인트와 필드만 둔다. 이미지·API 키는 넣지 않는다
  const requestJson = {
    endpoint: { erase: 'eraseRegion', inpaint: 'inpaint', outpaint: 'outpaint', restyle: 'imageToImage' }[plan.operation],
    fields: {
      ...(plan.operation !== 'outpaint' && plan.operation !== 'restyle' ? { boxes: plan.boxes } : {}),
      ...(plan.operation !== 'erase' ? { prompt: plan.prompt } : {}),
      ...(plan.operation === 'outpaint' ? { zoom_out_percentage: Math.round(plan.zoom_out) } : {}),
      ...(plan.operation === 'restyle' ? { strength: plan.strength } : {}),
    },
  }
  const newId = randomUUID()
  const { error: insErr } = await supabase.from('badge_image_generations').insert({
    id: newId,
    item_book_id: parent.item_book_id,
    item_name: parent.item_name,
    preset_id: parent.preset_id,
    preset_version: parent.preset_version,
    prompt: editPrompt,
    request_json: requestJson,
    created_by: admin.id,
    status: 'generated',
    kind: 'edit',
    parent_generation_id: parent.id,
    edit_instruction: instruction,
    edit_plan: JSON.parse(JSON.stringify(plan)),
  })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  try {
    let result: Buffer
    if (plan.operation === 'erase') {
      result = await eraseRegion(source, await buildMaskPng(width, height, plan.boxes))
    } else if (plan.operation === 'inpaint') {
      result = await inpaint(source, await buildMaskPng(width, height, plan.boxes), plan.prompt, preset)
    } else if (plan.operation === 'outpaint') {
      result = await outpaint(source, plan.prompt, plan.zoom_out, preset)
    } else {
      result = await imageToImage(source, plan.prompt, plan.strength, preset)
    }
    const path = `badge-image-generator/${parent.item_book_id}/${newId}/candidate-0.png`
    const bucket = supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET)
    const { error: upErr } = await bucket.upload(path, result, { contentType: 'image/png', upsert: true })
    if (upErr) throw new Error(`후보 업로드 실패: ${upErr.message}`)
    const url = bucket.getPublicUrl(path).data.publicUrl
    const touchesEdge = await candidateTouchesEdge(result, preset.background_color)
    const { error: updErr } = await supabase
      .from('badge_image_generations')
      .update({ candidate_urls: [url] })
      .eq('id', newId)
    if (updErr) throw new Error(updErr.message)
    return NextResponse.json({
      generationId: newId,
      candidates: [{ url, touchesEdge }],
      plan: { operation: plan.operation, reason_ko: plan.reason_ko },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '후처리에 실패했습니다.'
    await supabase.from('badge_image_generations').update({ status: 'failed', error: message }).eq('id', newId)
    return NextResponse.json({ error: message, generationId: newId }, { status: 502 })
  }
}
