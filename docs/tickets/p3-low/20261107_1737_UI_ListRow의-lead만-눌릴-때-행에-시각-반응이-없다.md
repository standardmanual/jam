---
id: "20261107_1737"
category: UI
priority: P3
status: OPEN
created: 2026-11-07
parent: "20261106_1750"
---

# [UI] ListRow에서 lead만 눌릴 때 행에 시각 반응이 없다

## 핵심 요약

- 요구사항: `leadHref`가 있는 행(알림의 아바타 2단 링크)에서 아바타만 누르면 lead가 행 클릭 영역 밖 형제라 눌림 반응(0.98)이 본문 쪽에만 걸린다. 이 상태를 그대로 둘지, lead에도 눌림 반응을 줄지 채원이 판정한다.
- 구현 계획: 미정(착수 전 규모 판정).
- 관련 파일: `jam-web/src/components/ui/ListRow.tsx`(`Lead`), `jam-web/design-system/components/patterns/ListRow.jsx`(`Lead`, 같은 값으로 맞춰야 `ds:check`가 통과한다)

## 배경 / 문제 정의

티켓 20261107_0010 게이트 리뷰의 참고 발견이다. 채원 사전 판정은 «아바타만 눌릴 때 시각 반응이 없는 것은 받아들인다»였고, 실기기에서 어색한지는 확인하지 못했다.

## 완료 조건

- 판정 결과(유지 또는 lead 눌림 추가)가 티켓에 기록돼 있다.
- 바꾼다면 원본과 사본이 같은 값이고 `npm run ds:check`가 오류 0이다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
