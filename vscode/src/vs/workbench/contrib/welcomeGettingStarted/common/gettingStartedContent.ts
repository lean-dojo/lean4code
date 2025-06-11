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

	<h2>🚀 Get Started Instantly</h2>
	<p>To begin using Lean:</p>
	<ul style="list-style: none; padding: 0;">
		<li>📂 <strong>Lean project folder</strong> — Lean4Code will automatically detect your environment.</li>
		<li>✅ If Lean 4 isn't installed, Lean4Code handles it behind the scenes.</li>
		<li>🛠️ No terminal setup, no command-line tools — everything is preconfigured and ready to go.</li>
	</ul>
	<p>You can start writing <code>.lean</code> files, viewing goals, and using tactics right away.</p>

	<h2>📚 New to Lean 4?</h2>
	<p>Get started with Lean 4 👉 <a href="https://leanprover-community.github.io/learn.html" style="color: lightblue;">https://leanprover-community.github.io/learn.html</a></p>

	<h2>💡 Coming Soon</h2>
	<p>We're working on one-click tools like:</p>
	<ul style="text-align: left;">
		<li><strong>Create a new Lean project</strong> from a template</li>
		<li><strong>LeanDojo</strong> — trace and explore Lean code from GitHub</li>
		<li><strong>LeanCopilot</strong> — smart AI auto-completion for Lean</li>
	</ul>
	<p>Stay tuned!</p>

	<hr style="margin: 2rem 0;" />
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
