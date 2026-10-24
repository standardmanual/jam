/**
 * 밸런스 설정 «배지와 포인트» 구역 본문 (티켓 20261022_1135 1회) — 서버 컴포넌트. 배지 포인트 일괄 값 5칸(`badge_point_policy`)을 편집한다:
 * 등급별 포인트 4칸과 레벨형 배지의 레벨마다 포인트 1칸.
 * 칸 정의와 읽기·쓰기는 `lib/admin/balance/badgepoints.ts`의 연결 객체가 담고, 화면 뼈대는 `BalanceSectionBody`가 맡는다.
 *
 * 폼 위에 안내를 둔다: 이 값은 새 배지의 기본값일 뿐 이미 있는 배지의 포인트나 이미 받은 포인트를 바꾸지 않는다는 것, 숨김 배지는 항상 0이라 칸이 없다는 것.
 */
import { Alert } from '@/components/admin/ui/alert'
import { BADGEPOINTS_BINDING } from '@/lib/admin/balance/badgepoints'
import { BalanceSectionBody } from './BalanceSectionBody'

export const BADGEPOINTS_NOTICE =
  '이 값은 새 배지의 기본값이에요. 이미 있는 배지의 포인트는 바뀌지 않고, 이미 받은 포인트도 그대로예요. 숨김 배지는 항상 0이라 여기서 정하지 않아요.'

export function BadgePointsNotice() {
  return (
    <Alert role="note">
      <p className="text-sm text-pretty break-keep wrap-break-word">{BADGEPOINTS_NOTICE}</p>
    </Alert>
  )
}

export function BadgePointsSection() {
  return (
    <div className="space-y-6">
      <BadgePointsNotice />
      <BalanceSectionBody binding={BADGEPOINTS_BINDING} />
    </div>
  )
}
