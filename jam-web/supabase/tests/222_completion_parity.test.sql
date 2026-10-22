-- 222_completion_parity.test.sql — 컬렉션 완성 판정 일치 시험 (티켓 20261016_2340 2회-가)
-- 스펙: docs/tickets/p2-normal/20261016_2340_Service_JAM2-컬렉션-4등급-구조와-단일-완성-판정.md 「2회 시작 판정」
--
-- ⚠️ 이 파일은 **마이그레이션이 아니다.** supabase/migrations/ 에 두지 말 것. 아현은 작성만 했고 실행은 카리나가 한다.
--
-- 무엇을 확인하나
--   코드의 완성 판정(src/lib/itembook/completion-basis.ts)과 DB 장착 함수가 같은 사례표에서 같은 완성 결과를 내는가.
--   · tier_mode = false 사례 → slot_item_into_book(179)이 user_item_book_completions에 완성을 남기는지
--   · tier_mode = true  사례 → slot_item_into_book_tiered(222)가 그 등급의 user_item_book_tier_completions를 남기는지,
--                              컬렉션 등급(꽂힌 배지의 등급)이 기대값과 같은지
--   · 컬렉션 등급(꽂힌 배지의 등급)은 소프트 삭제된 배지에 꽂힌 슬롯도 센다(아래 tier 판별 쿼리와 장착 함수의 tier_mismatch 판정이 deleted_at을 걸지 않는다).
--     그런 사례는 등급(tier)만 정하고 분모·분자에는 들지 않는다(티켓 20261022_1139 2회, 2340 정리 ④).
--   · 분모·분자 개수 자체는 DB 함수의 반환값이 아니라 SQL로 볼 수 없다. 완성 여부(complete)와 등급(tier)만 대조한다.
--     개수(total·filled)는 코드 쪽 시험(completion-parity.test.ts)이 같은 사례표로 확인한다.
--   · 사례표에서 "sql": false인 사례(체크인 배지, 등급 없는 배지)는 DB 함수로 만들 수 없어 건너뛴다.
--
-- 사례표는 아래 DO 블록 첫머리 v_cases 변수의 JSON이며 src/lib/itembook/__tests__/fixtures/completion-parity-cases.json과
-- **같아야 한다**. 코드 쪽 시험(completion-parity.test.ts)이 두 JSON이 같은지 검사하므로,
-- 사례표를 고치면 이 파일의 JSON도 같은 내용으로 맞춘다.
--
-- 실행: 아래 DO 블록 전체를 한 번에 실행한다(MCP execute_sql 또는 psql -v ON_ERROR_STOP=1 -f).
--   · 시험용 컬렉션·배지·인벤토리 아이템·장착 행을 만들고 끝에서 **일부러 오류를 내 전부 되돌린다**. 데이터가 남지 않는다.
--   · 통과: 오류 메시지가 'PARITY_OK_ROLLBACK: N개 사례 통과'로 시작한다(되돌림용 오류이며 정상).
--   · 실패: 'PARITY_FAIL [사례 이름] ...'로 시작하는 오류가 난다.
--   · 인벤토리가 있는 기존 유저 1명을 빌려 쓴다. 장착 함수가 그 유저의 인벤토리 행을 잠그므로 실행 중 그 유저의 다른 요청이 잠깐 기다릴 수 있다.
--   · 마이그레이션 222(slot_item_into_book_tiered)가 적용된 DB에서만 돈다.
--   · 시험용 배지 생성이 다른 트리거·제약에 걸려 실패하면 그 오류 그대로가 나온다. 그 경우 사례 시험이 아니라 시험 준비 단계의 문제다.

DO $parity$
DECLARE
  v_cases       JSONB := $fixture${"description": "완성 판정 일치 사례표. completion-basis.ts(코드)와 supabase/tests/222_completion_parity.test.sql(179·222 함수)이 같은 표를 쓴다. sql=false 사례는 코드만 확인한다.", "cases": [
    {"name": "옛: 둘 중 하나만 꽂으면 미완성", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item"}, {"key": "b", "name": "B", "type": "item"}], "slotted": ["a"], "expect": {"tier": null, "total": 2, "filled": 1, "complete": false}},
    {"name": "옛: 둘 다 꽂으면 완성", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item"}, {"key": "b", "name": "B", "type": "item"}], "slotted": ["a", "b"], "expect": {"tier": null, "total": 2, "filled": 2, "complete": true}},
    {"name": "옛: 아무것도 안 꽂으면 미완성", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item"}, {"key": "b", "name": "B", "type": "item"}], "slotted": [], "expect": {"tier": null, "total": 2, "filled": 0, "complete": false}},
    {"name": "옛: 소프트 삭제 배지는 분모에서 빠진다", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item"}, {"key": "b", "name": "B", "type": "item"}, {"key": "c", "name": "C", "type": "item", "deleted": true}], "slotted": ["a", "b"], "expect": {"tier": null, "total": 2, "filled": 2, "complete": true}},
    {"name": "옛: 소프트 삭제 배지를 꽂아도 분자에 들지 않는다", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item"}, {"key": "b", "name": "B", "type": "item", "deleted": true}], "slotted": ["a", "b"], "expect": {"tier": null, "total": 1, "filled": 1, "complete": true}},
    {"name": "옛: 삭제 배지 때문에 분모 0이면 완성이 아니다", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item", "deleted": true}], "slotted": ["a"], "expect": {"tier": null, "total": 0, "filled": 0, "complete": false}},
    {"name": "옛: 드랍 제외 배지는 분모에서 빠진다", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item"}, {"key": "b", "name": "B", "type": "item"}, {"key": "c", "name": "C", "type": "item", "dropExcluded": true}], "slotted": ["a", "b"], "expect": {"tier": null, "total": 2, "filled": 2, "complete": true}},
    {"name": "옛: 드랍 제외 배지를 꽂아도 분자에 들지 않는다", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item"}, {"key": "b", "name": "B", "type": "item"}, {"key": "c", "name": "C", "type": "item", "dropExcluded": true}], "slotted": ["a", "c"], "expect": {"tier": null, "total": 2, "filled": 1, "complete": false}},
    {"name": "옛: 전부 드랍 제외이면 제외 없이 센다(일부만 꽂음)", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item", "dropExcluded": true}, {"key": "b", "name": "B", "type": "item", "dropExcluded": true}], "slotted": ["a"], "expect": {"tier": null, "total": 2, "filled": 1, "complete": false}},
    {"name": "옛: 전부 드랍 제외이면 제외 없이 센다(모두 꽂음)", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item", "dropExcluded": true}, {"key": "b", "name": "B", "type": "item", "dropExcluded": true}], "slotted": ["a", "b"], "expect": {"tier": null, "total": 2, "filled": 2, "complete": true}},
    {"name": "옛: 전부 드랍 제외이고 일부가 삭제이면 삭제를 뺀 나머지가 분모다", "tierMode": false, "badges": [{"key": "a", "name": "A", "type": "item", "dropExcluded": true}, {"key": "b", "name": "B", "type": "item", "dropExcluded": true, "deleted": true}], "slotted": ["a"], "expect": {"tier": null, "total": 1, "filled": 1, "complete": true}},
    {"name": "옛: 같은 이름 배지도 배지 수로 센다", "tierMode": false, "badges": [{"key": "a", "name": "X", "rarity": "common", "type": "item"}, {"key": "b", "name": "X", "rarity": "rare", "type": "item"}], "slotted": ["a"], "expect": {"tier": null, "total": 2, "filled": 1, "complete": false}},
    {"name": "옛: 체크인 배지도 분모에 든다", "tierMode": false, "sql": false, "note": "DB 장착 함수로는 체크인 배지를 꽂을 수 없어 코드 판정만 확인한다", "badges": [{"key": "a", "name": "A", "type": "item"}, {"key": "c", "name": "C", "type": "checkin"}], "slotted": ["a"], "expect": {"tier": null, "total": 2, "filled": 1, "complete": false}},
    {"name": "옛: 삭제된 체크인 배지는 분모에서 빠진다", "tierMode": false, "sql": false, "note": "DB 장착 함수로는 체크인 배지를 꽂을 수 없어 코드 판정만 확인한다", "badges": [{"key": "a", "name": "A", "type": "item"}, {"key": "c", "name": "C", "type": "checkin", "deleted": true}], "slotted": ["a"], "expect": {"tier": null, "total": 1, "filled": 1, "complete": true}},
    {"name": "tier: 첫 등급 일부만 채우면 그 등급이 컬렉션 등급이고 미완성", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zc", "name": "Z", "rarity": "common", "type": "item"}, {"key": "xr", "name": "X", "rarity": "rare", "type": "item"}, {"key": "yr", "name": "Y", "rarity": "rare", "type": "item"}, {"key": "zr", "name": "Z", "rarity": "rare", "type": "item"}], "slotted": ["xc", "yc"], "expect": {"tier": "common", "total": 3, "filled": 2, "complete": false, "tiers": {"common": {"total": 3, "filled": 2, "complete": false}, "rare": {"total": 3, "filled": 0, "complete": false}}}},
    {"name": "tier: 한 등급의 이름 칸을 모두 채우면 그 등급 완성", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zc", "name": "Z", "rarity": "common", "type": "item"}, {"key": "xr", "name": "X", "rarity": "rare", "type": "item"}, {"key": "yr", "name": "Y", "rarity": "rare", "type": "item"}, {"key": "zr", "name": "Z", "rarity": "rare", "type": "item"}], "slotted": ["xc", "yc", "zc"], "expect": {"tier": "common", "total": 3, "filled": 3, "complete": true, "tiers": {"common": {"total": 3, "filled": 3, "complete": true}, "rare": {"total": 3, "filled": 0, "complete": false}}}},
    {"name": "tier: 높은 등급으로 시작해도 그 등급 기준으로 센다", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "xr", "name": "X", "rarity": "rare", "type": "item"}, {"key": "yr", "name": "Y", "rarity": "rare", "type": "item"}], "slotted": ["xr", "yr"], "expect": {"tier": "rare", "total": 2, "filled": 2, "complete": true, "tiers": {"common": {"total": 2, "filled": 0, "complete": false}, "rare": {"total": 2, "filled": 2, "complete": true}}}},
    {"name": "tier: 아무것도 안 꽂으면 등급은 없고 첫 등급 기준 0칸이다", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "xr", "name": "X", "rarity": "rare", "type": "item"}], "slotted": [], "expect": {"tier": null, "total": 2, "filled": 0, "complete": false, "tiers": {"common": {"total": 2, "filled": 0, "complete": false}, "rare": {"total": 1, "filled": 0, "complete": false}}}},
    {"name": "tier: 등급마다 이름 수가 달라도 그 등급의 이름 수가 분모다", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zc", "name": "Z", "rarity": "common", "type": "item"}, {"key": "xr", "name": "X", "rarity": "rare", "type": "item"}, {"key": "yr", "name": "Y", "rarity": "rare", "type": "item"}], "slotted": ["xr", "yr"], "expect": {"tier": "rare", "total": 2, "filled": 2, "complete": true, "tiers": {"common": {"total": 3, "filled": 0, "complete": false}, "rare": {"total": 2, "filled": 2, "complete": true}}}},
    {"name": "tier: 다른 등급 배지는 분모에 들지 않는다", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zc", "name": "Z", "rarity": "common", "type": "item"}, {"key": "xm", "name": "X", "rarity": "mystic", "type": "item"}], "slotted": ["xm"], "expect": {"tier": "mystic", "total": 1, "filled": 1, "complete": true, "tiers": {"common": {"total": 3, "filled": 0, "complete": false}, "mystic": {"total": 1, "filled": 1, "complete": true}}}},
    {"name": "tier: 소프트 삭제 배지는 그 등급 분모에서 빠진다", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zc", "name": "Z", "rarity": "common", "type": "item", "deleted": true}], "slotted": ["xc", "yc"], "expect": {"tier": "common", "total": 2, "filled": 2, "complete": true}},
    {"name": "tier: 소프트 삭제 배지에만 꽂아도 그 등급이 컬렉션 등급이다(분자에는 들지 않는다)", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zc", "name": "Z", "rarity": "common", "type": "item", "deleted": true}], "slotted": ["zc"], "expect": {"tier": "common", "total": 2, "filled": 0, "complete": false, "tiers": {"common": {"total": 2, "filled": 0, "complete": false}}}},
    {"name": "tier: 소프트 삭제 배지에 꽂은 슬롯은 분자에 들지 않는다(등급만 정한다)", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zc", "name": "Z", "rarity": "common", "type": "item", "deleted": true}], "slotted": ["zc", "xc"], "expect": {"tier": "common", "total": 2, "filled": 1, "complete": false}},
    {"name": "tier: 소프트 삭제 배지에 꽂은 등급에 살아 있는 배지가 없으면 표시 기준은 첫 등급이다", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zr", "name": "Z", "rarity": "rare", "type": "item", "deleted": true}], "slotted": ["zr"], "expect": {"tier": "rare", "total": 2, "filled": 0, "complete": false, "tiers": {"common": {"total": 2, "filled": 0, "complete": false}}}},
    {"name": "tier: 드랍 제외 배지는 분모에서 빠진다", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zc", "name": "Z", "rarity": "common", "type": "item", "dropExcluded": true}], "slotted": ["xc", "yc"], "expect": {"tier": "common", "total": 2, "filled": 2, "complete": true}},
    {"name": "tier: 드랍 제외 배지를 꽂아도 분자에 들지 않는다", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zc", "name": "Z", "rarity": "common", "type": "item", "dropExcluded": true}], "slotted": ["yc", "zc"], "expect": {"tier": "common", "total": 2, "filled": 1, "complete": false}},
    {"name": "tier: 그 등급이 전부 드랍 제외이면 제외 없이 센다(일부만 꽂음)", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item", "dropExcluded": true}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item", "dropExcluded": true}], "slotted": ["xc"], "expect": {"tier": "common", "total": 2, "filled": 1, "complete": false}},
    {"name": "tier: 그 등급이 전부 드랍 제외이면 제외 없이 센다(모두 꽂음)", "tierMode": true, "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item", "dropExcluded": true}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item", "dropExcluded": true}], "slotted": ["xc", "yc"], "expect": {"tier": "common", "total": 2, "filled": 2, "complete": true}},
    {"name": "tier: 한 등급에 같은 이름이 둘이면 이름 하나로 센다", "tierMode": true, "badges": [{"key": "x1", "name": "X", "rarity": "common", "type": "item"}, {"key": "x2", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}], "slotted": ["x1", "yc"], "expect": {"tier": "common", "total": 2, "filled": 2, "complete": true}},
    {"name": "tier: 등급이 없는 배지는 어느 등급 칸에도 들지 않는다", "tierMode": true, "sql": false, "note": "등급 없는 아이템 배지는 DB에서 만들 수 없어(기본값 common) 코드 판정만 확인한다", "badges": [{"key": "xc", "name": "X", "rarity": "common", "type": "item"}, {"key": "yc", "name": "Y", "rarity": "common", "type": "item"}, {"key": "zn", "name": "Z", "type": "item", "rarity": null}], "slotted": ["xc", "yc"], "expect": {"tier": "common", "total": 2, "filled": 2, "complete": true}}
  ]}$fixture$::jsonb;
  v_case        JSONB;
  v_b           JSONB;
  v_name        TEXT;
  v_tier_mode   BOOLEAN;
  v_user        UUID;
  v_inv         UUID;
  v_book        UUID;
  v_badge       UUID;
  v_item        UUID;
  v_key         TEXT;
  v_badge_ids   JSONB;
  v_res         JSONB;
  v_expect      JSONB;
  v_expect_tier TEXT;
  v_tier        TEXT;
  v_complete    BOOLEAN;
  v_checked     INTEGER := 0;
BEGIN
  SELECT user_id, id INTO v_user, v_inv FROM public.inventory ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'PARITY_FAIL [준비] 인벤토리가 있는 유저가 한 명도 없어 시험할 수 없다';
  END IF;

  FOR v_case IN SELECT jsonb_array_elements(v_cases -> 'cases') LOOP
    -- DB 함수로 만들 수 없는 사례는 코드 시험만 한다
    IF COALESCE((v_case ->> 'sql')::boolean, TRUE) = FALSE THEN
      CONTINUE;
    END IF;

    v_name        := v_case ->> 'name';
    v_tier_mode   := COALESCE((v_case ->> 'tierMode')::boolean, FALSE);
    v_expect      := v_case -> 'expect';
    v_expect_tier := v_expect ->> 'tier';
    v_badge_ids   := '{}'::jsonb;

    INSERT INTO public.item_books (name, description, tier_mode)
    VALUES ('[TEST] parity ' || v_name, '[TEST] 일치 시험용', v_tier_mode)
    RETURNING id INTO v_book;

    FOR v_b IN SELECT jsonb_array_elements(v_case -> 'badges') LOOP
      INSERT INTO public.badges (name, description, type, rarity, item_book_id, drop_excluded, deleted_at)
      VALUES (
        v_b ->> 'name',
        '[TEST] 일치 시험용',
        (v_b ->> 'type')::public.badge_type,
        COALESCE(v_b ->> 'rarity', 'common')::public.badge_rarity,
        v_book,
        COALESCE((v_b ->> 'dropExcluded')::boolean, FALSE),
        CASE WHEN COALESCE((v_b ->> 'deleted')::boolean, FALSE) THEN now() ELSE NULL END
      )
      RETURNING id INTO v_badge;
      v_badge_ids := v_badge_ids || jsonb_build_object(v_b ->> 'key', v_badge);
    END LOOP;

    -- 사례표의 순서대로 장착한다. 완성은 장착이 늘 때만 생기므로 마지막 상태의 완성 여부가 곧 사례의 완성 여부다.
    FOR v_key IN SELECT jsonb_array_elements_text(v_case -> 'slotted') LOOP
      INSERT INTO public.inventory_items (inventory_id, badge_id, obtained_by)
      VALUES (v_inv, (v_badge_ids ->> v_key)::uuid, 'system_event')
      RETURNING id INTO v_item;

      IF v_tier_mode THEN
        v_res := public.slot_item_into_book_tiered(v_user, v_book, v_item);
      ELSE
        v_res := public.slot_item_into_book(v_user, v_book, v_item);
      END IF;

      IF COALESCE((v_res ->> 'ok')::boolean, FALSE) = FALSE THEN
        RAISE EXCEPTION 'PARITY_FAIL [%] 장착 거절 key=% 응답=%', v_name, v_key, v_res;
      END IF;
    END LOOP;

    IF v_tier_mode THEN
      -- 컬렉션 등급 = 꽂힌 배지의 등급(순서가 앞선 것). 저장하지 않고 읽는다.
      SELECT b.rarity::text INTO v_tier
      FROM public.user_item_book_slots s
      JOIN public.badges b ON b.id = s.badge_id
      WHERE s.user_id = v_user AND s.item_book_id = v_book
      ORDER BY array_position(ARRAY['common', 'rare', 'epic', 'mystic'], b.rarity::text)
      LIMIT 1;

      IF v_tier IS DISTINCT FROM v_expect_tier THEN
        RAISE EXCEPTION 'PARITY_FAIL [%] 컬렉션 등급 기대=% 실제=%', v_name, v_expect_tier, v_tier;
      END IF;

      SELECT EXISTS (
        SELECT 1 FROM public.user_item_book_tier_completions c
        WHERE c.user_id = v_user AND c.item_book_id = v_book AND c.tier = v_tier::public.badge_rarity
      ) INTO v_complete;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.user_item_book_completions c
        WHERE c.user_id = v_user AND c.item_book_id = v_book
      ) INTO v_complete;
    END IF;

    IF v_complete IS DISTINCT FROM (v_expect ->> 'complete')::boolean THEN
      RAISE EXCEPTION 'PARITY_FAIL [%] 완성 기대=% 실제=%', v_name, v_expect ->> 'complete', v_complete;
    END IF;

    v_checked := v_checked + 1;
  END LOOP;

  -- 시험 데이터를 남기지 않도록 일부러 오류를 내 전부 되돌린다
  RAISE EXCEPTION 'PARITY_OK_ROLLBACK: %개 사례 통과', v_checked;
END
$parity$;
