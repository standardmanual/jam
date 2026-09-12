# 지점 (POI) 컨텐츠 관리

> 용어: 드랍·픽업·체크인이 일어나는 **지점** 정보를 다룬다. 지점에 체크인해서 획득하는
> 배지는 '체크인 배지'라 부른다(`Specs/UX_WRITING_GUIDELINE.md` 용어표). 코드·DB 식별자는
> `poi`를 그대로 유지한다 — 티켓 20260826_004 경계 규칙 2.

> **상태: 스텁 (미작성)** — 전용 컨텐츠 관리 문서가 없어 신설. 아래 소스를 기반으로 내용 채우기 필요.

## 데이터 소스 (현재 진실 소스)
- 스키마: `jam-web/supabase/migrations/001_initial_schema.sql` (`public.poi`)
- 카테고리 체계: `jam-web/supabase/migrations/050_poi_categories_table.sql`
- 검색 캐시: `jam-web/supabase/migrations/040_poi_search_cache.sql`
- 드랍/픽업 연동: `jam-web/supabase/migrations/004_phase7_user_drops.sql`
- 어뷰징 방지(POI 차단): `jam-web/supabase/migrations/010_abusing_policy.sql`
- 산 POI 일괄 등록: `scripts/import-mountains-poi.js` (산림청 공공데이터 연동)
- 지하철/기차역 POI 일괄 등록: `scripts/insert-stations-poi.js`
- 배지 이미지 자동 생성(재사용 프레임워크): `scripts/badge-image-gen/` — Figma 디자인 기반으로
  DB row(역명 등)마다 텍스트를 바꿔 배지 이미지를 대량 생성. 새 디자인은 `configs/*.config.js`
  하나만 추가하면 재사용됨. 사용법은 `scripts/badge-image-gen/README.md` 참고.
  (적용 이력: 지하철역 973개 `20260806_005_*`, 산 847개 + autoGrow 옵션 추가 `20260806_006_*`)
- 어드민 관리 화면: `jam-web/src/app/admin/poi/`
- 네이버 원본 분류 검증 게이트 + 어드민 검토 큐: `jam-web/supabase/migrations/143_poi_naver_category_review_gate.sql`, `jam-web/src/lib/poi/category-gate.ts`, 어드민 화면 `jam-web/src/app/admin/poi/review/`
- 자동수집 중단 데이터 변경([[20260907_1811]]): `jam-web/supabase/seed_20260907_poi_pipeline_linked_off.sql`
- 자동수집 재개 데이터 변경([[20260911_1310]]): `jam-web/supabase/seed_20260911_poi_pipeline_linked_on.sql`

## 티어 구조 (기존 티켓 참고)
- T2: OSM/네이버 지역검색 기반 자동 수집 (편의점/카페 등) — 2026-09-07 저녁 전면 중단
      ([[20260907_1811]])했다가 **2026-09-11 검토 큐 방식으로 재개**([[20260911_1310]]).
      아래 "신규 등록 정책" 참고.
- T3: 향후 확장 예정 (Phase 14, 미착수)
- 산·지하철역 등 특수 POI: 공공데이터 일괄 등록

## 신규 등록 정책 (2026-09-11 갱신)

**자동수집(T2, 네이버 지역검색 기반)은 검토 큐 방식으로 재개됐다** ([[20260911_1310]]).
`poi_categories.pipeline_linked`를 T2 연동 10개 카테고리(government/convenience/nature/
tourist_attraction/stadium/school/park/hospital/pharmacy/food) 전부 다시 `true`로
복원했다 — 자동수집 결과는 09-07 오전([[20260907_1242]])에 만든 네이버 원본 분류 검증
게이트를 거쳐 `pending_review=true`(검토대기)로 어드민 검토 큐에 쌓이고, 관리자가 승인·수정한
뒤 노출된다.

> ⚠️ **`requires_review`도 이번에 함께 `true`로 켰다.** 마이그레이션 143은 이 컬럼을
> `DEFAULT false`로 도입했고, 09-07 오전 티켓도 "기본 꺼짐, 지도 노출 카테고리 위주로 켜는
> 것을 권장"이라고 서술만 했을 뿐 실제로 켠 적이 없었다 — `pipeline_linked`만 복원하면
> `gatePois`(`jam-web/src/app/api/drops/route.ts` 66~78행)가 `requires_review=false`
> 분기를 타 검증 게이트를 아예 건너뛰고 전부 `verdict='approved'`로 즉시 노출/저장해버려
> 검토 큐가 비는 문제가 재발한다(2026-09-11 게이트 리뷰에서 실측 확인). 이번 복원 SQL
> (`seed_20260911_poi_pipeline_linked_on.sql`)은 `pipeline_linked`와 `requires_review`를
> 같은 UPDATE에서 함께 `true`로 세팅한다. `stadium`·`school`·`park`는
> `jam-web/src/lib/poi/category-gate.ts`에 allow/reject 패턴이 아직 없어 항상
> `pending`(검토대기)으로 떨어진다 — 자동승인되지 않는다는 뜻이며 의도된 안전한 기본값이다.

**경과**: 09-07 오전 검증 게이트/검토 큐 도입 → 같은 날 저녁 네이버 지역검색 API의 구조적
한계(좌표·반경 검색 미지원, 실제 최근접 매장 매치율 0~15%, "시청"·"국립공원"·"전망대"·
"시장"·"공원" 같은 포괄 명사 키워드로 인한 명칭 오염)를 이유로 자동수집 전면 중단
([[20260907_1811]]) → 2026-09-11 사용자 요청으로 오전 정책(자동수집 지속 + 검토 큐 대기)으로
복귀([[20260911_1310]]). **저녁 티켓이 지적한 네이버 API의 구조적 문제는 이번 복귀로
해결되지 않았고 재발 가능성이 있다** — 정책만 되돌린 상태다. 상세 실측·검토 근거는
[[20260907_1242]]·[[20260907_1811]]·[[20260911_1310]] 참고.

**검증 게이트·검토 큐 동작 (2026-09-11 저녁 버그 수정, [[20260911_1343]])**:
`jam-web/src/app/api/drops/route.ts`의 `searchAndPersistCategories`가 신규 수집 POI를
저장할 때 `pending_review=true`(검토대기)이면 카테고리의 `display_on_map` 값과 무관하게
항상 `is_active=false`로 저장한다 — 검토를 거치지 않은 POI가 지도에 노출되지 않도록 하는
불변식이다. `pending_review=false`(자동승인, 또는 애초에 `requires_review`가 꺼진
카테고리)일 때만 카테고리별 `display_on_map` 값을 그대로 `is_active`에 반영한다.
(수정 전에는 `is_active`가 `pending_review`와 무관하게 `display_on_map`만 따라, 검토대기
상태인데도 `display_on_map=true`인 카테고리(government/convenience/nature/school/
stadium/tourist_attraction)는 지도에 즉시 노출되는 버그가 있었다.)

검토 큐에 쌓인 항목은 두 경로로 노출시킬 수 있다:
- `/admin/poi/review`의 "승인" 버튼 — `pending_review`를 해제하면서, 배정될 카테고리의
  `display_on_map=true`이면 `is_active`도 함께 `true`로 활성화한다(false인 카테고리는
  원래도 비노출 정책이므로 `is_active=false` 유지).
- `/admin/poi/review`에서 이름을 눌러 `/admin/poi/[id]` 편집 화면으로 이동해 이름·좌표·
  반경·카테고리를 확인·수정한 뒤 활성화 스위치를 켜고 저장하는 방법(저장 시
  `is_active=true`이면 서버가 `pending_review`도 함께 `false`로 자동 해제한다).

**수동등록 흐름은 그대로 병행 유지된다**: `/admin/poi/new`에서 등록하면 클라이언트 입력과
무관하게 항상 **임시등록(비활성 `is_active=false` · 검토대기 `pending_review=true`)** 으로
저장돼 자동수집과 같은 검토 큐를 공유한다.

**기존 자동수집 POI는 이번 정책 전환들과 무관하게 유지된다** — poi_tier=2(599건, 09-07
재분류 완료)·mountain(847)·train_subway(967) 모두 지금 상태(활성/비활성) 그대로 두고, 일괄
재검토·재활성화 대상이 아니다. mountain·train_subway는 이번 자동수집 재개 대상에도 포함되지
않는다(마이그레이션 144에서 별도 사유로 `pipeline_linked=false` 전환, 09-07 저녁 정책과
무관).

## 채워야 할 내용
- [ ] POI 카테고리 전체 목록과 티어 분류 기준
      (운영 기준 표는 `Specs/PRD/02_DATA_MODEL.md`의 poi_categories 절에 정리됨.
       2026-08-24에 `transit`에서 기차·지하철역 929개를 `train_subway`로 분리 — [[20260824_023]])
- [ ] 카테고리별 드랍/픽업 파이프라인 연동 규칙 (키워드·가중치)
- [ ] 지역별 POI 밀도/커버리지 현황
- [ ] 신규 POI 소스 추가 시 체크리스트
- [ ] 네이버 원본 분류 검증 게이트·어드민 검토 큐 운영 가이드 ([[20260907_1242]]) —
      카테고리별 allow/reject 패턴 튜닝 기준, 검토 큐 처리 SOP
- [x] 카테고리 체계 재정리 ([[20260907_1243]]) — 마이그레이션 144 적용 완료(2026-09-07).
      14종으로 정리: government·convenience·tourist_attraction·nature·stadium·school·
      park·hospital·pharmacy·food·mountain·train_subway·route·unassigned. 삭제:
      transit(POI 16건)·other(POI 3건→unassigned 이관). 통합: bike_route+trail→route.
      키워드 구조가 `text[]`→`jsonb({keyword,scope})`로 전환돼 카테고리 내에서도 키워드별
      지역단위(동/구/시도) 지정 가능
- [ ] 기존 POI 599건 재분류 (산·기차지하철 제외) — 스크립트(`scripts/reclassify-poi-categories.ts`)
      작성 완료, 실제 반영은 미리보기 확인 후 별도 승인 필요
- [x] 카테고리 15번째 추가: `michelin`(미슐랭, 라벨 "미슐랭") — 마이그레이션
      `162_poi_category_michelin.sql`(2026-09-12, 티켓 [[20260912_0115]]). mountain·
      train_subway·route와 같은 수동 큐레이션 카테고리로 `pipeline_linked=false`·
      `requires_review=false`·`display_on_map=true`·`keywords=[]`. 미쉐린 가이드 서울
      3/2/1스타 레스토랑 42곳을 `seed_poi_michelin_seoul_2026.sql`로 등록(좌표는 구글맵
      검색 결과·사용자가 준 place 링크에서 추출). 신규 등록 정책대로 전부
      `is_active=false`·`pending_review=true`로 들어가 `/admin/poi/review` 승인이 필요하다.
- [ ] 미슐랭 POI 42곳 체크인 배지 연동·활성화 (2026-09-12, 티켓 [[20260912_1025]]) — mountain·
      train_subway와 동일한 1:1 체크인 배지(`type='checkin'`)로 편입하는 작업. 진행 상황:
      - [x] 체크인 배지 생성·`poi.linked_badge_id` 연결 SQL 실행 완료 —
        `supabase/migrations/164_michelin_checkin_badges.sql` (42/42/42 확인)
      - [x] `src/lib/poi/radius-policy.ts`에 `michelin: 50` 등록 완료
      - [x] 커스텀 배지 이미지 42개 생성 완료 — Figma(fileKey `UXcBEgFagmO5ARwH5F0mMW`,
        node `15:127`, 텍스트 레이어 `15:113` 'POI') 디자인을 배경 SVG로 조립해
        `scripts/badge-image-gen/configs/michelin-poi-badge.config.js`를 신규 작성하고
        `generate.js`로 42개 렌더링(256×256). 최장 상호명("가겐 by 최준호")·최단("빈호")
        양쪽 육안 확인 완료
      - [ ] POI 42곳 활성화 — `supabase/migrations/165_michelin_poi_activate.sql` 작성
        완료(실행 대기). **이미지가 프로덕션에 배포된 것을 확인한 뒤에만 실행할 것**
        ([[20260824_020]] 순서 원칙)

## 관련 문서
- [BadgeEngine/BADGE_ENGINE_UNIFIED.md](BADGE_ENGINE_UNIFIED.md) — POI 기반 배지 발급 로직
- 관련 티켓: `Tickets/20260726_006_*`, `20260727_001_*` (POI 일괄 등록 이력)
