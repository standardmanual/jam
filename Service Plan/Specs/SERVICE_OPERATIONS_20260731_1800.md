# JAM! 서비스 운영 문서 — 변경분 (2026-07-31 18:00)

> **이 버전의 변경 내용:** POI(장소) 배지를 배지함(`/badges`) 및 프로필 배지 갤러리에 노출. 배지함에 "장소" 탭 신설(산/대중교통 카테고리별 그룹핑), 프로필 배지 갤러리는 POI 배지의 반복 획득 이력 중 최초 획득만 "고유 배지 1개"로 표시.
> 이전 버전: SERVICE_OPERATIONS_20260731_1215.md

---

## [신규 기능] 배지함에 "장소"(POI) 탭 추가

**배경**: 산/지하철 등 방문해서 획득하는 POI 타입 배지(Phase 16 도입)가 지금까지 `/badges` 화면에서 "액티비티" 탭 목록에 구분 없이 섞여 있었음. 별도 탭으로 분리해 카테고리(산/대중교통)별로 묶어 보여주기로 함.

**변경 내용**:
- `/badges` 화면에 "액티비티" / **"장소"(신규)** / "아이템북" 3탭 구성으로 변경.
- 장소 탭은 `poi.category`(산=`mountain`, 대중교통=`transit` 등, `poi_categories` 테이블 관리) 기준으로 섹션을 나누고, 각 섹션 안에서는 획득한 배지가 먼저(최근 획득순), 미획득은 이름순으로 정렬.
- POI 배지는 반복 획득이 가능하므로 그리드 카드에 "×N" 형태로 획득 횟수를 함께 표시(1회면 표시 안 함). 상세 획득 이력(언제, 어느 POI에서)은 기존 배지 상세화면(`/badges/[id]`)의 획득 이력 리스트에서 확인.
- `poi_categories` 테이블은 RLS가 service role 전용(일반 유저 클라이언트로 SELECT 불가)이라, 이 조회만 `createServiceClient()`로 처리.

**관련 파일**: `src/app/(main)/badges/page.tsx`, `src/app/(main)/badges/BadgesClient.tsx`, `src/lib/i18n/ko.ts`.

---

## [신규 기능] 프로필 배지 갤러리에 POI 배지 연결

**배경**: 프로필의 "배지" 탭은 `user_activity_feed`의 `badge_earned` 이벤트를 그리드로 보여주는데, POI 배지 획득(`user_poi_badge_earns`)은 이 피드에 전혀 연결돼 있지 않아 POI 배지를 얻어도 프로필에 노출되지 않던 상태였음(코드 조사로 확인된 기존 공백, 이번에 처음 연결).

**설계 결정**: POI 배지는 반복 획득이 가능해, 활동 배지처럼 "이벤트 1건 = 그리드 1칸"으로 그대로 연결하면 자주 방문하는 장소 하나로 피드가 도배될 수 있음. **그리드는 항상 "고유 배지" 기준**으로 유지하기로 함 — 즉 POI 배지도 활동/아이템 배지와 동일하게 그리드엔 배지당 한 칸만 나타나고, 몇 번 획득했는지는 배지 상세화면에서 확인.

**변경 내용**:
1. `src/lib/strava/sync.ts` — POI 배지 지급 직전에 해당 유저가 이 배지를 이전에 획득한 적 있는지 확인(`user_poi_badge_earns` 조회). **최초 획득일 때만** `recordFeedEvent(userId, 'badge_earned', ...)`로 피드에 기록. 반복 방문(2회차 이후)은 `user_poi_badge_earns`에는 계속 쌓이지만 피드에는 추가되지 않음.
2. `src/app/(main)/[username]/page.tsx` — 이 로직 적용 이전에 이미 획득했던 POI 배지들을 위한 소급 처리(레거시 백필). `user_poi_badge_earns`를 오래된 순으로 조회해 배지별 첫 등장(최초 획득 시각)만 남기고, 이미 실시간 피드 이벤트가 있는 배지는 중복 방지. 프로필 상단 "배지" 통계 수치도 활동 배지 수 + POI 배지 고유 종류 수로 갱신.
3. `src/app/(main)/profile/ProfileClient.tsx` — 배지 갤러리 렌더링 시 `badge_id` 기준으로 한 번 더 방어적 중복 제거(서버 로직이 막고 있지만 이중 안전장치).

**검증**: 서비스 DB에 이미 존재하는 `user_poi_badge_earns` 실데이터로 배지 조인 쿼리(`badges(id,name,image_url,rarity,deleted_at)`)가 정상 동작함을 직접 조회로 확인.

**관련 파일**: `src/lib/strava/sync.ts`, `src/app/(main)/[username]/page.tsx`, `src/app/(main)/profile/ProfileClient.tsx`.

**비범위**: POI 배지 최초 획득 시 잼 포인트 지급(활동 배지처럼 `point_reward` 지급) — 이번 변경에는 포함하지 않음. 필요하면 별도 논의 후 추가.
