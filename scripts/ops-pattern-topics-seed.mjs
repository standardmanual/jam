#!/usr/bin/env node
// 주제 패턴 시드 SQL 생성기 (티켓 20261102_1600).
//
// 원고 `scripts/data/ops-pattern-topics.json`을 읽어 `ops_patterns`에 주제 패턴(topic이 있는 행)을 넣는
// 마이그레이션 `jam-web/supabase/migrations/312_ops_patterns_topic_seed.sql`을 만든다. 이 스크립트는 SQL을 실행하지 않는다.
//
// 사용:
//   node scripts/ops-pattern-topics-seed.mjs            검사 후 312를 쓴다. 검사가 어긋나면 파일을 쓰지 않고 1로 끝난다.
//   node scripts/ops-pattern-topics-seed.mjs --check    파일을 쓰지 않고, 생성 결과가 커밋된 312와 같은지만 본다.
//
// 칸 매핑 (JSON → DB):
//   no → pattern_no, topic → topic, name/principle/userExperience/menus/cardShapes → 같은 이름의 칸,
//   angles[] → angles (각 항목에 그 주제의 needs를 넣는다), common.pitfalls → pitfalls, samples는 [], knobs는 {}, origin은 seed.
//
// 멈춤 조건: 번호가 P19부터 이어지지 않음 · topic 중복 · 카드 모양이 허용 목록 밖 · 각도 종류가 허용 목록 밖 · 각도가 10개 미만
//   · needs가 허용 목록 밖 · 비어 있는 칸.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const SOURCE_PATH = 'scripts/data/ops-pattern-topics.json'
export const SEED_PATH = 'jam-web/supabase/migrations/312_ops_patterns_topic_seed.sql'

/** 카드 모양 허용 목록. `jam-web/src/lib/today/shape.ts`의 `CARD_SHAPES`와 같다. */
export const CARD_SHAPES = ['hero', 'poster', 'square', 'brief', 'list', 'dome', 'ticket']
export const ANGLE_TYPES = ['소개', '유도', '미션', '큐레이션', '현황', '회고', '이야기']
export const NEED_KEYS = ['places', 'place-stats', 'badges', 'item-paths', 'trends', 'kpi']
export const MIN_ANGLES = 10
const FIRST_NO = 19

const q = (text) => `'${String(text).replace(/'/g, "''")}'`
const json = (value) => `${q(JSON.stringify(value))}::jsonb`
const textArray = (list) => `ARRAY[${list.map(q).join(', ')}]::text[]`

export function validateTopics(doc) {
  const errors = []
  const topics = doc.topics ?? []
  const seenTopic = new Set()
  topics.forEach((t, i) => {
    const expected = `P${String(FIRST_NO + i).padStart(2, '0')}`
    const at = `${t.no ?? `#${i + 1}`}`
    if (t.no !== expected) errors.push(`${at}: 번호가 ${expected}이어야 한다`)
    if (seenTopic.has(t.topic)) errors.push(`${at}: topic ${t.topic}이 중복이다`)
    seenTopic.add(t.topic)
    for (const key of ['topic', 'name', 'principle', 'userExperience']) {
      if (typeof t[key] !== 'string' || t[key].trim() === '') errors.push(`${at}: ${key}가 비어 있다`)
    }
    if (!Array.isArray(t.menus) || t.menus.length === 0) errors.push(`${at}: menus가 비어 있다`)
    for (const n of t.needs ?? []) if (!NEED_KEYS.includes(n)) errors.push(`${at}: needs ${n}은 허용 목록 밖이다`)
    for (const s of t.cardShapes ?? []) if (!CARD_SHAPES.includes(s.shape)) errors.push(`${at}: 카드 모양 ${s.shape}은 허용 목록 밖이다`)
    const angles = t.angles ?? []
    if (angles.length < MIN_ANGLES) errors.push(`${at}: 각도가 ${angles.length}개다(${MIN_ANGLES}개 이상이어야 한다)`)
    angles.forEach((a, j) => {
      if (!ANGLE_TYPES.includes(a.type)) errors.push(`${at}: 각도 ${j + 1}의 종류 ${a.type}은 허용 목록 밖이다`)
      if (!a.title || !a.note) errors.push(`${at}: 각도 ${j + 1}의 title·note가 비어 있다`)
    })
  })
  if (typeof doc.common?.pitfalls !== 'string' || doc.common.pitfalls.trim() === '') errors.push('common.pitfalls가 비어 있다')
  return errors
}

export function buildSql(doc) {
  const topics = doc.topics
  const rows = topics.map((t) => {
    const angles = t.angles.map((a) => ({ type: a.type, title: a.title, note: a.note, needs: t.needs ?? [] }))
    const values = [
      q(t.no), q(t.name), q(t.principle), q(t.userExperience), textArray(t.menus), '\'[]\'::jsonb',
      json(t.cardShapes), '\'{}\'::jsonb', q(doc.common.pitfalls), '\'active\'', 'NULL', '\'seed\'', q(t.topic), json(angles),
    ]
    return `  -- ${t.no} ${t.name}\n  (${values.join(', ')})`
  })
  const nos = topics.map((t) => q(t.no)).join(', ')
  return `-- 312: 주제 패턴 ${topics.length}행 시드 — ops_patterns (티켓 20261102_1600, 사용자 지시 2026-11-02)
--
-- 이 파일은 생성 파일이다. 손으로 고치지 않는다. 원고를 고쳤으면 아래 명령으로 다시 만든다.
--   생성 명령: node scripts/ops-pattern-topics-seed.mjs        (같은 원고인지 확인: node scripts/ops-pattern-topics-seed.mjs --check)
--   원고: ${SOURCE_PATH}
--   생성 때 개수: 주제 패턴 ${topics.length} · 각도 ${topics.reduce((n, t) => n + t.angles.length, 0)}
--
-- 동작:
--   - 311이 만든 topic·angles 칸을 쓴다. 311이 적용되지 않았으면 실행하지 않는다.
--   - ON CONFLICT DO NOTHING이라 다시 돌려도 사람이 고친 행을 덮어쓰지 않는다.
--   - 기존 원리형 패턴 P01~P18은 건드리지 않는다.
--   - COMMIT 앞의 확인 블록이 ${topics.length}행이 들어갔는지 세어 어긋나면 트랜잭션을 되돌린다.
--
-- 되돌림 SQL(이 파일이 넣은 행만 지운다):
--   DELETE FROM public.ops_patterns WHERE pattern_no IN (${nos}) AND origin = 'seed' AND updated_by IS NULL;

BEGIN;

INSERT INTO public.ops_patterns
  (pattern_no, name, principle, user_experience, menus, samples, card_shapes, knobs, pitfalls, status, pause_reason, origin, topic, angles)
VALUES
${rows.join(',\n')}
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  n_topic int; n_total int; n_short int;
BEGIN
  SELECT count(*) INTO n_topic FROM public.ops_patterns WHERE pattern_no IN (${nos}) AND topic IS NOT NULL;
  SELECT count(*) INTO n_total FROM public.ops_patterns;
  SELECT count(*) INTO n_short FROM public.ops_patterns WHERE topic IS NOT NULL AND jsonb_array_length(angles) < ${MIN_ANGLES};
  IF n_topic <> ${topics.length} THEN RAISE EXCEPTION '주제 패턴이 ${topics.length}행이 아니다: %', n_topic; END IF;
  IF n_total < ${18 + topics.length} THEN RAISE EXCEPTION '패턴 전체가 ${18 + topics.length}행보다 적다: %', n_total; END IF;
  IF n_short <> 0 THEN RAISE EXCEPTION '각도가 ${MIN_ANGLES}개 미만인 주제 패턴이 있다: %', n_short; END IF;
END $$;

COMMIT;
`
}

function main() {
  const check = process.argv.includes('--check')
  const doc = JSON.parse(readFileSync(join(ROOT, SOURCE_PATH), 'utf8'))
  const errors = validateTopics(doc)
  if (errors.length > 0) {
    console.error(`원고 검사에서 ${errors.length}건이 걸렸다. SQL을 쓰지 않는다.`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const sql = buildSql(doc)
  const out = join(ROOT, SEED_PATH)
  if (check) {
    const same = existsSync(out) && readFileSync(out, 'utf8') === sql
    console.log(same ? '312가 원고와 같다.' : '312가 원고와 다르다. node scripts/ops-pattern-topics-seed.mjs로 다시 만든다.')
    process.exit(same ? 0 : 1)
  }
  writeFileSync(out, sql)
  console.log(`${SEED_PATH}를 썼다(주제 패턴 ${doc.topics.length}행).`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
