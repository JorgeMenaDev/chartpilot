// A saved or in-progress dashboard is a layout: which widgets, in which
// order, and any size the user picked by hand. The figures are never
// stored; `hydrate` refills every widget from the current candidates.
import type { Experimental_CompositionCandidate, Spec, UIElement } from "@json-render/core";
import type { Size } from "./catalog";

export type LayoutElement = {
  id: string;
  widget: string;
  children: string[];
  // A size chosen by hand; absent means the widget's own size.
  size?: Size;
};

export type Layout = { root: string; elements: LayoutElement[] };

// Every widget names itself in `widget`; only the Page has none.
const widgetOf = (element: UIElement) => (typeof element.props.widget === "string" ? element.props.widget : "page");

/** The layout of a composed spec, keeping hand-picked sizes from `previous`. */
export function toLayout(spec: Spec, previous?: Layout | null): Layout {
  const sizes = new Map(
    (previous?.elements ?? []).flatMap((element) => (element.size ? [[element.widget, element.size] as const] : [])),
  );
  return {
    root: spec.root,
    elements: Object.entries(spec.elements).map(([id, element]) => {
      const widget = widgetOf(element);
      const size = sizes.get(widget);
      return {
        id,
        widget,
        children: element.children ?? [],
        ...(size ? { size } : {}),
      };
    }),
  };
}

/**
 * The spec for a layout, filled with the current figures. Widgets that no
 * longer exist (a contractor removed, a callout with nothing to say) drop
 * out; `null` when not even the page survives.
 */
export function hydrate(layout: Layout, candidates: readonly Experimental_CompositionCandidate[]): Spec | null {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const live = new Map(
    layout.elements.flatMap((element) => {
      const candidate = byId.get(element.widget);
      return candidate ? [[element.id, { element, candidate }] as const] : [];
    }),
  );
  if (!live.has(layout.root)) return null;
  return {
    root: layout.root,
    elements: Object.fromEntries(
      [...live].map(([id, { element, candidate }]) => [
        id,
        {
          ...candidate.element,
          props: { ...candidate.element.props },
          children: element.children.filter((child) => live.has(child)),
        },
      ]),
    ),
  };
}

/** Hand-picked sizes by widget, for the renderer. */
export const sizeOverrides = (layout: Layout | null) =>
  new Map((layout?.elements ?? []).flatMap((element) => (element.size ? [[element.widget, element.size] as const] : [])));
