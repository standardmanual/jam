import type { ReactNode, CSSProperties } from 'react';

export interface AccordionItem {
  title: string;
  content: ReactNode;
  /** If true, this item is open on initial render. Only one item can be open at a time. */
  defaultOpen?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  style?: CSSProperties;
  className?: string;
}

export function Accordion(props: AccordionProps): JSX.Element;
