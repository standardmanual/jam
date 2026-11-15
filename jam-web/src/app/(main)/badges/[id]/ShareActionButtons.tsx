import { Button } from '@ds/components/buttons/Button'
import { CopyIcon, DownloadIcon, MoreIcon } from '@/components/ui/icons'
import { d } from '@/lib/i18n'

/**
 * 아이콘 위·이름표 아래 세로 배치(티켓 20261115_1249, 채원 판정의 폭 대안). 폭 320~360px에서 버튼 한 칸이
 * 88~99px라 «아이콘 24 + 간격 8 + 4글자 약 60px»(약 92px)가 한 줄에 들어가지 않는다. 높이는 테두리 2 + 위아래 4씩 8 +
 * 아이콘 24 + 간격 2 + 이름표 20 = 56px로 `SHEET_BUTTON_CLASS`와 같다. `Button`이 인라인 스타일로 정한
 * 패딩·간격·글자 크기를 `!`로 덮는다. 터치 영역은 56px 높이 × 최소 88px 폭이다.
 */
export const SHARE_ACTION_BUTTON_CLASS = 'flex-col gap-0.5! px-1! py-1! text-sm! whitespace-nowrap break-keep'

interface ShareActionButtonsProps {
  /** 복사하는 동안 true — `aria-busy`를 달고, 중복 탭은 호출부가 무시한다 */
  copying: boolean
  /** 이미지가 준비된 시점에 `canShare({ files })`가 참이었는지. 거짓이면 «더보기»를 그리지 않는다(비활성으로 남기지 않는다) */
  canNativeShare: boolean
  onCopy: () => void
  onSave: () => void
  onMore: () => void
}

/**
 * 공유 시트 footer의 버튼 줄. 복사하기만 primary(가장 흔한 행동), 저장하기·더보기는 secondary다.
 * 아이콘은 `aria-hidden`이라 이름표 글자가 곧 접근 가능한 이름이다.
 */
export function ShareActionButtons({ copying, canNativeShare, onCopy, onSave, onMore }: ShareActionButtonsProps) {
  return (
    <div className="flex gap-2">
      <div className="flex-1 min-w-0">
        <Button
          surface="light"
          fullWidth
          className={SHARE_ACTION_BUTTON_CLASS}
          aria-busy={copying || undefined}
          onClick={onCopy}
        >
          <CopyIcon />
          <span>{d.badges.shareActionCopy}</span>
        </Button>
      </div>
      <div className="flex-1 min-w-0">
        <Button surface="light" variant="secondary" fullWidth className={SHARE_ACTION_BUTTON_CLASS} onClick={onSave}>
          <DownloadIcon />
          <span>{d.badges.shareActionDownload}</span>
        </Button>
      </div>
      {canNativeShare && (
        <div className="flex-1 min-w-0">
          <Button surface="light" variant="secondary" fullWidth className={SHARE_ACTION_BUTTON_CLASS} onClick={onMore}>
            <MoreIcon />
            <span>{d.badges.shareActionMore}</span>
          </Button>
        </div>
      )}
    </div>
  )
}
