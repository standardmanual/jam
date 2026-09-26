import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser, requireAdminRead } from '@/lib/admin/auth'
import { APPLY_GENERATED_IMAGE_BUCKET, MAX_APPLY_IMAGE_BYTES } from '@/lib/admin/applyGeneratedImageConstants'
import { isSafePresetPathSegment } from '@/lib/admin/presetStoragePath'
import {
  isPresetTargetType,
  serializePresetLayers,
  toAssetPresetSummary,
  type AssetPresetSummaryRow,
  type OverlayLayerConfig,
  type PresetTargetType,
  type StageRatio,
} from '@/lib/asset-generator'
import type { Json } from '@/types/database.generated'

/**
 * 에셋 제너레이터 — 프리셋 목록/저장 API (티켓 20260924_2159)
 *
 * `shader-lab`의 컴포지션 API(`/api/admin/shader-lab/compositions`) 관례를 참고하되 별도
 * 테이블·별도 라우트로 둔다. 이미지 원본은 FormData로 함께 받아 저장소(`images` 버킷)의
 * `asset-generator/presets/{presetId}/{layerId}.{png|svg}` 경로에 올린다(적용 도구
 * `applyGeneratedImage.ts`와 같은 버킷·업로드 방식, 참고만 하고 그 함수는 재사용하지 않는다 —
 * 그 함수는 대상 테이블이 badges/missions/item_books 셋으로 고정돼 있어 이 용도에 맞지 않는다).
 *
 * 저장(POST)은 신규 생성과 덮어쓰기를 함께 처리한다 — 바디에 `id`가 있으면 그 프리셋을
 * 덮어쓰고, 없으면 새로 만든다(화면의 확인 단계는 PresetPanel.tsx가 처리한다).
 *
 * 이미지 레이어의 `assetUrl`이 이미 `http(s)://`로 시작하면(불러온 프리셋을 이미지를 바꾸지
 * 않고 다시 저장하는 경우) 다시 업로드하지 않고 그대로 둔다 — 그 값이 아니면(blob URL 등)
 * 같은 레이어 id의 파일 필드(`image_{layerId}`)가 요청에 있어야 한다.
 */

const MAX_NAME_LENGTH = 60
const VALID_STAGE_RATIOS: StageRatio[] = ['1:1', '4:5', '9:16']

// DB·스토리지 오류 원문은 응답에 싣지 않고 로그에만 남긴다(티켓 20260926_1602). 현상 → 원인 → 해결책 순서.
const LIST_ERROR_MESSAGE = '프리셋 목록을 불러오지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const FIND_ERROR_MESSAGE = '프리셋을 확인하지 못했어요. 서버에서 조회 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const UPLOAD_ERROR_MESSAGE = '이미지를 올리지 못했어요. 서버에서 업로드 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'
const SAVE_ERROR_MESSAGE = '프리셋을 저장하지 못했어요. 서버에서 저장 중 오류가 났어요. 잠시 뒤 다시 시도해 주세요.'

/**
 * `targetType` 쿼리 파라미터가 있으면 그 유형으로 목록을 필터링한다(프리셋 저장 화면이
 * "현재 작업 중인 콘텐츠 유형"으로 불러오기 목록을 좁히는 데 쓴다, 티켓 20260925_1405).
 * 생략하면 필터 없이 전체를 돌려준다.
 */
export async function GET(req: NextRequest) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const targetTypeParam = req.nextUrl.searchParams.get('targetType')
  if (targetTypeParam !== null && !isPresetTargetType(targetTypeParam)) {
    return NextResponse.json({ error: '대상 유형이 올바르지 않습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  let query = supabase
    .from('asset_presets')
    .select('id, name, stage_ratio, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (targetTypeParam !== null) query = query.eq('target_type', targetTypeParam)

  const { data, error } = await query
  if (error) {
    console.error('[presets 목록 조회 오류]', error)
    return NextResponse.json({ error: LIST_ERROR_MESSAGE }, { status: 500 })
  }

  const presets = ((data ?? []) as AssetPresetSummaryRow[]).map(toAssetPresetSummary)
  return NextResponse.json({ presets })
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const name = typeof form.get('name') === 'string' ? String(form.get('name')).trim() : ''
  if (!name) return NextResponse.json({ error: '이름을 입력하세요.' }, { status: 400 })
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `이름은 ${MAX_NAME_LENGTH}자 이하로 입력하세요.` }, { status: 400 })
  }

  const stageRatio = String(form.get('stageRatio') ?? '')
  if (!VALID_STAGE_RATIOS.includes(stageRatio as StageRatio)) {
    return NextResponse.json({ error: '스테이지 비율이 올바르지 않습니다.' }, { status: 400 })
  }

  const targetTypeRaw = form.get('targetType')
  if (!isPresetTargetType(targetTypeRaw)) {
    return NextResponse.json({ error: '대상 유형이 올바르지 않습니다.' }, { status: 400 })
  }
  const targetType: PresetTargetType = targetTypeRaw

  const existingIdRaw = form.get('id')
  const existingId = typeof existingIdRaw === 'string' && existingIdRaw.trim() ? existingIdRaw.trim() : null
  // 스토리지 경로에 들어가는 값이라 형식을 제한한다(티켓 20260926_0201). 파일을 쓰기 전에 거절한다.
  if (existingId !== null && !isSafePresetPathSegment(existingId)) {
    return NextResponse.json({ error: '프리셋 ID 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  let layers: OverlayLayerConfig[]
  try {
    const parsed = JSON.parse(String(form.get('layers') ?? '[]'))
    if (!Array.isArray(parsed)) throw new Error('layers는 배열이어야 합니다.')
    // 원소가 null·숫자·문자열·배열이면 아래 `layer.type` 접근이 던져 500이 된다(티켓 20260926_1456).
    if (!parsed.every((layer) => typeof layer === 'object' && layer !== null && !Array.isArray(layer))) {
      throw new Error('layers의 원소는 객체여야 합니다.')
    }
    layers = parsed as OverlayLayerConfig[]
  } catch {
    return NextResponse.json({ error: '레이어 데이터가 올바르지 않습니다.' }, { status: 400 })
  }

  // 이미지 레이어의 id도 경로에 들어간다. 업로드 전에 전부 검사해 일부만 올라가는 일을 막는다.
  if (layers.some((layer) => layer.type === 'image' && !isSafePresetPathSegment(layer.id))) {
    return NextResponse.json({ error: '레이어 ID 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const presetId = existingId ?? crypto.randomUUID()
  const supabase = createServiceClient()

  // 덮어쓰기는 대상이 있는지 먼저 확인한다 — 없는 id면 404이고, 업로드(upsert)보다 앞서야
  // 스토리지에 파일이 남지 않는다(티켓 20260926_0201).
  if (existingId) {
    const { data: existing, error: findErr } = await supabase.from('asset_presets').select('id').eq('id', existingId).maybeSingle()
    if (findErr) {
      console.error('[presets 저장 대상 조회 오류]', findErr)
      return NextResponse.json({ error: FIND_ERROR_MESSAGE }, { status: 500 })
    }
    if (!existing) return NextResponse.json({ error: '프리셋을 찾을 수 없습니다.' }, { status: 404 })
  }

  const assetUrlByLayerId: Record<string, string> = {}
  for (const overlayLayer of layers) {
    if (overlayLayer.type !== 'image') continue
    if (/^https?:\/\//.test(overlayLayer.assetUrl)) continue // 이미 저장소 URL, 다시 올리지 않는다

    const file = form.get(`image_${overlayLayer.id}`)
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: '이미지 레이어의 원본 파일이 없습니다.' }, { status: 400 })
    }
    if (file.size > MAX_APPLY_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `이미지가 너무 큽니다(${(file.size / 1024 / 1024).toFixed(1)}MB). 5MB 이하만 저장할 수 있습니다.` },
        { status: 400 }
      )
    }

    const ext = file.type === 'image/svg+xml' || file.type === 'image/svg' ? 'svg' : 'png'
    const path = `asset-generator/presets/${presetId}/${overlayLayer.id}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadErr } = await supabase.storage
      .from(APPLY_GENERATED_IMAGE_BUCKET)
      .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: true })
    if (uploadErr) {
      console.error('[presets 이미지 업로드 오류]', uploadErr)
      return NextResponse.json({ error: UPLOAD_ERROR_MESSAGE }, { status: 500 })
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(APPLY_GENERATED_IMAGE_BUCKET).getPublicUrl(path)
    assetUrlByLayerId[overlayLayer.id] = publicUrl
  }

  const serializedLayers = serializePresetLayers(layers, assetUrlByLayerId)

  if (existingId) {
    const { data, error } = await supabase
      .from('asset_presets')
      .update({
        name,
        target_type: targetType,
        stage_ratio: stageRatio,
        // OverlayLayerConfig[]는 인덱스 시그니처가 없어 Json에 구조적으로 대입되지 않는다 — 이
        // 컬럼 하나만 좁혀서 캐스팅한다(shader-lab compositions route.ts와 같은 이유).
        layers: serializedLayers as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingId)
      .select('id, name, stage_ratio, created_at, updated_at')
      .single()
    if (error) {
      console.error('[presets 덮어쓰기 오류]', error)
      return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
    }
    return NextResponse.json({ preset: toAssetPresetSummary(data as AssetPresetSummaryRow) })
  }

  const { data, error } = await supabase
    .from('asset_presets')
    .insert({
      id: presetId,
      name,
      target_type: targetType,
      stage_ratio: stageRatio,
      layers: serializedLayers as unknown as Json,
      created_by: admin.id,
    })
    .select('id, name, stage_ratio, created_at, updated_at')
    .single()
  if (error) {
    console.error('[presets 생성 오류]', error)
    return NextResponse.json({ error: SAVE_ERROR_MESSAGE }, { status: 500 })
  }

  return NextResponse.json({ preset: toAssetPresetSummary(data as AssetPresetSummaryRow) })
}
