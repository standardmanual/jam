#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v5_gate_mapping_sql_build.py — v5_gate_mapping.json -> UPDATE public.badges SQL 본문 생성
(티켓 20260906_1947 ①, DB 반영은 SQL 파일 작성까지만 — CLAUDE.md 규칙 5)

`v5_gate_mapping_build.py`가 이미 만든 정본(`v5_gate_mapping.json`)만 읽는다 — 이 스크립트는
JSON을 SQL 문자열로 옮기기만 하고 판단은 하지 않는다(판단은 전부 앞 스크립트에 있다).

등급형/반복형(rarity IS NOT NULL)은 family_key + rarity로, 무한레벨형(level IS NOT NULL)은
family_key + level 구간(5~7 / 8+)으로 대상을 좁힌다 — 실제 존재하는 행만 매칭되므로
계열 일부가 아직 시딩되지 않았어도(K2 등, 0110 병행 작업분) 안전하게 no-op이다.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
mapping = json.load(open(HERE / "v5_gate_mapping.json", encoding="utf-8"))["families"]


def sql_literal(obj) -> str:
    return json.dumps(obj, ensure_ascii=False).replace("'", "''")


lines = []
epic_count = 0
mystic_count = 0
for family_key in sorted(mapping):
    info = mapping[family_key]
    epic_cond = info["epic_condition"]
    mystic_cond = info["mystic_condition"]
    if info["leveled"]:
        if epic_cond:
            lines.append(
                f"UPDATE public.badges SET condition_json = condition_json || '{sql_literal(epic_cond)}'::jsonb\n"
                f" WHERE type = 'activity' AND deleted_at IS NULL AND family_key = '{family_key}'"
                f" AND level BETWEEN 5 AND 7;"
            )
            epic_count += 1
        if mystic_cond:
            lines.append(
                f"UPDATE public.badges SET condition_json = condition_json || '{sql_literal(mystic_cond)}'::jsonb\n"
                f" WHERE type = 'activity' AND deleted_at IS NULL AND family_key = '{family_key}'"
                f" AND level >= 8;"
            )
            mystic_count += 1
    else:
        if epic_cond:
            lines.append(
                f"UPDATE public.badges SET condition_json = condition_json || '{sql_literal(epic_cond)}'::jsonb\n"
                f" WHERE type = 'activity' AND deleted_at IS NULL AND family_key = '{family_key}'"
                f" AND rarity = 'epic';"
            )
            epic_count += 1
        if mystic_cond:
            lines.append(
                f"UPDATE public.badges SET condition_json = condition_json || '{sql_literal(mystic_cond)}'::jsonb\n"
                f" WHERE type = 'activity' AND deleted_at IS NULL AND family_key = '{family_key}'"
                f" AND rarity = 'mystic';"
            )
            mystic_count += 1

print("\n\n".join(lines))
import sys
print(f"-- 생성: UPDATE {len(lines)}건 (Epic측 {epic_count} / Mystic측 {mystic_count}, 대상 계열 {len(mapping)}개)", file=sys.stderr)
