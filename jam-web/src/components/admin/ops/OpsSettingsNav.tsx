/**
 * 운영 설정(S7)의 구역 이동 링크 (티켓 20260930_1459 조각 B). 헤더(`h-14`) 아래에 붙어 따라온다(sticky). 구역이 2개 미만이면 그리지 않는다
 * — 구역이 하나뿐이면 숨고, 신호 기준값(조각 C) 구역이 붙은 지금은 보이며 슬랙 알림 대상(20261001_1221) 구역이 붙어도 같은 이동 링크에 한 줄이 는다.
 *
 * 링크는 같은 쪽의 `#구역 ID`로 간다(스크롤만 한다. 상태를 바꾸지 않는다).
 */
export interface OpsSettingsNavSection {
  id: string
  label: string
}

export interface OpsSettingsNavProps {
  sections: readonly OpsSettingsNavSection[]
}

export function OpsSettingsNav({ sections }: OpsSettingsNavProps) {
  if (sections.length < 2) return null
  return (
    <nav
      aria-label="설정 구역"
      className="sticky top-14 z-30 -mx-8 mb-6 border-b border-border bg-background/95 px-8 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="inline-flex min-h-11 items-center rounded px-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
