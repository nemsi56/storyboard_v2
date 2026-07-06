# Current Status

As of July 6, 2026:

## Notes
strip_AI branch: removed all AI features (Analyze Story menu item, AI panel with Analysis/Chat tabs, ai.js, chat.js, and related state/CSS) so the app ships without them for now — to be reintroduced later. Also hardened the app: CSP meta tags on all pages, stricter JSON import validation, and cleanup of leftover AI localStorage keys.

Added release branch - this will serve as the branch that is always live through Pages (which redirects to scenesetterapp.com)

main currently includes strip_AI branch and that was pushed to the release branch

Going forward, experiment with new features in branches, push to main when ready to merge, and only push to release branch (and tag) when I want it to be the published version at scenesetterapp.com (it will automatically be served there because Pages reads from release branch)
