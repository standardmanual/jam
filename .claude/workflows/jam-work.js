export const meta = {
  name: 'jam-work',
  description: 'JAM! 개발자/리뷰어 분리 파이프라인',
  phases: [{ title: '구현' }, { title: '게이트 리뷰' }, { title: '개선 리뷰' }, { title: '인터페이스 리뷰' }, { title: '한국어 리뷰' }],
}

// 호출부(오케스트레이터)가 Workflow 도구의 `args`로 넘긴 값을 받는다.
// 파이프라인 동작은 그대로이고, 스크립트를 파일로 분리하면서 변수 수신부만 바뀌었다
// (티켓 20260910_1246).
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

phase('구현')
// isolation: 'worktree' 필수 — 병렬 jam-work 세션이 같은 메인 트리에서 동시에 git
// checkout/commit을 하면 서로의 미커밋 편집·체크아웃 상태를 지운다(티켓 20260906_0110
// 게이트 리뷰 중 실측: 오케스트레이터가 남긴 문서 편집이 흔적 없이 사라짐). 격리 워크트리는
// 이 트리 밖에서 분기·커밋하므로 다른 세션의 작업과 절대 겹치지 않는다.
const KOREAN_WRITING_TYPES = ['copy', 'ui', 'content']
const devResult = await agent(
  `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n요청: ${userRequest}\n` +
  `${reuseDecision ? `\nUI 재사용 판정(오케스트레이터 결정, 이대로 따를 것):\n${reuseDecision}\n` : ''}` +
  `${retryReason ? `\n이전 게이트 리뷰 FAIL 사유 — 반드시 해결할 것:\n${retryReason}\n` : ''}` +
  `${KOREAN_WRITING_TYPES.includes(workType) ? `\n신규·변경되는 사용자 노출 한국어 문구(UI 카피, 배지·미션·POI 설명, 알림·토스트 등)를 ` +
    `작성할 때는 .claude/output-styles/fluent-korean.md를 읽고 그 지침을 따라 작성하라.\n` : ''}` +
  `\n이 티켓을 읽고 구현을 진행하라.`,
  { agentType: 'jam-developer', label: 'jam-developer', isolation: 'worktree' }
)

phase('게이트 리뷰')
const gate = await agent(
  `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n\n` +
  `스펙대로 동작하는지 판정하라.`,
  { agentType: 'conservative-reviewer', label: 'conservative-reviewer', schema: VERDICT }
)

let progressive = null
// 라이트 유형(content·copy·admin·infra)은 개선 리뷰를 생략한다.
// WARN도 "동작은 한다"이므로 개선 리뷰는 진행한다 (사용자 알림은 3단계에서).
const FULL = ['ui', 'ds', 'bug', 'engine', 'db', 'api']
if ((gate.verdict === 'PASS' || gate.verdict === 'WARN') && FULL.includes(workType)) {
  phase('개선 리뷰')
  progressive = await agent(
    `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n\n` +
    `게이트 리뷰 PASS 근거:\n${gate.reasons.join('\n')}\n\n` +
    `개선 제안·문서 갱신 필요 여부·MODULAR 승격 후보를 검토하라.`,
    { agentType: 'progressive-reviewer', label: 'progressive-reviewer' }
  )
}

let interfaceReview = null
// 어드민은 admin 유형(별도 라이트 파이프라인)이라 여기 들어오지 않는다 — ui만 대상.
// 아주 작은 변경(패딩 1줄 조정 등)까지 6개 도메인 전체를 검토하는 건 과하므로, 게이트
// 리뷰가 이미 잰 diffLineCount가 기준 미만이면 이 phase 자체를 건너뛴다(2026-09-08).
const INTERFACE_REVIEW_MIN_DIFF_LINES = 15
if ((gate.verdict === 'PASS' || gate.verdict === 'WARN') && workType === 'ui' &&
    (gate.diffLineCount ?? Infinity) >= INTERFACE_REVIEW_MIN_DIFF_LINES) {
  phase('인터페이스 리뷰')
  interfaceReview = await agent(
    `티켓 문서: ${ticketPath}\n작업 유형: ${workType}\n\n개발자 구현 요약:\n${devResult}\n\n` +
    `.claude/skills/interface-review/SKILL.md를 읽고 그 절차대로 이번 변경의 스코프(diff)를 ` +
    `해석한 뒤, .claude/skills/better-interface/SKILL.md가 지정하는 도메인 스킬 중 ` +
    `**better-writing은 제외하고** 나머지 순서(better-accessibility → better-layout → ` +
    `better-typography → better-colors → better-ui)로만 검토하라 — 라이팅 품질은 한국어 리뷰 ` +
    `단계(humanize-korean)가 별도로 담당하므로 여기서 중복 검토하지 않는다. 이번 티켓의 실제 ` +
    `git diff(review 브랜치 vs origin/staging)만 대상으로 하고, 손대지 않은 기존 코드는 다루지 ` +
    `마라. 이건 머지를 막는 게이트가 아니라 제안형 리뷰다 — PASS/FAIL 판정 없이 발견한 점과 ` +
    `제안만 나열하라.`,
    { agentType: 'general-purpose', label: 'interface-reviewer' }
  )
}

let koreanReview = null
// UX Writing 문안이 나올 가능성이 있는 유형만 대상. 추출은 별도 에이전트를 새로 띄우지 않고
// 게이트 리뷰(conservative-reviewer)가 이미 diff를 읽은 김에 VERDICT.hasKoreanCopy/koreanCopyText로
// 함께 판정한다 — humanize-korean 에이전트는 "받은 텍스트를 그대로 처리"하는 계약이라, 직접
// diff를 뒤지게 하지 않는다.
const KOREAN_COPY_TYPES = ['copy', 'ui', 'content']
if ((gate.verdict === 'PASS' || gate.verdict === 'WARN') && KOREAN_COPY_TYPES.includes(workType) &&
    gate.hasKoreanCopy && gate.koreanCopyText) {
  phase('한국어 리뷰')
  koreanReview = await agent(
    `다음은 이번 티켓에서 새로 추가·변경된 사용자 노출 한국어 문구다. 두 가지를 함께 점검하라:\n` +
    `1) 번역투·과도한 수동태·AI 특유의 상투구 같은 어색한 표현이 있는지\n` +
    `2) Service Plan/Specs/UX_WRITING_GUIDELINE.md 기준(용어 일관성, 톤앤매너, 에러 메시지 3단계 ` +
    `구조, 해요체, 표기 규칙)을 충족하는지\n` +
    `두 관점의 문제를 구분해 지적하고 자연스러운 대안을 제시하라:\n\n${gate.koreanCopyText}`,
    { agentType: 'humanize-korean:humanize-monolith', label: 'korean-writing-reviewer' }
  )
}

return { devResult, gate, progressive, interfaceReview, koreanReview }
