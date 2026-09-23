---
id: "20260924_0037"
category: Infra
priority: P3
status: OPEN
created: 2026-09-24
closed:
related:
  - "20260923_2253"
---

# [Infra] vitest.config.ts 기존 주석의 금칙어 정리 + 로컬 slop 검사 기준이 CI와 다른지 확인

> 티켓 20260923_2253 2차 게이트(민지)의 범위 밖 발견물 [가독성/참고]에서 자동 생성. 같은 실행에서 드러난 검사 기준 차이도 함께 다룬다.

## 핵심 요약

- 요구사항: (1) `jam-web/vitest.config.ts` 38행 기존 주석의 "진짜"(SLOP_DICTIONARY §4 반복 강조)를 대체 표현으로 고친다.
  (2) 아현이 워크트리에서 `scripts/verify.sh`를 "전항목 통과"로 보고했는데 CI `verify`는 같은 커밋에서 slop 실패였다. 로컬 slop 검사의
  비교 기준 커밋(격리 워크트리의 `origin/staging`이 main 기준으로 낡아 있을 가능성)이 CI와 다른지 확인하고, 다르면 `check-slop.mjs` 또는
  `verify.sh`가 `git fetch origin staging` 뒤 최신 기준으로 검사하게 한다.
- 관련 파일: `jam-web/vitest.config.ts` 38행, `scripts/check-slop.mjs`(diff 기준 계산부), `scripts/verify.sh`(slop 단계), `.claude/workflows/jam-work.js`(아현 첫 명령 `git fetch origin staging`).

## 완료 조건

- 38행 주석에서 금칙어가 사라지고 `node scripts/check-slop.mjs`가 통과한다.
- 로컬 slop 검사와 CI의 비교 기준이 같음을 확인하거나(원인 기록), 다르면 고쳐서 같은 커밋에서 두 결과가 일치한다.

크기 상한: 파일 3개, 40줄 이내.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
