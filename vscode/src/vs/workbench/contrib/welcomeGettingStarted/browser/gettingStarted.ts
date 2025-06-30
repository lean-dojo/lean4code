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
        // Check if text contains URLs and make them clickable
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        if (urlRegex.test(text)) {
          const parts = text.split(urlRegex);
          parts.forEach((part, index) => {
            if (urlRegex.test(part)) {
              const link = document.createElement('a');
              link.href = part;
              link.textContent = part;
              link.style.color = 'lightblue';
              link.style.textDecoration = 'underline';
              link.style.cursor = 'pointer';
              link.target = '_blank';
              el.appendChild(link);
            } else if (part) {
              el.appendChild(document.createTextNode(part));
            }
          });
        } else {
          el.textContent = text;
        }
      }
      wrapper.appendChild(el);
    };
  
    wrapper.appendChild(document.createElement('h1')).textContent = 'Welcome to Lean4Code';
    addParagraph('Welcome to Lean4Code, the customized code editor designed specifically for Lean 4!', 'p', true);
  
    wrapper.appendChild(document.createElement('h2')).textContent = '🚀 Getting started instantly:';
    addParagraph('To create a new Lean project, click the ∀ symbol on the top right of this page, or hold down Control + Shift + P (Cmd + Shift + P for Mac OS), to create a new Lean project template');
  
    wrapper.appendChild(document.createElement('h2')).textContent = '✨ Features';
    addParagraph('For any valid lean project, click the robot icon on the left to get started with LeanCopilot, the AI theorem proving assistant. Simply click "Setup LeanCopilot", and add "import LeanCopilot" to the top of any Lean file to start interacting with LeanCopilot!');
    addParagraph('-Never used LeanCopilot before? Get started here: https://github.com/lean-dojo/LeanCopilot');
  
    addParagraph('To trace any lean project using LeanDojo, simply click the dojo icon on the left hand panel. Enter a name for the trace, and the url and the most recent commit hash (you can find it on GitHub by clicking the circular clock icon right under the green "code" button for any repo, and then clicking the copy button for any commit) of the repo you want to trace. Then, add in your GitHub personal access token. Finally, paste in the version of Lean the repo to trace is using (i.e., paste in the contents of the repo\'s "lean-toolchain" file. From there, follow the instructions on the left hand side, and wait for your trace to complete!');
    addParagraph('-New to LeanDojo? Read up on it here: https://leandojo.org/');
  
    addParagraph('We\'re still working on more tools for Lean4Code, including more integrated LeanDojo features, and a implementation of LeanAgent.');
  
    const hr = document.createElement('hr');
    hr.style.margin = '2rem 0';
    wrapper.appendChild(hr);
  
    const noteSection = document.createElement('div');
    noteSection.style.border = '1px solid #666';
    noteSection.style.padding = '1rem';
    noteSection.style.margin = '1rem 0';
    noteSection.style.borderRadius = '4px';
    noteSection.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    
    const noteText = document.createElement('p');
    noteText.textContent = 'This is the beta version of Lean4Code. This is our first iteration of the app, and is not meant to be a final product. Please report any errors you encounter using Lean4Code using the issues tab, or send an email to adkisson@wustl.edu.';
    noteText.style.margin = '0';
    noteSection.appendChild(noteText);
    
    wrapper.appendChild(noteSection);
  
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
