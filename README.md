# Table Tennis Camps

The daily feed of table tennis camps around the world, for every age and level:
holiday camps, adult and club camps, high-performance camps, residential camps and
skills clinics. Free, no accounts, refreshed every morning. Every listing links to
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
| `REFRESH.md` | The daily refresh playbook |

## Data pipeline

```bash
python3 scripts/update_events.py            # full run (about 4 to 5 minutes)
python3 scripts/update_events.py --offline  # rebuild from curated.json + cache only
```

Automatic sources, each in its own function that logs and skips on failure:

- **Eventbrite** search pages (`__SERVER_DATA__`) across 11 countries plus online.
  This is the primary source: if it loads zero pages the script exits non-zero
  without writing anything.
- **Cooke & Deaton** courses and events (UK), from clean card HTML with full dates and postcodes.
- **Tom Lodziak** training camps (Cambridge, UK). The year comes from the page's year headings.
- **Butterfly Online** camp directory (US and Canada clubs), using only headings with a full date range and a year.

Relevance: a table tennis keyword *and* a camp keyword must appear, and an
"irrelevant" regex drops social sessions, leagues, pickleball, padel and so on.
Category: strong title wording first, then the description, then Eventbrite's
format tag, then the number of days.

Merge: curated wins; ended items are dropped; duplicates are matched by
date + normalised title, link + date, or date + time + venue.

Geocoding: UK postcodes via postcodes.io (bulk, then the terminated-postcodes
endpoint), reuse of coordinates from another listing at the same venue, and
otherwise OpenStreetMap Nominatim. A Nominatim result is only accepted when the
house number or the venue name matches. Camps without a verifiable location get
no pin.

## Daily refresh

A scheduled Claude task runs `REFRESH.md` every morning at 07:13 Europe/London.
There is deliberately no GitHub Actions backup: Eventbrite, the primary source,
blocks GitHub's runners (HTTP 405), so the script's safeguard would make every
Actions run fail.
