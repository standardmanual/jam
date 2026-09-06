#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v5_gate_mapping_build.py — 2단 교차 게이트 축→계열 매핑 산출 스크립트
(티켓 20260906_1947 ① — "손으로 쓰지 마라", 기계적 추출)

## 입력 (전부 이 폴더 안에 이미 있는 산출물, 새로 지어내지 않는다)
- seed_v5_activity_badges.rows.json — 0035 A묶음이 실제로 시딩한 194계열 630종의 정본
  (family_key·rarity·level·activity_types). 축→계열 대응의 "실측 정답지".
- v5_catalog_design.json
  - 걷기.계열[].fams[].code → 걷기.축간교차(9행, [축,그룹,1단보완축,2단보완축,설명])
    · 걷기.축내교차짝(20행, [계열, 짝계열, 비고])
  - four종목.종목[].groups[].fams[].code → four종목.교차짝(46행, [종목,축(별명),1단,2단,색])
- v5_catalog_verified.json 교차게이트_정정(7건) — 결함·표기오류 정정. 전부 반영한다.
- v5_mission_badges.json — 4종목 미션 보상 배지 32종의 "여는축"
- v5_mission_axis_groups.json — 걷기 미션 보상 배지 8종의 "여는축"

## 규칙 (판정 근거는 README_최종본_참고 및 티켓 alerts에 남긴다)
1. 대상 축 분류
   - "미션" 축 — 게이트 대상이 아니다(그 자체가 gate_mission_badge의 대상).
   - "기록"(기록 갱신) 축 — 자동 상승형이라 게이트가 없다(마스터 티켓 §게이트 표 각주).
   - "보너스" 축 — 센서 보유자 전용, 게이트 대상 아님(축구성표 각주). 게이트를 걸지 않는다.
   - 그 외 전부 게이트 대상.
2. 관문 결합 (마스터 티켓 20260905_0026 §게이트, crossGate.ts 결합 규칙)
   - Rare→Epic: cross_in_axis(있으면) OR cross_between_axis(1단 보완축)
   - Epic→Mystic: cross_between_axis(2단 보완축, min_rarity=rare 또는 min_level) AND gate_mission_badge
3. "1단 보완축"·"2단 보완축"의 역할 분리는 `교차게이트_정정`의 러닝·이정표 항목
   ("cross"=1단/Epic 관문, "cross2"=2단/Mystic 관문이 서로 다른 축을 가리킬 수 있다)이
   명시적으로 증명한다 — 두 역할을 하나의 AND로 묶지 않는다.
4. 축 내 교차 페어(계열 단위)
   - 걷기: `축내교차짝` 20행을 그대로 쓴다(설계가 명시한 페어).
   - 4종목: 축이 정확히 2계열뿐이면(자명) 서로를 페어로 쓴다.
     3계열 이상인데 설계가 특정 페어를 명시하지 않은 경우(러닝 달력 W1~W3,
     자전거 달력 W1~W3, 등산 달력 W1~W3, 러닝 휴식의 X2)는 **축 내 교차를 비워두고
     축 간 교차(2단 보완축)만 쓴다** — 페어를 지어내면 "같은 활동으로 동시 달성되는
     가짜 관문"을 만들 위험이 있고(달력 축 자체가 그 위험으로 이미 한 번 정정됐다),
     대신 축 간 교차는 원본 데이터 그대로라 안전하다. 이 결정은 [INFO] alert로 남긴다.
5. `교차게이트_정정` 7건을 전부 반영한다:
   ① 러닝·이정표 cross2: 스플릿→휴식(스플릿 미시딩 결함 보완)
   ② 러닝·스플릿 축: 축 자체 삭제(교차짝 행 제외)
   ③ 러닝·시간대 R-T3: cross 축내→축간(주기)
   ④ 러닝·휴식 축내짝: R-X3 ↔ R-X1(다른 두 계열은 규칙4에 따라 축 간만)
   ⑤~⑦ 표기 오류(축 수·계열 수) — condition_json에 영향 없음, 스킵.
6. `min_level` — 대상 축(보완축)이 무한레벨형(rarity IS NULL)이면 `min_rarity` 대신
   `min_level`을 쓴다(②-b, crossGate.ts 확장). 값은:
   - Epic→Mystic(2단, min_rarity='rare' 상당) 참조 시 **5** — 무한레벨 자체의
     "Lv.5~7 = cross 관문 진입"(걷기 K1 사다리 정본)이 그 계열의 Rare 상당 난이도
     경계이므로, 그 값을 그대로 "보완 축 Rare 이상"의 등가 기준으로 쓴다.
   - Rare→Epic(1단, 등급 제한 없음="보유"만 확인) 참조 시 — min_level을 넣지 않는다
     (Lv.1 보유만으로 충분하다는 것이 원래 설계 의도라 자동통과가 아니다).
   - 이 스크립트가 찾은 11건(무한레벨 축이 보완 축으로 지정된 사례)은 출력의
     `_meta.min_level_적용` 목록에 전부 기록한다.
7. 무한레벨형 자기 자신의 게이트 구간 — 걷기 K1·K2·K3 사다리 원본이 명시한
   "Lv.5~7=cross, Lv.8+=cross2+mission"을 5종목의 모든 "누적" 무한레벨 계열에
   동일 비율로 적용한다(4종목 사다리에는 이 표시가 없어 B1이 비워둔 항목 — 걷기와
   같은 성장비(약 1.6~1.7배/레벨)를 공유하므로 상대적 난이도가 같다고 본다. [INFO]).

## 출력
- v5_gate_mapping.json — family_key(또는 레벨 구간) → 병합할 condition_json 조각.
  이 스크립트가 유일한 손타는 지점이고, 이후 SQL 생성은 이 JSON만 읽는다(재현 가능).
"""
import json
import re
from pathlib import Path
from collections import defaultdict

HERE = Path(__file__).resolve().parent

def load(name):
    with open(HERE / name, encoding="utf-8") as f:
        return json.load(f)

rows = load("seed_v5_activity_badges.rows.json")
design = load("v5_catalog_design.json")
verified = load("v5_catalog_verified.json")
mission_badges = load("v5_mission_badges.json")
mission_axis_groups = load("v5_mission_axis_groups.json")

SPORT_KEY = {
    "걷기": "walking",
    "러닝": "running",
    "자전거": "cycling",
    "등산": "hiking",
    "트레일러닝": "trail_running",
    "트레일": "trail_running",
}
EXCLUDED_AXES = {"미션", "기록", "보너스"}

# ── ① family_key → 정본 행 목록 (실측 정답지) ──────────────────────────────
fam_rows = defaultdict(list)
for r in rows:
    fam_rows[r["family_key"]].append(r)


def strip_code_prefix(code: str) -> str:
    """'R-K1' -> 'K1'. 걷기 코드('M1' 등)는 접두어가 없어 그대로 돌아온다."""
    m = re.match(r"^[A-Z]+-(.+)$", code)
    return m.group(1) if m else code


# ── ② code(접두어 제거) -> 축(제네릭) 매핑, 스포츠별 ─────────────────────
axis_of_code = {}  # (sport_key, code) -> axis_kr
for grp in design["걷기"]["계열"]:
    axis = grp["axis"]
    for f in grp["fams"]:
        axis_of_code[("walking", strip_code_prefix(f["code"]))] = axis

sport_axis_order = defaultdict(list)  # sport_key -> [axis_kr...] (그룹 순서, 게이트 대상만)
for sp in design["four종목"]["종목"]:
    sk = SPORT_KEY[sp["name"]]
    for grp in sp["groups"]:
        axis = grp.get("axis")
        if not axis:
            continue
        for f in grp.get("fams", []):
            axis_of_code[(sk, strip_code_prefix(f["code"]))] = axis
        if axis not in EXCLUDED_AXES:
            sport_axis_order[sk].append(axis)

# ── ③ 축 -> 그 축에 속한 family_key 목록 (실제 시딩된 것만) ────────────────
axis_families = defaultdict(list)  # (sport_key, axis_kr) -> [family_key,...]
for family_key, fam_row_list in fam_rows.items():
    sport, code = family_key.split(":", 1)
    axis = axis_of_code.get((sport, code))
    if axis is None:
        continue
    axis_families[(sport, axis)].append(family_key)

# ── ④ 걷기 축간교차(9행) + 축내교차짝(20행) 파싱 ───────────────────────────
walking_axis_cross = {}  # (sport_key, axis_kr) -> {"internal_flag": bool, "stage1_axis": str|None, "stage2_axis": str|None}
for row in design["걷기"]["축간교차"]:
    axis, _group, col3, col4, _desc = row
    if col3 == "—":
        walking_axis_cross[("walking", axis)] = {"internal_flag": False, "stage1_axis": None, "stage2_axis": None}
        continue
    internal = col3 == "축 내"
    walking_axis_cross[("walking", axis)] = {
        "internal_flag": internal,
        "stage1_axis": None if internal else col3,
        "stage2_axis": col4,
    }

walking_internal_pairs = {}  # family_code(e.g. 'A1') -> partner_code('A10')
_code_re = re.compile(r"^([A-Z]\d+)\s")
for row in design["걷기"]["축내교차짝"]:
    fam_label, partner_label, _note = row
    fam_code = _code_re.match(fam_label).group(1)
    partner_code = _code_re.match(partner_label).group(1)
    walking_internal_pairs[fam_code] = partner_code

# ── ⑤ 4종목 교차짝(46행) 파싱 + 닉네임→제네릭축 변환 ───────────────────────
# 교차짝 테이블의 축 이름은 종목별 별명(페이스·롱런·최고속도 등)을 쓴다. groups 순서와
# 교차짝 행 순서가 종목별로 1:1 대응하므로(기록·보너스 제외), 위치로 별명→제네릭을 그대로
# 복원한다 — 손으로 짝짓지 않는다.
four_rows_by_sport = defaultdict(list)
for row in design["four종목"]["교차짝"]:
    sport_kr, axis_nick, col3, col4, _color = row
    four_rows_by_sport[SPORT_KEY[sport_kr]].append([axis_nick, col3, col4])

nickname_to_generic = {}  # (sport_key, nickname) -> axis_kr
four_axis_cross = {}  # (sport_key, axis_kr) -> {internal_flag, stage1_axis, stage2_axis}
for sk, seq in four_rows_by_sport.items():
    generic_order = sport_axis_order[sk]
    assert len(seq) == len(generic_order), (sk, len(seq), len(generic_order))
    for (axis_nick, col3, col4), axis_kr in zip(seq, generic_order):
        nickname_to_generic[(sk, axis_nick)] = axis_kr

for sk, seq in four_rows_by_sport.items():
    generic_order = sport_axis_order[sk]
    for (axis_nick, col3, col4), axis_kr in zip(seq, generic_order):
        internal = col3.startswith("축 내")
        stage1_axis = None if internal else nickname_to_generic.get((sk, col3), col3)
        stage2_axis = nickname_to_generic.get((sk, col4), col4)
        four_axis_cross[(sk, axis_kr)] = {
            "internal_flag": internal,
            "stage1_axis": stage1_axis,
            "stage2_axis": stage2_axis,
        }

# ── ⑥ 교차게이트_정정 7건 적용 ─────────────────────────────────────────────
# ① 러닝·이정표 cross2: 스플릿 -> 휴식
four_axis_cross[("running", "이정표")]["stage2_axis"] = "휴식"
# ② 러닝·스플릿 축 삭제 — 게이트 대상에서 제외(가족 자체가 시딩되지 않아 이미 axis_families에 없음)
four_axis_cross.pop(("running", "스플릿"), None)
sport_axis_order["running"] = [a for a in sport_axis_order["running"] if a != "스플릿"]
# ③ 러닝·시간대 R-T3: cross 축내 -> 축간(주기) — 계열 단위 예외이므로 family override로 처리
FAMILY_OVERRIDE_STAGE1_AXIS = {
    ("running", "T3"): "주기",
}
# ④ 러닝·휴식 축내짝: R-X3 <-> R-X1 (X1·X2는 축 내 페어 없음 — 규칙4)
FOUR_SPECIES_INTERNAL_PAIRS = {
    ("running", "X3"): "X1",
}
# ⑤~⑦ 표기 오류(축 수/계열 수) — condition_json에 영향 없음, 반영하지 않는다.

# ── ⑦ 자명한 2계열 축 내 페어(4종목) 자동 생성 ─────────────────────────────
# 축이 정확히 2계열뿐이면 서로가 유일한 상대다(달리 해석의 여지가 없다).
for (sk, axis_kr), info in four_axis_cross.items():
    if not info["internal_flag"]:
        continue
    members = sorted(fk.split(":", 1)[1] for fk in axis_families.get((sk, axis_kr), []))
    if len(members) == 2:
        a, b = members
        FOUR_SPECIES_INTERNAL_PAIRS.setdefault((sk, a), b)
        FOUR_SPECIES_INTERNAL_PAIRS.setdefault((sk, b), a)

# ── ⑧ 무한레벨(leveled) 축 판별 ────────────────────────────────────────────
def is_leveled_axis(sport_key: str, axis_kr: str) -> bool:
    fks = axis_families.get((sport_key, axis_kr), [])
    return bool(fks) and fam_rows[fks[0]][0]["level"] is not None


# ── ⑨ 미션 보상 배지 → 축 매핑 (gate_mission_badge 대상) ──────────────────
mission_family_of = {}  # (sport_key, axis_kr) -> family_key (미션 보상 배지)
for grp in design["걷기"]["계열"]:
    if grp["axis"] != "미션":
        continue
    for f in grp["fams"]:
        opens_axis = f["opens"].replace(" 축", "")
        mission_family_of[("walking", opens_axis)] = f"walking:{f['code']}"

for entry in mission_badges["배지"]:
    sk = SPORT_KEY[entry["sport"]]
    code = strip_code_prefix(entry["code"])
    family_key = f"{sk}:{code}"
    for axis_kr in entry["여는축"]:
        if (sk, axis_kr) not in sport_axis_order.get(sk, []) and (sk, axis_kr) not in [
            (s, a) for s, a in four_axis_cross if s == sk
        ]:
            continue  # 삭제된 축(러닝 스플릿 등) 대상은 건너뛴다 — 정정 ②
        mission_family_of[(sk, axis_kr)] = family_key

# ── ⑩ 계열 하나에 게이트 조각을 만드는 본 함수 ────────────────────────────
MIN_LEVEL_FOR_MYSTIC_STAGE = 5  # 규칙6 — 걷기 K1 사다리의 "Lv.5~7=cross" 경계를 그대로 쓴다
LEVELED_SELF_GATE = {"stage1": (5, 7), "stage2": (8, None)}  # 규칙7

min_level_applied = []  # alerts용 — "누적 축을 관문으로 지정한 교차짝" 11건 실측(0110 잔여 이슈)


def axis_requirement(sport_key, axis_kr, min_rarity=None, stage="epic_to_mystic", caller_axis=None):
    """대상 축 하나를 가리키는 BadgeGateRequirement 조각.

    `stage`·`caller_axis`는 alerts 집계용 표식일 뿐 조건에는 반영되지 않는다(규칙6: 1단
    참조는 min_level을 채우지 않는다 — "보유"만으로 충분한 것이 원래 설계 의도라 자동통과가
    아니다).
    """
    family_keys = sorted(axis_families.get((sport_key, axis_kr), []))
    req = {"family_keys": family_keys}
    if not family_keys:
        return req  # 정정으로 삭제된 축 등 — 호출부가 빈 목록이면 걸지 않는다
    if is_leveled_axis(sport_key, axis_kr):
        if min_rarity == "rare":
            req["min_level"] = MIN_LEVEL_FOR_MYSTIC_STAGE
        min_level_applied.append(
            {
                "sport": sport_key,
                "caller_axis": caller_axis,
                "target_axis": axis_kr,
                "stage": stage,
                "min_level_set": req.get("min_level"),
            }
        )
    elif min_rarity:
        req["min_rarity"] = min_rarity
    return req


mapping = {}  # family_key -> {"epic": {...cond 조각...}, "mystic": {...}} 또는 레벨형은 "level_ranges"
alerts = []

for (sport_key, axis_kr), cross_info in {**walking_axis_cross, **{k: v for k, v in four_axis_cross.items()}}.items():
    if axis_kr in EXCLUDED_AXES:
        continue
    if cross_info["stage1_axis"] is None and cross_info["stage2_axis"] is None and not cross_info["internal_flag"]:
        continue  # "기록" 류 게이트 없음 축(걷기 축간교차의 "—","—")

    family_keys = axis_families.get((sport_key, axis_kr), [])
    if not family_keys:
        alerts.append(f"[INFO] {sport_key}:{axis_kr} 축은 설계에 있으나 실제 시딩된 계열이 없다 — 건너뜀")
        continue

    mission_target = mission_family_of.get((sport_key, axis_kr))
    if not mission_target:
        alerts.append(f"[WARN] {sport_key}:{axis_kr} 축에 연결된 미션 보상 배지를 찾지 못했다 — gate_mission_badge 미설정")

    for family_key in family_keys:
        code = family_key.split(":", 1)[1]
        stage1_axis = FAMILY_OVERRIDE_STAGE1_AXIS.get((sport_key, code), cross_info["stage1_axis"])

        # ── 축 내 페어 ──
        internal_partner = None
        if cross_info["internal_flag"] and (sport_key, code) not in FAMILY_OVERRIDE_STAGE1_AXIS:
            if sport_key == "walking":
                internal_partner = walking_internal_pairs.get(code)
            else:
                internal_partner = FOUR_SPECIES_INTERNAL_PAIRS.get((sport_key, code))

        epic_cond = {}
        if internal_partner:
            epic_cond["cross_in_axis"] = {"family_keys": [f"{sport_key}:{internal_partner}"]}
        # 1단(Epic) 보완축 — 이미 cross_in_axis로 채워졌으면 축간교차를 추가하지 않는다
        # (마스터 티켓의 "축 내 OR 축 간"은 축 단위 선택이지, 매 계열마다 두 수단을 동시에
        # 얹으라는 뜻이 아니다 — 실제로 페어가 없는 계열에서만 stage2_axis로 대신한다, 규칙4).
        stage1_target = stage1_axis or (
            cross_info["stage2_axis"] if (cross_info["internal_flag"] and not internal_partner) else None
        )
        if stage1_target:
            epic_cond["cross_between_axis"] = axis_requirement(
                sport_key, stage1_target, stage="rare_to_epic", caller_axis=axis_kr
            )
        if not epic_cond:
            alerts.append(f"[WARN] {sport_key}:{family_key} Rare→Epic 관문을 구성하지 못했다(원본 데이터 부족)")

        mystic_cond = {}
        if cross_info["stage2_axis"]:
            mystic_cond["cross_between_axis"] = axis_requirement(
                sport_key, cross_info["stage2_axis"], min_rarity="rare", caller_axis=axis_kr
            )
        if mission_target:
            mystic_cond["gate_mission_badge"] = {"family_keys": [mission_target]}

        is_leveled = fam_rows[family_key][0]["level"] is not None
        mapping[family_key] = {
            "sport": sport_key,
            "axis": axis_kr,
            "leveled": is_leveled,
            "epic_condition": epic_cond,
            "mystic_condition": mystic_cond,
        }

# ── ②-b 집계 — "누적 축을 관문으로 지정한 교차짝 11건"(0110 잔여 이슈) 실측 ────────────
# axis_requirement()가 매 계열 호출마다 기록하므로 (sport, target_axis, stage) 단위로
# 중복 제거해 "관문 11건"을 센다 — 계열 수가 아니라 "그 축이 보완 축으로 지정된 관계" 수다.
unique_min_level_refs = {
    (a["sport"], a["caller_axis"], a["target_axis"], a["stage"]): a for a in min_level_applied
}
alerts.append(
    f"[INFO] 무한레벨 축이 보완 축(교차짝)으로 지정된 사례 {len(unique_min_level_refs)}건 "
    f"(0110이 예고한 '11건'과 대조 — 관계 단위로 셌다). Epic→Mystic(min_level={MIN_LEVEL_FOR_MYSTIC_STAGE} "
    "적용) / Rare→Epic(보유만 요구, min_level 미적용 — 원설계가 이미 '보유'만 요구해 자동통과가 아님): "
    + ", ".join(f"{s}:{caller}→{target}({st})" for (s, caller, target, st) in sorted(unique_min_level_refs))
)

output = {
    "_meta": {
        "무엇": "2단 교차 게이트 축→계열 확장 매핑 정본 — 티켓 20260906_1947 ①",
        "생성": "v5_gate_mapping_build.py (기계적 추출, 손으로 쓰지 않음)",
        "family_수": len(mapping),
        "min_level_적용_11건": min_level_applied,
        "alerts": alerts,
    },
    "families": mapping,
}

out_path = HERE / "v5_gate_mapping.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=1)

print(f"families: {len(mapping)}")
print(f"min_level 적용: {len(min_level_applied)}건")
for a in alerts:
    print(a)
