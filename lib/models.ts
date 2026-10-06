import { approveAll, ToolSet } from "@github/copilot-sdk";
import { clientFor, type ReasoningEffort } from "./copilot";

/** One row in the composer's model picker. */
export type ModelOption = {
  id: string;
  name: string;
  efforts: ReasoningEffort[];
  defaultEffort: ReasoningEffort | null;
  /** Shown but not selectable, with this reason as the tooltip. */
  lockedReason: string | null;
};

export type ModelCatalog = { models: ModelOption[]; autoOnly: boolean };

const AUTO_EFFORTS: ReasoningEffort[] = ["low", "medium", "high"];
const EFFORTS = new Set<string>(["low", "medium", "high", "xhigh", "max"]);
const isEffort = (value: unknown): value is ReasoningEffort => typeof value === "string" && EFFORTS.has(value);

// Catalog ids that are internal or legacy, not models a person would pick.
const HIDDEN = /^(trajectory-|gpt-3\.5|gpt-4(?!\.1)|.*-free-auto$|.*-\d{4}-\d{2}-\d{2}$)/;

const AUTO: ModelOption = {
  id: "auto",
  name: "Auto",
  efforts: AUTO_EFFORTS,
  defaultEffort: null,
  lockedReason: null,
};

// "claude-haiku-4.5" → "Claude Haiku 4.5", "gpt-6-luna" → "GPT-6 Luna", for ids without a catalog name.
const ACRONYMS = new Set(["mai"]);
function displayName(id: string) {
  return id
    .replace(/^gpt-(\d)/, "gpt$1")
    .split("-")
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word.replace(/^gpt(\d)/, "GPT-$1").replace(/^\w/, (c) => c.toUpperCase())))
    .join(" ");
}

type RawModel = {
  id?: unknown;
  name?: unknown;
  supportedReasoningEfforts?: unknown;
  defaultReasoningEffort?: unknown;
  policy?: { state?: unknown };
};

/**
 * The models this user's Copilot plan can pick, read from the runtime. Copilot Free
 * returns an empty list (Auto only), so its catalog ids are shown locked instead.
 */
export async function getModelCatalog(login: string, token: string): Promise<ModelCatalog> {
  const client = await clientFor(login, token);
  const session = await client.createSession({ onPermissionRequest: approveAll, availableTools: new ToolSet() });
  try {
    const { list, modelPriceCategories } = await session.rpc.model.list({});
    const selectable = (list as RawModel[]).flatMap((m): ModelOption[] =>
      typeof m.id === "string" && m.id !== "auto"
        ? [
            {
              id: m.id,
              name: typeof m.name === "string" ? m.name : displayName(m.id),
              efforts: Array.isArray(m.supportedReasoningEfforts) ? m.supportedReasoningEfforts.filter(isEffort) : [],
              defaultEffort: isEffort(m.defaultReasoningEffort) ? m.defaultReasoningEffort : null,
              lockedReason: m.policy?.state === "disabled" ? "Disabled by your organization's Copilot policy" : null,
            },
          ]
        : [],
    );
    if (selectable.length > 0) return { models: [AUTO, ...selectable], autoOnly: false };

    const locked = (modelPriceCategories ?? [])
      .map((c) => c.id)
      .filter((id) => !HIDDEN.test(id))
      .map((id): ModelOption => ({ id, name: displayName(id), efforts: [], defaultEffort: null, lockedReason: "Needs a paid Copilot plan" }));
    return { models: [AUTO, ...locked], autoOnly: true };
  } finally {
    await session.disconnect().catch(() => {});
  }
}
