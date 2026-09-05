Small uppercase pill showing a badge's rarity tier. `rarity="common"` renders nothing (common is the default tier, not called out). Fixed 3-color mapping for rare/epic/mystic — rare=green `#00cc7a`, epic=gold `#f5a300`, mystic=pink `#ff2d87`. Colors come from `--color-rarity-*` tokens; never re-map these, users have learned the color language.

Naming history: tiers 3 and 4 were renamed on 2026-08-31 (ticket 20260831_1115). Only the names changed — each color stayed on the same rank. See `Service Plan/Specs/UX_WRITING_GUIDELINE.md` for the old→new mapping.

```jsx
<RarityBadge rarity="epic" />
```

## v5 변경 — 미지 값을 Common으로 폴백하지 않는다 (티켓 20260905_0036)

예전에는 모르는 `rarity` 값이 들어오면 **조용히 Common 칩**을 그렸다. 값이 잘못됐다는
사실이 화면에 드러나지 않아 오래 방치되는 경로였다.

이제 `resolveRarity()`가 미지 값을 걸러 **아무것도 그리지 않고** 개발 빌드에서
`console.warn`을 남긴다. `getRarityLabel()`도 같다.

⚠️ **레벨형에는 이 컴포넌트를 쓰지 마라.** v5 레벨형은 `rarity`가 NULL이다 —
`BadgeLevelChip`이 그 자리를 맡는다. `RarityBadge`는 «등급»만 그린다.

⚠️ 등급 색 `--color-rarity-*`는 **값을 바꾸지 않는다.** `--color-tag-3/4/5`와
폼 입력 에러 색(`forms/{Input,Checkbox,Select,Textarea}.jsx`)이 이 토큰을 참조하고 있어
값을 건드리면 폼 에러 표시가 함께 깨진다.
