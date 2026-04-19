# Career Ops One UI Extension

This extension is a local-only Chrome side panel that works with the job queue and resume generator in this repo.

## What it does

- Shows the next role queue and daily stats.
- Opens the current job page one by one.
- Fills basic fields on supported forms.
- Attaches the tailored PDF on supported forms.
- Lets you log submitted/rejected/skipped states.
- Keeps manual login and captcha as the only human step.
- Includes portal adapters for Ashby and Greenhouse for better field and resume upload matching.

## What it cannot do universally

- It cannot bypass captcha.
- It cannot guarantee every site will accept programmatic file attachment.
- Some portals will still need manual review or field-by-field edits.

## Local helper service

Run this from the repo root:

```bash
npm run extension:serve
```

It starts a local helper API at `http://127.0.0.1:3030`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load unpacked extension from `chrome-extension/`.
4. Open the side panel from the extension icon.

## Suggested workflow

1. Prepare the queue from the extension side panel.
2. Open the current role.
3. Log in manually.
4. Press Auto after login (or Fill basic then Attach PDF).
6. Submit the form.
7. Press Mark submitted.

## Hotkeys

- `Ctrl+Shift+1` open next role
- `Ctrl+Shift+2` fill basic fields
- `Ctrl+Shift+3` attach PDF
- `Ctrl+Shift+4` mark submitted
