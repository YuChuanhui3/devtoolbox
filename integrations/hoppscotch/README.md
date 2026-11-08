# Local Hoppscotch API client

The official Community Edition frontend runs locally without backend, PostgreSQL, accounts, mail or an admin dashboard. The fixed upstream image is used only to extract frontend assets on first setup; Docker is not needed to run the prepared client.

```sh
npm run api:start
npm run dev
```

Open http://127.0.0.1:5173/tools/http-simulator. The static client serves http://127.0.0.1:3173 on loopback, retaining the previous browser storage origin. `api:stop`, `api:status` and `api:logs` manage this frontend process. Generated assets and process logs live under `.cache/hoppscotch`, excluded from Git. Keep this directory for offline startup. First setup needs Docker and the pinned official image; it creates an extraction container without starting it and removes it afterwards.

REST, GraphQL, WebSocket, SSE, Socket.IO, MQTT, local collections, environments, history, collection runs, scripts, tests, imports/exports and code generation remain available. Browser networking constraints still apply; upstream Agent/extensions or a separate proxy may be used where needed. These do not require the removed database.

Accounts, teams, invitations, server sync, short links, published documentation, hosted mock servers and administration are removed. Local Mock/load-testing extensions and the previous workspace's historical data remain accessible through the integration menu. Database-only content is not automatically copied into browser storage. The previous database volume has been retained as a backup, but is no longer mounted or used.

## Implementation and upgrades

`upstream.lock.json` pins the source reference, runtime version and extraction image. The generated frontend's platform initialization is adapted in `scripts/hoppscotch-local-prepare.mjs`: authentication initialization is disabled, user streams remain anonymous, infra and history sync adapters are removed. No backend endpoints are implemented or emulated. Unsupported bundle signatures fail setup, so upstream upgrades require review. `local-only.js` removes server-only controls and routes. The static server returns 404 for `/backend` and `/admin`.

`theme/workbench.css` is embedded during setup, including after re-preparation. It supplies the same blue accent and white/gray hierarchy used by the toolbox. The API client now shares the toolbox navigation shell. Existing theme preferences and local browser data are retained. Browser data should be backed up using collection and environment exports.

The official frontend license is preserved in `LICENSE.upstream`. Native desktop-only networking features require the corresponding upstream client. If `VITE_HOPPSCOTCH_URL` points at an independently deployed client, that deployment must also apply local-mode and theme adaptation; the parent iframe cannot change another origin's application.
