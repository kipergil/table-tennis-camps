# Weekly refresh playbook

Run every Friday at 07:13 Europe/London by a scheduled Claude task. The goal is a
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

- It takes about a minute. Automatic sources: Cooke & Deaton, Tom Lodziak,
  Borussia Düsseldorf (TT-Schule courses and kids' holiday camps), Table Tennis
  America, Maryland Table Tennis Center, Paddle Palace, TT Camps Hungary and the
  Butterfly Online directory.
- If it exits non-zero, every primary source (Cooke & Deaton, Lodziak, Borussia
  TT-Schule) loaded zero pages, which means the network is blocked. **Stop.** Don't
  hand-edit events.json and don't commit. Report the failure.
- Read the `[update]` log lines. If a source reports 0 items when it used to report
  several, open its page and check whether the layout changed.

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

Manual source groups to check every week (sites that can't be scraped reliably):

1. **UK coaches and clubs**: Planet Table Tennis (planettabletennis.com), BriBar
   Table Tennis (bribartt.co.uk/tournaments-coaching-courses/, which blocks scripts),
   EBATT (ebatt.co.uk), and new dates on Cooke & Deaton and Tom Lodziak that the
   script missed.
2. **Europe**: B75 International Camp, Hirtshals, Denmark (b75.dk/arrangementer/sommerlejr,
   every July; registration at b75.nemtilmeld.dk). Ping Center GV Hennebont, France
   (pingcenter-gvhtt.com/stages and its 2026–27 PDF calendar; the booking API can't
   confirm which weeks run). Urban Table Tennis international camps
   (urbantabletennis.com/en/elite/international-camps). TT Camps Hungary, for Eger
   academy and international camps beyond the summer page. ETTU Eurotalents and
   development camps (ettu.org news). HiTT Malta (hittmalta.mt). TTPOR training camp,
   Portugal (ttpor.pt). Hungarian federation summer camps (tabletennis.hu).
3. **North America**: Kou Lei TTC (kouleittc.com), NJTTC summer and holiday
   mini-camps (njttc.org/summercamp.html, /holidaycamp.html), Paddle Palace ITTF
   coaching clinics, and the Table Tennis America International Elite Camp.
4. **Directories**: Table Tennis Coach UK's list of camps in the UK and Europe
   (tabletenniscoach.me.uk/table-tennis-camps-in-uk-and-europe/), Butterfly Online
   camps and classes (butterflyonline.com/we-are-butterfly/camps-classes/, for clubs
   whose dates the script couldn't parse), and Expert Table Tennis camp reviews
   (experttabletennis.com).
5. **Camps already in curated.json**: HITTA (Katy, TX), GTTC Academy (Toronto),
   Chinese Swimming Club (Singapore), and Table Tennis Australia's National Hopes
   Pathways Camps. Check that they're still on and look for new dates.
6. **Web search**, rotating through queries such as `table tennis camp <month> <year>`,
   `table tennis training camp <year>`, `Tischtennis Camp <year>`,
   `stage tennis de table <year>` and `bordtennisläger <year>`.

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
  "country": "", "city": "", "ages": "", "level": "", "price": "", "organiser": "",
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

The count should be similar to last week's. A sudden large drop means a source broke,
so investigate before committing.

## 6. Commit and push

Commit **only** `data/`:

```bash
git add data/
git commit -m "Weekly refresh $(date +%F)"
git push origin main
```

Vercel redeploys main automatically. If the push is refused, the repo isn't attached
to the scheduled task: report it instead of retrying.
