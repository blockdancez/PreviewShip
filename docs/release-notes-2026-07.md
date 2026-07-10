# Release Draft: Safer Publishing, Clearer Errors, and Searchable Product Facts

Release date: to be set when deployed  
Draft verified: 2026-07-10

PreviewShip now lets signed-in users choose Public or Password before a deployment starts, so a password-protected project is never briefly published as public. Every project still keeps one fixed preview URL.

## Highlights

- Choose Public or Password before uploading; password protection is available on Pro.
- Existing protected projects keep their password when the password field is left blank.
- Upload errors now explain empty ZIPs, missing `index.html`, unbuilt source folders, multiple build folders, unsafe archive paths, and unreadable archives in plain language.
- Deployment outcomes, guest claims, checkout, payment, renewal, cancellation, and refund events now form one attributable measurement chain.
- New comparison and use-case hubs, four sourced comparison pages, machine-readable pricing/product facts, and IndexNow support improve search and AI-answer discoverability.
- CLI and MCP deployments support Public/Password using the same atomic backend flow.

## Try it

- Browser upload: https://previewship.com/try
- Guides: https://previewship.com/guides
- Product facts: https://previewship.com/facts
- Comparisons: https://previewship.com/compare

## Compatibility

Existing clients remain compatible: deployments that omit the new access fields default new projects to Public and preserve the current access mode on existing projects. Guest deployment remains Public.
