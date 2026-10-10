-- 216: badges 인증 유저 SELECT 정책에 공개 조건 추가 (티켓 20261005_1151)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 머지 뒤 사용자 재승인을 받아 오케스트레이터(카리나)가 처리한다.
--    Supabase는 staging·프로덕션 공용 단일 DB라 실행 즉시 프로덕션에 반영된다.
--
-- 이유:
--   001의 정책 「badges: 전체 읽기 허용」은 `FOR SELECT TO authenticated USING (TRUE)`다. 그래서 로그인 유저가
--   공개 키와 자기 세션으로 PostgREST를 직접 불러 공개 전(`valid_from`이 미래) 활동 배지와, 비활성·공개 전
--   컬렉션 소속 아이템 배지의 이름·설명·이미지 주소·조건을 읽을 수 있었다. 운영툴이 예약 공개할 JAM! 배지와
--   컬렉션의 아이템 배지가 공개 전에 새어 나갈 수 있는 경로다. 215(item_books)는 컬렉션 행만 숨겼고 그 아이템 배지는
--   이 정책 때문에 여전히 보였다.
--
-- 변경 (티켓 「착수 전에 정한 것」 1·2, 조건 범위는 사용자 결정 「활동 배지 + 컬렉션만」):
--   정책을 없애지 않고 공개 조건을 더한다.
--     (type <> 'activity' OR valid_from IS NULL OR valid_from <= now())
--     AND (item_book_id IS NULL OR EXISTS (컬렉션이 is_active이고 valid_from이 비었거나 지금 이전))
--   1) 활동 배지(`type = 'activity'`, JAM! 배지 포함)는 공개 시각이 비었거나 지났을 때만 보인다.
--   2) 소속 컬렉션(`item_book_id`)이 있는 배지(지금은 아이템 배지뿐)는 그 컬렉션이 공개됐을 때만 보인다.
--      컬렉션 공개 조건은 215의 `item_books` 정책에 기대지 않고 서브쿼리에 직접 적는다(인증 유저로 평가하면 215 정책도
--      함께 걸리고 두 조건은 같다). PK 조회라 성능 영향은 작다.
--   3) 체크인 배지(`type = 'checkin'`)는 지금처럼 보인다. 공개 시각을 보지 않는 발급 경로와 엮지 않기 위해서다(아래 경계).
--   종료 시각(`valid_until`)과 소프트 삭제(`deleted_at`)는 넣지 않는다 — 종료된 배지는 이미 받은 유저에게 계속 보여야
--   하고, 세션 화면은 `deleted_at`을 쿼리·임베드에서 이미 거르므로 정책에 넣으면 공개 전 누출 차단이 아니라 회귀만 생긴다.
--
-- 정책 이름:
--   이름의 「전체」는 이 마이그레이션 이후 낡은 서술이다. 이름을 바꾸면 `ALTER POLICY ... RENAME TO`가 한 문장 더
--   들어가 되돌림도 두 문장이 되므로 이름은 그대로 둔다(215와 같은 결정).
--
-- 001 주석과의 관계:
--   001의 정책 정의(`USING (TRUE)`)와 그 위 주석 「배지 마스터는 전체 공개 읽기」는 이 마이그레이션 이후 낡은 서술이다.
--   001은 이미 적용된 옛 파일이라 고치지 않는다.
--
-- 영향 (2026-10-05 코드 조사와 라이브 DB 읽기 전용 조회, 기준 커밋 4e85560):
--   1) 사용자 세션 클라이언트로 badges를 읽는 곳은 9파일 15곳이다(`jam-web/src/` 기준).
--        app/(main)/badges/page.tsx 44–48(임베드 `badge:badges(*)`)·49–53·109–115·138·201
--        app/(main)/inventory/page.tsx 31–35(임베드)
--        app/(main)/badges/tree/page.tsx 54–61·145–148(임베드)
--        app/(main)/badges/[id]/page.tsx 86(`.single()` → `.maybeSingle()`로 이 티켓에서 바꿈)·268–272
--        app/(main)/collections/[id]/page.tsx 105–111
--        app/api/itembooks/route.ts 42–48·73
--        app/api/badges/[id]/share-data/route.ts 100(`.single()` → `.maybeSingle()`로 이 티켓에서 바꿈)
--        app/spike/badge-reveal/page.tsx 33–37(스파이크)
--      관리자 화면·API, 배지·드랍 엔진, 크론·알림 배치, 프로필(`[username]`)·조합·미션·드랍·인벤토리 API는 모두 service
--      클라이언트라 정책을 거치지 않는다. 브라우저 클라이언트·미들웨어·Realtime·사용자 세션 RPC는 badges를 읽지 않는다.
--      배지 공개 판정 함수는 앱에 없다(조회마다 직접 조건).
--   2) 라이브 DB: 정책은 「badges: 전체 읽기 허용」(`authenticated`, `qual = true`) 하나다. 다른 테이블 정책이 badges를
--      참조하지 않고, 뷰·구체화 뷰·Realtime 발행이 없다. badges를 읽는 함수는 `expire_stale_poi_drops`·
--      `slot_item_into_book`(SECURITY DEFINER)과 트리거 함수 `check_family_condition_consistency`(SECURITY INVOKER,
--      badges 쓰기 트리거 `badges_family_consistency` — 쓰기는 service라 정책 영향 없음)다. `type`은 NOT NULL 열거형이다.
--   3) 데이터: 배지 3,366개(삭제되지 않은 것 — 체크인 1,832·아이템 270·활동 634, 소프트 삭제 630). 공개 시각이 미래인
--      배지는 0개(`valid_from`이 있는 984개는 모두 과거), JAM! 카테고리 배지는 1개다. 소프트 삭제 630개는 모두 비활성
--      컬렉션 소속 아이템 배지이고, 인벤토리 222행·지점 드랍 144행이 이 배지를 가리킨다. 공개 전 컬렉션 소속 삭제되지
--      않은 배지와 그 획득·보유 기록은 0건이다.
--   4) 지금 데이터에서 세션 화면 결과가 바뀌지 않는 근거: 새로 숨겨지는 행은 소프트 삭제 630개뿐이고, 세션 조회 15곳은 모두
--      `deleted_at`을 쿼리에서 거르거나(`.is('deleted_at', null)`: badges/page.tsx 115·138·201, badges/tree/page.tsx 58,
--      badges/[id]/page.tsx 274, collections/[id]/page.tsx 110, api/itembooks/route.ts 48·73, spike/badge-reveal/page.tsx 36)
--      임베드가 null을 견딘다(`x.badge && !x.badge.deleted_at`: badges/page.tsx 82·99, inventory/page.tsx 51,
--      badges/tree/page.tsx 147·184). 임베드된 배지가 정책에 걸려 null이 돼도 같은 분기를 탄다.
--   - 컬럼·함수 변경이 없는 정책 교체라 확장→전환→축소로 나누지 않는다. `anon`은 이전에도 정책이 없어 읽을 수 없고,
--     쓰기 정책은 이전에도 없다. 이 파일은 두 가지를 바꾸지 않는다.
--   - 관리자 예외(정책에 관리자 조건)는 두지 않는다. 관리자 조회는 이미 service 클라이언트다.
--
-- 받아들이는 경계 (지금 데이터 0건, `docs/service/prd/02_DATA_MODEL.md` badges 절에 사실로 적는다):
--   (가) 공개 시각을 보지 않고 배지를 주는 경로로 공개 전 활동 배지를 먼저 받은 유저는 공개 시각까지 세션 화면에서 그
--        배지를 보지 못한다. 그런 경로는 체크인 배지 발급(`lib/strava/sync.ts` 771–812)·레거시 지점 연결 활동 배지
--        (900–925)·미션 보상(`lib/missions/rewards.ts` 44·124)·조합 보상(`lib/combine/index.ts` 402)·컬렉션 완성 보상
--        (`lib/itembook/checker.ts` 220)·온보딩 완료 배지(`lib/onboarding-quest/completion.ts` 125)다(체크인 배지는
--        정책 조건이 걸리지 않아 영향이 없다). 운영툴은 미션·컬렉션이 연결 배지보다 먼저 공개되는 것을 사전 점검에서
--        막는다(1500 ⑨·⑩).
--   (나) 공개 전 컬렉션 소속 아이템을 가진 유저는 인벤토리 화면에서 그 아이템을 보지 못한다. 조합·드랍 시트는 service라 보인다.
--   그래서 아이템 배지에는 공개 시각 조건을 걸지 않았다 — 화면의 컬렉션 완성 분모(`collections/[id]` 241–248,
--   `badges/page.tsx` 161, `api/itembooks` 129)가 장착 RPC(`179_slot_item_into_book_all_excluded_fallback.sql` 96–98,
--   SECURITY DEFINER)·완성 체커(service)와 갈리기 때문이다.
--
-- 재실행 가능(idempotent): ALTER POLICY로 같은 정책의 USING 식만 바꾼다. 정책을 지우지 않으므로 정책이 비는 순간이 없다.
-- (214에서 DROP POLICY → CREATE POLICY 형태는 Supabase MCP apply_migration이 60초 시간 초과로 끝나 ALTER POLICY로
--  바꿨다. 처음부터 같은 형태를 쓴다.)

BEGIN;

ALTER POLICY "badges: 전체 읽기 허용" ON public.badges
  USING (
    (type <> 'activity' OR valid_from IS NULL OR valid_from <= now())
    AND (
      item_book_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.item_books b
        WHERE b.id = badges.item_book_id
          AND b.is_active = TRUE
          AND (b.valid_from IS NULL OR b.valid_from <= now())
      )
    )
  );

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
--
-- -- ① 정책이 1개이고 qual에 공개 조건이 들어 있는지(1행, qual에 type·valid_from·item_book_id·item_books 서브쿼리 포함)
-- SELECT policyname, cmd, roles, qual FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'badges';
--
-- -- ② authenticated 역할로 읽었을 때 공개 전 활동 배지·공개되지 않은 컬렉션 소속 배지가 안 나오는지(두 값 모두 0이어야 정상)
-- --    두 번째 값은 같은 역할로 item_books도 읽는다(215 정책이 공개 컬렉션만 돌려준다). 보이는 배지 중 소속 컬렉션이
-- --    같은 역할에게 안 보이는 것이 있으면 새는 것이다.
-- --    (트랜잭션 안에서 역할을 바꾼 확인이라 되돌려진다. 읽기 전용이다.)
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT count(*) FILTER (WHERE type = 'activity' AND valid_from IS NOT NULL AND valid_from > now()) AS upcoming_activity_visible,
--        count(*) FILTER (WHERE item_book_id IS NOT NULL AND NOT EXISTS (
--          SELECT 1 FROM public.item_books ib WHERE ib.id = badges.item_book_id
--        ))                                                                                          AS unlaunched_book_badge_visible
--   FROM public.badges;
-- ROLLBACK;
--
-- -- ③ 공개 조건을 충족한 배지는 나오는지(service 쪽 건수와 같아야 한다. 2026-10-05 기준 기대값은 소프트 삭제 630개가 빠진
-- --    2,736 = 체크인 1,832 + 아이템 270 + 활동 634이고, 적용 전에 데이터가 바뀌었으면 첫 쿼리 값과 같은지만 본다)
-- SELECT count(*) AS launched_by_service FROM public.badges b
--   WHERE (b.type <> 'activity' OR b.valid_from IS NULL OR b.valid_from <= now())
--     AND (b.item_book_id IS NULL OR EXISTS (
--       SELECT 1 FROM public.item_books ib
--       WHERE ib.id = b.item_book_id AND ib.is_active = TRUE AND (ib.valid_from IS NULL OR ib.valid_from <= now())
--     ));
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SELECT count(*) AS launched_by_authenticated FROM public.badges;
-- ROLLBACK;

-- 되돌림 SQL
-- 정책의 USING 식을 원래 조건(001, `USING (TRUE)`)으로 되돌린다. 되돌리면 공개 전 활동 배지와 비공개 컬렉션 소속 배지가 인증 유저의 직접 조회에 다시 보인다.
-- ALTER POLICY "badges: 전체 읽기 허용" ON public.badges
--   USING (TRUE);
