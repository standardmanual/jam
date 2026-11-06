> **폐기 예정.** 새 화면은 [`ListRow`](ListRow.prompt.md)를 쓴다(티켓 20261106_1750·20261106_2003). 이 컴포넌트는 서비스 호출부가 `ListRow`로 옮겨지는 4단계가 끝나면 지운다. 그때까지는 동작을 바꾸지 않고, 새 기능도 더하지 않는다.
>
> 옮길 때 대응은 아래와 같다. 안쪽을 직접 그리는 `children` 경로는 `ListRow`에 없다. 같은 정보 역할(행위·대상·부가 정보·칩·시간·값)마다 정해진 자리가 있어서 화면마다 글자 크기와 강조가 달라지지 않는다.
>
> | `ListRowCard` | `ListRow` |
> |---|---|
> | `icon`(크기·모양을 호출부가 결정) | `lead`(48px 한 가지, 모양은 `leadShape`: 대상은 `tile`, 사람·코인은 `round`) |
> | `title`(16px 보통) | `title`(16px 굵게, 한 줄 말줄임. 알림 문장은 `titleVariant="sentence"`) |
> | `subtitle`(16px 회색) | `meta`(14px 회색) |
> | 행위 라벨·시간(`children`으로 직접 그림) | `eyebrow`와 `time`(eyebrow 줄 오른쪽) |
> | 등급·Lv·상태 칩(`children`·`subtitle` 안) | `chips`(12px 칩 한 크기, `ListRowChip`) |
> | `trailing`의 값(포인트·숫자) | `value`(16px 굵게) |
> | `trailing`의 화살표 | `chevron` |
> | `trailing`의 팔로우 버튼 등 | `trail`(행 클릭 영역 바깥, 터치 영역 44px 이상 자동) |
> | 팔로워 행(`children`으로 링크 + 버튼 분리) | `title` + `trail` |
> | 미션 카드행(이미지 큰 행) | `variant="media"` + `eyebrow`에 상태 칩 + `footer` |
> | `tone="default" \| "tint" \| "inverse"` | 같은 값 + `flat`(면 없음) |
> | `disabled`, `aria-expanded`, `aria-controls` | 같은 이름 + `selected`(링 + 체크) |

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
