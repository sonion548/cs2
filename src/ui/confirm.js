// A yes/no box drawn in the page. The browser's own confirm() can be blocked
// (an embedded page, a sandboxed frame, "don't let this page open dialogs"),
// and then it silently answers no, so a button that asks first did nothing.
// ask(message, { ok, cancel, danger }) resolves true for the confirm button
// (or Enter), false for cancel, a click outside the box, or Escape.
export function ask(message, { ok = 'Confirm', cancel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'confirm-layer';
    layer.innerHTML = `<div class="confirm-box" role="dialog" aria-modal="true"><p></p><div class="btns"><button data-a="no"></button><button data-a="yes" class="${danger ? 'danger' : 'pri'}"></button></div></div>`;
    layer.querySelector('p').textContent = message;
    layer.querySelector('[data-a="no"]').textContent = cancel;
    layer.querySelector('[data-a="yes"]').textContent = ok;
    const done = (v) => { document.removeEventListener('keydown', key, true); layer.remove(); resolve(v); };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); done(true); }
    };
    layer.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a) done(a === 'yes'); else if (e.target === layer) done(false);
    });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(layer);
    layer.querySelector('[data-a="yes"]').focus();
  });
}
