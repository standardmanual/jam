/**
 * 항목 이미지 업로드 요청 (티켓 20261007_0945 ③-a) — `POST /api/admin/ops-inbox/[bundleId]/items/[itemId]/image` (PRD §11.12).
 *
 * 브라우저가 만든 PNG를 FormData(`image` 필드)로 보낸다. JSON 전용 `postOpsJson`은 쓰지 않는다. **던지지 않고** 결과를 돌려준다.
 * 실패 문장은 상태 코드별 고정 한국어다(서버 문장이 400·409처럼 이유가 갈리는 경우는 서버 문장을 그대로 쓰되, 없으면 고정 문장).
 */
import { NETWORK_ERROR_MESSAGE } from '@/components/admin/data-table/admin-fetch'
import { FALLBACK_ERROR, asRecord } from '@/components/admin/ops/decisionClient'

export type PostItemImageResult = { ok: true; url: string } | { ok: false; status: number; message: string }

const STATUS_MESSAGES: Record<number, string> = {
  400: '이미지 형식이 올바르지 않아요. 5MB 이하 PNG로 다시 만들어 주세요.',
  403: '관리자 권한이 필요해요. 다시 로그인한 뒤 시도해 주세요.',
  404: '찾을 수 없는 항목이에요. 화면을 새로 고쳐 주세요.',
  409: '이 항목에는 이미지를 저장할 수 없어요. 시험 묶음이거나 이미지를 쓰지 않는 종류, 또는 이미 끝난 항목이에요.',
  500: '이미지를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
}

/**
 * 409는 이유가 여럿이다(이미지 칸 없음·종료된 항목·시험 묶음·그사이 바뀜). 서버가 이유 문장을 실었으면 그 문장을 쓰고 없으면 고정 문장이다.
 * 다른 상태는 고정 문장이다(서버 오류 원문이 화면에 새지 않게).
 */
export async function postItemImage(bundleId: string, itemId: string, blob: Blob): Promise<PostItemImageResult> {
  const form = new FormData()
  form.append('image', new File([blob], 'image.png', { type: 'image/png' }))

  let res: Response
  try {
    res = await fetch(`/api/admin/ops-inbox/${encodeURIComponent(bundleId)}/items/${encodeURIComponent(itemId)}/image`, {
      method: 'POST',
      body: form,
    })
  } catch {
    return { ok: false, status: 0, message: NETWORK_ERROR_MESSAGE }
  }

  const body = asRecord(await res.json().catch(() => null))
  if (res.ok) {
    if (typeof body.url !== 'string' || body.url === '') return { ok: false, status: res.status, message: FALLBACK_ERROR }
    return { ok: true, url: body.url }
  }
  const serverMessage = typeof body.error === 'string' && body.error !== '' ? body.error : null
  const message = res.status === 409 ? (serverMessage ?? STATUS_MESSAGES[409]) : (STATUS_MESSAGES[res.status] ?? FALLBACK_ERROR)
  return { ok: false, status: res.status, message }
}
