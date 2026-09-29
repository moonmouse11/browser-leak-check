import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_SOURCES, HTTP_SOURCES } from './config';
import { renderSelectionForm } from './selection-form';
import { recommendedSelection } from './selection';

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.replaceChildren(container);
});

function checkedIds(): string[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
    .filter((box) => box.checked)
    .map((box) => box.value);
}

function button(text: string): HTMLButtonElement {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)!;
}

function render(onSave = vi.fn(async () => {}), knownIds: string[] | null = null) {
  renderSelectionForm(container, { selected: recommendedSelection(), knownIds, saveLabel: 'save', onSave });
  return onSave;
}

describe('renderSelectionForm', () => {
  it('lists every registry source and preselects the recommended set', () => {
    render();

    expect(container.querySelectorAll('input[type=checkbox]')).toHaveLength(ALL_SOURCES.length);
    expect(checkedIds().sort()).toEqual(recommendedSelection().sort());
  });

  it('"select all" selects every registry entry, "reset" goes back to recommended', () => {
    render();

    button('select all').click();
    expect(checkedIds().sort()).toEqual(ALL_SOURCES.map((s) => s.id).sort());

    button('reset to recommended').click();
    expect(checkedIds().sort()).toEqual(recommendedSelection().sort());
  });

  it('labels operator, asn and ip-data vendors', () => {
    render();

    const row = (id: string) => container.querySelector(`input[value="${id}"]`)!.closest('label')!.textContent;
    expect(row('ipinfo')).toContain('IPinfo');
    expect(row('ipinfo')).toContain('asn');
    expect(row('ipinfo')).toContain('sells ip data');
    expect(row('ipify')).not.toContain('asn');
    expect(row('ipify')).not.toContain('sells ip data');
  });

  it('marks sources added since the last save as new, and nothing on first run', () => {
    render(undefined, ALL_SOURCES.map((s) => s.id).filter((id) => id !== 'ip-guide'));
    expect(container.querySelectorAll('.lc-flag')).not.toHaveLength(0);
    const newFlags = [...container.querySelectorAll('.lc-flag')].filter((f) => f.textContent === 'new');
    expect(newFlags.map((f) => f.closest('label')!.querySelector('input')!.value)).toEqual(['ip-guide']);

    render(undefined, null);
    expect([...container.querySelectorAll('.lc-flag')].some((f) => f.textContent === 'new')).toBe(false);
  });

  it('blocks saving below two ip-echo services and says why', async () => {
    const onSave = render();
    for (const box of container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) {
      box.checked = HTTP_SOURCES[0]!.id === box.value;
    }
    container.querySelector('form')!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(button('save').disabled).toBe(true);
    expect(container.querySelector('.lc-selection-error')!.textContent).toMatch(/at least 2/);

    container.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('hands the checked ids to onSave', async () => {
    const onSave = render();

    container.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));

    expect((onSave.mock.calls[0] as unknown as [string[]])[0].sort()).toEqual(recommendedSelection().sort());
  });
});
