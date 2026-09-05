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
  // 프런티어(다음 목표) 진행 표시(2c) — null이면 상태 라벨만(위 예시와 동일 동작)
  frontierProgress={{ text: '87.3/100km', fraction: 0.82 }}   // 누적/기록/주기 3종만. 2축/다중은 null
  regretLine={null}   // 기록형 전용 "아쉬움 줄"(§05) — record kind이고 임계값 85% 이상일 때만 문자열
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
- 배지 이미지는 미획득 시 **원본 + `grayscale(1)`** 이다(2026-09-06 사용자 확정).
  20260905_0036이 한때 실루엣으로 바꿨다 — 원본 URL이 네트워크에 나가 「외형 비공개」가
  성립하지 않는다는 이유였는데, **외형을 감추는 것보다 어떤 배지인지 알아볼 수 있는
  쪽을 택했다**(v5는 조건도 전면 공개한다). 획득 여부와 무관한 상태(조건 충족 등)는
  링 색·마커로만 구분하고 이미지 색은 절대 바꾸지 않는다.
- `earnCount` — 반복형 계열의 누적 획득 횟수. 헤더 행 오른쪽 끝에 `×N` 칩 하나로만 그린다.
  점 그리드를 쓰지 않는다(47회를 점 47개로 그리면 100회를 넘는 순간 의미를 잃는다).
- 눈금마다 `rarity`를 받아 **아이콘 아래 3px 등급색 바**를 그린다 — 44px 폭에 「Mystic」
  칩은 안 들어간다. 등급명은 눈금의 `aria-label`이 읽는다.
- `stop.gates: [{kind:'mission'|'cross'}]` — 미션은 자물쇠(`--color-primary`),
  교차는 별(`--color-text-secondary`). 색만으로 갈리지 않게 **형태로도 갈라 두었다**.
  자리 폭은 자물쇠 2개를 수용하도록 44px다.
- **눈금은 최대 4개다.** `stops.length > 4`면 개발 빌드에서 throw한다 — 레일은 등급
  4단계 구조 그 자체라 5개가 들어오면 조용히 깨지는 대신 즉시 알린다.
  v5 레벨형(`rarity` NULL)은 이 레일에 태우지 말고 `BadgeLevelGauge`를 쓴다.
- `expanded`일 때만 `description`을 보여준다. 접힌 레일에는 문장을 두지 않는다.
- `frontierProgress`(2c, 20260904_0921) — 프런티어(다음 목표) 눈금 하나에만 붙는다. 캡션
  텍스트(`STATUS_LABEL` 대체)와 프런티어 앞 연결선 비례 채움(`fraction`, 게이트가 있으면
  점선 그대로 두고 채우지 않음)을 담당한다. `muted:true`면 §08 H(진행 미지원) 표시로
  중립색·이탤릭으로 그린다. 문자열 조립은 호출부(`src/lib/badgeProgressText.ts`) 몫 — 이
  컴포넌트는 kind(누적/기록/주기/2축/다중)를 전혀 모른다. 2축형·다중카운터형 프런티어는
  이 prop에 `null`을 넘긴다(전용 게이지가 필요한 2d 몫).
- `regretLine`(2c) — 기록형 "아쉬움 줄"(§05). 계열당 최대 1줄, null이면 렌더하지 않는다.
