# Reparti Ospedali

PWA per gli equipaggi: cerchi un reparto e vedi **ingresso, ascensore e piano**, con il percorso in 4 passi, il navigatore fino all'ingresso giusto e il numero del reparto. Funziona offline con l'ultima copia dei dati scaricata.

- **Cerca**: ricerca su tutti gli ospedali (nome, sigla, parole chiave), filtro per ospedale
- **Scheda reparto**: ingresso / ascensore / piano, percorso, note per l'equipaggio, "Naviga", "Chiama", verifica dei dati
- **Ospedali**: sedi (plessi/padiglioni), ingressi (con indicazione "consigliato ambulanze" / "non adatto a barelle"), ascensori, reparti piano per piano
- **Mappa 3D** per gli ospedali che la hanno (oggi l'Ospedale Carlo Urbani di Jesi)
- **Preferiti** salvati sul dispositivo
- **Aggiungi / modifica** reparti, ingressi, ascensori, sedi e ospedali (solo per chi ha i permessi)

I mockup originali di Claude Design sono in [claude/](claude/).

## Architettura

```
Internet ──► Traefik ──► oauth2-proxy ──► app (Node 24 + SQLite)
             (rete proxy)   (login Keycloak)   (solo rete interna)
```

- `server/`: server HTTP in Node senza dipendenze npm (`node:http` + `node:sqlite`). API JSON più i file statici.
- `public/`: frontend in JavaScript puro, senza build. Il service worker (`sw.js`) tiene in cache l'app e i dati.
- `server/seed/`: dati caricati al primo avvio, solo se il database è vuoto. `jesi.json` è reale (Piano di emergenza 2015, da verificare); `demo.json` è finto e si carica solo con `SEED_DEMO=true`.
- Il database è `data/reparti.db` nella cartella del compose (montata in `/data` nel container, esclusa da git). Ogni modifica finisce anche nella tabella `modifiche` (chi, quando, cosa).

L'app non gestisce login: si fida degli header `X-Forwarded-Preferred-Username/Email/Groups` messi da oauth2-proxy. Per questo il container `app` **non va mai collegato alla rete di Traefik né esposto con una porta**.

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

L'immagine è `ghcr.io/<owner>/<repo>` in minuscolo, per esempio `ghcr.io/pippi/apprepartiospedali`. Con il repo pubblico anche il package è pubblico (verifica in *Packages → Package settings → visibility*), quindi sulla VPS non serve `docker login`.

## Configurazione Keycloak

Su `https://login.gattp.it/admin/`, realm **vps.homelab**:

1. **Clients → Create client**
   - Client type: OpenID Connect, Client ID: `reparti`
   - Client authentication: **On** (client confidenziale), Standard flow: On
   - Valid redirect URIs: `https://ospedali.kyrie.ee/oauth2/callback`
   - Valid post logout redirect URIs: `https://ospedali.kyrie.ee/*`
   - Web origins: `https://ospedali.kyrie.ee`
2. **Credentials** del client: copia il *Client secret* in `OIDC_CLIENT_SECRET` nel `.env`.
3. **Realm roles → Create role** `reparti-editor` e assegnalo (*Users → utente → Role mapping*) a chi deve poter modificare. Se non lo vuoi, metti `EDITOR_GROUPS=` (vuoto) nel `.env`: allora possono modificare tutti gli utenti autenticati.

Se dopo il login i log di oauth2-proxy mostrano `audience ... does not match`, aggiungi `OAUTH2_PROXY_OIDC_EXTRA_AUDIENCES: account` all'`environment` di oauth2-proxy nel compose.

## Deploy sulla VPS

Tutta la configurazione non segreta (dominio, Keycloak, Traefik) è nel [docker-compose.yml](docker-compose.yml) come default. Sulla VPS il `.env`, che non va nel repo, contiene solo l'immagine e i due segreti:

```sh
git clone https://github.com/<utente>/AppRepartiOspedali.git /opt/reparti && cd /opt/reparti
cp .env.example .env && chmod 600 .env
openssl rand -base64 32 | tr -- '+/' '-_'   # -> COOKIE_SECRET
nano .env                                   # IMAGE, OIDC_CLIENT_SECRET, COOKIE_SECRET

docker compose pull
docker compose up -d
docker compose logs -f
```

Il compose presuppone che la rete Docker di Traefik (`proxy`) esista già, e che Traefik abbia l'entrypoint `websecure` e il certresolver `le`. Si possono cambiare nel `.env` (vedi le righe commentate in [.env.example](.env.example)).

### Aggiornare

Dopo ogni push su `main`:

```sh
cd /opt/reparti && git pull && docker compose pull && docker compose up -d
```

Per tornare a una versione precedente imposta `TAG=sha-xxxxxxx` (o `TAG=1.2.3`) nel `.env` e rilancia `up -d`. Il service worker scarica la nuova versione dell'app alla prima apertura successiva.

### Backup

Tutti i dati sono in `./data` accanto al `docker-compose.yml`. Per un backup basta copiare la cartella ad app ferma (`docker compose stop app`). Ad app avviata, questo comando crea una copia consistente in `./data/backups/`:

```sh
docker compose exec -u node app node -e "require('fs').mkdirSync('/data/backups',{recursive:true});new (require('node:sqlite').DatabaseSync)('/data/reparti.db').exec(\"VACUUM INTO '/data/backups/reparti-$(date +%F-%H%M).db'\")"
```

## Variabili d'ambiente dell'app

| Variabile       | Default   | Significato |
|-----------------|-----------|-------------|
| `EDITOR_GROUPS` | (vuoto)   | Gruppi/ruoli che possono modificare, separati da virgola. Vuoto = tutti gli utenti autenticati. |
| `SEED_DEMO`     | `false`   | Al primo avvio carica anche gli ospedali di esempio. |
| `DATA_DIR`      | `/data`   | Cartella del database. |
| `PORT`          | `3000`    | Porta HTTP interna. |
| `DEV_USER`      | (vuoto)   | Solo sviluppo: utente fittizio quando mancano gli header di oauth2-proxy. **Non usarlo in produzione.** |
| `APP_VERSION`   | `dev`     | Impostata dalla CI (sha o tag); rinnova la cache offline a ogni deploy. |

## Note sui dati

- I dati di Jesi vengono dal Piano di emergenza P.O. Carlo Urbani (rev. 2015) e sono marcati "mai verificato". Il pulsante **"Ho controllato: i dati sono corretti"** registra chi li ha verificati e quando.
- I numeri interni (4 cifre) diventano chiamabili solo se nella scheda dell'ospedale imposti il **prefisso per gli interni**.
- Per un navigatore preciso fino all'ingresso, nella scheda dell'ingresso usa **"Usa la mia posizione attuale"** stando davanti all'ingresso. Senza coordinate si usa l'indirizzo della sede.
