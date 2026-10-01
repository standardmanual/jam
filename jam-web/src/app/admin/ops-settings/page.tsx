/**
 * 운영 설정 (S7) — 티켓 20260930_1459 조각 B, 운영툴 PRD §6.2
 *
 * 운영툴이 알려 주는 기준을 확인하고 바꾸는 화면이다. 지금 구역은 「밸런스 규칙」 하나이고(구역 목록은 `sections.tsx`), 구역은 탭이 아니라 세로로
 * 쌓인다. 구역마다 `Suspense` + `skeleton`으로 따로 읽어서 한 구역이 실패해도 다른 구역은 보인다. 값을 바꾸는 것은 구역 안의 카드(클라이언트)이고
 * `PATCH /api/admin/ops-rules/[ruleKey]`로 저장한다. 서버 컴포넌트는 읽기만 한다.
 *
 * 구역 이동 링크는 구역이 2개 이상일 때만 보인다. 규칙 카드의 앵커는 `#rule-<규칙 키>`이고 기획 상세의 「밸런스 규칙 보기」가 이 앵커로 온다.
 */
import { Suspense } from 'react'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { OpsSettingsNav } from '@/components/admin/ops/OpsSettingsNav'
import { OpsSettingsSection } from '@/components/admin/ops/OpsSettingsSection'
import { SETTINGS_PAGE_SUBTITLE, SETTINGS_PAGE_TITLE } from '@/lib/admin/opsInbox/balance/settings'
import { OPS_SETTINGS_SECTIONS } from './sections'

function SectionSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="불러오는 중">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-44 w-full rounded-lg" />
      ))}
    </div>
  )
}

export default function OpsSettingsPage() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{SETTINGS_PAGE_TITLE}</h1>
        <p className="text-muted-foreground text-sm mt-1">{SETTINGS_PAGE_SUBTITLE}</p>
      </div>

      <OpsSettingsNav sections={OPS_SETTINGS_SECTIONS} />

      <div className="max-w-3xl space-y-12">
        {OPS_SETTINGS_SECTIONS.map(({ id, title, description, Body }) => (
          <OpsSettingsSection key={id} id={id} title={title} description={description}>
            <Suspense fallback={<SectionSkeleton />}>
              <Body />
            </Suspense>
          </OpsSettingsSection>
        ))}
      </div>
    </div>
  )
}
