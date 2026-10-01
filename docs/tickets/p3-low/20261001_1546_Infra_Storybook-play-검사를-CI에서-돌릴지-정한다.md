---
id: "20261001_1546"
category: Infra
priority: P3
status: OPEN
created: 2026-10-01
closed:
---

# [Infra] Storybook `play` 검사를 CI에서 돌릴지 정한다

> 출처: 티켓 20261001_1458(1453-b2) 민지 게이트 범위 밖 발견물 `[정확성/참고]`

## 핵심 요약

- 요구사항: 서비스 Story(`jam-web/src/components/today/BriefCard.stories.tsx` 등)의 `play` 함수가 담은 검사(카드 높이 88px, 가로 넘침 없음, 포커스 윤곽선)가
  어디에서도 자동으로 돌지 않는다. CI(GitHub Actions `verify`)에서만 `@storybook/addon-vitest` 연동을 켤지, 지금처럼 렌더 테스트와 수동 확인에 맡길지 정한다.
- 구현 계획: 미정. 아래 「배경」의 제약을 먼저 확인한다.
- 관련 파일: `jam-web/vitest.config.ts` 1~18줄(연동을 뺀 사유 주석), `.github/workflows/`의 `verify` 워크플로, `jam-web/.storybook/main.ts`,
  `jam-web/src/components/today/BriefCard.stories.tsx` 12줄 부근(`play`)

## 배경 / 문제 정의

- 티켓 20260906_1348이 addon-vitest 연동을 뺐다. 이유는 addon의 경로 비교(`convertToFilePath`)가 `%20`만 디코딩해, 한글이 들어간 로컬 저장소 절대경로에서는 모든 Story가
  「No test suite found」로 실패했기 때문이다(`jam-web/vitest.config.ts` 주석).
- CI 러너의 저장소 경로에는 한글이 없을 수 있다. 그렇다면 CI에서만 연동을 켜는 선택지가 생긴다. 이 가정은 확인하지 않았다.
- 1458에서는 아현과 민지가 정적 Storybook을 헤드리스 Chromium으로 열어 Story 13개의 `play` 통과를 직접 확인했다. 이후 b3~b5가 모양을 더하면 같은 확인을 매번 손으로 해야 한다.

## 완료 조건

- 선택지(CI 전용 연동, 정적 빌드 + 헤드리스 실행 스크립트, 지금 유지) 중 하나를 고른 근거가 이 티켓에 적혀 있다.
- 연동을 켜기로 하면: CI `verify`에서 `components/today`의 Story `play`가 실행되고, 로컬 `npx vitest run`은 지금처럼 그린이다.

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
> Workflow 완료 알림 `<usage>`(전체 토큰·소요·에이전트 수·도구 호출)와 결과의 `tokenUsage`
> (출력 토큰)로 채운다. 재작업이 있으면 실행 행을 추가한다(사유는 「주요 의사결정」에 적는다).
> `scripts/ticket-metrics.mjs`가 이 고정 헤더로 티켓을 찾아 집계하므로 헤더는 글자 단위로
> 그대로 쓴다.

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
