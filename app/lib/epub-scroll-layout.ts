export type ReadingViewport = { width: number; height: number };

/** Expanded chapter iframes are content surfaces, not the reader's viewport. */
export function continuousViewportValue(value: string, viewport: ReadingViewport) {
  return value.replace(/url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?<![\w.-])(-?(?:\d*\.)?\d+)(dvh|svh|lvh|vh|vmin|vmax)\b/gi, (match, number, unit) => {
    if (number === undefined) return match;
    const side = unit.toLowerCase() === "vmin" ? Math.min(viewport.width, viewport.height)
      : unit.toLowerCase() === "vmax" ? Math.max(viewport.width, viewport.height) : viewport.height;
    return `${Number((Number(number) * side / 100).toFixed(4))}px`;
  });
}

/** Retain original CSS so width/height changes can be resolved again. */
export function createContinuousStyleResolver() {
  const declarations = new WeakMap<CSSStyleDeclaration, Map<string, { value: string; priority: string }>>();
  const media = new WeakMap<CSSMediaRule, string>();
  return (doc: Document, viewport: ReadingViewport, matches: (query: string) => boolean) => {
    const resolveDeclaration = (style: CSSStyleDeclaration) => {
      let original = declarations.get(style);
      if (!original) { original = new Map(); declarations.set(style, original); }
      for (let i = 0; i < style.length; i++) {
        const property = style.item(i), current = style.getPropertyValue(property);
        if (!original.has(property) && continuousViewportValue(current, viewport) !== current)
          original.set(property, { value: current, priority: style.getPropertyPriority(property) });
      }
      for (const [property, source] of original) {
        const next = continuousViewportValue(source.value, viewport);
        if (style.getPropertyValue(property) !== next) style.setProperty(property, next, source.priority);
      }
    };
    const visited = new Set<CSSStyleSheet>();
    const visit = (sheet: CSSStyleSheet) => {
      if (visited.has(sheet)) return;
      visited.add(sheet);
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { return; }
      const walk = (rules: CSSRuleList) => {
        for (const rule of Array.from(rules)) {
          if (rule.type === 3) { const imported = (rule as CSSImportRule).styleSheet; if (imported) visit(imported); }
          if (rule.type === 4) {
            const group = rule as CSSMediaRule, query = media.get(group) ?? group.conditionText;
            if (/\b(height|orientation|aspect-ratio)\b/i.test(query)) {
              media.set(group, query);
              const next = matches(query) ? "all" : "not all";
              if (group.media.mediaText !== next) group.media.mediaText = next;
            }
          }
          const style = (rule as CSSStyleRule).style;
          if (style) resolveDeclaration(style);
          const children = (rule as CSSGroupingRule).cssRules;
          if (children) walk(children);
        }
      };
      walk(rules);
    };
    for (const sheet of Array.from(doc.styleSheets)) visit(sheet as CSSStyleSheet);
    for (const element of Array.from(doc.querySelectorAll<HTMLElement | SVGElement>("[style]"))) resolveDeclaration(element.style);
  };
}

/** Touch client coordinates are relative to a chapter which itself is moving. */
export function continuousTouchPoint(touch: { clientX: number; clientY: number }, frame: { left: number; top: number }) {
  return { x: touch.clientX + frame.left, y: touch.clientY + frame.top };
}
