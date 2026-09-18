# JAM! 프로젝트 Claude 운영 규칙

## 절대 규칙

### 1. 항상 한국어로 출력할 것
대화 응답, 커밋 메시지, 진행 상황 설명, 빌드/배포 요약, 코드 주석 등 사용자에게 보여지는
모든 출력물에 예외 없이 적용한다. (예외: 코드 식별자·라이브러리명·API명 등 고유명사는 원문 유지)

### 2. 서비스 변경 시 문서 체계 갱신
기능 추가·로직 변경·컨텐츠 변경이 발생하면 아래 문서 체계에 따라 해당 카테고리 문서를 갱신한다.
**작성 규칙·파일명 규칙·필수 항목은 `/jam-docs` 스킬에 있다.**

### 3. 작업 완료 후 staging에 commit + push
작업이 끝나면 별도 요청이 없어도 `git add` → `git commit`(한국어 메시지) → `git push origin staging`.

**main 브랜치로의 머지는 사용자의 명시적 승인이 있을 때만 한다.**
프로덕션 배포는 `/jam-ship`으로 처리한다 (staging 검증 → main 승격 → Vercel 확인).
`.githooks/pre-push`가 승인 경로 밖의 main push를 차단한다.

### 4. 로컬과 git을 항상 동일하게 유지
- 작업 후 `git status`로 untracked·modified 파일이 없도록 처리
- `.gitignore`에 새 항목 추가 금지 (보안 예외: 토큰/시크릿 파일은 허용)
- 이 저장소는 `.githooks/`를 hooks 경로로 쓴다. 새로 클론한 환경에서는 최초 1회
  `git config core.hooksPath .githooks` 실행 필요
- **작업 폴더의 절대경로는 PC마다 다르다.** 특정 절대경로를 전제하지 않고, 현재 저장소가 열려
  있는 경로를 그대로 기준으로 삼는다 (PC별 경로·아이클라우드 주의사항은
  `docs/agents/orchestrator.md`)

### 5. DB 변경은 실행 권한이 있는 주체만 실행한다
DB 스키마/데이터 변경은 **메인 세션(오케스트레이터)만** 직접 실행한다. 서브에이전트는 SQL
마이그레이션 파일 작성까지만 하고, 실행은 사용자 승인 후 메인 세션이 처리한다.

- **SQL 파일은 직접 실행하더라도 반드시 남긴다**: `jam-web/supabase/migrations/0XX_설명.sql`
  (스키마 변경) 또는 `seed_*.sql`(1회성 데이터)로 저장해 커밋
- Supabase는 staging·프로덕션 **공용 단일 DB**다. DB 변경은 즉시 프로덕션에 반영된다
- 실행 절차·권한·위험도 인식은 `docs/agents/orchestrator.md` 참고

---

## 팀 구성

에이전트 정의는 `.claude/agents/`에 **영어로** 있고, 출력은 전부 한국어다.
평소 개발 흐름에 관여하는 건 **카리나·아현·민지·채원 넷**이고, 나머지는 상황이 있을 때만 부른다.

| 이름 | 역할 | 정의 |
|---|---|---|
| 카리나 | 오케스트레이터 (메인 대화) | `docs/agents/orchestrator.md` |
| 아현 | 개발 | `jam-developer` |
| 민지 | 판정 리뷰 (게이트) | `conservative-reviewer` |
| 채원 | 디자인 | `jam-designer` |
| 혜린 | PM (기획·타당성·리스크) | `jam-pm` |
| 윈터 | 세계관 | `jam-tribe` |
| 윤진 | 마케팅 | `jam-marketer` |
| 카즈하 | 운영·리스크 + Workflow 개선점 발견 | `jam-ops` |
| 하니 | 문서 체계 | `jam-guide` |

- 모델은 각 정의의 `model` 키로 고정한다. 모드별로 다른 모델을 쓰는 에이전트는 호출부가
  `model` 옵션으로 덮어쓴다
- `CLAUDE.md`는 서브에이전트 호출마다 자동으로 포함된다 — 이를 선택적으로 빼는 공식 기능은
  Claude Code에 없다(2026-09-18 확인). 아현·민지 외 나머지는 코드 규칙이 필요 없지만, 기술적
  제약으로 실제로는 모두가 이 파일을 받는다
- 이상 신호는 **참고 / 주의 / 중단**, 확신도는 **높음 / 보통 / 낮음**으로 통일한다
- 개선 리뷰 단계는 두지 않는다. 위험을 줄이는 개선점은 민지의 범위 밖 발견물로 처리한다

---

## 작업 진행 방식

서비스 코드·컨텐츠·문서 변경 요청은 **`/jam-work`로 처리한다** (티켓 검토 → 채원 사전 판정 →
구현 → 게이트 리뷰 → 채원 사후 리뷰 → 승인 후 머지·문서 갱신). 작업 유형은 요청 내용으로 자동
판정해 먼저 보고한다. 유형별 파이프라인 차이는 `.claude/skills/jam-work/SKILL.md` 분기표 참조.

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

---

## Agent skills

### Orchestrator

메인 세션 전용 운영 규칙(PC별 작업 경로·아이클라우드 금지·동기화·DB 실행 권한·티켓 생성 권한)은
`docs/agents/orchestrator.md`에 있다.

### Issue tracker

이슈는 GitHub Issues가 아니라 `Service Plan/Tickets/`의 마크다운 티켓으로 추적한다. 자세한
내용은 `docs/agents/issue-tracker.md` 참고.

### Domain docs

단일 컨텍스트. `CONTEXT.md`/ADR 대신 `Service Plan/Specs/`의 PRD·컨텐츠·배지엔진·서비스플랜
문서 체계를 사용한다. 자세한 내용은 `docs/agents/domain.md` 참고.

---

## 문서 체계 개요

`Service Plan/`은 5가지 카테고리로 구성된다. 개선사항이 어느 카테고리에 해당하는지 먼저 판단하고,
여러 카테고리에 걸치면 각 문서를 모두 갱신한다.

| # | 카테고리 | 내용 | 위치 |
|---|---|---|---|
| ① | PRD | 기능·스펙·로직 정의 | `Service Plan/Specs/PRD/` |
| ② | 티켓 | 실행 계획·작업 이력 | `Service Plan/Tickets/` |
| ③ | 컨텐츠 | 액티비티배지·아이템북·아이템배지·트라이브·POI | `Service Plan/Specs/Content/` |
| ④ | 배지 드랍 로직 | 배지 발급·드랍 엔진 판정 로직 | `Service Plan/Specs/BadgeEngine/` |
| ⑤ | 서비스 플랜 | 비전·장기 전략, 현재/향후 구분 | `Service Plan/Business/서비스플랜/` |

> `Specs/UX_WRITING_GUIDELINE.md`·`Specs/SERVICE_OPERATIONS.md`·`Specs/DEV_PROCESS_GUARDRAILS.md`처럼
> 4개 카테고리에 속하지 않는 횡단 참조 문서는 `Specs/` 루트에 유지한다.

### 폴더 = 수명주기 (2026-08-27 재편)

폴더가 곧 **"이 문서를 어떻게 쓰나"** 를 지시한다. 새 문서를 만들 때 어느 폴더인지부터 정한다.

| 폴더 | 수명주기 | 쓰기 방식 |
|---|---|---|
| `Specs/` | 현재 상태 | **덮어쓰기.** 항상 지금 사실만 담는다. 변경 이력을 본문에 누적하지 않는다 |
| `Tickets/` | 작업 이력 | **신규 생성.** 완료 후에도 지식베이스로 남아 계속 검색된다 |
| `Reports/` | 시점별 기록 | **신규 생성, 쌓기만 하고 덮어쓰지 않음.** 주간·월간 리포트. 에이전트는 주간 최근 4주·월간 최근 3개월만 읽는다 |
| `Business/` | 비전·전략 | 덮어쓰기. 버전 사본을 만들지 않는다 |
| `Archive/` | 폐기된 기록 | **읽기 전용.** 신규 파일 추가 금지, 기존 파일 수정 금지 |
| `Assets/` | 생성 산출물 | 파이프라인이 만든 결과물. 문서가 아니므로 문서 검색 대상에서 제외 |

- **버전 사본(`v3.1`, `_20260827` 등)을 만들지 않는다.** 이력은 git이 보관한다.
- **`Archive/`의 문서를 근거로 현재 상태를 판단하지 않는다.** 낡은 정보다.

이 규칙들은 `.githooks/pre-commit`이 기계적으로 막는다 — 티켓 파일명 형식·frontmatter status
누락·`Archive/` 신규 파일·서비스플랜 버전 사본. 정당한 예외는 `JAM_SKIP_DOCLINT=1`로 우회하되
사유를 커밋 메시지에 남긴다.

### 새 세션 시작 시 읽기 순서

서비스 전체를 파악해야 할 때 **코드부터 탐색하지 않는다.** 전체 코드 탐색은 토큰 낭비가 크고,
아래 문서에 서비스 로직·정책·데이터 모델이 이미 정리되어 있다:

1. `Tickets/`의 관련 최신 티켓 (유사 작업·의사결정 확인)
2. `Specs/PRD/01_PRD.md` (필요 시 `02_DATA_MODEL.md`, 주제별 폴더 `PRD/{주제}/`)
3. `Specs/Content/` (배지·아이템·트라이브·POI 관련 시)
4. `Specs/BadgeEngine/BADGE_ENGINE_UNIFIED.md` (배지·드랍 로직 관련 시)
5. 위에서 찾지 못한 경우에만 코드(`jam-web/src/`) 탐색

---
