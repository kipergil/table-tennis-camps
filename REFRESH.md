# Daily refresh playbook

Run every morning at 07:13 Europe/London by a scheduled Claude task. The goal is a
feed of **upcoming table tennis camps worldwide, for every age and level**, where
every listing comes from a public page anyone can open. Never invent or guess data:
leave a field empty rather than fill it from memory.

## 1. Get up to date

```bash
git checkout main && git pull --ff-only origin main
```

## 2. Run the script

```bash
python3 scripts/update_events.py
```

- It takes about 4 to 5 minutes (Eventbrite is paged politely, and Nominatim is
  limited to 1 request a second).
- If it exits non-zero, Eventbrite loaded zero pages (blocked network). **Stop.**
  Don't hand-edit events.json and don't commit. Report the failure.
- Read the `[update]` log lines. If Cooke & Deaton or Lodziak report 0 items when
  they used to report several, check whether the page layout changed.

## 3. Look for new camps by hand

Search the web and check the manual sources below for **new, confirmed** camps.
A camp qualifies only if all of these hold:

- It is really a table tennis camp, clinic, course or training week. Leagues,
  social or drop-in sessions, tournaments on their own, and tennis, padel or
  pickleball camps don't count.
- The public can sign up (registration, tickets or free entry), not only a
  selected squad. Expression-of-interest-only proposals don't count.
- The dates are confirmed **including the year**. If the page omits the year, the
  weekday printed next to the date must match the year you assume.
- It hasn't ended.

Manual source groups to check every day:

1. **Camp directories**: Butterfly Online camps page (butterflyonline.com/we-are-butterfly/camps-classes/),
   ActivityHero table tennis camps (US), Kindaling Sportcamps (DE).
2. **Club booking platforms**: HelloAsso "stage tennis de table" (FR), Jotform and
   Tally camp registration forms that come up in search, ClubSpark.
3. **National federations and continental bodies**: Table Tennis England, Table Tennis
   Scotland, Table Tennis Wales, Table Tennis Ireland, USA Table Tennis, Table Tennis
   Canada, Table Tennis Australia (events2), Table Tennis New Zealand, DTTB and the
   German state associations, FFTT and its leagues, SBTF (Sweden), STTA (Singapore),
   HKTTA (Hong Kong), ETTU news.
4. **Academies and coaches that run regular camps**: HITTA (Katy TX), GTTC Academy
   (Toronto), Fremont Table Tennis Academy, PongPlanet, Table Tennis America, Atlanta
   International TT Academy, BAPPA, Champion Star, Princeton Pong, Cooke & Deaton, Tom
   Lodziak, Werner Schlager Academy, Chinese Swimming Club (SG).
5. **Web search**, rotating through queries such as: `table tennis camp <month> <year>`,
   `table tennis winter camp`, `table tennis summer camp <year>`,
   `table tennis training camp registration`, `ping pong camp kids`,
   `Tischtennis Camp <year>`, `stage tennis de table vacances <year>`,
   `bordtennisläger <year>`, `campus tenis de mesa <year>`.

Add each new camp to `data/curated.json` with every field the page supports:

```json
{
  "id": "cur-<organiser>-<short-name>-<yyyy>",
  "title": "", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "time": "HH:MM or empty",
  "venue": "", "area": "Town, region", "address": "street address with postcode",
  "lat": null, "lng": null, "online": false,
  "category": "Holiday camp | Adult & club camp | High-performance camp | Residential camp | Skills clinic",
  "summary": "1-2 sentences in your own words from the page",
  "url": "the most specific organiser or booking page",
  "country": "", "ages": "", "level": "", "price": "", "organiser": "",
  "residential": false
}
```

- Leave `lat`/`lng` as null. The script geocodes the address, and places a pin only
  when it can verify the exact place.
- Categories: holiday or school-break camps go under Holiday camp. Multi-day training
  for adult and club players is Adult & club camp. Pro, elite, squad, pathway and
  pre-season camps are High-performance camp. Overnight stays, summer schools and
  training trips are Residential camp. One-day or single-skill sessions are
  Skills clinic.

## 4. Tidy up

- Remove curated entries whose `end` date has passed. The script also hides them,
  but keep the file short.
- If a scraped item isn't really a camp, add its `id` from `data/events.json` to
  `data/excluded.json`.
- If a curated camp's page now shows different details (moved, cancelled, sold out
  with no waiting list), update or remove the entry.

## 5. Rebuild and check

```bash
python3 scripts/update_events.py
python3 -c "import json; d=json.load(open('data/events.json')); print(d['count'], 'camps')"
```

The count should be similar to yesterday's. A sudden large drop means a source broke,
so investigate before committing.

## 6. Commit and push

Commit **only** `data/`:

```bash
git add data/
git commit -m "Daily refresh $(date +%F)"
git push origin main
```

Vercel redeploys main automatically. If the push is refused, the repo isn't attached
to the scheduled task: report it instead of retrying.
