미션 카드행·유저 목록 등 가로 행 레이아웃의 공통 패턴. 아이콘 + 텍스트 + trailing 슬롯 구조.

```jsx
// 유저 목록 행
<ListRowCard
  href="/username"
  icon={<img src={avatar} style={{ width:40, height:40, borderRadius:'50%' }} />}
  title="username"
  subtitle="서울 · 러닝, 사이클"
  trailing={<ChevronRightIcon />}
/>

// 팔로워 행 (children으로 링크 + 팔로우 버튼 분리)
<ListRowCard trailing={<FollowButton />}>
  <a href="/username" style={{ display:'flex', alignItems:'center', gap:16 }}>
    <img src={avatar} style={{ width:40, height:40, borderRadius:'50%' }} />
    <span>username</span>
  </a>
</ListRowCard>

// 미션 카드행
<ListRowCard
  href="/missions/123"
  icon={<img src={thumb} style={{ width:40, height:40, borderRadius:8 }} />}
  title="10km 러닝 챌린지"
  subtitle="D-5 · 참가중"
  trailing={<StatusChip status="active" />}
/>
```

면은 `--surface`(흰) + 1px `--border`, 그림자 없음이다(크림 바탕과 흰 면은 1.05:1이라 테두리가 경계를 맡는다).
이미 카드(흰 면 + 테두리) 안에 들어가는 행은 `tone="tint"`(`--background-secondary`, 테두리 없음)로 쓴다 — 카드 속 카드의 이중 테두리를 막는다. tint는 크림 바탕 위 단독 행으로 쓰지 않는다.

`icon` 슬롯의 형태(원형/사각형/이미지/플레이스홀더)는 호출부에서 완전히 제어한다.
`children`은 title/subtitle 대신 텍스트 영역을 직접 구성할 때 사용한다.
