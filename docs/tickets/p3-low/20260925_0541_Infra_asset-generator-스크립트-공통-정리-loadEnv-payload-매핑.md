---
id: "20260925_0541"
category: Infra
priority: P3
status: OPEN
created: 2026-09-25
closed:
parent: "20260924_2154"
specs:
  - "docs/specs/prd/asset-generator/REGISTRATION_BUNDLE.md"
---

# [Infra] 에셋 제너레이터 스크립트의 `loadEnv` 복제와 배지 insert 페이로드 복제를 공용 모듈로 모은다

> 티켓 20260924_2202 게이트 리뷰에서 민지가 낸 범위 밖 발견물을 3.2절대로 자동 티켓화했다. 카리나가 실제 스키마로 확인한 사실을 덧붙였다.

## 핵심 요약

- 요구사항: `.env.local` 수동 파싱 `loadEnv`가 `jam-web/scripts/` 아래 10곳 넘게 복제돼 있고 2201·2202에서 둘이 더 늘었다. 또 `registerBundle.mjs`의 `buildBadgeInsertPayload`는 어드민 배지 생성 라우트의 insertPayload 매핑을 복제했고, 지금은 키 목록 대조 테스트로 드리프트를 막지만 값 매핑(예: `type === 'checkin'`일 때 null 처리, 정렬 기본값)의 어긋남은 못 잡는다.
- 구현 계획: (a) 스크립트 공용 `scripts/lib/loadEnv.mjs`를 만들고 에셋 제너레이터 스크립트부터 옮긴다(다른 스크립트는 건드릴 때 하나씩). (b) 라우트의 insertPayload 매핑을 `jam-web/src/lib/admin/` 아래 순수 함수로 빼 라우트와 등록 스크립트가 같이 쓰게 한다(라우트 동작 불변, 기존 라우트 테스트로 확인).
- 관련 파일: `jam-web/scripts/asset-generator/register-badge.mjs`(loadEnv 46줄), `render.mjs`(75줄), `registerBundle.mjs`(`buildBadgeInsertPayload` 346줄), `jam-web/src/app/api/admin/badges/route.ts`(insertPayload 92~145줄)

## 완료 조건
- 에셋 제너레이터 스크립트가 공용 `loadEnv`를 쓰고, 배지 insert 페이로드 매핑의 원본이 한 곳이다.
- 어드민 배지 생성 라우트의 기존 테스트와 등록 스크립트 테스트가 그대로 통과한다. `npm run lint`·`npm test` 통과.

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
