---
id: "20261108_0022"
parent: "20261107_2201"
category: UI
priority: P2
status: OPEN
created: 2026-11-08
---

# [UI] ListRowChip에 완료 톤을 더해 달성 칩을 블랙으로, 미달성 칩이 tint 행에 묻히지 않게

## 핵심 요약
- 요구사항: 컬러 개편 사용자 결정 2(2026-11-07, 상위 `20261107_2201`): **완료 = 블랙 면(`--foreground`) + `--snow` 글자, 미완료 = 회색 면 + `--muted` 글자**를 `ListRowChip`에도 적용한다. 지금 미션 현황 달성 행은 `ListRowChip tone accent`(달성·«나», `--accent-soft` #f5f5f5)와 `neutral`(미달성, `--default-soft` #e5e5e5)을 쓰는데, 행 면(tint `--background-secondary`)도 #e5e5e5라 미달성 칩이 묻히고 달성 칩이 미달성보다 옅다.
- 구현 계획: (1) `ListRowChip`에 `done` 톤 추가(면 `var(--foreground)`, 글자 `var(--snow)`). 지금은 글자가 늘 `--foreground`라는 규칙이 있으므로 톤별 글자색을 둔다. (2) `neutral`·`accent` 톤이 tint 행(#e5e5e5)과 흰 행 위에서 모두 보이도록 면 값을 정한다(채원① 판정. 새 색을 만들지 않고 기존 토큰 중에서 고른다. 예: tint 행 위에서는 `--surface` 흰 면). (3) 미션 현황 `AchievementRow`의 달성 칩을 `done`으로.
- 관련 파일: `jam-web/design-system/components/patterns/ListRow.jsx` 99~130줄 `CHIP_TONES`·`ListRowChip`, `ListRow.d.ts`(tone 타입), `jam-web/src/components/ui/ListRow.tsx` 105줄 근처 `ListRowChip`(병존 구현), `jam-web/src/app/(main)/missions/[id]/status/MissionStatusClient.tsx` 315~322줄, `ListRowChip` 소비처 전수(`grep -rn "ListRowChip" jam-web/src`)와 관련 스토리·시험

## 사용자 승인 (2026-11-08)
- 채원① 승인 항목: ① `done`·흰 면 톤 추가 ② «나» 칩 = 흰 면 + `--foreground` 글자, 미달성 칩 = 흰 면 + `--muted` 글자 ③ 다른 소비처의 neutral 칩은 바꾸지 않음
- 아현 `plan_only`(파일 8개) 뒤 사용자가 한 번에 진행을 승인했다

## 구현 계획 (아현 1차 호출 계획, 2026-11-08)
- 계획(파일 8개, 모두 jam-web 아래):
  1. `design-system/components/patterns/ListRow.jsx` — `CHIP_TONES`를 `{bg, fg}` 쌍으로 바꾼다. neutral·accent·warning은 값 그대로 두고, 톤 3개를 추가한다: done(면 `--foreground`, 글자 `--snow`), surface(면 `--surface`, 글자 `--foreground`), surface-muted(면 `--surface`, 글자 `--muted`). 칩 렌더에서 `chip.bg`·`chip.fg`를 쓴다.
  2. `src/components/ui/ListRow.tsx` — 1번과 같은 값으로 고친다(병존 구현).
  3. `design-system/components/patterns/ListRow.d.ts` — tone 타입 94줄에 `done|surface|surface-muted`를 더하고 주석을 고친다.
  4. `design-system/components/patterns/ListRow.prompt.md` 76줄 — «칩 글자는 foreground뿐» 문장에 done·surface-muted 예외와 «흰 면은 tint 행 전용»을 적는다.
  5. `design-system/components/patterns/ListRow.stories.tsx` 763~767줄 C5 달성 행 — tint 행으로 바꾸고 칩에 done, surface, surface-muted를 적용한다.
  6. `src/app/(main)/missions/[id]/status/MissionStatusClient.tsx` 317·319줄 — «나»는 surface, 달성은 done, 미달성은 surface-muted로 바꾼다.
  7. `src/components/ui/ListRow.test.tsx` 171줄 이후 — 새 톤 3개 시험(면과 글자색)을 추가한다.
  8. `src/app/(main)/missions/[id]/status/AchievementRow.test.tsx` 34~35줄 — «달성은 accent» 단정을 done(`background:var(--foreground)`)으로 고치고 미달성·«나» 단정을 추가한다. 이 파일은 채원 판정의 scope에 없었으나 기존 단정이 깨지므로 같이 고쳐야 한다.
- 톤 이름: `done`(블랙 면·흰 글자), `surface`(흰 면·블랙 글자, «나»), `surface-muted`(흰 면·회색 글자, 미달성). RankingListRow 77줄은 기존 톤 유지

## 배경 / 문제 정의
컬러 개편 3회차(`20261107_2246`) 머지 직전, 병렬 작업(티켓 20261107_1947)이 미션 달성 행을 `ListRow`로 옮기며 달성 칩을 `ListRowChip tone accent`로 바꿨다. 3회차의 토큰 변경(`--default-soft`·`--background-secondary` → #e5e5e5)과 겹쳐 2026-11-08 실렌더에서 미달성 칩이 행에 묻히는 것을 확인했다. 병렬 세션 기록상 사용자가 이 건을 컬러 개편 쪽에서 정하기로 했다(2026-11-08).

## 완료 조건
- 미션 현황 달성 행에서 달성 칩은 블랙 면 + 흰 글자, 미달성 칩은 행 면과 구분되는 면 + `--muted` 글자다(메인 트리 실렌더로 확인)
- «나» 칩이 행 면 위에서 보인다
- `ListRowChip` 다른 소비처의 칩이 행 면에 묻히지 않는다(소비처마다 확인 결과를 완료 기록에 적는다)
- `--jam-*` 토큰을 쓰지 않는다
- `scripts/verify.sh` 통과

---
## 완료 기록 *(작업 완료 후 작성)*

