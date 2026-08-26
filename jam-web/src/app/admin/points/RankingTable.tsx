'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { createColumnHelper, useTable } from '@tanstack/react-table'
import { dataTableFeatures, type DataTableFeatures } from '@/components/admin/data-table/features'
import { DataTable } from '@/components/admin/data-table/data-table'
import type { RankingEntry } from '@/lib/points/summary'

interface RankingTableProps {
  title: string
  rows: RankingEntry[]
  /** 링크 대상 경로 — `linkPerItem`이 true면 `${hrefBase}/${id}`, false면 `hrefBase` 고정 */
  hrefBase: string
  /** 배지 순위는 항목별 상세 페이지가 있어 true, 미션 순위는 상세 페이지가 없어 false(항상 목록으로) */
  linkPerItem: boolean
}

const columnHelper = createColumnHelper<DataTableFeatures, RankingEntry>()

/**
 * 배지별/미션별 발행량 순위 테이블(20260826_015) — 3단계a 공용 Data Table 컴포넌트로
 * 전환했다. `rows`가 이미 발행량 내림차순으로 정렬된 "순위" 목록이라(서버에서 상위 10건만
 * 계산) 헤더 클릭 정렬은 제공하지 않는다 — 열면 순번(1·2·3…)과 실제 정렬 기준이 어긋난다.
 *
 * `href` 콜백 대신 `hrefBase`/`linkPerItem` 문자열 조합을 쓴다 — 함수는 서버 컴포넌트
 * (`page.tsx`)에서 클라이언트 컴포넌트로 직렬화해 넘길 수 없다(RSC 제약, 구현 중 실제
 * 브라우저 검증에서 500 에러로 발견 — 완료 기록 alert 참고).
 */
export function RankingTable({ title, rows, hrefBase, linkPerItem }: RankingTableProps) {
  const columns = useMemo(
    () => columnHelper.columns([
      columnHelper.display({
        id: 'rank',
        header: '',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => <span className="text-muted-foreground w-8 inline-block">{row.index + 1}</span>,
      }),
      columnHelper.accessor('name', {
        id: 'name',
        header: '이름',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Link href={linkPerItem ? `${hrefBase}/${row.original.id}` : hrefBase} className="hover:underline">
            {row.original.name}
          </Link>
        ),
      }),
      columnHelper.accessor('total', {
        id: 'total',
        header: '발행량',
        enableSorting: false,
        enableHiding: false,
        cell: ({ getValue }) => (
          <span className="text-right font-bold block">{getValue().toLocaleString('ko-KR')}P</span>
        ),
      }),
    ]),
    [hrefBase, linkPerItem]
  )

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns,
    getRowId: (row) => row.id,
  })

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">{title}</h2>
      <DataTable table={table} columnCount={columns.length} emptyMessage="발행 내역 없음" />
    </div>
  )
}
