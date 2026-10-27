/**
 * JAM 2.0 묶음 진행 (티켓 20261026_2028 3회차, PRD admin-boards §8)
 *
 * 묶음마다 한 줄: 「묶음 N · 이름」, 끝남·진행·남음 개수 글자, 막대. 하위 티켓이 없는 묶음은 막대 없이 「하위 티켓 없음」이다.
 * 상태가 없는 서버·클라이언트 공용 컴포넌트다.
 */
import { Card } from '@/components/admin/ui/card'
import type { BundleProgress } from '@/lib/admin/devBoard/types'
import { bundleBarOf } from '@/lib/admin/devBoard/view'
import { BundleBar } from './BundleBar'

export function BundleProgressList({ bundles }: { bundles: readonly BundleProgress[] }) {
  return (
    <section aria-labelledby="dev-board-bundles-heading" className="space-y-3">
      <div>
        <h2 id="dev-board-bundles-heading" className="text-base font-semibold text-foreground">
          JAM 2.0 묶음
        </h2>
        <p className="mt-1 text-xs text-muted-foreground text-pretty break-keep wrap-break-word">
          묶음 티켓 아래 하위 티켓 전체를 세요
        </p>
      </div>
      <Card>
        <ul className="divide-y divide-border">
          {bundles.map((bundle) => {
            const ratio = bundleBarOf(bundle)
            const summary = `끝남 ${bundle.done} · 진행 ${bundle.active} · 남음 ${bundle.remaining}`
            return (
              <li key={bundle.ticketId} data-bundle={bundle.number} className="space-y-1.5 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium break-keep wrap-break-word">
                    묶음 {bundle.number} · {bundle.name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums break-keep wrap-break-word">
                    {ratio === null ? '하위 티켓 없음' : `${summary} (전체 ${bundle.total})`}
                  </p>
                </div>
                {ratio === null ? null : <BundleBar ratio={ratio} label={`묶음 ${bundle.number}: ${summary}`} />}
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}
