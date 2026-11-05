# Kinora pre Nuvio a Stremio

HTTP doplnok FastShare s nastavením účtu na webe. Súkromný manifest patrí do **Doplnkov** v Nuvio alebo Stremio. Mobil nie je potrebný; HTTP odkazy nemajú ročnú expiráciu.

## Netlify Free — pripravené nasadenie

Vybraný nový hosting je Netlify Free. Repozitár obsahuje `netlify.toml`, funkciu pre Node.js a trvalé úložisko Netlify Blobs. Šifrovací kľúč sa vytvorí automaticky pri prvom použití a prežije aktualizácie.

1. Prihlás sa do Netlify a vyber bezplatný plán **Free**.
2. **Add new project → Import an existing project → GitHub**.
3. Pripoj iba repozitár **jogobelo/kinora-nuvio**, vetvu **main**.
4. Konfigurácia sa načíta z `netlify.toml`: base `cloudflare`, build `npm test`, publish `public`, functions `netlify/functions`.
5. Po nasadení otvor `/health` (musí vrátiť `ready: true`) a `/connectivity` (FastShare musí odpovedať HTTP 200).
6. Na hlavnej adrese projektu otvor `/configure`, vyplň účet FastShare a vytvor súkromný manifest. Ten pridaj do Doplnkov v Nuvio TV.

**Nasadenie do účtu Netlify ešte nie je potvrdené.** Reálne prihlásenie a prehrávanie overíme až po nasadení. Bezplatný plán má mesačný limit; po jeho vyčerpaní môže službu pozastaviť do obnovenia limitu.

Účet a heslo sa po úspešnom overení ukladajú šifrovane v súkromnom Netlify Blobs store `kinora-private-v1`. Inštalačný odkaz umožňuje používať účet, preto ho nezverejňuj. Zmazanie projektu alebo záznamov Blobs môže zneplatniť inštalácie. Ukážkové deploye nepoužívajú produkčné účty — konfiguráciu rob na hlavnej adrese projektu.

[Podrobnosti hostovania](cloudflare/README.md) · [Postup pre Nuvio](cloudflare/NAVOD_NUVIO.md)

## Cloudflare a ďalšie možnosti

Staré Cloudflare nasadenie vracia pri prístupe k FastShare HTTP 403 s kódom 1106. Nejde o potvrdenie nesprávneho hesla. Pôvodné párovacie odkazy 0.3.0 zostávajú podporované, vrátane svojich časových limitov.

[Node.js / Docker mimo Cloudflare](cloudflare/README.md) ostáva dostupný ako alternatíva. Root `manifest.json` a `fastshare.js` sú pôvodný JS plugin 0.1.4 pre mobilné Nuvio Full.

Súkromné odkazy, heslá, šifrovacie kľúče a obsah úložiska nepatria do verejného GitHub repozitára.
