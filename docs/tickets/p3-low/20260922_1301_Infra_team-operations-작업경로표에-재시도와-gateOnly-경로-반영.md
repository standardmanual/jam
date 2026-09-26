---
id: "20260922_1301"
category: Infra
priority: P3
status: CLOSED
created: 2026-09-22
parent: "20260921_2307"
---

# [Infra] `team-operations.md` §3 「작업이 흐르는 경로」 표에 재시도 경로와 `gateOnly` 경로를 반영한다

## 핵심 요약

- 요구사항: `docs/agents/team-operations.md` §3의 경로 표(① 경미 수정 / ② 가벼운 UI / ③ 표준)에 재작업 경로 두 가지 — 기존 재시도(`retryReason`·`retryBranch`, 아현 재호출)와 게이트만 재실행(`gateOnly`, 카리나 직접 패치 후 민지만 재호출) — 를 적는다.
- 구현 계획: 표 아래에 "재작업" 행 또는 짧은 단락을 추가하고, 서술은 옮겨 적지 않고 `.claude/skills/jam-work/SKILL.md` 3.1절을 참조한다(`CLAUDE.md` 규칙 5).
- 관련 파일: `docs/agents/team-operations.md` §3(75행 부근). 손으로 고치는 구간인지 자동 생성 구간(`<!-- BEGIN generated -->`)인지 먼저 확인한다 — 생성 구간이면 근거 설정을 고친 뒤 `node scripts/gen-team-doc.mjs`를 돌린다.
- 상위 티켓: 20260921_2307(민지 2차 게이트의 범위 밖 발견물). 경로: ① 경미 또는 `docs` 유형

## 배경 / 문제 정의

티켓 20260921_2307의 2차 게이트에서 민지가 발견했다. §3 경로 표에 `gateOnly` 재실행 경로가 없고, 기존 재시도 경로(`retryReason`·`retryBranch`)도 원래 없었다. 일관된 생략이지만, `CLAUDE.md`의 "파이프라인이 바뀌면 같은 작업 안에서 `team-operations.md`를 함께 고친다" 규칙과 대조하면 드리프트 위험이 남는다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 재작업 경로 두 가지가 표 또는 단락으로 보인다. 적용 조건 수치(파일 2개·10줄 이내)는 SKILL.md 3.1절이 단일 원천이므로 여기서는 참조만 한다.

## 구현 계획

1. §3 구간이 손으로 고치는 구간인지 확인한다.
2. 재작업 행/단락 추가, SKILL.md 3.1절 참조.

## 완료 조건

- `team-operations.md` §3에서 "재시도"와 "`gateOnly`" 두 단어가 검색되고, 각각 SKILL.md 3.1절을 가리킨다.
- `scripts/verify.sh`의 계약 검사(`check-contract`)와 `gen-team-doc` 최신성 검사가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- `docs/agents/team-operations.md` §3(손으로 쓰는 구간, 생성 구간 아님)의 경로 표 아래에 재작업 두 갈래를 적었다: 아현을 다시 부르는 **재시도**(`retryReason`·`retryBranch`)와 좁은 재작업을 카리나가 직접 패치한 뒤 민지만 다시 부르는 **`gateOnly`**. 서술은 옮겨 적지 않고 `.claude/skills/jam-work/SKILL.md` 3.1절을 단일 원천으로 가리킨다(`CLAUDE.md` 규칙 5).

### 변경된 파일
```
- docs/agents/team-operations.md
```

### 테스트 결과
- [x] `check-contract` 통과, `gen-team-doc --check`(team-operations.md 생성 구간 최신) 통과
