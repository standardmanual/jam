---
id: "20261108_0022"
parent: "20261107_2201"
category: UI
priority: P2
status: CLOSED
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

### 구현 내용 요약
- `ListRowChip`의 톤 표(CHIP_TONES)를 면·글자 쌍으로 바꾸고 톤 세 개를 더했다.
  - `done`: 블랙 면(`--foreground`)에 흰 글자(`--snow`). 달성 칩에 쓴다.
  - `surface`: 흰 면(`--surface`)에 블랙 글자(`--foreground`). «나» 칩에 쓴다.
  - `surface-muted`: 흰 면에 회색 글자(`--muted`). 미달성 칩에 쓴다.
- 기존 `neutral`·`accent`·`warning`은 값을 그대로 두어 다른 소비처(FeedSection, PoiEarnHistory, RecipeRewardRow, ItemCandidateRow, RankingListRow)는 바뀌지 않는다.
- 연결 범위: 병존 구현 부류. 디자인 시스템 원본(`ListRow.jsx`·`.d.ts`·`.prompt.md`·스토리)과 서비스(`src/components/ui/ListRow.tsx`)를 같은 커밋에서 같은 값으로 고쳤다.
- 채원① 판정: MODULAR 확장(기존 ListRowChip에 톤 추가, 새 컴포넌트 없음). 새 토큰·새 색 값·`--jam-*` 없음.

### 변경된 파일
```
jam-web/design-system/components/patterns/ListRow.d.ts
jam-web/design-system/components/patterns/ListRow.jsx
jam-web/design-system/components/patterns/ListRow.prompt.md
jam-web/design-system/components/patterns/ListRow.stories.tsx
jam-web/src/app/(main)/missions/[id]/status/AchievementRow.test.tsx
jam-web/src/app/(main)/missions/[id]/status/MissionStatusClient.tsx
jam-web/src/components/ui/ListRow.test.tsx
jam-web/src/components/ui/ListRow.tsx
```

### 테스트 결과
- [x] `scripts/verify.sh` 통과, CI 런 42387388810 성공 (커밋 24ea9d46d)
- [x] 민지 게이트 PASS, 채원② 중대 문제 없음
- [x] 메인 트리 실렌더(430px, 2026-11-08): tint 행(#e5e5e5) 위에서 미달성 칩은 흰 면·#666 글자, «나» 칩은 흰 면·#171717 글자로 행 면과 구분된다. «나»와 미달성 칩이 한 줄에 들어간다.
- [ ] 달성(블랙) 칩은 테스트 계정 데이터에 달성자가 없어 화면으로 보지 못했다. 단위 시험(ListRow.test.tsx의 done 톤)으로만 확인했다.

### 배포 정보
- 배포일: 2026-11-08 (staging)
- 환경: staging
- 커밋: 24ea9d46d

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차(plan_only 정지) | 1 | 50,754 | — | 1분 20초 | 15 |
| 2차(면제 후 구현) | 3 | 133,741 | 8,081 / 4,695 | 14분 23초 | 33 |
| 합계 | 4 | 184,495 | 8,081 / 4,695 | 15분 43초 | 48 |

### 주요 의사결정 / 핵심 메모
- 1차 호출이 plan_only로 멈췄다. 사전 규모 판정에서 스토리·시험·prompt.md까지 포함한 8파일을 세지 않고 면제를 빠뜨린 것이 원인이다. 계획을 티켓에 옮기고 사용자 승인을 받아 `planOnlyWaiver`로 다시 호출했다.
- «나» 칩과 미달성 칩은 둘 다 흰 면이고 글자색(블랙/회색)으로만 갈린다(사용자 결정).

### 잔여 이슈
- 리뷰 참고(티켓화하지 않음): 흰 면 톤은 tint 행 위에서만 보인다. 지금은 문서 설명으로만 제한하므로, 쓰는 곳이 늘면 장치로 막는 것을 검토한다. 칩 톤 조회 중복(ListRow.tsx:128)도 같은 때 정리한다.
