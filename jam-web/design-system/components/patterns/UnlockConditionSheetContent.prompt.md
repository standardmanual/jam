받는 방법 시트의 본문. 레일·티어 목록의 자물쇠 아이콘을 누르면 뜬다(20260903_2329).
**서비스 `src/components/ui/BottomSheet.tsx`(서비스 쪽) 위에 children으로 얹는다** — DS
`BottomSheet.jsx` 위가 아니다. 병존 구현 중 실제 화면은 서비스 쪽을 쓰기 때문이다.

```jsx
<BottomSheet open={open} onClose={onClose} footer={hasMissionCta ? <CtaButton/> : undefined}>
  <UnlockConditionSheetContent
    badgeName="동네 산책러"
    rarity="rare"
    imageUrl={badge.imageUrl}
    conditionMet={true}   // 수치 조건은 이미 채움 — "조건을 다 채웠어요" 확인 줄 표시
    requirements={[
      { kind: 'mission', name: '동네 산책러 레벨업', href: '/missions/1', imageUrl: mission.imageUrl },
    ]}
  />
</BottomSheet>
```

- `requirements`는 **아직 채우지 못한 항목만** 넘긴다. 선행 배지가 OR 관계일 때(예:
  "동네 산책러 또는 밤의 보행자") 하나라도 이미 보유했으면 게이트 자체가 열린 것이므로
  호출부가 이 시트를 아예 띄우지 않는다 — 이 컴포넌트는 fulfilled 여부를 다시 갈라
  보여주지 않는다.
- 항목이 2개 이상이면 구분선이 들어간다. 문구는 `relation`이 정한다 —
  `'or'`(기본)면 "또는", `'and'`면 "그리고"(티켓 20260905_0036).
  v5의 Mystic 게이트가 「축 간 교차 **AND** 미션 보상 배지」라 AND가 필요해졌다.
- `req.note`로 항목 부제를 덮어쓸 수 있다. 넘기지 않으면 예전 기본값을 그대로 쓴다.
- `req.level`을 넘기면 등급 칩 대신 **레벨 칩**을 그린다 — v5 레벨형은 `rarity`가 NULL이다.
- 배지 이미지는 **원본 + `grayscale(1)`** 이다 — 이 시트에 뜨는 배지는 정의상 미획득이다.
- 미션 진행도(0/1 등)·배지 실측값은 표시하지 않는다 — 진행 계산 모듈이 필요한 2차 범위.
  `kind: 'mission'` 행 부제는 항상 "미션", `kind: 'badge'` 행 부제는 항상 "배지 · 어느
  등급이든 1개"로 고정 문구다.
- CTA 버튼("미션 하러 가기" 등)은 이 컴포넌트가 그리지 않는다 — 서비스 `BottomSheet`의
  `footer` 슬롯에 호출부가 직접 넣는다(sticky footer가 토스트 겹침 신고까지 자동 처리).
