---
id: 20260918_1626
category: Infra
priority: P2
status: WAITING
created: 2026-09-18
closed:
---

# [Infra] `conservative-reviewer`를 `jam-reviewer`로 이름 변경

> 관련 티켓: `20260918_1617_Infra_콜사인-이름-통일-카즈하-워크플로개선점발견-역할추가.md`

## 핵심 요약
- 요구사항: 에이전트 정의 파일 `conservative-reviewer.md`만 `jam-<역할>` 명명 규칙에서 벗어나
  있었다. `jam-reviewer`로 이름을 바꿔 나머지 8개(`jam-developer`·`jam-designer`·`jam-pm`·
  `jam-tribe`·`jam-marketer`·`jam-ops`·`jam-guide`)와 통일한다.
- 구현 계획: 파일명·frontmatter `name:` 변경 후, 파이프라인 코드(`jam-work.js`)의 `agentType`
  문자열과 그 외 현재 유효한 문서의 참조를 전부 교체. 완료된 과거 티켓 본문은 이력이므로 건드리지
  않는다.
- 관련 파일: `.claude/agents/conservative-reviewer.md` → `jam-reviewer.md`,
  `.claude/workflows/jam-work.js:288`, `.claude/workflows/jam-work.test.mjs`,
  `.claude/agents/jam-developer.md`, `.claude/agents/jam-designer.md`, `CLAUDE.md`,
  `.claude/skills/jam-work/SKILL.md`, `.claude/skills/jam-work/references/team-composition.md`,
  `Service Plan/Specs/SLOP_DICTIONARY.md`, `Service Plan/Specs/UX_WRITING_GUIDELINE.md`,
  `docs/agents/issue-tracker.md`

## 배경 / 문제 정의
2026-09-18 8인 에이전트 팀 도입(티켓 20260918_0422) 이후 정의 파일명이 전부 `jam-<역할>`
패턴으로 자리 잡았는데, 민지(게이트 리뷰어)만 예전 이름 `conservative-reviewer`를 그대로 쓰고
있었다. 사용자가 일관성을 위해 `jam-reviewer`로 바꾸자고 제안했고, 이 이름은 `developer`·
`designer`·`marketer`처럼 "역할을 가진 사람" 명명 패턴과도 맞는다(제안됐던 `jam-review`는
행위 명사라 배제).

단순 파일명 변경이 아니라 `.claude/workflows/jam-work.js`가 `agentType: 'conservative-reviewer'`
문자열로 이 에이전트를 직접 호출하므로, 파일명만 바꾸면 파이프라인이 민지를 찾지 못해 즉시
깨진다. 코드·문서·테스트를 한 번에 맞춰야 하는 이유다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `.claude/agents/conservative-reviewer.md` → `git mv`로 `jam-reviewer.md`, frontmatter
  `name: conservative-reviewer` → `name: jam-reviewer`
- `.claude/workflows/jam-work.js:288`의 `agentType: 'conservative-reviewer', label:
  'conservative-reviewer'` → `agentType: 'jam-reviewer', label: 'jam-reviewer'`
- `.claude/workflows/jam-work.test.mjs`의 `label === 'conservative-reviewer'` 매칭 5곳을
  `jam-reviewer`로 교체 (라벨이 바뀌었으므로 목(mock) 응답도 새 라벨을 봐야 매칭된다)

### 문서 관점
- 현재 유효한 문서(Specs·SKILL·에이전트 정의·CLAUDE.md)만 교체하고, `Service Plan/Tickets/`의
  과거 완료 티켓 본문은 작업 이력이므로 그대로 둔다 — 폴더 수명주기 규칙(`Tickets/` = 신규 생성,
  기존 파일 수정 금지에 준함).
- `docs/agents/Workflow/`(2026-09-17 "구상 단계, 아직 반영 안 함" 표기가 있는 계획 초안 폴더)도
  당시 논의 기록이므로 건드리지 않는다.

## 완료 조건
- `grep -rn "conservative-reviewer" .claude/agents .claude/skills .claude/workflows CLAUDE.md
  "Service Plan/Specs" docs/agents/issue-tracker.md`가 빈 결과를 반환한다.
- `node --test .claude/workflows/jam-work.test.mjs`가 전부 통과한다.
- `.claude/agents/jam-reviewer.md`가 존재하고 frontmatter `name: jam-reviewer`다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`conservative-reviewer.md`를 `jam-reviewer.md`로 rename하고 frontmatter `name`을 맞췄다.
`jam-work.js`의 실제 호출 코드(`agentType`/`label`)와 `jam-work.test.mjs`의 목 라벨 5곳을 함께
바꿔 파이프라인이 끊기지 않게 했다. 현재 유효한 문서 8곳(`CLAUDE.md`, `jam-developer.md`,
`jam-designer.md`, `SKILL.md`, `team-composition.md`, `SLOP_DICTIONARY.md`,
`UX_WRITING_GUIDELINE.md`, `issue-tracker.md`)의 참조도 함께 교체했다. 과거 완료 티켓과
`docs/agents/Workflow/`(2026-09-17 구상 단계 기록)는 작업 이력이라 손대지 않았다.

### 변경된 파일
```
.claude/agents/conservative-reviewer.md → .claude/agents/jam-reviewer.md (rename)
.claude/workflows/jam-work.js
.claude/workflows/jam-work.test.mjs
.claude/agents/jam-developer.md
.claude/agents/jam-designer.md
CLAUDE.md
.claude/skills/jam-work/SKILL.md
.claude/skills/jam-work/references/team-composition.md
Service Plan/Specs/SLOP_DICTIONARY.md
Service Plan/Specs/UX_WRITING_GUIDELINE.md
docs/agents/issue-tracker.md
```

### 테스트 결과
- [x] `grep -rn "conservative-reviewer" .claude/agents .claude/skills .claude/workflows CLAUDE.md "Service Plan/Specs" docs/agents/issue-tracker.md` — 빈 결과
- [x] `node --test .claude/workflows/jam-work.test.mjs` — 5개 테스트 전체 통과
