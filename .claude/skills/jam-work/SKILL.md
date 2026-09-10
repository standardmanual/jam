---
name: jam-work
description: JAM! 프로젝트의 표준 개발 워크플로우. 버그 수정·기능 개선·디자인 시스템·컨텐츠·DB·문서 등 모든 작업 요청을 유형별로 라우팅해 티켓 검토 → 구현 → 게이트 리뷰 → 개선 리뷰 → 승인 후 머지·문서 갱신까지 처리한다. "/jam-work", "이거 고쳐줘", "이 기능 추가해줘", "리뷰 파이프라인으로 처리해줘" 같은 요청에 사용.
---

# /jam-work — JAM! 표준 작업 워크플로우

> **크루 콜사인**: 베이스캠프(오케스트레이터=나) · 레인저(PM/SOT, 나가 겸함) ·
> 트레일메이커(jam-developer) · 체크포인트(conservative-reviewer) · 스카우트(progressive-reviewer)

## 0. 유형 판정 — 레인저 모자를 쓴다 (위임하지 않음)

### 0.1 경미 수정 여부 먼저 확인 — 해당하면 아래 단계를 전부 건너뛴다

다음 두 조건을 **모두** 만족하면 Workflow 호출(1~4단계 전체) 없이 오케스트레이터가 직접
처리한다(2026-09-10, 기존 "로직 무변경" 제한을 없애고 diff 규모 기준으로 확대했다):

1. **규모**: 변경 파일이 1~2개, diff가 대략 10줄 이내로 예상된다.
2. **명백성**: 원인과 수정 내용을 조사 없이 바로 설명할 수 있다 (예: 오탈자, 상수 하나 조정,
   조건 연산자 하나 수정처럼 원인-결과가 1:1로 명확한 버그 수정). 원인이 불확실하거나 영향
   범위가 여러 파일·여러 기능에 걸치면 해당하지 않는다.

확신이 없으면 안전하게 아래 유형 판정으로 넘어간다 — conservative-reviewer가 판정을 확신하지
못할 때 FAIL 쪽으로 기우는 것과 같은 원칙이다.

해당하면:
- 오케스트레이터가 직접 구현한다 (jam-developer 위임 없음, review 브랜치도 없음 — 리뷰어가
  없으므로 머지할 대상 자체가 없다).
- 변경 파일에 한해 `npx eslint <파일>`로 최소 검증한다. 전체 `npm run lint`는 생략한다 —
  변경 범위가 진짜 작아 다른 파일 회귀 위험이 낮고, 어차피 push 시점 `.githooks/pre-push`가
  전체 lint를 기계적으로 재검증한다.
- 1번 규칙대로 티켓은 반드시 남긴다 (`status: OPEN`으로 생성 후 완료 기록 작성, CLOSED 처리는
  기존과 동일하게 사용자 승인 후 오케스트레이터가 한다).
- staging에 직접 commit한다.

해당하지 않으면 아래 유형 판정으로 진행한다.

### 0.2 유형 자동 판정

인자로 유형이 주어지면(`/jam-work ui`) 그대로 쓴다. **없으면 요청 내용으로 판정하고,
작업 시작 전에 "○○ 유형으로 진행합니다"라고 사용자에게 먼저 알린다.** (사용자가 바로잡을 수 있도록)

### 유형별 파이프라인 분기표

**풀 파이프라인** — 구현 → 게이트 리뷰 → 개선 리뷰 (단, diff가 15줄 미만이면 개선 리뷰도
생략된다 — `gate.diffLineCount` 기준, 2026-09-10)

| 유형 | 대상 | 추가 절차 | 티켓 카테고리 |
|---|---|---|---|
| `ui` | 서비스 화면·기능 | **0.5단계 탐색·재사용 판정 필수** + 게이트 통과 후 **인터페이스 리뷰**(interface-review/better-interface 기준, 제안형) | UI / Feature |
| `ds` | MODULAR 디자인 시스템 | 0.5단계 + Story 동반 확인 + **1.6단계(모듈러-서비스 연결 범위 표기) 필수** | UI |
| `bug` | 버그 수정 | 회귀 재현 경로 집중 | Service / Feature |
| `engine` | 배지·드랍 엔진 | ④ 엔진 문서 대조 (확률·정책) | BadgeEngine |
| `db` | DB 스키마·마이그레이션 | **SQL 파일 작성만, 실행은 5단계** | Infra |
| `api` | API 라우트 | ① PRD 갱신 트리거 | API |

**라이트** — 구현 → 게이트 리뷰 (개선 리뷰 생략)

| 유형 | 대상 | 추가 절차 | 티켓 카테고리 |
|---|---|---|---|
| `content` | 컨텐츠 데이터(배지·아이템북·POI) | ③ 컨텐츠 문서 동기화 | Content |
| `copy` | UX Writing 문안 | 가이드라인 전수 점검 | Content |
| `admin` | 어드민 화면 | **MODULAR 적용 제외** (탐색 생략). 실렌더 검증은 `DEV_PROCESS_GUARDRAILS.md` 패턴 13(로컬 `ADMIN_EMAILS` 셸 환경변수)으로 한다 — staging 배포까지 미루지 않는다 | Admin |
| `infra` | 환경·배포·설정 | 설정 파일 단일성 확인 | Infra |

**단독** — 서브에이전트 없이 오케스트레이터가 직접 수행

| 유형 | 대상 | 절차 | 티켓 카테고리 |
|---|---|---|---|
| `docs` | 문서 정리·체계 갱신 | `/jam-docs` 규칙 적용 | 해당 영역 카테고리 |
| `research` | 조사·감사·보고서 (코드 무변경) | 조사 후 티켓에 결과 기록 | 해당 영역 카테고리 |

> 유형은 **파이프라인 라우팅 키**, 티켓 카테고리는 **문서 분류 키**로 축이 다르다.
> 카테고리 8종(Admin·Service·Feature·Content·BadgeEngine·Infra·UI·API)은 `/jam-docs` 참조.

## 1. 사전 준비 (모든 유형 공통, 위임하지 않음)

1. `Service Plan/Tickets/`에서 유사·관련 티켓 검토 (재구현 방지, 미채택 대안 확인)
2. `_TEMPLATE.md` 형식으로 신규 티켓을 `status: OPEN`으로 생성.
   파일명 `YYYYMMDD_HHMM_[카테고리]_[제목].md` — **모든 유형에서 티켓을 만든다.**
   `HHMM`은 **티켓을 만드는 시각(KST)** 이다. 기존 파일을 훑어 번호를 계산하지 않는다 —
   구 규칙(`NNN` = 당일 최대 +1)은 병렬 세션이 같은 번호를 동시에 선점해 충돌 32건과
   재번호 커밋을 낳았다. 시각은 조회 없이 정해지므로 경합 구간 자체가 없다.
   **우선순위(P0~P3)도 함께 판정**해 frontmatter `priority:`를 채우고 `Service Plan/
   Tickets/P{0-3}-{라벨}/` 폴더 안에 만든다 (기준은 `/jam-docs` 참조).
3. 티켓 경로와 사용자 요청 원문을 다음 단계 컨텍스트로 준비

### 1.5 UI 탐색·재사용 판정 (`ui`·`ds` 유형만, 위임하지 않음)

구현을 위임하기 **전에** 오케스트레이터가 직접:

1. `jam-web/design-system/_ds_manifest.json` → `readme.md` 색인 → `**/*.stories.*` 순으로 탐색
2. `/jam-design` 스킬의 의사결정 트리로 **재사용 / MODULAR 확장 / 서비스 전용**을 판정
3. 판정 결과와 근거(재사용할 컴포넌트명 또는 신규 사유)를 **티켓에 기록**하고 구현 프롬프트에 포함

이 단계를 건너뛰면 jam-developer가 이미 있는 컴포넌트를 다시 만든다.

### 1.6 모듈러-서비스 연결 범위 표기 (`ds` 유형 필수, 위임하지 않음)

> `ui` 유형이라도 `design-system/`을 건드리면 이 절을 함께 적용한다
> (예: 서비스 화면용 신규 MODULAR 패턴을 등록하는 티켓). 그 외 유형은 건너뛴다.

`.claude/skills/jam-work/references/ds-connection-scope.md`를 읽고, 이번 변경이 그 기준
네 부류(토큰 / 연결된 컴포넌트 9종 / 병존 구현 8종 / 미도입 8종) 중 어디에 해당하는지
판단해 티켓 완료 기록에 명시한다. 병존 구현을 고쳤다면 `src/components/ui/`의 대응 파일도
함께 고쳤는지 반드시 확인한다.

## 2. Workflow 호출

`docs`·`research` 유형은 이 단계를 건너뛰고 오케스트레이터가 직접 수행한다.

파이프라인 스크립트는 `.claude/workflows/jam-work.js`에 있다. `Workflow` 도구를 아래처럼 호출한다.

```
Workflow(name: 'jam-work', args: { ticketPath, userRequest, workType, reuseDecision, retryReason })
```

- `name`은 `.claude/workflows/`의 사전 정의 워크플로를 가리킨다. 파일 경로로 직접 지정하려면
  `scriptPath: '.claude/workflows/jam-work.js'`를 쓴다(`scriptPath`가 `name`보다 우선한다).
- `args`는 스크립트에 전역 `args`로 그대로 노출된다. 문자열화하지 말고 실제 JSON 값으로 넘긴다.
- `ticketPath`·`userRequest`·`workType`·`reuseDecision`은 0~1.5단계 값으로 채운다.
- `retryReason`은 최초 실행 시 비우고, 재시도 시에만 이전 FAIL 사유를 넣는다.
- 스크립트를 고쳐야 하면 `.claude/workflows/jam-work.js`를 직접 편집한 뒤 다시 호출한다
  (같은 세션에서 이어 돌릴 때는 `resumeFromRunId`를 함께 넘긴다).

## 3. 결과 보고 — 예외 신호 처리를 포함한다

### 3.0 구현 단계 예외 처리 (Workflow 결과 수신 직후, 판정 보고 전)

1. **HALT 알림 확인**: devResult에서 `alerts`를 파싱한다. `[HALT]`가 포함된 항목이 있으면
   게이트 리뷰 결과와 무관하게 **즉시 사용자에게 HALT 내용을 보고**하고 다음 행동을 묻는다.
2. **confidence 확인**: devResult에서 `confidence: low`이면 사용자에게
   "개발자가 구현에 낮은 확신을 표명했습니다 — 리뷰 진행 전에 확인하시겠습니까?"라고 알린다.
3. **INFO/WARN 알림**: 사용자 보고 시 별도 섹션으로 요약한다 (판정과 분리).

### 3.1 판정별 후속

- **FAIL**: `gate.reasons`를 그대로 보고하고 재시도 여부를 **사용자에게 묻는다.** 임의 재시도 금지.
  승인받아 재시도할 때는 **FAIL 사유를 `retryReason`에 넣어** 다시 호출한다 (같은 실수 반복 방지).
  **동일 티켓에서 FAIL이 2회 연속 발생하면**, 재시도 전에 "워크플로우 규칙이나 티켓 스펙 자체에
  문제가 있을 수 있습니다 — 규칙을 검토할까요?"라고 먼저 묻는다 (정책 갱신 피드백 루프).
- **WARN**: WARN 사유를 사용자에게 알리되, 개선 리뷰는 정상 진행한다.
  사용자가 WARN 사유에 대해 추가 조치를 원하면 그때 처리한다.
- **PASS**: 구현 요약 + PASS 근거 + 개선 제안/문서 갱신 제안을 한 번에 요약하고,
  **머지 승인 여부를 명시적으로 묻는다.** (`progressive`가 `null`이면 diff 규모 기준으로
  개선 리뷰를 생략했다는 사실을 함께 밝힌다 — 필요하면 사용자가 수동으로 요청할 수 있다.)
- **인터페이스 리뷰**(`ui` 유형, `interfaceReview`가 있을 때): 개선 제안과 별도 섹션
  "인터페이스 리뷰 제안"으로 요약한다. 제안형이라 판정에 영향을 주지 않으며, 머지 승인 여부와
  무관하게 참고용으로만 제시한다.
- **한국어 리뷰**(`copy`·`ui`·`content` 유형이고 사용자 노출 문구가 있었을 때, `koreanReview`가
  있을 때): 개선 제안과 별도 섹션 "한국어 표현 리뷰 제안"으로 요약한다(번역투·자연스러움 +
  UX 라이팅 가이드 준수 여부 포함). 제안형이라 판정에 영향을 주지 않으며, 대안 문구 채택 여부는
  사용자가 결정한다.

### 3.2 범위 밖 발견물 처리 — 자동 티켓화

gate의 `sideFindings`와 progressive의 "## 범위 밖 발견물" 섹션이 비어있지 않으면, **승인 없이
발견물마다 자동으로** 1번 규칙대로 `status: OPEN` 티켓을 만든다 — 카테고리·우선순위(P0~P3)는
발견물 내용으로 판단해 frontmatter에 채우고 해당 우선순위 폴더에 생성한다(기준은 `/jam-docs`
참조). `spawn_task`는 쓰지 않는다 — 같은 발견물을 칩과 티켓 두 곳에서 동시에 추적하지 않기
위함이다.

사용자 보고 시 "범위 밖 발견물" 섹션에 생성된 티켓 경로를 우선순위와 함께 나열한다.

## 4. 승인 후 처리 — 베이스캠프 모자를 쓴다 (위임하지 않음)

1. review 브랜치(`claude/jamwork-*`)를 **staging에 머지**한다 (push는 아직 하지 않는다 —
   아래 「staging push는 티켓당 한 번」 참고)
   - **머지 전에 반드시 오염 여부를 확인한다**:
     `git fetch origin staging && git merge-base --is-ancestor origin/staging claude/jamwork-{ticket-id}-{slug}`
     종료 코드가 0이 아니면(= review 브랜치가 최신 `origin/staging` 위에서 분기하지 않음) 머지를
     멈추고 사용자에게 경위를 보고한다 — 다른 진행 중 티켓의 미승인 커밋을 조상으로 물고 들어왔을
     가능성이 있다 (jam-developer.md 5번, 티켓 20260820_019 사고 참고).
2. progressive-reviewer가 제안한 문서 갱신을 `/jam-docs` 규칙에 맞게 반영
3. 티켓을 `status: CLOSED`로 변경하고 완료 기록 작성
4. jam-developer가 SQL 마이그레이션 파일을 남겼다면 **이 시점에** 사용자 승인 하에 직접 실행
   (jam-developer는 파일 작성까지만 했음)
5. 1~4가 모두 끝난 뒤 **`git push origin staging`을 한 번만** 실행한다
6. 프로덕션 반영은 `/jam-ship`으로 별도 진행 — main 머지는 사용자 명시 승인이 있을 때만

### 4.1 staging push는 티켓당 한 번

**커밋할 때마다 push하지 않는다.** `origin/staging`에 push할 때마다 Vercel이 배포를 하나
만들고, 그게 곧 Build CPU 청구다. 커밋 단위로 push하던 관행이 20일간 staging 커밋 1,212개
= 배포 1,212개를 만들어 **Build CPU만 $66.15**가 나왔다 (2026-09-06 실측).

- 구현 커밋·문서 갱신·티켓 CLOSED를 **로컬에 다 쌓은 뒤** 마지막에 한 번 push한다
- review 브랜치(`claude/jamwork-*`) push는 종전대로 자유롭게 한다 — `ignoreCommand`가
  프로덕션 대상이 아닌 배포를 전부 차단하므로 빌드가 돌지 않는다
- staging 배포를 눈으로 확인해야 하는 티켓은 **확인이 필요한 시점에만** push한다.
  확인 후 나오는 수정·문서 커밋은 다시 묶어서 한 번에 올린다
- 예외: 병렬 세션이 같은 파일을 건드리고 있어 먼저 올려두는 편이 안전할 때. 이때는
  사유를 사용자에게 한 줄로 알린다

**문서만 바꾼 push는 빌드를 만들지 않는다** — `jam-web/` 밖(`Service Plan/`·`.claude/` 등)만
바뀐 구간은 `ignoreCommand`가 건너뛴다. 판정 기준은 직전 커밋이 아니라 **직전에 실제로 빌드한
커밋**이라, 한 push에 코드 커밋과 문서 커밋이 섞여도 코드 변경을 놓치지 않는다
(`jam-web/scripts/vercel-ignore.sh`).

## 참고

- 세 서브에이전트는 `.claude/agents/`에 정의돼 있고 fresh context로 스폰된다. 한국어 출력·티켓 우선
  검토 같은 규칙은 각 정의 파일에 하드코딩돼 있으므로 프롬프트에서 반복할 필요는 없지만,
  **티켓 경로·작업 유형·요청 원문은 반드시 전달**해야 한다.
- 이 스킬 호출 자체가 Workflow 툴 사용에 대한 명시적 opt-in이다.
- 경미 수정 처리 기준은 0.1절로 이동·확대됐다(2026-09-10, 판정 순서상 맨 앞으로 승격하고
  "로직 무변경" 제한을 diff 규모 기준으로 교체).
- `copy`·`ui`·`content` 유형의 한국어 문구 작성·점검은 2단계로 나뉜다: **구현 단계**에서
  jam-developer가 `.claude/output-styles/fluent-korean.md` 지침을 따라 쓰고, **한국어 리뷰
  단계**에서 그 결과물을 `humanize-korean`으로 점검한다(제안형, 판정에 영향 없음). 이 단계가
  번역투·자연스러움과 `UX_WRITING_GUIDELINE.md` 준수 여부를 함께 담당한다 — 원래
  progressive-reviewer가 따로 하던 "UX 라이팅 가이드 준수 여부" 검토를 여기로 합쳐서 같은
  텍스트를 두 번 검토하지 않게 했다(2026-09-08).
- 한국어 리뷰 단계는 `humanize-korean` 플러그인(에이전트: `humanize-korean:humanize-monolith`)이
  설치돼 있어야 동작한다. 플러그인을 제거하면 이 단계도 함께 걷어낼 것 — 없는 에이전트 타입을
  호출하면 Workflow가 해당 phase에서 에러를 낸다. `.claude/output-styles/fluent-korean.md`를
  제거하면 구현 단계의 참조 지시도 함께 걷어낼 것.
- `ui` 유형의 인터페이스 리뷰 단계는 `.claude/skills/interface-review`·`.claude/skills/
  better-interface`(및 그 안에서 참조하는 better-accessibility·better-layout·
  better-typography·better-colors·better-ui — **better-writing은 의도적으로 제외**, 라이팅
  품질은 한국어 리뷰 단계가 담당)가 있어야 의미가 있다. 이 스킬들은 `~/.agents/
  skills/`를 가리키는 심볼릭 링크이므로, 다른 PC로 옮기거나 그 폴더가 없으면 링크가 깨진다 —
  깨지면 이 단계도 함께 걷어낼 것. (이전에 쓰던 `apple-design` 기준 "인터랙션 리뷰" 단계는
  2026-09-08 apple-design 스킬 삭제로 이 단계로 대체됨.)
- 인터페이스 리뷰는 `gate.diffLineCount`(conservative-reviewer가 `git diff --numstat`으로 잰
  jam-web 변경 라인 수)가 `SMALL_DIFF_LINE_THRESHOLD`(15) 미만이면 건너뛴다 — 패딩 1줄
  조정 같은 아주 작은 변경까지 6개 도메인 전체를 검토하는 건 낭비이기 때문(2026-09-08). 값이
  없으면(에이전트가 채우지 않았거나 스키마 누락) 안전하게 실행 쪽으로 기운다. 같은 임계값을
  2026-09-10부터 개선 리뷰 생략 판단에도 재사용한다(`jam-work.js` 참고). `diffLineCount`는
  이제 `ui` 유형 한정이 아니라 항상 채워진다(conservative-reviewer 정의 변경).
- 개선·인터페이스·한국어 리뷰 세 단계는 서로 결과를 참조하지 않으므로 2026-09-10부터
  `parallel()`로 동시 실행한다(`jam-work.js`). 검증 내용은 이전과 동일하고 소요 시간만 줄어든다.
- 게이트 리뷰의 전체 lint 재실행은 diff가 작고 jam-developer가 이미 깨끗한 lint 결과를
  보고했다면 생략한다(2026-09-10, `conservative-reviewer.md` 참고). push 시점
  `.githooks/pre-push`의 전체 lint 재검증이 최종 안전망이므로 게이트에서의 중복 실행만
  없앤 것이다.
- `jam-web`의 `npm run lint`·`lint:ci`에 ESLint 캐시(`--cache`)를 켰다(2026-09-10). 무캐시
  전체 실행 17.8초 → 파일 무변경 재실행 2.1초로 실측 확인(약 8배). 캐시 파일
  `.eslintcache`는 `.gitignore`에 추가했다.
- `jam-work.js`의 개선·인터페이스 리뷰는 2026-09-10부터 `model: 'claude-haiku-4-5-20251001'`을
  지정한다 — 둘 다 승인 권한이 없는 제안형 단계라(PASS/FAIL은 이미 게이트가 끝냄) 가벼운
  모델로도 손실이 적다(티켓 20260816_005 감사가 이미 후보로 지목했던 항목). 게이트
  (conservative-reviewer)는 판정 정확도가 핵심이라 그대로 세션 모델을 상속하고, 한국어 리뷰
  (humanize-korean 플러그인)는 자체 route_hint로 모델·콜 수를 이미 조절하므로 지정하지 않는다.
- `jam-web`에 `typecheck` 스크립트가 신설됐다(2026-09-10). 이전에는 conservative-reviewer가
  `npm run typecheck`를 실행하라는 지시를 받았지만 스크립트 자체가 없어 사실상 타입체크가
  전혀 이뤄지지 않고 있었다. `.next/types` 캐시 staleness로 인한 유령 에러 처리 방식은
  `conservative-reviewer.md` 5번 항목 참고.
