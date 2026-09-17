export const meta = {
  name: 'jam-work',
  description: 'JAM! 에이전트 팀 파이프라인 (채원①·아현·민지·채원②·한국어)',
  phases: [
    { title: '채원 사전 판정' },
    { title: '구현' },
    { title: '게이트 리뷰' },
    { title: '채원 사후 리뷰' },
    { title: '한국어 리뷰' },
  ],
}

// 호출부(오케스트레이터)가 Workflow 도구의 `args`로 넘긴 값을 받는다.
// `reuseDecision`은 2026-09-18부터 "오케스트레이터가 직접 내린 재사용 판정"이 아니라
// "이미 있는 채원 사전 판정을 재사용하라"는 선택적 입력이다 — 값이 있으면 채원①을
// 건너뛰고 그 판정을 그대로 쓴다 (티켓 20260918_0422).
const { ticketPath, userRequest, workType, reuseDecision, retryReason } = args

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
if (!designDecision && DESIGN_TYPES.includes(workType)) {
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
const devResult = await agent(
  `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n요청: ${userRequest}\n` +
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
    koreanReview: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 게이트 리뷰 (민지)
// ─────────────────────────────────────────────────────────────────────────────
phase('게이트 리뷰')
const gate = await agent(
  `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n` +
  `${designDecision ? `\n채원 사전 판정(점검표 6번 대조 기준):\n${designDecision}\n` : ''}` +
  `\n스펙대로 동작하는지 판정하라.`,
  { agentType: 'conservative-reviewer', label: 'conservative-reviewer', schema: VERDICT }
)

// 작은 diff 기준선 — 패딩 1줄 조정까지 화면 리뷰 전체를 돌리는 건 낭비다(2026-09-08 신설).
// 2026-09-18부터는 채원② 사후 리뷰 생략 판단에만 쓴다 — 개선 리뷰 단계 자체가 사라졌기
// 때문이다(티켓 20260918_0422). 값이 없으면 안전하게 실행 쪽으로 기운다.
const SMALL_DIFF_LINE_THRESHOLD = 15
const diffLineCount = gate.diffLineCount ?? Infinity

const gatePassed = gate.verdict === 'PASS' || gate.verdict === 'WARN'

// WARN도 "동작은 한다"이므로 사후 단계는 진행한다 (사용자 알림은 결과 보고에서).
const runDesignReview = gatePassed &&
  DESIGN_TYPES.includes(workType) && diffLineCount >= SMALL_DIFF_LINE_THRESHOLD

// UX Writing 문안이 나올 가능성이 있는 유형만 대상. 추출은 별도 에이전트를 새로 띄우지 않고
// 게이트 리뷰(conservative-reviewer)가 이미 diff를 읽은 김에 VERDICT.hasKoreanCopy/koreanCopyText로
// 함께 판정한다 — humanize-korean 에이전트는 "받은 텍스트를 그대로 처리"하는 계약이라, 직접
// diff를 뒤지게 하지 않는다.
const KOREAN_COPY_TYPES = ['copy', 'ui', 'content']
const runKoreanReview = gatePassed &&
  KOREAN_COPY_TYPES.includes(workType) && gate.hasKoreanCopy && gate.koreanCopyText

// 채원②와 한국어 리뷰는 서로의 결과를 참조하지 않고 devResult·gate만 본다 — 순서대로 await할
// 이유가 없어 동시 실행한다. 각 agent()에 opts.phase를 개별 지정해 병렬 실행 중에도 진행
// 표시가 올바른 제목으로 묶이게 한다. 조건이 꺼진 단계는 agent()를 아예 부르지 않고 즉시
// null로 해소되는 thunk를 넣어 parallel() 호출 형태(결과 배열 순서 고정)는 유지한다.
//
// 채원②의 모델: 핵심 화면은 Sonnet, 그 외는 Haiku로 낮춘다(채원 정의의 모드표). 여기서는
// 핵심 화면 여부를 워크플로가 판단할 수 없으므로 `ds` 유형(디자인 시스템 자체 변경 = 파급이
// 크다)만 Sonnet으로 두고 나머지는 Haiku로 부른다. 한국어 리뷰(humanize-korean)는 model을
// 지정하지 않는다 — 그 플러그인이 route_hint로 내부 모델·콜 수를 이미 조절하므로, 여기서
// 덮어쓰면 그 판단을 무력화한다. 게이트(민지)는 판정 정확도가 핵심이라 정의의 model을 따른다.
const [designReview, koreanReview] = await parallel([
  () => runDesignReview ? agent(
    `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n\n` +
    `게이트 리뷰 근거:\n${gate.reasons.join('\n')}\n` +
    `${designDecision ? `\n이번 티켓의 채원 사전 판정:\n${designDecision}\n` : '\n이번 티켓에는 사전 판정이 없다. 점검표 0절은 건너뛴다.\n'}` +
    `\n모드 ② 사후 리뷰로 진행하라. ` +
    `.claude/skills/jam-design/references/ui-review-checklist.md를 읽고 그 점검표대로 ` +
    `이번 티켓의 diff(review 브랜치 vs origin/staging)만 검토하라. 손대지 않은 기존 코드는 ` +
    `다루지 마라. 라이팅 품질은 한국어 리뷰 단계가 따로 담당하므로 여기서 보지 않는다.`,
    {
      agentType: 'jam-designer',
      label: 'jam-designer-post',
      phase: '채원 사후 리뷰',
      schema: DESIGN_REVIEW,
      ...(workType === 'ds' ? {} : { model: 'claude-haiku-4-5-20251001' }),
    }
  ) : Promise.resolve(null),

  () => runKoreanReview ? agent(
    `다음은 이번 티켓에서 새로 추가·변경된 사용자 노출 한국어 문구다. 두 가지를 함께 점검하라:\n` +
    `1) 번역투·과도한 수동태·AI 특유의 상투구 같은 어색한 표현이 있는지\n` +
    `2) Service Plan/Specs/UX_WRITING_GUIDELINE.md 기준(용어 일관성, 톤앤매너, 에러 메시지 3단계 ` +
    `구조, 해요체, 표기 규칙)을 충족하는지\n` +
    `두 관점의 문제를 구분해 지적하고 자연스러운 대안을 제시하라:\n\n${gate.koreanCopyText}`,
    { agentType: 'humanize-korean:humanize-monolith', label: 'korean-writing-reviewer', phase: '한국어 리뷰' }
  ) : Promise.resolve(null),
])

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
  koreanReview,
  needsRework,
  reworkReasons,
}
