/*---------------------------------------------------------------------------------------------
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { Dimension } from '../../../../base/browser/dom.js';
import { IEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IEditorOpenContext } from '../../../common/editor.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { GettingStartedInput } from './gettingStartedInput.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorSerializer } from '../../../common/editor.js';

export const inWelcomeContext = new RawContextKey('inWelcome', false);

export class GettingStartedInputSerializer implements IEditorSerializer {
  canSerialize(editorInput: EditorInput): boolean {
    return editorInput instanceof GettingStartedInput;
  }

  serialize(editorInput: EditorInput): string {
    return JSON.stringify({
      id: GettingStartedInput.ID,
      resource: GettingStartedInput.RESOURCE.toString(),
    });
  }

  deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): EditorInput {
    const parsed = JSON.parse(serializedEditorInput);
    if (parsed.id !== GettingStartedInput.ID) {
      throw new Error('Invalid getting started input');
    }
    return instantiationService.createInstance(GettingStartedInput, {});
  }
}

export class GettingStartedPage extends EditorPane {
  static readonly ID = 'gettingStartedPage';
  private container!: HTMLElement;

  constructor(
    group: IEditorGroup,
    @ITelemetryService telemetryService: ITelemetryService,
    @IThemeService themeService: IThemeService,
    @IStorageService storageService: IStorageService,
  ) {
    super(GettingStartedPage.ID, group, telemetryService, themeService, storageService);
  }

  protected override createEditor(parent: HTMLElement): void {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: 'white',
      fontFamily: 'sans-serif',
      fontSize: '16px',
      overflowY: 'auto',
    });
  
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      maxWidth: '800px',
      padding: '2rem',
      lineHeight: '1.6',
      textAlign: 'left',
    });
  
    const addParagraph = (text: string, tag: keyof HTMLElementTagNameMap = 'p', strong = false) => {
      const el = document.createElement(tag);
      if (strong) {
        const strongEl = document.createElement('strong');
        strongEl.textContent = text;
        el.appendChild(strongEl);
      } else {
        el.textContent = text;
      }
      wrapper.appendChild(el);
    };
  
    const addList = (items: string[]) => {
      const ul = document.createElement('ul');
      ul.style.listStyle = 'none';
      ul.style.padding = '0';
      items.forEach(text => {
        const li = document.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
      });
      wrapper.appendChild(ul);
    };
  
    const addLink = (text: string, href: string) => {
      const p = document.createElement('p');
      const link = document.createElement('a');
      link.textContent = text;
      link.href = href;
      link.style.color = 'lightblue';
      p.textContent = 'Get started with Lean 4 👉 ';
      p.appendChild(link);
      wrapper.appendChild(p);
    };
  
    wrapper.appendChild(document.createElement('h1')).textContent = 'Welcome to Lean4Code';
    addParagraph('Welcome to Lean4Code, the customized code editor designed specifically for Lean 4!', 'p', true);
  
    wrapper.appendChild(document.createElement('h2')).textContent = '🚀 Get Started Instantly';
    addParagraph('To begin using Lean:');
    addList([
      '📂 Lean project folder — Lean4Code will automatically detect your environment.',
      '✅ If Lean 4 isn’t installed, Lean4Code handles it behind the scenes.',
      '🛠️ No terminal setup, no command-line tools — everything is preconfigured and ready to go.'
    ]);
    addParagraph('You can start writing .lean files, viewing goals, and using tactics right away.');
  
    wrapper.appendChild(document.createElement('h2')).textContent = '📚 New to Lean 4?';
    addLink('https://leanprover-community.github.io/learn.html', 'https://leanprover-community.github.io/learn.html');
  
    wrapper.appendChild(document.createElement('h2')).textContent = '💡 Coming Soon';
    addParagraph('We\'re working on one-click tools like:');
    addList([
      'Create a new Lean project from a template',
      'LeanDojo — trace and explore Lean code from GitHub',
      'LeanCopilot — smart AI auto-completion for Lean'
    ]);
    addParagraph('Stay tuned!');
  
    const hr = document.createElement('hr');
    hr.style.margin = '2rem 0';
    wrapper.appendChild(hr);
  
    const closingNote = document.createElement('p');
    const em = document.createElement('em');
    em.textContent = 'Proudly built on VSCodium. Fully open-source 💙';
    closingNote.appendChild(em);
    wrapper.appendChild(closingNote);
  
    const checkboxLabel = document.createElement('label');
    checkboxLabel.style.marginTop = '30px';
    checkboxLabel.style.display = 'block';
    checkboxLabel.style.textAlign = 'center';
  
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'disableWelcomeCheckbox';
    checkbox.checked = localStorage.getItem('lean4code.disableWelcome') === 'true';
    checkbox.addEventListener('change', () => {
      localStorage.setItem('lean4code.disableWelcome', checkbox.checked ? 'true' : 'false');
    });
  
    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(document.createTextNode(" Don't show this on startup"));
    wrapper.appendChild(checkboxLabel);
  
    this.container.appendChild(wrapper);
    parent.appendChild(this.container);
  }
  

  public override layout(_dimension: Dimension): void {}
  public override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
    await super.setInput(input, options, context, token);
  }

  public makeCategoryVisibleWhenAvailable(category: string, step?: string): void {}
  public escape(): void {}
  public selectStepLoose(stepId: string): void {}
}
