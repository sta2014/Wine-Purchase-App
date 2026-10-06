# The Wine Journal

A personal wine tracker for bottles you want to buy and wines you have purchased. Built with JavaScript and Vite, with locally bundled fonts and no backend, login, analytics, or external runtime services.

## Using your journal

- **Add a wine** to your wishlist or purchased wines. Record the name, producer, vintage, type, region, price and currency, bottle count, and notes.
- **Mark as purchased** opens the details so you can confirm the price, quantity, and purchase date.
- **Edit** any wine using its pencil button; removal requires confirmation.
- Search by name, producer, region, vintage, or notes. Filter by list or wine type and sort by name or date added.
- **Backups → Export backup** downloads your journal as a JSON file. Import a backup to add records on another browser or device; identical IDs are skipped and existing edits are preserved.

Records stay in local browser storage under `wine-journal.v1`. They belong to that browser and website address; clearing site data, switching browsers, or switching addresses will not carry the records over. Private browsing may not retain data. Export backups regularly. There is no automatic device sync. Bottle counts describe purchases, not remaining cellar inventory.

## Development

Requires Node.js 22.12 or newer (validated with Node.js 24.19.0) and npm.

```sh
npm ci --cache /tmp/wine-npm-cache --no-audit --no-fund
npm run dev -- --port 5173 --strictPort
```

Use the existing checkout at `/workspace/Wine-Purchase-App` in Codex cloud tasks. Each task is already isolated; do not create a Git worktree unless the user requests it. No credentials, environment variables, database, or API keys are required.

## Validation

```sh
npm test
npm run build
npm run test:e2e
```

The browser tests run against the production build, with desktop and phone viewports. They cover creation, persistence across reloads, purchasing, editing, deletion with confirmation, filtering, backup round trips, invalid imports, literal rendering of user text, viewport overflow, corrupt storage protection, and storage write failure. The configuration uses `/usr/bin/chromium` if installed. Else set `CHROMIUM_PATH` to a Chromium executable or install Playwright's browser with `npx playwright install chromium`. The test server uses port 4173 and exits when testing finishes.

```sh
npm run preview -- --port 4173 --strictPort
```

`npm run build` writes deployable static assets to `dist/`. A static website host can serve those files over HTTPS. Publishing a Codex environment preserves the development setup; it does not publish the app as a public website. No website deployment has been configured.

No live process survives an environment snapshot; restart the dev server in each new task. All dependency versions are recorded in `package-lock.json`.
