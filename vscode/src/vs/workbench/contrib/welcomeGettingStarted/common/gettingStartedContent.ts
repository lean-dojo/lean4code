/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { URI } from '../../../../base/common/uri.js';

export const NEW_WELCOME_EXPERIENCE = 'NewWelcomeExperience';

const setupIcon = registerIcon('getting-started-setup', Codicon.zap, localize('getting-started-setup-icon', "Icon for welcome page"));

export type BuiltinGettingStartedStep = {
	id: string;
	title: string;
	description: string;
	media:
		| { type: 'markdown'; path: string }
		| { type: 'image'; path: string; altText: string }
		| { type: 'svg'; path: string; altText: string }
		| { type: 'video'; path: string; altText: string; poster?: string };
	when?: string;
	completionEvents?: string[];
};

export type BuiltinGettingStartedCategory = {
	id: string;
	title: string;
	description: string;
	isFeatured: boolean;
	icon: ThemeIcon;
	content: { type: 'steps'; steps: BuiltinGettingStartedStep[] };
	walkthroughPageTitle: string;
	when?: string;
};

type GettingStartedWalkthroughContent = BuiltinGettingStartedCategory[];

class GettingStartedContentProviderRegistry {
	private readonly providers = new Map<string, () => string>();

	registerProvider(moduleId: string, provider: () => string): void {
		this.providers.set(moduleId, provider);
	}

	getProvider(moduleId: string): (() => string) | undefined {
		return this.providers.get(moduleId);
	}
}

export const gettingStartedContentRegistry = new GettingStartedContentProviderRegistry();

export async function moduleToContent(resource: URI): Promise<string> {
	if (!resource.query) {
		throw new Error('Getting Started: invalid resource');
	}

	const query = JSON.parse(resource.query);
	if (!query.moduleId) {
		throw new Error('Getting Started: invalid resource');
	}

	const provider = gettingStartedContentRegistry.getProvider(query.moduleId);
	if (!provider) {
		throw new Error(`Getting Started: no provider registered for ${query.moduleId}`);
	}

	return provider();
}

// Register the Lean4Code welcome message
gettingStartedContentRegistry.registerProvider('lean4code_welcome', () => `
<div style="text-align: center; padding: 2rem; max-width: 800px; margin: auto; font-family: sans-serif; color: white; line-height: 1.6;">
	<h1>Welcome to Lean4Code</h1>
	<p><strong>Welcome to Lean4Code, the customized code editor designed specifically for Lean 4!</strong></p>

	<h2>📚 New to Lean 4?</h2>
	<p>Get started with Lean 4 👉 <a href="https://leanprover-community.github.io/learn.html" style="color: lightblue; text-decoration: underline; cursor: pointer;" target="_blank">https://leanprover-community.github.io/learn.html</a></p>

	<h2>🚀 Getting started instantly:</h2>
	<p>To create a new Lean project, click the ∀ symbol on the top right of this page, or hold down Control + Shift + P (Cmd + Shift + P for Mac OS), to create a new Lean project template</p>

	<h2>✨ Features</h2>
	<p>For any valid lean project, click the robot icon on the left to get started with LeanCopilot, the AI theorem proving assistant. Simply click "Setup LeanCopilot", and add "import LeanCopilot" to the top of any Lean file to start interacting with LeanCopilot!</p>
	<p>-Never used LeanCopilot before? Get started here: <a href="https://github.com/lean-dojo/LeanCopilot" style="color: lightblue; text-decoration: underline; cursor: pointer;" target="_blank">https://github.com/lean-dojo/LeanCopilot</a></p>

	<p>To trace any lean project using LeanDojo, simply click the dojo icon on the left hand panel. Enter a name for the trace, and the url and the most recent commit hash (you can find it on GitHub by clicking the circular clock icon right under the green "code" button for any repo, and then clicking the copy button for any commit) of the repo you want to trace. Then, add in your GitHub personal access token. Finally, paste in the version of Lean the repo to trace is using (i.e., paste in the contents of the repo's "lean-toolchain" file. From there, follow the instructions on the left hand side, and wait for your trace to complete!</p>
	<p>-New to LeanDojo? Read up on it here: <a href="https://leandojo.org/" style="color: lightblue; text-decoration: underline; cursor: pointer;" target="_blank">https://leandojo.org/</a></p>

	<p>We're still working on more tools for Lean4Code, including more integrated LeanDojo features, and a implementation of LeanAgent.</p>

	<hr style="margin: 2rem 0;" />
	
	<div style="border: 1px solid #666; padding: 1rem; margin: 1rem 0; border-radius: 4px; background-color: rgba(255, 255, 255, 0.05);">
		<h3 style="margin: 0 0 0.5rem 0;">Note:</h3>
		<p style="margin: 0;">This is the beta version of Lean4Code. This is our first iteration of the app, and is not meant to be a final product. Please report any errors you encounter using Lean4Code using the issues tab, or send an email to <a href="mailto:adkisson@wustl.edu" style="color: lightblue; text-decoration: underline; cursor: pointer;">adkisson@wustl.edu</a>.</p>
	</div>
	
	<p><em>Proudly built on VSCodium. Fully open-source 💙</em></p>
</div>
`);

export const walkthroughs: GettingStartedWalkthroughContent = [
	{
		id: 'lean4code-welcome',
		title: 'Welcome to Lean4Code',
		description: '',
		isFeatured: true,
		icon: setupIcon,
		walkthroughPageTitle: 'Lean4Code Onboarding',
		content: {
			type: 'steps',
			steps: [
				{
					id: 'lean4code-intro',
					title: '',
					description: '',
					media: {
						type: 'markdown',
						path: 'lean4code_welcome'
					}
				}
			]
		}
	}
];
