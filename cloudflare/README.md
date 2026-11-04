# Kinora: automatické nasadenie z GitHubu

Tento priečinok obsahuje prihlasovací a párovací Worker Kinora 0.3.0. Pôvodný statický plugin v koreňovom priečinku repozitára zostáva samostatným variantom.

## Cloudflare Workers Builds

Na existujúcom Worker **kinora-fastshare** otvor **Settings → Builds → Connect** a pripoj tento GitHub repozitár. Cloudflare povoľ prístup iba k repozitáru, ktorý chceš nasadzovať.

| Nastavenie | Hodnota |
| --- | --- |
| Repository | `jogobelo/kinora-nuvio` |
| Production branch | `main` |
| Root directory | `cloudflare` |
| Build command | `npm test` |
| Deploy command | `npx wrangler@4 deploy` |
| Worker name | `kinora-fastshare` |

Build zostaví jeden súbor `dist/worker.mjs` a spustí integračné testy. Až po úspechu nasleduje nasadenie. Každý ďalší push do produkčnej vetvy môže automaticky aktualizovať Worker. Pri prvom prepojení skontroluj vybranú vetvu a príkazy pred spustením.

Konfigurácia deklaruje KV binding `SESSIONS` bez ID. Aktuálny Wrangler podporuje automatické vytvorenie potrebného úložiska pri nasadení. Po nasadení over v Cloudflare Bindings a `/health`, že je pripojené správne úložisko. Ak chceš použiť už existujúci namespace, doplň jeho verejné ID do `kv_namespaces[0].id` pred nasadením; tým určíš konkrétne úložisko. Nezamieňaj ho za heslo ani KINORA_SECRET.

Existujúci Secret **KINORA_SECRET** ponechaj v Cloudflare. Žiadne účty, heslá, relácie, súkromné inštalačné URL ani osobný TMDB token do repozitára nepatria. Ak existujúci Worker už tento Secret má, nie je potrebné vytvárať nový. `keep_vars` zachováva premenné z Dashboardu; Secrets spravuje Cloudflare osobitne.

Po nasadení `/health` musí ukázať `version: "0.3.0"`, `ready: true` a `pairingReady: true`. Stránku obnov cez Ctrl+F5. Zvoľ **Vytvoriť repozitár pre mobil a TV** a postupuj podľa [návodu Nuvio](NAVOD_NUVIO.md), od časti vytvorenia súkromného repozitára. Ručné kroky vytvorenia KV z tohto druhého návodu môžeš preskočiť, ak ho automatické nasadenie už vytvorilo a pripojilo.

## Čo GitHub poskytuje

GitHub uchováva verejný kód a spúšťa nasadenie cez integráciu Cloudflare. Prihlásenie v mobilnom Nuvio ide priamo na FastShare; do šifrovaného KV sa so zapnutým odosielaním prenesie iba relácia a preferencie. GitHub Pages samotné tento serverový program ani úložisko nenahrádzajú.

## Overenie

Lokálne `npm test` vykoná 12 testov so simulovanými odpoveďami FastShare/TMDB a náhradou KV. Neoveruje reálne prihlásenie ani TV prehrávač. Prvé nasadenie, GitHub integráciu, živé KV a mobilné nastavenia treba ešte overiť na účte a zariadeniach používateľa.

Oficiálne podklady:
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning
