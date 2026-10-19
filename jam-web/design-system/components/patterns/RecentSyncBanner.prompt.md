직전 동기화 배너. 최근 Strava 활동이 동기화됐다는 사실을 담담하게 알린다(20260903_2329),
데이터가 있으면 "직전 상태값과의 비교" 문구로 확장한다(20260904_1425).

```jsx
<RecentSyncBanner visible={hasRecentSync} comparisonMessage={syncComparisonMessage} />
```

- `visible=false`면 아무것도 렌더하지 않는다 — 호출부가 조건부 렌더를 따로 감쌀 필요 없다.
- `comparisonMessage`가 있으면(truthy) 그 문구를 보여주고, 없으면(null/빈 문자열) `message`
  기본값("최근 활동이 동기화됐어요")으로 자동 폴백한다 — 호출부가 직접 분기할 필요 없다.
- `comparisonMessage`는 호출부가 조립해 넘기는 문장이다. 이 배너를 쓰던 서비스 화면(배지 트리)과 문장 조립
  함수(`pickSyncComparisonCandidate`·`formatSyncComparisonText`)는 티켓 20261018_1817에서 삭제했다. **지금 서비스 호출부는 없다.**
- 색은 `--progress-latest`(시안) 하나뿐 — 모자란 것(옐로우)·다 채운 것(라임)과 겹치지
  않는 "방금 들어온 것" 전용 채널. 다른 곳에 이 색을 쓰지 않는다.
