---
id: "20261008_1356"
category: Infra
priority: P3
status: OPEN
created: 2026-10-08
---

# [Infra] poi_drops 읽기 정책이 로그인 유저에게 드랍자·픽업자 id를 그대로 공개한다

## 핵심 요약
- 요구사항: API가 의도적으로 숨기는 `poi_drops.dropper_user_id`·`picked_up_by`를 로그인 유저가 브라우저 클라이언트의 직접 조회로 읽지 못하게 한다.
- 구현 계획: (미정 — 착수 시 작성) 브라우저 클라이언트로 `poi_drops`를 직접 읽는 곳이 있는지 먼저 확인한다. 없으면 SELECT 정책을 좁히거나 열 권한을 조정하는 마이그레이션을 쓴다(DB 변경은 사용자 승인 후 카리나가 실행).
- 관련 파일: `jam-web/supabase/migrations/004_phase7_user_drops.sql` L26-27(`"poi_drops: 인증 유저 읽기" ... TO authenticated USING (TRUE)`) / 숨기는 쪽 API: `jam-web/src/app/api/drops/[dropId]/route.ts` L61-64, `jam-web/src/app/api/drops/poi/[poiId]/route.ts` L85

## 배경 / 문제 정의

### 확인한 사실 (2026-10-08 13:50경 KST, 읽기 전용 SQL과 코드 읽기)
- 운영 DB `pg_policies`: `poi_drops`의 `"poi_drops: 인증 유저 읽기"`는 `cmd=SELECT`, `roles={authenticated}`, `qual=true`다.
- 드랍 API는 응답에 `dropper_name`·`is_own`만 담고 드랍자 id는 내보내지 않는다.
- 티켓 20261008_1349(Strava OAuth state) 조사 중 유저 UUID 노출 경로로 발견했다.

### 판단
- 로그인 유저는 anon 키와 자기 세션으로 PostgREST를 직접 호출해 모든 드랍(과거 포함)의 드랍자·픽업자 id를 읽을 수 있다. API의 숨김 장치가 무력해진다(확신도 높음, 직접 호출은 해 보지 않음).
- 노출되는 것은 유저 id와 드랍·픽업 관계다. **위험도: 참고, 확신도 보통**(드랍 위치가 원래 공개 POI 기준이라 추가 노출 범위가 크지 않다고 본다).

## 완료 조건
- (착수 시 구체화) 로그인 유저 세션으로 `poi_drops`를 직접 select해도 다른 유저의 `dropper_user_id`·`picked_up_by`가 나오지 않는다.
- 드랍 지도·픽업·인벤토리 이력 화면이 그대로 동작한다.
