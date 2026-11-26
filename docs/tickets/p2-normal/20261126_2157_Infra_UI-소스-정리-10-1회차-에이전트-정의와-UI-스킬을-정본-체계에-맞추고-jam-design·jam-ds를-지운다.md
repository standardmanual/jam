---
id: "20261126_2157"
category: Infra
priority: P2
status: OPEN
created: 2026-11-26
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
