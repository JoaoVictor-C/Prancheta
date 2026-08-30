# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/JoaoVictor-C/Prancheta/security/advisories/new)
on this repository. Include what you did, what happened, and what you expected;
a failing spec file is worth more than a paragraph.

Expect an acknowledgement within a week. This is a small project maintained by
one person — that is a realistic estimate, not a service level.

## What is in scope

Prancheta reads a figure specification and produces SVG, PNG and PDF. The
interesting boundaries are:

- **Spec input.** A spec is untrusted data. Anything in a spec that escapes its
  intended context in the emitted SVG — script execution, entity expansion,
  external references — is a vulnerability.
- **The measurement mirror.** Specs are laid out in a real headless Chromium.
  Anything that lets a spec reach beyond that page (navigation, file access,
  network requests from the mirror) is in scope.
- **Figure modules.** Modules run as separate processes, and
  `node src/cli.ts module python --args ...` spawns an interpreter by design.
  Running a module you chose to run is the feature. A path in a *spec* that
  causes an unintended process to be spawned is a vulnerability.
- **The MCP server.** `src/mcp/server.ts` accepts tool calls from an agent.
  Anything a tool call can reach that its schema does not describe is in scope.

## What is not in scope

- Rendering a figure that is ugly, wrong, or fails its checks. That is a bug —
  open an issue.
- Denial of service from a deliberately enormous spec. There is no promise of a
  resource bound; the tool is a local drafting board, not a public service.
- Vulnerabilities in Chromium, Node, or third-party packages, unless Prancheta
  is what makes them exploitable. Report those upstream.

## Handling secrets

This repository must never contain credentials. `.claude/settings.local.json`
and `.env` are ignored by the repository's own `.gitignore` rather than by a
developer's global one, because a global ignore does not travel with a clone.
If you believe a key has been committed, report it privately as above and
assume it is compromised — rotate first, discuss second.
