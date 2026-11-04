# Kinora FastShare na Cloudflare

Verzia 0.4.0 pridáva HTTP doplnok kompatibilný so Stremio a sekciou Doplnky v Nuvio. Verejný manifest je `/manifest.json`, konfigurácia `/configure`, súkromný manifest `/a/<token>/manifest.json`. Staršie JS pluginy a párovacie odkazy ostávajú podporované.

- `npm test` zostaví Worker a spustí testy so syntetickými odpoveďami.
- `npx wrangler@4 deploy` nasadí Worker.
- Potrebný je secret `KINORA_SECRET` (32 náhodných bajtov base64url) a KV binding `SESSIONS`; `TMDB_API_KEY` je voliteľný.
- Build directory: `cloudflare`; build command: `npm test`.
- `/health` kontroluje konfiguráciu; `/connectivity` skúša verejné vyhľadávanie FastShare bez účtu.

[Postup inštalácie a obmedzenia](NAVOD_NUVIO.md).

Údaje HTTP doplnku sú šifrované v KV, bez ročnej expirácie. Nepísať prihlasovacie údaje ani súkromné manifesty do logov. FastShare môže odmietnuť hosting (HTTP 403); túto chybu nepovažujeme za nesprávne heslo a funkčnosť s reálnym účtom bez overenia nesľubujeme.
