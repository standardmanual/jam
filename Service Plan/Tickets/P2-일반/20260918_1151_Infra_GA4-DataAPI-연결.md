---
id: 20260918_1151
category: Infra
priority: P2
status: WAITING
created: 2026-09-18
closed:
---

# [Infra] GA4 Data API 연결

## 핵심 요약
- 요구사항: 주간 브리핑의 성장·행동 지표를 GA4 Data API로 읽는 스크립트와 지표 정의를 만든다.
- 구현 계획: 서비스 계정으로 GA4 Data API를 호출하는 읽기 스크립트를 추가한다.
- 관련 파일: `scripts/` (새 스크립트), `GA4_EVENTS.md`
- 상위 티켓: [20260918_1101 에이전트 팀 운영 정비](../P1-중요/20260918_1101_Infra_에이전트팀-운영정비-상위.md)
- 선행 티켓: 없음
- 경로: ③ 표준 (infra 유형이라 채원 없이 아현→민지)

## 배경 / 문제 정의
주간 브리핑 지표 중 활성 유저·가입 퍼널·드랍·픽업·믹스·미션 참가는 이미 GA4에 계측되어 있다(상위 티켓 4-7).

## 상세 요구사항

### 서비스/코드베이스 관점
- 지표 목록과 각 지표의 GA4 이벤트·측정기준을 문서에 정의한다
- 스크립트는 지난 7일 값을 숫자로 출력한다. 개인 식별 정보는 다루지 않는다
- 키 파일이나 키 값은 저장소에 커밋하지 않는다. 환경변수로만 받는다
- 인증 실패 시 원인을 한 줄로 출력하고 실패 코드로 끝난다 (예약 작업이 부분 리포트를 만들 수 있게, 4-10)

## 구현 계획
GA4 Data API의 `runReport`를 사용한다. 공식 문서를 확인하고 구현한다.

## 사용자 작업
> Claude가 대신할 수 없는 일이다. 완료되면 이 절에 체크한다.

- [ ] GCP에서 서비스 계정을 만들고 키를 발급한다
- [ ] GA 관리 화면에서 그 서비스 계정에 **뷰어** 권한만 준다
- [ ] 키를 클라우드 예약 작업 환경에 등록한다

## 완료 조건
- 사용자가 권한을 준 뒤 로컬에서 스크립트를 실행하면 지표가 출력된다
- 키 환경변수가 없으면 원인 메시지와 함께 실패 코드로 끝난다
- 저장소에 키 관련 파일이 없다

---
## 완료 기록 *(2026-09-18 staging 머지, 키 발급·실측 대기로 WAITING)*

### 구현 내용 요약
- `scripts/ga4-weekly-metrics.mjs`: 서비스 계정 키(`GA4_SERVICE_ACCOUNT_KEY`)로 JWT를 서명해 액세스 토큰을 받고,
  GA4 Data API `runReport`로 지난 7일(`7daysAgo`~`yesterday`)의 `activeUsers`와 이벤트 6종
  (`sign_up_complete`·`onboarding_complete`·`item_drop`·`item_pickup`·`combine_success`·`mission_join`)을 숫자로만 출력한다
- 환경변수 누락·키 파싱 실패·토큰 발급 실패·`runReport` 실패를 각각 한 줄 메시지 + 종료 코드 1로 처리한다
- OAuth 범위는 `analytics.readonly`
- `GA4_EVENTS.md`에 "주간 브리핑 지표 정의" 절(지표-이벤트 매핑·인증 방식)을 추가했다

### 변경된 파일
```
scripts/ga4-weekly-metrics.mjs (신규)
scripts/ga4-weekly-metrics.test.mjs (신규)
Service Plan/Specs/PRD/Analytics/GA4_EVENTS.md
```

### 테스트 결과
- [x] `node scripts/ga4-weekly-metrics.test.mjs` 통과 (집계·누락 이벤트 0 처리·환경변수 누락 실패 경로)
- [x] 가짜 서비스 계정으로 Google OAuth 엔드포인트 왕복 확인 (`invalid_grant`로 흐름 도달 확인)
- [x] 저장소에 키 파일 없음
- [ ] 실제 키로 로컬 실행 시 지표 출력 (사용자 작업 완료 후)

### 배포 정보
- 배포일: 2026-09-18 (staging)
- 환경: staging (스크립트라 배포 영향 없음)
- 커밋: e0250b64 (머지 5bbdd234)

### 주요 의사결정 / 핵심 메모
- 게이트(민지): WARN — 코드 결함이 아니라 완료 조건 1개가 사용자 작업 대기로 미검증
- 토큰: 112,570 (2명·472초, 출력 아현 73,579 · 민지 18,301)

### 잔여 이슈
- 사용자 작업: GCP 서비스 계정·키 발급, GA 뷰어 권한 부여, 클라우드 환경 등록. 완료 후 1회 실행 검증
