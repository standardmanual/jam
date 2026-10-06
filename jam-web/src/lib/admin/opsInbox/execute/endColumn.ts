/**
 * 「지금 종료」가 자원의 종료 시각 칸을 바꾸는 공용 쓰기 (티켓 20261006_0950, 상위 20260930_1500 ⑪-a). 규칙의 정본은 `docs/specs/prd/ops-tool/PRD.md` §8.7이다.
 *
 * 다섯 종류(카드·미션·JAM! 배지·컬렉션·레시피)의 `end`가 함께 쓴다. 종류마다 자원을 다시 읽어 공개 전·이미 종료·없음을 가른 뒤, 읽은 종료 시각 값을 조건으로 걸어 지금으로 바꾼다
 * (읽은 뒤 다른 곳이 종료 시각을 바꿨으면 0행이라 `changed`다. 이미 끝난 자원을 되살리거나 늘리지 않게 한다).
 *
 * 순수 모듈 계약: `node:`·Supabase·서버 모듈을 값으로 가져오지 않는다(타입은 `import type`). 서비스 클라이언트는 인자로 받는다.
 * 핸들러가 이 파일을 가져오고 핸들러는 요약창의 사전 점검이 끌어오므로 서버 모듈에 닿으면 안 된다(`__tests__/pureModules.test.ts`).
 * 응답·결정 기록·슬랙에는 `END_MESSAGES`의 고정 문장만 나가고, DB 오류 원문은 `detail`(서버 로그)에만 둔다.
 */
import type { Database } from '@/types/database.generated'
import type { EndResult, ExecuteServiceClient } from './handlers'

/** 핸들러 `end`가 돌려주는 실패의 사유. 사용자에게 보이는 문장이 아니라 결정 기록·로그용이다(화면 문장은 `end.ts`가 정한다). */
export const END_MESSAGES = {
  failed: '자원의 종료 시각을 바꾸지 못했어요',
  changed: '그사이 자원의 종료 시각이 바뀌어 종료하지 못했어요',
  notPublished: '아직 공개되지 않은 자원이라 종료할 수 없어요',
} as const

/** 종료 시각 칸을 가진 자원 표. 칸 이름은 표마다 다르다(카드·미션은 `ends_at`, 나머지는 `valid_until`). */
export type EndTable = 'today_cards' | 'missions' | 'badges' | 'item_books' | 'combination_recipes'

/** 그 표의 쓰기 칸 가운데 하나여야 한다(오타나 없는 칸은 컴파일 오류). */
export type EndColumnOf<T extends EndTable> = Extract<keyof Database['public']['Tables'][T]['Update'], 'ends_at' | 'valid_until'>

/** 읽기·쓰기 오류 한 건. `detail`은 서버 로그에만 남는다. */
export function endError(detail: string): EndResult {
  return { ok: false, code: 'error', failure: { reason: END_MESSAGES.failed, detail } }
}

/** 자원이 아직 공개 전이다. */
export function endNotPublished(): EndResult {
  return { ok: false, code: 'not_published', failure: { reason: END_MESSAGES.notPublished } }
}

// 칼럼 이름이 인자라 생성 타입의 쓰기 검사를 그대로 쓸 수 없다. 표·칼럼은 위 `EndTable`·`EndColumnOf`가 컴파일 때 좁히고, 이 최소 인터페이스는 이 파일 한 곳에서만 쓴다.
interface EndUpdateFilter {
  eq(column: string, value: string): EndUpdateFilter
  is(column: string, value: null): EndUpdateFilter
  select(columns: string): PromiseLike<{ data: Array<{ id: string }> | null; error: { message: string } | null }>
}

interface EndUpdateClient {
  from(table: string): { update(values: Record<string, string>): EndUpdateFilter }
}

/**
 * 자원의 종료 시각 칸을 `now`로 바꾼다. `readValue`는 방금 읽은 그 칸의 값이고(상시 자원이면 `null`), 같은 값일 때만 바꾼다.
 * 한 행도 바뀌지 않으면 `changed`, DB 오류면 `error`다.
 */
export async function endResourceNow<T extends EndTable>(
  service: ExecuteServiceClient,
  input: { table: T; column: EndColumnOf<T>; resourceId: string; readValue: string | null; now: Date }
): Promise<EndResult> {
  const { table, column, resourceId, readValue, now } = input
  const client = service as unknown as EndUpdateClient
  const base = client.from(table).update({ [column]: now.toISOString() }).eq('id', resourceId)
  const updated = await (readValue === null ? base.is(column, null) : base.eq(column, readValue)).select('id')
  if (updated.error) return endError(`${table}.${column} 변경 실패: ${updated.error.message}`)
  if (!updated.data || updated.data.length === 0) return { ok: false, code: 'changed', failure: { reason: END_MESSAGES.changed } }
  return { ok: true, state: 'ended' }
}
