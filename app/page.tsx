import { LogOutIcon, SquarePenIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { Chat } from "./chat";
import { Connect } from "./connect";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-2xl">✨</div>
        <div className="max-w-md space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Chartpilot</h1>
          <p className="text-muted-foreground">
            Connect your GitHub Copilot subscription and chat with an agent that draws charts when they help.
          </p>
        </div>
        <Connect />
        <p className="max-w-sm text-xs text-muted-foreground">
          Your token stays in an encrypted cookie. Usage counts against your own Copilot plan.
        </p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="font-semibold">Chartpilot</span>
        <div className="flex items-center gap-1">
          {/* A full reload is the simplest "new chat": chat state lives only in the page. */}
          <Button variant="ghost" size="sm" nativeButton={false} render={<a href="/" />}>
            <SquarePenIcon /> New chat
          </Button>
          <form action="/api/auth/logout" method="post">
            <Button variant="ghost" size="icon-sm" aria-label="Disconnect" title="Disconnect">
              <LogOutIcon />
            </Button>
          </form>
          <Avatar className="ms-1 size-7">
            <AvatarImage src={session.avatarUrl} alt={session.login} />
            <AvatarFallback>{session.login.slice(0, 2)}</AvatarFallback>
          </Avatar>
        </div>
      </header>
      <Chat login={session.login} />
    </main>
  );
}
