"use client";

import { useState } from "react";
import type { PollResult } from "@/lib/github";

type Start = { userCode: string; verificationUri: string; interval: number } | { error: string };

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
      <div className="device">
        <p>Enter this code on GitHub:</p>
        <button className="code" onClick={() => navigator.clipboard.writeText(code.userCode)} title="Copy">
          {code.userCode}
        </button>
        <a className="button" href={code.verificationUri} target="_blank" rel="noopener">
          Open github.com/login/device
        </a>
        <p className="fine">Waiting for you to approve…</p>
      </div>
    );
  }

  return (
    <>
      {error && <p className="error">{error}</p>}
      <button className="button" onClick={start}>
        Connect GitHub Copilot
      </button>
    </>
  );
}
