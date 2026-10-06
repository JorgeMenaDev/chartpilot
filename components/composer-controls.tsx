"use client";

/**
 * Composer toolbar controls after T3 Code's web composer (MIT): ComposerControl,
 * ProviderModelPicker + ModelPickerContent + ModelListRow, and TraitsPicker.
 * Class names follow T3's so the controls look the same.
 */

import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { BrainIcon, CheckIcon, ChevronDownIcon, LockIcon, SearchIcon } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import type { ReasoningEffort } from "@/lib/copilot";
import type { ModelOption } from "@/lib/models";

const controlClassName =
  "relative inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-(--control-radius) border border-transparent px-2.5 font-medium text-base text-secondary-label outline-none hover:bg-accent hover:text-foreground data-popup-open:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-64 sm:text-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4";

const popupClassName =
  "dropdown-glass relative flex origin-(--transform-origin) rounded-lg shadow-[0_18px_44px_-18px_rgb(0_0_0/80%)] outline-none transition-[opacity,scale] data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0";

function Chevron() {
  return <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 text-icon-muted" strokeWidth={2.25} />;
}

export function ControlSeparator() {
  return <span aria-hidden="true" className="mx-0.5 hidden h-4 w-px shrink-0 bg-border sm:block" />;
}

export function CopilotIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z" />
    </svg>
  );
}

/** Model picker: trigger with the provider icon and model name, and a searchable list popup. */
export function ModelPicker(props: {
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = props.models.find((m) => m.id === props.value);
  const q = query.trim().toLowerCase();
  const visible = q ? props.models.filter((m) => `${m.name} ${m.id}`.toLowerCase().includes(q)) : props.models;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger
        disabled={props.disabled}
        aria-label={selected?.name ?? "Choose model"}
        className={cn(controlClassName, "min-w-0 max-w-48 shrink justify-between sm:max-w-56")}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <CopilotIcon className="size-4 text-foreground" />
          <span className="min-w-0 flex-1 truncate">{selected?.name ?? "Choose model"}</span>
        </span>
        <Chevron />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="start" sideOffset={6} className="z-50">
          <Popover.Popup className={popupClassName}>
            <div className="relative flex max-h-86.5 w-screen max-w-90 flex-col overflow-hidden rounded-lg bg-muted/40">
              <div className="min-w-0 shrink-0 px-3 pt-2.5">
                <div className="relative -translate-y-px border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
                  <SearchIcon aria-hidden="true" className="pointer-events-none absolute top-1.5 left-0 size-4 text-muted-foreground/55" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search models..."
                    className="h-6.5 w-full bg-transparent ps-5 text-sm leading-6.5 outline-none placeholder:text-muted-foreground/70"
                  />
                </div>
              </div>
              <div role="listbox" className="min-h-0 overflow-y-auto overscroll-y-contain py-1.5 pr-px pl-2">
                {visible.map((model) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    selected={model.id === props.value}
                    onSelect={() => {
                      props.onChange(model.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  />
                ))}
                {visible.length === 0 && <p className="px-2 py-3 text-center text-muted-foreground text-xs">No models found</p>}
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ModelRow(props: { model: ModelOption; selected: boolean; onSelect: () => void }) {
  const locked = props.model.lockedReason !== null;
  return (
    <button
      type="button"
      role="option"
      aria-selected={props.selected}
      aria-disabled={locked}
      title={props.model.lockedReason ?? undefined}
      onClick={locked ? undefined : props.onSelect}
      className={cn(
        "group relative mb-0.5 flex min-h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent sm:min-h-7",
        props.selected && "bg-foreground/[0.08]",
        locked && "cursor-not-allowed opacity-64 hover:bg-transparent",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="min-w-0 truncate font-medium text-xs leading-snug">{props.model.name}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <CopilotIcon className="size-3 text-muted-foreground" />
          <span className="truncate font-normal text-muted-foreground/70 text-xs leading-snug">
            {locked ? props.model.lockedReason : "GitHub Copilot"}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        {locked ? <LockIcon className="size-3" /> : props.selected ? <CheckIcon className="size-3.5 text-foreground" /> : null}
      </div>
    </button>
  );
}

const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

/** Effort picker (T3's TraitsPicker): brain icon, current level, and a radio menu of the model's levels. */
export function EffortPicker(props: {
  efforts: ReasoningEffort[];
  defaultEffort: ReasoningEffort | null;
  value: ReasoningEffort | null;
  onChange: (effort: ReasoningEffort) => void;
  note?: string;
  disabled?: boolean;
}) {
  const current = props.value ?? props.defaultEffort;
  const label = current ? EFFORT_LABELS[current] : "Default";
  return (
    <Menu.Root>
      <Menu.Trigger disabled={props.disabled} aria-label={`Effort: ${label}`} className={cn(controlClassName, "shrink-0")}>
        <BrainIcon aria-hidden="true" className="size-4" />
        <span>{label}</span>
        <Chevron />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={6} className="z-50">
          <Menu.Popup className={cn(popupClassName, "min-w-40 flex-col p-1")}>
            <Menu.Group>
              <div className="px-2 pt-1.5 pb-1 font-medium text-muted-foreground text-xs">Effort</div>
              <Menu.RadioGroup value={current ?? ""} onValueChange={(v) => props.onChange(v as ReasoningEffort)}>
                {props.efforts.map((effort) => (
                  <Menu.RadioItem
                    key={effort}
                    value={effort}
                    closeOnClick
                    className="flex min-h-8 cursor-pointer items-center rounded-sm px-2 py-1 text-base text-foreground outline-none data-checked:bg-foreground/[0.08] data-highlighted:bg-accent data-highlighted:text-accent-foreground sm:min-h-7 sm:text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {EFFORT_LABELS[effort]}
                      {effort === props.defaultEffort && (
                        <span className="ms-1.5 rounded border border-border px-1 py-px text-[0.625rem] text-muted-foreground uppercase tracking-wide">
                          Default
                        </span>
                      )}
                    </span>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            {props.note && <p className="max-w-56 text-pretty px-2 pt-1.5 pb-1 text-muted-foreground/80 text-xs">{props.note}</p>}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** T3's round send button with its arrow glyph. */
export function SendButton(props: { disabled: boolean }) {
  return (
    <button
      type="submit"
      aria-label="Submit message"
      disabled={props.disabled}
      className="relative isolate flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-message-action text-message-action-foreground shadow-message-action/24 shadow-xs transition-all duration-150 enabled:cursor-pointer hover:scale-105 hover:bg-message-action-hover active:shadow-none disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none disabled:hover:scale-100 sm:h-8 sm:w-8"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
