# JAM! Service Plan — 이력 자료 (History)

> 4카테고리 문서 체계(① PRD ② 티켓 ③ 컨텐츠 ④ 배지엔진) 재정리 후 작성 (2026-08-06).
> 이 폴더는 **작업 이력(티켓)** 을 보관합니다.
> 폐기된 체계의 기록은 2026-08-27 재편으로 `Service Plan/Archive/`로 분리됐습니다.

---

## 폴더 구성

### Migration/Ticket/ — ② 티켓 카테고리 (신규 개선사항 이력)
- **용도**: 개선사항·버그 수정·인프라 변경 등 **실제 작업 이력**
- **파일명**: `YYYYMMDD_NNN_[카테고리]_[제목].md`
- **범위**: 2026-07-15 ~ 현재 (계속 누적)
- **언제 보나**: 유사 작업이 이전에 있었는지 확인할 때, 신규 개선사항 착수 시 [[feedback_ticket_first]]
- **우선순위**: 이 폴더를 **가장 먼저 검색** — 코드/Specs 보다 먼저 확인

### Operations/ — **이 폴더에 더 이상 없음**
2026-08-27 재편으로 `Service Plan/Archive/Operations/`로 이동했습니다.
같은 폴더에 있던 현행 문서 `SERVICE_OPERATIONS.md`는 `Service Plan/Specs/SERVICE_OPERATIONS.md`로 승격됐습니다.

---

## 신규 개선사항 접수 시 이 폴더를 활용하는 방법

1. **먼저 `Migration/Ticket/` 검색** — 유사 작업이 이전에 있었는지 확인
   ```bash
   # 최신 티켓 확인
   ls -t Migration/Ticket/ | head -20
   
   # 특정 카테고리 검색 (예: Service)
   ls Migration/Ticket/ | grep "_Service_"
   ```

2. **"그 당시 계획은 뭐였나"가 궁금하면** `PHASES_ROADMAP_ARCHIVE.md` 또는 `git log`
   - 절대 현재 스펙으로 신뢰하지 말 것 (현재 스펙은 `Service Plan/Specs/`)

3. **폐기된 운영 기록이 필요하면** `Service Plan/Archive/Operations/` — 읽기 전용

---

## 관련 기억사항

- [[feedback_ticket_first]] — 코드·Specs 보다 먼저 기존 티켓 확인
- [[feedback_operations_ticketized]] — SERVICE_OPERATIONS 68건을 모두 티켓화 완료, 신규 생성 폐기
- [[feedback_doc_4category_system]] — 4카테고리 체계 마스터 규칙
- [[feedback_prd_needs_content_update]] — Phase 로드맵과 실제 개발 순서의 불일치 사항

---

## 2026-08-06 정리 요약

| 항목 | 이전 | 현재 |
|------|------|------|
| Phase 스냅샷 | 루트에 평평히 흩어진 파일 | `Snapshots/`로 정렬 후 2026-08-15 삭제(Phase 역분해 완료, 커밋 ab28ca01) |
| 운영 기록 | `Operations/` + `Specs/` 분산 | 통합 후 전수 티켓화 완료 |
| 티켓 시스템 | 없음 | `Migration/Ticket/` (계속 누적) |
| 신규 SERVICE_OPERATIONS | 자동 생성 (시간별 크론) | **폐기** — 티켓으로 대체 |

---
