import { Skeleton } from '@ds/components/feedback/Skeleton'
import RadialCapsule from '@/components/capsule/RadialCapsule'
import { d } from '@/lib/i18n'

/**
 * 캡슐 알약 — **알약 모양을 아는 유일한 파일** (티켓 20261018_0054)
 *
 * 서비스 정식 반영 사양:
 * - 첨부 이미지의 방사형(Radial) 그라데이션 잼 채움 디자인 적용
 * - 캡슐 높이 96px, 외곽 어두운 배경 없이 자연스러운 서피스 위에 배치
 * - 애니메이션 2초(2000ms), 뒤로 갈수록 느려지는 Expo Ease-Out 감속 곡선
 * - 캡슐 중앙에 'CAPSULE' 볼드 표기, 그 위에 'xx%' 큰 텍스트 볼드 표기
 * - 100%일 때는 테두리와 내부 그림자 없이 캡슐 전체가 선명한 붉은 잼으로 꽉 참
 * - 캡슐 아래에 작은 풀라운드('rounded-full') 버튼으로 '채우기' / 상태 문구 표기
 */

export type CapsulePillStatus = 'filling' | 'ready' | 'noSlots' | 'loading' | 'error'

interface Props {
  status: CapsulePillStatus
  /** 게이지 비율(0~100) */
  percent: number
  /** 1행 왼쪽 문구 — 보통 «캡슐», 오류일 때는 불러오지 못했다는 문구 */
  statusText: string
  /** 상태 문구 — «채우기»·«열 수 있어요»·«빈칸이 모자라요»·«다시 시도» */
  actionText: string
  onClick: () => void
}

/** 캡슐 본체 높이(px) */
export const CAPSULE_PILL_HEIGHT_PX = 96

export default function CapsulePill({ status, percent, statusText, actionText, onClick }: Props) {
  if (status === 'loading') {
    return (
      <div role="status" aria-label={d.capsule.aria.loading} className="w-full flex flex-col items-center">
        <Skeleton height={CAPSULE_PILL_HEIGHT_PX} borderRadius="var(--radius-full)" className="w-full" />
        <div className="mt-3">
          <Skeleton height={28} width={76} borderRadius="var(--radius-full)" />
        </div>
      </div>
    )
  }

  const isError = status === 'error'

  if (isError) {
    return (
      <div className="w-full flex flex-col items-center">
        <button
          type="button"
          onClick={onClick}
          aria-label={d.capsule.aria.error}
          className="jam-press relative w-full rounded-full overflow-hidden flex flex-col items-center justify-center p-4 cursor-pointer bg-surface text-foreground border border-border"
          style={{ height: `${CAPSULE_PILL_HEIGHT_PX}px` }}
        >
          <span className="text-sm font-bold text-muted">{statusText}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted/70 mt-1">CAPSULE</span>
        </button>
        <div className="mt-3">
          <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs font-bold bg-white border border-border text-foreground hover:border-foreground/30 shadow-xs cursor-pointer"
          >
            {actionText}
          </button>
        </div>
      </div>
    )
  }

  return (
    <RadialCapsule
      percent={percent}
      height={CAPSULE_PILL_HEIGHT_PX}
      durationMs={2000}
      actionText={actionText}
      onAction={onClick}
      onClick={onClick}
      ariaLabel={d.capsule.aria[status] ?? '캡슐'}
      animateOnMount={true}
    />
  )
}
