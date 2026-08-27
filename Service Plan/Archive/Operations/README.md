# Operations — 과거 운영 기록 아카이브 (읽기 전용)

> `SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 스냅샷 보관소.
> 2026-08-06부로 이 체계는 폐기되고 **Migration/Ticket으로 완전히 대체됐습니다.**
> **신규 파일 추가 금지** — 모든 개선사항은 티켓으로 기록합니다(절차: `.claude/skills/jam-docs/SKILL.md` ②).

- **범위**: 2026-07-15 ~ 2026-08-01 (약 2주일)
- **생성 방식**: 자동 크론 (주기적 실행) — 현재 폐지됨

---

## 왜 폐기됐나

1. **SERVICE_OPERATIONS와 Ticket의 개념 중복** — 둘 다 개선사항 변경 이력
2. **자동 생성의 한계** — 사람이 읽기 좋은 구조화 불가능
3. **타임스탬프 방식의 문제** — 언제 작성됐는지만 알고, "무엇을 했는지"는 파일을 열어봐야 알 수 있음
4. **Specs 루트 오염** — 계획("현재 스펙")과 이력이 섞임

## 폐기 과정 요약

| 시점 | 내용 |
|---|---|
| 2026-08-06 | 68개 스냅샷을 읽고 정형화된 Ticket으로 변환 |
| 2026-08-06 | `Specs/` 루트에 남아있던 운영 기록 14개도 Ticket으로 통합 |
| 2026-08-06 | 원본을 아카이브화, CLAUDE.md의 자동 생성 규칙 삭제 |
| 결과 | 새 티켓 72개, 폐기된 SERVICE_OPERATIONS 68개 |

## 2026-08-27 문서 재편으로 바뀐 것

이 폴더는 `History/Operations/`에서 `Archive/Operations/`로 옮겨졌습니다.
같은 폴더에 있던 **`SERVICE_OPERATIONS.md`(무접미사)는 아카이브가 아니라 살아있는 현행 문서**였고,
`Service Plan/Specs/SERVICE_OPERATIONS.md`로 승격됐습니다. 기록 계층에 현행 스펙이 섞여 있던 것을 바로잡은 것입니다.

---

## 이 폴더를 보는 용도

**정당한 용도**: 역사적 참고("7월 중순에는 뭘 했는데?"), 티켓화 누락 검증
**피해야 할 용도**: 신규 작업 기록(→ 티켓), 최신 상태 파악(→ `Specs/SERVICE_OPERATIONS.md`)

## 관련 기억사항

- [[feedback_operations_ticketized]] — SERVICE_OPERATIONS 전수 티켓화 완료
- [[feedback_doc_4category_system]] — 4카테고리 문서 체계
- [[feedback_ticket_first]] — 신규 개선사항은 Ticket 우선 확인
