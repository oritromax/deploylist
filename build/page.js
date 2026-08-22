// The one page a human lands on. Everything factual here is derived from the
// catalog the build just produced, so it cannot drift from what is published.

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// Intent, not commitment. Kept here so the page and any future announcement
// read from one list.
export const PLANNED = [
  'Go', 'Rust', 'Java', 'Zig', 'Flutter',
];

const AUTHOR = { name: 'Oritro Ahmed', url: 'https://ioritro.com' };
const REPO = 'https://github.com/oritromax/deploylist';

export function renderStylesheet() {
  return `:root {
  color-scheme: light dark;
  --ink: #17171a;
  --muted: #5c5c66;
  --rule: #e3e3e8;
  --page: #fdfdfc;
  --box: #f5f5f3;
  --link: #1f5f8b;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ink: #e8e8ea; --muted: #9a9aa4; --rule: #2c2c31;
    --page: #131315; --box: #1b1b1e; --link: #7fb5d8;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 3rem 1.25rem 4rem; max-width: 46rem;
  background: var(--page); color: var(--ink);
  font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
h1 { font-size: 2rem; letter-spacing: -0.02em; margin: 0 0 0.25rem; }
h2 { font-size: 1.15rem; margin: 2.75rem 0 0.75rem; letter-spacing: -0.01em; }
h1 + p { color: var(--muted); font-size: 1.1rem; margin-top: 0; }
a { color: var(--link); }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.95em; }
pre {
  background: var(--box); border: 1px solid var(--rule); border-radius: 6px;
  padding: 0.9rem 1rem; overflow-x: auto;
}
table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; }
th, td { text-align: left; padding: 0.5rem 0.75rem 0.5rem 0; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); font-weight: 600; }
td.count { color: var(--muted); white-space: nowrap; }
ul { padding-left: 1.1rem; }
li { margin: 0.3rem 0; }
.note {
  border-left: 3px solid var(--rule); padding: 0.1rem 0 0.1rem 1rem;
  color: var(--muted); margin: 1rem 0;
}
.warning {
  background: var(--box); border: 1px solid var(--rule); border-radius: 6px;
  padding: 1rem 1.1rem; margin: 1rem 0;
}
.warning strong { color: var(--ink); }
footer {
  margin-top: 3.5rem; padding-top: 1.25rem; border-top: 1px solid var(--rule);
  color: var(--muted); font-size: 0.9rem;
}
footer p { margin: 0.35rem 0; }
`;
}

export function renderIndexHtml({ site, catalog, generated }) {
  const languages = catalog.filter((c) => c.kind === 'language');
  const frameworks = catalog.filter((c) => c.kind === 'framework');
  const universal = catalog.find((c) => c.kind === 'universal');
  const surfaces = catalog.filter((c) => c.kind === 'surface');

  // Counts are never summed across rows: a composed list already contains
  // everything it inherits, so adding a language to its framework would count
  // the universal checks two or three times over.
  const rows = languages.map((lang) => {
    const kids = frameworks.filter((f) => f.id.startsWith(`${lang.id}.`));
    const names = kids.length
      ? kids.map((k) => `<a href="${esc(site)}/${esc(k.stem)}.md">${esc(k.title)}</a> <span class="count">(${k.count})</span>`).join(', ')
      : '<span class="count">language layer only</span>';
    return `      <tr>
        <td><a href="${esc(site)}/${esc(lang.stem)}.md">${esc(lang.title)}</a></td>
        <td class="count">${lang.count}</td>
        <td>${names}</td>
      </tr>`;
  }).join('\n');

  const planned = PLANNED.map((p) => `      <li>${esc(p)}</li>`).join('\n');
  const year = generated.slice(0, 4);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>deploylist — a pre-deployment checklist your coding agent can read</title>
<meta name="description" content="Checklists of what should be true before software ships, published at stable URLs for coding agents. It reports; it never changes your project.">
<link rel="stylesheet" href="/style.css">
</head>
<body>

<h1>deploylist</h1>
<p>Checklists of what should be true before software ships, published as plain
files at fixed URLs so a coding agent can read them.</p>

<h2>Start here</h2>
<p>Give your agent this one link:</p>
<pre><code>${esc(site)}/llms.txt</code></pre>
<p>Or just say it:</p>
<pre><code>Check this project against ${esc(site)}/llms.txt</code></pre>
<p>That file is the index. Your agent reads it, works out which stack your
project is built on, fetches the matching checklist, runs the read-only
verification steps, and hands you a report of what it found.</p>
<p class="note">Nothing to install. No CLI, no account, no configuration — the
URLs are the whole product.</p>

<h2>What it checks</h2>
<p>Everything that should be true before a project goes to production: secrets
that should not be in git, debug flags left on, caching and build settings,
meta tags, error pages, logging, accessibility. Not only security, and not only
the basics. Every check carries a category and a severity, so you can take the
whole list or only the ship-blockers.</p>

<h2>What it will not do</h2>
<ul>
  <li><strong>It never changes your project.</strong> There is no apply mode and
      there will not be one. The agent's job ends at a report handed to you.</li>
  <li><strong>Not even unattended.</strong> Every published file tells the agent
      that running on autopilot is not the operator approval it is missing. If
      something needs changing, it says so and stops.</li>
  <li><strong>It does not run your framework's CLI.</strong> Where only that CLI
      can answer a question, deploylist suggests the command and leaves the
      decision to you.</li>
  <li><strong>It does not see your code.</strong> These are static files. Your
      agent fetches them; nothing is sent anywhere.</li>
</ul>

<h2>Covered today</h2>
<table>
  <thead>
    <tr><th>Language</th><th>Checks</th><th>Frameworks</th></tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<p>Each list is complete on its own: a framework list already contains the
language checks and ${universal ? `the ${universal.count} ` : ''}<a href="${esc(site)}/universal.md">universal
checks</a> that apply whatever the project is written in, which is why the
numbers above do not add up. The always-current catalog is
<a href="${esc(site)}/index.json">index.json</a>.</p>
${surfaces.length ? `<p>Some checks follow from what a project <em>is</em> rather than what it is
written in. Those live in their own layer, inherited only by the stacks they
apply to — a command-line tool has no favicon and should not be told it needs
one.</p>
<ul>
${surfaces.map((s) => `  <li><a href="${esc(site)}/${esc(s.stem)}.md">${esc(s.title)}</a> — ${s.count} checks</li>`).join('\n')}
</ul>` : ''}

<h2>Planned</h2>
<p>Wanted, not yet written:</p>
<ul>
${planned}
</ul>
<p>Nobody knows every stack. If you know one of these well, the
<a href="${esc(REPO)}">repository</a> takes contributions.</p>

<h2>Before you act on a report</h2>
<div class="warning">
<p><strong>Verify anything before you change it.</strong> A check can be wrong,
out of date, or wrong for your project specifically. You know your codebase,
your deadline and your risk; deploylist does not.</p>
<p>These lists are provided as-is, with no warranty. deploylist and its authors
are not responsible for anything that breaks in your project, whether you acted
on a finding or missed one.</p>
</div>

<footer>
<p><a href="${esc(REPO)}">Source and contributions on GitHub</a> ·
<a href="${esc(site)}/llms.txt">llms.txt</a> ·
<a href="${esc(site)}/index.json">catalog</a></p>
<p>Built by <a href="${esc(AUTHOR.url)}">${esc(AUTHOR.name)}</a>.
© ${esc(year)} ${esc(AUTHOR.name)}. Last built ${esc(generated)}.</p>
</footer>

</body>
</html>
`;
}
