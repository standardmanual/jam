/**
 * 밸런스 설정 «인벤토리» 구역 본문 (티켓 20261022_1134 1회) — 서버 컴포넌트. 인벤토리 최대치 한 칸(`inventory_policy.max_slots`)을 편집한다.
 * 옛 «인벤토리 최대치» 화면(`/admin/inventory-policy`)을 이 구역이 대신한다. 칸 정의와 읽기·쓰기는 `lib/admin/balance/inventory.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 *
 * 이 구역은 저장하면 **기존 유저 전원의 인벤토리가 한 번에 바뀌는** 일괄 작업이다. 공용 폼에 일반 확인창을 더하지 않기로 해서(사용자 결정) 폼 위에 안내 한 줄을 둔다:
 * «저장하면 전체 유저 N명의 인벤토리 최대치가 즉시 바뀌어요». N은 옛 화면의 «적용 대상 유저 수»와 같은 값(`getInventoryUserCount`, `inventory` 표의 행 수)이다.
 * 유저 수를 읽지 못해도 구역은 열린다(N 없이 같은 뜻의 문장을 보인다).
 */
import { Alert } from '@/components/admin/ui/alert'
import { INVENTORY_BINDING } from '@/lib/admin/balance/inventory'
import { formatBalanceNumber } from '@/lib/admin/balance/fields'
import { getInventoryUserCount } from '@/lib/inventory/policy'
import { BalanceSectionBody } from './BalanceSectionBody'

export const INVENTORY_APPLY_NOTICE_FALLBACK = '저장하면 전체 유저의 인벤토리 최대치가 즉시 바뀌어요.'

/** 안내 문장. 유저 수를 모르면(`null`) N 없이 같은 뜻으로 쓴다. */
export function inventoryApplyNotice(userCount: number | null): string {
  if (userCount === null) return INVENTORY_APPLY_NOTICE_FALLBACK
  return `저장하면 전체 유저 ${formatBalanceNumber(userCount)}명의 인벤토리 최대치가 즉시 바뀌어요.`
}

export function InventoryNotice({ userCount }: { userCount: number | null }) {
  return (
    <Alert role="note">
      <p className="text-sm text-pretty break-keep wrap-break-word">{inventoryApplyNotice(userCount)}</p>
    </Alert>
  )
}

async function readUserCount(): Promise<number | null> {
  try {
    return await getInventoryUserCount()
  } catch (error) {
    console.error('[admin/balance] inventory 적용 대상 유저 수 조회 실패:', error instanceof Error ? error.message : error)
    return null
  }
}

export async function InventorySection() {
  const userCount = await readUserCount()
  return (
    <div className="space-y-6">
      <InventoryNotice userCount={userCount} />
      <BalanceSectionBody binding={INVENTORY_BINDING} />
    </div>
  )
}
