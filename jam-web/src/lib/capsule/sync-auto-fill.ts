/**
 * 동기화 안의 캡슐 자동 채움 단계 — 자동 채움을 돌리고, 자동으로 열린 결과를 «아직 보지 않은 캡슐 결과»로 남긴다 (티켓 20261028_1733 3회)
 *
 * 동기화(`lib/strava/sync.ts`)가 잼 정산 직후에 부른다. **절대 던지지 않는다** — 채움·열기·기록 어디서 실패해도 동기화는 계속된다.
 *
 * 규칙
 *  - 자동 채움은 `runCapsuleAutoFill`(던지지 않는 쪽)이다. 열기마다의 챕터 오름 처리에서 챕터 배지 판정은 건너뛴다(`skipRiseBadgeEvaluation`):
 *    동기화 끝 판정(`JAM_SYNC_TRIGGERS`의 `chapter_reached`)이 DB의 지금 챕터를 읽어 이어서 판정하고, 그 결과가 같은 동기화의 결산 알림에 실린다.
 *    건너뛰지 않으면 같은 판정이 두 번 돌고, 챕터 배지가 결산보다 먼저 별도 알림으로 나간다(발급 자체는 UNIQUE로 한 번뿐). 소식·피드는 오름 처리가 그대로 보낸다.
 *  - 열린 캡슐이 하나라도 있으면 `capsule_unseen_results`에 **한 동기화당 한 건**을 남긴다(열린 게 없으면 남기지 않는다). `payload.events`가 열린 순서 그대로의 이벤트다 —
 *    이벤트 하나가 열기 하나(나온 개체와 챕터 횟수·오름)이고, 이 순서가 화면이 보여 주는 순서다. 같은 동기화를 다시 보내면 지갑이 비어 열린 게 없으므로 한 건도 더해지지 않는다.
 *    화면에 내려주는 응답과 «봤어요» 처리(`seen_at`)는 이 모듈의 일이 아니다(U8·U9).
 *  - 기록 실패는 열기를 되돌리지 않는다(이미 확정됐다). 로그만 남기고 `unseenRecorded: false`로 알린다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/types/database.generated'
import { runCapsuleAutoFill, type CapsuleAutoFillOptions, type CapsuleAutoFillResult } from './auto-fill'
import type { CountedCapsuleOpenPayload } from './open'

/** `capsule_unseen_results.payload`의 모양 버전. 화면(U9)이 읽는 쪽에서 분기할 수 있게 둔다 */
export const CAPSULE_UNSEEN_PAYLOAD_VERSION = 1

/** 이벤트 하나 = 열기 하나. 열린 순서대로 `payload.events`에 담긴다 */
export interface CapsuleUnseenEvent {
  openId: string
  /** 나온 개체(나온 순서). 잠긴 개체는 이름·그림 없이 등급과 여는 데 필요한 양만 있다(열기 응답과 같다) */
  items: CountedCapsuleOpenPayload['items']
  /** 열자마자 생긴 다음 캡슐 */
  next: CountedCapsuleOpenPayload['next']
  /** 횟수를 센 챕터(오르기 전). 센 게 없으면 null */
  chapterNo: number | null
  /** 이번 열기로 오른 챕터 번호 목록. 오르지 않았으면 빈 배열 */
  reachedChapters: number[]
  /** 센 뒤의 횟수(오르면 0). 센 게 없으면 null */
  chapterCount: number | null
}

export interface CapsuleUnseenPayload {
  version: typeof CAPSULE_UNSEEN_PAYLOAD_VERSION
  events: CapsuleUnseenEvent[]
}

/** 열린 순서 그대로 payload를 만든다 */
export function buildCapsuleUnseenPayload(opens: readonly CountedCapsuleOpenPayload[]): CapsuleUnseenPayload {
  return {
    version: CAPSULE_UNSEEN_PAYLOAD_VERSION,
    events: opens.map((o) => ({
      openId: o.openId,
      items: o.items,
      next: o.next,
      chapterNo: o.chapterNo,
      reachedChapters: o.reachedChapters,
      chapterCount: o.chapterCount,
    })),
  }
}

/** 열린 캡슐이 있으면 한 건을 남긴다. 던지지 않고 성공 여부를 돌려준다(열린 게 없으면 아무것도 하지 않고 true). */
export async function recordUnseenCapsuleResult(
  supabase: SupabaseClient,
  userId: string,
  opens: readonly CountedCapsuleOpenPayload[]
): Promise<boolean> {
  if (opens.length === 0) return true
  try {
    const { error } = await supabase
      .from('capsule_unseen_results')
      .insert({ user_id: userId, payload: buildCapsuleUnseenPayload(opens) as unknown as Json })
    if (error) {
      console.error(`[capsule-unseen] 보지 않은 캡슐 결과 기록 실패 — 열기는 확정됐다 (userId: ${userId}, 열린 캡슐: ${opens.length}):`, error)
      return false
    }
    return true
  } catch (e) {
    console.error(`[capsule-unseen] 보지 않은 캡슐 결과 기록 예외 — 열기는 확정됐다 (userId: ${userId}, 열린 캡슐: ${opens.length}):`, e)
    return false
  }
}

export interface SyncCapsuleAutoFillResult {
  autoFill: CapsuleAutoFillResult
  /** 자동으로 열린 캡슐이 있는가 — 동기화가 캡슐 열기 지표(`jamTriggersForCapsuleOpen`)를 다시 판정할지 정한다 */
  opened: boolean
  /** 보지 않은 결과 기록이 필요 없었거나 성공했다 */
  unseenRecorded: boolean
}

/** 동기화가 정산 직후 부른다. 던지지 않는다(파일 머리말). */
export async function runSyncCapsuleAutoFill(
  supabase: SupabaseClient,
  userId: string,
  options: Pick<CapsuleAutoFillOptions, 'rand' | 'now'> = {}
): Promise<SyncCapsuleAutoFillResult> {
  const autoFill = await runCapsuleAutoFill(supabase, userId, { ...options, skipRiseBadgeEvaluation: true })
  const unseenRecorded = await recordUnseenCapsuleResult(supabase, userId, autoFill.opens)
  return { autoFill, opened: autoFill.opens.length > 0, unseenRecorded }
}
