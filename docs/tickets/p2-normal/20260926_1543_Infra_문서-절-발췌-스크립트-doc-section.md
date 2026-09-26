---
id: "20260926_1543"
category: Infra
priority: P2
status: OPEN
created: 2026-09-26
closed:
parent: "20260926_1541"
---

# [Infra] 문서-절-발췌-스크립트-doc-section

## 핵심 요약

- 요구사항: 예약 세션의 에이전트가 큰 문서를 통째로 읽지 않고 필요한 절만 읽도록 `node scripts/doc-section.mjs <파일> <제목 접두>`를 만든다.
- 구현 계획: 마크다운 제목(`#`~`######`)을 파싱해 제목 텍스트가 접두로 시작하는 절을 다음 같은 수준 이하 제목 직전까지 출력한다. 코드 펜스(```) 안의 `#`는 제목으로 보지 않는다. 일치가 없거나 둘 이상이면 종료 코드 1과 후보 제목 목록을 출력한다. `--all-matches`를 주면 일치하는 절을 모두 출력한다.
- 관련 파일: 신규 `scripts/doc-section.mjs`, `scripts/doc-section.test.mjs`(기존 `scripts/check-slop.mjs`·`check-slop.test.mjs` 형식을 따른다). 큰 문서 예: `.claude/skills/jam-work/references/scheduled-jobs.md`(52KB), `docs/specs/prd/content-automation/PRD.md`(40KB), `jam-doc/planning/content/TRIBES.md`(34KB).

## 완료 조건

- `node scripts/doc-section.mjs docs/specs/prd/content-automation/PRD.md "## 8."`이 §8 전체만 출력하고 §8-1·§8-2는 포함하지 않는다(접두가 `## 8.`로 시작하는 제목만 일치).
- 접두가 없는 제목이면 종료 코드 1이고 stderr에 후보 목록을 낸다. 코드 펜스 안의 `#`는 무시한다.
- 테스트가 위 세 경우와 「마지막 절」「파일에 절이 하나뿐」을 포함한다. `scripts/verify.sh`가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
