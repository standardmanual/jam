# JAM! 서비스 운영 문서 — 변경분 (2026-07-31 02:41)

> **이 버전의 변경 내용:** 러닝(road_running) 카테고리 속도 조건 배지 2종("리듬의 발견", "스피드 엔듀러", 총 8개 티어)을 km/h(속도) → 분:초/km(페이스) 단위로 전환. 트레일러닝·걷기 카테고리에는 애초에 속도 조건 배지가 없어 전환 대상 없음.
> 이전 버전: SERVICE_OPERATIONS_20260731_0220.md

---

## [정책 변경] 러닝 속도 조건 배지를 km/h → 페이스(분:초/km) 단위로 전환

**배경**: 러닝·트레일러닝·걷기 종목에서 유저가 실제로 체감·사용하는 속도 단위는 km/h가 아니라 페이스(1km를 달리는 데 걸리는 시간, 예: 5:30/km)다. 기존 배지 조건·설명문은 km/h로 표기돼 있어 종목 관행과 어긋났음.

**대상 확인**: 조사 결과 속도 조건이 있는 배지는 러닝(road_running) 카테고리의 "리듬의 발견"(R2), "스피드 엔듀러"(R7) 2종(4티어씩 총 8개)뿐. 트레일러닝·걷기 카테고리에는 속도 조건 배지가 처음부터 존재하지 않아 전환 대상 없음. (cycling의 "페달의 리듬"(C2), "산악 라이더"(C7)도 속도 조건을 쓰지만 러닝 계열이 아니므로 이번 전환에서 제외, km/h 유지)

**단위 전환값** (km/h → 페이스, 임계값은 러너 기준 깔끔한 30초 단위로 반올림):

| 배지 | 등급 | 기존 (km/h) | 변경 후 (페이스) |
|---|---|---|---|
| 리듬의 발견 | Common | 7.0 | 8:30/km (510초) |
| 리듬의 발견 | Rare | 9.0 | 6:30/km (390초) |
| 리듬의 발견 | Legendary | 11.0 | 5:30/km (330초) |
| 리듬의 발견 | Mythic | 13.0 | 4:30/km (270초) |
| 스피드 엔듀러 | Common | 8.0 (+30분) | 7:30/km (450초, +30분 유지) |
| 스피드 엔듀러 | Rare | 9.0 (+45분) | 6:30/km (390초, +45분 유지) |
| 스피드 엔듀러 | Legendary | 11.0 (+60분) | 5:30/km (330초, +60분 유지) |
| 스피드 엔듀러 | Mythic | 13.0 (+90분) | 4:30/km (270초, +90분 유지) |

**엔진 변경**: `condition_json`에 `min_speed_kmh` 대신 새 필드 `max_pace_sec_per_km`(초/km, 값이 작을수록 빠름 — km/h와 부등호 방향 반대) 도입. 배지 평가 엔진은 활동의 `averageSpeedKmh`를 그 자리에서 페이스(초/km)로 환산해 비교하므로, Strava 활동 저장 스키마 변경은 없음.

**관련 파일**:
- `src/types/strava.ts` (`kmhToPaceSecPerKm`, `formatPaceSecPerKm` 헬퍼 추가)
- `src/types/database.ts` (`BadgeCondition.max_pace_sec_per_km` 필드 추가)
- `src/lib/badge-engine/index.ts` (조건 평가·실패 사유·진행 트랙 판정에 페이스 필드 반영, 부등호 반대 방향 적용)
- `src/app/(main)/badges/[id]/page.tsx`, `src/app/admin/badges/page.tsx`, `src/app/admin/badges/BadgeForm.tsx` (페이스 표시 및 mm:ss 입력 폼 추가)
- `supabase/migrations/071_running_badges_pace_conversion.sql` (DB `condition_json`·`description` 갱신, jam-prod에 직접 적용 완료)
- `Service Plan/Specs/badge/BADGE_ENGINE_UNIFIED.md`, `Service Plan/Specs/badge/액티비티배지 레시피.md` (조건 필드·예시·설명문 갱신)

**참고**: 이미 발급된 유저의 `user_activity_badges.condition_snapshot`은 발급 당시 스냅샷이라 과거 km/h 기록 그대로 유지 — 소급 수정하지 않음. 앞으로의 평가부터만 페이스 기준 적용.
