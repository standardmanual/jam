/** 'drops'는 라우트 /drops와 맞물린 키라 그대로 둔다. 화면에 보이는 이름은 «체크인»이다(티켓 20261114_1418). */
export type TabKey = 'today' | 'badges' | 'drops' | 'missions' | 'inventory';

export interface TabBarProps {
  /** 활성 탭에만 아이콘 옆에 이름표가 보인다. 비활성 탭은 아이콘뿐이다. */
  active?: TabKey;
  onChange?: (key: TabKey) => void;
  /** 서비스는 이 값으로 pathname/searchParams를 조합해 활성 탭·"다른 유저 프로필
   *  맥락"을 판정한다. 이 컴포넌트는 `data-username` 속성으로만 값을 반영한다. */
  username?: string | null;
  /** 푸터 위처럼 어두운 면 위일 때 true. 푸터 감지는 호출부의 일이고 이 컴포넌트는 값만 받는다.
   *  기본 false는 반전 이전과 같은 모양이다. */
  inverted?: boolean;
}

export function TabBar(props: TabBarProps): JSX.Element;
