/**
 * 배포 현황 카드 네 장 (티켓 20261026_2028 3회차, PRD admin-boards §8)
 *
 * (1) 상태 글자(동결·배포 가능·배포할 것 없음·확인 안 됨)와 동결 사유 (2) staging이 main보다 앞선 커밋 수
 * (3) 마지막 프로덕션 배포(KST 시각·커밋 7자리·상태, 배포 기록이 없어 main 마지막 커밋 시각으로 대신했으면 그렇게 말한다) (4) 다음 배포 일정.
 * 상태는 색만 쓰지 않고 기호와 글자를 함께 쓴다. 상태가 없는 서버·클라이언트 공용 컴포넌트다.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import type { DeployLabel, DeployStatus } from '@/lib/admin/devBoard/types'
import { formatKstDateTime, shortSha } from '@/lib/admin/devBoard/view'

/** 값을 읽지 못했을 때 쓰는 글자 */
export const UNKNOWN_TEXT = '확인 안 됨'

const LABEL_SYMBOL: Record<DeployLabel, string> = {
  동결: '■',
  '배포 가능': '●',
  '배포할 것 없음': '–',
  '확인 안 됨': '!',
}

const LABEL_TONE: Record<DeployLabel, string> = {
  동결: 'text-amber-700',
  '배포 가능': 'text-emerald-700',
  '배포할 것 없음': 'text-muted-foreground',
  '확인 안 됨': 'text-orange-700',
}

const DEPLOY_STATE_TEXT: Record<string, string> = {
  success: '성공',
  failure: '실패',
  error: '오류',
  pending: '진행 중',
  in_progress: '진행 중',
  queued: '대기 중',
  inactive: '교체됨',
}

function StatCard({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <Card data-testid={testId} className="min-w-0">
      <CardHeader className="p-4 pb-1">
        <CardTitle role="heading" aria-level={3} className="text-sm font-medium text-muted-foreground break-keep wrap-break-word">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 p-4 pt-0">{children}</CardContent>
    </Card>
  )
}

export function DeployStatusCards({ deploy }: { deploy: DeployStatus }) {
  const last = deploy.lastDeploy
  const sha = last ? shortSha(last.sha) : ''
  const lastTime = last ? formatKstDateTime(last.at) : ''
  const stateText = last?.state ? (DEPLOY_STATE_TEXT[last.state] ?? last.state) : ''
  return (
    <section aria-labelledby="dev-board-deploy-heading" className="space-y-3">
      <h2 id="dev-board-deploy-heading" className="text-base font-semibold text-foreground">
        배포 현황
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="배포 상태" testId="deploy-state">
          <p data-label={deploy.label} className={`text-lg font-semibold break-keep wrap-break-word ${LABEL_TONE[deploy.label]}`}>
            <span aria-hidden="true">{LABEL_SYMBOL[deploy.label]} </span>
            {deploy.label}
          </p>
          {deploy.frozen && deploy.reason !== '' ? (
            <p className="text-sm text-muted-foreground text-pretty break-keep wrap-break-word">{deploy.reason}</p>
          ) : null}
        </StatCard>

        <StatCard title="staging과 main의 차이" testId="deploy-ahead">
          {deploy.ahead === null ? (
            <p className="text-lg font-semibold text-orange-700 break-keep wrap-break-word">
              <span aria-hidden="true">! </span>
              {UNKNOWN_TEXT}
            </p>
          ) : (
            <p className="text-lg font-semibold break-keep wrap-break-word">
              staging이 main보다 <span className="tabular-nums">{deploy.ahead.toLocaleString('en-US')}</span>커밋 앞서요
            </p>
          )}
        </StatCard>

        <StatCard title="마지막 프로덕션 배포" testId="deploy-last">
          {last === null || lastTime === '' ? (
            <p className="text-lg font-semibold text-orange-700 break-keep wrap-break-word">
              <span aria-hidden="true">! </span>
              {UNKNOWN_TEXT}
            </p>
          ) : (
            <>
              <p className="text-lg font-semibold tabular-nums break-keep wrap-break-word">{lastTime}</p>
              <p className="text-sm text-muted-foreground break-keep wrap-break-word">
                {[sha !== '' ? `커밋 ${sha}` : '', stateText].filter((part) => part !== '').join(' · ')}
              </p>
              {last.estimated ? (
                <p data-estimated="" className="text-xs text-amber-700 break-keep wrap-break-word">
                  <span aria-hidden="true">▲ </span>main 마지막 커밋 시각이에요
                </p>
              ) : null}
            </>
          )}
        </StatCard>

        <StatCard title="다음 배포 일정" testId="deploy-next">
          {deploy.nextDeploy === '' ? (
            <p className="text-lg font-semibold text-orange-700 break-keep wrap-break-word">
              <span aria-hidden="true">! </span>
              {UNKNOWN_TEXT}
            </p>
          ) : (
            <p className="text-lg font-semibold text-pretty break-keep wrap-break-word">{deploy.nextDeploy}</p>
          )}
        </StatCard>
      </div>
    </section>
  )
}
