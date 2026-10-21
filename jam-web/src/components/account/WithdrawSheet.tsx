'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import BottomSheet from '@/components/ui/BottomSheet'
import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import { Input } from '@ds/components/forms/Input'
import { useSkeletonReveal } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { createClient } from '@/lib/supabase/client'
import { pushTabBarHidden } from '@/lib/uiOverlay'
import { d, t } from '@/lib/i18n'
import { ABUSE_LOG_RETENTION_MONTHS, CONFIRMATION_RETENTION_MONTHS } from '@/lib/account/retention'
import { requestAccountDeletion, requestAccountSummary, runWithdraw } from '@/lib/account/withdraw-client'
import {
  WITHDRAWN_LOGIN_PATH,
  WITHDRAW_CONFIRM_PHRASE,
  isWithdrawConfirmed,
  normalizeConfirmInput,
  type AccountSummary,
} from '@/lib/account/withdraw-contract'

/** «지워지는 것»을 읽는 상태. 읽지 못해도(error) 탈퇴는 막지 않는다 */
export type WithdrawSummaryState =
  | { status: 'loading' }
  | { status: 'ready'; summary: AccountSummary }
  | { status: 'error' }

interface WithdrawSheetProps {
  open: boolean
  onClose: () => void
}

interface WithdrawSheetViewProps {
  open: boolean
  summary: WithdrawSummaryState
  /** 입력칸의 현재 값 */
  phrase: string
  /** 입력칸을 벗어났고 그 뒤로 값을 고치지 않았다. 이때만 불일치를 보인다(한글 조합 중간 글자에 오류를 띄우지 않는다) */
  phraseBlurred: boolean
  /** 서버 처리 중이면 입력칸·취소가 막히고 시트 닫기(바깥 탭·아래로 끌기·Escape)도 막힌다 */
  submitting: boolean
  /** 실패 안내. 서버가 완성한 문장이다. 없으면 null */
  errorMessage: string | null
  onClose: () => void
  onPhraseChange: (value: string) => void
  onPhraseBlur: () => void
  onConfirm: () => void
}

const INPUT_ID = 'withdraw-confirm-input'
const HINT_ID = 'withdraw-confirm-hint'

/** 문단과 문장 안내의 한국어 줄바꿈(가이드 3.2절) */
const PROSE = 'break-keep wrap-break-word text-pretty'

/**
 * 행 5줄 높이(py-1 8px + text-base 줄 높이 24px = 32px x 5). 스켈레톤이 이 높이를 미리 잡아 값이 도착해도 아래 내용이 밀리지 않는다.
 * 줄 높이에서 계산한 추정값이다 — 실제 높이는 머지 뒤 로컬에서 `offsetHeight`로 잰다(DESIGN_RENEWAL_SPEC z-index 규칙 5).
 */
const SKELETON_MIN_HEIGHT = '160px'
const SKELETON_ROWS = [0, 1, 2, 3, 4]

const formatNumber = (n: number) => n.toLocaleString('ko-KR')

/**
 * 지워지는 항목 다섯 줄. 0도 «0개»·«0 포인트»로 그대로 보인다 — 줄이 사라지면 그 항목은 안 지워지는 것으로 읽힌다.
 * 영수증 행이다: 왼쪽 muted 라벨, 오른쪽 foreground 값, 구분선과 큰 숫자 타일은 없다(`FeedSection`의 Row와 같은 문법).
 */
function SummaryRows({ summary }: { summary: AccountSummary }) {
  const copy = d.withdrawSheet
  const rows: [string, string][] = [
    [copy.rowActivityBadges, t(d.common.countItems, { count: formatNumber(summary.activityBadgeCount) })],
    [copy.rowCheckinBadges, t(d.common.countItems, { count: formatNumber(summary.checkinBadgeCount) })],
    [copy.rowItemBadges, t(d.common.countItems, { count: formatNumber(summary.itemCount) })],
    [copy.rowJam, formatNumber(summary.jamBalance)],
    [copy.rowPoints, t(d.points.amountValue, { amount: formatNumber(summary.pointBalance) })],
  ]
  return (
    <dl className="flex flex-col">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-1 text-base">
          <dt className="shrink-0 text-muted">{label}</dt>
          <dd className="whitespace-nowrap text-right text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * «지워지는 것» 묶음. 읽는 동안 스켈레톤 5줄이 pulse하다가 값이 오면 cross-fade한다(Skeleton reveal, `InventoryItemHistorySheet`와 같은 패턴).
 * 읽기에 실패하면 오류 문구 없이 한 문장으로 바꾼다. 스켈레톤에서 전환되며 높이가 줄어드는 것은 허용한다.
 * Strava 동기화 줄은 연결돼 있을 때만, 페이드 층 밖에 둔다(층 높이가 5줄로 정해져 있어 안에 두면 페이드 동안 아래 묶음과 겹친다).
 */
function RemovedSection({ summary }: { summary: WithdrawSummaryState }) {
  const copy = d.withdrawSheet
  const loading = summary.status === 'loading'
  const skelRef = useSkeletonReveal<HTMLDivElement>(!loading)

  return (
    <section className="flex flex-col gap-2">
      <h3 className={`text-sm text-muted ${PROSE}`}>{copy.removedLabel}</h3>
      <div
        ref={skelRef}
        className="t-skel"
        aria-busy={loading}
        style={{ ['--skel-min-h' as string]: SKELETON_MIN_HEIGHT }}
      >
        <div className="t-skel-skeleton is-pulsing" aria-hidden="true">
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="flex justify-between gap-4 py-1">
              <div className="h-6 w-24 rounded-lg bg-foreground/15" />
              <div className="h-6 w-16 rounded-lg bg-foreground/15" />
            </div>
          ))}
        </div>
        <div className="t-skel-content">
          {summary.status === 'ready' && <SummaryRows summary={summary.summary} />}
          {summary.status === 'error' && <p className={`text-base text-foreground ${PROSE}`}>{copy.removedFallback}</p>}
        </div>
      </div>
      {summary.status === 'ready' && summary.summary.stravaConnected && (
        <p className={`text-base text-foreground ${PROSE}`}>{copy.stravaSync}</p>
      )}
    </section>
  )
}

/** «남는 것» 묶음 — 보관 기간은 `retention.ts` 상수에서 끼워 넣는다 */
function KeptSection() {
  const copy = d.withdrawSheet
  return (
    <section className="flex flex-col gap-2">
      <h3 className={`text-sm text-muted ${PROSE}`}>{copy.keptLabel}</h3>
      <p className={`text-sm text-foreground ${PROSE}`}>
        {t(copy.keptRecords, {
          confirmMonths: CONFIRMATION_RETENTION_MONTHS,
          abuseMonths: ABUSE_LOG_RETENTION_MONTHS,
        })}
      </p>
      <p className={`text-sm text-foreground ${PROSE}`}>{copy.keptDrops}</p>
    </section>
  )
}

/**
 * 확인 문구 입력 묶음(라벨, 입력칸, 불일치 문구 자리). 4회(그래도 연결하기)에서 같은 입력이 또 필요해지면 떼어 내기 쉽도록
 * 이 파일 안의 따로 구분된 함수로 두었고, 아직은 내보내지 않는다.
 *
 * 불일치는 입력칸을 벗어났고 비어 있지 않을 때만 보인다. 입력 중에는 오류색도 문구도 없다. 성공을 뜻하는 초록 상태는 쓰지 않는다
 * (위험한 확정 앞에서 초록은 허락처럼 읽힌다). Enter는 제출하지 않고 키보드만 내린다: 키보드가 내려가면 활성화된 위험 버튼이 보이고,
 * 한 번 더 눌러야 해서 마찰이 남는다. 한글 조합 중의 Enter는 조합을 끝내는 키이므로 건드리지 않는다.
 */
function ConfirmPhraseField({
  phrase,
  blurred,
  disabled,
  onChange,
  onBlur,
}: {
  phrase: string
  blurred: boolean
  disabled: boolean
  onChange: (value: string) => void
  onBlur: () => void
}) {
  const copy = d.withdrawSheet
  const showMismatch = blurred && normalizeConfirmInput(phrase) !== '' && !isWithdrawConfirmed(phrase)

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    e.currentTarget.blur()
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={INPUT_ID} className={`text-base text-foreground ${PROSE}`}>
        {t(copy.confirmLabel, { phrase: WITHDRAW_CONFIRM_PHRASE })}
      </label>
      <Input
        id={INPUT_ID}
        value={phrase}
        onChange={(e) => onChange(e.target.value)}
        state={showMismatch ? 'error' : 'default'}
        aria-describedby={HINT_ID}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
      />
      <p id={HINT_ID} aria-live="polite" className={`min-h-6 text-sm text-foreground ${PROSE}`}>
        {showMismatch ? t(copy.confirmMismatch, { phrase: WITHDRAW_CONFIRM_PHRASE }) : ''}
      </p>
    </div>
  )
}

/**
 * 탈퇴 확인 시트의 겉모습 (티켓 20261021_1249 3회, 채원 사전 판정 2026-10-21).
 *
 * 재사용만 한다: 서비스 BottomSheet(compact) + Button(secondary 취소, danger 확정) + MODULAR Input + InlineNotice + 스켈레톤 reveal.
 * 새 토큰·새 부품·새 클래스가 없다. 본문은 묶음이 셋 이상이라 가운데가 아니라 왼쪽 정렬이고, 가장자리는 제목과 같은 px-6이다.
 * 위험하다고 장식하지 않는다: 빨간 면·경고 아이콘·카운트다운·흔들기가 없고, `--danger`는 확정 버튼 면과 불일치 테두리에만 쓴다.
 *
 * 본문 래퍼는 `tabIndex={0} role="region"`이다. BottomSheet는 열릴 때 DOM 순서상 첫 포커스 가능 요소로 포커스를 옮기는데, 입력칸이 첫 요소가
 * 되면 Android에서 시트가 열리자마자 키보드가 올라와 경고 본문을 가린다. 래퍼가 먼저 포커스를 받게 해 막고, 스크롤 영역에 키보드 접근도 준다.
 * Tab 순서는 본문 → 입력칸 → 취소 → 탈퇴하기다.
 *
 * 확정 버튼은 확인 문구가 일치하기 전까지 disabled이고 취소와 시각 무게가 같다(가이드 5.2). 제출 중에는 확정 버튼이 loading이고 라벨이
 * «탈퇴하는 중»(5.3)이며 입력칸·취소가 막히고 시트 닫기가 막힌다. 실패 안내는 푸터 맨 위에 InlineNotice 한 블록으로 보이고 애니메이션이 없다.
 * `footerBottomInset="safe-area"`를 쓰므로 열려 있는 동안 컨테이너가 `pushTabBarHidden()`을 부른다.
 */
export function WithdrawSheetView({
  open,
  summary,
  phrase,
  phraseBlurred,
  submitting,
  errorMessage,
  onClose,
  onPhraseChange,
  onPhraseBlur,
  onConfirm,
}: WithdrawSheetViewProps) {
  const copy = d.withdrawSheet
  const confirmed = isWithdrawConfirmed(phrase)

  return (
    <BottomSheet
      open={open}
      // 제출 중에는 어떤 경로로도 닫히지 않는다 — 서버 처리 중에 시트가 사라지면 결과를 알 수 없다
      onClose={submitting ? () => {} : onClose}
      detent="compact"
      title={copy.title}
      footerBottomInset="safe-area"
      footer={
        <div className="flex flex-col gap-4">
          {errorMessage && <InlineNotice>{errorMessage}</InlineNotice>}
          <div className="flex gap-4">
            <Button
              fullWidth
              variant="secondary"
              className="px-3! whitespace-nowrap"
              onClick={onClose}
              disabled={submitting}
            >
              {copy.cancel}
            </Button>
            <Button
              fullWidth
              variant="danger"
              className="px-3! whitespace-nowrap"
              loading={submitting}
              disabled={!confirmed}
              onClick={onConfirm}
            >
              {submitting ? copy.confirming : copy.confirm}
            </Button>
          </div>
        </div>
      }
    >
      <div tabIndex={0} role="region" aria-label={copy.title} className="flex flex-col gap-6 px-6 pb-6 text-left">
        <p className={`text-base text-foreground ${PROSE}`}>{copy.intro}</p>
        <RemovedSection summary={summary} />
        <KeptSection />
        <ConfirmPhraseField
          phrase={phrase}
          blurred={phraseBlurred}
          disabled={submitting}
          onChange={onPhraseChange}
          onBlur={onPhraseBlur}
        />
      </div>
    </BottomSheet>
  )
}

/**
 * 프로필 편집의 «탈퇴하기» 확인 시트.
 *
 * 열릴 때마다 입력값·불일치 표시·실패 안내를 비우고 요약을 새로 읽는다. 요약은 `GET /api/account/delete-summary`이고, 읽는 동안에도
 * 읽기에 실패해도 탈퇴는 막지 않는다(실패하면 수치 없이 일반 문장 하나를 보인다). 확정은 `POST /api/account/delete`이며 호출·중복 탭 막기·성공 뒤 `signOut()`과 이동은
 * `lib/account/withdraw-client.ts`의 `runWithdraw`가 맡는다(단위 시험으로 고정). 성공하면 시트는 «탈퇴하는 중» 상태 그대로 두고
 * `window.location.replace`로 이동한다: 닫으면 지워진 계정의 프로필 편집 화면이 잠깐 비치고, `router.push`는 클라이언트 캐시를 비우지 않아
 * 뒤로 가기로 돌아올 수 있다. 로그아웃은 `scope: 'local'`이다 — 서버의 세션은 계정과 함께 사라졌으므로 서버 호출 없이 이 기기의 세션만 정리한다.
 */
export default function WithdrawSheet({ open, onClose }: WithdrawSheetProps) {
  const [summary, setSummary] = useState<WithdrawSummaryState>({ status: 'loading' })
  const [phrase, setPhrase] = useState('')
  const [phraseBlurred, setPhraseBlurred] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inFlight = useRef(false)

  // 열릴 때마다 초기 상태로 되돌린다. 이펙트 안의 동기 setState는 캐스케이딩 렌더를 만들므로(react-hooks/set-state-in-effect)
  // «이전 open 값과 달라졌을 때만» 렌더 중에 되돌리는 방식을 쓴다.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSummary({ status: 'loading' })
      setPhrase('')
      setPhraseBlurred(false)
      setErrorMessage(null)
    }
  }

  // 시트가 열려 있는 동안 플로팅 탭바를 물리적으로 숨긴다(`footerBottomInset="safe-area"`와 짝, 닫히면 정리 함수가 복원)
  useEffect(() => {
    if (!open) return
    return pushTabBarHidden()
  }, [open])

  // 열릴 때마다 요약을 새로 읽는다. 닫히거나 다시 열리면 이전 요청의 결과는 버린다
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void requestAccountSummary(fetch, controller.signal).then((outcome) => {
      if (controller.signal.aborted) return
      setSummary(outcome.ok ? { status: 'ready', summary: outcome.summary } : { status: 'error' })
    })
    return () => controller.abort()
  }, [open])

  function handleConfirm() {
    void runWithdraw({
      inFlight,
      phrase,
      request: requestAccountDeletion,
      setSubmitting,
      setError: setErrorMessage,
      signOut: () => createClient().auth.signOut({ scope: 'local' }),
      redirect: () => window.location.replace(WITHDRAWN_LOGIN_PATH),
    })
  }

  return (
    <WithdrawSheetView
      open={open}
      summary={summary}
      phrase={phrase}
      phraseBlurred={phraseBlurred}
      submitting={submitting}
      errorMessage={errorMessage}
      onClose={onClose}
      onPhraseChange={(value) => {
        setPhrase(value)
        // 다시 입력을 고치는 즉시 불일치 표시를 푼다
        setPhraseBlurred(false)
      }}
      onPhraseBlur={() => setPhraseBlurred(true)}
      onConfirm={handleConfirm}
    />
  )
}
