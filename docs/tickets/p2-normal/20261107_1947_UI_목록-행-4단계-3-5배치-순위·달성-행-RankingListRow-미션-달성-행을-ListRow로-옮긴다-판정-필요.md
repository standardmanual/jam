---
id: "20261107_1947"
category: UI
priority: P2
status: CLOSED
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
## 완료 기록

### 구현 내용 요약

- 순위 행(`RankingListRow`)을 `ListRow`(`tone="tint"`, `leadShape="round"`)로 옮겼다. 순위 숫자는 `indicator` 슬롯(숫자는 `aria-hidden`, 스크린리더는 sr-only «N위»), 아바타는 48 원형(`alt=""`, 이미지가 없으면 `UserIcon`), 이름 옆 `titleSuffix`에 «나» 칩(내 행만 `ListRowChip` accent), `meta`에 `<ProgressBar as="span">`(호출부 span 래퍼에 `aria-hidden`), 값은 `value`다. 비율·높이 6px·`radius="3px"`는 기존 그대로다. 36 원형 `div`, `text-[#666]` 같은 리터럴 색, `flex flex-col` 래퍼와 `<p>`를 걷었다.
- 달성 행(`AchievementRow`)을 `ListRow`로 옮겼다. 48 아바타, 이름, 내 행 «나» 칩, 달성·미달성 `ListRowChip`은 `value` 슬롯(클릭 영역 안에 남겨 프로필 링크가 칩 위에서도 이어진다)이다. `!py-2`, `w-9 h-9`, `var(--link)`, `bg-[var(--accent-content-green)]`를 걷었다. 시험을 위해 `AchievementRow`를 export했다.
- i18n: `d.missions.statusMeSuffix`(' (나)')를 지우고 `statusMeChip`('나')와 `statusRankLabel`('{rank}위')를 `ko.ts`에 추가했다. UX Writing 가이드에는 «나» 칩 전용 규정이 없어 기존 «나의 현황»과 맞췄다.
- 시험: 신규 `AchievementRow.test.tsx`(6건), `ListCard.test.tsx`에 순위 행 마크업 7건 추가, `TodayCardStack`·`cardFacePairs`·`rankingRowsLink`·`TodayCardPreview` 시험을 새 마크업 기준으로 수정(`<style>`을 먼저 걷고 검사). 문서는 홈 피드 PRD(행형 절, 서버·클라이언트 경계 줄)와 상위 티켓 4단계 표.

### 채원 사전 판정과 사용자 승인

- 판정(경계): «현재 슬롯으로 된다»가 성립하지 않는다. 순위 숫자는 `indicator`로 되지만 진행 바가 `ProgressBar`의 `<div>` 마크업 때문에 클릭 영역 안에 들어가지 못했다. 선행 `ds` 티켓(20261107_2156, `ProgressBar`의 `as` prop)을 먼저 처리했다.
- 승인 항목 4건을 사용자가 채원 추천대로 승인했다(2026-11-07): ①진행 바는 `ProgressBar`에 span 옵션을 더하는 (a)안 ②내 행 강조는 24px·`--link` 확대를 접고 «나» 칩 하나로 ③아바타 36→48, 달성 행 약 52→72px, 순위 행 약 60→72px, 달성 칩 색 변화 수용 ④선행 `ds`를 먼저 처리한 뒤 한 번에 구현.

### 게이트 결과 (민지 WARN, 채원 사후 중대 문제 없음)

- 브랜치 CI `verify` success(run 42380500274).
- WARN 사유: ① 320px 실렌더 측정값이 없었다(아래에 기록). ② 홈 피드 PRD 452줄 «서버·클라이언트 경계»에 «안쪽 `ListRowCard`가 클라이언트다»가 남아 있었다(머지 때 카리나가 고쳤다).
- 머지 도중 병렬 세션이 컬러 개편 2회차(44dfda3d4 등)와 3회차 티켓을 `origin/staging`에 올려, 최신 staging 위에 네 커밋을 다시 적용(cherry-pick)했다. `MissionStatusClient.tsx`와 `cardFacePairs.test.tsx`는 두 변경이 겹쳤지만 자동으로 합쳐졌고, 재적용한 커밋(`-r2` 브랜치)의 CI `verify`가 success로 끝났다.
- 사용자가 머지를 승인했다(2026-11-07).

### 실렌더 측정 (메인 트리 개발 서버, 폭 320px, 테스트 계정)

- 미션 현황 달성 행(`/missions/e66f802f…/status`, 2행): 행 높이 74(안쪽 72 + 테두리 2), lead 48, 행 안 `<div>`·`<p>` 0개, 가로 넘침 없음(행 `scrollWidth`=`clientWidth` 236), 내 행(`232`)에만 «나» 칩이 붙고 달성 칩 자리에 «미달성»이 보인다. 이전 약 52에서 72로 커졌다.
- **칩 색 확인(컬러 개편과 겹침)**: 병렬 세션의 컬러 개편(블랙·그레이·화이트)이 반영된 상태에서 «나» 칩(accent)과 «미달성» 칩(neutral)의 면 색이 모두 `rgb(245, 245, 245)`로 같다. 달성 칩(accent)도 같은 색이 될 가능성이 높아, «달성»과 «미달성»이 글자로만 구분된다. 정보는 문구가 전하므로 손실은 없지만 승인된 «달성 칩 색 변화»가 의도보다 더 크게 나타난 것이다(컬러 개편 결과와 겹침). 달성 상태의 행은 테스트 데이터에 없어 실제 화면은 확인하지 못했다.
- 확인하지 못한 것: 순위 행(순위 숫자·진행 바·값)과 홈 `ListCard`, 5행 카드 높이, `TodayCardStack`의 높이 가정, 「이름 + 나 칩 + 긴 값」 최악 폭, 360·390px. 테스트 계정의 미션 4개가 모두 달성형이고 홈에 순위 카드가 없어 순위 행을 화면으로 볼 수 없었다. 순위 행의 구조·진행 바 span·`aria-hidden`·«N위»는 시험(`ListCard.test.tsx`)으로만 고정돼 있다.

### 변경된 파일

```
jam-web/src/components/ranking/RankingListRow.tsx
jam-web/src/app/(main)/missions/[id]/status/MissionStatusClient.tsx
jam-web/src/lib/i18n/ko.ts
jam-web/src/app/(main)/missions/[id]/status/AchievementRow.test.tsx (신규)
jam-web/src/components/today/__tests__/ListCard.test.tsx
jam-web/src/components/today/__tests__/rankingRowsLink.test.tsx
jam-web/src/app/(main)/TodayCardStack.test.tsx
jam-web/src/components/ui/__tests__/cardFacePairs.test.tsx
jam-web/src/app/admin/today/__tests__/TodayCardPreview.test.tsx
docs/service/prd/home-feed/PRD.md
docs/tickets/p2-normal/20261106_1750_… (상위 티켓 4단계 표)
```

### 테스트 결과
- [x] 브랜치 CI `verify` success, 재적용한 `-r2` 브랜치 CI success, `scripts/verify.sh` 전 항목 통과(아현 실행), `serviceLiteralColors` 통과
- [x] 달성 행 320px 실렌더(높이·넘침·«나» 칩·마크업) 측정 완료
- [ ] 순위 행 실렌더, 홈 `ListCard` 카드 높이, 달성 칩(달성 상태) 색, 360·390px: 측정하지 못함
- [ ] staging 화면 확인과 Vercel 배포 상태: push 뒤 확인

### 주요 의사결정 / 핵심 메모

- 눈에 띄는 변화는 모두 승인된 것이다: 아바타 36→48, 달성 행 높이 약 52→72px, 순위 행 약 60→72px, 내 행 강조가 24px·링크색에서 «나» 칩으로, 달성 칩 색.
- 후속 확인(카리나): 컬러 개편이 끝난 뒤 달성·미달성 칩이 색으로 구분되는지 다시 본다. 구분이 안 되면 `ListRowChip`의 accent 톤 값을 컬러 개편 쪽에서 정하게 한다(이 티켓은 토큰·공용 컴포넌트를 고치지 않는다).
- 후속 후보: 순위 행 실렌더(순위형 미션이 있는 환경, 홈의 순위 카드)와 PRD 449·450줄의 «행 하나당 76px» 실측값(전환 전 값) 갱신.

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1회차(판정 단계에서 승인 대기로 정지) | 1 | 63,624 | 채원 사전 판정 단독 | 1분 51초 | 13 |
| 2회차(승인 후 구현·게이트) | 3 | 287,921 | 33,522 / 20,525 | 22분 24초 | 98 |
| 합계 | 4 | 351,545 | 33,522 / 20,525 | 24분 15초 | 111 |
