'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import TopNav from '@/components/ui/TopNav'
import Button from '@/components/ui/Button'
import ListRowCard from '@/components/ui/ListRowCard'
import SlidingTabs, { type SlidingTabItem } from '@/components/ui/SlidingTabs'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { InboxIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'
import type { VocItem, VocSortKey } from '@/app/api/voc/route'
import VocPagination from './VocPagination'

/**
 * VOC CS 게시판 (티켓 20260828_1921).
 *
 * 20260828_1548의 Notion iframe 임베드 임시 채널을 전면 대체하는 정식 버전.
 * Google Sheets(Tally 연동)를 데이터 소스로 쓴다 — Supabase 미사용, `/api/voc`가
 * 유일한 접근 경로다(클라이언트는 시트에 직접 접근하지 않는다).
 *
 * TopNav/TabBar는 다른 (main) 페이지와 동일하게 노출한다 — 이전 티켓의
 * "임시라 TabBar 제외" 결정을 이번 정식화로 뒤집는다.
 */

const TALLY_URL = 'https://tally.so/r/BzWqY7'

const SORT_TABS: SlidingTabItem<VocSortKey>[] = [
  { key: 'latest', label: d.voc.sortLatest },
  { key: 'answered', label: d.voc.sortAnswered },
]

function formatDateTime(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const CHIP_BASE_CLASS =
  'inline-flex items-center gap-1 text-[length:var(--text-caption)] leading-none px-2 py-1 rounded-[var(--radius-tags)]'
const CHIP_CLASS = `${CHIP_BASE_CLASS} bg-surface text-text`
/** 유형(카테고리) 칩 — 밝은 그레이 */
const CATEGORY_CHIP_CLASS = `${CHIP_BASE_CLASS} bg-[color:var(--color-base-grey-200)] text-[color:var(--color-base-grey-800)]`
/**
 * 상태 칩 색상 — 문의중=밝은 레드, 확인중=밝은 블루, 답변완료=밝은 그린(기존
 * `--color-rarity-rare` 토큰 재사용, contrast-safe text 페어 포함).
 */
const STATUS_CHIP_CLASS: Record<string, string> = {
  문의중: `${CHIP_BASE_CLASS} bg-[#ff6b6b] text-[#1a1a1a]`,
  확인중: `${CHIP_BASE_CLASS} bg-[#4dabf7] text-[#1a1a1a]`,
  답변완료: `${CHIP_BASE_CLASS} bg-[color:var(--color-rarity-rare)] text-[color:var(--color-rarity-rare-text)]`,
}

// "심각도 {severity}/5" 템플릿에서 숫자 부분만 볼드+포인트 컬러로 강조한다
// (FeedSection.tsx의 eventCheckinRepeat 분할 패턴과 동일).
const [SEVERITY_PREFIX, SEVERITY_SUFFIX] = d.voc.severityLabel.split('{severity}')

function VocCard({ item }: { item: VocItem }) {
  return (
    <ListRowCard
      trailing={<span className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text/60">#{item.number}</span>}
    >
      {/* 상태값, 날짜, 카테고리 */}
      <div className="flex flex-wrap items-center gap-[var(--spacing-8)] mb-[var(--spacing-8)]">
        <span className={STATUS_CHIP_CLASS[item.status] ?? CHIP_CLASS}>{item.status}</span>
        <span className={CHIP_CLASS}>
          {SEVERITY_PREFIX}
          <strong className="font-bold text-[color:var(--color-primary)]">{item.severity}</strong>
          {SEVERITY_SUFFIX}
        </span>
        {item.categories.map((category) => (
          <span key={category} className={CATEGORY_CHIP_CLASS}>{category}</span>
        ))}
        <span className="text-[length:var(--text-caption)] leading-none text-text/60">{formatDateTime(item.submittedAt)}</span>
      </div>

      {/* 상세 내용 */}
      <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] text-text whitespace-pre-wrap">
        {item.text}
      </p>

      {/* 답변 — 상태=답변완료일 때만. 답변자는 실명 대신 고정된 JAM 로고로만 표시 */}
      {item.answer && (
        <div className="mt-[var(--spacing-16)] rounded-[var(--radius-cards)] bg-white/[0.04] p-[var(--spacing-16)] flex flex-col gap-[var(--spacing-8)]">
          <div className="flex items-center gap-[var(--spacing-8)]">
            <Image src="/jam-logo-white.png" alt="JAM!" width={2238} height={925} className="h-4 w-auto" />
            <span className="text-[length:var(--text-caption)] leading-none text-text/60">{d.voc.answerLabel}</span>
            {item.answeredAt && (
              <span className="text-[length:var(--text-caption)] leading-none text-text/40">· {formatDateTime(item.answeredAt)}</span>
            )}
          </div>
          <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text whitespace-pre-wrap">
            {item.answer}
          </p>
        </div>
      )}
    </ListRowCard>
  )
}

interface VocResponse {
  items: VocItem[]
  page: number
  totalPages: number
  totalCount: number
}

export default function VocPage() {
  const [sort, setSort] = useState<VocSortKey>('latest')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<VocResponse | null>(null)
  const [error, setError] = useState(false)
  // data===null인 동안만 초기 로딩 상태 — 정렬/페이지 전환 시에는 이전 목록을 유지한 채
  // 백그라운드로 갱신한다(이펙트 본문에서 동기 setState를 피하려 setLoading을 따로 두지
  // 않는다 — InventoryItemHistorySheet.tsx와 동일 패턴, react-hooks/set-state-in-effect).
  const loading = data === null && !error

  useEffect(() => {
    let active = true
    fetch(`/api/voc?sort=${sort}&page=${page}`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('failed')
        return res.json() as Promise<VocResponse>
      })
      .then((json) => {
        if (!active) return
        setData(json)
        setError(false)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [sort, page])

  const handleSortChange = (key: VocSortKey) => {
    setSort(key)
    setPage(1) // 정렬 전환 시 1페이지로 리셋
  }

  return (
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.voc.pageTitle} />

      <div className="px-[var(--spacing-16)] pt-0 pb-[var(--spacing-40)] flex flex-col gap-[var(--spacing-24)]">
        <Button
          surface="main"
          variant="primary"
          fullWidth
          onClick={() => {
            window.location.href = TALLY_URL
          }}
        >
          {d.voc.inquireCta}
        </Button>

        <section>
          <div className="mb-[var(--spacing-16)]">
            <SlidingTabs items={SORT_TABS} value={sort} onChange={handleSortChange} outlined={false} aria-label={d.voc.sortAriaLabel} />
          </div>

          {loading && (
            <div className="py-[var(--spacing-40)] text-center text-text/40 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
              {d.voc.loading}
            </div>
          )}

          {!loading && error && (
            <EmptyState icon={<InboxIcon className="w-8 h-8" />} title={d.voc.loadError} />
          )}

          {!loading && !error && data && data.items.length === 0 && (
            <EmptyState icon={<InboxIcon className="w-8 h-8" />} title={d.voc.emptyTitle} description={d.voc.emptyBody} />
          )}

          {!loading && !error && data && data.items.length > 0 && (
            <>
              <div className="flex flex-col gap-[var(--spacing-8)]">
                {data.items.map((item) => (
                  <VocCard key={item.number} item={item} />
                ))}
              </div>
              <VocPagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
            </>
          )}
        </section>
      </div>
    </div>
  )
}
