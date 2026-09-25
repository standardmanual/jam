import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { APPLY_GENERATED_IMAGE_BUCKET, MAX_APPLY_IMAGE_BYTES } from '@/lib/admin/applyGeneratedImageConstants'
import { convertBadgeImageToWebp } from '@/lib/admin/badgeImageWebp'

/**
 * 에셋 제너레이터 적용 탭 → 콘텐츠 반영 API (티켓 20260924_2200, 미션 확장 20260925_1407)
 *
 * `shader-lab/apply`(공용 `applyGeneratedImage` 함수)와 달리 이 라우트는 원본 PNG를 그대로
 * `image_url`에 걸지 않는다: 원본은 보관용으로만 올리고, sharp로 표시 규격(긴 변 400px,
 * PRD asset-generator/PRD.md §9)까지 축소한 WebP를 만들어 `image_url`에 반영하며
 * `image_source`도 함께 기록한다. 2단계 업로드 + 컬럼 2개 갱신이라 `applyGeneratedImage`
 * (단일 PNG 업로드 + image_url 1개 갱신) 시그니처로는 표현할 수 없어 그 함수는 그대로 두고
 * (시그니처 불변) 이 라우트에 인라인으로 둔다.
 *
 * 원래 배지 전용이었다가(1차, `badgeId` 고정 필드) 미션까지 일반화했다(2차, `targetType`·
 * `targetId`). 테이블명·이름 컬럼·저장 경로 접두사는 {@link TARGET_TYPE_CONFIG}로 분기한다.
 * 저장 경로는 도구별 폴더 관례(shader-lab이 `{대상}/shader-lab/{id}.png`를 쓰는 것과 같은
 * 이유)를 따라 `{접두사}/asset-generator/{targetId}.{png|webp}`로 고정한다.
 */

type TargetType = 'badge' | 'mission'

interface TargetTypeConfig {
  table: 'badges' | 'missions'
  /** 검색 결과 이름으로 쓸 컬럼 — 배지는 name, 미션은 title */
  nameColumn: 'name' | 'title'
  /** 스토리지 폴더 접두사 */
  storagePrefix: string
  /** 배지만 소프트 삭제 컬럼(deleted_at)이 있다 — 미션에는 없다 */
  hasDeletedAt: boolean
  missingTargetIdMessage: string
  notFoundMessage: string
}

const TARGET_TYPE_CONFIG: Record<TargetType, TargetTypeConfig> = {
  badge: {
    table: 'badges',
    nameColumn: 'name',
    storagePrefix: 'badges',
    hasDeletedAt: true,
    missingTargetIdMessage: '배지를 선택하세요.',
    notFoundMessage: '배지를 찾을 수 없습니다.',
  },
  mission: {
    table: 'missions',
    nameColumn: 'title',
    storagePrefix: 'missions',
    hasDeletedAt: false,
    missingTargetIdMessage: '미션을 선택하세요.',
    notFoundMessage: '미션을 찾을 수 없습니다.',
  },
}

function isTargetType(value: string): value is TargetType {
  return value === 'badge' || value === 'mission'
}

/**
 * `config.table`이 `'badges' | 'missions'` 유니온이라 Supabase 생성 타입의 `.from()` 오버로드가
 * 두 테이블 모양의 교집합만 허용한다(예: `deleted_at`은 배지에만 있어 유니온 호출에서 컬럼명
 * 검사가 막힌다). 이 최소 인터페이스로 좁혀 동적 테이블 선택을 표현한다(`badge-list-query.ts`·
 * `mission-list-query.ts`의 `BadgeListQuery<T>`/`MissionListQuery<T>`와 같은 관례).
 */
interface TargetFindQuery {
  select(columns: string): TargetFindQuery
  eq(column: string, value: string): TargetFindQuery
  is(column: string, value: null): TargetFindQuery
  maybeSingle(): PromiseLike<{ data: Record<string, string> | null; error: { message: string } | null }>
}
interface TargetUpdateQuery {
  eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>
}
interface TargetTable {
  select(columns: string): TargetFindQuery
  update(payload: { image_url: string; image_source: string }): TargetUpdateQuery
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

  const targetTypeRaw = typeof form.get('targetType') === 'string' ? String(form.get('targetType')).trim() : ''
  if (!isTargetType(targetTypeRaw)) {
    return NextResponse.json({ error: '콘텐츠 유형이 올바르지 않습니다.' }, { status: 400 })
  }
  const config = TARGET_TYPE_CONFIG[targetTypeRaw]

  const targetId = typeof form.get('targetId') === 'string' ? String(form.get('targetId')).trim() : ''
  if (!targetId) return NextResponse.json({ error: config.missingTargetIdMessage }, { status: 400 })

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
  const table = supabase.from(config.table) as unknown as TargetTable
  let findQuery = table.select(`id, ${config.nameColumn}`).eq('id', targetId)
  if (config.hasDeletedAt) findQuery = findQuery.is('deleted_at', null)
  const { data: targetRow, error: findErr } = await findQuery.maybeSingle()
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 })
  if (!targetRow) return NextResponse.json({ error: config.notFoundMessage }, { status: 404 })
  const targetName = targetRow[config.nameColumn]

  const png = Buffer.from(await file.arrayBuffer())
  let webp: Buffer
  try {
    webp = await convertBadgeImageToWebp(png)
  } catch {
    return NextResponse.json({ error: '이미지를 WebP로 변환하지 못했습니다.' }, { status: 500 })
  }

  const pngPath = `${config.storagePrefix}/asset-generator/${targetId}.png`
  const webpPath = `${config.storagePrefix}/asset-generator/${targetId}.webp`

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

  const { error: updateErr } = await table.update({ image_url: webpUrl, image_source: 'admin-generator' }).eq('id', targetId)
  if (updateErr) {
    return NextResponse.json(
      { error: `이미지는 업로드됐지만 반영에 실패했습니다: ${updateErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    id: targetId,
    name: targetName,
    originalUrl,
    webpUrl,
    webpBytes: webp.length,
  })
}
