---
id: "20261109_1146"
category: Infra
priority: P2
status: CLOSED
created: 2026-11-09
closed: 2026-11-09
---

# [Infra] verify의 spacing 기준선 불일치로 staging CI가 실패한다

## 핵심 요약

- 요구사항: `scripts/verify.sh`의 spacing 검사가 기준선과 맞지 않아 CI(`verify`)가 실패한다. staging `a199b50`과 그 이전 커밋 2건의 CI도 같은 이유로 실패했다(티켓 `20261109_1127` 게이트 리뷰의 범위 밖 발견물, 민지 [주의/정합성]).
- 구현 계획: 실패 대상 파일의 간격 값이 의도된 변경인지 확인하고, 의도된 것이면 기준선을 갱신하고 아니면 값을 고친다.
- 관련 파일: `jam-web/src/app/(main)/badges/[id]/page.tsx`, `InventoryItemHistorySheet.tsx`, `jam-web/src/app/(main)/badges/[id]/BadgeHeroSection.tsx`, `CollectionGridCard.tsx`, spacing 기준선 파일(`scripts/verify.sh`의 spacing 단계가 읽는 파일).

## 배경 / 문제 정의

- 2026-11-09 오전에 배지 상세·컬렉션 칸 화면을 연달아 고친 커밋(티켓 `20261109_1019`~`1048`)부터 CI가 spacing 단계에서 실패한다. CI가 계속 실패하면 새 review 브랜치의 실패가 이 문제 때문인지 새 결함 때문인지 가르기 어렵다.

## 완료 조건

- staging에서 `scripts/verify.sh`의 spacing 단계가 통과하고 CI가 성공한다.

---
## 완료 기록

### 구현 내용 요약
티켓 20261109_1448에서 같은 spacing 기준선 불일치를 한 번에 고쳤다. 이 티켓은 중복이어서 별도 변경 없이 닫는다. 어떤 위반을 왜 허용했는지는 1448의 완료 기록에 적었다(허용한 값은 `CollectionGridCard.tsx`의 `px-[9px]` 한 건).

### 변경된 파일
```
- (20261109_1448에서 변경)
```

### 테스트 결과
- [x] `node scripts/check-spacing.mjs` 통과(1448에서 확인).

### 실행 지표
| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1 | 중복 종료 (작업 없음) | - | - / - | - | - |
| 합계 |  | - | - / - | - | - |

### 주요 의사결정 / 핵심 메모
- 같은 원인의 티켓 세 건(1146, 1224, 1448) 중 1448만 구현하고 나머지는 중복으로 닫았다.

### 잔여 이슈
- 없음
