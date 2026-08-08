# 팀 작업 계획

- 팀명: kkirikkiri-development-walking-badges-v4
- 목표: 새 걷기 액티비티 배지 체계(축1 진짜걷기 게이트, 하루1회 상한, W1~W8 유지, D01~D11 누적일수 체크포인트, T01~T18/T20/T22/T23 트로피 매트릭스 총 20종, 드랍엔진 걷기 계수)를 서비스 코드·DB·문서에 반영
- 생성 시각: 2026-08-08
- 실행 범위: 파일 작성 + git 커밋 + origin/main push까지 (사용자 승인됨)
- 테스트: 신규 조건 필드(day_of_week, active_days_count) 유닛 테스트 포함

## 참조 컨텍스트 (메인 세션 대화에서 확정된 설계)

### 축1 게이트 (모든 걷기 조건 평가 전처리, 초안값 — 정확값은 튜닝 대상이므로 상수로 분리해 구현)
- 최소 거리 ≥ 0.5km, 최소 이동시간 ≥ 10분, 평균속도 2.0~8.0km/h
- 미통과 활동은 걷기 배지 평가에서 완전 배제

### 빈도 조건 공통 규칙
- weekly_count/streak_days/day_of_week 조건은 하루 최대 1회만 카운트

### 기존 W1~W8
- 이름·설명·조건값 변경 없음. 축1 게이트 + 하루1회 상한만 적용

### 신규 필드
- `day_of_week`: time_range와 같은 방식으로 AND 결합되는 조건 필드
- `active_days_count`: 걷기 축1 통과일의 누적 고유일수(연속 아님, 하루 빠져도 안 깎임)

### 신규 배지 — D01~D11 (11개, 독립 배지, 성장티어 dedup 없음)
| ID | 이름 | 등급 | active_days_count |
|---|---|---|---|
| D01 | 첫 발자국 | Common | 3 |
| D02 | 일주일의 증인 | Common | 7 |
| D03 | 이주의 리듬 | Common | 14 |
| D04 | 한 달의 산책자 | Common | 30 |
| D05 | 두 달째 걷는 사람 | Rare | 60 |
| D06 | 백일의 걸음 | Rare | 100 |
| D07 | 반년의 동행 | Rare | 180 |
| D08 | 일 년의 발자취 | Legendary | 365 |
| D09 | 오백일의 산책자 | Legendary | 500 |
| D10 | 칠백일의 순례자 | Mythic | 700 |
| D11 | 천일의 방랑자 | Mythic | 1000 |

### 신규 배지 — 트로피 매트릭스 (20개, 조건 전문 공개, 성장티어 dedup 없음)
| ID | 이름 | 등급 | 조건 |
|---|---|---|---|
| T01 | 숫자의 노예 | Common | total_count: 100000 |
| T02 | 그냥 좀 걸었을 뿐 | Common | total_count: 1000 |
| T03 | 만보왕 | Rare | total_count: 10000 |
| T04 | 걸음의 구도자 | Legendary | total_count: 30000 |
| T05 | 주말의 신도 | Legendary | day_of_week: sunday, total_count: 1000 |
| T06 | 월요병 극복자 | Rare | day_of_week: monday, total_count: 500 |
| T07 | 불금은 없다 | Common | day_of_week: friday, total_count: 100 |
| T08 | 평일의 성실함 | Mythic | day_of_week: [mon,tue,wed,thu,fri] 각 total_count: 300 (5개 동시조건) |
| T09 | 일요일 새벽의 수도승 | Common | day_of_week: sunday, time_range: 05:00-08:00, total_count: 300 |
| T10 | 불타는 금요일 밤 산책 | Rare | day_of_week: friday, time_range: 22:00-05:00, total_count: 50 |
| T11 | 월요일 점심의 도피 | Rare | day_of_week: monday, time_range: 12:00-14:00, total_count: 200 |
| T12 | 폭염 속의 걸음 | Rare | temperature_min_c: 33, total_count: 5 |
| T13 | 영하 15도의 산책자 | Legendary | temperature_max_c: -15, total_count: 3 |
| T14 | 그냥 좀 더웠음 | Common | temperature_min_c: 30, total_count: 100 |
| T15 | 사계절의 발걸음 | Legendary | season_count: 4계절 각 10 (4개 동시조건) |
| T16 | 봄에만 걷는 사람 | Rare | season: spring, season_count: 200 |
| T17 | 겨울잠 안 자는 사람 | Common | season: winter, season_count: 100 |
| T18 | 1월의 다짐 | Common | month: 1, monthly_km: 100 |
| T20 | 장마철의 의지 | Legendary | month: [6,7], monthly_km: 150 |
| T22 | 하루종일 걸었다 | Rare | duration_minutes: 300 (단일) |
| T23 | 그냥 나갔다 옴 | Legendary | distance_km: 0.6 (단일) |

(T19, T21은 설계 단계에서 정합성 문제로 제외 확정됨 — 만들지 않음)

### 설명문 (세계관 10종 어휘 폭넓게 사용, 각 1회)
D01~D11, T01~T18/T20/T22/T23 전체 이름+설명 확정본은 이 대화의 직전 메시지 2개 참조. dev-core 에이전트 프롬프트에 전체 텍스트 포함시킴.

### 드랍엔진(아이템배지) 가중치
- 걷기 계수 ≈ 0.4 (MET 비례), 축1 통과 활동에만 적용, 확정 1개 드랍은 종목 무관 유지

### 환경 스캔 결과
- Codex CLI: 없음 (코드리뷰는 팀장이 직접)
- Gemini CLI: 있음 (0.28.2, 이번 작업엔 미사용 — UI/디자인 변경 없음)
- gh CLI: 있음
- 패키지 매니저: pnpm/npm
- 기존 마이그레이션 최신: 075_drop_legacy_drop_tables.sql → 신규는 076부터
- 배지 이미지 샘플: jam-web/public/badges/*.png 100개 존재 (placeholder 랜덤 선택용)
- 기존 배지 엔진 파일: jam-web/src/lib/badge-engine/index.ts, __tests__/conditions.test.ts, __tests__/new-conditions.test.ts

## 팀 구성
| 이름 | 역할 | 담당 업무 |
|------|------|----------|
| dev-core | 핵심 개발 | DB 마이그레이션(076), badge-engine 축1게이트+day_of_week+active_days_count 로직, drop-engine 걷기 계수 |
| dev-assist | 보조 개발 | 배지 이미지 placeholder 등록, 어드민 화면 노출 확인 |
| tester | 테스트 | day_of_week/active_days_count/축1게이트/하루상한 유닛 테스트 |
| docs-writer | 문서 | PRD/badge 컨텐츠 문서 갱신, Service Plan 문서 갱신, 오퍼레이션/티켓 문서 신규 생성, CLAUDE.md 규칙에 따른 SERVICE_OPERATIONS 신규 파일 |

## 실행 순서
1. dev-core 우선 실행 (다른 모두가 결과물에 의존)
2. dev-core 완료 후 dev-assist / tester / docs-writer 병렬 실행
3. 팀장(메인 세션)이 전체 검증 후 커밋 + push

## 주요 결정사항
- 트로피 매트릭스 실제 개수 정정: T01~T18(18) + T20/T22/T23(3) = 21개. 총 신규 배지 D11+T21 = 32개 (팀장이 앞서 "31개/20개"로 잘못 집계했던 것 정정, dev-core가 실제 목록 기준 전부 반영)
- dev-core가 기존 엔진 버그 2건 발견·수정: getProgressionKey 크로스배지 충돌, temperature+total_count 평가 누수. tester가 회귀 테스트로 커버
- 마이그레이션: 076(배지 32종 INSERT), 077(common_streak NUMERIC 확장, 걷기 소수 가중치 대응)
- dev-assist 역할 조정: 이미지 placeholder는 dev-core가 076에서 이미 처리함 → dev-assist는 대신 badges/[id] 상세 페이지의 조건 텍스트 포맷터(day_of_week/active_days_count/season_count_all 신규 필드 대응)와 어드민 배지 목록 노출 확인으로 범위 변경

## 검증 결과 (1라운드)
- 목표 달성도: PASS — 축1게이트/하루상한/D01~D11/트로피 32종/드랍엔진 계수 전부 구현·문서화·테스트 완료
- 완성도: PASS — 코드+DB+테스트+문서(운영/티켓/스펙) 전부 커버, 부수적으로 기존 버그 2건까지 수정
- 정확성: PASS — 팀장이 직접 tsc --noEmit(신규 파일 외 에러 0), vitest 110/110 통과, 마이그레이션 배지 개수(32) 직접 카운트로 재확인
- 일관성: PASS — 4개 팀원 산출물 간 모순 없음, docs-writer가 실제 경로(PRD→Service Plan 이동)를 스스로 발견해 올바르게 대응
- 종합 판정: 충분 — 커밋+push 진행
