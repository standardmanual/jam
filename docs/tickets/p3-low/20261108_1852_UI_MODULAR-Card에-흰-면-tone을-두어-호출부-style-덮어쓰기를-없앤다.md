---
id: "20261108_1852"
category: UI
priority: P3
status: OPEN
created: 2026-11-08
parent: "20261108_1830"
---

# [UI] MODULAR Card에 흰 면 tone을 두어 호출부의 style 덮어쓰기를 없앤다

## 핵심 요약

- 요구사항: `Card tone="default"`는 #f7f7f7 면에 투명 테두리다. 활동 묶음 카드는 단건 카드(ListRow default)와 같은 흰 면 + 1px `--border`가 필요해서 호출부 `style`로 background·border·padding을 덮었다. 같은 요구가 다시 나오면 Card에 흰 면 tone을 추가하고 Story를 함께 쓴다.
- 구현 계획: `ds` 유형으로 채원① 판정을 받는다. 두 번째 사용처가 생길 때 진행한다.
- 관련 파일: `jam-web/design-system/components/cards/Card.jsx`, `jam-web/src/app/(main)/FeedSection.tsx` — `ActivityGroupCard`의 Card style(약 796~802행)

## 배경 / 문제 정의

티켓 20261108_1830의 채원② 사후 리뷰 제안이다.

## 완료 조건
- Card에 흰 면 tone이 있고 Story가 있다. `ActivityGroupCard`가 style 덮어쓰기 없이 그 tone을 쓴다. `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*
