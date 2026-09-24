'use client'

import { toast } from 'sonner'
import { formatBulkResult, type BulkResult } from '@/lib/admin/bulk/shared'

/**
 * 어드민 일괄 삭제 결과 통지 — "N건 삭제됨, M건은 참조가 있어 건너뜀" 패턴을 미션·컬렉션·
 * 트라이브·배지 등 여러 화면이 동일한 형태로 쓰고 있어 한 곳에 모은다(티켓 20260907_1219,
 * 네이티브 `alert()` → shadcn `sonner` toast 전환). 차단 사유 목록이 길어질 수 있어
 * 토스트 본문에 그대로 이어붙이지 않고 스크롤 영역으로 분리해 가독성을 유지한다.
 */
export function toastBulkDeleteBlocked(
  deletedCount: number,
  blocked: { id: string; reason: string }[],
  nameOf: (id: string) => string,
  unit: '건' | '개' = '건'
) {
  const detailLines = blocked.map((b) => `${nameOf(b.id)}: ${b.reason}`)
  toast.warning(`${deletedCount}${unit} 삭제됨, ${blocked.length}${unit}은 참조가 있어 건너뜀`, {
    description: (
      <div className="max-h-32 overflow-y-auto whitespace-pre-line text-xs leading-relaxed">
        {detailLines.join('\n')}
      </div>
    ),
    duration: 10000,
  })
}

const SKIP_DETAIL_LIMIT = 20

/**
 * 공용 서버 일괄 처리 결과 통지(티켓 20260924_0940, 상위 티켓 §1-7d) — "N건 {verb}, M건
 * 건너뜀" 요약(`formatBulkResult`)에 건너뜀 사유를 최대 20줄까지 이어붙인다. 건너뜀이 없으면
 * 성공 토스트만 띄운다.
 */
export function toastBulkResult(result: BulkResult, { verb }: { verb: string }) {
  const summary = formatBulkResult(result, { verb })
  if (result.skipped.length === 0) {
    toast.success(summary)
    return
  }

  const detailLines = result.skipped
    .slice(0, SKIP_DETAIL_LIMIT)
    .map((s) => `${s.label ?? s.id}: ${s.reason}`)
  if (result.skipped.length > SKIP_DETAIL_LIMIT) {
    detailLines.push(`외 ${result.skipped.length - SKIP_DETAIL_LIMIT}건`)
  }

  toast.warning(summary, {
    description: (
      <div className="max-h-32 overflow-y-auto whitespace-pre-line text-xs leading-relaxed">
        {detailLines.join('\n')}
      </div>
    ),
    duration: 10000,
  })
}
