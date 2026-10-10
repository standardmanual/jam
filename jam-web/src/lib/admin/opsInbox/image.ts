/**
 * 운영툴 항목 이미지 저장·정리 (티켓 20261006_1801, 상위 20260930_1501 ①). 규칙의 정본은 `docs/service/prd/ops-tool/PRD.md` §8.8·§11.12다. **서버 전용**이다.
 *
 * - 이미지는 운영자 브라우저가 만들어 올린다(렌더 코드는 여기에 없다). 이 파일은 저장 경로·항목과 자원에 쓰기·파일 정리만 맡는다.
 * - 파일 경로는 **항목 ID 기준**이다(`ops-inbox/{접두사}/{항목 ID}.webp`·`.png`). 자원 ID 경로를 쓰지 않으므로 기존 이미지를 덮어쓰지 않고,
 *   자원이 이미 지워진 뒤에도 정리할 수 있다.
 * - 쓰기 순서는 「항목 먼저, 예약 뒤 자원에도」다. `edited`는 최상위 키 덮어쓰기라 `resource`는 기존 값과 합친 객체 전체를 쓴다.
 * - 정리(`removeOpsImageFiles`)는 던지지 않는다. 실패는 서버 로그에만 남고 취소·되돌림을 막지 않는다.
 */
import type { Json } from '@/types/database.generated'
import { APPLY_GENERATED_IMAGE_BUCKET } from '@/lib/admin/applyGeneratedImageConstants'
import { RESOURCE_KEY_BY_KIND, isExecutableKind, type ExecuteServiceClient } from './execute/handlers'
import { asRecord, itemField } from './itemView'
import { imageKeyOfKind, isImageKind, type ImageKind, type OpsImageKey } from './imageSpec'

type ServiceClient = ExecuteServiceClient

const LOG = '[ops-inbox/image]'

/** 종류마다 자원 표·저장 경로 접두사가 정해져 있다. 이미지 칸 이름(`imageKeyOfKind`)은 서버·클라이언트 공용 `imageSpec.ts`가 갖는다. */
const IMAGE_KIND_CONFIG = {
  home_feed_card: { table: 'today_cards', prefix: 'today_cards' },
  mission: { table: 'missions', prefix: 'missions' },
  jam_badge: { table: 'badges', prefix: 'badges' },
  collection_launch: { table: 'item_books', prefix: 'item_books' },
} as const satisfies Record<ImageKind, { table: string; prefix: string }>

export { imageKeyOfKind, type OpsImageKey }

/** 저장소 경로 두 개(원본 PNG, 표시용 WebP). 이미지 칸이 없는 종류면 null이다. */
export function storagePathOf(kind: string | null | undefined, itemId: string): { pngPath: string; webpPath: string } | null {
  if (!isImageKind(kind)) return null
  const base = `ops-inbox/${IMAGE_KIND_CONFIG[kind].prefix}/${itemId}`
  return { pngPath: `${base}.png`, webpPath: `${base}.webp` }
}

// ── 항목과 자원에 쓰기 ────────────────────────────────────────────────────────────────────────────

export type ApplyItemImageResult =
  | { ok: true; resourceWritten: boolean }
  | { ok: false; code: 'not_found' | 'not_allowed' | 'no_image_field' | 'conflict' | 'error' }

/** 이미지를 받을 수 있는 상태: 결정 전·승인·준비중·예약됨·게재중. 반려·취소·실패·종료는 받지 않는다. */
const BLOCKED_STATUSES = ['rejected', 'cancelled', 'failed', 'ended']

const ITEM_IMAGE_COLUMNS = 'id, kind, status, original, edited, created_resource, updated_at'

/**
 * 항목의 `edited.resource`에 이미지 주소를 쓴다. 기존 `resource`와 합친 객체 전체를 쓰고, 항목의 `updated_at`을 조건으로 건다
 * (그사이 바뀌었으면 한 번 다시 읽어 재시도하고, 그래도 충돌하면 `conflict`다). 예약된 뒤(`created_resource`에 자원 ID가 있고 `sample`이 아님)에는
 * 그 자원 행의 이미지 칸도 함께 갱신한다. 시험 묶음 항목은 `created_resource.sample`이 `true`라 자원에는 쓰지 않는다
 * (시험 묶음 거절은 라우트가 묶음 표시로 한다). 던지지 않는다.
 */
export async function applyItemImage(service: ServiceClient, input: { itemId: string; url: string }): Promise<ApplyItemImageResult> {
  const { itemId, url } = input

  for (let attempt = 0; attempt < 2; attempt++) {
    const read = await service.from('ops_bundle_items').select(ITEM_IMAGE_COLUMNS).eq('id', itemId).maybeSingle()
    if (read.error) {
      console.error(`${LOG} 항목 조회 실패:`, read.error.message)
      return { ok: false, code: 'error' }
    }
    const item = read.data
    if (!item) return { ok: false, code: 'not_found' }
    if (BLOCKED_STATUSES.includes(item.status)) return { ok: false, code: 'not_allowed' }
    const key = imageKeyOfKind(item.kind)
    if (!key) return { ok: false, code: 'no_image_field' }

    const resource = { ...(asRecord(itemField(item, 'resource')) ?? {}), [key]: url }
    const edited = { ...(asRecord(item.edited) ?? {}), resource } as Json
    const written = await service
      .from('ops_bundle_items')
      .update({ edited, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('updated_at', item.updated_at)
      .select('id')
    if (written.error) {
      console.error(`${LOG} 항목 이미지 저장 실패:`, written.error.message)
      return { ok: false, code: 'error' }
    }
    if (!written.data || written.data.length === 0) continue // 그사이 항목이 바뀌었다. 다시 읽는다.

    const resourceWritten = await writeResourceImage(service, item, key, url)
    return { ok: true, resourceWritten }
  }
  return { ok: false, code: 'conflict' }
}

interface UpdatableTable {
  update(payload: Record<string, string>): { eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }> }
}

/** 예약된 뒤라면 `created_resource`가 가리키는 자원 행의 이미지 칸을 갱신한다. 쓸 자원이 없으면 true(할 일이 없다), 쓰다 실패하면 false다. */
async function writeResourceImage(
  service: ServiceClient,
  item: { kind: string | null; created_resource: Json | null },
  key: OpsImageKey,
  url: string
): Promise<boolean> {
  const created = asRecord(item.created_resource)
  if (!created || created.sample === true) return true
  if (!isImageKind(item.kind) || !isExecutableKind(item.kind)) return true
  const resourceId = created[RESOURCE_KEY_BY_KIND[item.kind]]
  if (typeof resourceId !== 'string' || resourceId.trim() === '') return true

  const table = service.from(IMAGE_KIND_CONFIG[item.kind].table) as unknown as UpdatableTable
  try {
    const updated = await table.update({ [key]: url }).eq('id', resourceId)
    if (updated.error) {
      console.error(`${LOG} 자원 이미지 저장 실패:`, updated.error.message)
      return false
    }
    return true
  } catch (err) {
    console.error(`${LOG} 자원 이미지 저장 중 예외:`, err instanceof Error ? err.message : 'unknown')
    return false
  }
}

// ── 파일 정리 ────────────────────────────────────────────────────────────────────────────────────

/**
 * 항목의 새 자원 전용 경로 파일 두 개를 지운다(예약 등록 실패·공개 전 취소·되돌림 때). 이미지 칸이 없는 종류면 아무것도 하지 않는다.
 * **던지지 않는다** — 실패는 서버 로그에만 남고 부른 쪽의 흐름을 막지 않는다. 없는 파일을 지우는 것은 오류가 아니다.
 */
export async function removeOpsImageFiles(service: ServiceClient, input: { kind: string | null | undefined; itemId: string }): Promise<void> {
  const paths = storagePathOf(input.kind, input.itemId)
  if (!paths) return
  try {
    const removed = await service.storage.from(APPLY_GENERATED_IMAGE_BUCKET).remove([paths.pngPath, paths.webpPath])
    if (removed.error) console.error(`${LOG} 이미지 파일 정리 실패:`, removed.error.message)
  } catch (err) {
    console.error(`${LOG} 이미지 파일 정리 중 예외:`, err instanceof Error ? err.message : 'unknown')
  }
}
