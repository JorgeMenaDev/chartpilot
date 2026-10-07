import { LogOutIcon, SquarePenIcon } from "lucide-react";
import { SettingsButton } from "@/components/settings-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Session } from "@/lib/session";
import { cn } from "@/lib/utils";

const tabs = [
  { key: "chat", label: "Chat", href: "/" },
  { key: "visualize", label: "Visualize", href: "/visualize" },
] as const;

/** The bar above every signed-in page: the app's tabs, then account controls and settings. */
export function AppHeader({ session, tab }: { session: Session; tab: (typeof tabs)[number]["key"] }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-4">
        <span className="font-semibold">Chartpilot</span>
        <nav className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5">
          {tabs.map((entry) => (
            <a
              key={entry.key}
              href={entry.href}
              aria-current={entry.key === tab ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                entry.key === tab ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-1">
        {/* A full reload is the simplest "new chat": chat state lives only in the page. */}
        {tab === "chat" && (
          <Button variant="ghost" size="sm" nativeButton={false} render={<a href="/" />}>
            <SquarePenIcon /> New chat
          </Button>
        )}
        <form action="/api/auth/logout" method="post">
          <Button variant="ghost" size="icon-sm" aria-label="Disconnect" title="Disconnect">
            <LogOutIcon />
          </Button>
        </form>
        <SettingsButton />
        <Avatar className="ms-1 size-7">
          <AvatarImage src={session.avatarUrl} alt={session.login} />
          <AvatarFallback>{session.login.slice(0, 2)}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
