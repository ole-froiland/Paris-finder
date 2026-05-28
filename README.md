# Paris finder

En personlig, elegant boligkartlegger for Paris. Du legger inn leiligheter du vurderer, plasserer faste punkter (studiested, flyplass, severdigheter) og får kartet til å regne ut reisetid med kollektiv/gange fra hver leilighet til hvert punkt. Alt lagres lokalt i nettleseren — ingen innlogging, ingen database.

- Kart: **Leaflet + OpenStreetMap** (gratis, åpne data)
- Reisetider: **Google Distance Matrix API** (gratis kvote dekker mer enn nok)
- Geokoding: **Google Geocoding API** (gratis kvote)
- Hosting: **Netlify** (gratis)
- Sikkerhet: API-nøkkelen ligger på serveren i en Netlify Function — den eksponeres aldri til nettleseren.

---

## Filstruktur

```
.
├── index.html                       # All frontend (HTML + CSS + JS i én fil)
├── netlify.toml                     # Netlify-konfig
├── netlify/
│   └── functions/
│       ├── geocode.mjs              # Proxy: Google Geocoding
│       └── transit.mjs              # Proxy: Google Distance Matrix
└── README.md                        # Denne filen
```

---

## Steg 1 — Google API-nøkkel

Du trenger én Google-nøkkel som har tilgang til to APIer: **Geocoding API** og **Distance Matrix API**.

1. Gå til <https://console.cloud.google.com/> og logg inn med Google-kontoen din. Hvis du ikke har brukt Google Cloud før må du godta vilkårene og opprette et "billing account". Du må oppgi kort, men begge APIene har en stor gratiskvote (i 2026 er det $200 i månedlig kreditt på Maps Platform — i praksis nok til hundrevis av oppslag per dag).
2. Lag et nytt prosjekt: **Select a project → New Project**. Kall det f.eks. `paris-finder`.
3. Aktiver de to APIene:
   - I søkefeltet øverst, søk etter **Geocoding API** → klikk **Enable**.
   - Søk etter **Distance Matrix API** → klikk **Enable**.
4. Lag en API-nøkkel:
   - Gå til **APIs & Services → Credentials → + Create credentials → API key**.
   - Kopiér nøkkelen. **Lagre den et trygt sted** — du trenger den i Steg 3.
5. *(Anbefalt etter du har deployet i Steg 2)* Klikk på nøkkelen for å begrense bruken:
   - **Application restrictions: HTTP referrers** (websites)
   - Legg til Netlify-domenet ditt, f.eks. `https://ditt-sidenavn.netlify.app/*` og `https://*.netlify.app/*` mens du tester.
   - **API restrictions:** velg **Restrict key** og huk av kun **Geocoding API** og **Distance Matrix API**.
   - Lagre.

   > Viktig: Siden vi kaller Google fra Netlify Function (server-til-server), virker HTTP referrer-begrensning ikke for serverkall. For best sikkerhet bruker du heller **"None"** under Application restrictions, men beholder **API restrictions** (kun de to APIene). Da kan nøkkelen kun brukes til Geocoding og Distance Matrix, ikke til andre Google-tjenester.

---

## Steg 2 — Deploy på Netlify

Den enkleste måten er **dra-og-slipp**:

1. Opprett en gratis konto på <https://app.netlify.com/signup>.
2. Logg inn, klikk **Add new site → Deploy manually**.
3. Dra hele `Paris-finder`-mappen (inkludert `netlify`-undermappen) inn i feltet som dukker opp.
4. Vent ~30 sekunder. Du får en adresse av typen `https://<noe>.netlify.app/`. Du kan endre navnet under **Site settings → General → Change site name**.

> Alternativt — om du foretrekker GitHub: opprett et nytt repo, push filene, og koble det opp under **Add new site → Import from GitHub**. Da deployes appen automatisk hver gang du pusher.

---

## Steg 3 — Sett miljøvariabel og redeploy

Funksjonene leter etter `GOOGLE_API_KEY` på serveren. Du må sette den én gang:

1. I Netlify: **Site settings → Environment variables → Add a variable**.
2. **Key:** `GOOGLE_API_KEY`
3. **Value:** lim inn nøkkelen fra Steg 1.
4. Lagre.
5. Gå til **Deploys → Trigger deploy → Deploy site** for å starte en ny build slik at funksjonene plukker opp nøkkelen.

---

## Steg 4 — Test at alt fungerer

Åpne nettsiden din.

1. **Kartet** skal vise Paris.
2. Gå til fanen **Steder → + Nytt sted** og legg inn f.eks.:
   - Navn: `Sciences Po`
   - Adresse: `27 Rue Saint-Guillaume, 75007 Paris`
   - Type: `Skole`
   - Trykk **Lagre**. Et blått/grønt symbol skal dukke opp på kartet.
3. Gå til **Leiligheter → + Ny leilighet** og legg inn:
   - Adresse: `10 Rue de Rivoli, 75004 Paris`
   - Pris, størrelse, score etter ønske.
   - Trykk **Lagre**. En fargemarkør med score-bokstaven skal dukke opp.
4. Klikk på leiligheten i lista → **Beregn** under "Reisetid". Etter et par sekunder skal det stå noe sånt som "Sciences Po: 22 min".

Hvis du får feilmelding *"Mangler GOOGLE_API_KEY på serveren"*: sjekk Steg 3 og pass på at du har trigget en ny deploy etter at variabelen ble satt.

Hvis du får *"REQUEST_DENIED"* eller *"This API project is not authorized…"*: gå tilbake til Google Cloud Console og verifiser at både Geocoding API og Distance Matrix API er **aktivert** for prosjektet, og at API-nøkkelens API restrictions tillater begge.

---

## Slik bruker du appen

- **Leiligheter:** legg inn alle leiligheter du vurderer. Klikk på et kort i lista (eller en markør på kartet) for å se detaljer, redigere, slette eller beregne reisetid.
- **Steder:** legg inn studiested, flyplass(er), severdigheter osv. Disse vises som annerledes symboler på kartet og brukes til reisetidsberegning.
- **Lenker:** lim inn boligportaler du vil ha lett tilgang til (PAP, SeLoger, Lodgis, Studapart…).
- **Data:** under fanen *Data* kan du eksportere alt som JSON (sikkerhetskopi) eller importere fra en tidligere eksport. Bruk dette hvis du vil flytte data til en annen nettleser/maskin.

### Score-systemet (A–F)

Helt subjektivt — bruk det som du vil:
- **A** = drømmebolig
- **B** = veldig bra kandidat
- **C** = ok, vurderer
- **D** = svak kandidat
- **E** = nei
- **F** = absolutt nei

Markørene farges etter score, og lista sorteres med A først.

### Reisetider

Når du trykker **Beregn / Oppdater** kjøres ett kall til Distance Matrix API som sjekker reisetid fra leiligheten til **alle** faste punkter samtidig. Reisemåten er **kollektiv (transit)** med avreise neste hverdag kl. 08:00 lokal Paris-tid. Resultatene caches lokalt for leiligheten — de oppdateres ikke automatisk, men du kan trykke **Oppdater** når du vil.

---

## Teknisk forklaring

### `netlify/functions/geocode.mjs`
- HTTP: `GET /api/geocode?address=<adresse>`
- Returnerer `{ lat, lng, formatted_address, place_id }` eller en feilmelding.
- Begrenser søket til Frankrike for å unngå feiltreff.

### `netlify/functions/transit.mjs`
- HTTP: `POST /api/transit` med JSON `{ origin: {lat,lng}, destinations: [{lat,lng},…], mode?, departureTime? }`
- Returnerer reisetider/avstander per destinasjon.
- Beregner automatisk **neste hverdag kl. 08:00 Paris-tid** som avgangstidspunkt (inkl. sommertid-håndtering).

### `index.html`
- All frontend i én fil. Vanilla JavaScript, ingen rammeverk, ingen byggetrinn.
- Tilstand i RAM, persistens via `localStorage` under nøkkelen `parisFinder.v1`.
- Leaflet hentes fra unpkg CDN.

---

## Kostnad

Google gir alle Maps Platform-brukere $200 i månedlig gratis kreditt. Med dagens prising:
- Geocoding: ~$5 per 1000 forespørsler → ~40 000 oppslag gratis i måneden.
- Distance Matrix: ~$5 per 1000 *elementer* (én origin × én destinasjon = ett element). 10 leiligheter × 5 faste punkter, oppdatert daglig = 50 elementer/dag → ~1500/mnd, langt under taket.

Du kommer i praksis ikke i nærheten av betalt grense for personlig bruk.

---

## Feilsøking

- **"Klarte ikke å kontakte Google …"** → Netlify Function-loggen forklarer mer. Åpne **Functions → geocode/transit → View logs** i Netlify-dashboardet.
- **Markører dukker ikke opp** → Sjekk at adressen ble geokodet korrekt (kortet skal flytte seg automatisk). Hvis du har lagt inn en flertydig adresse, prøv å være mer spesifikk ("75004 Paris" osv.).
- **Reisetider gir "ZERO_RESULTS"** → Distance Matrix fant ingen kollektivrute. Sjekk at både origin og destinasjon faktisk er innenfor IDF-regionen.
- **"localStorage er full"** → Lite sannsynlig, men eksporter til fil og slett gamle leiligheter du ikke trenger.
