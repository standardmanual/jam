/**
 * 기획 상세 (S3) — 티켓 20260930_1817, 운영툴 PRD §6
 *
 * 서버에서 읽어 렌더한다(`loading.tsx`를 만들지 않는다). **읽기만 한다** — 「도착 → 검토중」 전환은 화면(`OpsBundleWorkspace`)이
 * 따로 한 번 요청한다. 없는 ID는 `notFound()`, 조회 실패는 던져서 `admin/error.tsx`가 받는다.
 * 여기서는 슬롯 없이 셸을 렌더한다(슬롯은 함수라 서버 컴포넌트에서 넘길 수 없다 — 티켓 20260930_1818이 client 래퍼로 채운다).
 *
 * 제목은 대상 주차다. `author`·`bundle_id`·`item_key`는 제출자가 정한 값(자기 신고)이라 제목으로 쓰지 않는다.
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { IconArrowLeft } from '@tabler/icons-react'
import { OpsBundleWorkspace } from '@/components/admin/ops/OpsBundleWorkspace'
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

  const { bundle, items, decisions } = detail
  const range = formatWeekRange(bundle.week)

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/admin/ops-inbox"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <IconArrowLeft className="size-4" aria-hidden="true" />
          받은 기획함
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold">{range ? `${range.label} (${range.range})` : '주차 없음'}</h1>
          {bundle.isSample && <OpsStatusBadge type="sample" />}
          <span className="text-sm text-muted-foreground">에이전트 {bundle.author}</span>
        </div>
        {bundle.hypothesis && (
          <p className="text-muted-foreground text-sm mt-1 line-clamp-2 max-w-3xl break-words">가설 {bundle.hypothesis}</p>
        )}
      </div>

      {/* 셸이 `useSearchParams`를 쓴다 — 다른 어드민 화면과 같은 이유로 Suspense로 감싼다. */}
      <Suspense>
        <OpsBundleWorkspace
          bundleId={bundle.id}
          bundleFormatErrors={bundle.formatErrors}
          items={items}
          decisions={decisions}
        />
      </Suspense>
    </div>
  )
}
