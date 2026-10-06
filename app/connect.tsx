"use client";

import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PollResult } from "@/lib/github";

type Start = { userCode: string; verificationUri: string; interval: number } | { error: string };

// GitHub device flow: show the code, open github.com/login/device, poll until approved.
export function Connect() {
  const [code, setCode] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    const res = (await (await fetch("/api/auth/device", { method: "POST" })).json()) as Start;
    if ("error" in res) return setError(res.error);
    setCode(res);
    window.open(res.verificationUri, "_blank", "noopener");

    let interval = res.interval;
    while (true) {
      await new Promise((r) => setTimeout(r, interval * 1000));
      const poll = (await (await fetch("/api/auth/device")).json()) as PollResult;
      if (poll.status === "done") return window.location.reload();
      if (poll.status === "failed") {
        setCode(null);
        return setError(poll.message);
      }
      if (poll.interval) interval = poll.interval;
    }
  }

  if (code) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Enter this code on GitHub</p>
        <button
          onClick={() => navigator.clipboard.writeText(code.userCode)}
          title="Copy"
          className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 font-mono text-3xl font-semibold tracking-[0.15em] transition hover:bg-muted"
        >
          {code.userCode}
          <CopyIcon className="size-4 text-muted-foreground" />
        </button>
        <Button size="lg" nativeButton={false} render={<a href={code.verificationUri} target="_blank" rel="noopener" />}>
          Open github.com/login/device <ExternalLinkIcon />
        </Button>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Waiting for you to approve…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button size="lg" onClick={start}>
        Connect GitHub Copilot
      </Button>
    </div>
  );
}
