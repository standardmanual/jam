# JAM! 서비스 운영 문서 — 변경분 (2026-07-31 18:35)

> **이 버전의 변경 내용:** 배지함 "장소" 탭에서 획득한 POI 배지가 안 보이던 max-rows 제한 문제 근본 해결(오늘 matcher.ts/`/api/drops`와 동일 원인 계열).
> 이전 버전: SERVICE_OPERATIONS_20260731_1800.md

---

## [버그 수정] 배지함 장소 탭 — poi 타입 배지 select('*') max-rows 누락

**증상**: sihyunrr@gmail.com 계정 등에서 실제로 획득한 POI 배지(남산, 서울숲역 4·5번출구 등)가 배지함 "장소" 탭에 표시되지 않음.

**원인**: `src/app/(main)/badges/page.tsx`가 `type='poi'` 배지 전체를 `supabase.from('badges').select('*').eq('type', 'poi').is('deleted_at', null)`로 통째로 조회하고 있었음. poi 타입 배지가 1,820개를 넘어 Supabase/PostgREST 기본 max-rows(1,000행) 제한에 걸려 뒤쪽에 있는 배지들이 응답에서 통째로 잘려나감 — 오늘 앞서 고친 `matcher.ts`(산 POI 매칭)와 `/api/drops`(드랍/픽업 지도)의 max-rows 누락과 동일한 원인 계열.

**수정**: 장소 탭은 어차피 "획득한 것만" 보여주는 화면이므로, poi 타입 배지 전체를 조회할 필요 자체가 없다는 점에 착안 — 이 유저가 실제로 획득한 배지 id(`user_poi_badge_earns`)만 먼저 뽑은 뒤, 그 id 목록으로만 `badges`/`poi`를 `.in('id', earnedPoiBadgeIds)` 조회하도록 변경. 조회 대상 자체가 유저별 소수 행으로 좁혀져 max-rows 제한에 걸릴 일이 구조적으로 없어짐(단순 bbox 필터링이 아니라 "필요한 조회 자체를 없애는" 방식의 근본 해결).

**관련 파일**: `src/app/(main)/badges/page.tsx`

**참고**: 오늘 하루 동안 poi/poi-badge 관련 select('*') max-rows 누락이 3건(산 POI 매칭 `matcher.ts`, 드랍/픽업 지도 `/api/drops`, 배지함 장소 탭 `badges/page.tsx`) 연달아 발견·수정됨. `poi`/`badges` 테이블 모두 계속 증가 중이므로, 앞으로 이 두 테이블(또는 대규모 테이블 전반)을 `select('*')`로 무제한 조회하는 코드가 남아있는지 전수 점검이 필요할 수 있음(별도 과제로 보류).
