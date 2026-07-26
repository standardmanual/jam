# 진행 상황

## 2026-07-26 — phase15-lead: Step A~G 전체 완료 (커밋 대기 중 → 아래 최종 기록 참조)
- **Step A** ✅ `supabase/migrations/048_today_cards.sql`(다음 번호 048 실물 확인). `database.ts`에 `TodayCardRow`/`TodayCardTemplateType` + Database.Tables.today_cards 등록. `TabBar.tsx` 라벨 '홈'→'투데이'. **DDL은 실행 불가**(아래 참조) — 마이그레이션 파일만 준비, 유저가 SQL Editor 실행 필요.
- **Step B** ✅ `src/lib/today/exposure.ts`(computeUserExposureTags, KST 시간대, 미션/아이템북 존재쿼리), `src/lib/today/cards.ts`(getTodayCards + resolveTargetHref + getPublishedArticleCard). 유닛테스트 `__tests__/today-logic.test.ts` **16/16 통과**(tsx).
- **Step C** ✅ `TodayCardStack.tsx`(신규, 템플릿별 칩/링크, 0개면 미노출) + `page.tsx` 유저검색 아래·최근배지 위에 삽입. 기존 섹션 전부 유지.
- **Step D** ✅ `today/[cardId]/page.tsx` — editorial 전용, 빈줄 문단분리 렌더링, getPublishedArticleCard로 기간밖/비활성/타템플릿 → notFound.
- **Step E** ✅ `admin/today/page.tsx` + `TodayCardList.tsx`(7템플릿 동적폼, 배지 다중선택·미션/북 셀렉트·태그 체크·예약일시). API `api/admin/today/route.ts`(GET/POST), `[id]/route.ts`(PATCH/DELETE). AdminNav에 진입 추가.
- **Step F** ✅ `supabase/seed_phase15_today_cards_20.sql` 20개(분포 5/3/3/2/2/2/3, 전 ends_at=2026-12-30 23:59:59+09, #5·#8·#18 예약발행). 이름 서브쿼리 참조. **DB 삽입은 테이블 생성 후 가능**(테이블 없어 아직 미삽입).
- **Step G** ✅ `npx tsc --noEmit` 프로덕션 0 에러(pre-existing 테스트러너 292 유지). SERVICE_OPERATIONS_20260726_1028.md 생성.
- **DDL 블로커**: Management API 401(PAT 없음)/exec RPC 404/pg 미설치·DB비번 없음 → CREATE TABLE 실행 불가. 048 마이그레이션 + seed SQL 파일만 정확히 준비. 유저가 Supabase SQL Editor에서 048 → seed 순으로 실행하면 20개 노출됨. (DEAD_ENDS 상세 기록)

## 2026-07-26 — 메인세션: phase15-today 팀 초기화
- 상태: 완료
- 작업: TEAM_PLAN.md 갱신, phase15-lead 에이전트 스폰 준비
- 결과: 팀 구성 확정 (팀장 겸 실행 1명, DB 직접 적용 + 샘플 20개까지 전담)
- 다음: phase15-lead 스폰

## 2026-07-25 — phase14-lead: 착수
- PRD 4종 + 공유메모리 3종 정독 완료
- 코드 확인 완료: inventory/page.tsx(인라인 3열 그리드), DropsClient.tsx(모드탭+카드지도+select_item스텝), drops/page.tsx, api/drops/poi/[poiId](배열반환), api/inventory/items(플랫 shape), badges/[id]/page.tsx(상세 레이아웃), MapView.tsx(마커색 로직), Badge.tsx(RarityBadge), Button.tsx
- 핵심 판단: `/api/inventory/items`는 플랫 shape `{id,badge_name,badge_rarity,badge_image_url}`, inventory/page는 `InventoryItemRow&{badge}` — 두 소스 shape 상이 → InventoryGrid는 정규화 타입 `InventoryGridItem`으로 받도록 설계(PRD의 `items: InventoryItemRow[]` 의도는 "재사용 그리드", 실제 API shape 존중해 정규화). API 변경 없음.
## 2026-07-25 — phase14-lead: Step A~F 전체 완료 (커밋 1178ee7)
- **Step A** ✅ `src/components/inventory/InventoryGrid.tsx` 신규 — 정규화 타입 `InventoryGridItem`, mode navigate/select, emptySlots/selectedItemId prop. `/inventory/page.tsx`가 이를 mode="navigate"로 사용(슬롯바·만료임박·빈슬롯·희귀도배경 전부 유지, 회귀 없음). Image/LocalDate/rarityCardBg/isExpiringSoon 인라인 제거.
- **Step B** ✅ DropsClient 헤더 타이틀·모드탭(mode state) 완전 제거, 지도 `absolute inset-0` 풀스크린(카드 래퍼 제거). 로딩/안내는 지도 위 오버레이로.
- **Step C** ✅ POI 클릭 → `GET /api/drops/poi/[poiId]` 먼저 호출 → `drops.length===0` 드랍 / `>0` 픽업 분기. 인벤토리 로드는 [드랍] 이후 지연.
- **Step D** ✅ 드랍: [여기에 드랍하기] → InventoryGrid(select) → 인앱 확인 카드([취소]/[드랍하기] 2버튼, 네이티브 confirm 미사용) → POST /api/drops → 성공 시 POI 재조회로 방금 드랍 배지 노출(픽업 상태 전환).
- **Step E** ✅ 픽업: `src/app/(main)/drops/BadgeDetailSheet.tsx` 신규(/badges/[id] 스타일 오버레이, 페이지 이동 아님) → [픽업하기] → POST /api/drops/[dropId]/pickup → 성공 시 목록서 제거, 남으면 유지·없으면 드랍상태 복귀. 다중 배지 순차 픽업 지원.
- **Step F** ✅ `npx tsc --noEmit` 프로덕션 코드 0 에러(기존 __tests__ 292 pre-existing). commit 1178ee7 + push origin main 완료. SERVICE_OPERATIONS_20260725_1856.md 생성.
- 참고: DropsClient의 geolocation/loadNearbyPois useEffect 2건 `react-hooks/set-state-in-effect` lint 에러는 **원본 커밋에도 동일하게 존재하던 pre-existing**(git show로 확인, 2건 동일). 내 회귀 아님, 커밋훅 없음. 스코프 밖이라 미수정.
- 직접 실행(하위 에이전트 위임 없음) — Step D/E가 DropsClient 상태와 강결합이라 파일 충돌 회피 위해 순차 처리.

## 2026-07-25 — 메인세션: phase14-dropmenu 팀 초기화
- 상태: 완료
- 작업: TEAM_PLAN.md 갱신, phase14-lead 에이전트 스폰 준비
- 결과: 팀 구성 확정 (팀장 겸 실행 1명, Step C 완료 후 D/E만 필요시 하위 위임)
- 다음: phase14-lead 스폰

## 2026-07-24 — 메인세션: phase13-mission 팀 초기화
- 상태: 완료
- 작업: TEAM_PLAN.md 작성, phase13-lead 에이전트 스폰 준비
- 결과: 팀 구성 확정 (팀장 겸 실행 1명, 필요 시 독립 파일 작업만 하위 위임)
- 다음: phase13-lead 스폰

## 2026-07-24 — phase13-lead: 착수
- PRD 3종 + 공유메모리 3종 정독 완료
- 코드베이스 확인 완료: checker.ts, join/route.ts, MissionDetailClient.tsx, database.ts(MissionRow/MissionCondition/BadgeRow/InventoryItemRow/PointReason), points/index.ts, activity-feed/index.ts, badge-engine(배지 발급 패턴), drop/pickup.ts(인벤토리 지급 패턴), admin/missions(page/MissionList/route)
- 확인 사항:
  - 마이그레이션 최신 번호 = 045 (045 두 개 존재: poi_search_cache_empty_ttl, point_system) → **다음은 046**
  - 배지 지급 테이블: activity배지=`user_activity_badges`, item배지=`inventory`(슬롯) + `inventory_items`
  - `awardPoints(userId, amount, reason, {sourceBadgeId|sourceMissionId})` — PointReason에 'badge_point_reward','mission_point_reward' 이미 존재
  - BadgeType = 'activity'|'item', ItemObtainedBy 에 'system_event' 존재
  - 어드민 미션 편집 route 없음 (POST 생성 / DELETE만) → 폼은 생성 폼에 신규 필드 추가
  - poi_visit 방문 판정: user_activity_badges.triggered_by_poi_id 로 매칭
- 진행중: Step A (참가 게이트 + 취소 제거)

## 2026-07-24 — phase13-lead: Step A~F 전체 완료
- **Step A** ✅ checker.ts 참가 게이트(`evaluateMission` 순수함수 분리), join/route.ts DELETE 제거, MissionDetailClient 취소버튼·handleCancel 제거+참가 confirm, 유닛테스트 8케이스(`__tests__/checker-logic.test.ts`, node assert, tsx로 8/8 통과)
- **Step B** ✅ poi_visit/item_collect 진행률(loadOwnership: user_activity_badges.triggered_by_poi_id / inventory_items.badge_id), getTarget=1, 상세화면 달성/미달성 배지 표시
- **Step C** ✅ 마이그레이션 046(status_display_type/visible_rank_count/reward_badge_ids + 단일보상 이관 + reward_type NOT NULL 제거), GET /api/missions/[id]/status(랭킹형/달성형 분기, 정렬·slice·me 별도)
- **Step D** ✅ 미션 상황 화면(status/page.tsx + MissionStatusClient.tsx, 미참가 리다이렉트), 상세화면 "미션 상황 보기" 메뉴, 어드민 status_display_type/visible_rank_count 필드
- **Step E** ✅ rewards.ts(grantMissionRewards 타입별 지급+중복스킵+배지포인트+미션포인트), checker 연동, FeedEventMeta.mission_completed 확장, 어드민 배지 검색·복수선택+총지급포인트 미리보기, 홈/프로필 피드 결과요약+보상배지+포인트 렌더
- **Step F** ✅ tsc --noEmit: 프로덕션 코드 0 에러(기존 __tests__ 292개는 describe/it/expect 러너 미설치로 인한 pre-existing, 내 test는 0 추가). SERVICE_OPERATIONS_20260724_1805.md 생성. 커밋+푸시 진행.
- 직접 실행(하위 에이전트 위임 없이 순차 처리) — 파일 충돌 위험 회피
