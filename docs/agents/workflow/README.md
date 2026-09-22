---
type: index
description: "JAM-WORK 멀티에이전트 작업 폴더의 구조와 에이전트 팀을 안내하는 문서다."
tags: [워크플로]
---

# JAM-WORK 멀티에이전트 최적화 작업 폴더

JAM! 서비스의 JAM-WORK를 '역할별 에이전트 팀' 구조로 바꾸기 위한 구상·준비 자료를 모으는 곳이다.

> **동결 고지 (2026-09-22, 티켓 20260921_2311)**
> 이 폴더(`docs/agents/workflow/`)는 기록 전용이다. `README.md`를 제외한 파일은 더 이상
> 고치지 않는다(신규·수정·이름변경·삭제 모두 막는다 — `.githooks/pre-commit` ⑨ 항목).
> 현재 운영 규칙은 아래 세 곳을 기준으로 삼는다.
> - [`docs/agents/team-operations.md`](../team-operations.md)
> - `.claude/agents/` (아현·민지·채원 등 에이전트 정의 원본, 영어)
> - [`.claude/skills/jam-work/SKILL.md`](../../../.claude/skills/jam-work/SKILL.md)
>
> `agents/` 하위 미러 문서 9개는 2026-09-22 동결 시점의 요약이며, 현재 정의는 `.claude/agents/`다.

- **구상안 원본**: [JAM-WORK 멀티에이전트 최적화 구상안](https://claude.ai/code/artifact/3788b2a9-9734-45d4-8f4c-208616c88d6d) (Claude Docs, 계속 갱신)
- **현재 단계**: 도입 완료. 이 폴더는 구상 배경과 결정 이유를 남긴 기록이며, 지금의 운영 규칙은 [team-operations.md](../team-operations.md)와 `.claude/agents/`가 기준이다
- 이 폴더는 2026-09-19에 JAM! 저장소의 `docs/agents/workflow/`로 편입됐고, 2026-09-22에 동결됐다

## 폴더 구성

| 파일 | 내용 |
| --- | --- |
| `01_도입체크리스트.md` | 단계별로 할 일과 완료 여부 |
| `02_결정사항.md` | 정해진 것과 결정이 필요한 것 |
| `03_작업로그.md` | 날짜별 진행 기록 |
| `08_인수인계.md` | 도입 과정의 정정·사고·머지 상태 기록. "새 세션은 여기부터 읽는다"던 안내는 [`docs/agents/orchestrator.md`](../orchestrator.md)(카리나 카드)로 대체됐다 — 새 세션은 그쪽을 먼저 읽는다 |

## 에이전트 팀

구상 당시의 제안안은 `00_팀구성.md`에 남아 있고, 현재 팀 구성·모델·권한은 [team-operations.md](../team-operations.md)의 자동 생성 표를 본다. 개발 크루는 아현(`jam-developer`)과 민지(`jam-reviewer`) 체제로 정리됐고, `progressive-reviewer`는 폐지됐다.
