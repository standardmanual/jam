export interface SlidingTab {
  key: string;
  label: string;
}

export interface SlidingTabsProps {
  tabs: SlidingTab[];
  active?: string;
  onChange?: (key: string) => void;
}

export function SlidingTabs(props: SlidingTabsProps): JSX.Element;
