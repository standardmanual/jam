---
id: "20261108_1110"
category: UI
priority: P3
status: OPEN
created: 2026-11-08
parent: "20261106_1750"
specs:
  - jam-web/design-system/components/patterns/ListRow.jsx
  - jam-web/src/components/ui/ListRow.tsx
---

# [UI] ListRowChip warning 톤의 글자색이 면 위에서 대비 미달이다

## 핵심 요약

- 요구사항: `ListRowChip`의 `warning` 톤은 면 `--warning`(`#525252`) 위에 글자 `--foreground`(`#171717`)를 쓴다. 대비가 약 2.3:1이라 읽기 어렵다. 글자색을 `--snow`로 바꾸거나 면을 밝은 값으로 바꾸는 중 하나로 고친다.
- 구현 계획: 사용자가 «글자색만 고친다»를 정했다(2026-11-08, 아래 «사용자 결정»). 채원 판정은 생략(경로 ② 가벼운 UI)하고 아현 구현 → 민지 게이트. 원본 `ListRow.jsx`와 서비스 사본 `ListRow.tsx`를 같은 값으로 수정(`ds:check`).
- 관련 파일: `jam-web/design-system/components/patterns/ListRow.jsx`(`CHIP_TONES` 99~106줄, 102행 `warning`), `jam-web/src/components/ui/ListRow.tsx`(같은 값), 소비처(`warning` 톤을 쓰는 화면): 홈 피드 `FeedSection`, `PoiEarnHistory`, `RecipeRewardRow`, `ItemCandidateRow`, `RankingListRow`.

## 배경 / 문제 정의

컬러 개편(20261107_2201)으로 `--warning`이 짙은 회색(`#525252`)이 됐고, `ListRowChip` 규칙은 «글자는 항상 `--foreground`»라 어두운 면 위 어두운 글자가 됐다. 목록 행 4-2배치(20261108_1020)에서 채원 사전 판정이 발견했다. 4-2는 NEW 칩에 `done` 톤을 써서 피하지만, `warning` 톤을 쓰는 다른 화면은 같은 문제를 안고 있을 가능성이 높다. 정의 수정은 MODULAR 원본 변경이라 사용자 승인이 필요하다.

## 시작 전 확인 결과와 정정 (카리나, 2026-11-08)

티켓을 시작하기 전에 `origin/staging` 코드로 전제를 확인했다(읽기만).

- **`warning` 톤을 쓰는 서비스 화면은 없다.** 서비스의 `ListRowChip`은 `neutral`·`accent`·`done`·`surface-muted`만 쓴다(`tone="warning"`은 `src`에서 어드민 `OpsStatusBadge`의 별개 컴포넌트와 Story에만 나온다). 이 티켓의 «관련 파일: 소비처 5곳(`FeedSection`, `PoiEarnHistory`, `RecipeRewardRow`, `ItemCandidateRow`, `RankingListRow`)»은 틀린 전제다. 그 파일들의 `ListRowChip`은 `neutral`·`accent`(`RankingListRow` «나» 칩)뿐이다. 완료 조건 «소비처 5곳의 `warning` 칩을 실렌더로 확인»은 확인할 대상이 없다.
- 옛 NEW 칩이 마지막 소비처였다. 4-2배치(`20261108_1020`)에서 사용자가 NEW 칩을 `done` 톤으로 정해 `warning`을 피했다. 그 뒤 `warning`을 쓰는 곳이 없다.
- **정의의 대비 문제는 그대로다.** `CHIP_TONES.warning`은 면 `--warning`(`#525252`) + 글자 `--foreground`(`#171717`)로 대비 2.29:1이다(`ListRow.jsx` 99~106줄, 사본 같은 값). 글자를 `--snow`(`#fcfcfc`)로 바꾸면 약 7.5:1이다. 다만 `done`(`#171717` 면 + 글자 `--snow`, 17.9:1)과 `warning`(`#525252` 면 + `--snow`)은 어두운 면에 밝은 글자로 모양이 거의 같아 톤의 구분이 약하다.
- 결과: 지금 사용자가 보는 화면에는 대비 결함이 없다. 문제는 «정의된 톤이 읽기 어려운 상태로 있다»는 것이고, 어느 방향(글자색 수정, 톤 삭제, 보류)으로 갈지는 사용자 결정이다.

## 사용자 결정 (2026-11-08)

- **`warning` 톤의 글자만 `--snow`로 바꾼다.** 면(`--warning` `#525252`)은 그대로다. 톤 삭제와 보류는 채택하지 않는다. `ListRow` 원본 변경을 이 결정으로 승인한다.
- 새 색·토큰은 만들지 않는다. 서비스 화면에는 이 톤을 쓰는 곳이 없어 화면 영향은 없다(위 «시작 전 확인 결과와 정정»).
- 우선순위는 영향이 없어 P2에서 **P3**로 낮춘다(`p3-low` 폴더로 옮김).

## 범위

1. 원본 `ListRow.jsx` `CHIP_TONES.warning`(102줄)의 `fg`를 `var(--snow)`로 바꾸고, 같은 파일의 두 주석(34줄 «칩 글자는 항상 --foreground다(--accent·--warning은 면 채우기만)», 110줄 «done은 --snow, surface-muted는 --muted다…»)을 사실에 맞게 고친다.
2. 서비스 사본 `ListRow.tsx`(98줄 `warning` 줄, 106줄 주석)를 같은 값으로 고친다.
3. `ListRow.d.ts` 94줄 설명에 `warning`이 `--warning` 면 + `--snow` 글자임을 반영한다.
4. `ListRow.prompt.md` 77줄 «칩 글자는 `--foreground`가 기본이고 예외는 `done`(`--snow`)·`surface-muted`(`--muted`)뿐이다»에 `warning`(`--snow`)을 더한다.
5. 시험: `ListRow.test.tsx`에 `ListRowChip tone="warning"`의 글자가 `--snow`이고 `neutral`·`accent`는 `--foreground`라는 단정을 더한다.
6. Story(`warning` 사용 3곳: 175·626·750줄 근처)는 코드 변경이 필요 없다. 글자색이 바뀌어 읽을 수 있게 되는지만 확인한다.

범위 밖: 면 색, `done`과의 톤 구분 문제, 서비스 화면 소비처(없음).

## 구현 계획

파일 단위 계획(계획 반환 면제 사유: 변경이 작고 파일과 줄 위치가 확정돼 있다. 원본 `.jsx`·사본 `.tsx`·`.d.ts`·`prompt.md`·시험 5개 파일, 코드 2줄과 주석·문서 몇 줄).

1. `jam-web/design-system/components/patterns/ListRow.jsx` — 102줄, 34줄·110줄 주석.
2. `jam-web/src/components/ui/ListRow.tsx` — 98줄, 106줄 주석.
3. `jam-web/design-system/components/patterns/ListRow.d.ts` — 94줄 설명.
4. `jam-web/design-system/components/patterns/ListRow.prompt.md` — 77줄.
5. `jam-web/src/components/ui/ListRow.test.tsx` — 단정 추가.

## 완료 조건

- `ListRowChip` `warning` 톤의 글자가 `--snow`이고, 면 `#525252` 위 대비가 WCAG 4.5:1 이상이다(계산값을 완료 기록에 적는다. 면 `#525252`, 글자 `#fcfcfc`는 약 7.5:1).
- 원본과 서비스 사본의 `warning` 톤이 같은 값이고 `npm run ds:check`가 통과한다.
- `ListRowChip`의 주석, `ListRow.d.ts`, `ListRow.prompt.md`가 새 값(`warning`의 글자는 `--snow`)을 말한다.
- `ListRow.test.tsx`의 새 단정이 통과하고 기존 시험은 깨지지 않는다.
- `neutral`·`accent`·`done`·`surface`·`surface-muted` 톤은 바뀌지 않는다.
- 변경한 파일이 `scripts/verify.sh`를 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*
