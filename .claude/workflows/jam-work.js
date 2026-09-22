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
const { batch } = parsedArgs

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
function trackTokens(store, label, before) {
  const after = tokensSpent()
  if (before != null && after != null) store[label] = after - before
}

// 아현의 인수인계도 자유 문장의 `status:` 글자 검색 대신 구조화 출력으로 받는다
// (티켓 20260918_1158). 파이프라인이 직접 판단하는 필드만 스키마로 뽑고, 사람이 읽는
// 나머지 항목(원인·변경 내용·검증 결과·테스트·문서 갱신안·확신도·alerts 등)은 자유
// 마크다운인 `summary`에 담아 형식을 그대로 유지한다.
const DEV_RESULT = {
  type: 'object',
  properties: {
    status: { enum: ['done', 'plan_only', 'needs_design', 'halted'] },
    branch: { type: 'string' },
    commitSha: { type: 'string' },
    baseSha: { type: 'string' },
    diffLineCount: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['status', 'summary'],
}

// 채원①의 needs_approval도 표 안 글자 검색 대신 구조화 출력으로 받는다(티켓 20260918_1158,
// 1148 민지 발견물 ①). 나머지 판정 항목은 자유 텍스트 그대로 두되 하나의 스키마에 담아,
// 아현·민지·채원②에게 넘길 때는 formatDesignDecision()으로 다시 마크다운 표로 펼친다.
const DESIGN_PRE = {
  type: 'object',
  properties: {
    decision: { type: 'string' },
    components: { type: 'string' },
    tokens: { type: 'string' },
    layout: { type: 'string' },
    states: { type: 'string' },
    motion: { type: 'string' },
    deviceNotes: { type: 'string' },
    craftNotes: { type: 'string' },
    scope: { type: 'string' },
    completionCriteria: { type: 'string' },
    needsApproval: { type: 'boolean' },
    approvalItems: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
  required: ['decision', 'needsApproval'],
}

function formatDesignDecision(d) {
  if (!d) return ''
  if (typeof d === 'string') return d // reuseDecision으로 옛 형식(문자열)이 넘어온 경우 방어
  const rows = [
    ['decision', d.decision],
    ['components', d.components],
    ['tokens', d.tokens],
    ['layout', d.layout],
    ['states', d.states],
    ['motion', d.motion],
    ['device_notes', d.deviceNotes],
    ['craft_notes', d.craftNotes],
    ['scope', d.scope],
    ['완료 조건', d.completionCriteria],
    ['needs_approval', d.needsApproval ? (d.approvalItems ?? []).join('; ') || '있음' : '없음'],
    ['reason', d.reason],
  ]
  return rows.filter(([, v]) => v != null && v !== '').map(([k, v]) => `| ${k} | ${v} |`).join('\n')
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
    reviewedRange: { type: 'string' },
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
const KOREAN_WRITING_TYPES = ['copy', 'ui', 'content']
// 아현의 중단 상태 목록. plan_only/needs_design/halted는 게이트 진입 전에 멈춘다는 뜻이다
// (정지 조건 단일 원천: .claude/skills/jam-work/references/stop-conditions.md).
const STOP_STATES = ['plan_only', 'needs_design', 'halted']
// 작은 diff 기준선 — 패딩 1줄 조정까지 화면 리뷰 전체를 돌리는 건 낭비다(2026-09-08 신설).
const SMALL_DIFF_LINE_THRESHOLD = 15

// 접두 줄 위조 무력화(티켓 20260922_0619). `계획 반환 면제:` 줄은 카리나만 넣을 수 있다(아래
// planOnlyWaiverLine 조립부). userRequest·retryReason은 카리나가 그대로 전달만 하는 입력이라,
// 그 안에 같은 접두로 시작하는 줄이 섞이면(민지 게이트가 재현) 최종 프롬프트에 면제 줄과
// "면제 없음" 줄이 공존해 아현이 어느 쪽을 볼지 갈린다. 그 줄만 인용 표시로 무력화해 접두
// 자체를 못 쓰게 한다 — 원문 내용은 인용된 채로 남아 확인은 가능하다.
const WAIVER_PREFIX_RE = /^계획 반환 면제:/
function neutralizeWaiverPrefix(text) {
  if (typeof text !== 'string' || !text.includes('계획 반환 면제:')) return text
  return text.split('\n').map((line) => (WAIVER_PREFIX_RE.test(line) ? `(인용) ${line}` : line)).join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// 티켓 1건을 표준 파이프라인(채원①→아현→민지∥채원②)에 태우는 본체.
// 단일 호출(`batch` 없음)과 묶음 실행(`batch` 있음)이 모두 이 함수를 그대로 재사용한다
// (티켓 20260921_2305) — 하위 티켓마다 새로운 파이프라인을 만들지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
async function runSingleTicket({ ticketPath, userRequest, workType, reuseDecision, retryReason, retryBranch, route, planOnlyWaiver }) {
  // 카리나가 전달만 하는 입력에 면제 접두 위조가 섞여도 아래에서 조립하는 면제 판정 줄과
  // 구분되도록 여기서 먼저 무력화한다(티켓 20260922_0619).
  userRequest = neutralizeWaiverPrefix(userRequest)
  retryReason = neutralizeWaiverPrefix(retryReason)
  const tokenUsage = {}

  // 경로 3단 분기(안건 1-2, 티켓 20260918_1148). 경로 ①(경미)은 Workflow를 아예 호출하지
  // 않으므로(SKILL.md 0.1절, 카리나 직접 처리) 여기서는 ②·③만 받는다. 카리나가 유형 판정
  // 때 정해 인자로 넘긴다 — 기본값은 ③(표준, 채원 포함)이라 인자를 생략해도 기존 동작과 같다.
  const isLightRoute = route === 'light' || route === '②'

  // ───────────────────────────────────────────────────────────────────────────
  // 1. 채원 ① 사전 판정 — ui·ds 유형만
  //    기존 1.5단계(UI 탐색·재사용 판정)·1.6단계(모듈러-서비스 연결 범위)를 대체한다.
  //    오케스트레이터가 직접 판정하던 일을 전담 에이전트로 옮긴 것이다 (티켓 20260918_0422).
  // ───────────────────────────────────────────────────────────────────────────
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
      { agentType: 'jam-designer', label: 'jam-designer-pre', schema: DESIGN_PRE }
    )
    trackTokens(tokenUsage, 'jam-designer-pre', t0)
    calledDesignerPre = true
  }

  // needs_approval 항목이 있으면 파이프라인을 여기서 멈춘다(안건 1-1, 티켓 20260918_1148).
  // 채원①이 구조화 출력으로 반환하는 needsApproval 불리언을 그대로 판단 기준으로 쓴다 — 글자
  // 검색 없이 스키마 필드로 정지 여부를 정한다(티켓 20260918_1158, 1148 민지 발견물 ①).
  // 사용자 승인 후에는 이 판정을 reuseDecision으로 다시 넘겨 채원①을 건너뛴다.
  if (calledDesignerPre) {
    const hasNeedsApproval = designDecision?.needsApproval === true
    if (hasNeedsApproval) {
      return {
        stoppedAt: '채원 사전 판정',
        needsApprovalItems: (designDecision.approvalItems ?? []).join('; '),
        designDecision,
        devStatus: null,
        devResult: null,
        gate: null,
        designReview: null,
        tokenUsage,
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. 구현 (아현)
  // ───────────────────────────────────────────────────────────────────────────
  phase('구현')
  // isolation: 'worktree' 필수 — 병렬 jam-work 세션이 같은 메인 트리에서 동시에 git
  // checkout/commit을 하면 서로의 미커밋 편집·체크아웃 상태를 지운다(티켓 20260906_0110
  // 게이트 리뷰 중 실측: 오케스트레이터가 남긴 문서 편집이 흔적 없이 사라짐). 격리 워크트리는
  // 이 트리 밖에서 분기·커밋하므로 다른 세션의 작업과 절대 겹치지 않는다.
  const designDecisionText = formatDesignDecision(designDecision)
  // 아현의 `plan_only` 기준·면제 규칙 전문은 정지 조건 단일 원천에 있다
  // (.claude/skills/jam-work/references/stop-conditions.md, 티켓 20260921_2305로 이관,
  // 원래 근거는 티켓 20260922_0207). 여기서는 프롬프트에 넣을 한 줄만 조립한다.
  // 프롬프트에는 값이 있든 없든 **항상** 한 줄을 넣어 기본값이 "면제 없음"임을 매번 못 박고,
  // 문자열이 아니거나 비어 있으면 면제 없음으로 본다. 재시도(`retryBranch`·`retryReason`) 블록과는
  // 서로 독립이다 — 워크플로는 이전 실행을 기억하지 않으므로 재시도에도 같은 면제가 필요하면
  // 호출부가 다시 넘긴다.
  const planOnlyWaiverReason = typeof planOnlyWaiver === 'string' ? planOnlyWaiver.replace(/\s+/g, ' ').trim() : ''
  const planOnlyWaiverLine = planOnlyWaiverReason
    ? `계획 반환 면제: ${planOnlyWaiverReason}`
    : '이 티켓에는 계획 반환 면제가 없다. 기준을 넘으면 구현하지 말고 `plan_only`로 반환하라. ' +
      '이전 티켓의 선례는 면제 근거가 아니다.'
  const devT0 = tokensSpent()
  const devResult = await agent(
    `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n요청: ${userRequest}\n` +
    `\n배정된 워크트리는 기본 브랜치(main) 기준으로 만들어져 staging에만 있는 변경이 빠져 있다` +
    `(티켓 20260918_1158 중단 사례: main에 없는 채원 정의를 "없다"고 오판). 티켓을 포함해 어떤 ` +
    `파일도 읽기 전에, **첫 명령으로** \`git fetch origin staging && git checkout --detach ` +
    `origin/staging && scripts/workspace-setup.sh link "$(pwd)"\`를 실행하라(마지막 명령은 ` +
    `기존 워크트리의 jam-web/node_modules를 심볼릭 링크로 연결한다 — npm install을 다시 돌리지 ` +
    `않는다). 기획·운영 문서 jam-doc/ 은 같은 저장소의 폴더라 워크트리에 그대로 따라오므로 ` +
    `필요하면 직접 고쳐 커밋한다. 그 전에 본 파일 내용은 무효다. 브랜치는 그 뒤 정의의 5번 규칙대로 만든다.\n` +
    `${designDecisionText ? `\n채원 사전 판정(이대로 따를 것):\n${designDecisionText}\n` : ''}` +
    `${retryBranch ? `\n재시도다. 새 브랜치를 만들지 말고 기존 review 브랜치를 이어서 쓴다: ` +
      `\`git fetch origin ${retryBranch} && git checkout ${retryBranch}\`. 직전 시도가 남긴 낡은 ` +
      `워크트리가 같은 브랜치명을 점유하고 있지 않은지 먼저 확인하라(있으면 제거 후 진행, 정의의 ` +
      `5번 규칙 참고). 이 브랜치 위에 커밋을 이어서 쌓고 같은 브랜치로 다시 push한다.\n` : ''}` +
    `${retryReason ? `\n이전 리뷰 재작업 사유 — 반드시 해결할 것:\n${retryReason}\n` : ''}` +
    `${KOREAN_WRITING_TYPES.includes(workType) ? `\n신규·변경되는 사용자 노출 한국어 문구(UI 카피, 배지·미션·POI 설명, 알림·토스트 등)를 ` +
      `작성할 때는 .claude/output-styles/fluent-korean.md를 읽고 그 지침을 따라 작성하라.\n` : ''}` +
    `\n${planOnlyWaiverLine}\n` +
    `\n이 티켓을 읽고 구현을 진행하라.`,
    { agentType: 'jam-developer', label: 'jam-developer', isolation: 'worktree', schema: DEV_RESULT }
  )
  trackTokens(tokenUsage, 'jam-developer', devT0)

  // 아현의 중단 상태는 게이트 진입 **전에** 확인한다 — 구현물이 없거나 불완전한 상태로
  // 민지를 부르면 판정할 대상 자체가 없다 (티켓 20260918_0422). 세 상태의 의미와 다음 행동은
  // .claude/skills/jam-work/references/stop-conditions.md가 단일 원천이다.
  // devResult.status는 구조화 필드다 — 문장에서 글자 검색으로 찾지 않는다(티켓 20260918_1158).
  const devStatus = devResult?.status ?? ''
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

  // ───────────────────────────────────────────────────────────────────────────
  // 3. 게이트 리뷰 (민지) — 한국어 자연스러움 판정도 여기서 함께 한다
  //    이전에는 게이트가 hasKoreanCopy/koreanCopyText만 뽑아 별도 humanize-korean
  //    플러그인에게 넘겼으나(제안형, 판정에 영향 없음), 그 결과가 실효성이 낮았고
  //    파이프라인만 5단계로 복잡해졌다. 문맥 판단이 필요한 AI-tell 패턴(대명사 지시
  //    모호성·리듬 균일성·완곡 중첩 등, docs/specs/SLOP_DICTIONARY.md §4 참고)을 민지의
  //    체크리스트 12번으로 흡수해 판정에 실질적으로 반영되게 했다(티켓 20260918_1033).
  //    패턴 매칭 가능한 금칙어·금지 문장은 여전히 scripts/check-slop.mjs가 기계적으로
  //    먼저 거른다(verify.sh 단계, 이 워크플로 밖).
  // ───────────────────────────────────────────────────────────────────────────
  phase('게이트 리뷰')
  // 커밋 범위(baseSha..commitSha)를 아현에게서 받아 그대로 넘긴다 — 민지·채원②가 branch 이름과
  // 그때그때의 origin/staging을 다시 fetch해 비교하지 않고, 아현이 push한 두 커밋 사이의 diff만
  // 보게 한다(1148 민지 발견물 ②, 티켓 20260918_1158). 워크트리 fetch 여부에 기대는 대신 SHA
  // 대조로 구조적으로 보완한다.
  const commitRange = devResult?.baseSha && devResult?.commitSha
    ? `${devResult.baseSha}..${devResult.commitSha}` : null
  const rangeInstruction = commitRange
    ? `\n검토 범위는 \`${commitRange}\`다. \`git fetch origin ${devResult.branch}\`로 review ` +
      `브랜치를 가져온 뒤 \`git diff --numstat ${commitRange} -- jam-web\`으로 비교하고, ` +
      `\`reviewedRange\`에 \`${commitRange}\`를 그대로 적어라.\n`
    : `\n아현이 커밋 범위를 채우지 않았다 — \`git fetch origin staging\`으로 origin/staging을 ` +
      `갱신한 뒤 \`git diff --numstat <review 브랜치> origin/staging -- jam-web\`으로 비교하고, ` +
      `\`reviewedRange\`에 실제로 비교한 범위를 적어라.\n`

  // 2026-09-18부터는 채원② 사후 리뷰 생략 판단에만 쓴다 — 개선 리뷰 단계 자체가 사라졌기
  // 때문이다(티켓 20260918_0422). 게이트·채원②를 병렬로 돌리므로(티켓 20260918_1158) 게이트가
  // 끝나기를 기다리지 않고 아현이 직접 보고한 diffLineCount로 실행 여부를 정한다.
  const preDiffLineCount = devResult?.diffLineCount ?? Infinity
  const runDesignReview = DESIGN_TYPES.includes(workType) &&
    preDiffLineCount >= SMALL_DIFF_LINE_THRESHOLD && !isLightRoute

  // 민지(게이트)와 채원②(사후 리뷰)는 둘 다 아현의 결과만 보고 서로를 참조하지 않으므로 전역
  // parallel()(배리어, 실패한 작업은 null)로 동시에 돌린다(티켓 20260918_1158). 민지가 FAIL이어도
  // 채원②는 멈추지 않고 끝까지 진행하되, 그 결과는 참고용으로만 쓴다 — needsRework는 여전히
  // 게이트 FAIL 또는 채원② 중대 문제 중 하나로만 판단한다.
  // 채원②의 모델: 핵심 화면은 Sonnet, 그 외는 Haiku로 낮춘다(채원 정의의 모드표). 여기서는
  // 핵심 화면 여부를 워크플로가 판단할 수 없으므로 `ds` 유형(디자인 시스템 자체 변경 = 파급이
  // 크다)만 Sonnet으로 두고 나머지는 Haiku로 부른다.
  // 병렬 호출이라 전후 토큰 차이를 에이전트별로 쪼갤 수 없다 — 두 호출을 묶어 하나로 기록한다.
  const parallelT0 = tokensSpent()
  const [gate, designReview] = await parallel([
    () => agent(
      `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult?.summary ?? devResult}\n` +
      `${designDecisionText ? `\n채원 사전 판정(점검표 6번 대조 기준):\n${designDecisionText}\n` : ''}` +
      rangeInstruction +
      // 면제 없이 기준을 넘겼는지는 아현 자체 판단에만 맡기지 않는다(티켓 20260922_0619) —
      // 이번 실행의 면제 값을 그대로 넘겨 점검표 5번에서 대조하게 한다.
      `\n이번 실행의 계획 반환 면제: ${planOnlyWaiverReason || '없음'}\n` +
      `\n스펙대로 동작하는지 판정하라.`,
      { agentType: 'jam-reviewer', label: 'jam-reviewer', schema: VERDICT }
    ),
    () => runDesignReview ? agent(
      `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult?.summary ?? devResult}\n` +
      `${designDecisionText ? `\n이번 티켓의 채원 사전 판정:\n${designDecisionText}\n` : '\n이번 티켓에는 사전 판정이 없다. 점검표 0절은 건너뛴다.\n'}` +
      rangeInstruction +
      `\n모드 ② 사후 리뷰로 진행하라. ` +
      `.claude/skills/jam-design/references/ui-review-checklist.md를 읽고 그 점검표대로 ` +
      `위 검토 범위의 diff만 검토하라. 손대지 않은 기존 코드는 다루지 마라. 라이팅 품질은 민지가 ` +
      `동시에 게이트 리뷰에서 판정하므로 여기서 다시 보지 않는다.`,
      {
        agentType: 'jam-designer',
        label: 'jam-designer-post',
        phase: '채원 사후 리뷰',
        schema: DESIGN_REVIEW,
        ...(workType === 'ds' ? {} : { model: 'claude-haiku-4-5-20251001' }),
      }
    ) : Promise.resolve(null),
  ])
  trackTokens(tokenUsage, 'gate+jam-designer-post', parallelT0)

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
}

// ─────────────────────────────────────────────────────────────────────────────
// 묶음 실행(`batch`) — 하위 티켓 목록을 하나씩 runSingleTicket()에 태운다 (티켓 20260921_2305).
// 기본은 꺼져 있다(`batch`가 비어 있으면 아래 단일 호출 경로로 그대로 간다).
//
// Workflow 스크립트는 파일시스템·Node API·`import()`를 쓸 수 없다(하네스가 시작 단계에서
// 거부한다 — 2026-09-22 카리나 실측). 그래서 하위 티켓 조회·정렬·유형 판정·정지 예정 지점
// 계산은 전부 `scripts/batch-tickets.mjs`(일반 Node 스크립트)가 맡고, 이 워크플로는 그 출력
// 객체를 `batch` 인자로 그대로 받아 순서대로 실행만 한다. `batch`의 모양은
// `{ parentTicket, subTickets: [{id,path,status,category,workType,sequence}], plannedStopAt }`
// 다(`.claude/skills/jam-work/SKILL.md` 2절).
// ─────────────────────────────────────────────────────────────────────────────

async function runBatch(batchInput, planOnlyWaiver) {
  const { parentTicket, subTickets = [], plannedStopAt } = batchInput
  const order = subTickets.map((t) => t.id)
  const results = {}
  const tokenUsageByTicket = {}
  let stoppedBatchAt = null

  for (const t of subTickets) {
    if (t.status !== 'OPEN') continue

    // scripts/batch-tickets.mjs가 미리 계산해 넘긴 정적 정지 지점(정지 조건 3번: db·engine
    // 진입, 유형 미매핑) — 이 워크플로는 그 판정을 다시 계산하지 않고 그대로 신뢰한다.
    if (plannedStopAt && t.id === plannedStopAt.ticketId) {
      stoppedBatchAt = { ticketId: t.id, reason: plannedStopAt.reason }
      break
    }

    const result = await runSingleTicket({
      ticketPath: t.path,
      userRequest: '이 티켓을 읽고 구현을 진행하라.',
      workType: t.workType,
      planOnlyWaiver,
    })
    results[t.id] = result
    tokenUsageByTicket[t.id] = result.tokenUsage

    // 정지 조건 1·2·5·6번 — 게이트 FAIL, [중단], needs_approval, plan_only/needs_design/halted.
    const hitStopCondition = Boolean(result.stoppedAt) ||
      STOP_STATES.includes(result.devStatus) ||
      result.gate?.verdict === 'FAIL' ||
      result.needsRework === true
    if (hitStopCondition) {
      // devStatus(plan_only/needs_design/halted)가 stoppedAt('구현')보다 더 구체적인 사유이므로
      // 우선한다. devStatus가 없으면 stoppedAt('채원 사전 판정' 등)을 쓰고, 둘 다 없으면 게이트
      // FAIL이나 채원② 중대 문제(needsRework)다.
      const reason = result.devStatus || result.stoppedAt ||
        (result.gate?.verdict === 'FAIL' ? '게이트 FAIL' : '재작업 필요(needsRework)')
      stoppedBatchAt = { ticketId: t.id, reason }
      break
    }
  }

  return { batch: true, parentTicket, order, results, tokenUsageByTicket, stoppedBatchAt }
}

// ─────────────────────────────────────────────────────────────────────────────
// 진입점 — `batch`가 있으면 묶음 실행, 없으면 지금까지와 같은 단일 티켓 실행.
// ─────────────────────────────────────────────────────────────────────────────
if (batch) {
  return await runBatch(batch, parsedArgs.planOnlyWaiver)
}
return await runSingleTicket(parsedArgs)
