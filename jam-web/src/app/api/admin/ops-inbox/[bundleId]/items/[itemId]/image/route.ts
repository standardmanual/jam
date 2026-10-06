/**
 * POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/image — 항목 이미지 저장 (티켓 20261006_1801, 상위 20260930_1501 ①)
 *
 * 운영자 브라우저가 만든 PNG(FormData `image`, 5MB 이하)를 받아 WebP로 바꾸고, 새 자원 전용 경로(`ops-inbox/{접두사}/{항목 ID}.png`·`.webp`)에 올린 뒤
 * 항목의 `edited.resource`에 주소를 쓴다. 예약된 뒤라면 `created_resource`가 가리키는 자원의 이미지 칸에도 쓴다(`opsInbox/image.ts`).
 * 렌더는 브라우저가 한다 — 이 라우트에는 렌더 코드가 없다. 결정 기록은 남기지 않는다.
 *
 * - 관리자 로그인 세션만 통과한다(읽기 토큰은 proxy가 막는다).
 * - 이미지 칸이 없는 종류, 반려·취소·실패·종료 항목, 시험 묶음은 거절한다(시험 묶음은 자원이 없어 이미지를 저장하지 않는다).
 * - 응답에는 DB·저장소 오류 원문을 싣지 않는다(고정 문장만, 원문은 서버 로그에 남는다).
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import { createServiceClient } from '@/lib/supabase/server'
import { APPLY_GENERATED_IMAGE_BUCKET, MAX_APPLY_IMAGE_BYTES } from '@/lib/admin/applyGeneratedImageConstants'
import { convertBadgeImageToWebp } from '@/lib/admin/badgeImageWebp'
import { applyItemImage, imageKeyOfKind, storagePathOf } from '@/lib/admin/opsInbox/image'

// 변환·업로드 두 번·DB 쓰기를 한 요청에서 끝낸다.
export const maxDuration = 60

const LOG = '[ops-inbox/image]'

const MESSAGES = {
  forbidden: '관리자 권한이 필요해요.',
  badBundleId: '기획 ID 형식이 올바르지 않아요.',
  badItemId: '항목 ID 형식이 올바르지 않아요.',
  badForm: '요청 형식이 올바르지 않아요.',
  noFile: '이미지 파일이 없어요.',
  notPng: 'PNG 이미지만 저장할 수 있어요.',
  tooLarge: '이미지가 너무 커요. 5MB 이하만 저장할 수 있어요.',
  notFound: '찾을 수 없는 항목이에요.',
  noImageField: '이미지를 쓰지 않는 종류예요.',
  notAllowed: '반려·취소·실패·종료된 항목에는 이미지를 저장할 수 없어요.',
  sample: '시험 묶음은 자원이 없어 이미지를 저장하지 않아요.',
  conflict: '그사이 항목이 바뀌었어요. 화면을 새로 고친 뒤 다시 시도해 주세요.',
  convertFailed: '이미지를 WebP로 바꾸지 못했어요. 다른 이미지로 다시 시도해 주세요.',
  uploadFailed: '이미지를 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  saveFailed: '이미지를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  resourceNotSaved: '항목에는 저장했지만 예약된 자원에는 쓰지 못했어요. 같은 이미지를 다시 올려 주세요.',
} as const

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

export async function POST(req: Request, { params }: { params: Promise<{ bundleId: string; itemId: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return fail(403, MESSAGES.forbidden)

  const { bundleId, itemId } = await params
  if (!isUuid(bundleId)) return fail(400, MESSAGES.badBundleId)
  if (!isUuid(itemId)) return fail(400, MESSAGES.badItemId)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail(400, MESSAGES.badForm)
  }
  const file = form.get('image')
  if (!(file instanceof File) || file.size === 0) return fail(400, MESSAGES.noFile)
  if (file.type !== 'image/png') return fail(400, MESSAGES.notPng)
  if (file.size > MAX_APPLY_IMAGE_BYTES) return fail(400, MESSAGES.tooLarge)

  const service = createServiceClient()

  // 변환·업로드 전에 거절할 수 있는 것을 먼저 거른다: 항목이 이 기획 안에 있는지, 종류·상태, 시험 묶음.
  const bundle = await service.from('ops_bundles').select('id, is_sample').eq('id', bundleId).maybeSingle()
  if (bundle.error) {
    console.error(`${LOG} 묶음 조회 실패:`, bundle.error.message)
    return fail(500, MESSAGES.saveFailed)
  }
  if (!bundle.data) return fail(404, MESSAGES.notFound)
  const item = await service.from('ops_bundle_items').select('id, kind, status').eq('id', itemId).eq('bundle_id', bundleId).maybeSingle()
  if (item.error) {
    console.error(`${LOG} 항목 조회 실패:`, item.error.message)
    return fail(500, MESSAGES.saveFailed)
  }
  if (!item.data) return fail(404, MESSAGES.notFound)
  if (!imageKeyOfKind(item.data.kind)) return fail(409, MESSAGES.noImageField)
  if (['rejected', 'cancelled', 'failed', 'ended'].includes(item.data.status)) return fail(409, MESSAGES.notAllowed)
  if (bundle.data.is_sample) return fail(409, MESSAGES.sample)
  const paths = storagePathOf(item.data.kind, itemId)
  if (!paths) return fail(409, MESSAGES.noImageField)

  const png = Buffer.from(await file.arrayBuffer())
  let webp: Buffer
  try {
    webp = await convertBadgeImageToWebp(png)
  } catch (err) {
    console.error(`${LOG} WebP 변환 실패:`, err instanceof Error ? err.message : 'unknown')
    return fail(500, MESSAGES.convertFailed)
  }

  const bucket = service.storage.from(APPLY_GENERATED_IMAGE_BUCKET)
  const pngUpload = await bucket.upload(paths.pngPath, png, { contentType: 'image/png', upsert: true })
  if (pngUpload.error) {
    console.error(`${LOG} 원본 업로드 실패:`, pngUpload.error.message)
    return fail(500, MESSAGES.uploadFailed)
  }
  const webpUpload = await bucket.upload(paths.webpPath, webp, { contentType: 'image/webp', upsert: true })
  if (webpUpload.error) {
    console.error(`${LOG} WebP 업로드 실패:`, webpUpload.error.message)
    return fail(500, MESSAGES.uploadFailed)
  }

  // 같은 경로를 다시 올려도 캐시된 옛 그림이 보이지 않게 쿼리 문자열을 붙인다.
  const url = `${bucket.getPublicUrl(paths.webpPath).data.publicUrl}?v=${Date.now()}`
  const applied = await applyItemImage(service, { itemId, url })
  if (!applied.ok) {
    switch (applied.code) {
      case 'not_found':
        return fail(404, MESSAGES.notFound)
      case 'not_allowed':
        return fail(409, MESSAGES.notAllowed)
      case 'no_image_field':
        return fail(409, MESSAGES.noImageField)
      case 'conflict':
        return fail(409, MESSAGES.conflict)
      default:
        return fail(500, MESSAGES.saveFailed)
    }
  }
  if (!applied.resourceWritten) return fail(500, MESSAGES.resourceNotSaved)

  return NextResponse.json({ ok: true, url, webpBytes: webp.length })
}
