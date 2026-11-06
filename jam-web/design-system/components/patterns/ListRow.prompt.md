목록 행 한 골격. 활동·대상·사람·값·체크 목록을 슬롯 구성으로 만든다. 기존 `ListRowCard`와 공존하고(서비스는 아직 `ListRowCard`를 쓴다), 이 컴포넌트는 Storybook 전용 프로토타입 단계다. 자유 `children`은 없다.

구조는 `[indicator 24][lead 48] [본문: eyebrow·time / title / meta / chips / footer] [value][쉐브론·체크]` + 행 바깥 `trail`이다. 클릭 영역(`href`/`onClick`)은 trail을 뺀 전부를 감싼다.

## 글자
- eyebrow·time·chip 12px, meta 14px, title·value 16px(`--text-*`만 쓴다). 굵기는 파일 안 `ROW_WEIGHT` 한 곳(보통 400 · 굵게 700).
- `titleVariant` `strong`(굵게, 기본) · `sentence`(보통, 문장 — 핵심어는 `ListRowEm`) · `label`(보통 muted, 값 행·체크 목록).
- 줄 수: title 1줄(`sentence`는 2줄), `titleLines` 1~2. meta 기본 1줄, `metaLines` 1~3. eyebrow 문자열은 최대 2줄.
- 줄어드는 순서는 title·eyebrow·meta가 먼저다. time·value·trail은 줄지 않는다(팔로우 행은 이름이 먼저 잘린다).

## 계열 5종 구성표
| 계열 | 슬롯 구성 |
|---|---|
| A 활동 | lead + eyebrow + time + title(sentence) + meta + chips + value. 묶음 행(A2)은 `leadBadge` ×N + `aria-expanded`, `chevron` 없음 |
| B 대상 | lead + title + chips + meta + value. 미션 목록(B2)은 `variant="media"` + `tone="flat"` + eyebrow에 상태 칩 + footer |
| C 사람 | lead(`round`) + title + trail(팔로우 버튼). 순위(C4)는 indicator(숫자) + lead + title + value + 칩 «나» |
| D 값 | title(`label`) + value, `tone="flat"`. value가 줄바꿈되고 오른쪽 정렬 |
| E 체크 목록 | indicator(체크) + title(현재 단계 `strong`, 나머지 `label`) + meta |

```jsx
// A1 활동 — 핵심어만 굵게
<ListRow
  lead={<MedalIcon />}
  eyebrow="배지 획득"
  time="3분 전"
  title={<><ListRowEm>한강 러너</ListRowEm> 배지를 받았어요</>}
  titleVariant="sentence"
  meta="5km 러닝을 마쳤어요"
  chips={<RarityBadge rarity="rare" size="md" />}
  value={<PointText value="+50" />}
  onClick={open}
/>

// C1 사람 — 팔로우 버튼은 클릭 영역 밖(trail)
<ListRow lead={<UserIcon />} leadShape="round" title="runner_kim" href="/runner_kim" trail={<FollowButton />} />

// D 값 — 면 없는 flat 행
<ListRow tone="flat" separator titleVariant="label" title="이번 달 달린 거리" value="42.3km" />
```

## lead
- 모양은 대상의 종류로 정한다. 배지·아이템·컬렉션·이벤트 종류 아이콘·미션 썸네일·장소는 `tile`(기본), 사람(아바타)과 포인트 코인은 `round`.
- 크기는 CSS 변수 `--list-row-lead-size-proto`(48px) 하나다. prop은 없다. 이미지는 `alt=""`(장식)로 넘기면 `object-fit: cover`로 채워진다.
- `leadBadge`(×N·개수)는 우하단. 검정 배경 + 흰 글씨 + 행 면 색 1px 테두리.
- `leadHref`를 주면 lead(와 indicator)가 클릭 영역 밖 별도 링크가 된다(알림 아바타 2단 링크). 링크 안은 장식뿐이라 **`leadLabel`(링크 이름 문자열, 예: «runner_kim 프로필»)을 반드시 함께 준다.** `aria-label`로 연결되고, 개발 모드에서 `leadHref`만 있고 `leadLabel`이 없으면 콘솔 경고가 난다.
- 체크·순위 숫자는 썸네일이 아니라 상태 표지이므로 lead가 아니라 `indicator`(24px)에 넣는다.

## time
eyebrow 줄 오른쪽에 붙는다. eyebrow가 없으면 title 줄 오른쪽이다. 미디어 행에서 eyebrow에 칩 줄을 넣으면 남은 시간은 그 칩 줄 오른쪽 끝에 놓인다. 날짜 표기 규칙(상대·절대)은 컴포넌트가 아니라 호출부 문구 규칙이다.

## 면(tone)과 상태
- `default` 흰 면 + 1px `--border`. `tint`는 이미 카드 안에 들어간 행 전용이다. 크림 바탕 위 단독 행에 쓰지 않는다(이중 테두리). `inverse`는 경고 안내 행 전용. `flat`은 면 없음, `separator`로 구분선을 고른다.
- 선택됨은 안쪽 2px 링 + 쉐브론 자리 체크 한 가지다(색만으로 구분하지 않는다). 버튼이면 `aria-pressed`, 라디오로 쓰면 `role`과 `aria-checked`를 호출부가 넘긴다.
- 비활성은 opacity 0.4에 클릭 차단이고 눌림도 없다. 눌림은 `--scale-press-card` 한 가지, hover는 없다. 포커스는 바깥 2px `--link` 아웃라인이다.
- 라디오로 쓸 때 화살표 키 이동과 `tabindex`(선택된 행만 0, 나머지 -1)는 호출부가 처리한다. 컴포넌트는 `role`·`aria-checked` 전달과 선택 시각만 맡는다.
- 펼침 행은 `aria-expanded`/`aria-controls`를 넘긴다. `chevron`을 함께 켜면 쉐브론이 180도 돈다(A2는 쉐브론을 그리지 않고 `aria-expanded`로만 알린다).
- 로딩은 `ListRowSkeleton`. 빈 목록은 호출부가 `EmptyState`를 쓴다. 행 단위 빈·오류 상태는 없다.

## trail
행 클릭 영역 바깥이라 안에 버튼을 넣어도 마크업이 유효하다. 행이 `disabled`면 trail 래퍼에 `inert`가 걸려 마우스뿐 아니라 Tab·Enter로도 눌리지 않는다. 작은 팔로우 버튼은 높이 32px · 글자 12px · 좌우 여백 12px로 두고, trail의 바로 아래 자식 `button`·`a`는 눈에 보이지 않는 여백으로 터치 영역이 44px 이상으로 자동 확장된다.

## 상태를 글자로도 읽히게 (E 체크 목록·C4 순위)
indicator의 체크 아이콘·순위 숫자는 시각 표지라 스크린리더에는 상태가 전달되지 않는다. 호출부가 `sr-only` 글자를 함께 둔다.
- E 체크 목록: 완료 단계는 체크 아이콘에 `aria-hidden`을 두고 title 앞에 `<span className="sr-only">완료: </span>`, 현재 단계는 `<span className="sr-only">지금 할 차례: </span>`, 아직 안 한 단계는 `<span className="sr-only">아직: </span>`.
- C4 순위: indicator를 `<><span aria-hidden="true">1</span><span className="sr-only">1위</span></>`처럼 두어 «1위»로 읽히게 한다(숫자만 읽히지 않게).

## 문구 규칙 (호출부)
- `MediaVariant`의 «곧 끝나요»·«2시간 남음» 같은 문구는 실제 마감이 있을 때만 쓴다. 마감이 없는 항목에 긴급감을 붙이지 않는다(가짜 긴급감 금지).

## 하지 않는 것
- 자유 `children`을 받지 않는다. 슬롯에 없는 칸이 필요하면 계열을 늘리지 말고 설계 판정으로 올린다.
- 칩을 3개 넘기지 않는다. 칩 글자는 `--foreground`뿐이고 `--accent`·`--warning`은 면 채우기에만 쓴다(`ListRowChip`의 `tone`).
- 한 행에서 색으로 강조하는 곳은 한 곳 이하다(title 굵기 · value 포인트색 · 칩 중 하나). 그림자·그라디언트·유리질 없음.
- 본문을 가운데 정렬하지 않는다. `footer`는 media 변형 전용이고 클릭 영역 안이라 인터랙티브 요소를 넣지 않는다.
- `-proto` CSS 변수 9종과 inverse 면 위 muted 색(`--muted-on-inverse` 후보)은 3단계에서 확정한다. 호출부에서 값을 직접 박지 않는다.
