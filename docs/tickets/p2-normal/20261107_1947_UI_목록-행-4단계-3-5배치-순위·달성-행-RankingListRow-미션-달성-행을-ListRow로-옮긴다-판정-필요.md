---
id: "20261107_1947"
category: UI
priority: P2
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
specs:
  - jam-web/design-system/components/patterns/ListRow.jsx
  - docs/service/prd/ranking-board/
---

# [UI] 목록 행 4단계 3-5배치: 순위 행(`RankingListRow`)과 미션 달성 행을 서비스용 ListRow로 옮긴다 (경계 판정 필요)

## 핵심 요약

- 요구사항: 순위 행(`RankingListRow`, 1단계 C4: 홈 `ListCard`와 미션 현황의 순위 카드가 같은 컴포넌트를 쓴다)과 미션 달성 행(`AchievementRow`, C5)을 `ListRow`로 옮긴다. 상위 티켓 4단계 3배치의 다섯 번째 회차이고, **`ListRow` 슬롯으로 표현되지 않는 구성이 있어 채원의 경계 판정이 먼저다.** 3-4가 머지된 뒤 시작한다.
- 구현 계획: **1단계는 채원 사전 판정만 받아 사용자에게 승인을 구한다.** 판정이 «현재 슬롯으로 된다»면 같은 티켓에서 구현하고, «슬롯 추가나 MODULAR 변경이 필요하다»면 승인 항목으로 올려 멈춘다(`needsApproval`). 승인되면 `ds` 유형 하위 티켓을 따로 만든다.
- 관련 파일: `jam-web/src/components/ranking/RankingListRow.tsx`(전체 119줄, 행 56~117줄), `jam-web/src/app/(main)/missions/[id]/status/MissionStatusClient.tsx`(import 5줄, 달성 행 `AchievementRow` 312~338줄, 순위 행 호출부 포함), `jam-web/src/components/today/ListCard.tsx`(`RankingListRow`를 쓰는 홈 카드, 읽기만), 시험 `components/today/__tests__/ListCard.test.tsx`·`app/(main)/TodayCardStack.test.tsx`(`ListRowCard` 마크업을 읽는 곳), `jam-web/src/components/ui/ListRow.tsx`(읽기만).

## 배경 / 문제 정의

순위 행은 «순위 숫자(폭 20) + 36 원형 아바타»가 lead 자리에 가로로 놓이고, 이름 아래 진행 바(높이 6)가 있으며, 내 행만 순위 숫자와 값이 24px·`--link` 굵은 글씨로 커진다. 면은 늘 흰 카드 안이라 `tone="tint"`(테두리 없음)다. 달성 행은 36 원 아바타 + 이름(내 행만 굵게 + «(나)») + 오른쪽 칩(달성·미달성)이고, 위아래 패딩을 좁혀(`!py-2`) 한 줄로 촘촘하게 둔다. `ListRow`는 lead 48 한 가지, 값 16px 굵게 한 가지라 이 구성들이 그대로 표현되지 않는다.

## 사용자 결정 (1~3단계에서 확정된 것, 이 배치에 그대로 적용)

- 시간은 12px muted. `eyebrow`가 있으면 그 줄 오른쪽 끝, 없으면 제목 줄 오른쪽 끝(`time` 슬롯).
- lead(썸네일)는 모든 행에서 48px 한 가지. `ListRow` 본체에 크기 prop은 없다.
- 새 토큰·MODULAR 변경은 하지 않는다. 서비스 사본 `jam-web/src/components/ui/ListRow.tsx`를 그대로 쓴다. 값이 모자라면 사본을 고치지 말고 보고한다(`ds:check` 쌍 대조).
- 1·2배치(20261106_2252, 20261107_0010, 20261107_0011)에서 확정된 규칙을 따른다: 빈 슬롯은 `undefined`로 넘긴다(`false`·빈 fragment 금지), lead 안 이미지는 `alt=""`(장식), 클릭 영역 안은 phrasing 요소만 쓴다(`<div>`·`<p>` 금지), 칩 높이는 측정만 하고 호출부에서 덮지 않는다(티켓 20261106_2322).
- `ListRow`는 `<style>`을 행마다 함께 내보내므로 정적 마크업(`renderToStaticMarkup`)의 `href=`·텍스트 검사는 style을 먼저 걷어야 한다(2-2에서 `kindPreview.test`·`TierUpPanel.test`가 이렇게 고쳐졌다. 티켓 20261107_1815).
- 실렌더는 메인 트리 개발 서버(`preview_start jam-web`)에서 320px로 확인한다. 격리 워크트리에서는 `next dev`가 뜨지 않는다.

## 범위

1. 채원 사전 판정: 아래 «판정이 필요한 점»을 정한다. 슬롯 확장·MODULAR 변경이 필요하면 `needsApproval`로 멈추고 사용자 승인을 받는다.
2. 판정이 «현재 슬롯으로 된다»일 때만 구현한다.
   - `RankingListRow`: `tone="tint"`, lead·진행 바(`meta`에 `ProgressBar`)·`value`의 구성은 판정에 따른다.
   - `AchievementRow`: lead 아바타, `title`(내 행 굵게는 `titleVariant`), 오른쪽 칩은 `trail` 또는 `chips`(판정), 한 줄 촘촘 패딩의 처리는 판정.
3. 시험: `ListCard.test.tsx`·`TodayCardStack.test.tsx`의 마크업 고정 단언을 새 마크업 기준으로 고친다. 순위·값·내 행 강조·진행 바 비율의 의미는 유지한다.
4. 문서: 랭킹보드 PRD(`docs/service/prd/ranking-board/`에서 행 모양을 다루는 절), 홈 피드 카드 문서에서 순위 행을 다루는 곳, 상위 티켓 4단계 표.

범위 밖: 순위 계산·정렬 로직, `ListCard` 자체 구조, `ProgressBar` 모양, `ListRowCard` 삭제.

## 매핑표 (채원이 사전 판정에서 확정·교정한다)

| 현재 | `ListRow` (판정 필요) |
|---|---|
| lead: 순위 숫자(폭 20) + 36 원형 아바타 | `lead`는 아바타만, 순위 숫자 자리는 판정 1 |
| 이름 14/보통(내 행 굵게) | `title`(`titleVariant` 판정) |
| 이름 아래 진행 바(높이 6) | `meta` 안의 `ProgressBar` 또는 `footer`(media 전용) |
| `trailing` 값 14/굵게(내 행 24/굵게/`--link`) | `value`(16px 굵게 한 가지) |
| `tone="tint"` | `tone="tint"` |
| 달성 행 `trailing` 칩(달성·미달성 12) | `trail` 또는 `chips` |
| 달성 행 `!py-2` 한 줄 촘촘 | 판정 |

## 판정이 필요한 점 (채원 사전 판정 입력)

1. **순위 숫자 자리**: lead 48 박스 안에 숫자를 넣을지, 숫자를 lead 밖 왼쪽(`eyebrow`나 별도 칸)에 둘지, 숫자를 아바타 위에 겹칠지 정한다. `ListRow`에 «lead 앞 칸» 슬롯이 없다면 MODULAR 확장 승인 항목이다.
2. **내 행 강조**: 지금은 순위 숫자와 값이 24px·`--link`로 커져 행 높이가 달라진다. `ListRow`의 `value`는 16px 굵게 한 가지다. 내 행 강조를 «색·굵기만»으로 줄일지(시각 변경), 크기 확대를 유지해야 해서 슬롯 확장이 필요한지 정한다. 한 행에 색 강조 한 곳 규칙(`ListRow.prompt.md`)과도 맞춘다.
3. **진행 바 자리**: `footer`는 `variant="media"` 전용이고 `meta`는 글자 줄이다. 진행 바(높이 6, 폭 가변)를 `meta`에 ReactNode로 넣을 수 있는지(phrasing 요소인지: `ProgressBar`가 `<div>`면 클릭 영역 안에 둘 수 없다), 순위 행이 `href`(프로필 링크)를 가지므로 클릭 영역 안이 된다는 점을 확인한다.
4. **달성 행의 한 줄 촘촘 패딩**: 진행 바 없이 이름 한 줄이라 `ListRow` 기본 패딩(위아래 12)이 헐렁하다. 호출부에서 덮지 않는다는 규칙과 충돌한다. `ListRow`에 컴팩트 변형이 필요한지, 기본 패딩을 받아들이는지 정한다.
5. **아바타 36 → 48**: 두 행의 아바타가 36에서 48로 커져 카드 안 목록이 길어진다. 홈 카드(`ListCard`)의 순위 행 개수·높이 한도와 충돌하는지 확인한다.
6. **판정 결과별 다음 단계**: «현재 슬롯으로 된다» → 같은 티켓에서 구현. «슬롯·변형 추가 필요» → 승인 항목으로 사용자에게 올려 멈추고, 승인되면 `ds` 유형 하위 티켓으로 원본·사본·Story·`ds:check`를 먼저 처리한 뒤 이 티켓을 구현한다.

## 구현 계획

판정 결과에 따라 달라져 파일 단위 계획은 판정 뒤에 적는다. 구현이 열리면 대략 다음 파일이 바뀐다(면제 사유는 그때 판단한다).

1. `RankingListRow.tsx` — import 1줄, 행 56~117줄. 13·15·19줄 주석의 `ListRowCard` 설명은 새 사실에 맞게 고친다.
2. `MissionStatusClient.tsx` — import 5줄, `AchievementRow` 312~338줄, 307줄 주석.
3. 시험: `ListCard.test.tsx`·`TodayCardStack.test.tsx` 마크업 고정 단언 수정.
4. 문서 세 곳.

## 완료 조건

### 판정 단계
- 채원 사전 판정이 «현재 슬롯으로 된다» 또는 «승인 필요»로 나와 있고, 승인 항목이면 사용자 결정이 기록돼 있다.

### 구현 범위 (게이트 판정 대상, 판정이 구현 가능으로 나왔을 때)
- 순위 행과 달성 행이 `ListRow`다. 순위·값·내 행 강조·진행 비율이 기존과 같은 정보를 그린다.
- 홈 `ListCard`와 미션 현황의 순위 카드가 320px에서 넘치지 않는다. 실렌더 값이 기록돼 있다.
- 변경한 시험 파일과 `scripts/verify.sh`가 통과하고 `serviceLiteralColors` 시험이 통과한다.

### 후속 범위 (담당: 카리나, 시점: 머지 뒤)

- staging에서 홈 순위 카드와 미션 현황(순위형·달성형) 확인과 Vercel 배포 상태 확인.
- 판정 1~6 결과를 상위 티켓 «3배치 진행» 절에 기록하고 3배치를 닫는다. 문의 행(A9) 판정과 4배치(미션 목록)로 넘어간다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
