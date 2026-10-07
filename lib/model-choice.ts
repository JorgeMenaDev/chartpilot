"use client";

import { useEffect, useState } from "react";
import type { ModelChoice, ReasoningEffort } from "@/lib/copilot";
import type { ModelCatalog } from "@/lib/models";

/** Where each picker keeps its choice: the chat composer's, and the Visualize layout model's. */
export const CHAT_MODEL_KEY = "copilot-chat:model-choice";
export const VISUALIZATION_MODEL_KEY = "chartpilot:visualization-model";

const AUTO: ModelChoice = { model: "auto", effort: null };

/** The saved choice under `key`, or Auto. */
export function readModelChoice(key: string): ModelChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null") as ModelChoice | null;
    return saved?.model ? saved : AUTO;
  } catch {
    return AUTO;
  }
}

/**
 * The user's model catalog and the model + effort choice saved under `key`.
 * The catalog loads once `loadCatalog` is true, so a closed picker costs nothing.
 */
export function useModelChoice(key: string, loadCatalog: boolean) {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [choice, setChoice] = useState<ModelChoice>(AUTO);

  useEffect(() => setChoice(readModelChoice(key)), [key]);

  useEffect(() => {
    if (!loadCatalog || catalog) return;
    fetch("/api/models")
      .then((res) => (res.ok ? (res.json() as Promise<ModelCatalog>) : null))
      .then(setCatalog)
      .catch(() => {});
  }, [loadCatalog, catalog]);

  // A saved model the plan no longer offers falls back to Auto.
  const usable = catalog?.models.find((m) => m.id === choice.model && m.lockedReason === null);
  const effective: ModelChoice = catalog && !usable ? { model: "auto", effort: choice.effort } : choice;

  const update = (next: ModelChoice) => {
    setChoice(next);
    localStorage.setItem(key, JSON.stringify(next));
  };
  return {
    catalog,
    choice: effective,
    setModel: (model: string) => update({ model, effort: null }),
    setEffort: (effort: ReasoningEffort) => update({ ...effective, effort }),
  };
}
