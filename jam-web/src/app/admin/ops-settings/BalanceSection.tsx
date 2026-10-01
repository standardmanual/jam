/**
 * 운영 설정(S7) 「밸런스 규칙」 구역 본문 (티켓 20260930_1459 조각 B) — 서버 컴포넌트.
 *
 * 규칙(`ops_rules`의 밸런스 묶음)과 지금 열린 컬렉션 수를 읽어 `OpsBalanceSettings`(클라이언트)에 넘긴다. 읽기만 한다.
 * 규칙을 읽지 못하면 던지지 않고 `rules: null`로 넘겨 이 구역만 오류 카드가 되게 한다(다른 구역은 그대로 보인다. 서비스 클라이언트를 만들지 못한 경우도 같다).
 * 열린 컬렉션 수를 읽지 못해도 구역은 열리고, R1 카드의 「지금 서비스」 상자만 「열린 컬렉션 수를 읽지 못했어요」가 된다(저장은 막지 않는다).
 */
import { createServiceClient } from '@/lib/supabase/server'
import { listOpsRules } from '@/lib/admin/opsInbox/balance/save'
import type { OpsRuleRecord } from '@/lib/admin/opsInbox/balance/rules'
import { loadOpenCollectionsNow } from '@/lib/admin/opsInbox/balance/state'
import { OpsBalanceSettings } from '@/components/admin/ops/OpsBalanceSettings'

async function readBalanceSection(): Promise<{ rules: OpsRuleRecord[] | null; openCollectionsNow: number | null }> {
  try {
    const supabase = createServiceClient()
    const [rules, open] = await Promise.all([
      listOpsRules(supabase, 'balance').catch((error: unknown) => {
        console.error('[admin/ops-settings] 밸런스 규칙 조회 실패:', error)
        return null
      }),
      loadOpenCollectionsNow(supabase),
    ])
    return { rules, openCollectionsNow: open.ok ? open.data : null }
  } catch (error) {
    console.error('[admin/ops-settings] 밸런스 구역 준비 실패:', error)
    return { rules: null, openCollectionsNow: null }
  }
}

export async function BalanceSection() {
  const { rules, openCollectionsNow } = await readBalanceSection()
  return <OpsBalanceSettings rules={rules} openCollectionsNow={openCollectionsNow} />
}
