<div align="center">
  <img src="./icons/stable/codium_cnl.svg" alt="Lean4Code Logo" width="200"/>
  <h1>Lean4Code</h1>
  <h3>The Official Build Repo</h3>
</div>

<h2>What is this / why does this exist?</h2>

<p>
This repo contains the build files and official releases for Lean4Code, a VSCodium based Lean-native code editor.
We wanted to minimize the bar of entry for getting started with Lean and using LeanDojo tools.
This is our solution, a code editor with a truly intuitive Lean experience.
</p>

<h2>Supported versions:</h2>

<p>
Lean4Code is supported across all three major operating systems.<br />
You can find the most recently compiled, prebuilt release of Lean4Code under the releases tab to the right of this page.
</p>

<h2>Built in features:</h2>

<p>Lean4Code comes with…</p>
<ul>
  <li>VSCode Lean4 extension downloaded and built in</li>
  <li>Automatic download and integration of LeanCopilot</li>
  <li>A one-click LeanDojo tracing experience</li>
</ul>
<p>And we’re still working on new features!</p>

<h2>Build instructions</h2>

<ol>
  <li>Clone the repo
    <pre><code>git clone https://github.com/wadkisson/lean4code
cd lean4code</code></pre>
  </li>

  <li>Install npm in vscode dir / <strong>⚠️WINDOWS USERS⚠️ - Extra setup is required here. Check the end of the README and come back to this part</strong><br />
    - From the main vscode directory (lean4code/vscode):
    <pre><code>npm install</code></pre>
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

<h2>⚠️Windows users⚠️</h2>

<p>
Building Lean4Code on Windows requires Visual Studio Build Tools for native dependencies. Follow these steps to download Visual Studio Build Tools and continue building Lean4Code.
</p>

<ol>
  <li>Download Visual Studio Build Tools:
    <a href="https://visualstudio.microsoft.com/downloads/">https://visualstudio.microsoft.com/downloads/</a>
  </li>
  <li>Under the "Community" tab, click "Free Download"</li>
  <li>Run the installer</li>
  <li>In the installer:
    <ul>
      <li>Go to "Workloads", then check "Desktop development with C++"</li>
      <li>Then go to the "Individual Components" tab, and then search for and enable "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs (Latest)"</li>
    </ul>
  </li>
  <li>Apply changes, wait for installation, then restart your computer. From here, you can continue with build instruction #2 as normal.</li>
</ol>

<h2>⚠️Mac Users⚠️</h2>

<p>
MacOS GateKeeper automatically puts a quarantine on all apps it doesn't recognize. To remove Lean4Code's quarantine, and start using the app, run this terminal command, where "path" refers to wherever you have Lean4Code stored: "xattr -rd com.apple.quarantine path/Lean4Code.app"
</p>
