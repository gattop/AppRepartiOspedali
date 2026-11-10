# Reparti Ospedali

PWA per gli equipaggi: cerchi un reparto e vedi **ingresso, ascensore e piano**, con il percorso in 4 passi e il numero del reparto. Funziona offline con l'ultima copia dei dati scaricata.

- **Ospedali** (pagina iniziale): una grande card con foto per ogni ospedale; da lì si entra nella mappa e si cerca il reparto (nome, sigla, parole chiave). La foto è il campo `foto` dell'ospedale (file in `public/img/`)
- **Scheda reparto**: ingresso / ascensore / piano, percorso, note per l'equipaggio, "Chiama", verifica dei dati
- **Ospedali**: sedi (plessi/padiglioni), ingressi (con indicazione "consigliato ambulanze" / "non adatto a barelle"), ascensori, reparti piano per piano
- **Mappa 3D** per gli ospedali che la hanno (oggi l'Ospedale Carlo Urbani di Jesi): l'ospedale si apre direttamente sulla mappa, e la scheda di ogni reparto la mostra con il reparto evidenziato e il percorso disegnato (ingresso → ascensore → reparto)
- **Ospedali fatti di più palazzine** (oggi l'Ospedale Civile di Senigallia): la stessa pianta del sito è mostrata come modello 3D (ogni palazzina nel suo colore, un piano sopra l'altro, ingressi numerati come sui cartelli al piano terra) oppure dall'alto in 2D, con il pulsante 2D/3D sulla mappa; scegliendo un piano, ogni palazzina mostra i reparti di quel piano. Il 3D non richiede dati in più: usa i contorni (`poly`) e i piani (`lv`) delle palazzine
- Sulle mappe 3D: trascina per ruotare (il modello segue il dito e, rilasciato, continua a girare per un attimo), due dita o rotella per lo zoom, doppio clic per ingrandire
- **Preferiti** salvati sul dispositivo
- **Aggiungi / modifica** reparti, ingressi, ascensori, sedi e ospedali (solo per chi ha i permessi)
- **Gestisci** (matita nella pagina dell'ospedale, solo per chi ha i permessi): tabella per spostare velocemente i reparti (piano, corpo, ingresso, ascensore), rinominare ingressi e ascensori e dare un nome ai piani. Ogni campo si salva appena lo cambi. Se sposti un reparto in un altro corpo della mappa 3D, ascensore e indicazioni standard si aggiornano da soli. La piantina 3D non si modifica da qui.
- Layout ottimizzato per telefono e per PC (su schermi larghi: mappa grande a sinistra ed elenco a destra, tabelle per la gestione)

I mockup originali di Claude Design sono in [claude/](claude/).

## Architettura

```
Internet ──► Traefik ──► oauth2-proxy ──► app (Node 24 + SQLite)
             (rete proxy)   (login Keycloak)   (solo rete interna)
```

- `server/`: server HTTP in Node senza dipendenze npm (`node:http` + `node:sqlite`). API JSON più i file statici.
- `public/`: frontend in JavaScript puro (moduli ES), senza build. Il service worker (`sw.js`) tiene in cache l'app e i dati: l'elenco dei file lo scrive il server, quindi un file nuovo in `public/` non va aggiunto da nessuna parte (né lì, né nelle rotte pubbliche del compose, che riconoscono i file dall'estensione).

### Struttura del frontend

| File | Cosa contiene |
|---|---|
| `app.js` | punto d'ingresso: quale schermata per quale indirizzo, disegno della pagina, smistamento degli eventi |
| `router.js` | **l'unica tabella degli indirizzi** (`#/reparto/:id`…): i link si costruiscono con `href('reparto', id)`; regole di Indietro/Annulla |
| `data.js` | stato (`S`), indici (`X`), chiamate all'API, copia offline |
| `domain.js` | regole sugli ospedali: nomi dei piani (`floorWord`, `pianoInfo`), corpi/palazzine, percorso, telefono |
| `icons.js` | icone dell'interfaccia e icona per ogni tipo di reparto (regole sul nome) |
| `ui.js` | `render()`, messaggi, `mutate()` (salva, ricarica, avvisa) |
| `views/*.js` | le schermate; ognuna esporta accanto al suo HTML i propri gestori (`handlers.act/input/change/submit/key`) |
| `map/stage.js` | stato unico di tutte le mappe sullo schermo (`S.stages`), zoom, scelta della posizione nei moduli |
| `map/map3d.js`, `map/map2d.js` | disegno del modello 3D (SVG; blocchi rettangolari o palazzine di forma qualsiasi) e della pianta 2D; le parti comuni sono in `map/common.js` |
| `map/gestures.js` | trascinamento, pinch, rotella, doppio clic, tocco a vuoto |
| `app.css` | un blocco per componente; i colori delle mappe sono variabili `--m-*` su `.map-stage` |

Gli eventi sono delegati: un elemento con `data-act="nome"` esegue `handlers.act.nome` della sua schermata (lo stesso per `data-input`, `data-change`, `data-submit`). Un nome usato da due schermate blocca l'avvio con un errore, così non si sovrascrivono a vicenda.
- `server/seed/`: dati caricati al primo avvio, solo se il database è vuoto. `jesi.json` è reale (Piano di emergenza 2015, da verificare); `demo.json` è finto e si carica solo con `SEED_DEMO=true`.
- Il database è `data/reparti.db` nella cartella del compose (montata in `/data` nel container, esclusa da git). Ogni modifica finisce anche nella tabella `modifiche` (chi, quando, cosa).

La consultazione è pubblica: oauth2-proxy lascia passare senza login la pagina, i file dell'app e `GET /api/data`. Il login (pulsante "Accedi") serve solo per `/api/me` e per le modifiche. L'app non gestisce login: si fida degli header `X-Forwarded-Preferred-Username/Email/Groups` messi da oauth2-proxy. Per questo il container `app` **non va mai collegato alla rete di Traefik né esposto con una porta**.

## Sviluppo locale

Serve Node 24.

```sh
DEV_USER=io SEED_DEMO=true npm run dev   # http://localhost:3000
npm test
```

Con `DEV_USER` impostato l'app ti considera loggato con quel nome e con i permessi di modifica. In sviluppo (`APP_VERSION=dev`) il service worker non viene registrato.

## Pubblicazione dell'immagine (GitHub Actions)

[.github/workflows/docker.yml](.github/workflows/docker.yml) esegue i test e poi builda e pubblica l'immagine su GHCR:

| Evento              | Tag dell'immagine                          |
|---------------------|--------------------------------------------|
| push su `main`      | `latest`, `sha-xxxxxxx`                    |
| tag `v1.2.3`        | `1.2.3`, `1.2`, `sha-xxxxxxx`              |
| pull request        | build e test, nessun push                  |

L'immagine è `ghcr.io/<owner>/<repo>` in minuscolo, per esempio `ghcr.io/gattop/apprepartiospedali`. Con il repo pubblico anche il package è pubblico (verifica in *Packages → Package settings → visibility*), quindi sulla VPS non serve `docker login`.

## Configurazione Keycloak

Su `https://login.gattp.it/admin/`, realm **vps.homelab**:

1. **Clients → Create client**
   - Client type: OpenID Connect, Client ID: `reparti`
   - Client authentication: **On** (client confidenziale), Standard flow: On
   - Valid redirect URIs: `https://ospedali.kyrie.ee/oauth2/callback`
   - Valid post logout redirect URIs: `https://ospedali.kyrie.ee/*`
   - Web origins: `https://ospedali.kyrie.ee`
2. **Credentials** del client: copia il *Client secret* in `OIDC_CLIENT_SECRET` nel `.env`.
3. Crea il ruolo `reparti-editor`, come **ruolo del client** `reparti` (*Clients → reparti → Roles*) oppure come ruolo di realm: vanno bene entrambi. Assegnalo poi (*Users → utente → Role mapping*) a chi deve poter modificare. Dopo l'assegnazione bisogna uscire e rientrare nell'app. Se non vuoi gestire i ruoli, metti `EDITOR_GROUPS=` (vuoto) nel `.env`: allora possono modificare tutti gli utenti autenticati.

Il compose imposta già `OAUTH2_PROXY_OIDC_EXTRA_AUDIENCES: account`, perché Keycloak mette solo `account` nel campo `aud` dei token: non serve nessun mapper.

## Deploy sulla VPS

Tutta la configurazione non segreta (dominio, Keycloak, Traefik) è nel [docker-compose.yml](docker-compose.yml) come default. Sulla VPS il `.env`, che non va nel repo, contiene solo i due segreti:

```sh
git clone https://github.com/gattop/AppRepartiOspedali.git /home/gattp/appRepartiOspedali && cd /home/gattp/appRepartiOspedali
cp .env.example .env && chmod 600 .env
openssl rand -base64 32 | tr -- '+/' '-_'   # -> COOKIE_SECRET
nano .env                                   # OIDC_CLIENT_SECRET, COOKIE_SECRET

docker compose pull
docker compose up -d
docker compose logs -f
```

Il compose presuppone che la rete Docker di Traefik (`proxy`) esista già, e che Traefik abbia l'entrypoint `websecure` e il certresolver `letsencrypt`. Si possono cambiare nel `.env` (vedi le righe commentate in [.env.example](.env.example)).

### Aggiornare

Dopo ogni push su `main`:

```sh
cd /home/gattp/appRepartiOspedali && git pull && docker compose pull && docker compose up -d
```

Per tornare a una versione precedente imposta `TAG=sha-xxxxxxx` (o `TAG=1.2.3`) nel `.env` e rilancia `up -d`. Il service worker scarica la nuova versione dell'app alla prima apertura successiva.

### Backup

Tutto sta nella cartella del compose, con la stessa convenzione degli altri servizi:

- `./data`: database SQLite vivo. **Non copiarlo a caldo**: escludilo dai backup raw.
- `./backup`: snapshot consistenti `reparti-AAAA-MM-GG.db`, scritti dall'app all'avvio e poi una volta al giorno. Vengono tenuti gli ultimi `BACKUPS_TO_KEEP` (default 3). Questa è la cartella da includere nei backup.

Per ripristinare: `docker compose stop app`, copia lo snapshot in `./data/reparti.db` (cancellando `reparti.db-wal` e `reparti.db-shm`), poi `docker compose start app`.

## Variabili d'ambiente dell'app

| Variabile       | Default   | Significato |
|-----------------|-----------|-------------|
| `EDITOR_GROUPS` | (vuoto)   | Gruppi/ruoli che possono modificare, separati da virgola. Vuoto = tutti gli utenti autenticati. |
| `SEED_DEMO`     | `false`   | Al primo avvio carica anche gli ospedali di esempio. |
| `DATA_DIR`      | `/data`   | Cartella del database. |
| `BACKUP_DIR`    | `/backup` | Cartella degli snapshot giornalieri (vuoto = nessun backup automatico). |
| `BACKUPS_TO_KEEP` | `3`     | Quanti snapshot tenere. |
| `PORT`          | `3000`    | Porta HTTP interna. |
| `DEV_USER`      | (vuoto)   | Solo sviluppo: utente fittizio quando mancano gli header di oauth2-proxy. **Non usarlo in produzione.** |
| `APP_VERSION`   | `dev`     | Impostata dalla CI (sha o tag); rinnova la cache offline a ogni deploy. |

## Note sui dati

- I dati di Jesi vengono dal Piano di emergenza P.O. Carlo Urbani (rev. 2015), quelli di Senigallia dalla piantina ASUR Marche – Area Vasta 2; tutti sono marcati "mai verificato". Il pulsante **"Ho controllato: i dati sono corretti"** registra chi li ha verificati e quando.
- I numeri interni (4 cifre) diventano chiamabili solo se nella scheda dell'ospedale imposti il **prefisso per gli interni**.
- Ogni ingresso ha il suo **piano d'ingresso**: il percorso dice quanti piani salire o scendere. Negli ospedali con mappa 3D, ingressi e reparti si posizionano toccando il modello (intera ala o punto preciso) dal modulo di modifica.
