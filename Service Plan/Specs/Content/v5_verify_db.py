# -*- coding: utf-8 -*-
"""
v5 액티비티 배지 정본↔DB 드리프트 검증 (티켓 20260906_1421)

배경
  `jam-web/supabase/migrations/seed_v5_activity_badges.sql`은 INSERT … WHERE NOT EXISTS
  멱등 구조라, 재실행해도 이미 있는 행의 name·description을 갱신하지 않는다.
  즉 정본(v5_catalog_writing.json → v5_seed_build.py → rows.json)과 DB의 문안이
  갈라져도 시드 재실행으로는 절대 수렴하지 않는다. 이 스크립트가 그 간극을 잡는다.

⚠️ 이 스크립트는 DB를 **읽기만** 한다. INSERT·UPDATE·DELETE를 전혀 호출하지 않는다.
   불일치를 고치려면 별도의 UPDATE 마이그레이션을 손으로 작성해야 한다
   (예: 20260906_1305의 138_badge_rarity_descriptions.sql).

입력
  · seed_v5_activity_badges.rows.json  정본에서 생성된 630행 (v5_seed_build.py 산출물)
  · jam-web/.env.local                  NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY

대조 대상
  · public.badges WHERE type='activity' AND deleted_at IS NULL
    AND family_key ~ '^(walking|running|cycling|hiking|trail_running):[A-Z][0-9]*$'
  · v4 레거시(소프트 삭제된 207행)는 deleted_at 조건으로 이미 제외된다

대조 키: (family_key, rarity, level) — rows.json 안에서 유일함을 이미 검증했다(중복 0건).
비교 항목: name · description

실행: python3 "Service Plan/Specs/Content/v5_verify_db.py"
종료 코드: 0 = 불일치 없음 / 1 = 불일치 있음 또는 접속 실패
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
ROWS_JSON = os.path.join(HERE, 'seed_v5_activity_badges.rows.json')
ENV_LOCAL = os.path.join(REPO, 'jam-web', '.env.local')

FAMILY_KEY_RE = re.compile(
    r'^(walking|running|cycling|hiking|trail_running):[A-Z][0-9]*$'
)


def load_env(path):
    env = {}
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        m = re.match(r'^([A-Z_0-9]+)=(.*)$', line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"')
    return env


def fetch_db_rows(base_url, service_role_key):
    """public.badges의 살아 있는 v5 액티비티 배지를 읽기 전용으로 전량 가져온다.
    ⚠️ GET만 호출한다 — 이 함수는 절대 쓰기를 하지 않는다."""
    import requests

    headers = {
        'apikey': service_role_key,
        'Authorization': f'Bearer {service_role_key}',
    }
    endpoint = f'{base_url}/rest/v1/badges'
    params = {
        'select': 'name,description,family_key,rarity,level',
        'type': 'eq.activity',
        'deleted_at': 'is.null',
        'order': 'family_key.asc',
    }

    rows = []
    page_size = 1000
    offset = 0
    while True:
        page_headers = dict(headers, Range=f'{offset}-{offset + page_size - 1}')
        resp = requests.get(endpoint, headers=page_headers, params=params, timeout=30)
        if resp.status_code not in (200, 206):
            raise RuntimeError(f'Supabase REST 조회 실패: {resp.status_code} {resp.text[:500]}')
        page = resp.json()
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


def main():
    if not os.path.exists(ENV_LOCAL):
        print(f'[FAIL] {ENV_LOCAL} 없음 — SUPABASE 키를 읽을 수 없다', file=sys.stderr)
        return 1
    env = load_env(ENV_LOCAL)
    base_url = env.get('NEXT_PUBLIC_SUPABASE_URL')
    service_role_key = env.get('SUPABASE_SERVICE_ROLE_KEY')
    if not base_url or not service_role_key:
        print('[FAIL] NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없다',
              file=sys.stderr)
        return 1

    canon = json.load(open(ROWS_JSON, encoding='utf-8'))
    canon_map = {}
    for r in canon:
        key = (r['family_key'], r['rarity'], r['level'])
        canon_map[key] = (r['name'], r['description'])

    try:
        db_rows = fetch_db_rows(base_url, service_role_key)
    except Exception as e:
        print(f'[FAIL] DB 조회 중 오류: {e}', file=sys.stderr)
        return 1

    db_map = {}
    non_v5 = 0
    for r in db_rows:
        if not FAMILY_KEY_RE.match(r['family_key'] or ''):
            non_v5 += 1
            continue
        key = (r['family_key'], r['rarity'], r['level'])
        db_map[key] = (r['name'], r['description'])

    print('=' * 72)
    print('v5 배지 문안 정본↔DB 드리프트 검증 (티켓 20260906_1421)')
    print('=' * 72)
    print(f'정본(rows.json): {len(canon_map)}행')
    print(f'DB(살아 있는 v5 액티비티 배지): {len(db_map)}행'
          + (f' (v5 패턴 밖 {non_v5}행 제외)' if non_v5 else ''))
    print()

    mismatches = []
    missing = []
    extra = []

    for key, (name, desc) in canon_map.items():
        if key not in db_map:
            missing.append((key, name, desc))
            continue
        db_name, db_desc = db_map[key]
        if db_name != name or db_desc != desc:
            mismatches.append((key, (name, desc), (db_name, db_desc)))

    for key in db_map:
        if key not in canon_map:
            extra.append((key, db_map[key]))

    if mismatches:
        print(f'― name·description 불일치 {len(mismatches)}행 ―')
        for (fkey, rarity, level), (c_name, c_desc), (d_name, d_desc) in mismatches:
            tag = f'{fkey} rarity={rarity} level={level}'
            print(f'  [MISMATCH] {tag}')
            if c_name != d_name:
                print(f'    name        정본="{c_name}"  DB="{d_name}"')
            if c_desc != d_desc:
                print(f'    description 정본="{c_desc}"  DB="{d_desc}"')
        print()

    if missing:
        print(f'― 정본에는 있으나 DB에 없는 행 {len(missing)}건 (시드 미실행 또는 삭제됨) ―')
        for (fkey, rarity, level), name, desc in missing:
            print(f'  [MISSING] {fkey} rarity={rarity} level={level}  "{name}"')
        print()

    if extra:
        print(f'― DB에는 있으나 정본에 없는 v5 행 {len(extra)}건 (정본에서 빠졌거나 키가 바뀜) ―')
        for (fkey, rarity, level), (name, desc) in extra:
            print(f'  [EXTRA] {fkey} rarity={rarity} level={level}  "{name}"')
        print()

    total_issues = len(mismatches) + len(missing) + len(extra)
    if total_issues == 0:
        print('― 결과: 불일치 0건. 정본과 DB가 일치한다. ―')
        return 0
    else:
        print(f'― 결과: 총 {total_issues}건 불일치. 위 목록을 보고 UPDATE 마이그레이션을 작성할 것. ―')
        return 1


if __name__ == '__main__':
    sys.exit(main())
