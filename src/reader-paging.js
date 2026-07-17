const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

function intersects(rect, frameRect, viewerRect) {
  const left = frameRect.left + rect.left;
  const top = frameRect.top + rect.top;
  return left < viewerRect.right && left + rect.width > viewerRect.left && top < viewerRect.bottom && top + rect.height > viewerRect.top;
}

function textIsVisible(document, frameRect, viewerRect) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.textContent.trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      if ([...range.getClientRects()].some((rect) => intersects(rect, frameRect, viewerRect))) return true;
    }
    node = walker.nextNode();
  }
  return false;
}

function pageHasContent() {
  const viewer = document.querySelector("#viewer");
  const viewerRect = viewer.getBoundingClientRect();
  return [...viewer.querySelectorAll("iframe")].some((iframe) => {
    const frameRect = iframe.getBoundingClientRect();
    const content = iframe.contentDocument;
    if (!content?.body) return false;
    if (textIsVisible(content, frameRect, viewerRect)) return true;
    return [...content.querySelectorAll("img,svg,video,canvas")].some((element) => intersects(element.getBoundingClientRect(), frameRect, viewerRect));
  });
}

function navigateOnce(rendition, direction) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      rendition.off("relocated", finish);
      resolve();
    };
    rendition.on("relocated", finish);
    Promise.resolve(direction === "next" ? rendition.next() : rendition.prev()).catch(finish);
    setTimeout(finish, 900);
  });
}

export async function navigatePage(rendition, direction) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await navigateOnce(rendition, direction);
    await nextFrame();
    if (pageHasContent()) return;
  }
}
