---
id: "20261108_1110"
category: UI
priority: P2
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
- 구현 계획: 채원 판정(어느 쪽으로 고칠지, 소비처 화면 영향) → 원본 `ListRow.jsx`와 서비스 사본 `ListRow.tsx`를 같은 값으로 수정(`ds:check`) → Story·`prompt.md` 갱신.
- 관련 파일: `jam-web/design-system/components/patterns/ListRow.jsx`(`CHIP_TONES` 99~106줄, 102행 `warning`), `jam-web/src/components/ui/ListRow.tsx`(같은 값), 소비처(`warning` 톤을 쓰는 화면): 홈 피드 `FeedSection`, `PoiEarnHistory`, `RecipeRewardRow`, `ItemCandidateRow`, `RankingListRow`.

## 배경 / 문제 정의

컬러 개편(20261107_2201)으로 `--warning`이 짙은 회색(`#525252`)이 됐고, `ListRowChip` 규칙은 «글자는 항상 `--foreground`»라 어두운 면 위 어두운 글자가 됐다. 목록 행 4-2배치(20261108_1020)에서 채원 사전 판정이 발견했다. 4-2는 NEW 칩에 `done` 톤을 써서 피하지만, `warning` 톤을 쓰는 다른 화면은 같은 문제를 안고 있을 가능성이 높다. 정의 수정은 MODULAR 원본 변경이라 사용자 승인이 필요하다.

## 완료 조건

- 소비처 5곳의 `warning` 칩을 실렌더로 확인해 대비 값(WCAG 4.5:1 이상)이 기록돼 있다.
- 원본과 서비스 사본의 `warning` 톤이 같은 값이고 `ds:check`가 통과한다.
- Story와 `prompt.md`가 새 값에 맞게 갱신돼 있다.

---
## 완료 기록 *(작업 완료 후 작성)*
