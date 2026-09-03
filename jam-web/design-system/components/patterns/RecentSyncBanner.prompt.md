직전 동기화 배너. 최근 Strava 활동이 동기화됐다는 사실 하나만 담담하게 알린다(20260903_2329).

```jsx
<RecentSyncBanner visible={hasRecentSync} />
```

- `visible=false`면 아무것도 렌더하지 않는다 — 호출부가 조건부 렌더를 따로 감쌀 필요 없다.
- 1차 범위는 boolean 이벤트만 표시한다. "배지 3개가 가까워졌어요" 같은 구체적 개수·거리는
  진행 스냅샷(user_family_progress)이 있어야 계산할 수 있어 2·3차에서 `message`로 얹는다.
- 색은 `--status-latest-solid`(시안) 하나뿐 — 모자란 것(옐로우)·다 채운 것(라임)과 겹치지
  않는 "방금 들어온 것" 전용 채널. 다른 곳에 이 색을 쓰지 않는다.
