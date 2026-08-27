# Tickets — ② 티켓 (모든 작업의 공식 기록)

> `/jam-work`가 **매 실행마다** 만드는 중심 산출물. 개선사항·버그 수정·인프라 변경은 물론
> "기존 유지" 결정까지 여기 남긴다.
> **신규 작업 착수 시 가장 먼저 검색해야 할 폴더** — 코드·Specs보다 우선한다. [[feedback_ticket_first]]

## 파일명

```
YYYYMMDD_HHMM_[카테고리]_[제목].md
예: 20260827_1732_UI_배지그리드-등급칩-위치조정.md
```

- **`HHMM`은 티켓 생성 시각**(KST). 연산이 필요 없으므로 병렬 세션이 같은 번호를 선점하지 않는다.
- 카테고리 8종과 작성 규칙은 `.claude/skills/jam-docs/SKILL.md` ② 참조
- 템플릿은 `_TEMPLATE.md`

> **2026-08-27 이전 티켓은 `YYYYMMDD_NNN` 형식이다.** 소급 변경하지 않는다 —
> 티켓 번호가 브랜치명·커밋 메시지·코드 주석에 박혀 있어 일괄 개명이 오히려 참조를 끊는다.
> 두 형식이 섞여 있어도 날짜순 정렬은 동일하게 동작한다.

## 하위 폴더

| 경로 | 내용 |
|---|---|
| `Moduler/` | MODULAR 디자인 시스템 개선 티켓 (`NNN_P{우선순위}_{동작}_{슬러그}`). `/jam-design`이 참조 |

## 착수 시 파악할 것

1. 이미 완료된 작업인지 — 재구현 방지
2. 채택하지 않은 대안과 그 이유 — 동일 검토 반복 방지
3. 잔여 이슈로 남긴 사항인지 — 이어서 처리

## 이 폴더의 내력

| 시점 | 변화 |
|---|---|
| ~2026-08-06 | `SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 자동 생성 (시간별 크론, 무구조화) |
| 2026-08-06 | 전수 티켓화. YAML 프론트매터 + 템플릿 구조로 전환 [[feedback_operations_ticketized]] |
| 2026-08-27 | `Tickets/` → `Tickets/`로 승격. README만 들고 있던 두 계층 제거.<br>파일명을 `NNN`(경합 발생) → `HHMM`으로 전환 |

> 폐기된 원본은 `Service Plan/Archive/Operations/`에 읽기 전용으로 있다.

## 관련 기억사항

- [[feedback_ticket_first]] — 코드·Specs 보다 먼저 기존 티켓 확인
- [[feedback_doc_4category_system]] — 문서 체계 마스터 규칙
- [[feedback_operations_ticketized]] — SERVICE_OPERATIONS 전수 티켓화 완료
