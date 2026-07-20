# JAM! 배지 시스템 문서

## 파일 목록

| 파일 | 내용 |
|------|------|
| [badge-system-logic.md](./badge-system-logic.md) | 배지 발급 엔진 · 드랍 엔진 로직 전체 설명 |
| [badge-conditions-all.md](./badge-conditions-all.md) | 전체 배지 발급 조건 표 (600개) |
| [badge-diagram.html](./badge-diagram.html) | 인터랙티브 다이어그램 (흐름도 + 조건표 + 티어 구조) |

## 배지 종류 요약

| 타입 | 배지 | 발급 엔진 | 저장 테이블 |
|------|------|-----------|------------|
| `activity` | 활동 배지 (600개) | badge-engine | `user_activity_badges` |
| `item` | 아이템 배지 | drop-engine | `inventory_items` |

## 배지 카테고리 (activity 타입)

| 카테고리 | 그룹 수 | 조건 타입 | 구현 상태 |
|----------|---------|-----------|----------|
| 로드러닝 (road_running) | 15 | 누적 거리 | ✅ 정상 |
| 트레일러닝 (trail_running) | 15 | 누적 거리 + 고도 상승 | ✅ 정상 |
| 사이클링 (cycling) | 15 | 누적 거리 + 이동 시간 + 고도 상승 | ✅ 정상 |
| 등산 (hiking) | 15 | 누적 거리 + 고도 상승 | ✅ 정상 |
| 걷기 (walking) | 15 | 누적 거리 | ✅ 정상 |
| 연속 활동 (streak) | 10 | 연속 일수 (모든 활동 타입) | ✅ 정상 |
| 한파 날씨 (cold) | 5 | 최고 기온 이하 | ⚠️ 미구현 (날씨 데이터 없음) |
| 폭염 날씨 (hot) | 5 | 최저 기온 이상 | ⚠️ 미구현 (날씨 데이터 없음) |
| 새벽/야간 시간대 (time_range) | ~10 | 특정 시간대 활동 | ⚠️ 미구현 (time_range 조건 미지원) |

> **미구현 배지**: 조건은 DB에 시드되어 있으나 엔진에서 `pass: false` 반환 → 영구 미발급 상태
