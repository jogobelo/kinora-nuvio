# Kinora FastShare na Cloudflare

Verzia 0.4.0 pridáva HTTP doplnok kompatibilný so Stremio a sekciou Doplnky v Nuvio. Verejný manifest je `/manifest.json`, konfigurácia `/configure`, súkromný manifest `/a/<token>/manifest.json`. Staršie JS pluginy a párovacie odkazy ostávajú podporované.

- `npm test` zostaví Worker a spustí testy so syntetickými odpoveďami.
- `npx wrangler@4 deploy` nasadí Worker.
- Potrebný je secret `KINORA_SECRET` (32 náhodných bajtov base64url) a KV binding `SESSIONS`; `TMDB_API_KEY` je voliteľný.
- Build directory: `cloudflare`; build command: `npm test`.
- `/health` kontroluje konfiguráciu; `/connectivity` skúša verejné vyhľadávanie FastShare bez účtu.

[Postup inštalácie a obmedzenia](NAVOD_NUVIO.md).

Údaje HTTP doplnku sú šifrované v KV, bez ročnej expirácie. Nepísať prihlasovacie údaje ani súkromné manifesty do logov. FastShare môže odmietnuť hosting (HTTP 403); túto chybu nepovažujeme za nesprávne heslo a funkčnosť s reálnym účtom bez overenia nesľubujeme.

## Spustenie mimo Cloudflare (Node.js / Docker)

Prenositeľný server používa rovnaký HTTP doplnok. Neprenáša ani nekonvertuje video — TV sťahuje priamo z FastShare.

Node.js 22 alebo novší:

```sh
npm run build
PUBLIC_URL=https://vasa-domena.example DATA_DIR=/trvale/kinora npm start
```

Server štandardne počúva na `127.0.0.1:8080`; pre hosting s reverzným proxy nastav `HOST=0.0.0.0` a požadovaný `PORT`. Verejná doména musí používať HTTPS. `PUBLIC_URL` je jej presná adresa bez cesty. Na lokálny test je povolené `http://localhost:8080`.

V priečinku `DATA_DIR` sa automaticky vytvorí šifrovací kľúč a šifrované záznamy účtov. **Priečinok musí byť trvalý a zálohovaný**; strata kľúča zneplatní inštalácie. Nepoužívaj dočasný disk bez zálohy. Žiadny súbor z `data/` nenahrávaj na GitHub.

Docker image sa zostaví z tohto priečinka:

```sh
docker build -t kinora-fastshare .
docker run -d --restart unless-stopped --name kinora-fastshare \
  -p 127.0.0.1:8080:8080 -v kinora-data:/data \
  -e PUBLIC_URL=https://vasa-domena.example kinora-fastshare
```

Pred verejné sprístupnenie patrí HTTPS reverzný proxy. Vypni uňho logovanie celých ciest súkromných manifestov. Kontrola pripravenosti: `/health`; dostupnosť FastShare bez účtu: `/connectivity`.

Táto možnosť je pripravená a lokálne testovaná, **nie je nasadená na novom verejnom hostingu**. Dostupnosť FastShare treba overiť z konkrétneho vybraného hostingu. Založenie hostingu, prípadné platené služby a prihlásenie do nového poskytovateľa sú samostatný krok.
