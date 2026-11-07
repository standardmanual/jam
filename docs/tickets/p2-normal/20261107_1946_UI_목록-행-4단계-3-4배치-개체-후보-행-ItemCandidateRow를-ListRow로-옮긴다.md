---
id: "20261107_1946"
category: UI
priority: P2
status: CLOSED
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
## 완료 기록

### 구현 내용 요약

- `ItemCandidateRow`를 `ListRow` 한 번 호출로 다시 썼다(바깥 prop·export 유지). 등급 칩은 `eyebrow`(Common·없음이면 `undefined`), 일련번호나 «N 포인트 필요»는 `title`, 만료 임박은 `chips`의 `ListRowChip tone="neutral"`이다. `selected={selected || undefined}`, `disabled={muted}`, `trail={trailing}`, `onClick`을 넘기고 `ListRowCard` import를 걷었다.
- 일련번호 높이를 40에서 28로 낮췄다(`SELECT_SERIAL_HEIGHT_PX`). 아래 실측 때문이며 사용자가 승인한 (a)안이다. 주석의 «시트 패딩 32»를 실제 값(24씩)으로 고쳤다.
- 시험 `ItemCandidateRow.test.tsx`: `aria-pressed` 유무, `muted`의 `<button disabled>`, 만료 칩 표시와 부재(7일 초과·잠김), Common·없음 등급에서 eyebrow 줄 없음, `trailing`이 trail 자리에 그려짐을 추가하고 기존 단언은 `<style>`을 걷는 헬퍼로 바꿨다. 문서는 인벤토리 PRD 1줄과 상위 티켓 4단계 표.

### 채원 사전 판정 (needsApproval: true → 사용자 승인 후 진행)

1. 일련번호는 `title`에 둔다(`meta`는 14px 일반 줄이라 번호가 가장 눈에 띄어야 한다는 목적과 어긋난다).
2. 만료 임박 칩은 `ListRowChip`(neutral)으로 바꾼다.
3. 선택은 `selected`로 넘기되 항상 `false`를 넘기지 않고 `selected || undefined`로 넘긴다(이 시트의 행은 «고르면 실행되는» 행이라 `aria-pressed="false"`가 어색하다). 기본 톤의 `selected`는 링 색이 `--link`에서 `--foreground`로 바뀌고 오른쪽에 체크 아이콘이 자동으로 붙는다.
4. 비활성 투명도는 0.4로 옛 `opacity-40`과 같고 `disabled`가 키보드(Tab·Enter)도 막는다.
5. 좁은 폭에서 일련번호가 모자랄 수 있어 실측 뒤 승인 항목으로 올린다.

승인 항목 4건(선택 행 모양 변경, 만료 칩 모양 변경, 번호 폭 부족 시 높이를 낮추는 (a)안, `ItemSerialCode` 루트 div→span 후속 티켓)을 사용자가 채원 추천대로 승인했다(2026-11-07). 후속 `ds` 티켓은 20261107_2121이다.

### 게이트 결과 (민지 WARN, 채원 사후 중대 문제 없음)

- 브랜치 CI `verify` success(run 42373067501).
- WARN 사유: 폭 실측이 격리 환경의 시스템 글꼴 대체 하네스 값이라 실제 앱(Noto Sans KR) 렌더에서는 미측정이었다. 머지 뒤 메인 트리에서 확인했다(아래).
- 사용자가 머지를 승인했다(2026-11-07).

### 실측 (320px, 시트 좌우 패딩 24씩, 행 폭 272)

- 아현의 하네스 값(대체 글꼴): 본문 폭 기본 238→238, 선택 238→206, 선택+처리 중 187→159(옛 행→새 행). 높이 40이면 번호 폭이 약 212.4px라 선택에서 6.4px, 선택+처리 중에서 52.9px 모자란다. 옛 행도 선택+처리 중에서 24.9px 넘쳐 있었다(기존 문제). 높이 28이면 번호 폭이 약 148.6px라 세 상태 모두 들어가고 가장 좁은 상태에서 10.9px 여유가 있다.
- 메인 트리 실제 앱 확인(컬렉션 화면의 «교체» 시트, 테스트 계정): 후보 행 높이 54(28 + 안쪽 패딩 24 + 테두리 2), 행 폭 272, 본문 폭 **238**(기본 상태, 하네스 값과 같다), 일련번호 타일 5개 폭 합 **149**(하네스 148.6과 같다), 타일 높이 28, 가로 넘침 없음. 선택 상태의 본문 폭은 체크 아이콘이 32px를 차지하는 계산으로 206이고 번호 149가 들어간다(여유 약 57px).
- 확인하지 못한 것: 후보가 하나뿐이고 선택·처리 중 상태를 만들려면 장착을 실행해야 해서(쓰기 동작) 선택+처리 중 상태는 실제 앱에서 재지 못했다. 이 상태는 하네스 값(여유 10.9px)에만 의존한다. 잠김 후보, 만료 임박 칩 행, 드랍·픽업·장착 시트는 테스트 계정 데이터에 없어 확인하지 못했다. 360·390px도 측정하지 못했다.

### 변경된 파일

```
jam-web/src/components/inventory/ItemCandidateRow.tsx
jam-web/src/components/inventory/ItemCandidateRow.test.tsx
docs/service/prd/inventory/PRD.md (행 모양 1줄)
docs/tickets/p2-normal/20261106_1750_… (상위 티켓 4단계 표)
```

### 테스트 결과
- [x] 브랜치 CI `verify` success, `scripts/verify.sh` 전 항목 통과(아현 실행), `commonLiteralColors` 통과
- [x] 기본 상태 실제 앱 측정 완료(본문 238, 번호 149, 행 높이 54)
- [ ] 선택+처리 중 상태 실제 앱 측정, 잠김·만료 임박 후보, 360·390px: 측정하지 못함
- [ ] staging 화면 확인과 Vercel 배포 상태: push 뒤 확인

### 주요 의사결정 / 핵심 메모

- 눈에 띄는 변화는 모두 승인된 것이다: 일련번호가 약 30% 작아짐(높이 40→28, 글자 약 14px, 자간 +8% 고정), 선택 행의 검정 링과 체크, 만료 칩이 일반 12px 연한 면 칩.
- 높이 29도 5px 여유로 들어간다. 아현이 글꼴 오차를 감안해 28을 골랐다. 선택+처리 중 실제 앱 값이 필요하면 29 조정을 검토한다.
- 판정 단계에서 워크플로가 승인 대기로 멈췄고, 승인된 판정을 주입한 스크립트 사본(`jam-work-3-4-approved.js`)으로 이어서 실행했다.
- 후속: `ItemSerialCode` 루트 div→span(`ds`, 티켓 20261107_2121).

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1회차(판정 단계에서 승인 대기로 정지) | 1 | 67,702 | 채원 사전 판정 단독 | 2분 20초 | 15 |
| 2회차(승인 후 구현·게이트) | 3 | 221,628 | 23,126 / 18,755 | 20분 5초 | 93 |
| 합계 | 4 | 289,330 | 23,126 / 18,755 | 22분 25초 | 108 |
