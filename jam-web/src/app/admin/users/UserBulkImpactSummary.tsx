import type { UserBulkAction, UserBulkImpact } from '@/lib/admin/user-bulk'

interface UserBulkImpactSummaryProps {
  action: UserBulkAction
  /** 미리보기(`dry_run`) 응답의 `impact` */
  impact: Record<string, number> | undefined
  /** 어드민·본인 제외 말고 건너뛰는 항목이 있는지 알리기 위한 건너뜀 전체 수 */
  skippedCount: number
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}P`

/**
 * 유저 일괄 처리 확인창의 영향 안내(티켓 20260924_0951, 상위 티켓 §2 미리보기). 수치는 서버가
 * 계산한 `impact`를 그대로 읽는다 — 화면이 값을 만들지 않는다.
 */
export function UserBulkImpactSummary({ action, impact, skippedCount }: UserBulkImpactSummaryProps) {
  if (!impact) return <>영향을 확인하지 못했어요. 창을 닫고 다시 시도해 주세요.</>
  const i = impact as unknown as UserBulkImpact
  const excluded = i.excludedAdminCount + i.excludedSelfCount

  return (
    <div className="space-y-1">
      <p>
        대상 {i.targetCount}명
        {excluded > 0 && (
          <>
            {' '}
            (어드민 {i.excludedAdminCount}명·본인 {i.excludedSelfCount}명은 자동으로 제외했어요)
          </>
        )}
        {excluded === 0 && skippedCount > 0 && <> ({skippedCount}명은 찾을 수 없어 건너뛰어요)</>}
      </p>

      {action === 'grant_points' && (
        <>
          <p>
            {i.totalAmount !== undefined && i.totalAmount < 0 ? '회수' : '지급'} 합계 {won(Math.abs(i.totalAmount ?? 0))}
          </p>
          {(i.revokeSkippedCount ?? 0) > 0 && (
            <p className="text-red-600 break-keep wrap-break-word">
              잔액이 요청 금액보다 적어 회수하지 못하고 건너뛰는 유저 {i.revokeSkippedCount}명
            </p>
          )}
          <p>운영진 알림 {i.notificationCount ?? 0}건이 발송돼요.</p>
        </>
      )}

      {action === 'reset' && (
        <>
          <p>배지 이력 {i.badgeCount ?? 0}건이 지워져요.</p>
          <p>아이템 {i.itemCount ?? 0}개가 영구 삭제돼요.</p>
          <p>미션 완료 기록 {i.missionCompletionCount ?? 0}건이 지워져요.</p>
        </>
      )}

      {action === 'delete' && (
        <>
          <p>배지 이력 {i.badgeCount ?? 0}건이 지워져요.</p>
          <p className="break-keep wrap-break-word">아이템 {i.vanishingItemCount ?? 0}개는 없어짐으로 처리돼요.</p>
          <p>포인트 잔액 {won(i.pointBalanceTotal ?? 0)}이 사라져요.</p>
          <p>Strava 연동 {i.stravaConnectionCount ?? 0}건이 끊겨요.</p>
          <p className="break-keep wrap-break-word">
            방문·부정 이용 기록 {i.retainedRecordCount ?? 0}건은 법정 기간 동안 따로 보관돼요.
          </p>
        </>
      )}

      <p className="font-medium text-red-600">되돌릴 수 없어요.</p>
    </div>
  )
}
