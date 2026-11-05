# Kinora FastShare 0.4.0 — HTTP doplnok

1. Na TV otvor hlavnú adresu svojho nového Netlify projektu s cestou `/configure` v prehliadači. Starý Cloudflare odkaz je blokovaný; nepoužívaj ho na nové prihlásenie.
2. Vyplň účet FastShare a preferencie. TMDB kľúč je voliteľný; umožní aj české a slovenské názvy vo vyhľadávaní.
3. Stlač **Prihlásiť a pripraviť doplnok**.
4. Po úspešnom overení stlač **Otvoriť v Nuvio / Stremio**. Ak Android ponúkne výber aplikácie, vyber Nuvio.
5. Ak sa aplikácia neotvorí, skopíruj vytvorenú URL do Nuvio → Nastavenia → Obsah a objavovanie → Doplnky → URL doplnku → Inštalovať.

Doplnok patrí do **Doplnkov**, nie JavaScript Pluginov. Rovnaký súkromný manifest môžeš pridať aj do mobilu. Iný účet FastShare si vytvorí samostatný manifest na konfiguračnej stránke.

Nie je potrebné odosielať reláciu z mobilu. Inštalačná URL a záznam účtu nemajú časovú expiráciu. Pri hľadaní sa doplnok znova prihlási do FastShare. Zmena hesla alebo nedostupnosť služby môže vyžadovať nové nastavenie. Zmazanie záznamu `record/a:<súkromný token>` v Netlify Blobs (alebo `a:<súkromný token>` v Cloudflare KV SESSIONS) zruší daný odkaz. Odstránenie doplnku z Nuvio samo osebe záznam v KV nemaže.

Účet a heslo sú uložené šifrovane pomocou KINORA_SECRET v súkromnom úložisku hostingu (Netlify Blobs alebo vlastné Cloudflare KV). Súkromný odkaz umožňuje používať účet; nezverejňuj ho. Zapnuté logovanie celých požiadaviek môže zaznamenať súkromný odkaz. Neposielaj heslá ani URL do verejného GitHub repozitára.

## Stav overenia

Protokol, filmy, epizódy, šifrovanie a neexpirujúca URL sú testované so syntetickými odpoveďami. Reálny účet ani prehrávanie na TV neboli automaticky overené. Známy problém: FastShare už odmietol požiadavky z Cloudflare s HTTP 403. Samotná zmena na HTTP doplnok blokovanie hostingu nerieši. Pri tejto chybe sa inštalačný odkaz nevytvorí; treba vyriešiť prístup z hostingu, nie opakovane meniť heslo.
