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
- Il database è `/data/reparti.db` nel volume `data`. Ogni modifica finisce anche nella tabella `modifiche` (chi, quando, cosa).

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

L'immagine è `ghcr.io/<owner>/<repo>` in minuscolo, per esempio `ghcr.io/pippi/apprepartiospedali`. Se il repo è privato anche il package lo è: sulla VPS fai login con un Personal Access Token (classic) che ha solo lo scope `read:packages`:

```sh
echo <TOKEN> | docker login ghcr.io -u <utente-github> --password-stdin
```

## Configurazione Keycloak

Nel realm che usi già:

1. **Clients → Create client**
   - Client type: OpenID Connect, Client ID: `reparti`
   - Client authentication: **On** (client confidenziale), Standard flow: On
   - Valid redirect URIs: `https://reparti.example.com/oauth2/callback`
   - Valid post logout redirect URIs: `https://reparti.example.com/*`
   - Web origins: `https://reparti.example.com`
2. **Credentials** del client: copia il *Client secret* in `oauth2-proxy.env`.
3. **Audience mapper** (oauth2-proxy lo richiede): *Client scopes → reparti-dedicated → Add mapper → By configuration → Audience*, Included Client Audience = `reparti`, Add to access token = On.
4. **Ruoli** (facoltativi):
   - `reparti-editor` (ruolo di realm): chi può modificare. Corrisponde a `EDITOR_GROUPS=role:reparti-editor` nel `.env`.
   - `reparti-user`: se vuoi che solo alcuni utenti del realm possano entrare, attiva `OAUTH2_PROXY_ALLOWED_ROLES=reparti-user` in `oauth2-proxy.env`.

## Deploy sulla VPS

```sh
mkdir -p /opt/reparti && cd /opt/reparti
# copia qui docker-compose.yml, .env.example e oauth2-proxy.env.example dal repo
cp .env.example .env                       # dominio, immagine, rete/resolver Traefik, EDITOR_GROUPS
cp oauth2-proxy.env.example oauth2-proxy.env   # issuer Keycloak, client id/secret, cookie secret
chmod 600 oauth2-proxy.env

docker compose pull
docker compose up -d
docker compose logs -f
```

Il compose presuppone che la rete Docker di Traefik (`proxy`) esista già, e che Traefik abbia l'entrypoint `websecure` e il certresolver `le`. Tutti e tre si cambiano nel `.env`.

### Aggiornare

Dopo ogni push su `main`:

```sh
cd /opt/reparti && docker compose pull && docker compose up -d
```

Per tornare a una versione precedente imposta `TAG=sha-xxxxxxx` (o `TAG=1.2.3`) nel `.env` e rilancia `up -d`. Il service worker scarica la nuova versione dell'app alla prima apertura successiva.

### Backup

Il database è un unico file SQLite nel volume. Backup consistente anche ad app avviata:

```sh
docker compose exec app rm -f /data/backup.db
docker compose exec app node -e "new (require('node:sqlite').DatabaseSync)('/data/reparti.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker compose cp app:/data/backup.db ./reparti-$(date +%F).db
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
