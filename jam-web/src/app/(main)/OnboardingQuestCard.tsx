'use client'

import { useRouter } from 'next/navigation'
import { Card } from '@ds/components/cards/Card'
import { LabelChip } from '@ds/components/cards/LabelChip'
import { ProgressBar } from '@ds/components/feedback/ProgressBar'
import { CheckCircleIcon, ChevronRightIcon } from '@/components/ui/icons'
import Button from '@/components/ui/Button'
import InlineNotice from '@/components/ui/InlineNotice'
import SyncButton from '@/components/SyncButton'
import { d, t } from '@/lib/i18n'
import { STEP_SCREEN_MAP, type OnboardingQuestScreen } from '@/lib/onboarding-quest/config'
import type { RealCurrentStep, RealStepRow, RealStepsView } from '@/lib/onboarding-quest/real-view'
import type { OnboardingQuestCardState } from '@/lib/onboarding-quest/status'
import type { OnboardingQuestStepKey } from '@/types/database'
import OnboardingQuestSkipSheet from './OnboardingQuestSkipSheet'
import OnboardingSyncButton from './OnboardingSyncButton'
import QuestStartTracker from './QuestStartTracker'

/**
 * «JAM! 시작하기» 홈 카드 (티켓 20260927_2133, 상위 20260927_2123 T1b · 경로 변경 20260928_0136 ·
 * 보상 문구 제거·CTA 버튼화 20260928_1537 · 실제 3단계 20261021_1248 2회 · 실제 2단계와 포인트 기준 20261028_1738 1회).
 *
 * 채원 사전 판정 — 재사용. 신규 토큰·컴포넌트 없이 Card(기본 톤: 흰 면 + 1px 테두리)·LabelChip·ProgressBar·InlineNotice·icons.tsx·서비스
 * Button만으로 조립한다. 어두운 반전 면이 아니라서 글자는 `text-foreground`(Card가 깔아 상속)·`text-muted`·`text-link`다(티켓 20261015_2133).
 * 그라데이션·그림자·반투명 면·가운데 정렬이 없고 모든 글자는 왼쪽 정렬이다. 체크 아이콘은 `--link` 선이고 아직 안 한 원의 테두리는 `--muted`다.
 *
 * 한 카드, 두 구역이다. 위계는 «지금 할 일» 기준이고 한 카드의 primary 버튼은 늘 하나다.
 * - 연출 중(`in_progress`): 칩 + «미리 해보기 n/7», ProgressBar 7칸, 연출 다음 단계 제목·설명, primary CTA(펄스 유지), 구분선, «내 활동으로 2단계» 체크 목록
 *   (`<ol>`, 누를 수 없음), 카드 밖 «미리 해보기 건너뛰기». 실제 단계 기록을 읽지 못했으면(`real` null) 구분선과 목록을 그리지 않는다.
 * - 연출 끝 또는 건너뜀(`real`): 칩 + «내 활동으로 n/2», ProgressBar 2칸, 체크 목록(지금 할 차례 행은 굵은 제목과 설명), 필요하면 InlineNotice, primary CTA 하나(펄스 없음).
 *   건너뛴 유저에게는 연출 구역도 «건너뛰었어요» 표시도 건너뛰기 버튼도 없다.
 * 완료 상태 구역은 없다 — 챕터 1은 소식 한 건으로 알린다(사용자 결정 4). 연출 끝/건너뜀과 실제 2단계가 둘 다 끝나면 카드가 사라진다(`status.ts`).
 *
 * 카드 자체는 누르지 않고 CTA만 액션이다(MissionCard와 같은 패턴 — `<a>` 안에 `<button>`을 두지 않는다). CTA는 `size="sm"`(44px)이다.
 * - 연출 sync 차례: 연출 동기화 버튼(`OnboardingSyncButton`). 그 외 연출 차례: `STEP_SCREEN_MAP`이 가리키는 실제 화면으로 `router.push`.
 * - 실제 ① 연동 전: Strava 연결 길(`window.location.href = '/api/strava/auth'`, TopNav.tsx와 같은 코드). 연동됨: 실제 `SyncButton`.
 * - 실제 ② 잠긴 아이템 배지: «인벤토리 가기»가 열러 갈 잠긴 개체의 깊은 링크 `/inventory/{itemId}`로 보낸다(연출 중 `/inventory` 목록은 연출 인벤토리라서). 개체를 모르면 `/inventory`다.
 *   버튼 글자는 어떤 경우에도 같다. 설명은 개체를 알면 «잠긴 배지를 열 수 있어요»(필요 포인트가 0이든 N이든 같은 문장, 포인트 숫자는 카드에 없다), 모르면 «잠긴 배지를 열어 보세요»다.
 * - 가진 포인트가 필요 포인트보다 적을 때만 InlineNotice(경고색·아이콘 없음) «{need} 포인트가 필요해요»를 더한다. primary 버튼은 그대로 «인벤토리 가기»이고 여유가 0이어도 미리 경고하지 않는다.
 *   캡슐 버튼과 잼·인벤토리 빈칸 안내는 없다(캡슐 열기는 단계가 아니다).
 *
 * 접근성: 카드 `role="group"`, 분수는 보이는 글자를 `aria-hidden`으로 두고 같은 뜻의 문장을 `sr-only`로 읽힌다. 목록 행마다 «마쳤어요»·«지금 할 차례예요»·«아직이에요»를
 * `sr-only` 글자로 붙이고 아이콘은 `aria-hidden`이다(색에만 기대지 않는다). 새·고치는 요소에는 `break-keep wrap-break-word`를 둔다(UX 라이팅 가이드 §3.2).
 */
const SCREEN_PATH_MAP: Record<OnboardingQuestScreen, string> = {
  home: '/',
  inventory: '/inventory',
  drops: '/drops',
  combine: '/combine',
  missions: '/missions',
}

const CARD_CLASS = 'flex flex-col gap-4'
// CTA 줄 — flex-col 카드의 기본 stretch가 버튼을 카드 폭으로 늘리지 않도록 가로 줄로 감싼다
const CTA_ROW_CLASS = 'flex'
// 「지금 눌러야 할 곳」 펄스 전용 변형(티켓 20260928_1752) — 연출 CTA 줄에만 쓴다. 실제 2단계의 버튼에는 붙이지 않는다(채원 사전 판정 20261021_1248).
// rounded-full은 버튼의 --radius-full과 래퍼 반경을 맞춰 펄스 링이 버튼 실루엣과 어긋나지 않게 한다(채원 사전 판정).
// self-start가 없으면 이 줄 자체가 카드 폭으로 늘어나 펄스 링이 카드 폭 전체에 그려진다(티켓 20260928_2137).
const CTA_ROW_PULSE_CLASS = `${CTA_ROW_CLASS} self-start rounded-full jam-quest-pulse`
// 칩과 분수 라벨 한 줄. 글자를 크게 키운 기기에서는 분수 라벨이 다음 줄로 내려가 가로로 넘치지 않는다(flex-wrap, 높이 고정 없음)
const CHIP_ROW_CLASS = 'flex flex-wrap items-center justify-between gap-x-2 gap-y-1'
// ProgressBar.jsx의 fraction 라벨 인라인 스타일(fontSize: var(--text-sm); fontWeight:700;
// color: var(--link))을 그대로 복제한 클래스 — 새 토큰이 아니라 배치만 칩 줄로 옮긴다. 짧은 라벨이라 한 줄로 둔다(whitespace-nowrap).
const PROGRESS_LABEL_CLASS = 'text-sm font-bold text-link whitespace-nowrap break-keep wrap-break-word [font-variant-numeric:tabular-nums]'
// 어절 중간에서 끊기던 `[overflow-wrap:anywhere]`를 한국어 줄바꿈 규칙(§3.2)으로 바꿨다(티켓 20261021_1248)
const TITLE_CLASS = 'text-base font-bold break-keep wrap-break-word text-balance'
const DESC_CLASS = 'text-sm text-muted break-keep wrap-break-word text-pretty'
const BUTTON_LABEL_CLASS = 'whitespace-nowrap break-keep'

function Chip() {
  return <LabelChip className="self-start">{d.onboardingQuest.chipLabel}</LabelChip>
}

/** 칩과 분수 라벨 한 줄. 보이는 분수는 숫자와 빗금이라 스크린리더에는 같은 뜻의 문장을 따로 읽힌다. */
function Header({ fraction, srFraction }: { fraction: string; srFraction: string }) {
  return (
    <div className={CHIP_ROW_CLASS}>
      <Chip />
      <span aria-hidden="true" className={PROGRESS_LABEL_CLASS}>
        {fraction}
      </span>
      <span className="sr-only">{srFraction}</span>
    </div>
  )
}

function Divider() {
  return <hr className="m-0 h-px border-0 bg-border" />
}

// ─── 실제 2단계 체크 목록 ───────────────────────────────────────────────────

/** 마친 행은 `--link` 선 체크 아이콘, 아직 안 한 행은 `--muted` 테두리 원이다. 둘 다 24px 칸에 놓여 글자 시작선이 같다. */
function StepMark({ done }: { done: boolean }) {
  if (done) {
    return <CheckCircleIcon className="h-6 w-6 shrink-0 text-link" aria-hidden="true" />
  }
  return (
    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center">
      <span className="h-[18px] w-[18px] rounded-full border-[1.5px] border-muted" />
    </span>
  )
}

/** 지금 할 차례 행의 설명 — ②는 개체를 알면 필요 포인트와 상관없이 같은 문장이다 */
function currentDescription(current: RealCurrentStep): string {
  const copy = d.onboardingQuest.real
  if (current.step === 'sync') return current.stravaConnected ? copy.sync.descriptionConnected : copy.sync.description
  return current.target === null ? copy.locked.descriptionGeneral : copy.locked.description
}

function ChecklistRow({ row, description }: { row: RealStepRow; description: string | null }) {
  const emphasized = description !== null
  const titleClass = emphasized
    ? 'text-base font-bold leading-6 text-foreground break-keep wrap-break-word'
    : `text-sm leading-6 break-keep wrap-break-word ${row.state === 'pending' ? 'text-muted' : 'text-foreground'}`
  return (
    <li className="flex items-start gap-3">
      <StepMark done={row.state === 'done'} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={`m-0 ${titleClass}`}>
          {d.onboardingQuest.real.steps[row.key]}
          <span className="sr-only">, {d.onboardingQuest.real.rowState[row.state]}</span>
        </p>
        {description !== null && <p className={`m-0 ${DESC_CLASS}`}>{description}</p>}
      </div>
    </li>
  )
}

/**
 * «내 활동으로 2단계» 체크 목록(`<ol>`, 누를 수 없음). `emphasizeCurrent`가 참이면(실제 구역이 위로 올라온 카드) 지금 할 차례 행이
 * 굵은 제목과 설명을 갖고, 아니면(연출 중 카드 아래) 모든 행이 한 줄이다.
 */
function RealChecklist({ real, emphasizeCurrent }: { real: RealStepsView; emphasizeCurrent: boolean }) {
  return (
    <ol aria-label={d.onboardingQuest.real.listLabel} className="m-0 flex list-none flex-col gap-3 p-0">
      {real.rows.map((row) => (
        <ChecklistRow
          key={row.key}
          row={row}
          description={emphasizeCurrent && row.state === 'current' && real.current ? currentDescription(real.current) : null}
        />
      ))}
    </ol>
  )
}

// ─── 실제 구역의 안내와 버튼 ────────────────────────────────────────────────

/** 지금 할 차례 행 아래의 안내. 포인트가 실제로 모자랄 때만 나온다. */
function currentNotice(current: RealCurrentStep): string | null {
  if (current.step === 'locked' && current.shortage) return t(d.onboardingQuest.real.shortage, { need: current.shortage.need })
  return null
}

function ConnectButton() {
  return (
    <Button
      variant="primary"
      surface="sub"
      size="sm"
      className={BUTTON_LABEL_CLASS}
      onClick={() => {
        window.location.href = '/api/strava/auth'
      }}
    >
      {d.onboardingQuest.real.sync.connectCta}
    </Button>
  )
}

/** ① 동기화 길 — 연동됨이면 실제 동기화 버튼, 연동 전이면 연결 길. */
function SyncOrConnect({ stravaConnected, username }: { stravaConnected: boolean; username: string | null }) {
  return stravaConnected ? <SyncButton username={username} size="sm" /> : <ConnectButton />
}

function RealCta({ current, username }: { current: RealCurrentStep; username: string | null }) {
  const router = useRouter()

  if (current.step === 'sync') return <SyncOrConnect stravaConnected={current.stravaConnected} username={username} />

  // ② — 개체를 알면 그 개체의 깊은 링크로, 모르면 인벤토리로 보낸다. 포인트가 모자라도 버튼은 그대로다.
  const href = current.target ? `/inventory/${current.target.itemId}` : '/inventory'
  return (
    <Button variant="primary" surface="sub" size="sm" className={BUTTON_LABEL_CLASS} onClick={() => router.push(href)}>
      {d.onboardingQuest.real.locked.cta}
    </Button>
  )
}

function RealCard({ real, username }: { real: RealStepsView; username: string | null }) {
  const notice = real.current ? currentNotice(real.current) : null
  const progress = d.onboardingQuest.progress
  const counts = { done: real.doneCount, total: real.total }
  return (
    <Card role="group" aria-label={d.onboardingQuest.cardLabel} className={CARD_CLASS}>
      <Header fraction={t(progress.real, counts)} srFraction={t(progress.realSr, counts)} />
      <ProgressBar current={real.doneCount} total={real.total} labelType="none" />
      <RealChecklist real={real} emphasizeCurrent />
      {notice !== null && <InlineNotice>{notice}</InlineNotice>}
      {real.current && (
        <div className={CTA_ROW_CLASS}>
          <RealCta current={real.current} username={username} />
        </div>
      )}
    </Card>
  )
}

// ─── 연출 구역 ──────────────────────────────────────────────────────────────

function DemoCta({ nextStep }: { nextStep: OnboardingQuestStepKey }) {
  const router = useRouter()

  // sync 차례: 카드 CTA가 상단 바 연출 동기화 버튼과 똑같이 동작한다(결정 3-①, 2026-09-28).
  // 표시 방식만 다른 같은 컴포넌트를 재사용한다.
  if (nextStep === 'sync') {
    return (
      <div className={CTA_ROW_PULSE_CLASS}>
        <OnboardingSyncButton size="sm" />
      </div>
    )
  }

  const screen = STEP_SCREEN_MAP[nextStep]
  return (
    <div className={CTA_ROW_PULSE_CLASS}>
      <Button variant="primary" surface="sub" size="sm" className={BUTTON_LABEL_CLASS} onClick={() => router.push(SCREEN_PATH_MAP[screen])}>
        <span>{d.onboardingQuest.continueButton}</span>
        <ChevronRightIcon className="w-4 h-4" />
      </Button>
    </div>
  )
}

function DemoCard({ state }: { state: Extract<NonNullable<OnboardingQuestCardState>, { kind: 'in_progress' }> }) {
  const step = d.onboardingQuest.steps[state.nextStep]
  const progress = d.onboardingQuest.progress
  const counts = { done: state.done, total: state.total }

  // GA4 onboarding_quest_start 계측 — 0/7(첫 렌더)이고 관리자 미리보기가 아닐 때만 마운트
  // (사용자 결정 2, 티켓 20260927_2132). nextStep==='sync'일 때만 done===0이 될 수 있다.
  const startTracker = state.done === 0 && !state.preview ? <QuestStartTracker /> : null

  return (
    <div className="flex flex-col gap-2">
      {startTracker}
      <Card role="group" aria-label={d.onboardingQuest.cardLabel} className={CARD_CLASS}>
        <Header fraction={t(progress.demo, counts)} srFraction={t(progress.demoSr, counts)} />
        <ProgressBar current={state.done} total={state.total} labelType="none" />
        <div className="flex flex-col gap-2">
          <p className={TITLE_CLASS}>{step.title}</p>
          <p className={DESC_CLASS}>{step.description}</p>
        </div>
        <DemoCta nextStep={state.nextStep} />
        {state.real && (
          <>
            <Divider />
            <RealChecklist real={state.real} emphasizeCurrent={false} />
          </>
        )}
      </Card>
      {/* 건너뛰기 진입점(티켓 20260927_2131 T8, 채원 사전 판정) — Card 바깥의 형제 요소다. 연출 진행 중 모든 단계(sync 포함)에서 보이고, 건너뛴 뒤에는 없다.
          GA4 onboarding_quest_skip 이벤트에 실릴 단계 키(nextStep)를 함께 넘긴다(티켓 20260927_2132). */}
      <OnboardingQuestSkipSheet step={state.nextStep} />
    </div>
  )
}

interface Props {
  state: OnboardingQuestCardState
  /** 실제 ① 동기화 버튼(`SyncButton`)에 넘길 프로필 링크 값 */
  username?: string | null
}

export default function OnboardingQuestCard({ state, username = null }: Props) {
  if (!state) return null
  if (state.kind === 'in_progress') return <DemoCard state={state} />
  return <RealCard real={state.real} username={username} />
}
