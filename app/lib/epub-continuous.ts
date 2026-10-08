import { isScrollEnd } from "./reading-progress";
import { createReadingScheduler } from "./reading-scheduler";
import { createContinuousStyleResolver } from "./epub-scroll-layout";
/* eslint-disable @typescript-eslint/no-explicit-any */
// Foliate's navigation, CFI and annotations are shared by both reading modes.
// This renderer keeps adjacent chapters in one scroll surface and balances every
// section load/unload. Unseen chapters retain lightweight height placeholders.
type Section = { size?: number; linear?: string; load: () => Promise<string>; unload?: () => void };
type Entry = {
  index: number; element: HTMLElement; height: number; iframe?: HTMLIFrameElement;
  doc?: Document; overlayer?: any; observer?: ResizeObserver; promise?: Promise<void>;
  owned: boolean; disposed: boolean; ready?: boolean; cleanup?: () => void; measureFrame?: number;
};
type ScrollAnchor = { entry: Entry; range: Range; offset: number };

export function createContinuousRenderer(): HTMLElement {
  if (!customElements.get("papery-continuous")) {
    class Continuous extends HTMLElement {
      sections: Section[] = [];
      scroller = document.createElement("div");
      entries: Entry[] = [];
      currentIndex = 0;
      private styles = "";
      private closed = false;
      private navigating = false;
      private frame = 0;
      private updates = createReadingScheduler(() => this.updateVisible());
      private flushUpdates = () => {cancelAnimationFrame(this.frame);this.frame=0;this.updates.request(true);};
      private resize: ResizeObserver;
      private viewport = { width: 0, height: 0 };
      private mediaViewport = document.createElement("iframe");
      private resolveStyles = createContinuousStyleResolver();
      private anchor?: ScrollAnchor;

      constructor() {
        super();
        this.scroller.className = "epubContinuousScroll";
        Object.assign(this.scroller.style, { position: "relative", height: "100%", width: "100%", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", scrollbarWidth: "none", overflowAnchor: "none", touchAction: "pan-y pinch-zoom" });
        this.scroller.addEventListener("scroll", this.schedule, { passive: true });
        window.addEventListener("pagehide",this.flushUpdates);
        window.addEventListener("blur",this.flushUpdates);
        document.addEventListener("visibilitychange",this.flushUpdates);
        this.resize = new ResizeObserver(() => {
          if (this.closed) return;
          const width = this.scroller.clientWidth, height = this.scroller.clientHeight;
          if (width === this.viewport.width && height === this.viewport.height) return;
          const anchor = this.anchor ?? this.captureAnchor();
          this.updateViewport();
          for (const entry of this.entries) if (entry.doc) { this.resolveDocumentStyles(entry); this.measure(entry); }
          this.restoreAnchor(anchor);
          this.schedule();
        });
        this.resize.observe(this);
      }

      open(book: { sections: Section[] }) {
        Object.assign(this.style, { display: "block", height: "100%", width: "100%", minWidth: "0" });
        this.append(this.scroller);
        // Match book media queries in a fixed reading viewport, independently of
        // the content-height iframe. about:blank loads no book or network data.
        this.mediaViewport.setAttribute("aria-hidden", "true");
        this.mediaViewport.tabIndex = -1;
        Object.assign(this.mediaViewport.style, { position: "absolute", left: "-10000px", top: "0", border: "0", visibility: "hidden", pointerEvents: "none" });
        this.append(this.mediaViewport);
        this.updateViewport();
        this.sections = book.sections;
        this.entries = this.sections.map((section, index) => {
          const element = document.createElement("section");
          element.dataset.section = String(index);
          const height = section.linear === "no" ? 0 : Math.max(500, (section.size || 5000) * .14);
          Object.assign(element.style, { position: "relative", width: "100%", height: `${height}px`, overflow: "clip" });
          this.scroller.append(element);
          return { index, element, height, owned: false, disposed: false };
        });
      }

      private emit(name: string, detail: any) { this.dispatchEvent(new CustomEvent(name, { detail })); }
      private updateViewport() {
        this.viewport = { width: Math.max(1, this.scroller.clientWidth), height: Math.max(1, this.scroller.clientHeight) };
        this.mediaViewport.style.width = `${this.viewport.width}px`;
        this.mediaViewport.style.height = `${this.viewport.height}px`;
      }
      private resolveDocumentStyles(entry: Entry) {
        if (entry.doc) this.resolveStyles(entry.doc, this.viewport, query => this.mediaViewport.contentWindow?.matchMedia(query).matches ?? false);
      }
      private captureAnchor() {
        const entry = this.entries.find(item => item.height > 0 && item.element.offsetTop + item.height > this.scroller.scrollTop + 16);
        const range = this.visibleRange(entry);
        return entry && range ? { entry, range, offset: entry.element.offsetTop + range.getBoundingClientRect().top - this.scroller.scrollTop } : undefined;
      }
      private restoreAnchor(anchor?: ScrollAnchor) {
        if (anchor?.entry.doc && !anchor.entry.disposed) {
          this.scroller.scrollTop = anchor.entry.element.offsetTop + anchor.range.getBoundingClientRect().top - anchor.offset;
          this.anchor = anchor;
        }
      }
      private visibleRange(entry?: Entry): Range | undefined {
        const doc = entry?.doc;
        if (!doc?.body || !entry) return;
        const y = Math.max(2, Math.min(entry.height - 2, this.scroller.scrollTop - entry.element.offsetTop + 12));
        const x = Math.min((doc.defaultView?.innerWidth || 100) - 5, 24);
        const range = (doc as any).caretRangeFromPoint?.(x, y) as Range | undefined;
        if (range && doc.body.contains(range.startContainer)) return range;
        const fallback = doc.createRange(); fallback.selectNodeContents(doc.body); fallback.collapse(true); return fallback;
      }

      private measure(entry: Entry) {
        if (entry.disposed || !entry.doc?.body || !entry.iframe) return;
        const before = entry.height;
        const scrollTop = this.scroller.scrollTop;
        const above = entry.element.offsetTop + before <= scrollTop;
        const body = entry.doc.body;
        const bounds = body.getBoundingClientRect(), range = entry.doc.createRange();
        range.selectNodeContents(body);
        // body.scrollHeight may be the iframe viewport in quirks mode. Measure
        // actual content instead; include floating and positioned descendants.
        const height = Math.max(80, Math.ceil(bounds.height), Math.ceil(range.getBoundingClientRect().bottom - bounds.top)) + 36;
        // A reloaded chapter can have the same placeholder height while its new
        // iframe is still 1px tall. Restore the frame before comparing heights.
        const frameHeight = `${height - 36}px`;
        if (entry.iframe.style.height !== frameHeight) entry.iframe.style.height = frameHeight;
        if (Math.abs(before - height) < 1) return;
        entry.height = height;
        entry.element.style.height = `${height}px`;
        // Shrinking content can already clamp scrollTop. Add compensation to
        // the original position, not the browser's newly clamped position.
        if (above && !this.navigating) this.scroller.scrollTop = scrollTop + height - before;
        entry.overlayer?.redraw?.();
      }
      private scheduleMeasure(entry: Entry) {
        if (this.closed || entry.disposed || entry.measureFrame) return;
        entry.measureFrame = requestAnimationFrame(() => {
          entry.measureFrame = undefined;
          if (this.closed || entry.disposed) return;
          this.measure(entry); this.schedule();
        });
      }

      private applyStyles(entry: Entry) {
        if (!entry.doc) return;
        let style = entry.doc.getElementById("papery-continuous-style");
        if (!style) { style = entry.doc.createElement("style"); style.id = "papery-continuous-style"; entry.doc.head.append(style); }
        style.textContent = this.styles + `
          html,body{box-sizing:border-box!important;width:100%!important;max-width:none!important;min-width:0!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;columns:auto!important;column-count:auto!important;column-width:auto!important;column-gap:0!important;}
          html{padding:0!important;overflow:clip!important;overflow-anchor:none!important}body{display:flow-root!important;position:relative!important;margin:0!important;padding:0!important;overflow-anchor:none!important;}
          body>:is(main,article,section,div),body>:is(main,article,section,div)>:is(main,article,section,div){width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;max-height:none!important;overflow:visible!important;}
          img,svg,video{max-width:100%!important}table,pre{max-width:100%!important;overflow-wrap:anywhere;white-space:pre-wrap}
        `;
        this.resolveDocumentStyles(entry);
      }

      private load(entry: Entry): Promise<void> {
        if (entry.promise) return entry.promise;
        entry.disposed = false;
        entry.promise = (async () => {
          const src = await this.sections[entry.index].load();
          entry.owned = true;
          if (this.closed || entry.disposed) { this.release(entry); return; }
          const iframe = document.createElement("iframe");
          entry.iframe = iframe;
          iframe.title = `阅读正文 ${entry.index + 1}`;
          iframe.setAttribute("sandbox", "allow-same-origin allow-scripts");
          iframe.setAttribute("scrolling", "no");
          Object.assign(iframe.style, { display: "block", border: "0", width: "100%", height: "1px", overflow: "hidden" });
          await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error("章节载入超时")), 15000);
            iframe.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
            iframe.addEventListener("error", () => { clearTimeout(timer); reject(new Error("章节载入失败")); }, { once: true });
            iframe.src = src;
            entry.element.append(iframe);
          });
          if (this.closed || entry.disposed) { this.release(entry); return; }
          const doc = iframe.contentDocument;
          if (!doc?.body) throw new Error("章节内容无法读取");
          entry.doc = doc;
          this.applyStyles(entry);
          this.emit("load", { doc, index: entry.index });
          await doc.fonts.ready;
          if (this.closed || entry.disposed) return;
          this.measure(entry);
          this.emit("create-overlayer", { doc, index: entry.index, attach: (overlayer: any) => { entry.overlayer = overlayer; entry.element.append(overlayer.element); } });
          entry.observer = new ResizeObserver(() => this.scheduleMeasure(entry));
          entry.observer.observe(doc.body);
          const key = (event: KeyboardEvent) => {
            if ((event.target as Element)?.closest("input,textarea,select,[contenteditable=true]") || event.ctrlKey || event.metaKey) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); this.scrollDistance(event.key === "ArrowDown" ? 48 : -48); }
          };
          // Let the compositor handle dragging, trackpads and fling physics.
          // Chapter documents have no blocking touch/wheel listener.
          doc.addEventListener("keydown", key, true);
          entry.cleanup = () => doc.removeEventListener("keydown", key, true);
          entry.ready = true;
        })().catch(error => {
          this.release(entry);
          if (!this.closed && !entry.disposed) this.emit("reader-error", { index: entry.index, error });
          throw error;
        });
        return entry.promise;
      }

      private release(entry: Entry) {
        if (entry.owned) { entry.owned = false; this.sections[entry.index]?.unload?.(); }
      }
      private unload(entry: Entry) {
        entry.disposed = true;
        if (entry.measureFrame) cancelAnimationFrame(entry.measureFrame);
        entry.measureFrame = undefined;
        if (entry.doc) this.emit("unload", { doc: entry.doc, index: entry.index });
        entry.cleanup?.(); entry.observer?.disconnect(); entry.iframe?.remove(); entry.overlayer?.element?.remove();
        entry.doc = undefined; entry.iframe = undefined; entry.overlayer = undefined;
        // A pending load releases its resources when it settles.
        if (entry.owned) this.release(entry);
        entry.promise = undefined; entry.ready = false; entry.cleanup = undefined; entry.observer = undefined;
      }

      private schedule = () => {
        if (this.closed || this.navigating) return;
        // Flush the observed final viewport before leaving; do not delay 100%.
        if(this.atEnd){cancelAnimationFrame(this.frame);this.frame=0;this.updates.request(true);return;}
        if(this.frame)return;
        this.frame = requestAnimationFrame(() => { this.frame = 0; this.updates.request(); });
      };
      flushLocation() { this.flushUpdates(); }
      private updateVisible() {
        if (this.closed || this.navigating) return;
        const top = this.scroller.scrollTop + 16;
        const index = this.entries.findIndex(entry => entry.height > 0 && entry.element.offsetTop + entry.height > top);
        if (index < 0) return;
        this.currentIndex = index;
        this.anchor = this.captureAnchor();
        const visibleEnd = this.scroller.scrollTop + this.scroller.clientHeight;
        const lastVisible = Math.max(index, this.entries.findIndex(entry => entry.height > 0 && entry.element.offsetTop + entry.height >= visibleEnd));
        const first = Math.max(0, index - 1), last = Math.min(this.entries.length - 1, Math.max(index + 1, lastVisible + 1));
        for (const entry of this.entries) {
          if (entry.index >= first && entry.index <= last && this.sections[entry.index].linear !== "no") {
            if(!entry.ready)void this.load(entry).then(() => this.schedule()).catch(() => undefined);
          } else if (entry.ready) this.unload(entry);
        }
        this.relocate();
      }
      get atEnd() {
        const finalEntry = this.entries[this.entries.findLastIndex(item => item.height > 0)];
        return !!finalEntry?.ready && isScrollEnd(this.scroller.scrollTop, this.scroller.clientHeight, this.scroller.scrollHeight, 3);
      }
      private relocate(reason = "scroll") {
        if (this.closed || this.navigating) return;
        let entry = this.entries[this.currentIndex], range = this.visibleRange(entry);
        if (!entry?.ready || !range) return;
        const finalEntry = this.entries[this.entries.findLastIndex(item => item.height > 0)];
        const atEnd = this.atEnd;
        if(atEnd&&finalEntry.doc){entry=finalEntry;range=this.visibleRange(finalEntry)||range;}
        const offset = Math.max(0, this.scroller.scrollTop - entry.element.offsetTop);
        this.emit("relocate", { reason, index: entry.index, range, fraction: atEnd ? 1 : Math.min(1, offset / entry.height), size: Math.min(1, this.scroller.clientHeight / entry.height) });
      }

      async goTo(target: any) {
        const resolved = await target;
        const entry = this.entries[resolved?.index];
        if (!entry || this.closed) return;
        this.navigating = true;
        try {
          this.currentIndex = entry.index;
          await this.load(entry);
          if (this.closed) return;
          const anchor = typeof resolved.anchor === "function" ? resolved.anchor(entry.doc) : resolved.anchor;
          const y = typeof anchor === "number" ? anchor * entry.height : anchor?.getBoundingClientRect?.().top || 0;
          this.scroller.scrollTop = entry.element.offsetTop + y;
          this.anchor = this.captureAnchor();
        } finally { this.navigating = false; this.schedule(); }
      }
      scrollToAnchor(anchor: any) {
        const doc = anchor?.startContainer?.ownerDocument ?? anchor?.ownerDocument;
        const entry = (doc ? this.entries.find(item => item.doc === doc) : undefined) || this.entries[this.currentIndex];
        if (entry) this.scroller.scrollTop = entry.element.offsetTop + (typeof anchor === "number" ? anchor * entry.height : anchor?.getBoundingClientRect?.().top || 0);
      }
      scrollDistance(distance: number) { this.scroller.scrollTop += distance; }
      async next(distance?: number) { this.scrollDistance(distance ?? this.scroller.clientHeight * .9); }
      async prev(distance?: number) { this.scrollDistance(-(distance ?? this.scroller.clientHeight * .9)); }
      getContents() {
        return this.entries.filter(entry => entry.doc && !entry.disposed).sort((a, b) => Number(b.index === this.currentIndex) - Number(a.index === this.currentIndex)).map(({ index, doc, overlayer }) => ({ index, doc, overlayer }));
      }
      setStyles(styles: string | string[]) {
        const anchor = this.captureAnchor();
        this.styles = Array.isArray(styles) ? styles.join("\n") : styles;
        for (const entry of this.entries) if (entry.doc) { this.applyStyles(entry); this.measure(entry); }
        if (anchor) requestAnimationFrame(() => { if (!this.closed) this.restoreAnchor(anchor); });
      }
      destroy() {
        this.flushUpdates();this.updates.cancel();
        this.closed = true; this.resize.disconnect(); cancelAnimationFrame(this.frame);
        window.removeEventListener("pagehide",this.flushUpdates);window.removeEventListener("blur",this.flushUpdates);
        document.removeEventListener("visibilitychange",this.flushUpdates);
        this.scroller.removeEventListener("scroll", this.schedule);
        for (const entry of this.entries) this.unload(entry);
        this.mediaViewport.remove();
      }
    }
    customElements.define("papery-continuous", Continuous);
  }
  return document.createElement("papery-continuous");
}
