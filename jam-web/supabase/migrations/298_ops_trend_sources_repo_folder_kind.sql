-- 298: ops_trend_sources.kind 제약에 repo_folder(저장소 폴더) 추가 (티켓 20261028_1425, 상위 티켓 20261028_1422 조각 A)
--
-- ⚠️ 이 파일은 jam-developer 서브에이전트가 **작성만 하고 실행하지 않았다.**
--    실행은 오케스트레이터(카리나)가 처리한다. Supabase는 staging·프로덕션 공용 단일 DB다.
--
-- 동기:
--   트렌드 출처에 저장소 폴더 종류를 더한다. 검증·API(조각 B)가 repo_folder를 받으려면
--   DB가 먼저 이 값을 허용해야 한다.
--
-- 변경 (확장만 한다. 기존 행·컬럼·다른 제약·색인은 건드리지 않는다):
--   - `ops_trend_sources_kind_check`: 4종(hashtag · channel · search_trend · manual_upload)에 repo_folder를 더해 5종으로 다시 만든다.
--     제약 이름은 그대로 쓴다. 기존 행은 모두 4종 값이라 새 제약을 그대로 통과한다.
--   - `kind`·`location` 컬럼 주석을 새 종류에 맞게 고친다.
--   - 새 컬럼·색인·함수는 없다.

BEGIN;

ALTER TABLE public.ops_trend_sources DROP CONSTRAINT IF EXISTS ops_trend_sources_kind_check;
ALTER TABLE public.ops_trend_sources
  ADD CONSTRAINT ops_trend_sources_kind_check
  CHECK (kind IN ('hashtag', 'channel', 'search_trend', 'manual_upload', 'repo_folder'));

COMMENT ON COLUMN public.ops_trend_sources.kind IS '출처 종류: hashtag(해시태그) · channel(채널) · search_trend(검색어 추이) · manual_upload(직접 올린 자료) · repo_folder(저장소 폴더).';
COMMENT ON COLUMN public.ops_trend_sources.location IS '주소·해시태그·검색어, 저장소 폴더 종류는 허용 폴더 경로(300자 이내). 직접 올린 자료는 비워도 된다.';

COMMIT;

-- ── 검증 쿼리 (실행 후 눈으로 확인할 것) ────────────────────────────────────
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.ops_trend_sources'::regclass AND conname = 'ops_trend_sources_kind_check'; -- 5종(hashtag, channel, search_trend, manual_upload, repo_folder)이 나와야 정상
-- ※ 행을 넣어 확인하지 않는다: `no`가 자동 증가라 시험으로 넣었다 롤백해도 번호가 건너뛰어진다.

-- 되돌림 SQL
-- ⚠️ repo_folder 행이 하나라도 있으면 아래 ADD CONSTRAINT가 실패한다(기존 행이 4종 제약을 어긴다).
--    출처 행은 지우지 않는 규칙이라, 실제 되돌림은 그 행을 `enabled = false`로 끄고 제약은 그대로 두는 것으로 대신한다.
--    먼저 확인: SELECT count(*) FROM public.ops_trend_sources WHERE kind = 'repo_folder'; -- 0일 때만 아래를 실행한다
-- ALTER TABLE public.ops_trend_sources DROP CONSTRAINT IF EXISTS ops_trend_sources_kind_check;
-- ALTER TABLE public.ops_trend_sources
--   ADD CONSTRAINT ops_trend_sources_kind_check
--   CHECK (kind IN ('hashtag', 'channel', 'search_trend', 'manual_upload'));
