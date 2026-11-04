# Kinora pre Nuvio

FastShare poskytovateľ pre mobilné Nuvio Full a Nuvio TV.

## Prihlásenie v mobile a párovanie s TV (0.3.0)

Server a návod na automatické nasadenie z GitHubu sú v priečinku [cloudflare](cloudflare/README.md).

1. Pripoj existujúci Cloudflare Worker `kinora-fastshare` k tomuto repozitáru: vetva `main`, root directory `cloudflare`, build `npm test`, deploy `npx wrangler@4 deploy`.
2. Po úspešnom nasadení skontroluj `/health`: verzia `0.3.0`, `ready: true`, `pairingReady: true`.
3. Na stránke Kinora vytvor súkromný repozitár pre mobil a TV. Rovnakú URL pridaj do Pluginov oboch zariadení.
4. V nastaveniach poskytovateľa v mobilnom Nuvio vyplň účet, zapni odosielanie relácie a otvor zdroje filmu. TV prevezme reláciu a preferencie.

Podrobný [návod pre Nuvio](cloudflare/NAVOD_NUVIO.md) obsahuje nastavenie účtu, jazyka, úložiska a diagnostiku.

Meno ani heslo FastShare sa neposielajú do Workeru pri párovaní cez mobil. Súkromné inštalačné URL, účty a tajné kľúče nezverejňuj v tomto repozitári. `KINORA_SECRET` patrí iba do Cloudflare Secrets.

## Pôvodný mobilný variant

Súbory `manifest.json` a `fastshare.js` v koreni obsahujú pôvodný samostatný plugin 0.1.4. Nie sú inštalačnou URL nového párovania.

## Overenie

V priečinku `cloudflare` spustí `npm test` 12 integračných testov so simulovanými službami. Reálne prihlásenie a prehrávanie treba overiť na zariadeniach.
