export type TabKey = 'today' | 'badges' | 'drops' | 'missions' | 'inventory';

export interface TabBarProps {
  active?: TabKey;
  onChange?: (key: TabKey) => void;
}

export function TabBar(props: TabBarProps): JSX.Element;
