# JAM! 서비스 운영 문서 — 변경분 (2026-07-22 23:08)

> **이 버전의 변경 내용:** 배지 발급 근거(조건/실측값/트리거 활동)를 어드민 전용으로 기록·조회하는 기능 추가. 일반 유저에게는 노출되지 않음.  
> 이전 버전: SERVICE_OPERATIONS_20260722_1617.md

---

## [신규] 배지 발급 근거 기록 (어드민 전용)

**배경**: 유저가 "왜 이 배지가 발급됐는지/왜 안 됐는지" 문의했을 때, 기존엔 `triggered_by_activity_name`/`distance_km`/`activity_date` 정도만 남아있어 실제 판정 근거(예: 속도 조건이었다면 실측 속도가 얼마였는지)를 확인할 방법이 없었다. 실제로 이번에 한 유저의 사례를 조사하며 원본 GPX를 직접 파싱해서 검증해야 했던 것이 계기.

**관련 파일:** `src/lib/badge-engine/index.ts`, `src/types/database.ts`, `supabase/migrations/042_badge_condition_snapshot.sql`, `src/app/admin/users/[id]/page.tsx`(신규)

### 엔진 변경

- `evaluateConditionDetailed()`: 기존엔 조건이 실패했을 때만 `actual`/`required` 값을 채워 반환했음(통과 시엔 빈 문자열). 이제 각 조건 필드(거리/속도/고도/시간 등)를 통과할 때도 실측값을 `actualParts`/`requiredParts` 배열에 누적해서, 최종 통과 시 `{actual: "거리: 10.5km, 속도: 11.7km/h", required: "..."}`처럼 사람이 읽을 수 있는 판정 근거를 반환하도록 확장. 실패 시 조기 반환 동작(기존 테스트가 검증하는 형식)은 그대로 유지.
- `evaluateBadgesDetailed()`: 배지 발급 시 `condition_snapshot`(JSONB)을 함께 저장 — 발급 시점의 `condition_json` 원본, 위 `actual`/`required`/`reason`, 트리거가 된 활동의 요약(거리/이동시간/고도/평속/날짜/Strava ID)을 묶은 스냅샷.

### DB 변경 (마이그레이션 042)

`user_activity_badges.condition_snapshot JSONB` 컬럼 추가. 컬럼 코멘트에 "어드민 전용, 일반 유저 노출 금지" 명시. GPS 경로 매칭(POI) 기반 발급은 조건 평가 자체가 없어 이 필드는 null로 남음(기존 `triggered_by_poi_id`가 그 경로를 이미 기록).

### 어드민 UI

- `src/app/admin/users/[id]/page.tsx` (신규): 어드민 유저 목록(`/admin/users`)의 유저명을 클릭하면 진입. 해당 유저가 발급받은 배지 전체를 발급일 역순으로 나열하고, 각 행에 발급 경로(`triggered_by`)·실측값(`condition_snapshot.actual`/`.required`)·트리거 활동 요약을 함께 표시.
- **일반 유저 화면(배지 상세, 프로필 등)에는 이 필드를 노출하지 않음** — 관련 컴포넌트 어디에도 `condition_snapshot`을 렌더링하지 않도록 확인.

### 알려진 한계

- 마이그레이션 042 적용 이전에 발급된 배지는 `condition_snapshot`이 null — 소급 채움은 하지 않음.
- POI GPS 매칭으로 발급된 배지는 조건 평가 자체가 없어 스냅샷이 항상 null (기존 `triggered_by_poi_id`로 대체 확인).

---

기타 섹션은 이전 버전(SERVICE_OPERATIONS_20260722_1617.md)과 동일. §16 DB 테이블 목록의 `user_activity_badges` 컬럼 설명에 `condition_snapshot` 추가 필요.
