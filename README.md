<div align="center">
  <img src="./icons/stable/codium_cnl.svg" alt="Lean4Code Logo" width="200"/>
  <h1>Lean4Code</h1>
  <h3>The Official Build Repo</h3>
</div>

<h2>What is this / why does this exist?</h2>

<p>
This repo contains the build files for Lean4Code, a VSCodium based Lean-native code editor.
We wanted to minimize the bar of entry for getting started with Lean and using LeanDojo tools.
This is our solution, a code editor with a truly intuitive Lean experience.
</p>

<p><strong>Note:</strong> This is the beta version of Lean4Code. This is our first iteration of the app, and is not meant to be a final product. Please report any errors you encounter using Lean4Code using the issues tab, or send an email to adkisson@wustl.edu.</p>

<h2>Supported versions:</h2>

<p>
Lean4Code is supported across all three major operating systems.<br />
You can find the most recently compiled, prebuilt release of Lean4Code under the releases tab to the right of this page.
</p>

<h2>Built in features:</h2>

<p>Lean4Code comes with…</p>
<ul>
  <li>VSCode Lean4 extension downloaded and built in</li>
  <li>Built in scripts to for automatic download and integration of LeanCopilot into any repo</li>
  <li>A one-click LeanDojo tracing experience</li>
</ul>
<p>And we’re still working on new features!</p>

<h2>Build instructions</h2>

<ol>
  <li>Clone the repo
    <pre><code>git clone https://github.com/wadkisson/lean4code
cd lean4code</code></pre>
  </li>

  <li>Install npm in vscode dir<br />
    - From the main vscode directory:
    <pre><code>npm install</code></pre>
  </li>

  <li>Compile extensions<br />
    -In both <code>vscode/extensions/lean4dojo-panel</code>, and <code>vscode/extensions/leancopilot-panel</code>, run:
    <pre><code>npm install
npm run compile</code></pre>
  </li>

  <li>Build the Lean4 extension (<code>cd vscode/extensions/lean4</code>)<br />
    Then run:
    <pre><code>npm install
npm run build</code></pre>
  </li>
</ol>

<h2>Build commands for different systems</h2>

<p>Once the extensions are properly build and compiled, run the appropriate build command from the vscode root dir (<code>lean4code/vscode</code>) to build the app!</p>

<h4>macOS (Apple Silicon)</h4>
<pre><code>NODE_OPTIONS="--max-old-space-size=8192" npx gulp vscode-darwin-arm64</code></pre>

<h4>macOS (Intel)</h4>
<pre><code>NODE_OPTIONS="--max-old-space-size=8192" npx gulp vscode-darwin-x64</code></pre>

<h4>Linux (64-bit)</h4>
<pre><code>NODE_OPTIONS="--max-old-space-size=8192" npx gulp vscode-linux-x64</code></pre>

<h4>Windows (64-bit)</h4>
<pre><code>$env:NODE_OPTIONS="--max-old-space-size=8192"
npx gulp vscode-win32-x64</code></pre>

<p>You can bump memory up to <code>--max-old-space-size=16384</code> or more if needed.</p>

<hr />

<p>And that’s it! We’ve designed the app to be as intuitive as possible. The Welcome Screen will guide you through how to use the built in LeanDojo tools.</p>
