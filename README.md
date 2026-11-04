# Kinora pre Nuvio a Stremio

## HTTP doplnok 0.4.0 pre TV

Konfigurácia: https://kinora-fastshare.jogobelo.workers.dev/configure

Verejný manifest: https://kinora-fastshare.jogobelo.workers.dev/manifest.json

Zadaj účet na konfiguračnej stránke. Po úspešnom overení pridaj vytvorený súkromný manifest do **Doplnkov** v Nuvio alebo Stremio. Mobil nie je potrebný; nové HTTP odkazy nemajú ročný limit. Účet a heslo sú šifrované vo vlastnom Cloudflare KV, aby sa doplnok prihlasoval automaticky.

**Známy blokujúci problém:** FastShare odmieta požiadavky z Cloudflare HTTP 403, potvrdené aj verejným vyhľadávaním bez účtu. Samotné nové rozhranie tento problém nerieši. Reálne prihlásenie a prehrávanie zatiaľ nie sú potvrdené.

[Presný postup a obmedzenia](cloudflare/NAVOD_NUVIO.md) · [Nasadenie](cloudflare/README.md)

## Pôvodné pluginy

Root `manifest.json` a `fastshare.js` sú pôvodný JS plugin 0.1.4 pre mobilné Nuvio Full. Staršie párovacie odkazy 0.3.0 ostávajú podporované; ich časové limity sa nemenia.

Súkromné odkazy, prihlasovacie údaje a KINORA_SECRET nepatria do verejného GitHub repozitára.
