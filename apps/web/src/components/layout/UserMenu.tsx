import { ChevronDown, LogOut } from 'lucide-react';

import { useAuth } from '@/auth/AuthProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
      {role}
    </span>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-9 items-center gap-2 rounded-lg px-2 text-sm outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring">
        <span className="font-medium">{user.name}</span>
        <RoleBadge role={user.role} />
        <ChevronDown className="size-4 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
