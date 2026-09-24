---
id: "20260924_0854"
category: API
priority: P3
status: OPEN
created: 2026-09-24
closed:
parent: "20260924_0811"
related:
  - "20260923_2325"
  - "20260924_0038"
---

# [API] 코퍼스 접근 계층 오류 경로와 content-corpus 라우트 동작 테스트를 추가한다

> 티켓 20260924_0811에서 나눈 하위 티켓이다.

## 핵심 요약

- 요구사항: (1) 어드민 `content-corpus` 라우트의 유일한 테스트가 소스 텍스트를 정규식으로 검사한다. 실제 동작(무권한 401, `type` 누락·잘못된 값 400, `limit` 0·음수·비숫자 시 기본값 폴백, 콤마 ID 파싱, 조회 오류 500)을 호출해 검증하는 테스트를 **추가**한다(기존 계약 테스트는 유지). (2) `selectCorpusForType`의 DB 오류 전파, ID가 빈 배열일 때, `limit` 0일 때의 결과를 테스트로 고정한다.
- 구현 계획: 라우트 테스트 패턴은 `jam-web/src/app/api/cron/external-inputs/__tests__/route.test.ts`를 따른다. 코드 수정 없이 테스트만 추가한다.
- 관련 파일: `jam-web/src/app/api/admin/content-corpus/route.ts`, `jam-web/src/lib/content-corpus/select.ts`(41행 근방), 기존 `jam-web/src/lib/content-corpus/__tests__/content-corpus.test.ts`

## 완료 조건

### 구현 범위 (게이트 판정 대상)
- 라우트 분기가 호출로 검증된다.
- 코퍼스 계층의 오류·빈 입력 경로가 테스트로 고정된다.

크기 상한: 테스트 2파일/95줄.

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
