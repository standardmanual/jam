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

`icon` 슬롯의 형태(원형/사각형/이미지/플레이스홀더)는 호출부에서 완전히 제어한다.
`children`은 title/subtitle 대신 텍스트 영역을 직접 구성할 때 사용한다.
