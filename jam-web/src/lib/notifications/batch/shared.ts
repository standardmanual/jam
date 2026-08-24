/**
 * T2 배치 공통 기반 — 티켓 20260825_002
 * 스펙: Specs/PRD/Notification/PRD.md §4(T2 11종) · §4-1(스케줄) / DATA_MODEL.md §4-2
 *
 * ## 이 파일이 강제하는 4가지
 *
 * 1. **시각은 한 번만 캡처한다.** `dailyGroupKey`·`sixHourGroupKey`는 `at`을 생략하면
 *    각각 `new Date()`를 개별 평가한다. 배치가 KST 자정을 걸쳐 길게 돌면 같은 배치가
 *    두 날짜 키로 갈린다. 그래서 `BatchContext.startedAt`을 만들어 **모든 단계가 이 한 값만**
 *    쓰도록 하고, 날짜 계산도 전부 `kst.ts`를 경유한다.
 * 2. **payload는 타입이 강제한다.** `NotificationDraft`는 `NotificationPayloadMap`에서
 *    파생된 판별 유니온이라, 키를 하나라도 틀리면 컴파일이 깨진다. 렌더러가 빈 슬롯을
 *    통째로 버리므로 키 오타는 런타임에 `''에 넣을 수 있는 …`처럼 조용히 새어 나간다.
 * 3. **한 유저의 실패가 배치 전체를 죽이지 않는다.** 단계·소식 단위로 격리하되
 *    `console.error`로 반드시 남긴다(조용한 실패를 새로 만들지 않는다).
 * 4. **페이징 조회에는 항상 안정 정렬이 붙는다.** `fetchAllRows`가 쿼리 빌더를 직접 받아
 *    `.order()`를 자기가 붙이므로 호출부가 잊을 수 없다. `ORDER BY` 없는 `LIMIT/OFFSET`
 *    페이징은 페이지 간 행 중복·누락을 만들고, 에러가 나지 않아 무증상이다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { NotificationServiceClient } from '@/lib/notifications'
import { createNotification } from '@/lib/notifications'
import type { CreateNotificationInput } from '@/lib/notifications'
import type { NotificationPayloadMap } from '@/lib/notifications/types'
import type { NotificationType } from '@/types/database'
import { KST_OFFSET_MS, kstDateString } from '@/lib/notifications/kst'

export const DAY_MS = 24 * 60 * 60 * 1000

/** ⑥ 팔로잉 활동 판정 창 — "지난 24시간 이벤트"(PRD §4-2) */
export const FOLLOWING_WINDOW_MS = DAY_MS

/**
 * 배치가 만들 소식 1건.
 *
 * `NotificationPayloadMap`에서 파생한 **판별 유니온**이다. `type`을 고르면 `payload`의
 * 키가 그 type의 계약으로 좁혀지므로, 키를 틀리면 `tsc`가 잡는다 (티켓 §3-1).
 */
export type NotificationDraft = {
  [T in keyof NotificationPayloadMap]: {
    userId: string
    type: T
    payload: NotificationPayloadMap[T]
    /** 아바타 탭 대상 — ⑥ 팔로잉 활동에만 있다 */
    actorUserId?: string | null
    groupKey?: string | null
    mode?: 'merge' | 'once'
    appendKeys?: string[]
  }
}[keyof NotificationPayloadMap]

export interface BatchContext {
  supabase: NotificationServiceClient
  /**
   * 배치 시작 시각 — **모든 단계가 이 값 하나만 쓴다.**
   * 단계마다 `new Date()`를 부르면 KST 자정을 걸치는 순간 group_key가 두 날짜로 갈린다.
   */
  startedAt: Date
  /** `startedAt` 기준 KST 날짜(YYYY-MM-DD). 일 단위 group_key의 유일한 출처 */
  today: string
}

export function createBatchContext(startedAt: Date = new Date()): BatchContext {
  return {
    supabase: createServiceClient(),
    startedAt,
    today: kstDateString(startedAt),
  }
}

/** `startedAt`에서 n일 전/후의 KST 날짜 문자열 — 날짜 계산을 전부 kst.ts로 통과시킨다 */
export function kstDateOffset(from: Date, days: number): string {
  return kstDateString(new Date(from.getTime() + days * DAY_MS))
}

/**
 * KST 기준 주 단위 키 — #18(내 드랍 지점 활성)의 "주 1회만"에 쓴다.
 *
 * KST epoch-day를 7로 접는다. ISO 주차가 아니라 단순 7일 블록이라 연말·연초 경계에서
 * 흔들리지 않는다(주 번호 자체가 의미를 갖지 않고 "같은 주인가"만 판정하면 되므로).
 */
export function kstWeekKey(at: Date): string {
  const kstDay = Math.floor((at.getTime() + KST_OFFSET_MS) / DAY_MS)
  return `W${Math.floor(kstDay / 7)}`
}

/** PostgREST 기본 상한 — 한 번에 받아올 수 있는 최대 행 수 */
export const PAGE_SIZE = 1000

/**
 * `.in()` 한 번에 실을 값의 최대 개수.
 *
 * PostgREST는 `.in()` 목록을 **URL 쿼리스트링**에 싣는다. Cloudflare의 URL 상한이 16KB라
 * UUID(36자 + 구분자)를 400개 넘게 실으면 한계에 근접한다. 걸리는 순간 조회가 실패하고
 * `runStep`이 잡아 **그 단계만 조용히 0건**이 된다(로그 한 줄뿐인 무증상 0건).
 * 아이템북 소속 배지는 FACTIONS.md 목표치가 세계관 10 × 90종 = 900종이라 실제로 도달한다.
 */
export const IN_CHUNK_SIZE = 200

/**
 * 페이징 조회에 필요한 최소 인터페이스.
 * Supabase의 select 빌더가 구조적으로 그대로 들어맞는다(캐스팅 불필요).
 */
export interface PagedQuery<T> {
  order(column: string, options?: { ascending?: boolean }): PagedQuery<T>
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string } | null }>
}

function ordered<T>(query: PagedQuery<T>, orderBy: string | string[]): PagedQuery<T> {
  const columns = typeof orderBy === 'string' ? [orderBy] : orderBy
  let cursor = query
  for (const column of columns) cursor = cursor.order(column, { ascending: true })
  return cursor
}

/**
 * PostgREST 기본 상한(1000행)에 걸려 **조용히 잘리는 것**을 막는 페이징 조회.
 *
 * ## `orderBy`가 선택 인자가 아닌 이유
 *
 * Postgres는 `ORDER BY` 없는 쿼리의 행 순서를 **보장하지 않는다.** `LIMIT/OFFSET`만으로
 * 페이징하면 페이지마다 물리적 순서가 달라질 수 있어 **같은 행이 두 번 오거나 아예 빠진다**
 * (그리고 에러가 나지 않아 무증상이다). 그래서 이 헬퍼는 쿼리 빌더를 직접 받아
 * **정렬을 자기가 붙인다** — 호출부가 잊을 수 없는 구조로 만든 것이다.
 *
 * `orderBy`에는 **유니크한 컬럼(대개 PK)**을 준다. 중복 값이 있는 컬럼으로 정렬하면
 * 동순위 안에서 순서가 다시 흔들려 같은 문제가 남는다. 복합 PK는 배열로 전부 넘긴다.
 *
 * @param query 페이지마다 **새로 만드는** 빌더. 빌더는 재사용하면 `.order()`가 누적되고
 *              `.range()`가 덮어써지므로 반드시 팩토리로 받는다.
 */
export async function fetchAllRows<T>(
  label: string,
  orderBy: string | string[],
  query: () => PagedQuery<T>,
  pageSize = PAGE_SIZE
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await ordered(query(), orderBy).range(from, from + pageSize - 1)
    if (error) {
      // 부분 결과로 소식을 만들면 "일부 유저만 빠진" 상태가 되므로 던져서 단계를 통째로 중단한다.
      // 단계 격리(runStep)가 나머지 10종을 살린다.
      throw new Error(`[notifications-batch] ${label} 조회 실패: ${error.message}`)
    }
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

/**
 * `.in()` 목록이 큰 조회 — 값을 `IN_CHUNK_SIZE`씩 쪼개 조회하고 결과를 합친다.
 *
 * 값은 **중복을 제거한 뒤** 쪼갠다. 같은 값이 서로 다른 청크에 들어가면 같은 행이 두 번
 * 담긴다(청크 분할이 새로 만드는 유일한 사고 경로라 여기서 막는다).
 */
export async function fetchAllRowsIn<T, V>(
  label: string,
  orderBy: string | string[],
  values: readonly V[],
  query: (chunk: V[]) => PagedQuery<T>,
  chunkSize = IN_CHUNK_SIZE
): Promise<T[]> {
  const unique = [...new Set(values)]
  if (unique.length === 0) return []

  const all: T[] = []
  for (let i = 0; i < unique.length; i += chunkSize) {
    const slice = unique.slice(i, i + chunkSize)
    all.push(
      ...(await fetchAllRows<T>(`${label}[${i}~${i + slice.length - 1}]`, orderBy, () => query(slice)))
    )
  }
  return all
}

export interface BatchStepResult {
  step: string
  /**
   * 이 단계가 판정 대상으로 훑은 행 수.
   *
   * `scanned > 0 && drafts === 0`이 **지속되면 판정이 깨진 것**이다. 요약 로그에 이 값이
   * 없으면 "정상 0건"(#24는 최근 종료 미션이 없으면 0이 맞다)과 "판정이 깨져서 0건"을
   * 구분할 수 없다 — 제거된 지역 기반 소식 2종이 정확히 그 패턴으로 무증상이었다.
   */
  scanned: number
  /** 만들려고 시도한 소식 수(생성 전). `created`와 벌어지면 RPC 쪽 실패다 */
  drafts: number
  created: number
  failed: number
  durationMs: number
  error: string | null
}

/** 단계의 산출물 — 초안과 함께 **얼마나 훑었는지**를 반드시 같이 낸다 */
export interface StepOutput {
  drafts: NotificationDraft[]
  scanned: number
}

/**
 * 단계 격리 — 한 단계가 던져도 나머지 단계는 그대로 실행된다.
 * 조용히 삼키지 않는다(§3-8).
 */
export async function runStep(
  step: string,
  fn: () => Promise<StepOutput>,
  ctx: BatchContext
): Promise<BatchStepResult> {
  const from = Date.now()
  try {
    const { drafts, scanned } = await fn()
    const { created, failed } = await emitDrafts(drafts, ctx)
    return {
      step,
      scanned,
      drafts: drafts.length,
      created,
      failed,
      durationMs: Date.now() - from,
      error: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[notifications-batch] 단계 실패 — ${step}:`, err)
    return {
      step,
      scanned: 0,
      drafts: 0,
      created: 0,
      failed: 0,
      durationMs: Date.now() - from,
      error: message,
    }
  }
}

/** 동시 실행 상한 — RPC 왕복을 겹치되 커넥션 풀을 밀어내지 않는 선 */
const EMIT_CONCURRENCY = 8

/**
 * 초안을 실제 소식으로 만든다.
 *
 * `createNotification()`은 실패해도 던지지 않고 `null`을 돌려주므로(그리고 이미
 * `console.error`를 남기므로) 한 유저의 실패가 배치를 죽이지 않는다.
 */
export async function emitDrafts(
  drafts: NotificationDraft[],
  ctx: BatchContext
): Promise<{ created: number; failed: number }> {
  let created = 0
  let failed = 0
  let cursor = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= drafts.length) return
      const draft = drafts[index]
      try {
        // 판별 유니온 → 제네릭 입력. payload 계약은 NotificationDraft 쪽에서 이미 검사됐다.
        const row = await createNotification({
          ...draft,
          client: ctx.supabase,
        } as CreateNotificationInput<NotificationType>)
        if (row) created += 1
        else failed += 1
      } catch (err) {
        failed += 1
        console.error(
          `[notifications-batch] 소식 생성 예외 — type: ${draft.type}, userId: ${draft.userId}:`,
          err
        )
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(EMIT_CONCURRENCY, Math.max(drafts.length, 1)) }, worker)
  )
  return { created, failed }
}
