import siteConfig from '../../siteconfig';

export function initClock() {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-clock]'));
  if (!nodes.length) return;

  const timeZone = siteConfig.identity.timezone;

  const formatters = new Map<string, Intl.DateTimeFormat>();
  const format = (mode: string) => {
    const key = mode;
    let f = formatters.get(key);
    if (!f) {
      f = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        ...(mode === 'hms' ? { second: '2-digit' } : {}),
        hour12: false,
      });
      formatters.set(key, f);
    }
    return f.format(new Date());
  };

  const tick = () => {
    for (const node of nodes) {
      node.textContent = format(node.dataset.clock || 'hm');
    }
  };

  tick();
  window.setInterval(tick, 1000);
}
