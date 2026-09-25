---
id: "20260925_0542"
category: Infra
priority: P3
status: OPEN
created: 2026-09-25
closed:
parent: "20260924_2154"
specs:
  - "docs/specs/prd/asset-generator/REGISTRATION_BUNDLE.md"
---

# [Infra] 등록 dry-run 요약이 DB 검사를 건너뛰었어도 첫 줄에 '통과'만 찍는 문제를 고친다

> 티켓 20260924_2202 게이트 리뷰에서 민지가 낸 범위 밖 발견물을 3.2절대로 자동 티켓화했다. 카리나가 실제 스키마로 확인한 사실을 덧붙였다.

## 핵심 요약

- 요구사항: `register-badge.mjs --dry-run`은 서비스 키가 없으면 DB 읽기 검사(이름 중복·tribe_id·item_book_id 존재)를 건너뛰는데도 첫 줄에 `결과: 통과`만 찍고 "건너뜀"은 `[DB 읽기 검사]` 절에만 나온다. 컨펌 자료(dry-run 요약)를 훑는 사람이 중복 검사까지 끝난 것으로 읽을 수 있다. 실제로 카리나가 격리 환경에서 예시 묶음을 돌렸을 때 첫 줄이 `결과: 통과`였다.
- 구현 계획: 첫 줄을 `결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)`처럼 건너뜀이 있으면 함께 적는다. 건너뜀이 있는 dry-run 요약은 컨펌 근거로 쓰지 말고 키가 있는 환경(메인 폴더)에서 다시 돌리라는 안내를 넣는다.
- 관련 파일: `jam-web/scripts/asset-generator/registerRecord.mjs`(`formatDryRunSummary`), `docs/specs/prd/asset-generator/REGISTRATION_BUNDLE.md`(절차 절), 테스트 `__tests__/registerRecord.test.ts`

## 완료 조건
- 키가 없을 때 dry-run 첫 줄에 건너뜀이 표기되고, 키가 있을 때는 기존과 같다(테스트).
- `npm run lint`·`npm test` 통과.

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
