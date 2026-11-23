// Shared scroll-triggered typing effect for terminal blocks ([data-type]).
// Full text lives in the HTML first. Under reduced motion or without script,
// .typing is never added and every line renders immediately with zero layout shift.
export function initTypedTerminals(): void {
  const motion = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  if (!motion || !('IntersectionObserver' in window)) return;

  const terms = document.querySelectorAll<HTMLElement>('[data-type]');
  terms.forEach((term) => {
    if (term.dataset.typeBound === '1') return;
    term.dataset.typeBound = '1';

    const lines = [...term.querySelectorAll<HTMLElement>('.line[data-t]')];
    if (!lines.length) return;

    term.classList.add('typing');
    const run = async () => {
      for (const line of lines) {
        const tx = line.querySelector<HTMLElement>('.tx');
        const full = line.dataset.t ?? '';
        if (!tx) continue;
        tx.textContent = '';
        line.classList.add('on');
        const cmd = line.querySelector('.p');
        for (let i = 1; i <= full.length; i++) {
          tx.textContent = full.slice(0, i);
          await new Promise((r) => setTimeout(r, cmd ? 55 : 14));
        }
        await new Promise((r) => setTimeout(r, cmd ? 260 : 120));
      }
      term.dataset.typeDone = '1';
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(term);
  });
}
