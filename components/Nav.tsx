"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/ui";
import {
  HomeIcon,
  CalendarIcon,
  TasksIcon,
  ChartIcon,
  SettingsIcon,
} from "@/components/icons";
import { logoutAction } from "@/app/actions/auth";

const ITEMS = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/tasks", label: "Tasks", Icon: TasksIcon },
  { href: "/points", label: "Points", Icon: ChartIcon },
  { href: "/settings", label: "Settings", Icon: SettingsIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

interface NavUser {
  name: string;
  color: string;
  householdName: string;
}

export function SideNav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white p-4 md:flex">
      <div className="mb-6 px-2 pt-1">
        <div className="text-xl font-extrabold tracking-tight text-primary">
          DoMe
        </div>
        <div className="truncate text-xs text-muted">{user.householdName}</div>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-indigo-50 text-primary"
                  : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <Icon width={20} height={20} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border p-2">
        <Avatar name={user.name} color={user.color} size={32} />
        <span className="flex-1 truncate text-sm font-medium">{user.name}</span>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
          >
            Log out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function MobileHeader({ user }: { user: NavUser }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white/90 px-4 py-3 backdrop-blur md:hidden">
      <div>
        <div className="text-lg font-extrabold tracking-tight text-primary">
          DoMe
        </div>
      </div>
      <Link href="/settings">
        <Avatar name={user.name} color={user.color} size={32} />
      </Link>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {ITEMS.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
              active ? "text-primary" : "text-zinc-400"
            }`}
          >
            <Icon width={22} height={22} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
