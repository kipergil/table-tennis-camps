# Table Tennis Camps

The weekly feed of table tennis camps around the world, for every age and level:
holiday camps, adult and club camps, high-performance camps, residential camps and
skills clinics. Free, no accounts, refreshed every Friday. Every listing links to
a public organiser or booking page.

A static site: plain HTML, CSS and JS with no build step, deployed on Vercel from `main`.
`index.html` also works opened straight from disk, because the data is loaded from
`data/events.js`.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `about.html` | The site |
| `assets/style.css`, `assets/app.js` | Styles and behaviour (Leaflet and markercluster come from cdnjs) |
| `scripts/update_events.py` | Rebuilds the data (Python standard library only, no API keys) |
| `data/curated.json` | Hand-checked camps from sources that can't be scraped |
| `data/excluded.json` | IDs of scraped false matches to hide |
| `data/events.json`, `data/events.js` | Generated feed (`window.EVENTS_DATA = …`) |
| `data/geocache.json` | Verified coordinates, so venues aren't geocoded twice |
| `REFRESH.md` | The weekly refresh playbook |

## Data pipeline

```bash
python3 scripts/update_events.py            # full run (about a minute)
python3 scripts/update_events.py --offline  # rebuild from curated.json + cache only
```

Automatic sources, each in its own function that logs and skips on failure:

- **Cooke & Deaton** courses and events (UK), from clean card HTML with full dates and postcodes. *Primary.*
- **Tom Lodziak** training camps (Cambridge, UK). The year comes from the page's year headings. *Primary.*
- **Borussia Düsseldorf TT-Schule** (DE), from embedded course JSON (`window.ttschuleData`). Fully booked courses are skipped. *Primary.*
- **Borussia Düsseldorf kids' holiday camps** (DE), from the booking table. Fully booked camps are skipped.
- **Table Tennis America** (Fremont CA), **Maryland Table Tennis Center** and **Paddle Palace** (Portland OR):
  club camp pages with a dated heading such as "2026 WINTER" or "2026 CHRISTMAS CAMP".
- **TT Camps Hungary** summer camps (Budapest).
- **Butterfly Online** camp directory (US and Canada clubs), using only headings with a full date range and a year.

If every primary source loads zero pages, the network is blocked and the script
exits non-zero without writing anything. Sites that block scripts or have no
reliable dates (B75, Hennebont, Urban TT, BriBar, ETTU and others) are checked by
hand every week, along with the public Facebook group "Table Tennis Training Camps".
The group is used for leads only: Facebook forbids automated collection, so camps
found there are listed only once they're confirmed on the organiser's own page.
See `REFRESH.md`.

Relevance: a table tennis keyword *and* a camp keyword must appear, and an
"irrelevant" regex drops social sessions, leagues, pickleball, padel and so on.
Category: strong title wording first, then the description, then the number
of days.

Merge: curated wins; ended items are dropped; duplicates are matched by
date + normalised title, link + date, or date + time + venue.

Geocoding: UK postcodes via postcodes.io (bulk, then the terminated-postcodes
endpoint), reuse of coordinates from another listing at the same venue, and
otherwise OpenStreetMap Nominatim. A Nominatim result is only accepted when the
house number or the venue name matches. Camps without a verifiable location get
no pin.

City (for the country and city filter): set by the source where it's fixed, otherwise
looked up from the verified pin with Nominatim reverse geocoding (town before city,
so Grantham isn't filed under its district).

## Weekly refresh

A scheduled Claude task runs `REFRESH.md` every Friday at 07:13 Europe/London.
The script needs no keys, so a GitHub Actions cron could run it as a backup.
That backup is not set up yet.
