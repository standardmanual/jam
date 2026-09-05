export type TabKey = 'today' | 'badges' | 'drops' | 'missions' | 'inventory';

export interface TabBarProps {
  active?: TabKey;
  onChange?: (key: TabKey) => void;
  /** 서비스는 이 값으로 pathname/searchParams를 조합해 활성 탭·"다른 유저 프로필
   *  맥락"을 판정한다. 이 컴포넌트는 `data-username` 속성으로만 값을 반영한다. */
  username?: string | null;
}

export function TabBar(props: TabBarProps): JSX.Element;
