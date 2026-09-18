export const meta = {
  name: 'jam-work',
  description: 'JAM! 에이전트 팀 파이프라인 (채원①·아현·민지·채원②)',
  phases: [
    { title: '채원 사전 판정' },
    { title: '구현' },
    { title: '게이트 리뷰' },
    { title: '채원 사후 리뷰' },
  ],
}

// 호출부(오케스트레이터)가 Workflow 도구의 `args`로 넘긴 값을 받는다.
// `reuseDecision`은 2026-09-18부터 "오케스트레이터가 직접 내린 재사용 판정"이 아니라
// "이미 있는 채원 사전 판정을 재사용하라"는 선택적 입력이다 — 값이 있으면 채원①을
// 건너뛰고 그 판정을 그대로 쓴다 (티켓 20260918_0422).
//
// 호출부가 넘긴 args 텍스트에 잘못된 유니코드 이스케이프가 하나라도 섞여 있으면, 상위
// 파서가 조용히 실패하며 args를 파싱된 객체가 아니라 원본 문자열 그대로 넘기는 현상을
// 확인했다(2026-09-18, 티켓 20260918_0423 재시도 3회 — 오타 있는 텍스트를 그대로 재사용해
// 매번 재현됨, 에러 없이 전 필드가 undefined가 되어 원인 추적이 오래 걸렸다). 근본 원인은
// 호출부의 입력 오타이지만, 실패 시 조용히 undefined로 넘어가는 대신 최소한 명확한
// SyntaxError로 드러나도록 방어적으로 파싱한다.
const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args
const { ticketPath, userRequest, workType, reuseDecision, retryReason, route } = parsedArgs

// 경로 3단 분기(안건 1-2, 티켓 20260918_1148). 경로 ①(경미)은 Workflow를 아예 호출하지
// 않으므로(SKILL.md 0.1절, 카리나 직접 처리) 여기서는 ②·③만 받는다. 카리나가 유형 판정
// 때 정해 인자로 넘긴다 — 기본값은 ③(표준, 채원 포함)이라 인자를 생략해도 기존 동작과 같다.
const isLightRoute = route === 'light' || route === '②'

// 도구가 agent() 사용량을 직접 돌려주지 않는다. 전역 budget.spent()가 이번 턴 누계
// 출력 토큰을 주므로, 호출 전후 차이로 에이전트별 출력 토큰만 추정한다(입력 토큰은 알 수
// 없음 — SKILL.md 참고 절에 한계를 적어 둔다. 전체 사용량은 카리나가 journal.jsonl로 보완).
function tokensSpent() {
  try {
    return typeof budget !== 'undefined' && typeof budget.spent === 'function' ? budget.spent() : null
  } catch {
    return null
  }
}
const tokenUsage = {}
function trackTokens(label, before) {
  const after = tokensSpent()
  if (before != null && after != null) tokenUsage[label] = after - before
}

// 게이트 판정은 자유 텍스트가 아니라 구조화 출력으로 받는다.
// (FAIL 판정문 본문에 "PASS"라는 단어가 들어가도 오라우팅되지 않도록)
const VERDICT = {
  type: 'object',
  properties: {
    verdict: { enum: ['PASS', 'WARN', 'FAIL'] },
    reasons: { type: 'array', items: { type: 'string' } },
    checked: { type: 'array', items: { type: 'string' } },
    sideFindings: { type: 'array', items: { type: 'string' } },
    hasKoreanCopy: { type: 'boolean' },
    koreanCopyText: { type: 'string' },
    diffLineCount: { type: 'number' },
  },
  required: ['verdict', 'reasons'],
}

// 채원② 사후 리뷰도 구조화 출력으로 받는다 — `hasCritical`이 재작업 분기의 유일한 기준이다.
// (제안 본문에 "중대"라는 단어가 들어가도 오라우팅되지 않도록)
const DESIGN_REVIEW = {
  type: 'object',
  properties: {
    hasCritical: { type: 'boolean' },
    critical: { type: 'array', items: { type: 'string' } },
    proposals: { type: 'array', items: { type: 'string' } },
    promotionCandidates: { type: 'array', items: { type: 'string' } },
    checked: { type: 'array', items: { type: 'string' } },
  },
  required: ['hasCritical'],
}

// 채원①·②의 대상 유형. `admin`은 MODULAR 적용 제외라 들어오지 않는다.
const DESIGN_TYPES = ['ui', 'ds']

// ─────────────────────────────────────────────────────────────────────────────
// 1. 채원 ① 사전 판정 — ui·ds 유형만
//    기존 1.5단계(UI 탐색·재사용 판정)·1.6단계(모듈러-서비스 연결 범위)를 대체한다.
//    오케스트레이터가 직접 판정하던 일을 전담 에이전트로 옮긴 것이다 (티켓 20260918_0422).
// ─────────────────────────────────────────────────────────────────────────────
phase('채원 사전 판정')
let designDecision = reuseDecision ?? null
// 채원①을 이번 실행에서 새로 불렀는지 여부 — needs_approval 검사는 신규 판정에만 적용한다.
// reuseDecision으로 넘어온 판정은 이미 사용자 승인을 받은 뒤 재호출된 것이므로 다시 멈추지 않는다.
let calledDesignerPre = false
if (!designDecision && DESIGN_TYPES.includes(workType) && !isLightRoute) {
  const t0 = tokensSpent()
  designDecision = await agent(
    `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n요청: ${userRequest}\n\n` +
    `모드 ① 사전 판정으로 진행하라. 재사용/MODULAR 확장/서비스 전용을 판정하고, 쓸 컴포넌트와 ` +
    `토큰, 텍스트 배치도, 구현해야 할 상태 목록, 모션, 기기 주의사항, 시각 슬롭 경고, 완료 조건, ` +
    `사용자 승인이 필요한 항목을 정의된 형식대로 반환하라.` +
    `${workType === 'ds' ? `\n\`ds\` 유형이므로 ` +
      `.claude/skills/jam-work/references/ds-connection-scope.md 기준 네 부류 중 이번 변경이 ` +
      `어디에 해당하는지 \`scope\`에 명시하라.\n` : ''}`,
    { agentType: 'jam-designer', label: 'jam-designer-pre' }
  )
  trackTokens('jam-designer-pre', t0)
  calledDesignerPre = true
}

// needs_approval 항목이 있으면 파이프라인을 여기서 멈춘다(안건 1-1, 티켓 20260918_1148).
// 채원①은 자유 텍스트를 반환하므로 needs_approval 칸의 값을 텍스트로 추출해 "없음"이 아닌지
// 확인한다. 사용자 승인 후에는 이 판정을 reuseDecision으로 다시 넘겨 채원①을 건너뛴다.
if (calledDesignerPre) {
  const naMatch = String(designDecision).match(/needs_approval[`*]*\s*[:|]\s*([^\n|]+)/i)
  const naValue = (naMatch?.[1] ?? '').trim()
  const hasNeedsApproval = naValue !== '' && !/^없음/.test(naValue)
  if (hasNeedsApproval) {
    return {
      stoppedAt: '채원 사전 판정',
      needsApprovalItems: naValue,
      designDecision,
      devStatus: null,
      devResult: null,
      gate: null,
      designReview: null,
      tokenUsage,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 구현 (아현)
// ─────────────────────────────────────────────────────────────────────────────
phase('구현')
// isolation: 'worktree' 필수 — 병렬 jam-work 세션이 같은 메인 트리에서 동시에 git
// checkout/commit을 하면 서로의 미커밋 편집·체크아웃 상태를 지운다(티켓 20260906_0110
// 게이트 리뷰 중 실측: 오케스트레이터가 남긴 문서 편집이 흔적 없이 사라짐). 격리 워크트리는
// 이 트리 밖에서 분기·커밋하므로 다른 세션의 작업과 절대 겹치지 않는다.
const KOREAN_WRITING_TYPES = ['copy', 'ui', 'content']
const devT0 = tokensSpent()
const devResult = await agent(
  `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n요청: ${userRequest}\n` +
  `\n배정된 워크트리는 호출 시점의 메인 트리 기준으로 만들어져 최신 origin/staging보다 뒤처져 ` +
  `있을 수 있다(티켓 20260918_1148). 어떤 파일을 읽거나 판단을 내리기 전에 반드시 ` +
  `\`git fetch origin staging\`을 먼저 실행하고, 정의의 5번 규칙대로 \`origin/staging\`에서 ` +
  `분기한 뒤 작업하라 — 워크트리의 기존 HEAD를 그대로 믿지 마라.\n` +
  `${designDecision ? `\n채원 사전 판정(이대로 따를 것):\n${designDecision}\n` : ''}` +
  `${retryReason ? `\n이전 리뷰 재작업 사유 — 반드시 해결할 것:\n${retryReason}\n` +
    `재시도이므로 review 브랜치를 체크아웃하기 전에 직전 시도가 남긴 낡은 워크트리가 같은 ` +
    `브랜치명을 점유하고 있지 않은지 먼저 확인하고(있으면 제거 후 진행) 작업하라(자세한 절차는 ` +
    `정의의 5번 규칙 참고).\n` : ''}` +
  `${KOREAN_WRITING_TYPES.includes(workType) ? `\n신규·변경되는 사용자 노출 한국어 문구(UI 카피, 배지·미션·POI 설명, 알림·토스트 등)를 ` +
    `작성할 때는 .claude/output-styles/fluent-korean.md를 읽고 그 지침을 따라 작성하라.\n` : ''}` +
  `\n이 티켓을 읽고 구현을 진행하라.`,
  { agentType: 'jam-developer', label: 'jam-developer', isolation: 'worktree' }
)
trackTokens('jam-developer', devT0)

// 아현의 중단 상태는 게이트 진입 **전에** 확인한다 — 구현물이 없거나 불완전한 상태로
// 민지를 부르면 판정할 대상 자체가 없다 (티켓 20260918_0422).
//   plan_only    : 파일 5개 초과 또는 100줄 이상 예상 → 구현 계획만 반환
//   needs_design : UI 작업인데 채원 사전 판정이 없음
//   halted       : [중단] 급 이상 발견
const STOP_STATES = ['plan_only', 'needs_design', 'halted']
const devStatus = (String(devResult).match(/status:\s*([a-z_]+)/i)?.[1] ?? '').toLowerCase()
if (STOP_STATES.includes(devStatus)) {
  return {
    stoppedAt: '구현',
    devStatus,
    designDecision,
    devResult,
    gate: null,
    designReview: null,
    tokenUsage,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 게이트 리뷰 (민지) — 한국어 자연스러움 판정도 여기서 함께 한다
//    이전에는 게이트가 hasKoreanCopy/koreanCopyText만 뽑아 별도 humanize-korean
//    플러그인에게 넘겼으나(제안형, 판정에 영향 없음), 그 결과가 실효성이 낮았고
//    파이프라인만 5단계로 복잡해졌다. 문맥 판단이 필요한 AI-tell 패턴(대명사 지시
//    모호성·리듬 균일성·완곡 중첩 등, Specs/SLOP_DICTIONARY.md §4 참고)을 민지의
//    체크리스트 12번으로 흡수해 판정에 실질적으로 반영되게 했다(티켓 20260918_1033).
//    패턴 매칭 가능한 금칙어·금지 문장은 여전히 scripts/check-slop.mjs가 기계적으로
//    먼저 거른다(verify.sh 단계, 이 워크플로 밖).
// ─────────────────────────────────────────────────────────────────────────────
phase('게이트 리뷰')
const gateT0 = tokensSpent()
const gate = await agent(
  `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n` +
  `${designDecision ? `\n채원 사전 판정(점검표 6번 대조 기준):\n${designDecision}\n` : ''}` +
  `\ndiffLineCount를 재기 전에 \`git fetch origin staging\`을 먼저 실행해 로컬 origin/staging ` +
  `참조를 최신으로 갱신하라 — 배정된 워크트리가 호출 시점 메인 트리 기준이라 origin/staging ` +
  `참조가 뒤처져 있을 수 있다(티켓 20260918_1148). 이후 \`git diff --numstat <review 브랜치> ` +
  `origin/staging\`으로 비교하라.\n` +
  `\n스펙대로 동작하는지 판정하라.`,
  { agentType: 'conservative-reviewer', label: 'conservative-reviewer', schema: VERDICT }
)
trackTokens('conservative-reviewer', gateT0)

// 작은 diff 기준선 — 패딩 1줄 조정까지 화면 리뷰 전체를 돌리는 건 낭비다(2026-09-08 신설).
// 2026-09-18부터는 채원② 사후 리뷰 생략 판단에만 쓴다 — 개선 리뷰 단계 자체가 사라졌기
// 때문이다(티켓 20260918_0422). 값이 없으면 안전하게 실행 쪽으로 기운다.
const SMALL_DIFF_LINE_THRESHOLD = 15
const diffLineCount = gate.diffLineCount ?? Infinity

const gatePassed = gate.verdict === 'PASS' || gate.verdict === 'WARN'

// WARN도 "동작은 한다"이므로 사후 단계는 진행한다 (사용자 알림은 결과 보고에서).
// 경로 ②(가벼운 UI)면 채원①·② 둘 다 호출하지 않는다(안건 1-2, 티켓 20260918_1148).
const runDesignReview = gatePassed &&
  DESIGN_TYPES.includes(workType) && diffLineCount >= SMALL_DIFF_LINE_THRESHOLD && !isLightRoute

// 채원②의 모델: 핵심 화면은 Sonnet, 그 외는 Haiku로 낮춘다(채원 정의의 모드표). 여기서는
// 핵심 화면 여부를 워크플로가 판단할 수 없으므로 `ds` 유형(디자인 시스템 자체 변경 = 파급이
// 크다)만 Sonnet으로 두고 나머지는 Haiku로 부른다.
const designReviewT0 = tokensSpent()
const designReview = runDesignReview ? await agent(
  `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n\n` +
  `게이트 리뷰 근거:\n${gate.reasons.join('\n')}\n` +
  `${designDecision ? `\n이번 티켓의 채원 사전 판정:\n${designDecision}\n` : '\n이번 티켓에는 사전 판정이 없다. 점검표 0절은 건너뛴다.\n'}` +
  `\n모드 ② 사후 리뷰로 진행하라. ` +
  `.claude/skills/jam-design/references/ui-review-checklist.md를 읽고 그 점검표대로 ` +
  `이번 티켓의 diff(review 브랜치 vs origin/staging)만 검토하라. 손대지 않은 기존 코드는 ` +
  `다루지 마라. 라이팅 품질은 게이트 리뷰(민지)가 이미 판정했으므로 여기서 다시 보지 않는다.`,
  {
    agentType: 'jam-designer',
    label: 'jam-designer-post',
    phase: '채원 사후 리뷰',
    schema: DESIGN_REVIEW,
    ...(workType === 'ds' ? {} : { model: 'claude-haiku-4-5-20251001' }),
  }
) : null
if (runDesignReview) trackTokens('jam-designer-post', designReviewT0)

// 채원②의 중대 문제는 게이트 FAIL과 동등하게 재작업으로 연결된다. 오케스트레이터가 이
// 플래그를 보고 사용자에게 재시도 여부를 묻고, `retryReason`에 `reworkReasons`를 넣어
// 다시 호출한다 (티켓 20260918_0422).
const needsRework = gate.verdict === 'FAIL' || designReview?.hasCritical === true
const reworkReasons = [
  ...(gate.verdict === 'FAIL' ? gate.reasons : []),
  ...(designReview?.hasCritical ? (designReview.critical ?? []) : []),
]

return {
  stoppedAt: null,
  devStatus: devStatus || 'done',
  designDecision,
  devResult,
  gate,
  designReview,
  needsRework,
  reworkReasons,
  tokenUsage,
}
