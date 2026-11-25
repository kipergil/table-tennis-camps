#!/usr/bin/env python3
"""Rebuild data/events.json and data/events.js for Table Tennis Camps.

Python standard library only, no API keys.

Every listing must come from a public page we can link to. Automatic sources
each live in their own function and fail safely (log and skip). Hand-checked
items live in data/curated.json; scraped false matches are hidden through
data/excluded.json.

Usage:  python3 scripts/update_events.py [--offline]
  --offline   skip all network sources (rebuild from curated.json only,
              geocoding from the cache). Never used by the daily refresh.
"""

import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
UA_BROWSER = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
UA_BOT = "table-tennis-camps-feed/1.0 (static site data refresh)"
TODAY = dt.date.today()

FIELDS = ["id", "title", "start", "end", "time", "venue", "area", "address",
          "lat", "lng", "online", "category", "summary", "url", "source",
          # topic-specific
          "country", "ages", "level", "price", "organiser", "residential"]

CATEGORIES = ["Holiday camp", "Adult & club camp", "High-performance camp",
              "Residential camp", "Skills clinic"]

# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

STATS = {}


def log(*a):
    print("[update]", *a, file=sys.stderr, flush=True)


def fetch(url, ua=UA_BROWSER, timeout=30, accept="text/html,application/json"):
    req = urllib.request.Request(url, headers={
        "User-Agent": ua, "Accept": accept,
        "Accept-Language": "en-GB,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def post_json(url, payload, ua=UA_BOT, timeout=30):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={
        "User-Agent": ua, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def text_of(fragment):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", fragment, flags=re.S | re.I)
    t = re.sub(r"<br\s*/?>|</p>|</li>|</h\d>|</div>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    t = re.sub(r"[ \t ]+", " ", t)
    return "\n".join(l.strip() for l in t.split("\n") if l.strip())


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(s or "")).strip()


def norm_title(s):
    s = (s or "").lower()
    s = re.sub(r"\b(20\d\d)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def make_id(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:12]


def summarise(s, limit=240):
    s = clean(s)
    if len(s) <= limit:
        return s
    cut = s[:limit]
    m = re.search(r"^(.*[.!?])\s", cut)
    return (m.group(1) if m and len(m.group(1)) > 60 else cut.rsplit(" ", 1)[0] + "…")


MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"], 1)}
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
MONTHS["sept"] = 9
WEEKDAYS = {d: i for i, d in enumerate(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])}
WEEKDAYS.update({k[:3]: v for k, v in list(WEEKDAYS.items())})


def month_num(name):
    return MONTHS.get((name or "").lower().rstrip("."))


def confirm_date(day, month, year=None, weekday=None):
    """Return a date only when its year is confirmed.

    With an explicit year we trust it. Without one we accept the date only if
    a weekday was given and exactly one of this year / next year matches it.
    """
    try:
        day, month = int(day), int(month)
    except (TypeError, ValueError):
        return None
    if year:
        try:
            return dt.date(int(year), month, day)
        except ValueError:
            return None
    if weekday is None:
        return None
    wd = WEEKDAYS.get(weekday.lower()[:3]) if isinstance(weekday, str) else weekday
    hits = []
    for y in (TODAY.year, TODAY.year + 1):
        try:
            d = dt.date(y, month, day)
        except ValueError:
            continue
        if d.weekday() == wd and d >= TODAY - dt.timedelta(days=60):
            hits.append(d)
    return hits[0] if len(hits) == 1 else None


# --------------------------------------------------------------------------
# relevance + category
# --------------------------------------------------------------------------

TOPIC_RE = re.compile(
    r"table[\s-]?tennis|ping[\s-]?pong|\bpong\b|tischtennis|tennis de table|"
    r"bordtennis|tenis de mesa|tennistavolo|tafeltennis|\btt\b", re.I)
CAMP_RE = re.compile(
    r"\bcamps?\b|boot ?camp|intensive|clinic|summer school|winter school|"
    r"training (day|days|week|course|programme|program)|coaching (day|course|weekend)|"
    r"holiday (programme|program|course|club|training)|masterclass|academy week|"
    r"\bstage\b|lehrgang|feriencamp|läger|lager\b|kamp\b|campus", re.I)
IRRELEVANT_RE = re.compile(
    r"pickleball|padel|beer[\s-]?pong|speed dating|networking|stallholder|"
    r"\bsocial\b|\bpayg\b|pay as you go|casual|drop[\s-]?in|league night|"
    r"fundraiser|quiz|bar crawl|pub|tennis camp(?!.*table)|lawn tennis|"
    r"badminton(?!.*table tennis camp)|chess camp|coding|robotics|"
    r"wellbeing|tarot|book boot ?camp|lgbtq", re.I)


def is_relevant(title, summary=""):
    blob = f"{title} {summary}"
    if not TOPIC_RE.search(blob) or not CAMP_RE.search(blob):
        return False
    if IRRELEVANT_RE.search(title):
        return False
    return True


CAT_RULES = [
    ("High-performance camp", re.compile(
        r"high[\s-]?performance|elite|\bpro camp\b|pathway|hopes|national (team|squad|coach)|"
        r"selection|talent|squad|pre[\s-]?season", re.I)),
    ("Residential camp", re.compile(
        r"residential|summer school|boarding|overnight|full board|accommodation included|"
        r"training (camp )?in china|abroad|resort", re.I)),
    ("Holiday camp", re.compile(
        r"\bkids?\b|junior|child|children|youth|school holiday|holiday camp|winter (break )?camp|"
        r"spring break|march break|half[\s-]?term|christmas|easter|summer camp|year[\s-]?end|"
        r"fun camp|rising stars|ages? \d", re.I)),
    ("Adult & club camp", re.compile(
        r"adult|club players?|intermediate|advanced|league|veteran|masters|over \d\d", re.I)),
    ("Skills clinic", re.compile(
        r"clinic|workshop|masterclass|one[\s-]day|1[\s-]day|skills day|coaching day|"
        r"multi[\s-]?ball|serves?|returning serves|technique day", re.I)),
]

FORMAT_HINTS = {
    "Class, Training, or Workshop": "Skills clinic",
    "Camp, Trip, or Retreat": "Holiday camp",
}


def categorise(title, summary="", fmt="", days=1):
    blob = f"{title} {summary}"
    # strong wording on the title beats everything
    for cat, rx in CAT_RULES:
        if rx.search(title):
            return cat
    for cat, rx in CAT_RULES:
        if rx.search(blob):
            return cat
    if fmt in FORMAT_HINTS:
        hint = FORMAT_HINTS[fmt]
        if hint == "Skills clinic" and days > 1:
            return "Adult & club camp"
        return hint
    return "Skills clinic" if days <= 1 else "Adult & club camp"


def blank(**kw):
    item = {f: "" for f in FIELDS}
    item["lat"] = item["lng"] = None
    item["online"] = False
    item["residential"] = False
    item.update(kw)
    return item


# --------------------------------------------------------------------------
# automatic sources
# --------------------------------------------------------------------------

EB_PLACES = [
    ("www.eventbrite.co.uk", "united-kingdom", "United Kingdom"),
    ("www.eventbrite.ie", "ireland", "Ireland"),
    ("www.eventbrite.com", "united-states", "United States"),
    ("www.eventbrite.ca", "canada", "Canada"),
    ("www.eventbrite.com.au", "australia", "Australia"),
    ("www.eventbrite.co.nz", "new-zealand", "New Zealand"),
    ("www.eventbrite.sg", "singapore", "Singapore"),
    ("www.eventbrite.de", "germany", "Germany"),
    ("www.eventbrite.nl", "netherlands", "Netherlands"),
    ("www.eventbrite.fr", "france", "France"),
    ("www.eventbrite.es", "spain", "Spain"),
    ("www.eventbrite.com", "online", ""),
]
EB_QUERIES = ["table-tennis-camp", "table-tennis-training-camp", "ping-pong-camp"]
EB_PAGES = 2


def _eb_server_data(page_html):
    marker = "window.__SERVER_DATA__ = "
    i = page_html.find(marker)
    if i < 0:
        return None
    try:
        return json.JSONDecoder().raw_decode(page_html, i + len(marker))[0]
    except ValueError:
        return None


def _eb_page(url):
    """Fetch one search page, retrying an empty one (5 s, then 10 s)."""
    for wait in (0, 5, 10):
        if wait:
            time.sleep(wait)
        try:
            data = _eb_server_data(fetch(url))
        except (urllib.error.URLError, OSError, ValueError) as e:
            log("eventbrite fetch failed", url, e)
            data = None
        if data is None:
            continue
        ev = (data.get("search_data") or {}).get("events") or {}
        results = ev.get("results") or []
        if results:
            return results, ev.get("pagination") or {}
    return None, {}


def source_eventbrite():
    items, loaded = [], 0
    for host, slug, country in EB_PLACES:
        for q in EB_QUERIES:
            for page in range(1, EB_PAGES + 1):
                url = f"https://{host}/d/{slug}/{q}/?page={page}"
                results, pag = _eb_page(url)
                if results is None:
                    break
                loaded += 1
                for r in results:
                    it = _eb_item(r, country)
                    if it:
                        items.append(it)
                if page >= (pag.get("page_count") or 1):
                    break
                time.sleep(1)
    STATS["eventbrite_pages"] = loaded
    log(f"eventbrite: {loaded} pages, {len(items)} relevant")
    return items, loaded


def _eb_item(r, country):
    title = clean(r.get("name"))
    summary = clean(r.get("summary"))
    if r.get("is_cancelled") or not is_relevant(title, summary):
        return None
    start, end = r.get("start_date"), r.get("end_date") or r.get("start_date")
    if not start:
        return None
    fmt = ""
    for t in r.get("tags") or []:
        if t.get("prefix") == "EventbriteFormat":
            fmt = t.get("display_name", "")
    v = r.get("primary_venue") or {}
    a = v.get("address") or {}
    online = bool(r.get("is_online_event"))
    days = (dt.date.fromisoformat(end) - dt.date.fromisoformat(start)).days + 1
    addr = ", ".join(x for x in [a.get("address_1"), a.get("address_2"),
                                 a.get("city"), a.get("postal_code")] if x)
    cc = (a.get("country") or "")
    lat = a.get("latitude")
    lng = a.get("longitude")
    return blank(
        id="eb-" + str(r.get("id")),
        title=title, start=start, end=end, time=r.get("start_time") or "",
        venue=clean(v.get("name")), area=clean(a.get("city") or a.get("localized_area_display")),
        address=addr,
        lat=float(lat) if lat not in (None, "") else None,
        lng=float(lng) if lng not in (None, "") else None,
        online=online,
        category=categorise(title, summary, fmt, days),
        summary=summarise(summary), url=r.get("url") or "",
        source="eventbrite", country=_country_name(cc) or country,
        organiser="",
    )


COUNTRY_CODES = {"GB": "United Kingdom", "US": "United States", "CA": "Canada",
                 "AU": "Australia", "NZ": "New Zealand", "IE": "Ireland",
                 "SG": "Singapore", "DE": "Germany", "NL": "Netherlands",
                 "FR": "France", "ES": "Spain"}


def _country_name(cc):
    return COUNTRY_CODES.get((cc or "").upper(), "")


# --- Cooke & Deaton (UK coaching school; clean card HTML) -----------------

CD_URL = "https://www.cookeanddeaton.com/courses-events"
CD_DATE = re.compile(
    r"From\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}:\d{2})\s+To\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})")


def source_cooke_deaton():
    items = []
    try:
        page = fetch(CD_URL)
    except (urllib.error.URLError, OSError) as e:
        log("cooke&deaton failed", e)
        return items, 0
    blocks = re.split(r'<div class="row align-items-top', page)[1:]
    for b in blocks:
        m_link = re.search(r'<h3[^>]*>\s*<a href="([^"]+)"[^>]*>(.*?)</a>', b, re.S)
        if not m_link:
            continue
        url, title = m_link.group(1), clean(m_link.group(2))
        if re.search(r"non[\s-]?participant", title, re.I):
            continue  # spectator ticket for the same course
        txt = text_of(b)
        m = CD_DATE.search(txt)
        if not m:
            continue
        d1 = confirm_date(m.group(1), month_num(m.group(2)), m.group(3))
        d2 = confirm_date(m.group(5), month_num(m.group(6)), m.group(7))
        if not d1 or not d2:
            continue
        lines = txt.split("\n")
        venue_line = ""
        for i, l in enumerate(lines):
            if CD_DATE.search(l) and i + 1 < len(lines):
                venue_line = lines[i + 1]
                break
        parts = [p.strip() for p in venue_line.split(",") if p.strip()]
        venue = parts[0] if parts else ""
        postcode = ""
        pm = re.search(r"\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b", venue_line)
        if pm:
            postcode = pm.group(1)
        area = next((p for p in parts[1:] if not re.search(r"\d", p)), "")
        detail = _detail(url)
        title_clean = re.sub(r"\s*-\s*PARTICIPANT\s*$", "", title, flags=re.I)
        summary = detail.get("summary") or ""
        cat = categorise(title_clean, summary, "", (d2 - d1).days + 1)
        items.append(blank(
            id="cd-" + make_id(url, d1),
            title=title_clean, start=d1.isoformat(), end=d2.isoformat(),
            time=m.group(4), venue=venue, area=area, address=venue_line,
            category=cat, summary=summarise(summary), url=url,
            source="cookeanddeaton", country="United Kingdom",
            price=detail.get("price", ""), organiser="Cooke & Deaton Table Tennis",
            residential=cat == "Residential camp",
        ))
    log(f"cooke&deaton: {len(items)} items")
    return items, 1


def _detail(url):
    """Pull a short description and price from a Cooke & Deaton event page."""
    out = {}
    try:
        t = text_of(fetch(url))
    except (urllib.error.URLError, OSError):
        return out
    m = re.search(r"Event Price\s*\n?\s*(£\s?[\d,.]+)", t)
    if m:
        out["price"] = m.group(1).replace(" ", "")
    m = re.search(r"Checkout\s*\n(.+)", t)
    if m:
        out["summary"] = m.group(1)
    return out


# --- Tom Lodziak training camps (Cambridge, UK; WordPress page) -----------

TL_URL = "https://www.tabletenniscoach.me.uk/training-camps/"
TL_LINE = re.compile(
    r"^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\s+([A-Za-z]+)"
    r"(?:\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+))?\s*[–-]\s*(.+?)\s*\((\d+)\s*days?\)")


def source_lodziak():
    items = []
    try:
        page = fetch(TL_URL)
    except (urllib.error.URLError, OSError) as e:
        log("lodziak failed", e)
        return items, 0
    m = re.search(r"Below is the list of upcoming(.*?)(expression of interest|</article>)", page, re.S)
    body = m.group(1) if m else ""
    year = None
    for tag in re.finditer(r"<(h2|p)[^>]*>(.*?)</\1>", body, re.S):
        kind, inner = tag.group(1), tag.group(2)
        txt = clean(re.sub(r"<[^>]+>", "", inner))
        if kind == "h2":
            ym = re.fullmatch(r"(20\d\d)", txt)
            year = int(ym.group(1)) if ym else None
            continue
        lm = TL_LINE.match(txt)
        if not lm or not year:
            continue
        link = re.search(r'href="([^"]+)"', inner)
        if not link:
            continue
        d1day, d2day, mon1, d2day_b, mon2, name, ndays = lm.groups()
        m1 = month_num(mon1)
        d1 = confirm_date(d1day, m1, year)
        if d2day_b:
            d2 = confirm_date(d2day_b, month_num(mon2), year)
        else:
            d2 = confirm_date(d2day or d1day, m1, year)
        if not d1 or not d2:
            continue
        url = link.group(1)
        det = _lodziak_detail(url)
        ndays = int(ndays)
        title = name.strip()
        if not re.search(r"camp|day|training", title, re.I):
            title = f"{title}: {ndays}-day training camp" if ndays > 1 else f"{title}: 1-day training camp"
        cat = "Skills clinic" if ndays == 1 else "Adult & club camp"
        items.append(blank(
            id="tl-" + make_id(url, d1),
            title=title, start=d1.isoformat(), end=d2.isoformat(),
            time=det.get("time", ""), venue=det.get("venue", ""), area="Cambridge",
            address=det.get("address", ""), category=cat,
            summary=summarise(det.get("summary", "")), url=url, source="lodziak",
            country="United Kingdom", level="Intermediate to advanced",
            ages="Adults", price=det.get("price", ""), organiser="Tom Lodziak",
        ))
        time.sleep(0.5)
    log(f"lodziak: {len(items)} items")
    return items, 1


def _lodziak_detail(url):
    out = {}
    try:
        t = text_of(fetch(url))
    except (urllib.error.URLError, OSError):
        return out
    m = re.search(r"Venue:\s*\n?(.+)", t)
    if m:
        addr = m.group(1).strip()
        out["address"] = addr
        out["venue"] = addr.split(",")[0].strip()
    m = re.search(r"Start / finish time:\s*\n?(.+)", t)
    if m:
        tm = re.search(r"(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)", m.group(1), re.I)
        if tm:
            h = int(tm.group(1)) % 12 + (12 if tm.group(3).lower() == "pm" else 0)
            out["time"] = f"{h:02d}:{tm.group(2) or '00'}"
    m = re.search(r"Cost:\s*\n?(.+)", t)
    if m:
        out["price"] = m.group(1).strip()
    m = re.search(r"\n(In this training camp.+|This (?:training camp|coaching day).+)", t)
    if m:
        out["summary"] = m.group(1)
    return out


# --- Butterfly Online camp directory (US / Canada clubs) ------------------

BF_URL = "https://butterflyonline.com/we-are-butterfly/camps-classes/"
BF_RANGE = re.compile(
    r"([A-Z][a-z]{2,8})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:[-–]|to)\s*"
    r"(?:([A-Z][a-z]{2,8})\.?\s+)?(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d\d)")


def source_butterfly():
    """Club camp headings that carry a full date range with a year."""
    items = []
    try:
        page = fetch(BF_URL)
    except (urllib.error.URLError, OSError) as e:
        log("butterfly failed", e)
        return items, 0
    for hm in re.finditer(r"<h[2-4][^>]*>(.*?)</h[2-4]>", page, re.S):
        head = clean(re.sub(r"<[^>]+>", "", hm.group(1)))
        if "coming soon" in head.lower() or not re.search(r"camp", head, re.I):
            continue
        m = BF_RANGE.search(head)
        if not m:
            continue
        mon1, day1, mon2, day2, year = m.groups()
        d1 = confirm_date(day1, month_num(mon1), year)
        d2 = confirm_date(day2, month_num(mon2 or mon1), year)
        if not d1 or not d2 or d2 < d1:
            continue
        # the "More Info HERE" link that follows the heading
        tail = page[hm.end(): hm.end() + 6000]
        nxt = re.search(r"<h[2-4]", tail)
        seg = tail[: nxt.start()] if nxt else tail
        links = [u for u in re.findall(r'href="(https?://[^"]+)"', seg)
                 if "butterflyonline.com" not in u]
        if not links:
            continue
        club = re.split(r"\s+[–-]\s+", head)[0]
        summary = summarise(text_of(seg).replace("\n", " "), 200)
        items.append(blank(
            id="bf-" + make_id(links[0], d1),
            title=head.split(" – ")[0] + (" " + re.split(r"\s+[–-]\s+", head)[1]
                                           if len(re.split(r"\s+[–-]\s+", head)) > 2 else ""),
            start=d1.isoformat(), end=d2.isoformat(),
            category=categorise(head, summary, "", (d2 - d1).days + 1),
            summary=summary, url=links[0], source="butterfly",
            organiser=club,
        ))
    log(f"butterfly: {len(items)} items")
    return items, 1


AUTOMATIC = [
    ("eventbrite", source_eventbrite, True),   # primary
    ("cookeanddeaton", source_cooke_deaton, False),
    ("lodziak", source_lodziak, False),
    ("butterfly", source_butterfly, False),
]

# --------------------------------------------------------------------------
# geocoding
# --------------------------------------------------------------------------

UK_POSTCODE = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b", re.I)
GEOCACHE = os.path.join(DATA, "geocache.json")
NOMINATIM_CC = {"United Kingdom": "gb", "United States": "us", "Canada": "ca",
                "Australia": "au", "New Zealand": "nz", "Ireland": "ie",
                "Singapore": "sg", "Germany": "de", "Netherlands": "nl",
                "France": "fr", "Spain": "es", "Austria": "at", "Sweden": "se",
                "China": "cn", "Hong Kong": "hk", "Denmark": "dk", "Belgium": "be",
                "Switzerland": "ch", "Italy": "it", "Portugal": "pt", "Japan": "jp"}


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def geocode(items, offline=False):
    cache = load_json(GEOCACHE, {})
    # 1. reuse coordinates from another listing at the same venue
    by_venue = {}
    for it in items:
        if it.get("lat") is not None and it.get("venue"):
            by_venue.setdefault(norm_title(it["venue"]), (it["lat"], it["lng"]))
    for it in items:
        if it.get("lat") is None and it.get("venue") and norm_title(it["venue"]) in by_venue:
            it["lat"], it["lng"] = by_venue[norm_title(it["venue"])]

    # 2. UK postcodes via postcodes.io (bulk, then terminated fallback)
    need = {}
    for it in items:
        if it.get("lat") is not None or it.get("online"):
            continue
        m = UK_POSTCODE.search(it.get("address") or "")
        if m and (it.get("country") in ("", "United Kingdom")):
            pc = (m.group(1) + " " + m.group(2)).upper()
            key = "pc:" + pc
            if key in cache:
                it["lat"], it["lng"] = cache[key]
            else:
                need.setdefault(pc, []).append(it)
    if need and not offline:
        pcs = list(need)
        for i in range(0, len(pcs), 100):
            try:
                res = post_json("https://api.postcodes.io/postcodes",
                                {"postcodes": pcs[i:i + 100]})
            except (urllib.error.URLError, OSError, ValueError) as e:
                log("postcodes.io bulk failed", e)
                break
            for row in res.get("result") or []:
                r = row.get("result")
                if r:
                    cache["pc:" + row["query"].upper()] = [r["latitude"], r["longitude"]]
        for pc in pcs:
            if "pc:" + pc not in cache:
                try:
                    r = json.loads(fetch("https://api.postcodes.io/terminated_postcodes/"
                                         + urllib.parse.quote(pc), ua=UA_BOT))
                    res = r.get("result") or {}
                    if res.get("latitude") is not None:
                        cache["pc:" + pc] = [res["latitude"], res["longitude"]]
                except (urllib.error.URLError, OSError, ValueError):
                    pass
            if "pc:" + pc in cache:
                for it in need[pc]:
                    it["lat"], it["lng"] = cache["pc:" + pc]

    # 3. everywhere else: OpenStreetMap Nominatim, restricted to the item's
    #    country. A result is only trusted when it is verifiably the place:
    #    the same house number on the same street, or a named place whose name
    #    is the venue's name. Street or town centroids are never used.
    for it in items:
        if it.get("lat") is not None or it.get("online"):
            continue
        cc = NOMINATIM_CC.get(it.get("country", ""))
        if not cc or not (it.get("address") or it.get("venue")):
            continue
        for q in _queries(it):
            key = f"q:{cc}:{q}"
            if key not in cache:
                if offline:
                    continue
                cache[key] = _nominatim(q, cc, it.get("venue", ""))
            if cache.get(key):
                it["lat"], it["lng"] = cache[key]
                break

    with open(GEOCACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=1, sort_keys=True, ensure_ascii=False)


def _queries(it):
    qs = []
    addr = it.get("address") or ""
    if addr:
        a = re.sub(r"\b(unit|suite|ste\.?|apt\.?|level)\s*[\w-]+\s*,?\s*", "", addr, flags=re.I)
        a = re.sub(r"\s+,", ",", a).strip(" ,")
        qs.append(a)
        if a != addr:
            qs.append(addr)
    if it.get("venue"):
        qs.append(", ".join(x for x in [it["venue"], it.get("area", "")] if x))
        qs.append(it["venue"])
    seen, out = set(), []
    for q in qs:
        if q and q not in seen:
            seen.add(q)
            out.append(q)
    return out


def _nominatim(q, cc, venue):
    url = ("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3"
           f"&countrycodes={cc}&q=" + urllib.parse.quote(q))
    try:
        res = json.loads(fetch(url, ua=UA_BOT))
    except (urllib.error.URLError, OSError, ValueError) as e:
        log("nominatim failed", q, e)
        return None
    finally:
        time.sleep(1.1)  # Nominatim usage policy: max 1 request/second
    num = re.match(r"\s*(\d+[A-Za-z]?)\b", q)
    for r in res or []:
        name = (r.get("display_name") or "").lower()
        if num:
            if re.match(rf"{re.escape(num.group(1).lower())}\b", name):
                return [float(r["lat"]), float(r["lon"])]
        elif (venue and name.startswith(venue.lower())
              and int(r.get("place_rank", 0)) >= 22):  # a site, not a suburb/town
            return [float(r["lat"]), float(r["lon"])]
    return None


# --------------------------------------------------------------------------
# merge
# --------------------------------------------------------------------------

def merge(curated, scraped, excluded):
    out, keys = [], {}

    def k_all(it):
        ks = [("t", it["start"], norm_title(it["title"]))]
        if it.get("url"):
            ks.append(("u", it["start"], it["url"].split("?")[0].rstrip("/")))
        if it.get("time") and it.get("venue"):
            ks.append(("v", it["start"], it["time"], norm_title(it["venue"])))
        return ks

    for it in curated + scraped:  # curated first, so it wins
        if it["id"] in excluded:
            continue
        ks = k_all(it)
        if any(k in keys for k in ks):
            continue
        for k in ks:
            keys[k] = it["id"]
        out.append(it)
    return out


SMALL_WORDS = {"a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to", "with"}


def tidy_title(t):
    t = clean(t)
    # drop a trailing date ("27-28th December 2026"), the page shows dates anyway
    t = re.sub(r"\s*[-–,]?\s*\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?"
               r"\s+[A-Za-z]+\s+20\d\d\s*$", "", t)
    t = re.sub(r"\s+-\s+", " – ", t)
    letters = re.sub(r"[^A-Za-z]", "", t)
    if letters and letters.isupper() and len(letters) > 6:
        words = t.lower().split(" ")
        t = " ".join(w if (i and w in SMALL_WORDS) else w[:1].upper() + w[1:]
                     for i, w in enumerate(words))
    return t


def valid(it):
    try:
        s = dt.date.fromisoformat(it["start"])
        e = dt.date.fromisoformat(it.get("end") or it["start"])
    except (KeyError, ValueError, TypeError):
        return False
    if e < s or not it.get("url") or not it.get("title"):
        return False
    return e >= TODAY  # drop anything that has ended


def normalise(it):
    full = blank()
    full.update({k: v for k, v in it.items() if k in FIELDS or k.startswith("_")})
    if not full["end"]:
        full["end"] = full["start"]
    full["title"] = tidy_title(full["title"])
    if full["category"] not in CATEGORIES:
        days = (dt.date.fromisoformat(full["end"]) - dt.date.fromisoformat(full["start"])).days + 1
        full["category"] = categorise(full["title"], full["summary"], "", days)
    for k in ("lat", "lng"):
        if full[k] in ("", None):
            full[k] = None
        else:
            full[k] = round(float(full[k]), 6)
    return {k: full[k] for k in FIELDS}


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main():
    offline = "--offline" in sys.argv
    curated = load_json(os.path.join(DATA, "curated.json"), [])
    excluded = set(load_json(os.path.join(DATA, "excluded.json"), []))
    for c in curated:
        c.setdefault("source", "curated")

    scraped = []
    if not offline:
        for name, fn, primary in AUTOMATIC:
            try:
                got, pages = fn()
            except Exception as e:  # never let one source break the run
                log(f"{name} crashed: {e!r}")
                got, pages = [], 0
            if primary and pages == 0:
                log(f"primary source {name} loaded zero pages (blocked network?) "
                    "- refusing to write a near-empty feed")
                sys.exit(2)
            scraped.extend(got)

    items = [normalise(x) for x in curated] + [normalise(x) for x in scraped]
    items = [x for x in items if valid(x)]
    curated_n = [x for x in items if x["source"] == "curated"]
    scraped_n = [x for x in items if x["source"] != "curated"]
    merged = merge(curated_n, scraped_n, excluded)
    geocode(merged, offline=offline)
    merged.sort(key=lambda x: (x["start"], x.get("time") or "99", x["title"].lower()))

    now = dt.datetime.now(dt.timezone.utc)
    payload = {
        "updated": now.isoformat(timespec="minutes"),
        "count": len(merged),
        "categories": CATEGORIES,
        "events": merged,
    }
    with open(os.path.join(DATA, "events.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
    with open(os.path.join(DATA, "events.js"), "w", encoding="utf-8") as f:
        f.write("window.EVENTS_DATA = ")
        json.dump(payload, f, ensure_ascii=False)
        f.write(";\n")
    log(f"wrote {len(merged)} camps ({len(curated_n)} curated, "
        f"{len(merged) - len([m for m in merged if m['source'] == 'curated'])} scraped)")


if __name__ == "__main__":
    main()
