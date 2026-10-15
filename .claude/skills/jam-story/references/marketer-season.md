# 윤진 모드 ③·⑤·⑦ — 플레이북·시즌 운영·뉴스레터

> 윤진(`jam-marketer`) 정의 문서에서 옮긴 모드 ③·⑤·⑦의 상세다(티켓 20261015_1103). 윤진은 이 모드를 실행할 때만 이 파일을 읽는다.
> 옮기면서 규칙 문장은 고치지 않았다. Bash 사용 범위와 금지 사항은 정의 문서에 남아 있고 그쪽이 우선한다.

## ③ 사례 카드 형식

브랜드/사례 · 기간·규모 · **왜 통했나**(희소성 / 수집 완성 / 시간 제한 / 소속감 / 실물 전환) ·
JAM 대입안 · 필요 작업 · 리스크 · 상태

## ⑤ 시즌 운영

| 업무 | 승인 | 반영 |
|---|---|---|
| 미션 제안 (조건·보상·기간, **트라이브 연결 필수**) | 필요 | 어드민 등록 |
| 액티비티배지 제안 (활동 조건·기준값) | 필요 | 윈터 검수 → 이미지 → 티켓 |
| 체크인배지 제안 (POI·조건) | 필요 | 윈터 검수 → 이미지 → 티켓 |
| 아이템배지 제안 | 필요 | 윈터 검수 → 이미지 → 티켓 |
| 앰비언트 드랍 일정 | 필요 | 승인 후 실행 |
| 시즌 캘린더 | — | 월 1회 갱신 |

경제 수치는 기존 허용 범위 안에서만 제안한다. 범위를 벗어나면 혜린의 리스크 점검으로 넘긴다.
시즌 제안에는 **트라이브 분포**를 표시해 쏠림을 드러낸다.

**소재 스크리닝 순서** (PRD §7.3): 소재 카드는 표준 형식(`docs/marketing/트렌드_노트.md`)으로
기록한다 → 뉴스 소스는 `node scripts/issue-filter-check.mjs`가 카테고리·금지어로 기계 제외한다 →
밈 소스는 윤진이 1차 스크리닝한다 → 윈터가 최종 검수한다. 제외된 소재는 사유와 함께 리포트
「제외된 소재」 절에 남긴다.

**Missions should be fun and varied.** Use trends and metrics to vary the conditions (distance,
place, time of day, weather, streaks, group play, collection) instead of repeating the same shape.
The tribe link stays mandatory.

**Proposals are made in a session via `/jam-story`** (decision 4-9), with one exception approved in
티켓 20260925_1414: a scheduled run may write a **plan (기획안)** for a new badge, mission, or home-feed card into
the periodic report — the weekly home-feed draft or the monthly "배지·미션 제안 재료" section — in a fixed
format (이름·설명·조건 또는 템플릿·트렌드·지표 근거·「세계관과 닿음/무관」과 사유). Scheduled runs (weekly and monthly) never
create an image, bundle or `--dry-run` output (티켓 20260930_1519, which turned off the weekly image step added in 티켓 20260926_1207).
In the weekly report a home-feed card that needs an image is marked 「이미지: 승인 뒤 세션에서 만든다」; badge and mission plans
(monthly "배지·미션 제안 재료" and session) stay 「이미지 준비 대기」. Registration itself never happens in a scheduled run (see ⑧). The season
calendar, ambient-drop schedule, and economy figures stay session-only.

## 뉴스레터 법 요건 (모드 ⑦을 켤 때)

광고성이면 제목에 (광고) 표시 + 수신 거부 방법 명시 · 21시~08시 발송 금지 ·
수신 동의자에게만 발송.
