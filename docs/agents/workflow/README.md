---
type: index
description: "JAM-WORK 멀티에이전트 작업 폴더의 구조와 에이전트 팀을 안내하는 문서다."
tags: [워크플로]
---

# JAM-WORK 멀티에이전트 최적화 작업 폴더

JAM! 서비스의 JAM-WORK를 '역할별 에이전트 팀' 구조로 바꾸기 위한 구상·준비 자료를 모으는 곳이다.

- **구상안 원본**: [JAM-WORK 멀티에이전트 최적화 구상안](https://claude.ai/code/artifact/3788b2a9-9734-45d4-8f4c-208616c88d6d) (Claude Docs, 계속 갱신)
- **현재 단계**: 도입 완료. 이 폴더는 구상 배경과 결정 이유를 남긴 기록이며, 지금의 운영 규칙은 [team-operations.md](../team-operations.md)와 `.claude/agents/`가 기준이다
- 이 폴더는 2026-09-19에 JAM! 저장소의 `docs/agents/workflow/`로 편입됐다

## 폴더 구성

| 파일 | 내용 |
| --- | --- |
| `01_도입체크리스트.md` | 단계별로 할 일과 완료 여부 |
| `02_결정사항.md` | 정해진 것과 결정이 필요한 것 |
| `03_작업로그.md` | 날짜별 진행 기록 |
| `08_인수인계.md` | **새 세션은 여기부터.** 00~07에 아직 반영 안 된 최신 사실(정정·사고·머지 상태) |

## 에이전트 팀

구상 당시의 제안안은 `00_팀구성.md`에 남아 있고, 현재 팀 구성·모델·권한은 [team-operations.md](../team-operations.md)의 자동 생성 표를 본다. 개발 크루는 아현(`jam-developer`)과 민지(`jam-reviewer`) 체제로 정리됐고, `progressive-reviewer`는 폐지됐다.
