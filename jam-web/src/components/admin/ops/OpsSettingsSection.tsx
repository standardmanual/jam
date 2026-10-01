import type { ReactNode } from 'react'

/**
 * 운영 설정(S7)의 구역 틀 (티켓 20260930_1459 조각 B, 채원 확정 설계 「조각 B」). 구역은 탭이 아니라 세로로 쌓인다.
 * 구역마다 이 틀 하나로 감싸고, 안쪽 본문은 `Suspense` + `skeleton`으로 따로 읽는다(한 구역이 실패해도 다른 구역은 보인다).
 * 구역을 더하는 일은 `app/admin/ops-settings/sections.tsx`의 배열 한 줄과 구역 본문 컴포넌트 하나다.
 *
 * 서버·클라이언트 어디서나 쓰는 순수 틀이다. `scroll-mt-20`은 헤더(`h-14`) 아래로 앵커가 닿게 한다.
 */
export interface OpsSettingsSectionProps {
  /** 구역 앵커 ID(`OpsSettingsNav`의 링크가 가리킨다). */
  id: string
  title: string
  /** 제목 아래 설명 문단들. */
  description?: readonly string[]
  children: ReactNode
}

export function OpsSettingsSection({ id, title, description = [], children }: OpsSettingsSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 space-y-4">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        {description.map((paragraph) => (
          <p key={paragraph} className="text-sm text-muted-foreground">
            {paragraph}
          </p>
        ))}
      </div>
      {children}
    </section>
  )
}
