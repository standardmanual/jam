/**
 * 밴 레벨 × 등급 → 정책 배율 키의 유일한 출처.
 *
 * 예전에는 `policy.ts`의 `RATE_KEYS`와 `shadow-ban.ts`의 `BAN_RATE_KEY`가 같은 8개 키를
 * 각각 하드코딩했다. 등급이 늘면 `BAN_RATE_KEY`는 `Record` 타입이라 `tsc`가 누락을 잡지만,
 * `RATE_KEYS`는 평범한 리터럴 집합이라 조용히 통과했다 — 그 결과 새 배율 키가 어드민의 0~1
 * 범위 검증(`api/admin/abusing/policy/route.ts`)을 빠져나갈 수 있었다 (티켓 20260831_1329).
 *
 * 이 파일이 `BAN_RATE_KEY`(구체 배선)를 소유하고, `RATE_KEYS`(검증 대상 키 집합)는 여기서
 * **파생**한다. `policy.ts`가 `RATE_KEYS`를 재노출하고, `shadow-ban.ts`가 `BAN_RATE_KEY`를
 * 쓰며, `shadow-ban.ts`는 이미 `policy.ts`를 import한다 — 이 맵을 `policy.ts`에 두면
 * `shadow-ban.ts → policy.ts` 기존 import와 얽혀 순환이 되므로, 어느 쪽에도 속하지 않는
 * 이 중립 모듈에 둔다.
 */
import type { BadgeRarity } from '@/types/database'
import type { AbusingPolicy } from './policy'

/** `BanLevel`(shadow-ban.ts)에서 'none'을 뺀 실제 배율 적용 레벨. 순환 import를 피하기 위해
 * `shadow-ban.ts`의 `BanLevel`을 import하지 않고 같은 리터럴 유니온을 여기서 직접 정의한다. */
export type RateBanLevel = 'soft' | 'hard'

/**
 * 밴 레벨 × 등급 → 정책 배율 키. `Record`로 고정해 등급이 늘거나 이름이 바뀌면 tsc가 잡는다.
 *
 * ⚠️ **값이 `keyof AbusingPolicy`인지만 tsc가 검사한다 — 어느 키를 가리키는지는 검사하지
 * 않는다.** `soft.rare`를 `'soft_common_rate'`로 잘못 적어도 컴파일은 통과한다. 이 배선을
 * 고정하는 sentinel 테스트가 `__tests__/shadow-ban.test.ts`에 있다 (티켓 20260831_1329).
 */
export const BAN_RATE_KEY: Record<RateBanLevel, Record<BadgeRarity, keyof AbusingPolicy>> = {
  soft: {
    common: 'soft_common_rate',
    rare: 'soft_rare_rate',
    epic: 'soft_epic_rate',
    mystic: 'soft_mystic_rate',
  },
  hard: {
    common: 'hard_common_rate',
    rare: 'hard_rare_rate',
    epic: 'hard_epic_rate',
    mystic: 'hard_mystic_rate',
  },
}

/**
 * 0~1 비율(밴 레벨별 rarity 드랍 배율) 필드 목록. `BAN_RATE_KEY`에서 파생해 하드코딩 중복을
 * 없앤다. 나머지 4개(gps_max_speed_kmh·poi_block_hours·vehicle_speed_filter_kmh·
 * gps_daily_distance_cap_km)는 상한 없는 정수 임계값이라 검증 범위가 다르므로 여기 없다.
 */
export const RATE_KEYS: ReadonlySet<keyof AbusingPolicy> = new Set(
  Object.values(BAN_RATE_KEY).flatMap((byRarity) => Object.values(byRarity))
)
