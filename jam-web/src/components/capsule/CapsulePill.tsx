import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { Skeleton } from '@ds/components/feedback/Skeleton'
import { ChevronRightIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

/**
 * 캡슐 알약 — **알약 모양을 아는 유일한 파일** (티켓 20261018_0054, 채원 판정 2026-10-18)
 *
 * 가로 알약은 임시 디자인이라 나중에 모양이 바뀔 수 있다. 모양이 바뀌면 이 파일만 고친다. 위젯·시트·API 쪽은 모양을 모른다.
 * 순수 표현 컴포넌트다(상태 없음, 데이터를 가져오지 않는다).
 *
 * - 알약 전체가 버튼 하나다. 1행은 왼쪽 제목, 오른쪽 상태 문구와 `›`. 2행은 외곽선 있는 게이지다(숫자와 퍼센트는 없다).
 * - 면은 `--surface`와 1px `--border`뿐이다. 그라데이션 배경·유리질·그림자·반투명 면, 새 아이콘을 더하지 않는다. 색은 게이지 하나만 갖는다.
 * - «열 수 있어요»를 점·배지·펄스·색 강조로 부추기지 않는다. 글자와 가득 찬 게이지로만 알린다.
 * - 위젯 높이는 상태와 무관하게 같다(로딩 Skeleton과 오류 알약도 같은 높이): 테두리 1px + 위 16px + 1행 24px + 8px + 게이지 10px + 아래 16px + 테두리 1px(76px).
 */

export type CapsulePillStatus = 'filling' | 'ready' | 'noSlots' | 'loading' | 'error'

interface Props {
  status: CapsulePillStatus
  /** 게이지 비율(0~100). 화면에 숫자로 내보내지 않는다 */
  percent: number
  /** 1행 왼쪽 문구 — 보통 «캡슐», 오류일 때는 불러오지 못했다는 문구 */
  statusText: string
  /** 1행 오른쪽 문구 — «채우기»·«열 수 있어요»·«빈칸이 모자라요»·«다시 시도» */
  actionText: string
  onClick: () => void
}

/** 알약 높이(px) — 로딩 Skeleton과 알약이 같은 높이를 쓴다. 1 + 16 + 24 + 8 + 10 + 16 + 1 */
const PILL_HEIGHT_PX = 76

export default function CapsulePill({ status, percent, statusText, actionText, onClick }: Props) {
  if (status === 'loading') {
    return (
      <div role="status" aria-label={d.capsule.aria.loading}>
        <Skeleton height={PILL_HEIGHT_PX} borderRadius="var(--radius-full)" />
      </div>
    )
  }

  const isError = status === 'error'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={d.capsule.aria[status]}
      className="jam-press block w-full text-left rounded-full bg-surface text-foreground border border-border px-6 pt-4 pb-4 cursor-pointer"
      style={{ height: PILL_HEIGHT_PX, boxSizing: 'border-box' }}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate break-keep wrap-break-word text-base font-bold">{statusText}</span>
        <span className="shrink-0 inline-flex items-center gap-1 break-keep wrap-break-word text-sm whitespace-nowrap">
          {actionText}
          <ChevronRightIcon className="w-4 h-4 text-muted" />
        </span>
      </span>
      <span className="block mt-2" aria-hidden="true">
        {isError ? (
          // 오류에서도 높이를 지킨다 — 게이지 줄만 비운다
          <span className="block" style={{ height: 10 }} />
        ) : (
          <ProgressBar outlined percent={percent} fillMode="track-gradient" trackColor="var(--background)" height={10} labelType="none" />
        )}
      </span>
    </button>
  )
}
