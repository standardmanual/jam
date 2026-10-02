/**
 * T2 배치 공통 기반 — 티켓 20260825_002
 * 스펙: docs/specs/prd/notification/PRD.md §4(T2 11종) · §4-1(스케줄) / DATA_MODEL.md §4-2
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
 * 4. **페이징 조회에는 항상 안정 정렬이 붙는다.** `fetchAllRows`(`@/lib/db/fetchAllRows`, 아래에서 다시 내보낸다)가 쿼리 빌더를 직접 받아
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

/**
 * 페이징 조회 도우미는 `@/lib/db/fetchAllRows`로 옮겼다(티켓 20261002_2306). 서버 전용 모듈을 거치지 않고 가져올 수 있게 순수 파일로 뺐고,
 * 이 파일은 기존 호출부가 그대로 쓰도록 같은 이름을 다시 내보낸다.
 */
export { PAGE_SIZE, IN_CHUNK_SIZE, fetchAllRows, fetchAllRowsIn } from '@/lib/db/fetchAllRows'
export type { PagedQuery } from '@/lib/db/fetchAllRows'

/**
 * R11 — 같은 유저·같은 종류의 초안이 **2건 이상이면 한 행으로 접는다** (티켓 20260827_014).
 *
 * 대상(컬렉션·미션·POI)마다 초안을 만드는 구조는 그대로 두고, 마지막에 한 번 접는다.
 * 판정 로직과 묶음 규칙을 섞지 않기 위해서다 — 판정은 대상 단위가 자연스럽고, 묶음은
 * "결과가 몇 건이냐"만 보면 된다.
 *
 * @param combine 접힌 행 1건을 만든다. `null`을 돌려주면 접지 않고 원래 초안을 유지한다
 */
export function foldTargets(
  drafts: NotificationDraft[],
  combine: (group: NotificationDraft[]) => NotificationDraft | null
): NotificationDraft[] {
  const buckets = new Map<string, NotificationDraft[]>()
  const order: string[] = []
  for (const draft of drafts) {
    const key = `${draft.userId}\u0000${draft.type}`
    const list = buckets.get(key)
    if (list) {
      list.push(draft)
      continue
    }
    buckets.set(key, [draft])
    order.push(key)
  }

  const out: NotificationDraft[] = []
  for (const key of order) {
    const list = buckets.get(key) ?? []
    if (list.length < 2) {
      out.push(...list)
      continue
    }
    const folded = combine(list)
    out.push(...(folded ? [folded] : list))
  }
  return out
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
