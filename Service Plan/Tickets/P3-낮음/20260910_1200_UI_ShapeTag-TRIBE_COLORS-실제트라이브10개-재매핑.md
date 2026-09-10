---
id: 20260910_1200
category: UI
priority: P3
status: OPEN
created: 2026-09-10
closed:
---

# [UI] ShapeTag의 TRIBE_COLORS를 실제 트라이브 10개로 재매핑

## 배경 / 문제 정의

`jam-web/design-system/components/cards/ShapeTag.jsx`의 `TRIBE_COLORS` 매핑 테이블이
아직 stub 상태다. 키가 `fire`·`water`·`nature`·`shadow`·`light`·`storm`·`earth`·`void`
8개 가상 이름으로 되어 있는데, 실제 트라이브는 `Specs/Content/TRIBES.md`에 정의된
한글 이름 10개(아날로그 수집가·미스터리 헌터 등)다. 키가 하나도 겹치지 않아 지금은
어떤 트라이브 이름을 넘겨도 전부 `colorIndex=0` 폴백으로 떨어진다.

원래 DS-018(`Tickets/Moduler/018_P2_IMPROVE_shapetag-faction-mapping.md`)의 잔여
이슈로 "FACTIONS.md 확정 후 재매핑 필요"라고 기록돼 있었으나, 그 티켓은 CLOSED이고
가리키던 `FACTIONS.md`·`FACTION_COLORS`는 티켓 20260910_1129의 용어 변경으로
`TRIBES.md`·`TRIBE_COLORS`가 되었다. 지금은 존재하지 않는 이름을 가리키는 상태라
후속으로 집는 사람이 찾지 못한다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `TRIBES.md`에 확정된 트라이브 10개의 정식 이름을 키로 `TRIBE_COLORS`를 다시 채운다.
- 토큰은 `--color-tag-1` ~ `--color-tag-N` 범위에서 고른다. 트라이브가 10개인데
  기존 태그 토큰이 몇 개인지 먼저 확인해야 한다 — 부족하면 토큰 확장 여부부터 판단한다.
- 알 수 없는 이름이 들어오면 `colorIndex=0`으로 폴백하는 기존 동작은 유지한다.
- `ShapeTag.stories.tsx`의 예시 목록도 실제 트라이브 이름으로 맞춘다.

### 영향 범위

`ShapeTag`는 `ds-connection-scope.md` 기준 **미도입 8종**이다. `grep -rn "ShapeTag"
jam-web/src` 결과가 0건으로 서비스 화면에서 쓰이지 않으므로, **이 작업은 서비스에
영향을 주지 않고 Storybook 표시만 정확해진다.** 우선순위를 P3으로 둔 이유다.

## 구현 계획

1. `Specs/Content/TRIBES.md`에서 트라이브 10개 정식 이름을 확인한다
2. `design-system/tokens/colors.*.css`에서 사용 가능한 `--color-tag-*` 개수를 센다
3. 토큰이 10개에 미달하면 확장할지, 색을 재사용할지 판단해 티켓에 기록한다
4. `TRIBE_COLORS`·`ShapeTag.stories.tsx`를 갱신하고 로컬 Storybook(`npm run storybook`)에서 확인한다

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
