"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  clampHtmlRenderHeight,
  htmlRenderResult,
  htmlRenderTheme,
  injectHtmlRenderBootstrap,
  readHtmlRenderContentHeight,
  readHtmlRenderLinkRequest,
  type HtmlRender,
} from "@/lib/html-render";

const THEME = htmlRenderTheme("dark");

/**
 * An agent's HTML render inline in the chat, after T3 Code's HtmlRenderFrame:
 * the page on the chat's own background in a sandboxed frame, at the agent's
 * height until the page reports its own.
 */
export function HtmlRenderFrame({ render }: { render: HtmlRender }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState<number>();
  const srcDoc = useMemo(() => injectHtmlRenderBootstrap(render.html, THEME), [render.html]);
  const height = clampHtmlRenderHeight(contentHeight ?? render.height);

  // A page posts its height once per change, so listen from the commit that inserts the frame.
  useLayoutEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const reported = readHtmlRenderContentHeight(event.data);
      if (reported !== undefined) return setContentHeight(reported);
      // The page cannot open windows itself; it asks, and we open only right after the reader used it.
      const link = readHtmlRenderLinkRequest(event.data);
      if (link && navigator.userActivation?.isActive !== false) {
        window.open(link.url, "_blank", "noopener,noreferrer");
        frame.contentWindow?.postMessage(htmlRenderResult(link.id), "*");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function openInTab() {
    const url = URL.createObjectURL(new Blob([srcDoc], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <div className="group/render relative w-full animate-in fade-in duration-500" style={{ height }}>
      <iframe
        ref={frameRef}
        srcDoc={srcDoc}
        title={render.title}
        // Never allow-same-origin: the opaque origin keeps the page out of the app's session.
        sandbox="allow-scripts allow-forms"
        className="block size-full"
      />
      <div className="absolute end-2 top-2 opacity-0 transition-opacity group-hover/render:opacity-100 pointer-coarse:opacity-100">
        <Button size="icon-xs" variant="secondary" aria-label="Open in new tab" title="Open in new tab" onClick={openInTab}>
          <ExternalLinkIcon />
        </Button>
      </div>
    </div>
  );
}
