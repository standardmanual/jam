/**
 * 읽기 안내 줄 (티켓 20261026_2028 3회차, PRD admin-boards §8)
 *
 * GitHub·배포 상태·개발 요청 중 읽지 못한 것만 [현상](원인). 해결 한 줄씩 보인다. 문제가 없으면 아무것도 그리지 않는다.
 * 색만 쓰지 않으려고 기호(!)를 앞에 붙인다. 상태가 없는 서버·클라이언트 공용 컴포넌트다.
 */
import type { ReadNotice } from '@/lib/admin/devBoard/view'

export function ReadNotices({ notices }: { notices: readonly ReadNotice[] }) {
  if (notices.length === 0) return null
  return (
    <ul role="status" aria-label="읽기 안내" data-testid="dev-board-notices" className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
      {notices.map((notice) => (
        <li key={notice.key} data-notice={notice.key} className="flex gap-2 text-sm text-amber-900 break-keep wrap-break-word">
          <span aria-hidden="true" className="font-semibold">
            !
          </span>
          <span className="text-pretty">
            {notice.summary}({notice.cause}). {notice.fix}.
          </span>
        </li>
      ))}
    </ul>
  )
}
