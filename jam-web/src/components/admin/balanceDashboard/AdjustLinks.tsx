/**
 * 밸런스 지표 카드의 «바로 조정» 링크 (티켓 20261022_1136 1회 b, 운영 로직 19.2절)
 *
 * 지표를 움직이는 수치가 있는 밸런스 설정 구역으로 보낸다. **링크는 구역 단위(`/admin/balance#<구역 키>`)만 쓴다.**
 * 칸 단위 링크(`#구역-칸`)는 구역 본문이 `Suspense`로 늦게 그려져 스크롤이 어긋날 수 있어 쓰지 않는다(구역 틀 `OpsSettingsSection`은 `Suspense` 밖이라 앵커가 먼저 있다).
 * 월 아이템 배지(지표 3)처럼 구역이 둘 이상이면 모두 보인다(월 개수가 동기화와 캡슐 두 길의 합이다).
 *
 * 구역 이름은 호출하는 쪽이 `BALANCE_SECTIONS`에서 만들어 넘긴다(구역 레지스트리를 끌어오면 구역 본문 컴포넌트까지 딸려 와서 이 파일은 순수하게 둔다).
 * 이름을 못 찾는 구역은 그리지 않는다. 구역 키가 레지스트리에 있는지는 `balanceDashboard/__tests__/targets.test.ts`가 지킨다.
 */
import Link from 'next/link'
import { Button } from '@/components/admin/ui/button'
import type { AdjustTarget } from '@/lib/admin/balanceDashboard/types'

export function balanceSectionHref(sectionId: string): string {
  return `/admin/balance#${sectionId}`
}

export interface AdjustLinksProps {
  targets: readonly AdjustTarget[]
  /** 구역 키 → 구역 이름(`BALANCE_SECTIONS`의 `label`) */
  sectionLabels: Readonly<Record<string, string>>
}

export function AdjustLinks({ targets, sectionLabels }: AdjustLinksProps) {
  const links = targets.flatMap((target) => {
    const label = sectionLabels[target.sectionId]
    return label === undefined ? [] : [{ sectionId: target.sectionId, label }]
  })
  if (links.length === 0) return null

  return (
    <div className="space-y-2" data-adjust-links="">
      <p className="text-sm font-medium break-keep wrap-break-word">바로 조정</p>
      {links.length > 1 && (
        <p className="text-xs text-muted-foreground text-pretty break-keep wrap-break-word">
          이 지표는 아래 구역의 수치가 함께 정해요
        </p>
      )}
      <ul className="flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.sectionId}>
            <Button asChild variant="outline" size="sm" className="break-keep">
              <Link href={balanceSectionHref(link.sectionId)}>{link.label} 구역에서 바꾸기</Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
