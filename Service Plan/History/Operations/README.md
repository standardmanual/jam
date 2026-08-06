# Operations — 과거 운영 기록 아카이브 (폐기된 체계)

> `SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 파일들 69개를 보관하는 **읽기 전용 아카이브**.
> 2026-08-06부로 이 체계는 폐기되고 **Migration/Ticket으로 완전히 대체됐습니다.**

---

## 폴더 현황

- **파일 개수**: 69개
- **범위**: 2026-07-15 ~ 2026-08-01 (약 2주일)
- **파일명**: `SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` (타임스탐프 기반, 무구조화)
- **생성 방식**: 자동 크론 (매시간 또는 주기적 실행)
- **상태**: **읽기 전용** — 새로운 파일 추가 금지

---

## ⚠️ 이 폴더의 파일들은 폐기됨

**신규 작업은 절대 여기 추가하지 마세요.** 모든 개선사항은 이제:

```
Service Plan/History/Migration/Ticket/YYYYMMDD_NNN_[카테고리]_[제목].md
```

로 기록합니다.

---

## 왜 폐기됐나

1. **SERVICE_OPERATIONS와 Ticket의 개념 중복** — 둘 다 개선사항 변경 이력
2. **자동 생성의 한계** — 사람이 읽기 좋은 구조화 불가능
3. **타임스탬프 방식의 문제** — 언제 작성됐는지만 알고, "무엇을 했는지"는 파일을 열어봐야 알 수 있음
4. **Specs 루트 오염** — 계획("현재 스펙")과 이력이 섞임

---

## 이 폴더를 보려면

### 정당한 용도
- **역사적 참고**: "7월 중순에는 뭘 했는데?" 궁금할 때
- **무엇이 누락됐나 확인**: 모든 69개 항목이 실제로 Ticket으로 티켓화됐는지 검증

### 피해야 할 용도
- **신규 작업 기록**: Migration/Ticket을 써야 함
- **최신 상태 파악**: 2개월 전 운영 기록이므로 낡음

---

## 폐기 과정 요약

| 단계 | 시점 | 내용 |
|------|------|------|
| 1 | 2026-08-06 | 68개 SERVICE_OPERATIONS 파일을 읽고 정형화된 Ticket으로 변환 |
| 2 | 동시에 | `Specs/` 루트에 남아있던 신규 14개 운영 기록도 Ticket으로 통합 |
| 3 | 동시에 | 원본 69개 파일을 이 폴더로 이동해 아카이브화 |
| 4 | 동시에 | CLAUDE.md의 "SERVICE_OPERATIONS 자동 생성 규칙" 전체 삭제 |
| 결과 | 2026-08-06 | **새 티켓 72개, 폐기된 SERVICE_OPERATIONS 69개** |

> [[feedback_operations_ticketized]] — 폐기 완료 기록

---

## 각 파일의 구조 (미구조화)

```markdown
# SERVICE_OPERATIONS_20260715_1200

## 작업 내용 (자유형식)

내용이 사람이 읽을 수 있는 형태로 쓰여 있지만,
필드가 일관되지 않고 YAML 프론트매터도 없음.

---

관련 파일: jam-web/src/...
완료: ✅ / ⏳ / ❌
```

비교: 신규 Ticket은 구조화된 YAML + 템플릿 기반

---

## 현재 작업 기록 시스템

신규 개선사항을 기록하려면:

```bash
# 신규 Ticket 생성 (템플릿 참조)
# Service Plan/History/Migration/Ticket/YYYYMMDD_NNN_[카테고리]_[제목].md
```

### 예시
```markdown
---
id: 20260806_003
category: Infra
status: CLOSED
created: 2026-08-06
closed: 2026-08-06
---

# [Infra] Google 로그인 화면 supabase.co 도메인 노출 검토

## 배경 / 문제 정의
...

## 완료 기록
### 구현 내용 요약
...
```

> [[feedback_ticket_first]] — 신규 개선사항 접수 시 이전 Ticket 검색이 첫 단계

---

## 관련 기억사항

- [[feedback_operations_ticketized]] — SERVICE_OPERATIONS 전수 티켓화 완료
- [[feedback_doc_4category_system]] — 4카테고리 문서 체계 (이 변경의 일부)
- [[feedback_ticket_first]] — 신규 개선사항은 Migration/Ticket 우선 확인
