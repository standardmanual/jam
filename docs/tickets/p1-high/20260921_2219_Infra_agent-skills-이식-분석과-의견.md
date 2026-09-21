---
id: "20260921_2219"
category: Infra
priority: P1
status: OPEN
created: 2026-09-21
parent: "20260918_1101"
---

# [Infra] addyosmani/agent-skills를 JAM! 워크플로의 뿌리로 이식하는 안 — 분석과 의견

## 핵심 요약

- 요구사항: `addyosmani/agent-skills`(Spec→Ship 수명주기 스킬 팩)를 JAM! 워크플로의 근본 뿌리로 이식하고 싶다. 에이전트 한글 이름과 역할은 유지한다. 분석과 의견을 달라(사용자 요청, 2026-09-21). `research` 유형이라 카리나가 직접 조사했고 코드는 바꾸지 않았다.
- 결론(카리나 의견): **뿌리(누가·언제·어떤 관문)는 JAM 것을 유지하고, agent-skills는 각 단계의 방법층(어떻게)으로 이식한다.** 뿌리를 통째로 바꾸면 JAM의 전제 세 가지(사용자는 디자이너라 직접 오케스트레이션하지 않는다 · 토큰 최적화가 핵심 요구 · 사고에서 태어난 훅 규칙)와 정면충돌한다. 방법층으로는 25종 중 약 3분의 2가 바로 쓸 수 있거나 다듬어 쓸 수 있다.
- 관련 파일: `.claude/workflows/jam-work.js`, `.claude/agents/*.md`, `.claude/skills/jam-plan/SKILL.md`, `.claude/skills/jam-ship/SKILL.md`, `docs/agents/contract.json`, `docs/specs/DEV_PROCESS_GUARDRAILS.md`
- 상위 티켓: 20260918_1101(에이전트 팀 운영 정비). 함께 볼 티켓: 20260921_2207(운영 전반 점검 — 개선점 12건)

## 1. 확인한 사실

### 1.1 설치 상태

| 항목 | 확인 결과 |
|---|---|
| 지금 로드된 사본 | 데스크톱 앱이 관리한다. 위치 `~/Library/Application Support/Claude/local-agent-mode-sessions/…/rpm/plugin_01VPcWw8owSTwjBYvPQfkf26/`, 앱 매니페스트에 `marketplaceName: agent-skills`, `installedBy: user`, 서버 갱신 2026-09-17, 로컬 스냅샷 09-18 19:49 KST, **버전 0.6.9**, git 이력 없음(스냅샷) |
| CLI 등록 | `claude plugin list`에는 없다(figma·marketing·vercel만). 따라서 `claude plugin uninstall`로는 지울 수 없다 |
| 업스트림 | **0.6.10**, 마지막 커밋 09-21 04:31 KST. 스냅샷 이후 13커밋: 평가 프레임워크·검증기·훅 테스트 정비가 대부분이고, 내용 변경은 보안 스킬의 코드 패턴을 스킬 내부 참조로 분리(#579), 프런트엔드 스킬에 마감 점검 추가(#496), interview-me가 의도 확인 시 턴을 멈추게 변경(#497) 세 건 |
| CLI 설치 가능 여부 | 업스트림에 `.claude-plugin/marketplace.json`이 있어 `claude plugin marketplace add addyosmani/agent-skills` → `claude plugin install`이 가능하다. 단 앱 관리 사본이 남아 있으면 같은 이름의 스킬이 두 벌 로드된다 |

### 1.2 agent-skills 구성 (0.6.9 기준)

| 항목 | 확인 결과 |
|---|---|
| 스킬 | 25종, 합계 353,572바이트(영어). 한 스킬이 8~28KB. 구성은 Define 3 · Plan 1 · Build 7 · Verify 2 · Review 4 · Ship 6 · 메타 1 · 제약 1 |
| 페르소나 | `code-reviewer`·`security-auditor`·`test-engineer`·`web-performance-auditor` 4종(24.5KB) |
| 슬래시 커맨드 | `/spec` `/plan` `/build`(`auto` 모드) `/test` `/review` `/code-simplify` `/ship` `/constraints` `/webperf` 9종 |
| 참조 | `definition-of-done.md`(상시 완료 기준), `orchestration-patterns.md`, 보안·성능·접근성·관측·테스트 체크리스트(합계 67KB) |
| 훅 | 세션 시작마다 메타 스킬 `using-agent-skills`(10.4KB) 전문을 컨텍스트에 주입. 이 세션에서도 실제로 주입됐다. 그 밖에 문서 인용 캐시(`sdd-cache`), 단순화 보호(`simplify-ignore`) |
| 산출물 모델 | 저장소 루트의 `SPEC.md`(6개 영역) → `tasks/plan.md`·`tasks/todo.md` → 작업별 커밋 → 리뷰 → GO/NO-GO. `CONSTRAINTS.md`로 품질 기준 수치화 |
| 오케스트레이션 원칙 | "사용자(또는 슬래시 커맨드)가 오케스트레이터다. 페르소나는 페르소나를 부르지 않는다. 스킬은 페르소나 워크플로 안의 필수 경유지다." 병렬은 `/ship`의 3인 팬아웃 한 곳 |
| 관문 | 단계마다 사람이 검토. `/build auto`는 계획 승인 한 번 뒤 무정지 실행(작업마다 테스트·커밋). `/review`는 5축(정확성·가독성·구조·보안·성능)에 Critical/Required/Optional/Nit, "코드 건강을 확실히 개선하면 승인". `/ship`은 GO/NO-GO에 **롤백 계획 필수** |
| 평가 | 스킬 자체를 3단(구조·트리거 라우팅·행동)으로 검증하는 eval 프레임워크 보유 |
| 도입 가이드 | 기존 코드베이스(brownfield)는 "읽기 전용 스킬 → 변경 전 테스트 → 새 작업만 전 수명주기 → 부채 상환" 순서를 권장. "25종을 전부 매 세션에 싣지 말라"고 명시 |

### 1.3 JAM 현행과의 대응

| 단계 | agent-skills | JAM 현행 | 겹침 |
|---|---|---|---|
| DEFINE | interview-me · idea-refine · spec-driven-development(가정 목록 공개, 6영역 스펙, 능력 지도) | `/jam-plan` 혜린 1단계 문답(질문 5개 이내) → 반쪽 요약 → 2단계 기획서, PRD(`docs/specs/prd/`) | 높음. JAM에 없는 것: 가정 목록 명시, 스펙 살아 있게 유지하는 규칙 |
| PLAN | planning-and-task-breakdown(의존 그래프, 수직 슬라이스, 완료 조건 있는 작업, 체크포인트) | 혜린 작업 분해 → 카리나 티켓 생성(완료 조건 필수), 상위·하위 티켓, `plan_only` 정지(파일 5개·100줄 초과) | 중간. JAM에 없는 것: 의존 그래프·수직 슬라이스 지침 |
| BUILD | incremental-implementation · TDD · context-engineering · source-driven · doubt-driven · frontend-ui · api-design | 아현(티켓 범위 엄수, verify, 로직 변경 시 테스트, 토큰 절약), 채원① 사전 판정, MODULAR 재사용 | 중간. JAM에 없는 것: RED→GREEN 명시 사이클, 고위험 결정의 반대 심문(doubt), 안전 기본값 |
| VERIFY | browser-testing-with-devtools · debugging-and-error-recovery | `verify.sh`(77.7초), pre-push, 실렌더 규칙(가드레일 패턴 13), 민지의 직접 재현 | 중간. JAM에 없는 것: 재현→국소화→수정→방지 순서의 디버깅 절차 |
| REVIEW | code-review-and-quality(5축, 개선 제안 포함) · code-simplification · security · performance | 민지: 스펙 일치·회귀만 판정하는 게이트(12항, 불확실=FAIL, **개선 제안 금지** — 규칙 21), 채원② 제안, sideFindings→티켓 | **철학이 다르다.** agent-skills 리뷰는 개선 지향, JAM 게이트는 판정 전용 |
| SHIP | shipping-and-launch(사전 점검표, 3인 팬아웃, GO/NO-GO, 롤백 필수, 단계 배포) · git · ci-cd · deprecation · docs/ADR · observability | `/jam-ship`(staging 확인은 사용자 → main 승격 → Vercel Ready·alias 확인), 주간 배포 루틴, pre-push main 차단 | 낮음. JAM에 없는 것: 롤백 계획, 배포 전 기계 점검, 배포 후 검증. CI 워크플로 없음(`.github/workflows` 부재), 훅만 있음 |
| 제약 | constraint-driven-development(`CONSTRAINTS.md`, 수치, 기준 방어) · definition-of-done | `contract.json`(환경 주장 검사), `lint:ci --max-warnings 26`, 가드레일 15패턴, 민지 12항 | 중간. JAM은 수치가 흩어져 있고 "기준 자체를 낮추는 변경"(eslint-disable 추가·테스트 skip)을 막는 검사가 없다 |

### 1.4 JAM 쪽 전제 (결정 기록)

- 사용자는 git을 직접 다루지 않는다. "배포해줘" 한마디로 끝나야 한다(`jam-ship/SKILL.md`). 사용자는 디자이너다(메모리 `user-role-designer`).
- 토큰 비용 최적화를 핵심 요구로 둔다(02_결정사항 2026-09-17). 서브에이전트는 호출마다 CLAUDE.md 13.2KB를 받는다.
- 외부 프레임워크(LangGraph 등)는 도입하지 않는다. 같은 일을 Claude Code 워크플로로 이미 한다(02_결정사항).
- 개선 리뷰 단계는 두지 않는다(공통규칙 21, 티켓 20260918_0422). 요약본·지도·패턴 카드를 만들지 않는다(규칙 20). 단일 원천, 중복 금지(CLAUDE.md 규칙 5).
- 지금의 훅·워크트리·SHA 범위·CLOSED 차단 규칙은 사고의 결과다(team-operations §8). agent-skills에는 이에 해당하는 장치가 없다.

## 2. 판단

1. **뿌리 교체는 세 전제와 충돌한다.** agent-skills의 뿌리는 "사용자가 슬래시 커맨드를 순서대로 실행하는 오케스트레이터"다. JAM은 사용자가 오케스트레이션하지 않는다는 전제로 카리나와 워크플로 스크립트를 만들었다. 뿌리를 바꾸면 이 전제가 뒤집힌다.
2. **리뷰 철학은 하나만 골라야 한다.** 5축 개선 리뷰를 머지 관문으로 삼으면, 재작업 루프와 잡음 때문에 없앤 개선 리뷰 단계가 되살아난다. 대신 5축은 민지의 `sideFindings` 분류 체계와 아현의 제출 전 자기 점검으로 쓰면 충돌 없이 흡수된다.
3. **컨텍스트 비용이 실제 병목이다.** 아현은 지금 호출마다 CLAUDE.md 13.2KB + 정의 10.7KB를 받는다. 여기에 TDD 16.5KB와 점진 구현 9.6KB를 그대로 붙이면 고정 프롬프트가 두 배가 된다. 이식은 "스킬 첨부"가 아니라 "JAM 규칙으로 압축"이어야 한다. 브라운필드 도입 가이드도 같은 말을 한다.
4. **산출물은 이미 있다.** `SPEC.md`·`tasks/plan.md`·`CONSTRAINTS.md`를 새로 만들면 티켓·PRD·`contract.json`과 중복돼 규칙 5·20을 어긴다. 개념만 옮기고 파일은 기존 것에 합친다.
5. **JAM에 진짜 없는 것은 SHIP과 제약 방어다.** 롤백 계획, 배포 전 기계 점검, CI 기록, "기준을 낮추는 변경" 차단, 공용 DB 마이그레이션의 확장·축소(expand/contract) 절차. 여기가 이식 효과가 가장 크다. 운영 점검(티켓 20260921_2207)에서 나온 "검증 도장"과 "우회 플래그 15% 사용"도 CI 기록 하나로 같이 풀린다.
6. **eval 프레임워크는 JAM에 없는 종류의 도구다.** `/jam-*` 스킬이 의도한 요청에 라우팅되는지, 민지가 불확실할 때 FAIL을 내는지를 기계로 확인할 수 있다.

## 3. 이식 지도 (25종 + 페르소나)

| 처리 | 대상 | 어디로 | 비고 |
|---|---|---|---|
| **채택** | definition-of-done | 민지 점검표의 근거 문서, 티켓 완료 조건과 구분 | 완료 조건은 "이것을 만들었나", DoD는 "끝낼 기준을 지켰나". 지금은 후자가 암묵적 |
| 채택 | test-driven-development(Prove-It) · debugging-and-error-recovery | 아현 `bug` 유형 절차 | 재현 테스트 → 수정 → 방지. 아현 정의는 이미 "실패 테스트 → 수정"이라 압축본 한 절이면 된다 |
| 채택 | shipping-and-launch(롤백 계획·사전 점검표·배포 후 검증) | `/jam-ship` 3~5단계 | Vercel 이전 배포 승격 + DB 마이그레이션 되돌림 절차를 JAM 값으로 채운다 |
| 채택 | deprecation-and-migration(expand/contract) | `db` 유형 규칙 | staging·프로덕션 공용 DB라 JAM에서 가장 위험한 지점 |
| 채택 | constraint-driven-development의 "기준 방어" | pre-push 검사 | 새 `eslint-disable`·`@ts-ignore`·`.skip` 테스트·`max-warnings` 상향을 차단. 수치는 `contract.json`에 |
| 채택 | ci-cd-and-automation | GitHub Actions 최소 1개: staging push마다 `verify.sh` 실행·기록 | JAM에 CI가 없다. 이 기록이 민지의 "검증 도장"이 되고 우회 플래그 사용도 드러난다 |
| 채택 | doubt-driven-development | `db`·`engine` 유형과 되돌릴 수 없는 작업에만 | 카리나가 실행 전 반대 심문 1회. 매 티켓에 걸면 비용만 는다 |
| 채택 | evals(구조·트리거 2단) | `/jam-*` 스킬 설명과 유형 판정 | 행동 eval은 토큰이 들어 선택 |
| **다듬어 채택** | spec-driven-development | 혜린 2단계 기획서·티켓 템플릿 | "가정 목록"을 문답 앞에 추가. 6영역 중 Commands·Boundaries는 JAM에 이미 고정돼 있어 제외. 능력 지도 = 상위·하위 티켓 |
| 다듬어 채택 | planning-and-task-breakdown | 혜린 작업 분해 양식 | 의존 그래프·수직 슬라이스·체크포인트 세 항목만 |
| 다듬어 채택 | code-review-and-quality | 민지 `sideFindings` 분류(5축) · 아현 제출 전 자기 점검 | 판정(PASS/WARN/FAIL)은 그대로. "제안은 리뷰에 넣지 않는다" 유지 |
| 다듬어 채택 | incremental-implementation(단순성·범위·안전 기본값) · git-workflow(원자 커밋·변경 요약) | 아현 정의 | 기능 플래그·semver·changelog는 제외(Vercel 연속 배포) |
| 다듬어 채택 | security-and-hardening · api-and-interface-design · frontend-ui-engineering(접근성) · observability | 유형별 참조 체크리스트(`api`·`admin`·`ui`·`engine`) | 전문을 싣지 않고 JAM 체크리스트에 항목만 옮긴다 |
| 다듬어 채택 | security-auditor · test-engineer 페르소나 | `/jam-ship` 팬아웃(staging..main diff 대상) | 주간 배포 주기라 비용 감당 가능. `code-reviewer`는 민지와 겹쳐 쓰지 않는다 |
| 다듬어 채택 | context-engineering | 카리나: CLAUDE.md 축소(20260921_2207 #6) | 이미 같은 결론 |
| 다듬어 채택 | interview-me · idea-refine | 혜린 1단계 | "추천 방향 함께 제시" 피드백(메모리)과 합친다 |
| **제외** | using-agent-skills 세션 주입 훅 | — | 라우팅은 `/jam-work` 0.2절 유형 판정이 이미 한다. 매 세션 10.4KB 절약 |
| 제외 | `/build auto`(단일 승인 무정지) | — | 티켓 단위 승인이 JAM의 안전장치다. 상위 티켓 묶음 승인은 별건으로 검토 |
| 제외 | `SPEC.md`·`tasks/*.md`·`CONSTRAINTS.md` 파일 | — | 중복 산출물. 개념만 기존 문서로 |
| 제외 | 사용자 주도 슬래시 파이프라인 | — | 전제 충돌 |
| 제외 | code-simplification 자동 적용 | — | 아현의 "티켓 밖 리팩터 금지"와 충돌. diff 안에서만 |
| 보류 | performance-optimization · web-performance-auditor · source-driven(sdd-cache) | 요청 시 | 성능 요구가 생기면 |

## 4. 제안하는 순서 (방법층 이식)

| 단계 | 내용 | 산출 | 경로 |
|---|---|---|---|
| 1 | SHIP 보강: `/jam-ship`에 롤백 계획·사전 점검·배포 후 검증, `db` 유형에 expand/contract | 스킬·정의 수정 | infra |
| 2 | 기준 방어 + CI 기록: pre-push "기준 낮춤" 차단, GitHub Actions로 `verify.sh` 기록 → 민지 검증 도장 | 훅·워크플로 파일 | infra |
| 3 | REVIEW/BUILD 압축본: DoD 문서, 민지 5축 `sideFindings`, 아현 Prove-It·디버깅·자기 점검·가정 목록 | 정의·참조 수정 | infra |
| 4 | DEFINE/PLAN 양식: 혜린 문답에 가정 목록, 작업 분해에 의존 그래프·수직 슬라이스 | 스킬 수정 | docs |
| 5 | 팬아웃·eval: `/jam-ship` 보안·테스트 페르소나, `/jam-*` 트리거 eval | 워크플로·스크립트 | infra |

1~2는 JAM에 없는 것을 채우므로 효과가 즉시 보인다. 3~4는 이미 있는 것을 정교하게 만든다. 5는 비용이 들어 마지막이다. 각 단계는 `/jam-work` 티켓 하나씩이다.

## 5. 재설치 요청 처리

앱이 관리하는 사본은 터미널에서 정당하게 지울 수 없다(CLI 등록이 없고, 앱 내부 폴더를 손으로 지우면 매니페스트에서 다시 만들어지거나 상태가 어긋난다). 정상 경로는 두 가지다.

- 앱의 플러그인 설정에서 `agent-skills`를 제거·재설치하거나 업데이트한다(사용자).
- 앱 사본을 제거한 뒤 카리나가 CLI로 설치한다: `claude plugin marketplace add addyosmani/agent-skills` → `claude plugin install agent-skills@agent-skills`. 이러면 git 이력이 있는 사본이 되어 이후 갱신·버전 고정이 쉽다.

두 버전의 차이(0.6.9→0.6.10)는 위 분석 결론을 바꾸지 않는다.

## 6. 카리나가 단계를 판정해 실행하는 구조와 역할 변화 (2026-09-21 사용자 질문에 대한 답)

### 6.1 "카리나를 오케스트레이터로 spec·plan·build를 판단해서 실행하게 하면 안 되나"

된다. 그리고 그것이 §2의 첫 번째 충돌(사용자가 슬래시 커맨드를 순서대로 실행하는 뿌리)을 푸는 방법이다. agent-skills의 여섯 단계를 **카리나의 판정 순서**로 삼고, 각 단계의 실행은 지금처럼 담당 에이전트에게 넘긴다. 이렇게 하면 뿌리는 "여섯 단계 수명주기"가 되고, 사용자는 지금과 같은 승인 지점(기획·계획 승인 → 머지 승인 → 배포 승인)만 맡는다.

카리나의 판정은 두 겹이 된다. 지금의 유형 판정(`/jam-work` 0.2절) 앞에 **단계 판정**이 붙는다.

| 단계 | 진입 조건 (카리나가 확인) | 실행 주체 | 사용자 승인 |
|---|---|---|---|
| DEFINE | 무엇을 만들지 정해지지 않았거나 가정이 필요한 요청 | 혜린 문답 | 반쪽 요약 확인 |
| PLAN | 정의가 승인됐고 티켓이 둘 이상이거나 순서가 불명확 | 혜린 분해 → 카리나 티켓 생성 | 기획서·분해안 승인 |
| BUILD | 완료 조건이 채워진 티켓 존재. `ui`·`ds`면 채원 판정 존재 | 아현 (+채원①) | 없음 (needs_approval 항목만) |
| VERIFY | 아현 제출물 + 검사 통과 기록(CI 도장) | 훅·검사 스크립트, 아현 자기 검증 | 없음 |
| REVIEW | 검토 범위(baseSha..commitSha) 확정 | 민지 ∥ 채원② | 머지 승인 |
| SHIP | staging 검증 완료 + 롤백 계획 작성 + 팬아웃 GO | 카리나 (+보안·테스트 페르소나) | 배포 승인 |

지금도 절반은 이렇게 돈다(`/jam-plan` → 티켓 → `/jam-work` → `/jam-ship`). 바뀌는 것은 ① 단계 진입 조건을 명시하고 기계가 확인할 수 있는 것은 `contract.json`·훅으로 옮기는 것, ② 각 단계의 방법을 agent-skills 압축본으로 채우는 것, ③ 묶음 실행 모드다.

**묶음 실행 모드(`/build auto`에 해당).** 상위 티켓의 분해안을 사용자가 한 번 승인하면 카리나가 하위 티켓을 순서대로 실행한다. 정지 조건은 게이트 FAIL, `[중단]` 알림, `db`·`engine` 유형 진입, 채원 `needs_approval`, 되돌릴 수 없는 작업이다. 티켓마다 게이트 리뷰는 그대로 돈다. 비용은 줄지 않고 사용자의 대기 횟수만 준다. 기본은 끄고 상위 티켓 단위로 켜는 것을 권한다.

### 6.2 이식 뒤 에이전트별 역할 변화

| 에이전트 | 단계 | 지금 | 이식 뒤 새로 맡는 것 | 그대로인 것 |
|---|---|---|---|---|
| 카리나 | 전 단계 조율 | 유형 판정, 티켓 생성·종료, 워크플로 호출, 승인 후 처리, 배포 | 단계 판정과 진입 조건 확인 · 모호한 요청은 "가정 목록"을 보여 준 뒤 진행 · `db`·`engine`·되돌릴 수 없는 작업 전 반대 심문 1회 · 배포 시 롤백 계획 작성과 팬아웃 결과 병합(GO/NO-GO) · 묶음 실행 모드 운영 · DoD(상시 완료 기준) 문서의 단일 원천 관리 | 코드 구현은 경미 수정만 · 개선 여부를 직접 판단하지 않음 · 승인 없는 main 배포 금지 |
| 혜린 | DEFINE · PLAN | 질문 5개 이내 문답, 반쪽 요약, 기획서, 작업 분해, JAM 리스크 점검 | 한 번에 한 질문과 추천 방향 동반 · 문답 앞에 가정 목록 · 기획서에 성공 기준·경계·열린 질문 고정 · 여러 능력이 묶인 요청은 능력 지도(=상위·하위 티켓) · 분해에 의존 순서·세로 조각·체크포인트 | 문서 파일은 만들지 않음 · 경제 수치는 시뮬레이터 실측 |
| 아현 | BUILD · VERIFY | 티켓 범위 엄수, verify 통과, 로직 변경 시 테스트, 정지 조건 | 버그는 재현 테스트 → 수정 → 회귀 확인 순서 · 디버깅은 재현→원인 국소화→수정→재발 방지(가드레일 패턴 제안) · 세로 조각 단위 원자 커밋과 변경 요약 · 제출 전 자기 점검(DoD 정확성·품질 항목) · 해석이 들어간 가정을 `summary`에 명시 · `db`는 확장→전환→축소 순서의 마이그레이션과 되돌림 SQL | 티켓 밖 리팩터 금지 · DB 실행 금지 · staging·main push 금지(훅으로 강화) · CLOSED 금지 |
| 민지 | REVIEW | 12항 점검표, PASS/WARN/FAIL, 불확실=FAIL, 개선 제안 금지 | 판정 기준을 완료 조건 + DoD 두 층으로 명시 · 테스트부터 읽는 순서 · sideFindings를 5축(정확성·가독성·구조·보안·성능)으로 분류, Critical은 범위 밖이어도 즉시 보고 · 검사 재실행 대신 CI 도장 확인 · 유형별 보안 항목(api·db·admin) 보강 | 개선 제안 금지 · 코드 수정 금지 · 배포 관문에는 관여하지 않음 |
| 채원 | BUILD 앞 · REVIEW | ① 사전 판정, ② 사후 리뷰, ③ 동기화, ④ 크래프트 | ①의 상태 목록과 ②의 점검표에 접근성·마감 항목(키보드·스크린리더·대비·터치 영역·로딩/빈/오류 상태) 흡수 | 판정·구조 그대로. 변화가 가장 작다 |
| 윈터 · 윤진 | DEFINE 입력 | 세계관 검수·창작, 캠페인·홈피드 초안 | 없음. 가정 목록에 세계관 가정이 들어가면 윈터 검수를 붙인다 | 전부 |
| 카즈하 | SHIP 뒤 · 환류 | 계획 대비 실행 점검, 위험 신호, 주간 브리핑 | 배포 후 검증 항목을 브리핑에 고정(오류율·동기화 실패·발급량 이상) · 실행 지표 원장 집계를 실제로 수행 · 롤백 트리거 조건 감시(실행은 카리나·사용자) · 기준 방어 위반·우회 플래그 사용 집계 | 읽기 전용 |
| 하니 | 횡단 | 문서 구조·템플릿·건강 점검 | DoD·기준 수치의 단일 원천 위치를 정하고 월간 드리프트 점검에 포함 · 스킬 설명문의 라우팅 품질 점검(eval 도입 시) | ADR 같은 새 문서 유형은 만들지 않음(티켓의 "주요 의사결정" 절이 대신) |
| 보안·테스트 페르소나(신규) | SHIP | 없음 | `/jam-ship`에서 staging..main 차이에 대해 병렬로 점검 보고서만 반환. 한글 이름 부여 여부는 배포 관문 밖에서도 쓰게 될 때 결정 | — |

에이전트 수는 늘지 않는다(배포 관문 페르소나는 플러그인 것을 호출 프롬프트로 쓴다). 사용자 승인 지점도 늘지 않는다. 늘어나는 것은 카리나의 판정 단계 하나와, 아현·민지·혜린 정의에 들어가는 압축본 절 몇 개다.

## 완료 조건

- 사실·판단·이식 지도·순서가 이 티켓에 기록되어 있다(완료).
- 사용자가 방향(방법층 이식 / 뿌리 교체)을 정하고, 그 결정과 사유가 완료 기록에 남는다.
- 결정에 따라 §4의 단계별 티켓이 만들어지거나, 만들지 않기로 한 사유가 남는다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ] 

### 배포 정보
- 배포일: 
- 환경: staging (빌드 없음)
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
