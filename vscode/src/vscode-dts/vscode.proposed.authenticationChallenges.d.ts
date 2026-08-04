/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/260156

	/**
	 * Represents parameters for creating a session based on a WWW-Authenticate header value.
	 * This is used when an API returns a 401 with a WWW-Authenticate header indicating
	 * that additional authentication is required. The details of which will be passed down
	 * to the authentication provider to create a session.
	 */
	export interface AuthenticationWWWAuthenticateRequest {
		/**
		 * The raw WWW-Authenticate header value that triggered this challenge.
		 * This will be parsed by the authentication provider to extract the necessary
		 * challenge information.
		 */
		readonly wwwAuthenticate: string;

		/**
		 * @deprecated Use `wwwAuthenticate` instead.
		 */
		readonly challenge?: string;

		/**
		 * Optional scopes for the session. If not provided, the authentication provider
		 * may use default scopes or extract them from the challenge.
		 */
		readonly scopes?: readonly string[];
	}
}
