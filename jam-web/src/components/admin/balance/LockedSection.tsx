/**
 * 밸런스 설정 «잠긴 아이템 배지» 구역 본문 (티켓 20261022_1133 1회, 20261028_1737 3회) — 서버 컴포넌트. 잠긴 아이템 배지를 포인트로 여는 비용의 등급별 값 4칸(`jam_policy.locked_points_*`)과,
 * 옛 채우기 방식에서 여는 데 필요한 양의 등급별 최소값 4칸(`jam_policy.locked_min_*`)을 편집한다. 옛 채우기 방식이 `20261030_0947`이 정할 때까지 남아 있어 최소값 칸을 지우지 않는다.
 * 칸 정의와 읽기·쓰기는 `lib/admin/balance/locked.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 *
 * 잠길 확률은 동기화와 한 값이라 여기서 편집하지 않는다(가정 나). 폼 위에 «동기화와 같은 값이에요» 안내만 두고 동기화 구역으로 이어 준다.
 * 폼 아래에는 최소값을 올렸을 때 배지에 따로 정한 값이 새 최소값보다 낮을 수 있다는 안내를 둔다(가정 라 — 저장을 막지 않는다. 여는 양은 배지 값이 먼저다, `resolveUnlockRequired`).
 */
import { Alert } from '@/components/admin/ui/alert'
import { LOCKED_BINDING } from '@/lib/admin/balance/locked'
import { SYNC_SECTION_ID } from '@/lib/admin/balance/sync'
import { BalanceSectionBody } from './BalanceSectionBody'

export const LOCKED_ROLL_NOTICE_PREFIX = '잠길 확률은 동기화와 같은 값이에요. 값을 바꾸려면 '
export const LOCKED_ROLL_NOTICE_LINK = '동기화 구역'
export const LOCKED_ROLL_NOTICE_SUFFIX = '에서 바꿔 주세요.'

export const LOCKED_POINTS_NOTICE =
  '여는 포인트는 아이템 배지가 유저에게 배정될 때 그 아이템 배지에 고정돼요. 값을 바꿔도 이미 배정된 아이템 배지의 여는 포인트는 그대로예요. 0으로 두면 포인트를 쓰지 않고 열려요. 퀘스트 전 유저가 처음 받는 잠긴 아이템 배지는 이 값과 상관없이 포인트 없이 열려요.'

export const LOCKED_AMOUNT_NOTICE =
  '«등급별 최소값»은 잼을 채워 여는 옛 방식의 값이에요. 아이템 배지에 여는 데 필요한 양을 따로 정해 둔 경우에는 그 값이 먼저 쓰여요. 최소값을 올려도 따로 정한 값은 바뀌지 않아서, 새 최소값보다 낮은 값이 남아 있을 수 있어요. 이미 잠긴 아이템 배지가 여는 데 필요한 양도 그대로예요.'

export function LockedRollNotice() {
  return (
    <Alert role="note">
      <p className="text-sm text-pretty break-keep wrap-break-word">
        {LOCKED_ROLL_NOTICE_PREFIX}
        <a href={`#${SYNC_SECTION_ID}`} className="font-medium underline underline-offset-4">
          {LOCKED_ROLL_NOTICE_LINK}
        </a>
        {LOCKED_ROLL_NOTICE_SUFFIX}
      </p>
    </Alert>
  )
}

export function LockedPointsNotice() {
  return <p className="text-xs text-muted-foreground text-pretty break-keep wrap-break-word">{LOCKED_POINTS_NOTICE}</p>
}

export function LockedAmountNotice() {
  return <p className="text-xs text-muted-foreground text-pretty break-keep wrap-break-word">{LOCKED_AMOUNT_NOTICE}</p>
}

export function LockedSection() {
  return (
    <div className="space-y-6">
      <LockedRollNotice />
      <BalanceSectionBody binding={LOCKED_BINDING} />
      <LockedPointsNotice />
      <LockedAmountNotice />
    </div>
  )
}
