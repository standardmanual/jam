계열(같은 이름, 등급별 눈금) 하나를 눈금+연결선으로 보여주는 진행 레일. 카드 나열 대신
"동네 산책러" 같은 계열 하나를 레일 한 줄로 그려 위계·진행 감각을 준다(20260903_2329).

```jsx
<BadgeStageRail
  familyName="동네 산책러"
  nextRarityLabel="Epic"        // 다음으로 노려야 할 등급. 전부 획득했으면 null
  expanded={expanded}
  onToggleExpand={() => setExpanded(v => !v)}
  onLockClick={(stopId) => openUnlockSheet(stopId)}
  stops={[
    { id: 'b1', rarity: 'common', imageUrl: '...', status: 'earned', href: '/badges/b1' },
    { id: 'b2', rarity: 'rare', imageUrl: '...', status: 'ready', href: '/badges/b2', description: '...' },
    { id: 'b3', rarity: 'epic', imageUrl: '...', status: 'locked', href: '/badges/b3' },
  ]}
/>
```

- `stops`는 Common→Mystic 순으로 그 계열에 실제로 존재하는 등급만 넘긴다.
- `status`는 4종 — `earned`(획득) / `ready`(조건 충족·게이트 잠김, 라임 링+자물쇠) /
  `locked`(조건도 게이트도 미충족, 중성 링+자물쇠) / `not-reached`(게이트는 열려 있지만
  아직 도달 전, 마커 없음). `ready`/`locked`를 가르는 "조건 충족" 판정은 이 컴포넌트가
  계산하지 않는다 — 호출부가 기존 `evaluateConditionDetailed` pass/fail로 판정해서 넘긴다.
- 눈금 하나는 상태에 따라 **링크(`earned`/`not-reached`) 또는 버튼(`ready`/`locked`,
  `onLockClick` 호출)** 중 하나로만 렌더된다 — 앵커 안에 버튼을 중첩하지 않기 위한 설계라,
  잠긴 눈금은 탭해도 배지 상세로 이동하지 않고 잠금 해제 시트를 연다.
- "지금 막는 문"은 레일에 하나만 그린다 — 마지막 획득 눈금 바로 다음 눈금이 `ready`/`locked`일
  때만 그 앞 연결선에 점선+자물쇠(게이트)가 나타난다. 더 뒤 눈금들은 각자 코너의 자물쇠
  마커로만 상태를 알리고 연결선은 평범한 빈 트랙이다.
- 배지 이미지는 미획득 시 무조건 grayscale(1) — 획득 여부와 무관한 상태(조건 충족 등)는
  링 색·마커로만 구분하고 이미지 색은 절대 바꾸지 않는다.
- `expanded`일 때만 `description`을 보여준다. 접힌 레일에는 문장을 두지 않는다.
- "다음 목표" 강조 링·잔여값·진행 막대는 진행 계산 모듈(computeBadgeProgress)이 필요한
  2차 범위 — 이 컴포넌트는 아직 그리지 않는다.
