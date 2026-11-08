---
id: "20261108_2136"
category: UI
priority: P3
status: OPEN
created: 2026-11-08
closed: ""
parent: "20261108_1110"
specs: []
---

# [UI] RarityBadge mystic 칩의 글자 대비가 4.5:1 미만이다

## 핵심 요약

- 요구사항: `RarityBadge`의 `mystic` 등급 칩이 면 `rgb(255, 45, 135)` 위에 흰 글자(`rgb(255,255,255)`)라 계산 대비가 3.51:1이다. WCAG 일반 글자 기준 4.5:1에 못 미친다. 글자 12px 굵게(700)는 큰 글자 기준에도 해당하지 않는다. 글자색이나 면을 조정할지, 다른 등급(`rare`·`epic`)도 같은 문제인지 확인하고 방향을 정한다.
- 구현 계획: 사용자가 «검정 글자로 바꾼다»를 정했다(2026-11-08, 아래 «사용자 결정»). 채원 사전 판정(영향 범위, 활동 배지 이미지 처리) → 아현 구현 → 민지 게이트 → 채원 사후 리뷰.
- 관련 파일: `jam-web/design-system/components/cards/RarityBadge.jsx`(`config`의 등급별 `bg`·`text`), 서비스 호출부(`FeedSection`, `RecipeRewardRow`, `ItemCandidateRow`, `PoiCarouselModal`, `MissionDetailClient`, `BadgeGridCard` 등).
- 담당 에이전트: 채원(판정), 필요하면 아현.

## 배경 / 문제 정의

`20261108_1110`(`ListRowChip` warning 톤 대비) 작업 중 Storybook `ListRow` «media 변형» 화면에서 칩 색을 재다 발견했다. `MYSTIC` 칩(md 22px)의 면은 `rgb(255, 45, 135)`, 글자는 `rgb(255, 255, 255)`로 계산 대비 3.51:1이었다. 같은 화면의 `ListRowChip` `neutral`은 14.23:1, `done`은 17.47:1이다. 다른 등급(`rare`·`epic`)은 확인하지 않았다. 등급 칩은 등급이라는 정보를 색으로도 전하는 칩이라, 면 색을 바꾸면 등급 색 체계(`--rarity-*`)에 영향이 간다.

## 시작 전 확인 결과와 정정 (카리나, 2026-11-08)

티켓을 시작하기 전에 `origin/staging` 코드와 문서로 전제를 확인했다(읽기만).

- **이 값은 새 발견이 아니라 이미 문서에 적힌 값이다.** `docs/plan/jam2/11 JAM 2.0 디자인 시스템.md` 4.2절 표에 `mystic #ff2d87` 위 `#ffffff` 글자 3.51:1이 그대로 있고, 250줄 «사용자 판단이 남은 항목»에 «희귀도 mystic 칩의 흰 글자 대비가 3.51:1이다. 지금 서비스와 같은 값이다.»로 올라 있다. `jam-web/design-system/tokens/colors.css` 92~95줄 주석도 «common 5.74 · rare 9.92 · epic 10.12 · mystic 3.51 : 1»을 적고 있다. 결정 없이 남아 있던 열린 항목이다.
- **모든 등급의 대비(계산)**: common `#666666` + 흰 글자 5.74, rare `#00cc7a` + 검정 글자 9.92, epic `#f5a300` + 검정 글자 10.12, **mystic `#ff2d87` + 흰 글자 3.51**(4.5:1 미달). 검정 글자로 바꾸면 mystic은 **5.98:1**이다. 그래서 4.5:1에 못 미치는 등급은 mystic 하나뿐이다.
- **면 색(`--rarity-*`)은 바꿀 수 없다.** `RarityBadge.jsx` 16~18줄과 `RarityBadge.prompt.md` 20줄이 «등급 색은 값을 바꾸지 않는다. 등급이 아닌 용도로 `--rarity-mystic`을 쓰는 컴포넌트는 `forms/Checkbox.jsx`의 오류 테두리 하나다. 값을 건드리면 그 표시가 함께 바뀐다»고 못박았다. 면을 어둡게 하는 안은 이 규칙에 막힌다.
- **글자 토큰(`--rarity-mystic-foreground`, 지금 `--base-white`)을 바꾸는 안의 영향 범위**: ① 서비스 `RarityBadge` 사용 파일 19곳의 mystic 칩이 흰 글자에서 검정 글자로 바뀐다. ② `jam-web/src/lib/admin/composeActivityBadgeImage.ts` 203줄이 `--rarity-${rarity}-foreground`를 읽어 **활동 배지 이미지에 칩 글자색을 구워 넣는다.** 토큰을 바꾸면 앞으로 만드는 이미지는 검정 글자이고 이미 만든 이미지는 흰 글자 그대로라 어긋난다. ③ `Colors.stories`의 등급 쌍과 문서 4.2절 표, `colors.css` 주석을 함께 고쳐야 한다.
- 결과: 이 티켓은 «결함 수정»이 아니라 «문서에 열려 있던 디자인 결정을 정하는 것»이다. 방향은 사용자 결정이다(아래 선택지는 보고에 적었다).

## 사용자 결정 (2026-11-08)

- **`mystic` 칩의 글자를 검정으로 바꾼다.** `--rarity-mystic-foreground`를 `--base-white`에서 `--base-black`으로 바꿔 대비를 3.51:1에서 5.98:1로 올린다. rare·epic이 이미 검정 글자라 세 등급이 같은 규칙으로 정리된다. 면 색(`--rarity-*`)은 바꾸지 않는다(DS 규칙).
- 같은 날 처음에는 «흰색으로 함»(현행 유지)을 정했다가 곧바로 «취소, 검정으로»로 바꿨다. 흰 글자 확정을 적은 로컬 커밋은 push하기 전에 되돌렸다(기록이 남지 않았다).
- 활동 배지 이미지(`composeActivityBadgeImage.ts` 203줄이 토큰을 읽어 칩 글자색을 구워 넣는다)가 앞으로는 검정 글자, 이미 만든 이미지는 흰 글자로 어긋난다. 재생성 여부는 채원 판정 때 정하고 사용자에게 올린다.

## 범위

1. `jam-web/design-system/tokens/colors.css` 95줄 `--rarity-mystic-foreground`를 `var(--base-black)`로 바꾸고, 92줄 주석의 값(`mystic 3.51 : 1`)을 `5.98 : 1`로 고친다.
2. `docs/plan/jam2/11 JAM 2.0 디자인 시스템.md` 4.2절 표(`mystic | #ff2d87 | #ffffff | 3.51:1`)를 `#000000 | 5.98:1`로 고치고, 250줄 «사용자 판단이 남은 항목»의 mystic 항목을 «결정됨(2026-11-08, 사용자): 검정 글자»로 정리한다.
3. `RarityBadge.prompt.md`·`RarityBadge.jsx` 주석 중 mystic 글자색을 말하는 곳이 있으면 맞춘다. `Colors.stories.tsx`의 등급 쌍(166줄)은 토큰을 읽으므로 코드 변경은 없고 Story에서 검정 글자가 보이는지 확인한다.
4. 활동 배지 이미지 합성(`composeActivityBadgeImage.ts`)은 코드를 바꾸지 않는다. 앞으로 만드는 이미지는 새 토큰 값을 읽는다. 이미 구운 이미지의 처리는 채원 판정 뒤 사용자 결정이다.
5. 시험: mystic 글자 토큰을 단정하는 시험이 있으면 고친다(없으면 없음을 기록).

범위 밖: 면 색, 다른 등급의 글자 색(모두 4.5:1 이상), 이미 만든 활동 배지 이미지의 재생성(채원 판정 뒤 별도 결정).

## 구현 계획

파일 단위 계획(`colors.css` 토큰 1줄과 주석, 문서 2곳, 주석·시험 확인. 변경 파일 5개 이내).

1. `jam-web/design-system/tokens/colors.css` 92·95줄
2. `docs/plan/jam2/11 JAM 2.0 디자인 시스템.md` 4.2절 표, 250줄
3. `jam-web/design-system/components/cards/RarityBadge.prompt.md`·`RarityBadge.jsx` 주석(해당 시)
4. 시험(해당 시)

## 완료 조건

- `--rarity-mystic-foreground`가 `--base-black`이고, 면 `#ff2d87` 위 대비가 4.5:1 이상이다(계산 5.98:1을 완료 기록에 적는다).
- 모든 등급의 칩(`rare`·`epic`·`mystic`, `common`은 칩을 그리지 않음)이 4.5:1 이상이다.
- 서비스 화면의 mystic 칩이 깨지거나 읽기 어렵지 않다(Storybook 또는 실화면 실측으로 칩의 글자색과 대비를 확인한다).
- 문서 4.2절 표, 250줄, `colors.css` 주석, `RarityBadge.prompt.md`가 새 값을 말한다.
- 활동 배지 이미지의 재생성 여부가 사용자 결정으로 기록돼 있다.
- `npm run ds:check`와 `scripts/verify.sh`가 통과한다.

---
## 완료 기록 *(작업 후 작성)*
