/**
 * 동기화 안의 캡슐 자동 채움 단계 — 자동 채움을 돌리고 열기·챕터 오름 여부를 돌려준다 (티켓 20261028_1733 3회)
 *
 * 동기화(`lib/strava/sync.ts`)가 잼 정산 직후에 부른다. **절대 던지지 않는다** — 채움·열기 어디서 실패해도 동기화는 계속된다.
 *
 * 규칙
 *  - 자동 채움은 `runCapsuleAutoFill`(던지지 않는 쪽)이다. 챕터 오름 처리(100%에 닿은 호출마다 한 번, 열기 여부와 무관)에서 챕터 배지 판정은 건너뛴다(`skipRiseBadgeEvaluation`):
 *    동기화 끝 판정(`JAM_SYNC_TRIGGERS`의 `chapter_reached`)이 DB의 지금 챕터를 읽어 이어서 판정하고, 그 결과가 같은 동기화의 결산 알림에 실린다.
 *    건너뛰지 않으면 같은 판정이 두 번 돌고, 챕터 배지가 결산보다 먼저 별도 알림으로 나간다(발급 자체는 UNIQUE로 한 번뿐). 소식·피드는 오름 처리가 그대로 보낸다.
 *    새 활동이 없는 경로는 정상 경로의 `JAM_SYNC_TRIGGERS`를 거치지 않으므로, 챕터가 올랐는지(`chapterRose`)를 돌려줘 호출부가 `chapter_reached`를 끝 판정에 더하게 한다
 *    (열기가 인벤토리에 막혀 멈춘 동기화에서 챕터가 올라도 판정이 밀리지 않는다).
 *  - 캡슐 소식은 보내지 않는다(티켓 20261105_0105 T5): «거의 찼어요»(`capsule_nearly_full`) 단계 소식과 `user_capsules.alert_stage` 쓰기를 걷었다.
 *    막히는 순간은 홈 상단 막힘 카드(`CapsuleBlockedCard`)가 알린다. 과거에 만든 소식 행은 그대로 표시된다(enum 값도 남긴다).
 *  - 열린 결과를 `capsule_unseen_results`에 남기지 않는다(티켓 20261106_1028): 합친 연출을 걷어 읽는 화면이 없다. 열린 배지는 인벤토리에서 확인한다.
 *    표와 읽기·«봤어요» 라우트, 옛 행은 그대로 둔다(정리는 후속).
 *
 * 호출 단위(티켓 20261028_1735 2회): 동기화뿐 아니라 서비스 활동 잼 지급 직후(`awardServiceJam`)에도 같은 단계를 부른다. 같은 유저의 자동 채움이 이미 돌고 있어 건너뛴 호출(`stopped: 'busy'`)은
 *    열린 캡슐이 없으므로 `opened`·`chapterRose`도 거짓이다.
 *
 * 서버 전용이다(service_role 클라이언트로 쓴다).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runCapsuleAutoFill, type CapsuleAutoFillOptions, type CapsuleAutoFillResult } from './auto-fill'

/** `capsule_unseen_results.payload`의 모양 버전. 남아 있는 옛 행을 읽는 쪽(`unseen.ts`)이 분기에 쓴다 — 새 행은 더 쓰지 않는다 */
export const CAPSULE_UNSEEN_PAYLOAD_VERSION = 1

export interface SyncCapsuleAutoFillResult {
  autoFill: CapsuleAutoFillResult
  /** 자동으로 열린 캡슐이 있는가 — 동기화가 캡슐 열기 지표(`jamTriggersForCapsuleOpen`)를 다시 판정할지 정한다 */
  opened: boolean
  /**
   * 이번 동기화에서 챕터가 올랐는가(열기가 막힌 채 챕터만 오른 경우 포함). 챕터 배지 판정을 건너뛰고 불렀으므로(`skipRiseBadgeEvaluation`),
   * 정상 경로의 `JAM_SYNC_TRIGGERS`를 거치지 않는 호출부(새 활동이 없는 경로)는 이 값이 참일 때 `chapter_reached`를 끝 판정에 더한다
   */
  chapterRose: boolean
}

/** 동기화가 정산 직후 부른다. 던지지 않는다(파일 머리말). */
export async function runSyncCapsuleAutoFill(
  supabase: SupabaseClient,
  userId: string,
  options: Pick<CapsuleAutoFillOptions, 'rand' | 'now'> = {}
): Promise<SyncCapsuleAutoFillResult> {
  const autoFill = await runCapsuleAutoFill(supabase, userId, { ...options, skipRiseBadgeEvaluation: true })
  return { autoFill, opened: autoFill.opens.length > 0, chapterRose: autoFill.reachedChapters.length > 0 }
}
