"use client";

import { Popover } from "@base-ui/react/popover";
import { SettingsIcon } from "lucide-react";
import { useState } from "react";
import { ModelControls, popupClassName } from "@/components/composer-controls";
import { Spinner } from "@/components/ui/spinner";
import { useModelChoice, VISUALIZATION_MODEL_KEY } from "@/lib/model-choice";
import { cn } from "@/lib/utils";

/** The gear at the top right: app settings, today the model that composes Visualize dashboards. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  // The catalog starts loading the first time the popover opens.
  const [opened, setOpened] = useState(false);
  const { catalog, choice, setModel, setEffort } = useModelChoice(VISUALIZATION_MODEL_KEY, opened);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setOpened(true);
      }}
    >
      <Popover.Trigger
        aria-label="Settings"
        title="Settings"
        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-(--control-radius) text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent data-popup-open:text-foreground"
      >
        <SettingsIcon className="size-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
          <Popover.Popup className={cn(popupClassName, "w-80 flex-col gap-3 p-3")}>
            <Popover.Title className="font-medium text-sm">Settings</Popover.Title>
            <section className="flex flex-col gap-1.5">
              <h3 className="font-medium text-muted-foreground text-xs">Visualization model</h3>
              <div className="-ms-2 flex min-h-7 items-center gap-1">
                {catalog ? (
                  <ModelControls catalog={catalog} choice={choice} onModel={setModel} onEffort={setEffort} disabled={false} />
                ) : (
                  <span className="flex items-center gap-2 ps-2 text-muted-foreground text-sm">
                    <Spinner /> Loading your models…
                  </span>
                )}
              </div>
              <p className="text-pretty text-muted-foreground/80 text-xs">
                Picks the widgets for each Visualize dashboard. Separate from the chat model; runs on your Copilot plan.
              </p>
            </section>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
