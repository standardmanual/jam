# -*- coding: utf-8 -*-
"""v5 미션 보상 배지 32종 검증 — 티켓 20260905_0035 B묶음 선행 조건 ⑥

  python3 "Service Plan/Specs/Content/v5_mission_badges_verify.py"

검사 항목
  ① 이름 유일성 — 168계열(v5_catalog_writing.json) + 미션 32종 = 200개가 전부 유일한가
  ② 코드 유일성 — 접두어 Q가 기존 168계열 코드와 충돌하지 않는가
  ③ 축 커버리지 — 종목별 게이트 대상 축(기록·보너스 제외)이 빠짐·중복 없이 열리는가
  ④ 축 배정 일치 — v5_mission_axis_groups.json의 확정 배정과 한 글자도 다르지 않은가
  ⑤ 라이팅 규칙 — 등급명 노출·금지 용어·「주」 표기·설명의 이름 반복
"""
import json, os, re, sys, collections

BASE = os.path.dirname(os.path.abspath(__file__))
load = lambda n: json.load(open(os.path.join(BASE, n), encoding="utf-8"))

writing = load("v5_catalog_writing.json")
mission = load("v5_mission_badges.json")
groups = load("v5_mission_axis_groups.json")
design = load("v5_catalog_design.json")

fail = []
def check(ok, label, detail=""):
    print(("  OK  " if ok else " FAIL ") + label + (" — " + detail if detail else ""))
    if not ok:
        fail.append(label)

base_rows = [r for rows in writing["계열"].values() for r in rows]
mis_rows = mission["배지"]

print("① 이름 유일성")
names = [r["이름"] for r in base_rows] + [r["이름"] for r in mis_rows]
dup = [n for n, c in collections.Counter(names).items() if c > 1]
check(len(names) == 200, "이름 총 200개", f"{len(base_rows)} + {len(mis_rows)} = {len(names)}")
check(not dup, "이름 중복 0건", str(dup))

print("② 코드 유일성")
codes = [r["code"] for r in base_rows] + [r["code"] for r in mis_rows]
dupc = [c for c, n in collections.Counter(codes).items() if n > 1]
check(not dupc, "코드 중복 0건", str(dupc))
axis_letters = {re.sub(r"^[A-Z]-", "", c)[0] for c in (r["code"] for r in base_rows)}
check("Q" not in axis_letters, "기존 축 문자에 Q 없음", "사용 중: " + "".join(sorted(axis_letters)))

print("③ 축 커버리지")
for sp, v in mission["축_커버리지"].items():
    gate = [g["axis"] for s in design["four종목"]["종목"] if s["name"] == sp
            for g in s["groups"] if g["axis"] not in ("기록", "보너스")]
    check(sorted(gate) == sorted(v["게이트_대상_축"]), f"{sp} 게이트 대상 축 일치")
    # ⚠️ 「빠진_축」·「중복_배정_축」 필드를 읽지 않는다. 그건 JSON이 스스로 「없다」고
    # 선언한 값이라, 커버리지가 깨져도 그 두 배열만 비어 있으면 통과한다(게이트 리뷰
    # 발견물). 배지의 「여는축」에서 직접 계산해 대조한다.
    opened = [a for r in mission["배지"] if r["sport"] == sp for a in r["여는축"]]
    missing = sorted(set(gate) - set(opened))
    extra = sorted(set(opened) - set(gate))
    check(not missing, f"{sp} 빠진 축 0", "빠짐: " + ",".join(missing))
    check(not extra, f"{sp} 대상 밖 축 0", "초과: " + ",".join(extra))

print("④ 축 배정 일치 (v5_mission_axis_groups.json 확정본)")
assigned = {}
for row in groups["4종목_축묶음"]:
    for sp, ax in row["종목별"].items():
        assigned[(sp, ax)] = row["미션"]
check(len(assigned) == 32, "확정 배정 32건", str(len(assigned)))
mine = {(r["sport"], r["여는축_배정"]) for r in mis_rows}
check(mine == set(assigned), "배정 32건 완전 일치",
      "누락 " + str(set(assigned) - mine) + " / 추가 " + str(mine - set(assigned)))

print("⑤ 라이팅 규칙")
banned = ["Common", "Rare", "Epic", "Mystic", "커먼", "레어", "에픽", "미스틱",
          "발급", "취득", "언락", "해금", "스탬프"]
for r in mis_rows:
    body = r["이름"] + " " + r["설명"] + " " + r["조건"]
    hit = [w for w in banned if w in body]
    check(not hit, f"{r['code']} 금지 용어 없음", str(hit))
    check(r["이름"] not in r["설명"], f"{r['code']} 설명이 이름을 반복하지 않음")
    check(r["등급"] == [["epic", "미션 완료"]], f"{r['code']} 등급 epic 1종")
    check(r["조건"] == f"미션 '{r['미션_달성조건']}' 완료", f"{r['code']} 조건문 형태")
    # 주 경계로 집계하는 조건에만 (월~일)
    m = r["미션_달성조건"]
    if "한 주에" in m or "매주" in m:
        check("(월~일)" in m, f"{r['code']} 주 경계 집계에 (월~일)", m)
    if r["sport"] == "등산":
        # 「주말」은 요일 축(H-D1 주말 산행)이라 허용한다. 막는 것은 주 단위 «집계»다
        주단위 = re.search(r"\d+주|한 주에|매주", m)
        check(not 주단위, f"{r['code']} 등산은 주 단위 집계 미사용", m)
        check(not re.search(r"심박|파워|케이던스", m), f"{r['code']} 등산 센서 조건 없음", m)

print()
print("실패 %d건" % len(fail))
sys.exit(1 if fail else 0)
