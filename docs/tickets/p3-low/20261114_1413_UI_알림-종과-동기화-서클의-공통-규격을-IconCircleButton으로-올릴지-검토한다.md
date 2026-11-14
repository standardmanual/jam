---
id: "20261114_1413"
category: UI
priority: P3
status: OPEN
created: 2026-11-14
---

# [UI] 알림 종과 동기화 서클의 공통 규격을 IconCircleButton으로 올릴지 검토한다

## 핵심 요약
- 요구사항: NotificationBell과 SyncIconButton이 44/36/16 규격을 복제한다. 세 번째 아이콘 서클이 생기기 전에 MODULAR 승격(IconCircleButton)을 검토한다. 승격 기준(재사용성·범용성·안정성·토큰 준수)을 채원이 판정한다.
- 구현 계획: 다음 작업에서 정한다.
- 관련 파일: jam-web/src/components/ui/NotificationBell.tsx, jam-web/src/components/ui/SyncIconButton.tsx(브랜치 claude/jamwork-20261114_1349-topnav-sync-icon)

## 배경 / 문제 정의
티켓 20261114_1349(TopNav 동기화 아이콘 서클)의 게이트 리뷰·사후 리뷰에서 범위 밖 발견물로 나왔다.

## 완료 조건
- 채원 판정으로 승격 또는 서비스 전용 유지가 정해지고 티켓에 근거가 남는다.
