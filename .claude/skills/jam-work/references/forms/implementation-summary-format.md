# 구현 요약 양식 (아현)

> 티켓 20260918_0423에서 파일화. 아현이 구현을 마치고 민지에게 넘길 때 쓰는 형식.

| 칸 | 내용 |
| --- | --- |
| status | done / plan_only / needs_design / halted |
| cause | 원인 (버그일 때) |
| changes | 무엇을 어떻게 |
| files | 변경 파일 |
| branch | 리뷰 브랜치 |
| checks | lint·타입·테스트·ds:check 결과 |
| tests_added | 추가한 테스트 (없으면 사유) |
| doc_updates | 문서 경로 / 섹션 / 바꿀 내용 / 근거 |
| db_migration | SQL 파일 경로 또는 없음 |
| diff_lines | 변경 줄 수 |
| confidence | 높음 / 보통 / 낮음 |
| alerts | [참고/주의/중단] |

특이사항 없는 칸은 한 단어로 쓴다. 티켓 완료 기록은 아현이 직접 쓰지 않는다 — 이 요약을
카리나에게 반환하면 자동화 B9가 채운다.
