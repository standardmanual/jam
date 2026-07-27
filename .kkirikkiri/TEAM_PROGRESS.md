# 진행 상황 (Phase 16)

## 2026-07-27 — 메인세션: 최종 완료
- dev1/dev2 diff 전량 리뷰 완료(스펙 일치, user_activity_badges 무변경 확인)
- eslint 신규 에러 4건(멀티라인 eslint-disable-next-line 위치 문제) 메인세션이 직접 수정
- tsc/eslint/next build 전부 통과, 실 DB 스모크테스트(반복발급 3건 + 동일활동 재처리 23505 차단) 확인
- 커밋 2f898f8(기능) + 2ec7167(SERVICE_OPERATIONS 문서), push 완료
- Vercel 배포 jam-ez0qhjnvc Ready, jam-rose.vercel.app alias 연결 확인

## 2026-07-27 — 메인세션: 팀 준비 완료
- DB 마이그레이션 052/053 유저가 직접 실행, service_role 키로 적용 확인 완료(user_poi_badge_earns 테이블 조회 성공, badges.type='poi' insert 성공).
- 이제 dev1(데이터/백엔드) 서브에이전트 실행 예정.
- [dev1] 작업 시작 — Step B/E 담당(types/database.ts, badge-engine, BadgeForm condPoiId 제거, strava/sync.ts, itembook/checker.ts, badges/[id]/page.tsx).
- [dev1] 완료. 수정 파일:
  - `src/types/database.ts` — BadgeType에 'poi' 추가, BadgeCondition.poi_id 제거, UserPoiBadgeEarnRow 신설, Database.Tables에 user_poi_badge_earns 추가
  - `src/lib/badge-engine/index.ts` — evaluateConditionDetailed의 poi_id 죽은 분기 제거 + PROGRESSION_MODIFIERS에서 'poi_id' 제거
  - `src/app/admin/badges/BadgeForm.tsx` — condPoiId state/입력필드/조건빌더 라인 제거 (그 외 무변경)
  - `src/app/admin/badges/page.tsx` — 조건 칩 `if (c.poi_id)` 1줄만 제거(타입 제거로 인한 tsc 에러 해소용. Dev2 페이지네이션 작업과 충돌 없음)
  - `src/lib/strava/sync.ts` — POI 매칭 결과 선수집 → linked_badge_id 일괄 조회(badgeById, N+1 방지) → type==='poi'면 user_poi_badge_earns에 매번 insert(보유체크 없음, 23505만 무시), 그 외는 기존 user_activity_badges 경로 그대로
  - `src/lib/itembook/checker.ts` — badges 조회 `.in('type',['item','poi'])`, poi 배지는 user_poi_badge_earns distinct 존재 여부로 채움 카운트(중복 미가산), total/slotted 합산 골격 유지
  - `src/app/(main)/badges/[id]/page.tsx` — poi 타입은 user_poi_badge_earns + poi 조인 earned_at desc 전체 조회 → "획득 이력" 리스트 렌더링, hasEarned 도입(그 외 타입 기존 UI 무변경)
  - tsc: 수정 파일 관련 에러 0 (테스트 파일 describe/it, .next/types 중복 정의는 기존 이슈)
  - user_activity_badges 스키마/기존 쿼리 무변경 확인
- [dev2] 작업 시작 — Step C/D 담당(admin poi search API, badges poi-links API, BadgeForm poi UI, badges API condition_json null, badges 목록 페이지네이션, itembooks 상세 poi 배지 표시).
- [dev2] 완료. 생성 파일:
  - `src/app/api/admin/poi/search/route.ts` — GET ?query=, getAdminUser 인증, poi 테이블 name ILIKE 검색 최대 20건(id,name,category,lat,lng,radius_meters,linked_badge_id). PostgREST 필터 깨뜨리는 문자(`,()%_*\`) 제거 후 질의.
  - `src/app/api/admin/badges/[id]/poi-links/route.ts` — GET(이 배지에 연결된 poi 전체), PUT({poi_ids})로 통째 교체(제거분 linked_badge_id=null → 새 목록 linked_badge_id=badgeId, 2단계 UPDATE).
  수정 파일:
  - `src/app/admin/badges/BadgeForm.tsx` — BADGE_TYPES에 'poi' 추가, type==='poi'면 조건 빌더 섹션 숨김 + "연결된 POI" 섹션(검색/추가/제거, 다른 배지 연결 경고) 노출, isEdit이면 GET poi-links로 초기값 로드, 저장 시 배지 저장 후 PUT poi-links 호출 후 router.push, poi 타입은 condition_json null 전송.
  - `src/app/api/admin/badges/route.ts`, `[id]/route.ts` — type==='poi'면 condition_json 강제 null.
  - `src/app/admin/badges/page.tsx` — 서버사이드 필터/정렬 + count:'exact' + range(30개/페이지), 하단 Pagination(basePath="/admin/badges") 추가.
  - `src/app/admin/poi/Pagination.tsx` — 재사용을 위해 optional `basePath`(기본 '/admin/poi') prop만 추가. POI 화면 동작 무변경.
  - `src/app/admin/badges/BadgesFilterBar.tsx` — 타입 필터에 POI 옵션 추가, 필터 변경 시 page 파라미터 초기화.
  - `src/app/(main)/itembooks/[id]/page.tsx` — 소속 배지 조회 `.in('type',['item','poi'])`, item은 기존 SlotGrid 그대로, poi는 user_poi_badge_earns 획득 여부만 표시하는 별도 섹션 추가. 진행도 total/slotted에 poi 배지 반영(checker.ts 판정과 일치).
  - tsc: 수정/생성 파일 관련 에러 0(테스트 파일 describe/it, .next/types 중복 정의는 기존 이슈). eslint도 clean.
  - dev1 담당 파일(types/database.ts, badge-engine, strava/sync.ts, itembook/checker.ts, badges/[id]/page.tsx) 및 user_activity_badges 무변경.
- [test] 작업 시작 — POI 배지 반복 획득 로직 + 아이템북 poi 완성 판정 로직 순수함수 유닛테스트 작성(jam-web/scripts/test-poi-badge-repeat.js, test-itembook-poi-completion.js, node:assert 기반).
- [test] 완료. 신규 파일 2개(둘 다 node:assert 기반, jest/vitest 미설치 확인 후 순수 Node 스크립트로 작성 — 기존 conditions.test.ts의 describe/it 패턴은 실행 불가 죽은 코드라 반복하지 않음):
  - `jam-web/scripts/test-poi-badge-repeat.js` — user_poi_badge_earns UNIQUE(user_id, badge_id, poi_id, triggered_by_strava_id) 제약을 인메모리 mock으로 재현. 5개 시나리오(다른 POI 반복 발급, 같은 POI 다른 활동ID 반복 발급, 동일 활동 재동기화 idempotency, 반복+idempotency 동시 검증, 유저간 독립성) 총 11개 assert 통과.
  - `jam-web/scripts/test-itembook-poi-completion.js` — checker.ts의 total/slotted 카운팅(item=슬롯 수, poi=distinct badge_id 보유 여부)을 순수 함수로 재현. 5개 시나리오(아이템만 채움 미완성, POI 획득 시 완성, POI 단독 북, POI 3회 중복 획득해도 완성 판정 미가산, 기완성 북 재포함 안됨) 총 7개 assert 통과.
  - 실행 확인: `cd jam-web && node scripts/test-poi-badge-repeat.js && node scripts/test-itembook-poi-completion.js` — 둘 다 정상 종료, 각각 "PASS — 총 N개 검증 케이스 통과" 로그 출력.
  - `src/lib/*` 등 기존 소스 파일은 무변경.
