export function enableCopyButtons(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLButtonElement>('[data-copy-term]').forEach((button) => {
    button.hidden = false;
  });
}

export async function copyTermLink(button: HTMLButtonElement, rootURL: URL) {
  const status = button.parentElement?.querySelector<HTMLElement>('.copy-status');
  if (!status) return;
  const link = new URL(`terms/${button.dataset.copyTerm}/`, rootURL).href;
  try {
    await navigator.clipboard.writeText(link);
    status.textContent = 'Link copied.';
  } catch {
    status.textContent = `Copy this link: ${link}`;
  }
}

if (!document.querySelector('[data-dictionary]')) {
  enableCopyButtons();
  document.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-copy-term]')
        : null;
    if (button) copyTermLink(button, new URL(import.meta.env.BASE_URL, location.origin));
  });
}
