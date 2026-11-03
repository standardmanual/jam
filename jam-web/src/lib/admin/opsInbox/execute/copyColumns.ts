/**
 * 예약된 자원의 문안 열을 공개 전에 고치는 공용 쓰기 (티켓 20261103_1446). 규칙의 정본은 `docs/service/prd/ops-tool/PRD.md` §7.3·§8.7이다.
 *
 * 카드(`today_cards`)·미션(`missions`)의 `updateCopy`가 함께 쓴다. 자원을 읽어 공개 시각(`starts_at`)이 지났으면 건드리지 않고, 쓸 때도 `starts_at > now`를 조건으로 건다
 * (읽은 뒤 공개 시각이 지나는 경합은 0행이 되어 다시 읽어 공개됐는지 없어졌는지 가른다. `cancel`과 같은 방식이다). 고치기 전 값은 `previous`로 돌려준다.
 *
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다(타입은 `import type`). 서비스 클라이언트는 인자로 받는다(`endColumn.ts`와 같다).
 * 응답·결정 기록·슬랙에는 `COPY_MESSAGES`의 고정 문장만 나가고, DB 오류 원문은 `detail`(서버 로그)에만 둔다.
 */
import type { ExecuteServiceClient, UpdateCopyResult } from './handlers'

/** 핸들러 `updateCopy`가 돌려주는 실패의 사유. 화면에 보이는 문장은 `decide.ts`가 정한다. */
export const COPY_MESSAGES = {
  failed: '자원의 문안을 바꾸지 못했어요',
  published: '공개 시각이 지나 문안을 고칠 수 없어요',
  missing: '예약된 자원을 찾을 수 없어요',
} as const

export type CopyTable = 'today_cards' | 'missions'

// 칼럼 이름이 인자라 생성 타입의 쓰기 검사를 그대로 쓸 수 없다. 표는 위 `CopyTable`이 좁히고, 이 최소 인터페이스는 이 파일 한 곳에서만 쓴다.
type CopyReadResult = { data: Record<string, unknown> | null; error: { message: string } | null }

interface CopyClient {
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<CopyReadResult> } }
    update(values: Record<string, string | null>): {
      eq(column: string, value: string): {
        gt(column: string, value: string): { select(columns: string): PromiseLike<{ data: Array<{ id: string }> | null; error: { message: string } | null }> }
      }
    }
  }
}

function copyError(detail: string): UpdateCopyResult {
  return { ok: false, code: 'error', failure: { reason: COPY_MESSAGES.failed, detail } }
}

/** 자원의 문안 열을 `fields`로 바꾼다. 열 이름은 호출한 핸들러가 정한 목록뿐이다. */
export async function updateCopyColumns(
  service: ExecuteServiceClient,
  input: { table: CopyTable; label: string; resourceId: string; fields: Readonly<Record<string, string | null>>; now: Date }
): Promise<UpdateCopyResult> {
  const { table, label, resourceId, fields, now } = input
  const columns = Object.keys(fields)
  if (columns.length === 0) return { ok: true, previous: {} }
  const client = service as unknown as CopyClient

  const read = await client.from(table).select(['id', 'starts_at', ...columns].join(', ')).eq('id', resourceId).maybeSingle()
  if (read.error) return copyError(`${label} 조회 실패: ${read.error.message}`)
  if (!read.data) return { ok: false, code: 'missing', failure: { reason: COPY_MESSAGES.missing } }
  const startsMs = typeof read.data.starts_at === 'string' ? Date.parse(read.data.starts_at) : Number.NaN
  if (!Number.isFinite(startsMs)) return copyError(`${label} 시각을 읽을 수 없어요`)
  if (startsMs <= now.getTime()) return { ok: false, code: 'published', failure: { reason: COPY_MESSAGES.published } }

  const previous: Record<string, string | null> = {}
  for (const column of columns) {
    const value = read.data[column]
    previous[column] = typeof value === 'string' ? value : null
  }

  const updated = await client.from(table).update({ ...fields }).eq('id', resourceId).gt('starts_at', now.toISOString()).select('id')
  if (updated.error) return copyError(`${label} 문안 변경 실패: ${updated.error.message}`)
  if (updated.data && updated.data.length > 0) return { ok: true, previous }

  const reread = await client.from(table).select('id').eq('id', resourceId).maybeSingle()
  if (reread.error) return copyError(`${label} 재조회 실패: ${reread.error.message}`)
  return reread.data
    ? { ok: false, code: 'published', failure: { reason: COPY_MESSAGES.published } }
    : { ok: false, code: 'missing', failure: { reason: COPY_MESSAGES.missing } }
}
