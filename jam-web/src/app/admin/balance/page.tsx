/**
 * 밸런스 설정 (티켓 20261022_1132, 운영 로직 19.1절)
 *
 * 서비스의 밸런스 수치를 코드 수정 없이 바꾸는 화면이다. 구역(잼, 이후 동기화·캡슐 등)은 탭이 아니라 세로로 쌓인다(구역 목록은 `lib/admin/balance/sections.tsx`).
 * 구역마다 `Suspense` + `skeleton`으로 따로 읽어서 한 구역이 실패해도 다른 구역은 보이고, 저장도 구역 단위다(`PUT /api/admin/balance/[section]`).
 * 서버 컴포넌트는 읽기만 한다. 구역 이동 링크(`OpsSettingsNav`)는 구역이 2개 이상일 때만 보인다.
 * 머리의 «밸런스 지표 보기»는 지표 6개를 목표와 견주는 화면(`/admin/balance/dashboard`, 티켓 20261022_1136)으로 간다. 그 화면의 «바로 조정»이 이 화면의 구역(`#구역 키`)으로 돌아온다.
 *
 * 공용 DB를 staging과 프로덕션이 함께 쓰므로 저장은 바로 프로덕션에 반영된다. 설정을 매 요청 읽기 때문에 정적으로 굳지 않게 `force-dynamic`이다.
 */
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { OpsSettingsNav } from '@/components/admin/ops/OpsSettingsNav'
import { OpsSettingsSection } from '@/components/admin/ops/OpsSettingsSection'
import { BALANCE_SECTIONS } from '@/lib/admin/balance/sections'

export const dynamic = 'force-dynamic'

function SectionSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="불러오는 중">
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
    </div>
  )
}

export default function BalanceSettingsPage() {
  const navSections = BALANCE_SECTIONS.map((section) => ({ id: section.binding.id, label: section.label }))
  return (
    <div className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-balance break-keep wrap-break-word">밸런스 설정</h1>
          <p className="text-muted-foreground text-sm mt-1 text-pretty break-keep wrap-break-word">
            서비스의 밸런스 수치를 코드 수정 없이 바꿔요. 저장하면 staging과 프로덕션에 바로 반영되고, 바꾼 내용은 구역마다 최근 변경에 남아요.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="break-keep">
          <Link href="/admin/balance/dashboard">밸런스 지표 보기</Link>
        </Button>
      </div>

      <OpsSettingsNav sections={navSections} />

      <div className="max-w-4xl space-y-12">
        {BALANCE_SECTIONS.map(({ binding, title, description, Body }) => (
          <OpsSettingsSection key={binding.id} id={binding.id} title={title} description={description}>
            <Suspense fallback={<SectionSkeleton />}>
              <Body />
            </Suspense>
          </OpsSettingsSection>
        ))}
      </div>
    </div>
  )
}
