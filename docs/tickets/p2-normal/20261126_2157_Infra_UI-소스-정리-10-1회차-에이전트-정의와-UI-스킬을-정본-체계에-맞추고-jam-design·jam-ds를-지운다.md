---
id: "20261126_2157"
category: Infra
priority: P2
status: CLOSED
created: 2026-11-26
closed: 2026-11-26
parent: "20261125_1923"
---

# [Infra] UI 소스 정리 10-1회차: 에이전트 정의와 UI 스킬을 정본 체계에 맞추고 jam-design·jam-ds를 지운다

## 핵심 요약

- 요구사항: 상위 티켓 20261125_1923 10회차 첫 조각(10-3과 동시). 에이전트 정의 8개와 UI 스킬에서 1~9회차로 장치가 대신하게 된 규칙 문장, 중복, 사라진 체계(MODULAR 컴포넌트·claude.ai/design·네 층 동기화·`ds:check`·기준선·Story 동반 경고) 전제 문장, 경위 혼입, 낡은 사실을 걷어낸다. jam-design·jam-ds 스킬은 지운다.
- 사용자 승인: 2026-11-26 — 10회차 분할안과 문서 쟁점 추천안(jam-design·jam-ds 스킬 삭제, `ds` 유형 연결 범위 폐기와 채원① 분류 변경 포함). 정본 `TopNavBar.tsx`는 주석 한 줄만 바뀐다(화면 변화 없음).
- 관련 파일: `.claude/agents/*.md` 8개, `.claude/skills/jam-design/`(SKILL.md·references 5개), `.claude/skills/jam-ds/SKILL.md`, `.claude/workflows/jam-work.js`(채원① 프롬프트·스키마 349행 부근, 점검표 경로 228행, 연결 범위 353행)와 그 시험, `.claude/skills/jam-work/references/ds-connection-scope.md`, 삭제가 가리키는 참조(`docs/agents/orchestrator.md:192-193`, `.claude/skills/jam-work/references/team-composition.md:27`, `.claude/skills/jam-work/SKILL.md` 분기표 `ds` 행·§1.5·399행, `.claude/skills/jam-work/references/handling-rules.md:90`, `.claude/sync-skills.sh:22`, `scripts/skill-eval-cases.json:33-36`, `jam-web/CLAUDE.md:7-20`, `jam-web/src/components/ui/TopNavBar.tsx:42` 주석), 생성물 `docs/agents/team-map.html`, 업로드 잔재 `jam-web/design-system/.thumbnail`(참조 0 확인 뒤).
- 측정 근거: 세션 노트 `10회차-측정-A.md`(줄 단위 표, 커밋하지 않음). 감소 추정 약 −400줄.
- 화면 변화: 없음.

## 구현 계획

1. 스킬: `jam-ds` 폴더를 지운다. `jam-design`을 지우고 채원 모드 파일(사전 판정·사후 점검표·컨텐츠 색·크래프트)은 `.claude/skills/jam-work/references/designer-*.md`로 옮긴다. `coverage-map.md`는 내용을 확인해 지우거나 옮긴다. 옮긴 파일 안의 MODULAR·`design-system/components` 전제 문장을 고친다.
2. 채원① 판정: 분류를 «재사용 / 정본 변형 추가(승인) / 새 정본(승인)»으로, «MODULAR 승격 후보»를 «두 화면 이상에서 반복되는 조합 → 정본 후보»로 바꾼다. `ds` 유형의 «연결 범위»(`ds-connection-scope.md`, `jam-work.js`의 `scope` 필드)는 폐기한다. 토큰 탐색의 첫 입구는 `docs/service/prd/ui-components/tokens.md`, 컴포넌트는 `docs/service/prd/ui-components/README.md`다.
3. 에이전트 정의: 측정 A 표대로. 장치가 막는 규칙은 한 줄 요약만 남긴다(민지 점검표의 UI 승인 줄 확인은 유지). 낡은 사실을 고친다(아현 «SQL은 사용자 승인 뒤 실행» → 실행 전 점검 뒤 메인 세션 실행, «pre-commit이 스토리 동반 검사» → 정본 스토리 검사, 카즈하 «매일 자동», 윈터의 없는 검사 스크립트). 윤진 정의의 모드 ⑨ 한 칸은 `.claude/skills/jam-story/references/`의 새 모드 파일로 옮기고 정의에는 한 줄 참조만 둔다. 경위 줄은 판단 근거가 되는 것만 rationale로 옮기고 단순 이력은 지운다.
4. UI 규칙의 단일 원천: «정본만 조합한다, 새 정본·변형·토큰은 승인» 규칙을 정본 목록 README의 생성 구간 밖(손으로 쓰는 머리말)에 한 번 적고, `jam-web/CLAUDE.md`·채원·민지 정의는 그곳을 가리킨다.
5. 참조 정리: 위 «관련 파일»의 참조를 고치고, `node scripts/gen-team-map.mjs`로 팀 지도를 다시 만든다. `scripts/skill-eval-cases.json`의 두 스킬 사례는 지우거나 기대값을 바꾼다.

## 완료 조건

- 대상 파일에서 `MODULAR`·`claude.ai/design`·`_ds_manifest`·`ds:check`·`design-system/components`·`jam-design`·`jam-ds`가 사라진다(티켓·아카이브 제외 `git grep`으로 보인다).
- `node scripts/check-skills.mjs`, `node scripts/check-contract.mjs`, `node scripts/gen-team-doc.mjs --check`, `node scripts/gen-team-map.mjs --check`, `.claude/workflows`·루트 `scripts` 시험, 바뀐 문서의 `doc-check`가 통과한다.
- 민지 판정: 지운 규칙이 장치나 다른 문서에 실제로 있는가, 바꾼 문장이 사실과 맞는가.
- 대상 파일의 줄 수 전후를 완료 기록에 남긴다.

## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 커밋 `4e14c65a1`(로컬 staging, push 안 함). 문서 유형이라 Workflow 없이 카리나가 서브에이전트에 편집을 맡기고 차이·검사를 확인한 뒤 커밋했다.
- jam-ds·jam-design 스킬을 지우고 채원 모드 파일 4개를 `.claude/skills/jam-work/references/designer-*.md`로 옮겼다(사후 점검표는 `designer-review-checklist.md`, `coverage-map.md`의 점검 기록 표는 `designer-craft.md`로).
- 채원① 분류를 «재사용 / 정본 변형 추가 / 새 정본»으로, `ds` 유형의 연결 범위(`ds-connection-scope.md`, `jam-work.js`의 `scope` 필드·ds 분기)를 폐기했다.
- 에이전트 정의 7개(혜린은 고칠 곳 없음): 장치가 막는 규칙은 한 줄 요약, 사라진 체계 전제와 낡은 사실(아현 «SQL은 사용자 승인 뒤 실행», «pre-commit이 스토리 동반 검사», 카즈하 «매일 자동», 윈터·윤진의 없는 검사 스크립트) 정리. 윤진 모드 ⑨ 칸을 `.claude/skills/jam-story/references/marketer-ops-bundle.md`로 옮겼다.
- UI 규칙(정본만 조합, 새 정본·변형·토큰은 승인)의 단일 원천을 `docs/service/prd/ui-components/README.md` 머리말 «UI 규칙» 절로 두고 `jam-web/CLAUDE.md`·채원·민지 정의가 가리키게 했다. 정본 `TopNavBar.tsx`는 주석만, 업로드 잔재 `jam-web/design-system/.thumbnail`은 참조 0 확인 뒤 삭제.

### 변경된 파일
```
28개 파일(+383 −654): .claude/agents/ 7개, .claude/skills/jam-design/·jam-ds/ 삭제, jam-work references designer-* 4개(이동)·ds-connection-scope.md(삭제)·handling-rules·team-composition·SKILL.md,
jam-story/references/marketer-ops-bundle.md(새), .claude/sync-skills.sh, .claude/workflows/jam-work.js, docs/agents/orchestrator.md, docs/service/prd/ui-components/README.md,
jam-web/CLAUDE.md, jam-web/design-system/.thumbnail(삭제), jam-web/src/components/ui/TopNavBar.tsx(주석), scripts/skill-eval-cases.json
```

### 테스트 결과
- [x] `check-skills`(스킬 8개·에이전트 8개), `check-contract`, `gen-team-map --check`, `gen-team-doc --check`, `node .claude/workflows/jam-work.test.mjs`, skill-eval·check-skills·gen-team-map·gen-component-list 시험, component-list·token-catalog·doc-index 검사 통과
- [x] `doc-check --all`: 이번에 바꾼 파일 0건(남은 오류는 기존 티켓 문서)
- [x] `git grep`(티켓·아카이브·리포트 제외)으로 대상 파일에 MODULAR·claude.ai/design·_ds_manifest·ds:check·design-system/components·jam-design·jam-ds 0건
- [x] 민지 판정 **PASS**: 지운 규칙마다 장치(`check-ui-rules`·`check-ui-approval`·pre-push) 또는 정본 목록 README «UI 규칙»에 남아 있음, 새 문장 사실 일치, 깨진 참조 0, `jam-work.js` 스키마·프롬프트·시험 일치

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 편집 | general-purpose 1 | 392,098 | — | 17분 21초 | 134 |
| 게이트 | 민지 1 | 65,296 | — | 51초 | 9 |
| 합계 | 2 | 457,394 | — | 18분 12초 | 143 |

### 주요 의사결정 / 핵심 메모
- 줄 수: 대상 24개 파일 2,221 → 1,957줄(−264), 16만 7,200 → 13만 6,224자. 윤진 ⑨ 한 줄(약 1만 4천 자)이 새 파일에서 172줄로 펼쳐졌으므로 이를 빼면 약 −436줄. 에이전트 정의 966 → 911줄, 윤진 정의 2만 2,836 → 7,906자.
- 아현 규칙 4의 «완료 기록은 써도 된다»는 같은 정의의 Token discipline과 모순이라 지웠다(확신도 보통).
- 경위 이관 2건(공유 폴더 HEAD 이동 사고, npm 링크 사고)은 세션 노트에 모아 10-2가 `rationale.md`로 옮긴다.
- 사용자 승인: 2026-11-26 — 10회차 분할안과 문서 쟁점 추천안(상위 티켓 «10회차 사용자 결정»)

### 잔여 이슈
- `rationale.md:34`의 «MODULAR을 탐색하던 1.5·1.6단계», `team-operations.md:331`의 `ds:check`는 10-2 대상.
- `jam-work.js` 재시도 문구(413-416행 부근)는 10-5(jam-work 운영)와 겹쳐 그대로 두었다.
- 채원 모드 ⑤의 주간 루틴 문장과 윤진 ⑨의 «이미지 색은 서버가 정한다»가 어긋날 수 있다(범위 밖, 확신도 낮음).
