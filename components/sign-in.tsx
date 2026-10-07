import { Connect } from "@/app/connect";

/** What a signed-out visitor sees on any page. */
export function SignIn() {
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
