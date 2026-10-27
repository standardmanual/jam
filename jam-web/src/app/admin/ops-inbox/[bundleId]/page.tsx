/**
 * 기획 상세 (S3) — 티켓 20260930_1817, 운영툴 PRD §6
 *
 * 서버에서 읽어 렌더한다(`loading.tsx`를 만들지 않는다). **읽기만 한다** — 「도착 → 검토중」 전환은 화면(`OpsBundleWorkspace`)이
 * 따로 한 번 요청한다. 없는 ID는 `notFound()`, 조회 실패는 던져서 `admin/error.tsx`가 받는다.
 * 셸(`OpsBundleWorkspace`)의 슬롯은 함수라 서버 컴포넌트에서 넘길 수 없다 — 슬롯을 채운 client 래퍼(`OpsDecisionWorkspace`, 티켓 20260930_1818)를
 * 렌더한다. 시험 묶음이면 머리 오른쪽에 「...」 메뉴(시험 묶음 지우기)를 둔다.
 *
 * 밸런스 경고(티켓 20260930_1459)는 이 읽기 요청이 규칙과 서비스 상태로 계산한 결과(`detail.balance`)를 화면에 그대로 넘긴다.
 * 평가가 실패해도 상세는 열린다(실패 알림만 뜬다).
 * 예약 등록 요약(`detail.execution`, 티켓 20261002_1648)도 같은 읽기 요청이 세서 넘긴다 — 레지스트리를 화면으로 끌어오지 않으려고 계산은 서버가 한다.
 *
 * 제목은 기획 제목(`bundle.title`)이고, 없으면(옛 묶음) 대상 주차다. 제목이 있으면 그 아래 한 줄에 주차와 기간을 보인다
 * (티켓 20261026_2024). `author`·`bundle_id`·`item_key`는 제출자가 정한 값(자기 신고)이라 제목으로 쓰지 않는다.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { IconArrowLeft } from '@tabler/icons-react'
import { OpsDecisionWorkspace } from '@/components/admin/ops/OpsDecisionWorkspace'
import { OpsSampleDeleteMenu } from '@/components/admin/ops/OpsSampleDeleteMenu'
import { OpsStatusBadge } from '@/components/admin/ops/OpsStatusBadge'
import { formatWeekRange } from '@/lib/admin/opsInbox/labels'
import { getOpsBundleDetail } from '@/lib/admin/opsInbox/query'

interface OpsBundleDetailPageProps {
  params: Promise<{ bundleId: string }>
}

export default async function OpsBundleDetailPage({ params }: OpsBundleDetailPageProps) {
  const { bundleId } = await params
  const detail = await getOpsBundleDetail(bundleId)
  if (!detail) notFound()

  const { bundle, items, decisions, balance, execution, previewNames } = detail
  const range = formatWeekRange(bundle.week)
  const weekText = range ? `${range.label} (${range.range})` : '주차 없음'
  const title = bundle.title?.trim() ? bundle.title.trim() : null

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/admin/ops-inbox"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" aria-hidden="true" />
            운영플랜
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold break-keep wrap-break-word">{title ?? weekText}</h1>
            {bundle.isSample && <OpsStatusBadge type="sample" />}
            <span className="text-sm text-muted-foreground">에이전트 {bundle.author}</span>
          </div>
          {title && <p className="mt-1 text-sm text-muted-foreground break-keep wrap-break-word">{weekText}</p>}
          {bundle.hypothesis && (
            <p className="text-muted-foreground text-sm mt-1 line-clamp-2 max-w-3xl break-words">가설 {bundle.hypothesis}</p>
          )}
        </div>
        {bundle.isSample && <OpsSampleDeleteMenu bundleId={bundle.id} itemCount={items.length} />}
      </div>

      {/* 셸이 `useSearchParams`를 쓴다 — 다른 어드민 화면과 같은 이유로 Suspense로 감싼다. */}
      <Suspense>
        <OpsDecisionWorkspace
          bundleId={bundle.id}
          bundleFormatErrors={bundle.formatErrors}
          items={items}
          decisions={decisions}
          balance={balance}
          stages={bundle.stages}
          isSample={bundle.isSample}
          execution={execution}
          previewNames={previewNames}
        />
      </Suspense>
    </div>
  )
}
