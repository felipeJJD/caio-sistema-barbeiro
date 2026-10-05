// Safari needs the page fixed in place; overflow:hidden alone still permits page movement.
let lockCount = 0;
let restorePage: (() => void) | null = null;

function rememberStyles(element: HTMLElement, properties: string[]) {
  const previous = properties.map(property => [property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
  return () => previous.forEach(([property, value, priority]) => {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  });
}

export function lockAffiliateScroll() {
  if (lockCount === 0) {
    const { body, documentElement: html } = document;
    const x = window.scrollX;
    const y = window.scrollY;
    const restoreBody = rememberStyles(body, ["position", "top", "left", "width", "overflow", "overscroll-behavior"]);
    const restoreHtml = rememberStyles(html, ["overflow", "overscroll-behavior", "scroll-behavior"]);
    body.style.position = "fixed";
    body.style.top = `${-y}px`;
    body.style.left = `${-x}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    html.style.scrollBehavior = "auto";
    restorePage = () => {
      restoreBody();
      // Unlock scrolling before restoring the position, with smooth scrolling disabled.
      html.style.removeProperty("overflow");
      window.scrollTo(x, y);
      restoreHtml();
    };
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount -= 1;
    if (lockCount === 0) {
      restorePage?.();
      restorePage = null;
    }
  };
}
