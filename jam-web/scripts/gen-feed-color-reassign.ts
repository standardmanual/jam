#!/usr/bin/env npx tsx
/**
 * 저장된 홈피드 카드 121장의 색 재배정 SQL 생성기 (티켓 20261122_2224 회차 10)
 *
 * 재료 JSON(`scripts/data/feed-color-reassign-input-20261123.json`, 읽기 전용 SELECT 결과)을 읽어
 * `src/lib/today/feedColorReassign.ts`로 새 바탕·박스·칩을 정하고 마이그레이션 SQL을 출력한다.
 * DB에 연결하지 않는다. 같은 재료면 같은 SQL이 나온다(시각·난수를 읽지 않는다).
 *
 * ## 실행
 * ```
 * cd jam-web
 * npx tsx scripts/gen-feed-color-reassign.ts up      > supabase/migrations/358_feed_colors_reassign.sql
 * npx tsx scripts/gen-feed-color-reassign.ts down    > supabase/migrations/358_feed_colors_reassign_down.sql
 * npx tsx scripts/gen-feed-color-reassign.ts summary                      # 분포 요약(JSON)
 * ```
 * 옵션: 두 번째 인자로 재료 파일 경로를 줄 수 있다(기본은 위 파일).
 *
 * ⚠️ 이 스크립트는 SQL을 만들기만 한다. 실행은 메인 세션(카리나)이 한다.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { reassignFeedColors, type FeedColorReassignCard, type FeedColorReassignResult } from '../src/lib/today/feedColorReassign'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_INPUT = path.join(HERE, 'data', 'feed-color-reassign-input-20261123.json')
const INPUT_NAME = 'feed-color-reassign-input-20261123.json'
const BACKUP_TABLE = 'today_cards_feed_color_backup_20261123'

interface InputFile {
  snapshotAt: string
  cards: FeedColorReassignCard[]
}

function readInput(file: string): FeedColorReassignCard[] {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as InputFile
  return parsed.cards
}

function count(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const value of values) out[value] = (out[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)))
}

export function summarize(results: readonly FeedColorReassignResult[]) {
  return {
    total: results.length,
    bg: count(results.map((r) => r.bg)),
    box: count(results.map((r) => r.box)),
    chip: count(results.map((r) => r.chip)),
    deepGreenBg: results.filter((r) => r.bg === 'green-deep').length,
    fallback: results.filter((r) => r.usedFallback).length,
  }
}

function valuesRows(results: readonly FeedColorReassignResult[]): string {
  return results.map((r) => `      ('${r.id}'::uuid, '${r.bg}', '${r.chip}', '${r.box}')`).join(',\n')
}

function idRows(results: readonly FeedColorReassignResult[]): string {
  return results.map((r) => `      '${r.id}'::uuid`).join(',\n')
}

export function buildUpSql(results: readonly FeedColorReassignResult[]): string {
  const n = results.length
  return `-- 358: 저장된 홈피드 카드 ${n}장의 색(바탕·칩·박스)을 통합 팔레트 규칙으로 다시 배정한다 (일회성 전환, 티켓 20261122_2224 회차 10)
--
-- 생성 근거: jam-web/scripts/gen-feed-color-reassign.ts (npx tsx scripts/gen-feed-color-reassign.ts up). 재료는 jam-web/scripts/data/${INPUT_NAME}
-- (today_cards ${n}장의 유형·시드·등록 시각·노출 기간·첫 배지 대표 색, 읽기 전용 SELECT 결과). 규칙은 jam-web/src/lib/today/feedColorReassign.ts(assignFeedColors를
-- 등록 시각 → 노출 시작 → id 순으로 카드마다 돌린다). 운영자가 손으로 고른 옛 색도 모두 바뀐다(결정 2026-11-23).
-- 새 키는 모두 357로 넓힌 19키 CHECK를 통과한다. 확장(357) → 전환(이 파일) → 축소(359) 중 «전환»이다.
--
-- 실행 순서: 357(실행 완료) → 이 파일 → (화면 확인 뒤) 359. 되돌림: 358_feed_colors_reassign_down.sql (359를 이미 실행했다면 359 되돌림을 먼저).
-- 안전장치:
--   1) 백업 표 ${BACKUP_TABLE}에 이 ${n}장의 현재 값을 그대로 담는다(표가 비어 있을 때만 채운다).
--   2) 갱신은 «아직 백업 시점 값과 같은 행»만 한다. 그사이 운영자가 바꾼 카드는 건너뛰고, 갱신 행 수가 ${n}이 아니면 예외로 전체를 되돌린다.
--   3) 바뀌는 칸은 bg_color_key·chip_color_key·box_color_key 셋뿐이다(updated_at 등 다른 칸은 건드리지 않는다).
-- 다시 실행하면 갱신 행 수가 ${n}이 아니어서 예외로 멈춘다(이미 갱신된 행은 백업 값과 다르다). 같은 값으로 우연히 정해진 카드도 갱신 대상에 센다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션 DB에 반영된다(프로덕션 앱 main은 새 색 키를 아직 그릴 줄 모르므로 main 배포 전 화면에 영향이 없는지 실행 전 확인).

BEGIN;

CREATE TABLE IF NOT EXISTS public.${BACKUP_TABLE} (
  id uuid PRIMARY KEY,
  bg_color_key text,
  chip_color_key text,
  box_color_key text
);
ALTER TABLE public.${BACKUP_TABLE} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.${BACKUP_TABLE} FROM anon, authenticated;
COMMENT ON TABLE public.${BACKUP_TABLE} IS '358 홈피드 색 재배정 전 값(티켓 20261122_2224). 복구를 확인한 뒤 삭제해도 된다. 접근 정책 없음(service_role만)';

DO $$
DECLARE
  backed_up integer;
  updated integer;
BEGIN
  -- (가) 백업: 표가 비어 있을 때만, 재배정 대상 ${n}장의 현재 값을 그대로 담는다
  IF NOT EXISTS (SELECT 1 FROM public.${BACKUP_TABLE}) THEN
    INSERT INTO public.${BACKUP_TABLE} (id, bg_color_key, chip_color_key, box_color_key)
    SELECT t.id, t.bg_color_key, t.chip_color_key, t.box_color_key
    FROM public.today_cards t
    WHERE t.id IN (
${idRows(results)}
    );
  END IF;

  SELECT count(*) INTO backed_up FROM public.${BACKUP_TABLE};
  IF backed_up <> ${n} THEN
    RAISE EXCEPTION '358: 백업 표 행 수가 ${n}이 아닙니다(%). 카드가 삭제됐거나 표에 이전 내용이 남아 있습니다. 전체를 되돌립니다.', backed_up;
  END IF;

  -- (나) 갱신: 백업 시점 값과 아직 같은 행만 새 값으로 바꾼다(그사이 운영자가 바꾼 카드는 건너뛴다)
  UPDATE public.today_cards t
  SET bg_color_key = v.nbg,
      chip_color_key = v.nchip,
      box_color_key = v.nbox
  FROM (
    VALUES
${valuesRows(results)}
  ) AS v(id, nbg, nchip, nbox)
  JOIN public.${BACKUP_TABLE} b ON b.id = v.id
  WHERE t.id = v.id
    AND t.bg_color_key IS NOT DISTINCT FROM b.bg_color_key
    AND t.chip_color_key IS NOT DISTINCT FROM b.chip_color_key
    AND t.box_color_key IS NOT DISTINCT FROM b.box_color_key;

  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated <> ${n} THEN
    RAISE EXCEPTION '358: 갱신된 행 수가 ${n}이 아닙니다(%). 그사이 값이 바뀐 카드가 있습니다. 전체를 되돌립니다.', updated;
  END IF;
END
$$;

COMMIT;
`
}

export function buildDownSql(results: readonly FeedColorReassignResult[]): string {
  const n = results.length
  return `-- 358 되돌림: 홈피드 카드 색 ${n}장을 백업 표 ${BACKUP_TABLE}의 값으로 복구한다 (티켓 20261122_2224 회차 10)
--
-- 생성 근거: jam-web/scripts/gen-feed-color-reassign.ts (npx tsx scripts/gen-feed-color-reassign.ts down). 백업 표의 bg·chip·box 세 칸을 그대로 되돌린다.
-- 359(옛 10키 제거) 뒤에는 옛 키가 제약에 걸려 복구할 수 없다 — 먼저 359 되돌림을 실행한다.
-- 백업 표는 지우지 않는다. 복구를 화면과 DB로 확인한 뒤 사용자가 아래 DROP을 직접 실행해 삭제한다.
-- 백업 이후 삭제된 카드는 건너뛰고(복구 행 수만 알림으로 남긴다), 백업 표가 없으면 오류로 멈춘다.
--
-- ⚠️ 공용 단일 DB다. 실행하면 즉시 프로덕션 DB에 반영된다.

BEGIN;

DO $$
DECLARE
  restored integer;
BEGIN
  UPDATE public.today_cards t
  SET bg_color_key = b.bg_color_key,
      chip_color_key = b.chip_color_key,
      box_color_key = b.box_color_key
  FROM public.${BACKUP_TABLE} b
  WHERE t.id = b.id;

  GET DIAGNOSTICS restored = ROW_COUNT;
  RAISE NOTICE '358 되돌림: % 행을 복구했습니다(백업 ${n}행).', restored;
END
$$;

COMMIT;

-- 복구를 확인한 뒤 백업 표를 지운다(사용자 확인 후 실행):
-- DROP TABLE IF EXISTS public.${BACKUP_TABLE};
`
}

function main(): void {
  const mode = process.argv[2]
  const input = process.argv[3] ?? DEFAULT_INPUT
  if (mode !== 'up' && mode !== 'down' && mode !== 'summary') {
    console.error('사용법: npx tsx scripts/gen-feed-color-reassign.ts <up|down|summary> [재료 JSON 경로]')
    process.exit(1)
  }
  const results = reassignFeedColors(readInput(input))
  if (mode === 'up') process.stdout.write(buildUpSql(results))
  else if (mode === 'down') process.stdout.write(buildDownSql(results))
  else process.stdout.write(`${JSON.stringify(summarize(results), null, 2)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
