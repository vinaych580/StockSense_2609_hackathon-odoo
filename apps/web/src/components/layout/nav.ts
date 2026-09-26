import {
  Boxes,
  ClipboardList,
  History,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  children?: { label: string; path: string }[];
}

/** The sidebar, top to bottom. Add pages here rather than in the JSX. */
export const NAV: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Operations',
    path: '/operations',
    icon: ClipboardList,
    children: [
      { label: 'Receipts', path: '/operations/receipts' },
      { label: 'Deliveries', path: '/operations/deliveries' },
      { label: 'Transfers', path: '/operations/transfers' },
      { label: 'Adjustments', path: '/operations/adjustments' },
    ],
  },
  { label: 'Stock', path: '/stock', icon: Boxes },
  { label: 'Products', path: '/products', icon: Package },
  { label: 'Move History', path: '/moves', icon: History },
  { label: 'Settings', path: '/settings', icon: Settings },
];
