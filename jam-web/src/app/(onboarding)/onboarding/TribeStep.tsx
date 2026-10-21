'use client'

import SafeImage from '@/components/SafeImage'
import Button from '@/components/ui/Button'
import { Card } from '@ds/components/cards/Card'
import { d } from '@/lib/i18n'
import type { TribeRow } from '@/types/database'

/**
 * 온보딩 2단계 — 트라이브 고르기 (티켓 20261021_1247 1회, 채원 사전 판정 2026-10-21)
 *
 * `page.tsx`가 상태(읽기·선택·제출)를 들고, 이 컴포넌트는 받은 값을 그리기만 한다. Hook을 쓰지 않는 순수 표현 컴포넌트라
 * 서버 렌더·요소 트리 읽기로 시험할 수 있다(저장소에 jsdom이 없다).
 *
 * 구성: 새 부품 없음. MODULAR `Card` 기본형(선택 시 `inverse` — 같은 두께의 테두리가 있어 선택해도 크기가 움직이지 않는다) · 서비스 `Button` · `SafeImage`.
 * - 카드는 세로 1열 가로형이다(padding 16, gap 8). 2열은 안쪽 폭이 약 137px라 한 줄 소개가 3~4줄이 되어 쓰지 않는다.
 * - 이미지 48. 트라이브 가운데 이미지가 하나도 없으면 이미지 자리를 뺀다. 하나라도 있으면 이름 줄이 어긋나지 않게 48 자리를 비워 둔다.
 *   사람 모양 폴백 아이콘은 두지 않는다.
 * - 이름 `text-base` 굵게, 한 줄 소개(`tagline`) `text-sm`, 2줄까지. 소개 한 칸에 «대주제 · 한 줄»을 운영이 적는다. `description`·`background_*`는 쓰지 않는다.
 * - 안내 두 줄은 제목 아래·카드 위: «한 번 고르면 바꿀 수 없어요»(foreground, `text-base`), 아이템 배지 안내(muted, `text-sm`).
 *   바꾸는 방법(운영자가 바꿔 주는 길)은 화면에 알리지 않는다(운영 로직 2.2절).
 * - 아이디를 이미 정해 곧장 이 단계로 온 유저(`showGateHint`)에게만 제목 아래에 muted 한 줄을 더한다.
 * - 카드를 눌러도 확정되지 않는다. 확정은 «이 트라이브로 시작하기» 버튼이다(확인 시트 없음, 사용자 결정 6).
 * - 제출 중에는 카드와 «뒤로»를 잠근다. 카드는 `onClick`을 빼 포커스·클릭이 모두 막히고 `aria-disabled`가 붙는다.
 * - 접근성: 카드 묶음은 `radiogroup`(이름은 제목), 카드는 `radio`와 `aria-checked`. 오류 문구는 `role="alert"`.
 */
export type TribeOption = Pick<TribeRow, 'id' | 'name' | 'tagline' | 'image_url'>

export type TribesState =
  | { kind: 'loading' }
  | { kind: 'ready'; tribes: TribeOption[] }
  | { kind: 'error' }

/** 카드 묶음(`radiogroup`)이 이름으로 삼는 제목 요소의 id */
export const TRIBE_STEP_TITLE_ID = 'tribe-step-title'

export interface TribeStepProps {
  tribesState: TribesState
  selectedTribeId: string | null
  /** 확정 요청이 진행 중이다 — 카드와 «뒤로»를 잠그고 버튼 문구를 바꾼다 */
  submitting: boolean
  /** 제출 실패 문구. 빈 문자열이면 보이지 않는다 */
  error: string
  /** 아이디를 이미 정해 곧장 이 단계로 온 유저에게만 true */
  showGateHint: boolean
  onSelect: (tribeId: string) => void
  onFinish: () => void
  onBack: () => void
  onRetry: () => void
}

// 한국어 줄바꿈(UX 라이팅 §3.2): 띄어쓰기 단위로만 끊고, 긴 한 단어만 칸 밖으로 넘치지 않게 끊는다
const KO_BREAK = 'break-keep wrap-break-word'

export default function TribeStep({
  tribesState,
  selectedTribeId,
  submitting,
  error,
  showGateHint,
  onSelect,
  onFinish,
  onBack,
  onRetry,
}: TribeStepProps) {
  const tribes = tribesState.kind === 'ready' ? tribesState.tribes : []
  const showImageSlot = tribes.some((tribe) => Boolean(tribe.image_url))

  return (
    <div className="min-h-full text-foreground flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        <div className="flex flex-col items-center gap-4">
          <h1 id={TRIBE_STEP_TITLE_ID} className={`text-3xl text-center whitespace-pre-line text-balance ${KO_BREAK}`}>
            {d.onboarding.step2Title}
          </h1>
          {showGateHint && (
            <p className={`text-muted text-base text-center text-balance ${KO_BREAK}`}>
              {d.onboarding.step2GateHint}
            </p>
          )}
          <div className="flex flex-col items-center gap-1">
            <p className={`text-foreground text-base text-center text-balance ${KO_BREAK}`}>
              {d.onboarding.step2Subtitle}
            </p>
            <p className={`text-muted text-sm text-center text-balance ${KO_BREAK}`}>
              {d.onboarding.step2ItemBadgeNotice}
            </p>
          </div>
        </div>

        {tribesState.kind === 'loading' && (
          <div className="w-full flex items-center justify-center py-8">
            <div className="w-6 h-6 border border-current border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {tribesState.kind === 'error' && (
          <div className="w-full flex flex-col items-center gap-4 py-4">
            <p className={`text-base text-center text-muted text-pretty ${KO_BREAK}`}>
              {d.onboarding.tribesLoadError}
            </p>
            <Button variant="outline" onClick={onRetry} className={`whitespace-nowrap ${KO_BREAK}`}>
              {d.onboarding.retryButton}
            </Button>
          </div>
        )}

        {tribesState.kind === 'ready' && tribes.length === 0 && (
          <div className="w-full flex flex-col items-center gap-4 py-4">
            <p className={`text-base text-center text-muted text-pretty ${KO_BREAK}`}>
              {d.onboarding.tribesEmptyError}
            </p>
            <Button variant="outline" onClick={onRetry} className={`whitespace-nowrap ${KO_BREAK}`}>
              {d.onboarding.retryButton}
            </Button>
          </div>
        )}

        {tribesState.kind === 'ready' && tribes.length > 0 && (
          <div role="radiogroup" aria-labelledby={TRIBE_STEP_TITLE_ID} className="w-full flex flex-col gap-2">
            {tribes.map((tribe) => {
              const selected = selectedTribeId === tribe.id
              return (
                <Card
                  key={tribe.id}
                  tone={selected ? 'inverse' : 'default'}
                  role="radio"
                  aria-checked={selected}
                  aria-disabled={submitting ? true : undefined}
                  // 제출 중에는 onClick을 빼 클릭·키보드·포커스를 함께 막는다(Card는 onClick이 있을 때만 버튼처럼 동작한다)
                  onClick={submitting ? undefined : () => onSelect(tribe.id)}
                  className="flex items-center gap-2 text-left"
                  style={{ padding: 'var(--spacing-16)' }}
                >
                  {showImageSlot && (
                    <div className="w-12 h-12 shrink-0">
                      <SafeImage
                        src={tribe.image_url}
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-2xl object-cover"
                      />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 flex flex-col">
                    <span className={`block text-base font-bold ${KO_BREAK}`}>{tribe.name}</span>
                    {tribe.tagline && (
                      // 선택하면 면이 어두워지므로 글자는 --snow다(--muted는 어두운 면 위에서 작은 글자에 못 쓴다)
                      <span className={`block text-sm line-clamp-2 text-pretty ${KO_BREAK} ${selected ? 'text-snow' : 'text-muted'}`}>
                        {tribe.tagline}
                      </span>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {error && (
          <p role="alert" className={`text-base text-center text-pretty ${KO_BREAK}`}>
            {error}
          </p>
        )}

        <div className="w-full flex flex-col gap-3">
          <Button
            variant="primary"
            fullWidth
            onClick={onFinish}
            disabled={!selectedTribeId || submitting}
            className={`whitespace-nowrap ${KO_BREAK}`}
          >
            {submitting ? d.onboarding.finishing : d.onboarding.finishButton}
          </Button>
          {/* 1단계(아이디·이름)로 돌아가 값을 다시 확인·수정할 수 있게 한다. 제출 중에는 잠근다.
              한 영역에 primary는 하나, 나머지는 secondary다(Button 규칙). 고른 뒤에는 바꿀 수 없는 확정 앞이라 보조 버튼을 같은 크기로 둔다(UX 라이팅 §5.2). */}
          <Button
            variant="secondary"
            fullWidth
            onClick={onBack}
            disabled={submitting}
            className={`whitespace-nowrap ${KO_BREAK}`}
          >
            {d.common.back}
          </Button>
        </div>
      </div>
    </div>
  )
}
