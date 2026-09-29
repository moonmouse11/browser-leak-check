import '@/assets/theme.css';
import './style.css';
import { loadSelection, recommendedSelection, saveSelection } from '@/lib/selection';
import { renderSelectionForm } from '@/lib/selection-form';
import { localArea, sessionArea } from '@/lib/storage';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div>
    <div class="lc-header">
      <span class="lc-prompt">leak-check</span><span class="lc-prompt-sep">$</span> sources<span class="lc-cursor"></span>
    </div>
    <p class="lc-comment">which services may see your ip address</p>
  </div>
  <p class="lc-note">only the services selected here are contacted. "sells ip data" marks operators whose business is ip intelligence and who may keep your queries</p>
  <div id="form"></div>
  <p class="lc-note" id="saved" hidden>saved - the next check uses this selection</p>
`;

loadSelection(localArea()).then((selection) => {
  const saved = document.querySelector<HTMLParagraphElement>('#saved')!;

  renderSelectionForm(document.querySelector('#form')!, {
    selected: selection?.selected.length ? selection.selected : recommendedSelection(),
    knownIds: selection?.knownIds ?? null,
    saveLabel: 'save',
    onSave: async (ids) => {
      await saveSelection(ids, { local: localArea(), session: sessionArea() });
      saved.hidden = false;
    },
  });

  document.querySelector('#form')!.addEventListener('change', () => {
    saved.hidden = true;
  });
});
