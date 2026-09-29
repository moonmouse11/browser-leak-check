import '@/assets/theme.css';
import './style.css';
import { loadSelection, recommendedSelection, saveSelection, type LoadedSelection } from '@/lib/selection';
import { renderSelectionForm } from '@/lib/selection-form';
import { localArea, sessionArea } from '@/lib/storage';

// The consent gate. Nothing that contacts a third party is imported here:
// the checks live in ./checks-view, loaded only once a valid selection
// exists - so "no network contact before the user confirms" holds by
// construction, not by remembering not to call something.

const app = document.querySelector<HTMLDivElement>('#app')!;

function header(command: string, comment: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="lc-header">
      <span class="lc-prompt">leak-check</span><span class="lc-prompt-sep">$</span> ${command}<span class="lc-cursor"></span>
    </div>
    <p class="lc-comment"></p>
  `;
  wrapper.querySelector('.lc-comment')!.textContent = comment;
  return wrapper;
}

async function showChecks(selected: string[]): Promise<void> {
  const { renderPopupChecks } = await import('./checks-view');
  renderPopupChecks(app, header('status', 'privacy quick check'), selected);
}

function showSelection(previous: LoadedSelection | null): void {
  const note = document.createElement('p');
  note.className = 'lc-note';
  note.textContent = previous
    ? 'some of your selected services were removed in an update - pick at least 2 ip-echo services again'
    : 'pick which services may see your ip address. nothing is contacted until you save';

  const form = document.createElement('div');
  app.replaceChildren(header('sources', 'first run: choose sources'), note, form);

  renderSelectionForm(form, {
    selected: previous?.selected.length ? previous.selected : recommendedSelection(),
    knownIds: previous?.knownIds ?? null,
    saveLabel: 'save and run checks',
    onSave: async (ids) => {
      await saveSelection(ids, { local: localArea(), session: sessionArea() });
      await showChecks(ids);
    },
  });
}

loadSelection(localArea()).then((selection) => {
  if (selection?.valid) return showChecks(selection.selected);
  showSelection(selection);
});
