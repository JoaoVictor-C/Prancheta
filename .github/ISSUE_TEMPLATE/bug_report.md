---
name: Bug report
about: A figure renders wrongly, a check misfires, or something crashes
title: ''
labels: bug
assignees: ''
---

## What happened

<!-- Include the spec if you can. A JSON file that reproduces the problem is
     the single most useful thing in this issue. -->

## What you expected instead

## How to reproduce

```bash
npm run render path/to/your-spec.json
```

<!-- Paste the check output and, if relevant, the manifest. If the figure
     rendered but looks wrong, attach the PNG. -->

## Environment

- Prancheta version or commit:
- Node version (`node -v`):
- OS:
- Python version, and which module (only if `modules/` is involved):

## Does it still happen with repair off?

<!-- `npm run render your-spec.json -- --no-repair` -- this separates "the
     figure was authored wrong" from "the repair loop made it wrong". -->
