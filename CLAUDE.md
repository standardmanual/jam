# JAM! 프로젝트 Claude 운영 규칙

## 절대 규칙

### 1. 항상 한국어로 출력할 것
대화 응답, 커밋 메시지, 진행 상황 설명, 빌드/배포 요약, 코드 주석 등 사용자에게 보여지는
모든 출력물에 예외 없이 적용한다 (예외: 코드 식별자·라이브러리명·API명 등 고유명사는 원문 유지).
사용자에게 보여지는 시간은 항상 한국 표준시(KST)다. 원본이 UTC이면 KST로 변환해서 전달한다.

### 2. 서비스 변경 시 문서 체계 갱신
기능 추가·로직 변경·컨텐츠 변경이 발생하면 아래 문서 체계에 따라 해당 카테고리 문서를 갱신한다.
**작성 규칙·파일명 규칙·필수 항목은 `/jam-docs` 스킬에 있다.**

### 3. 작업 완료 후 staging에 commit + push
작업이 끝나면 별도 요청이 없어도 `git add` → `git commit`(한국어 메시지) → `git push origin staging`.
`jam-doc/`도 같은 저장소 안에 있으므로 코드와 문서를 함께 바꿔도 커밋 한 번·push 한 번으로 끝난다.
**main 머지는 사용자의 명시적 승인이 있을 때만 한다** (배포는 `/jam-ship`, `.githooks/pre-push`가
승인 경로 밖의 main push를 차단).

### 4. 로컬과 git을 항상 동일하게 유지
- 작업 후 `git status`로 untracked·modified 파일이 없도록 처리
- `.gitignore`에 새 항목 추가 금지 (예외: 토큰/시크릿 파일)
- hooks 경로는 `.githooks/`다. `core.hooksPath`가 어긋나면 세션 시작 시 `scripts/ensure-hooks-path.sh`가
  맞추고 `scripts/verify.sh`의 계약 검사가 잡아낸다 (새 클론 절차는 `docs/agents/orchestrator.md` §5)
- **작업 폴더의 절대경로는 PC마다 다르다.** 현재 저장소가 열려 있는 경로를 기준으로 삼는다
  (PC별 경로·아이클라우드 주의사항은 `docs/agents/orchestrator.md`)

### 5. 환경을 서술할 때는 확인한 결과만 적는다
문서가 **사실**("무엇이 그런가")을 적을 때는 명령으로 확인한 결과만 쓴다. 사실과 **판단**("왜
그런가")을 한 문장에 섞지 않는다 — 사실이 바뀌었을 때 어느 쪽이 낡았는지 구분할 수 없기 때문이다.

- 같은 사실을 여러 문서에 적지 않는다. **중복은 드리프트의 필요조건이다.** 단일 원천을 정하고
  나머지는 참조만 한다
- 새로 적는 환경 주장은 `docs/agents/contract.json`에 검사 줄을 함께 추가한다
  (`scripts/check-contract.mjs`가 커밋마다 대조)
- 자동 생성 구간(`<!-- BEGIN generated: ... -->`)은 손으로 고치지 않는다. 근거 설정을 고친 뒤
  `node scripts/gen-team-doc.mjs`를 실행한다

이 규칙이 생긴 사고는 `docs/agents/team-operations.md` §8에 있다.

### 6. DB 변경은 실행 권한이 있는 주체만 실행한다
DB 스키마/데이터 변경은 **메인 세션(오케스트레이터)만** 직접 실행한다. 서브에이전트는 SQL
마이그레이션 파일 작성까지만 하고, 실행은 사용자 승인 후 메인 세션이 처리한다.

- SQL 파일은 직접 실행하더라도 `jam-web/supabase/migrations/`에 반드시 남긴다
- Supabase는 staging·프로덕션 **공용 단일 DB**다. DB 변경은 즉시 프로덕션에 반영된다
- 확장→전환→축소 분할과 되돌림 SQL은 `.claude/agents/jam-developer.md` Hard rules 3, 실행 절차는
  `docs/agents/orchestrator.md` §4

---

## 팀 구성

에이전트 정의는 `.claude/agents/`에 **영어로** 있고, 출력은 전부 한국어다.
평소 개발 흐름에 관여하는 건 **카리나·아현·민지·채원 넷**이고, 나머지는 상황이 있을 때만 부른다.

| 이름 | 역할 | 정의 |
|---|---|---|
| 카리나 | 오케스트레이터 (메인 대화) | `docs/agents/orchestrator.md` |
| 아현 | 개발 | `jam-developer` |
| 민지 | 판정 리뷰 (게이트) | `jam-reviewer` |
| 채원 | 디자인 | `jam-designer` |
| 혜린 | PM (기획·타당성·리스크) | `jam-pm` |
| 윈터 | 세계관 | `jam-tribe` |
| 윤진 | 마케팅 | `jam-marketer` |
| 카즈하 | 운영·리스크 + Workflow 개선점 발견 | `jam-ops` |
| 하니 | 문서 체계 | `jam-guide` |

- 권한·워크트리·접근 범위·예약 루틴·사고 이력은 `docs/agents/team-operations.md`가 단일 지도다.
  그중 하나라도 바뀌면 같은 작업 안에서 함께 고친다
- 모델은 각 정의의 `model` 키로 고정한다 (모드별 모델은 호출부가 덮어쓴다)
- 이상 신호는 **참고 / 주의 / 중단**, 확신도는 **높음 / 보통 / 낮음**으로 통일한다
- 개선 리뷰 단계는 없다. 위험을 줄이는 개선점은 민지의 범위 밖 발견물로 처리한다

---

## 작업 진행 방식

서비스 코드·컨텐츠·문서 변경 요청은 **`/jam-work`로 처리한다.** 작업 유형은 요청 내용으로 자동
판정해 먼저 보고한다. 유형별 파이프라인은 `.claude/skills/jam-work/SKILL.md` 분기표 참조.

| 스킬 | 용도 |
|---|---|
| `/jam-work` | 개발·개선·수정 전반의 표준 워크플로우 |
| `/jam-plan` | 기획 — 아이디어 구체화·타당성·리스크·티켓 분해안 (혜린) |
| `/jam-story` | 세계관 검수·창작, 캠페인·홈피드·시즌 운영 (윈터·윤진) |
| `/jam-docs` | 문서 체계 ①~⑤ 작성·갱신 절차 |
| `/jam-design` | MODULAR 디자인 시스템·Storybook 탐색 및 재사용 판단 |
| `/jam-ds` | 서비스 UI ↔ MODULAR ↔ Storybook ↔ claude.ai/design 정합성 진단·동기화 |
| `/jam-img` | 배지 이미지 제작 파이프라인 (Recraft 생성→로고합성→배경제거→DB반영, 단계별 사용자 확인) |
| `/jam-ship` | staging 검증 → 프로덕션 배포 |
| `/jam-sync` | 로컬 ↔ GitHub 동기화 (PC 간 이어서 작업할 때, 작업 마무리할 때) |

함께 읽는 문서: `docs/agents/team-operations.md`(운영 지도), `docs/agents/orchestrator.md`(메인
세션 전용 규칙), `docs/agents/issue-tracker.md`(티켓 체계 — 이슈는 GitHub Issues가 아니라
`docs/tickets/`로 추적), `docs/agents/domain.md`(저장소 구조도. `CONTEXT.md` 대신 아래 문서 체계를 쓴다).

---

## 문서 체계 개요

저장소 하나(`standardmanual/jam`) 안에 배포되는 코드(`jam-web/`)·스펙·작업 이력(`docs/`)이 있고,
기획·마케팅·운영 자료와 제작 자산은 `jam-doc/`에 있다. **경로는 항상 작업 폴더(JAM!) 기준으로
적는다** (`docs/specs/prd/01_PRD.md`, `jam-doc/planning/content/TRIBES.md`). 폴더명은 영문 소문자다.
개선사항이 여러 카테고리에 걸치면 각 문서를 모두 갱신한다.

| # | 카테고리 | 내용 | 위치 |
|---|---|---|---|
| ① | PRD | 기능·스펙·로직 정의 | `docs/specs/prd/` |
| ② | 티켓 | 실행 계획·작업 이력 | `docs/tickets/` |
| ③ | 컨텐츠 | 액티비티배지·아이템북·아이템배지·트라이브·POI | `jam-doc/planning/content/` |
| ④ | 배지 드랍 로직 | 배지 발급·드랍 엔진 판정 로직 | `docs/specs/badge-engine/` |
| ⑤ | 서비스 플랜 | 비전·장기 전략, 현재/향후 구분 | `jam-doc/planning/business-plan/` |

> 횡단 참조 문서(`UX_WRITING_GUIDELINE`·`SERVICE_OPERATIONS`·`DEV_PROCESS_GUARDRAILS`·
> `SLOP_DICTIONARY`·`PRIVACY_POLICY`·`DOCUMENT_SCHEMA`)는 `docs/specs/` 루트, 마케팅 자료는
> `jam-doc/marketing/`. 티켓을 뺀 모든 문서는 frontmatter에 `type`·`description`이 필요하다
> (규칙 `docs/specs/DOCUMENT_SCHEMA.md`, 절차 `/jam-docs`).

### 폴더 = 수명주기

폴더가 곧 **"이 문서를 어떻게 쓰나"** 를 지시한다. 새 문서를 만들 때 어느 폴더인지부터 정한다.

| 폴더 | 수명주기 | 쓰기 방식 |
|---|---|---|
| `docs/specs/`, `jam-doc/planning/`, `jam-doc/marketing/` | 현재 상태 | **덮어쓰기.** 변경 이력을 본문에 누적하지 않는다 |
| `docs/tickets/` | 작업 이력 | **신규 생성.** 완료 후에도 지식베이스로 남는다 |
| `jam-doc/operations/reports/` | 시점별 기록 | **신규 생성, 덮어쓰지 않음.** 에이전트는 주간 최근 4주·월간 최근 3개월만 읽는다 |
| `jam-doc/archive/`, `docs/agents/workflow/` | 폐기·동결된 기록 | **읽기 전용.** 추가·수정 금지. 현재 상태의 근거로 쓰지 않는다 |
| `jam-doc/assets/` | 생성 산출물 | 문서가 아니므로 문서 검색 대상에서 제외 |

**버전 사본(`v3.1`, `_20260827` 등)을 만들지 않는다.** 이력은 git이 보관한다.
`.githooks/pre-commit`이 이 규칙들을 기계적으로 막는다. 정당한 예외는 `JAM_SKIP_DOCLINT=1`로
우회하되 사유를 커밋 메시지에 남긴다.

### 새 세션 시작 시 읽기 순서

서비스 전체를 파악해야 할 때 **코드부터 탐색하지 않는다.** 아래 문서에 로직·정책·데이터 모델이
이미 정리되어 있다:

1. `docs/tickets/`의 관련 최신 티켓 (유사 작업·의사결정 확인)
2. `docs/specs/INDEX.md` (전체 문서 목록. 자동 생성이라 손으로 고치지 않는다)
3. `docs/specs/prd/01_PRD.md` (필요 시 `02_DATA_MODEL.md`, `docs/specs/prd/{주제}/`)
4. `jam-doc/planning/content/` (배지·아이템·트라이브·POI)
5. `docs/specs/badge-engine/BADGE_ENGINE_UNIFIED.md` (배지·드랍 로직)
6. 위에서 찾지 못한 경우에만 코드(`jam-web/src/`) 탐색
