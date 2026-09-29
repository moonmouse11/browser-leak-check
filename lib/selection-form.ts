import { ALL_SOURCES, DNS_SOURCE, HTTP_SOURCES, STUN_SOURCES, type Source } from './config';
import { recommendedSelection, validateSelection } from './selection';

export interface SelectionFormOptions {
  selected: Iterable<string>;
  // Registry ids the user has already been shown; any other id is marked
  // "new". Null on first run, where everything is new and nothing is marked.
  knownIds: string[] | null;
  saveLabel: string;
  onSave: (ids: string[]) => Promise<void>;
}

const GROUPS: { title: string; hint: string; sources: Source[] }[] = [
  {
    title: 'ip-echo services',
    hint: 'each one sees your ip address; at least 2 are needed to compare',
    sources: HTTP_SOURCES,
  },
  {
    title: 'stun servers (webrtc check)',
    hint: 'none selected turns the webrtc check off',
    sources: STUN_SOURCES,
  },
  {
    title: 'dns leak check',
    hint: 'off when not selected',
    sources: [DNS_SOURCE],
  },
];

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function flags(source: Source, isNew: boolean): string[] {
  return [
    ...(source.kind === 'http' && source.providesAsn ? ['asn'] : []),
    ...(source.ipDataVendor ? ['sells ip data'] : []),
    ...(isNew ? ['new'] : []),
  ];
}

function choice(source: Source, checked: boolean, isNew: boolean): HTMLLabelElement {
  const label = element('label', 'lc-row lc-choice');

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.value = source.id;
  box.checked = checked;

  const name = element('span', 'lc-choice-name', source.name);
  const operator = element('span', 'lc-choice-operator', source.operator);
  const tags = element('span', 'lc-choice-flags');
  for (const flag of flags(source, isNew)) {
    tags.append(element('span', `lc-flag${flag === 'sells ip data' ? ' lc-flag--vendor' : ''}`, flag));
  }

  label.append(box, name, operator, tags);
  return label;
}

// Rendered with DOM APIs only - names and operators come from the registry,
// but nothing here is ever parsed as HTML.
export function renderSelectionForm(container: HTMLElement, options: SelectionFormOptions): void {
  const selected = new Set(options.selected);
  const known = options.knownIds && new Set(options.knownIds);

  const form = element('form', 'lc-selection');
  form.noValidate = true;

  for (const group of GROUPS) {
    const fieldset = element('fieldset', 'lc-panel lc-fieldset');
    const legend = element('legend', 'lc-legend', group.title);
    fieldset.append(legend, element('p', 'lc-fieldset-hint', group.hint));
    for (const source of group.sources) {
      fieldset.append(choice(source, selected.has(source.id), known !== null && !known.has(source.id)));
    }
    form.append(fieldset);
  }

  const error = element('p', 'lc-selection-error');
  error.setAttribute('role', 'status');

  const selectAll = element('button', 'lc-btn lc-btn--secondary', 'select all');
  selectAll.type = 'button';
  const reset = element('button', 'lc-btn lc-btn--secondary', 'reset to recommended');
  reset.type = 'button';
  const save = element('button', 'lc-btn', options.saveLabel);
  save.type = 'submit';

  form.append(error, selectAll, reset, save);
  container.replaceChildren(form);

  const boxes = () => [...form.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  const checkedIds = () => boxes().filter((box) => box.checked).map((box) => box.value);

  const refresh = () => {
    const validation = validateSelection(checkedIds());
    save.disabled = !validation.valid;
    error.textContent = validation.valid ? '' : validation.reason;
  };

  const setChecked = (ids: Set<string>) => {
    for (const box of boxes()) box.checked = ids.has(box.value);
    refresh();
  };

  selectAll.addEventListener('click', () => setChecked(new Set(ALL_SOURCES.map((source) => source.id))));
  reset.addEventListener('click', () => setChecked(new Set(recommendedSelection())));
  form.addEventListener('change', refresh);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    try {
      await options.onSave(checkedIds());
    } finally {
      refresh();
    }
  });

  refresh();
}
