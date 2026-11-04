# Kinora 0.3.0 — účet v mobilnom Nuvio, relácia pre TV

Táto verzia umožňuje vyplniť meno, heslo, preferencie a TMDB kľúč v nastaveniach Kinory v mobilnom **Nuvio Full**. Nuvio TV môže použiť získanú reláciu cez rovnakú súkromnú URL repozitára. Nie je potrebná upravená APK, PowerShell ani bežiaci notebook.

**Stav:** 12 automatizovaných testov prešlo so syntetickými účtami a odpoveďami. Skutočné nastavenia mobilného Nuvio, prihlásenie a prehrávanie na tvojej TV ešte nie sú overené. Nevymazávaj funkčný pôvodný variant pred úspešnou skúškou nového.

## 1. Jednorazovo v Cloudflare

1. Celý obsah **Kinora-Cloudflare-0.3.0.txt** vlož do Edit code namiesto doterajšieho kódu a klikni Deploy. Existujúci `KINORA_SECRET` ponechaj.
2. V Cloudflare otvor **Storage & databases → Workers KV** (podľa rozhrania tiež **KV**), vytvor namespace s názvom napríklad `kinora-sessions`.
3. Vráť sa na Worker `kinora-fastshare` → **Settings → Bindings → Add binding**. Vyber **KV namespace**, ako názov premennej/bindingu zadaj presne **SESSIONS** a vyber vytvorený namespace. Ulož/nasaď zmeny.
4. Ponechaj vypnuté Logs/Observability. Aplikácia nepíše meno, heslo ani reláciu do logov. Prevádzkové údaje hosťovateľa sa stále riadia jeho pravidlami.
5. Otvor svoju adresu Workeru s cestou `/health`. Očakávané hodnoty sú `version: "0.3.0"`, `ready: true` a `pairingReady: true`. Ak je `pairingReady: false`, úložisko ešte nie je pripojené.

## 2. Vytvorenie súkromného repozitára

1. Otvor hlavnú stránku Kinora a obnov ju cez Ctrl+F5.
2. V hornej časti **Nastaviť účet v mobilnom Nuvio** klikni na **Vytvoriť repozitár pre mobil a TV**. Tento krok iba vytvorí adresu; neprihlasuje do FastShare.
3. Skopíruj súkromnú URL a pridaj ju do **Pluginov** v mobilnom Nuvio Full. Nie do sekcie Stremio Doplnky: ide o repozitár JavaScript pluginu.
4. Rovnakú URL pridaj do Pluginov na TV cez lokálne rozhranie **Spravovať cez telefón → Pridať → Uložiť zmeny**. Môže sa preniesť aj cez synchronizáciu repozitárov Nuvio; ak ju TV neukazuje, pridaj ju ručne. Vyhľadaj poskytovateľa **Kinora FastShare — mobil a TV, 0.3.0**.

## 3. Nastavenia priamo v mobile

1. V mobilnom Nuvio otvor **Pluginy → Kinora FastShare — mobil a TV → nastavenia poskytovateľa**. Rozloženie tlačidla sa líši podľa verzie Full.
2. Vyplň meno a heslo FastShare. Podľa potreby vlastný TMDB kľúč/token.
3. Vyber **CZ + SK** alebo **ENG + originál**, veľkosť od najväčšieho/od najmenšieho.
4. Zapni **Odosielať reláciu a preferencie do spárovaného TV**. Predvolene je táto voľba vypnutá. Jej zapnutím sa do tvojho Workeru odošle prihlasovacia relácia a preferencie vrátane voliteľného osobného TMDB kľúča; meno ani heslo sa tam neposielajú.
5. Ulož nastavenia. Potom na mobile otvor **zoznam zdrojov konkrétneho filmu**. Až tento krok vykoná prihlásenie a odošle reláciu — samotné uloženie formulára nestačí. Prehrávanie nemusíš spustiť.
6. Na TV otvor ten istý film. Prenos cez KV môže trvať približne minútu alebo aj dlhšie; ak si TV otvoril skôr, po chvíli obnov zdroje.

TV sa neprihlasuje cez Cloudflare do FastShare. Získa z Workeru iba reláciu a nastavenia; vyhľadávanie aj prehrávanie vykonáva priamo zariadenie. Mobilné Nuvio sa prihlasuje priamo zo svojej siete, rovnako ako pôvodný mobilný doplnok.

## Obnovenie a zmeny

- Pri zmene preferencií ulož nastavenia v mobile a otvor zdroje filmu. Potom obnov zdroje na TV.
- Prenesená relácia má najviac 30 dní. Ak mobil používaš priebežne a má zapnuté odosielanie, pri otváraní zdrojov reláciu obnovuje. FastShare ju môže zneplatniť aj skôr; vtedy znovu otvor zdroje v prihlásenom mobile.
- Párovacia URL platí rok. Je to tajný prístup k relácii pre všetky zariadenia s touto adresou. Po roku vytvor novú a pridaj ju do oboch zariadení.
- Keď odosielanie vypneš, existujúca relácia v TV sa tým okamžite nezruší; zanikne po uplynutí platnosti alebo po zneplatnení vo FastShare. Vypni tiež poskytovateľa na TV, ak ho už nechceš používať. Výmena `KINORA_SECRET` zneplatní všetky URL obsluhované Workerom; už získané mediálne odkazy tým nemusia okamžite zaniknúť.
- Zdieľa sa iba relácia a preferencie tohto spárovania. Knižnica a profily Nuvio zostávajú vecou Nuvio.

## Diagnostika bez hesiel a tokenov

Súkromná párovacia URL končí `/manifest.json`. Ak v nej iba posledný názov zmeníš na `/status.json`, zobrazí `ready: true/false` bez samotného tokenu FastShare. Túto adresu nezdieľaj, obsahuje súkromný párovací kľúč. Pri podpore stačí napísať hodnotu ready a kód chyby.

- `PAIR_CONFIG`: chýba binding `SESSIONS`.
- `PAIR_EMPTY`: relácia ešte nebola odoslaná, nie je viditeľná v danom dátovom centre alebo už vypršala.
- `PAIR_EXPIRED`: párovacia URL je neplatná alebo po roku vypršala.
- Ak na mobile idú zdroje, ale stav zostáva false, over zapnuté odosielanie, rovnakú URL a binding. Ak mobilné prihlásenie zlyhá, nezvyšuj počet pokusov; over účet vo FastShare.
- Ak mobil používa vstavaný TMDB kľúč a TV ho nemá funkčný, vyplň v mobilných nastaveniach vlastný TMDB kľúč/token a znovu otvor zdroje, aby sa preniesol.

Relácia je uložená v KV vo forme AES-GCM šifrovaného záznamu, oddelene pre každé spárovanie. Heslo zostáva v nastaveniach Nuvio, jeho lokálne zabezpečenie riadi aplikácia. Používateľ s párovacou URL môže reláciu čítať aj nahradiť; nezverejňuj URL ani screenshoty s celou adresou.

## Testy a limity

Automatizované testy overujú prihlásenie z mobilného runtime, výslovné zapnutie odosielania, neprítomnosť mena/hesla v odosielanom tele, šifrovanie záznamu v KV, oddelenie párovaní, expiráciu, preberanie jazyka a veľkosti, vyhľadanie filmov a tv/series v TV runtime bez časovačov a zachovanie starého postupu 0.2.2. Testy používajú náhradu KV a simulované odpovede FastShare/TMDB. Nevyskúšali skutočnú aplikáciu, živú KV replikáciu ani prehrávač.

Podklad pre KV: https://developers.cloudflare.com/kv/concepts/kv-namespaces/ , https://developers.cloudflare.com/kv/concepts/kv-bindings/ , https://developers.cloudflare.com/kv/concepts/how-kv-works/
