# 팀 작업 계획

- 팀명: kkirikkiri-dev-0720-badge-impl
- 목표: PRD/badge/액티비티배지 레시피.md 새 배지 체계 서비스 구현
- 생성 시각: 2026-07-20
- 작업 순서: 엔진 → 어드민 → UI
- 테스트: 핵심 로직 단위 테스트 포함

## 팀 구성
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| lead | 팀장 | Opus | 아키텍처 설계·태스크 분배·코드 리뷰·통합 판단 |
| dev-engine | 엔진 개발자 | Opus | 드랍엔진 점검 + 배지엔진 신규 condition 패턴 지원 확인 |
| dev-admin | 어드민 개발자 | Opus | 배지 어드민 생성/수정 UI + 조건 입력 항목 전면 검토 |
| dev-ui | UI 개발자 | Opus | 어드민·유저 서비스 데이터·화면 새 배지 체계 반영 |
| tester | 검증자 | Sonnet | 엔진·로직 변경 부분 단위 테스트 작성 |

## 태스크 목록
- [ ] T1: 드랍엔진 조건 평가 점검 — 신규 condition_json 패턴 호환성 확인 → dev-engine
- [ ] T2: 배지엔진 신규 조건 지원 확인 — monthly_km, weekend_duration_hours, season+season_count, time_range+weekly_count, 복합 속성 → dev-engine
- [ ] T3: 배지 어드민 생성/수정 폼 전면 검토 및 수정 → dev-admin
- [ ] T4: 어드민 배지 조건 입력 항목 UI 업데이트 (신규 condition 타입 지원) → dev-admin
- [ ] T5: 어드민 배지 목록/상세 UI — 새 배지 체계 반영 → dev-ui
- [ ] T6: 유저 서비스 배지 관련 데이터/UI — 새 배지 체계 반영 → dev-ui
- [ ] T7: 엔진 변경 부분 단위 테스트 작성 → tester

## 범위 제외
- 배지 데이터 전체 업로드 (condition_json, 이름, 설명 업로드) — 나중에 별도 작업
- SQL 마이그레이션 작성

## 핵심 파일 위치
- 배지 레시피: PRD/badge/액티비티배지 레시피.md
- 배지 정책: PRD/badge/BADGE_POLICY_V3.md
- 배지엔진: jam-web/src/lib/badge-engine/index.ts
- 드랍엔진: jam-web/src/lib/drop-engine/index.ts
- 어드민 lib: jam-web/src/lib/admin/
- API 라우트: jam-web/src/app/api/
- 어드민 페이지: (dev-engine이 탐색하여 TEAM_FINDINGS에 기록)
- 유저 배지 관련 페이지: (dev-ui가 탐색하여 TEAM_FINDINGS에 기록)

## 주요 결정사항 (팀장 아키텍처 리뷰 확정 — 2026-07-20)

### 경로
- 어드민 배지 생성/수정 폼: `jam-web/src/app/admin/badges/BadgeForm.tsx`
- 어드민 배지 목록: `jam-web/src/app/admin/badges/page.tsx`
- 어드민 배지 API: `jam-web/src/app/api/admin/badges/route.ts` (+ `[id]/route.ts`)
- 유저 배지 목록: `jam-web/src/app/(main)/badges/BadgesClient.tsx`
- 유저 배지 상세: `jam-web/src/app/(main)/badges/[id]/page.tsx` (`formatConditionText`)

### 어드민 condition_json 입력 UI 현재 방식
- BadgeForm.tsx가 필드별 개별 input을 두고 `buildConditionJson()`으로 조립 → API는 condition_json을 통째로 pass-through(필드 검증 없음). 따라서 신규 필드는 API 수정 불필요, **폼 input만 추가하면 됨.**

### 확정 결정 (핵심)
1. **배지엔진: 코드 변경 불필요.** monthly_km / weekend_duration_hours / season+season_count / time_range / temperature_max_c / 복합 AND(R7·C7·H7·T7) 전부 `evaluateConditionDetailed`가 이미 지원. 복합 AND는 필드별 독립 평가 = 레시피의 "이력 전반 독립 평가"와 일치.
2. **드랍엔진: 코드 변경 불필요.** item 배지에 `checkCondition` 재사용 → 신규 조건 자동 처리. 기존 계획의 "monthly_km 드랍엔진 skip" 전제는 근거 없음. 검증만.
3. **어드민 폼: 실제 작업 필요 (dev-admin).** `time_range`(start/end)·`temperature_max_c`(+`temperature_min_c`) input 부재 → W5/W7/W8/T8, H5/H7/T5/T7 배지를 UI로 생성 불가. 두 입력을 BadgeForm + buildConditionJson에 추가.
4. **유저 상세: 실제 작업 필요 (dev-ui).** `formatConditionText`가 time_range·temperature 문구 미지원 → H5 등 온도-단일 배지가 "특별 발급" 폴백으로 오표기. 문구 추가.
5. **유저 목록(BadgesClient): 구조 변경 불필요.** 신규 배지는 시드되면 자동 노출.
6. **테스트: 신규 조건 커버리지 추가 (tester).** monthly_km / weekend_duration_hours / weekly_count / season+season_count / 복합 AND 독립평가 케이스.
7. **미결 설계 판단(제품 오너 확인 필요):** `time_range + weekly_count`(W7·W8·T8)에서 weekly_count가 time_range 윈도우로 제한되지 않고 전체 활동 기준 → 레시피의 "독립 평가" 문구와는 부합하나 "새벽 주 N회"의 의도보다 느슨. 엄격 의미를 원하면 엔진 수정 필요.
