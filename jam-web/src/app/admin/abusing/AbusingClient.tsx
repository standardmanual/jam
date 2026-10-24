'use client'

import { Suspense, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import type { PoiBlockRow } from '@/lib/admin/abusing-list'
import type { SuspensionRow } from '@/lib/admin/suspension-list'
import { SuspensionTable } from './SuspensionTable'
import { PoiBlockTable } from './PoiBlockTable'
import AbusingFilterBar from './AbusingFilterBar'

interface Props {
  /** URL `?tab=`에서 서버가 읽은 현재 탭 — 탭 이동은 링크(서버 이동)다 */
  tab: Tab
  /** 탭 라벨에 붙이는 활성 건수. 조회에 실패하면 null */
  counts: { suspensions: number | null; poiBlocks: number | null }
  /** 현재 탭이 이용 정지일 때만 채워진다 */
  suspensions: SuspensionRow[]
  /** 현재 탭이 POI 블록일 때만 채워진다 */
  poiBlocks: PoiBlockRow[]
  /** 현재 필터 조건에 맞는 전체 건수·현재 쪽·총 쪽수(목록 탭에서만 쓴다) */
  listTotal: number
  page: number
  totalPages: number
}

export type Tab = 'suspensions' | 'poi-blocks'

const ABUSING_PATH = '/admin/abusing'

/** 이용 정지 이력의 상태 필터 — 정지는 만료가 없고 풀거나 유지한다(운영 로직 16.7절) */
const SUSPENSION_STATUS_OPTIONS = [
  { value: 'active', label: '정지 중' },
  { value: 'lifted', label: '풀림' },
  { value: 'all', label: '전체' },
]

export default function AbusingClient({
  tab,
  counts,
  suspensions,
  poiBlocks,
  listTotal,
  page,
  totalPages,
}: Props) {
  const router = useRouter()
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 이용 정지 걸기 폼
  const [suspendUserId, setSuspendUserId] = useState('')
  const [suspendReason, setSuspendReason] = useState('')
  const [suspendAdding, setSuspendAdding] = useState(false)

  // 오류 메시지에는 DB 오류 코드가 붙어 3초로는 읽기 어렵다 — 오류는 자동으로 사라지지 않고
  // 닫기 버튼이나 다음 메시지로만 닫힌다. 성공 메시지는 기존대로 3초 뒤 사라진다.
  const msgSeq = useRef(0)
  const flash = (type: 'ok' | 'err', text: string) => {
    const seq = ++msgSeq.current
    setMsg({ type, text })
    if (type === 'ok') {
      setTimeout(() => {
        if (msgSeq.current === seq) setMsg(null)
      }, 3000)
    }
  }

  const addSuspension = async () => {
    if (!suspendUserId.trim() || !suspendReason.trim()) return
    setSuspendAdding(true)
    try {
      const res = await fetch('/api/admin/suspensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: suspendUserId.trim(), reason: suspendReason.trim() }),
      })
      if (!res.ok) {
        // API가 실패 사유를 실어 보내므로 그대로 노출한다 (어드민 화면 — 원인 특정이 우선)
        const json = (await res.json().catch(() => null)) as { error?: string } | null
        flash('err', json?.error ?? `이용 정지가 적용되지 않았어요. 서버가 ${res.status} 오류로 응답했어요. 잠시 후 다시 시도해 주세요.`)
        return
      }
      flash('ok', '이용 정지를 걸었어요')
      setSuspendUserId('')
      setSuspendReason('')
      // 서버가 나눠 주는 목록·탭 건수를 다시 읽는다
      router.refresh()
    } catch {
      flash('err', '이용 정지가 적용되지 않았어요. 서버에 연결하지 못했어요. 네트워크 상태를 확인하고 다시 시도해 주세요.')
    } finally {
      setSuspendAdding(false)
    }
  }

  const tabs: { key: Tab; label: string; href: string; count: number | null }[] = [
    { key: 'suspensions', label: '이용 정지', href: `${ABUSING_PATH}?tab=suspensions`, count: counts.suspensions },
    { key: 'poi-blocks', label: '장소 블록', href: `${ABUSING_PATH}?tab=poi-blocks`, count: counts.poiBlocks },
  ]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">어뷰징 정책 관리</h1>
          <p className="break-keep wrap-break-word text-muted-foreground text-sm mt-0.5">장소 GPS 조작 감지 + 이용 정지</p>
        </div>
        {msg && (
          <div className={`flex items-start gap-2 text-sm font-medium px-4 py-2 rounded-xl max-w-md ${msg.type === 'ok' ? 'bg-primary/10 text-foreground' : 'bg-red-50 text-red-600'}`}>
            <span className="flex-1 break-words">{msg.text}</span>
            {msg.type === 'err' && (
              <button
                type="button"
                onClick={() => setMsg(null)}
                aria-label="오류 메시지 닫기"
                className="shrink-0 text-red-600/60 hover:text-red-600 leading-5"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={[
              'pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5',
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t.label}
            {t.count != null && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 ${tab === t.key ? 'bg-primary/20 text-foreground' : 'bg-muted text-muted-foreground'}`}>
                {t.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {/* 이용 정지 탭 */}
      {tab === 'suspensions' && (
        <div className="space-y-5">
          {/* 이용 정지 걸기 */}
          <div className="bg-white border border-border rounded-2xl p-5 space-y-3 max-w-3xl">
            <h3 className="text-sm font-semibold text-foreground">이용 정지 걸기</h3>
            <input
              value={suspendUserId}
              onChange={(e) => setSuspendUserId(e.target.value)}
              placeholder="유저 UUID"
              aria-label="유저 UUID"
              className="w-full bg-white border border-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
            <div className="flex gap-2">
              <input
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="정지 사유 (필수)"
                aria-label="정지 사유"
                aria-describedby="suspension-reason-hint"
                className="flex-1 bg-white border border-border rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <button
                onClick={addSuspension}
                disabled={suspendAdding || !suspendUserId.trim() || !suspendReason.trim()}
                className="bg-red-600 text-white font-bold px-4 py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-40 transition-colors text-sm"
              >
                정지
              </button>
            </div>
            <p id="suspension-reason-hint" className="break-keep wrap-break-word text-xs text-muted-foreground">
              유저에게 그대로 보여요. 홈 화면 맨 위 안내에 이 사유가 전문으로 실려요.
            </p>
          </div>

          {/* 정지 이력 — 표·필터 바·페이지 이동이 URL(useSearchParams)을 읽어 Suspense로 감싼다 */}
          <Suspense>
            <div className="space-y-3">
              <AbusingFilterBar placeholder="유저 이름, 이메일로 검색..." statusOptions={SUSPENSION_STATUS_OPTIONS} />
              <p className="text-sm text-muted-foreground">총 {listTotal}건</p>
              <SuspensionTable suspensions={suspensions} />
              <DataTablePagination page={page} totalPages={totalPages} />
            </div>
          </Suspense>
        </div>
      )}

      {/* POI 블록 탭 */}
      {tab === 'poi-blocks' && (
        <Suspense>
          <div className="space-y-3">
            <AbusingFilterBar placeholder="유저 이름, 이메일, 장소 이름으로 검색..." />
            <p className="text-sm text-muted-foreground">총 {listTotal}건</p>
            <PoiBlockTable poiBlocks={poiBlocks} totalCount={listTotal} />
            <DataTablePagination page={page} totalPages={totalPages} />
          </div>
        </Suspense>
      )}
    </div>
  )
}
