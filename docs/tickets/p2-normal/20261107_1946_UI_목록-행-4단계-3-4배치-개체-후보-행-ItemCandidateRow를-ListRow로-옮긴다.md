---
id: "20261107_1946"
category: UI
priority: P2
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
specs:
  - jam-web/design-system/components/patterns/ListRow.jsx
  - docs/service/prd/inventory/PRD.md
---

# [UI] 목록 행 4단계 3-4배치: 개체 후보 행(`ItemCandidateRow`)을 서비스용 ListRow로 옮긴다

## 핵심 요약

- 요구사항: 드랍·픽업·장착·컬렉션 슬롯 선택 시트에서 개체를 고르는 `ItemCandidateRow`를 `ListRow`로 옮긴다(1단계 B7). 상위 티켓 4단계 3배치의 네 번째 회차다. 3-3이 머지된 뒤 시작한다. 선택 상태·비활성·잠김·만료가 얽혀 있어 이 행 하나만 다룬다.
- 구현 계획: 채원 사전 판정(매핑표·판정 5건 확정) → 아현 구현 → 민지 게이트 → 채원 사후 리뷰. 파일 단위 계획은 «구현 계획».
- 관련 파일: `jam-web/src/components/inventory/ItemCandidateRow.tsx`(전체 146줄, import 4줄, 행 99~144줄, 좁은 폭 계산 주석 41줄 근처), 시험 `jam-web/src/components/inventory/ItemCandidateRow.test.tsx`(`ItemCandidateRow`를 쓰는 다른 시트의 시험이 마크업을 읽는지 `grep`으로 확인), `jam-web/src/components/ui/ListRow.tsx`(읽기만).

## 배경 / 문제 정의

이 행은 정보가 가장 얽혀 있다. 등급 칩, 일련번호(`ItemSerialCode`, 높이 40px, 릴 연출 꺼짐), 만료 임박 칩, 잠긴 개체의 «필요 포인트» 문구가 세로로 쌓이고, 선택된 행은 `inset` 링(`--link`)으로 표시하며, `muted`면 투명도 40%에 `disabled`다. 오른쪽에는 호출부가 넣는 `trailing`이 있다. `ListRow`는 `selected`(플랫 톤이 아니면 링 표시)와 `disabled`를 이미 지원한다. 1단계 조사의 B7 행이다.

## 사용자 결정 (1~3단계에서 확정된 것, 이 배치에 그대로 적용)

- 시간은 12px muted. `eyebrow`가 있으면 그 줄 오른쪽 끝, 없으면 제목 줄 오른쪽 끝(`time` 슬롯).
- lead(썸네일)는 모든 행에서 48px 한 가지. `ListRow` 본체에 크기 prop은 없다.
- 새 토큰·MODULAR 변경은 하지 않는다. 서비스 사본 `jam-web/src/components/ui/ListRow.tsx`를 그대로 쓴다. 값이 모자라면 사본을 고치지 말고 보고한다(`ds:check` 쌍 대조).
- 1·2배치(20261106_2252, 20261107_0010, 20261107_0011)에서 확정된 규칙을 따른다: 빈 슬롯은 `undefined`로 넘긴다(`false`·빈 fragment 금지), lead 안 이미지는 `alt=""`(장식), 클릭 영역 안은 phrasing 요소만 쓴다(`<div>`·`<p>` 금지), 칩 높이는 측정만 하고 호출부에서 덮지 않는다(티켓 20261106_2322).
- `ListRow`는 `<style>`을 행마다 함께 내보내므로 정적 마크업(`renderToStaticMarkup`)의 `href=`·텍스트 검사는 style을 먼저 걷어야 한다(2-2에서 `kindPreview.test`·`TierUpPanel.test`가 이렇게 고쳐졌다. 티켓 20261107_1815).
- 실렌더는 메인 트리 개발 서버(`preview_start jam-web`)에서 320px로 확인한다. 격리 워크트리에서는 `next dev`가 뜨지 않는다.

## 범위

1. `ItemCandidateRow`를 `ListRow` 기반으로 다시 쓴다. 바깥 prop(`candidate`·`rarity`·`selected`·`muted`·`trailing`·`onClick` 등)과 export는 바꾸지 않는다.
   - 등급 칩은 `eyebrow`(`RarityBadge`, 8px는 티켓 20261106_2322 범위라 보정하지 않는다), 일련번호(`ItemSerialCode`)는 `title`(판정 1), 만료 임박 칩과 잠긴 개체의 «필요 포인트»는 `meta`·`chips` 중 판정(판정 2), 호출부의 `trailing`은 `trail`.
   - 선택은 `selected`, 비활성은 `disabled={muted}`다. 지금의 `shadow-[inset_0_0_0_2px_var(--link)]`·`opacity-40 pointer-events-none` 클래스는 `ListRow`가 대신하므로 걷는다(판정 3, 4).
2. 시험: `ItemCandidateRow.test.tsx`의 마크업 고정 단언을 새 마크업 기준으로 고친다. 의미(선택 표시, 비활성 시 클릭 차단, 만료 임박 칩 표시, 잠김 문구·포인트 0일 때 무료 문구, 등급 칩)는 유지한다.
3. 문서: 인벤토리·개체 선택 시트 PRD 절(`docs/service/prd/inventory/PRD.md`에서 행 모양을 다루는 곳을 찾는다, 없으면 갱신 대상 없음으로 보고)에 행 모양 변경 한 줄, 상위 티켓 4단계 표.

범위 밖: `ItemSerialCode`의 내부 마크업과 크기, 선택 시트(`BottomSheet`)·호출부 로직, 후보 정렬·필터, `ListRowCard` 삭제.

## 매핑표 (채원이 사전 판정에서 확정·교정한다)

| 현재 | `ListRow` |
|---|---|
| 등급 칩(`RarityBadge`) | `eyebrow` |
| 일련번호(`ItemSerialCode` 높이 40) / 잠김일 때 «필요 포인트» 굵은 16 | `title` 또는 `meta`(판정 1) |
| 만료 임박 칩(12 굵게 테두리) | `chips`/`meta` 중 판정(판정 2) |
| `selected` → inset 링 `--link` 2px | `selected` |
| `muted` → `opacity-40 pointer-events-none` + `disabled` | `disabled` |
| `trailing`(호출부) | `trail` |

## 판정이 필요한 점 (채원 사전 판정 입력)

1. **일련번호의 자리**: `ItemSerialCode`는 높이 40의 장식적 일련번호 그래픽이다. `title`(16px 글자 자리)에 넣으면 행 높이가 커진다. `title`에 ReactNode를 넣는 것이 가능한지(phrasing 요소인지 포함: `<div>`면 클릭 영역 안에 둘 수 없다), 아니면 `meta`에 두는지 정한다. 이 행에서는 사용자가 «이미 가진 번호들을 읽고 비교해서 고르는» 것이 목적이라 번호가 가장 눈에 띄어야 한다.
2. **만료 임박 칩**: 칩을 `ListRowChip`(12px 일반)으로 바꿀지, 지금의 `shadow-[inset 0 0 0 1px --border]` 테두리 칩 모양을 살릴지 정한다. «한 행에 색 강조 한 곳» 규칙과 맞는지도 본다.
3. **선택 링과 면**: `ListRow`의 `selected`가 기본 톤(`default`)에서 지금과 같은 2px `--link` 링을 그리는지, 선택 시 `aria-pressed`가 붙는지 확인한다.
4. **`muted`의 투명도**: `disabled`일 때 `ListRow`가 주는 시각(투명도 값)이 지금의 `opacity-40`과 같은지, 더 흐리거나 덜 흐린지 확인한다. 같지 않으면 그 차이를 받아들일지 정한다(호출부에서 덮지 않는다).
5. **좁은 폭 계산**: 41줄 근처 주석은 320px에서 행 콘텐츠 폭을 `320 − 시트 좌우 패딩 32 − ListRowCard 안쪽 패딩…`으로 계산해 일련번호(`SELECT_SERIAL_HEIGHT_PX`)가 들어가는 한계를 적어 둔다. `ListRow`로 옮기면 안쪽 패딩·lead 유무·`trail` 폭이 달라지므로, 새 폭을 `offsetWidth`로 실측해 주석과 `SELECT_SERIAL_HEIGHT_PX` 값이 여전히 맞는지 확인한다(추정으로 역산하지 않는다).

## 구현 계획

파일 단위 계획(계획 반환 면제 사유: 변경 파일 1개 + 시험 1개이고 위치와 prop이 확정돼 있어 탐색이 필요 없다. 시험 마크업 고정이 많아 100줄 안팎이 될 수 있다).

1. `ItemCandidateRow.tsx` — import 4줄 `ListRowCard` → `ListRow`·`ListRowChip`. 99~144줄을 `ListRow` 호출 한 번으로 다시 쓴다. 41줄·105줄 주석의 `ListRowCard` 설명은 새 사실에 맞게 고친다.
2. `ItemCandidateRow.test.tsx` — 마크업 고정 단언 수정. 이 컴포넌트를 쓰는 다른 시트 시험(`grep -rn ItemCandidateRow src`)이 클래스를 읽으면 같이 고친다.
3. 문서 두 곳.

## 완료 조건

### 구현 범위 (게이트 판정 대상)

- `ItemCandidateRow`가 `ListRow` 기반이다. 선택·비활성·잠김·만료 임박 표시가 기존과 같은 정보를 그린다.
- 320px에서 일련번호가 잘리지 않고 `trail`과 겹치지 않는다. 새 폭의 실렌더(`offsetWidth`) 값이 기록돼 있고, 필요하면 `SELECT_SERIAL_HEIGHT_PX`와 주석이 새 값에 맞게 고쳐져 있다.
- 비활성 행은 클릭뿐 아니라 키보드(Tab·Enter)로도 눌리지 않는다.
- 변경한 시험 파일과 `scripts/verify.sh`가 통과하고 `serviceLiteralColors` 시험이 통과한다.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)

- staging에서 드랍·픽업·장착·컬렉션 슬롯 선택 시트 확인과 Vercel 배포 상태 확인.
- 판정 1~5 결과를 상위 티켓 «3배치 진행» 절에 기록하고 3-5의 판정(순위 행)을 시작한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
