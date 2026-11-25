/* Table Tennis Camps: plain JS, no build step. */
(function () {
  "use strict";

  var DATA = window.EVENTS_DATA || { events: [], categories: [] };
  var EVENTS = DATA.events || [];
  var CATS = DATA.categories && DATA.categories.length ? DATA.categories :
    ["Holiday camp", "Adult & club camp", "High-performance camp", "Residential camp", "Skills clinic"];
  var CAT_PLURAL = {
    "Holiday camp": "holiday camps",
    "Adult & club camp": "adult & club camps",
    "High-performance camp": "high-performance camps",
    "Residential camp": "residential camps",
    "Skills clinic": "skills clinics"
  };
  var UTM_SOURCE = "tabletenniscamps";
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  // ---------- dates (all local, date-only) ----------
  function parseD(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeek(d) { var x = new Date(d); var wd = (x.getDay() + 6) % 7; return addDays(x, -wd); }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  var TODAY = new Date(); TODAY = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

  EVENTS.forEach(function (e, i) {
    e._i = i;
    e._s = parseD(e.start);
    e._e = parseD(e.end || e.start);
    e._days = daysBetween(e._s, e._e) + 1;
    e._cat = Math.max(0, CATS.indexOf(e.category));
    e.city = e.city || "";
    e._hay = [e.title, e.summary, e.venue, e.area, e.address, e.country, e.city, e.organiser, e.category, e.ages, e.level]
      .join(" ").toLowerCase();
  });
  // ended items never show, even if the data is a day old
  EVENTS = EVENTS.filter(function (e) { return e._e >= TODAY; });

  var DATE_FILTERS = [
    { key: "all", label: "All upcoming" },
    { key: "week", label: "This week" },
    { key: "nextweek", label: "Next week" },
    { key: "month", label: "This month" },
    { key: "nextmonth", label: "Next month" },
    { key: "later", label: "Later" }
  ];
  function range(key) {
    var sow = startOfWeek(TODAY);
    var eom = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0);
    var som2 = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 1);
    var eom2 = new Date(TODAY.getFullYear(), TODAY.getMonth() + 2, 0);
    switch (key) {
      case "week": return [TODAY, addDays(sow, 6)];
      case "nextweek": return [addDays(sow, 7), addDays(sow, 13)];
      case "month": return [TODAY, eom];
      case "nextmonth": return [som2, eom2];
      case "later": return [addDays(eom2, 1), null];
      default: return [TODAY, null];
    }
  }
  // Multi-day items count on every day they run; one-off items on their start day.
  function inRange(e, r) {
    return e._e >= r[0] && (r[1] === null || e._s <= r[1]);
  }
  function inDay(e, d) { return e._s <= d && e._e >= d; }

  // ---------- state + URL ----------
  var state = { when: "all", cat: "", country: "", city: "", view: "list", q: "", m: "" };
  var params = new URLSearchParams(location.search);
  if (DATE_FILTERS.some(function (f) { return f.key === params.get("when"); })) state.when = params.get("when");
  var catParam = params.get("cat");
  if (catParam) {
    var ci = CATS.map(slug).indexOf(catParam);
    if (ci >= 0) state.cat = CATS[ci];
  }
  if (params.get("country")) {
    EVENTS.some(function (e) { if (e.country && slug(e.country) === params.get("country")) { state.country = e.country; return true; } });
  }
  if (state.country && params.get("city")) {
    EVENTS.some(function (e) {
      if (e.country === state.country && e.city && slug(e.city) === params.get("city")) { state.city = e.city; return true; }
    });
  }
  if (["list", "calendar", "map"].indexOf(params.get("view")) >= 0) state.view = params.get("view");
  state.q = params.get("q") || "";
  if (/^\d{4}-\d{2}$/.test(params.get("m") || "")) state.m = params.get("m");

  var filterStyle = "pills";
  try { filterStyle = localStorage.getItem("ttc-filter-style") === "menus" ? "menus" : "pills"; } catch (err) {}

  function slug(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  function writeURL() {
    var p = new URLSearchParams();
    if (state.when !== "all") p.set("when", state.when);
    if (state.cat) p.set("cat", slug(state.cat));
    if (state.country) p.set("country", slug(state.country));
    if (state.city) p.set("city", slug(state.city));
    if (state.view !== "list") p.set("view", state.view);
    if (state.q) p.set("q", state.q);
    if (state.view === "calendar" && state.m) p.set("m", state.m);
    var qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function tagged(url) {
    if (!url) return url;
    try {
      var u = new URL(url);
      if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", UTM_SOURCE);
      if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "referral");
      return u.toString();
    } catch (err) { return url; }
  }
  function mapsURL(e) {
    if (e.lat != null && e.lng != null) {
      return "https://www.google.com/maps/search/?api=1&query=" + e.lat + "," + e.lng;
    }
    var q = [e.venue, e.address || e.area, e.country].filter(Boolean).join(", ");
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  }
  function gcalURL(e) {
    var s = e.start.replace(/-/g, ""), end = iso(addDays(e._e, 1)).replace(/-/g, "");
    var details = (e.summary ? e.summary + "\n\n" : "") +
      (e.time ? "Starts " + e.time + " (local time).\n" : "") +
      "Check the details and book: " + e.url;
    var loc = [e.venue, e.address || e.area, e.country].filter(Boolean).join(", ");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(e.title) +
      "&dates=" + s + "/" + end +
      "&details=" + encodeURIComponent(details) +
      (loc ? "&location=" + encodeURIComponent(loc) : "");
  }
  function fmtShort(d, withYear) {
    return WEEKDAYS[d.getDay()].slice(0, 3) + " " + d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) +
      (withYear ? " " + d.getFullYear() : "");
  }
  function spanText(e) {
    if (e._days === 1) return fmtShort(e._s, e._s.getFullYear() !== TODAY.getFullYear());
    var y = e._e.getFullYear() !== TODAY.getFullYear() || e._s.getFullYear() !== e._e.getFullYear();
    return fmtShort(e._s, y && e._s.getFullYear() !== e._e.getFullYear()) + " to " + fmtShort(e._e, y) +
      ", " + e._days + " days";
  }
  function rangeText(a, b) {
    // "Friday 20 to Sunday 22 November", "Monday 30 November to Sunday 6 December"
    var sameYear = a.getFullYear() === b.getFullYear();
    var showYear = !sameYear || a.getFullYear() !== TODAY.getFullYear();
    if (+a === +b) return WEEKDAYS[a.getDay()] + " " + a.getDate() + " " + MONTHS[a.getMonth()] + (showYear ? " " + a.getFullYear() : "");
    var left = WEEKDAYS[a.getDay()] + " " + a.getDate();
    if (a.getMonth() !== b.getMonth() || !sameYear) left += " " + MONTHS[a.getMonth()];
    if (!sameYear) left += " " + a.getFullYear();
    return left + " to " + WEEKDAYS[b.getDay()] + " " + b.getDate() + " " + MONTHS[b.getMonth()] + (showYear ? " " + b.getFullYear() : "");
  }
  function relTag(d) {
    var diff = daysBetween(TODAY, d);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    var sow = startOfWeek(TODAY);
    var wd = (d.getDay() + 6) % 7;
    if (d <= addDays(sow, 6) && wd >= 5) return "This weekend";
    if (d >= addDays(sow, 7) && d <= addDays(sow, 13)) return "Next week";
    return "";
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  var ICON = {
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    globe: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    pinSmall: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'
  };

  // ---------- filtering ----------
  function matchQ(e) {
    if (!state.q) return true;
    return state.q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return e._hay.indexOf(w) >= 0; });
  }
  function filtered(opts) {
    opts = opts || {};
    var when = opts.when != null ? opts.when : state.when;
    var cat = opts.cat != null ? opts.cat : state.cat;
    var country = opts.country != null ? opts.country : state.country;
    var city = opts.city != null ? opts.city : state.city;
    var r = range(when);
    return EVENTS.filter(function (e) {
      return inRange(e, r) && (!cat || e.category === cat) &&
        (!country || e.country === country) && (!city || e.city === city) && matchQ(e);
    });
  }
  // {name, n} sorted by count, then name
  function tally(list, key) {
    var c = {};
    list.forEach(function (e) { if (e[key]) c[e[key]] = (c[e[key]] || 0) + 1; });
    return Object.keys(c).map(function (k) { return { name: k, n: c[k] }; })
      .sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });
  }
  function placeName(country) {
    return /^(United Kingdom|United States|Netherlands|Philippines|Czech Republic)$/.test(country) ? "the " + country : country;
  }

  // ---------- header ----------
  function renderHeader() {
    var up = DATA.updated ? new Date(DATA.updated) : null;
    var el = document.getElementById("updated");
    if (up && !isNaN(up)) {
      el.textContent = "Updated " + WEEKDAYS[up.getDay()] + " " + up.getDate() + " " + MONTHS[up.getMonth()] +
        " at " + String(up.getHours()).padStart(2, "0") + ":" + String(up.getMinutes()).padStart(2, "0");
    }
    var countries = {};
    EVENTS.forEach(function (e) { if (e.country) countries[e.country] = 1; });
    var week = EVENTS.filter(function (e) { return inRange(e, range("week")); }).length;
    var month = EVENTS.filter(function (e) { return inRange(e, range("month")); }).length;
    var html = "";
    html += '<li class="kpi"><span class="kpi-num">' + EVENTS.length + '</span><span class="kpi-label">camps listed</span></li>';
    html += '<li><button type="button" class="kpi-btn" data-when="week" aria-pressed="' + (state.when === "week") + '"><span class="kpi-num">' + week +
      '</span><span class="kpi-label">on this week</span></button></li>';
    html += '<li><button type="button" class="kpi-btn" data-when="month" aria-pressed="' + (state.when === "month") + '"><span class="kpi-num">' + month +
      '</span><span class="kpi-label">on this month</span></button></li>';
    html += '<li class="kpi"><span class="kpi-num">' + Object.keys(countries).length + '</span><span class="kpi-label">countries</span></li>';
    document.getElementById("kpis").innerHTML = html;
  }

  // ---------- filters UI ----------
  function renderFilters() {
    var box = document.getElementById("filters");
    var tog = document.getElementById("style-toggle");
    tog.textContent = filterStyle === "pills" ? "Use menus" : "Use pills";
    tog.setAttribute("aria-label", filterStyle === "pills" ? "Switch filters to drop-down menus" : "Switch filters to pills");
    var dateCounts = DATE_FILTERS.map(function (f) { return filtered({ when: f.key }).length; });
    var catCounts = CATS.map(function (c) { return filtered({ cat: c }).length; });

    if (filterStyle === "pills") {
      var h = '<div class="chips" role="group" aria-label="When">';
      DATE_FILTERS.forEach(function (f, i) {
        if (f.key === "all") return;
        var on = state.when === f.key;
        h += '<button type="button" class="chip" data-when="' + f.key + '" aria-pressed="' + on + '">' +
          '<span>' + f.label + '</span><span class="count">' + dateCounts[i] + '</span>' +
          '<span class="x" aria-hidden="true">✕</span>' +
          (on ? '<span class="visually-hidden">(selected, press to clear)</span>' : "") + '</button>';
      });
      h += '</div><div class="chips" role="group" aria-label="Type of camp">';
      CATS.forEach(function (c, i) {
        var on = state.cat === c;
        h += '<button type="button" class="chip cat cat-' + i + '" data-cat="' + esc(c) + '" aria-pressed="' + on + '">' +
          '<span class="dot" aria-hidden="true"></span><span>' + esc(c) + '</span><span class="count">' + catCounts[i] + '</span>' +
          '<span class="x" aria-hidden="true">✕</span>' +
          (on ? '<span class="visually-hidden">(selected, press to clear)</span>' : "") + '</button>';
      });
      h += '</div>';
      var countries = tally(filtered({ country: "", city: "" }), "country");
      if (state.country && !countries.some(function (c) { return c.name === state.country; })) countries.push({ name: state.country, n: 0 });
      h += '<div class="chips" role="group" aria-label="Country">';
      countries.forEach(function (c) {
        var on = state.country === c.name;
        h += '<button type="button" class="chip place" data-country="' + esc(c.name) + '" aria-pressed="' + on + '">' +
          ICON.globe + '<span>' + esc(c.name) + '</span><span class="count">' + c.n + '</span>' +
          '<span class="x" aria-hidden="true">✕</span>' +
          (on ? '<span class="visually-hidden">(selected, press to clear)</span>' : "") + '</button>';
      });
      h += '</div>';
      if (state.country) {
        var cities = tally(filtered({ city: "" }), "city");
        if (state.city && !cities.some(function (c) { return c.name === state.city; })) cities.push({ name: state.city, n: 0 });
        if (cities.length) {
          h += '<div class="chips cities" role="group" aria-label="City in ' + esc(state.country) + '">' +
            '<span class="chips-label">Cities in ' + esc(placeName(state.country)) + '</span>';
          cities.forEach(function (c) {
            var on = state.city === c.name;
            h += '<button type="button" class="chip place" data-city="' + esc(c.name) + '" aria-pressed="' + on + '">' +
              ICON.pinSmall + '<span>' + esc(c.name) + '</span><span class="count">' + c.n + '</span>' +
              '<span class="x" aria-hidden="true">✕</span>' +
              (on ? '<span class="visually-hidden">(selected, press to clear)</span>' : "") + '</button>';
          });
          h += '</div>';
        }
      }
      box.innerHTML = h;
    } else {
      var ci = CATS.indexOf(state.cat);
      var m = '<div class="menus">';
      m += '<div class="menu' + (state.when !== "all" ? " is-set" : "") + '"><span class="mdot" aria-hidden="true"></span>' +
        '<label for="when-sel" class="visually-hidden">When</label><select id="when-sel">';
      DATE_FILTERS.forEach(function (f, i) {
        m += '<option value="' + f.key + '"' + (state.when === f.key ? " selected" : "") + '>' + f.label + ' (' + dateCounts[i] + ')</option>';
      });
      m += '</select>' + ICON.chev + '<button type="button" class="icon-btn" data-clear="when" aria-label="Clear date filter">' + ICON.x + '</button></div>';
      m += '<div class="menu cat-menu' + (state.cat ? " is-set cat-" + ci : "") + '"><span class="mdot" aria-hidden="true"></span>' +
        '<label for="cat-sel" class="visually-hidden">Type of camp</label><select id="cat-sel">';
      m += '<option value="">All types (' + filtered({ cat: "" }).length + ')</option>';
      CATS.forEach(function (c, i) {
        m += '<option value="' + esc(c) + '"' + (state.cat === c ? " selected" : "") + '>' + esc(c) + ' (' + catCounts[i] + ')</option>';
      });
      m += '</select>' + ICON.chev + '<button type="button" class="icon-btn" data-clear="cat" aria-label="Clear type filter">' + ICON.x + '</button></div>';
      var base = filtered({ country: "", city: "" });
      m += '<div class="menu place-menu' + (state.country ? " is-set" : "") + '"><span class="mdot" aria-hidden="true"></span>' +
        '<label for="place-sel" class="visually-hidden">Where</label><select id="place-sel">';
      m += '<option value="">Anywhere (' + base.length + ')</option>';
      var cur = state.city ? "t:" + state.country + "|" + state.city : state.country ? "c:" + state.country : "";
      var ctl = tally(base, "country");
      if (state.country && !ctl.some(function (c) { return c.name === state.country; })) ctl.push({ name: state.country, n: 0 });
      ctl.forEach(function (c) {
        var v = "c:" + c.name;
        m += '<optgroup label="' + esc(c.name) + '">' +
          '<option value="' + esc(v) + '"' + (cur === v ? " selected" : "") + '>All of ' + esc(placeName(c.name)) + ' (' + c.n + ')</option>';
        tally(base.filter(function (e) { return e.country === c.name; }), "city").forEach(function (t) {
          var tv = "t:" + c.name + "|" + t.name;
          m += '<option value="' + esc(tv) + '"' + (cur === tv ? " selected" : "") + '>' + esc(t.name) + ', ' + esc(c.name) + ' (' + t.n + ')</option>';
        });
        m += '</optgroup>';
      });
      m += '</select>' + ICON.chev + '<button type="button" class="icon-btn" data-clear="place" aria-label="Clear place filter">' + ICON.x + '</button></div>';
      box.innerHTML = m + "</div>";
    }
  }

  // ---------- heading ----------
  function renderHeading(list) {
    var noun = state.cat ? CAT_PLURAL[state.cat] || state.cat.toLowerCase() + "s" : "camps";
    var where = state.city ? " in " + state.city + (state.city !== state.country ? ", " + state.country : "")
      : state.country ? " in " + placeName(state.country) : "";
    noun += where;
    var Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
    var t;
    switch (state.when) {
      case "week": t = Noun + " this week"; break;
      case "nextweek": t = Noun + " next week"; break;
      case "month": t = Noun + " this month"; break;
      case "nextmonth": t = Noun + (where ? " during " : " in ") + MONTHS[(TODAY.getMonth() + 1) % 12]; break;
      case "later": t = Noun + " from " + range("later")[0].getDate() + " " + MONTHS[range("later")[0].getMonth()]; break;
      default: t = "All upcoming " + noun;
    }
    if (state.q) t += " matching “" + state.q + "”";
    document.getElementById("heading").textContent = t;

    var sub = "";
    var one = state.cat === "Skills clinic" ? "clinic" : "camp", many = state.cat === "Skills clinic" ? "clinics" : "camps";
    if (list.length) {
      var r = range(state.when);
      var a = r[0], b = r[1];
      if (!b) {
        b = list.reduce(function (m, e) { return e._e > m ? e._e : m; }, list[0]._e);
        var minS = list.reduce(function (m, e) { return e._s < m ? e._s : m; }, list[0]._s);
        if (minS > a) a = minS;
      }
      sub = plural(list.length, one, many) + " from " + rangeText(a, b);
    } else {
      sub = "No " + many + " match these filters.";
    }
    document.getElementById("subheading").textContent = sub;
  }

  // ---------- list ----------
  function rowHTML(e, opts) {
    opts = opts || {};
    var place = [e.venue, e.area, e.country].filter(Boolean);
    // avoid repeating the country when the area already names it
    var placeTxt = place.join(", ");
    var facts = [];
    if (e.ages) facts.push("<li><b>Ages</b> " + esc(e.ages) + "</li>");
    if (e.level) facts.push("<li><b>Level</b> " + esc(e.level) + "</li>");
    if (e.price) facts.push("<li><b>Price</b> " + esc(e.price) + "</li>");
    if (e.organiser && e.organiser !== e.venue) facts.push("<li><b>By</b> " + esc(e.organiser) + "</li>");
    var hasPin = e.lat != null && e.lng != null;
    return '<article class="row ' + (opts.tile ? "tile " : "") + 'cat-' + e._cat + '">' +
      '<div class="row-when">' +
        '<span class="row-time">' + (e.time ? esc(e.time) : '<span class="visually-hidden">Time not given</span>') + '</span>' +
        '<span class="tag">' + esc(e.category) + '</span>' +
      '</div>' +
      '<div class="row-body">' +
        '<h3 class="row-title"><a href="' + esc(tagged(e.url)) + '" target="_blank" rel="noopener">' + esc(e.title) + '</a></h3>' +
        (placeTxt ? '<p class="row-venue"><a href="' + esc(mapsURL(e)) + '" target="_blank" rel="noopener" aria-label="' + esc(placeTxt) + ' on Google Maps">' + esc(placeTxt) + '</a></p>' : "") +
        '<p class="row-span">' + (e.online ? "Online, " : "") + esc(spanText(e)) + '</p>' +
        (e.summary ? '<p class="row-summary">' + esc(e.summary) + '</p>' : "") +
        (facts.length ? '<ul class="facts">' + facts.join("") + '</ul>' : "") +
        '<div class="actions">' +
          '<a class="btn" href="' + esc(gcalURL(e)) + '" target="_blank" rel="noopener">' + ICON.cal +
            '<span class="long">Add to calendar</span><span class="short">Calendar</span></a>' +
          (hasPin ? '<button type="button" class="btn" data-pin="' + e._i + '">' + ICON.pin +
            '<span class="long">Venue on map</span><span class="short">Map</span></button>' : "") +
          '<a class="btn primary" href="' + esc(tagged(e.url)) + '" target="_blank" rel="noopener" aria-label="View ' + esc(e.title) + ' (opens the organiser page)">View' + ICON.out + '</a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function dayHead(d) {
    var rel = relTag(d);
    return '<div class="day-date"><span class="day-num">' + d.getDate() + '</span>' +
      '<span class="day-wd">' + WEEKDAYS[d.getDay()] + '</span>' +
      '<span class="day-mon">' + MONTHS[d.getMonth()] + (d.getFullYear() !== TODAY.getFullYear() ? " " + d.getFullYear() : "") + '</span>' +
      (rel ? '<span class="rel">' + rel + '</span>' : "") + '</div>';
  }

  function renderList(list) {
    var box = document.getElementById("view-list");
    if (!list.length) { box.innerHTML = emptyHTML(); return; }
    var r = range(state.when);
    var long = [], groups = {}, order = [];
    list.forEach(function (e) {
      if (e._days >= 2 && e._s <= TODAY) { long.push(e); return; }
      var d = e._s < r[0] ? r[0] : e._s;
      var k = iso(d);
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(e);
    });
    order.sort();
    var h = "";
    order.forEach(function (k) {
      h += '<section class="day" aria-label="' + esc(rangeText(parseD(k), parseD(k))) + '">' + dayHead(parseD(k)) +
        '<div class="day-items">' + groups[k].map(function (e) { return rowHTML(e); }).join("") + '</div></section>';
    });
    if (long.length) {
      h += '<section class="long-strip" aria-labelledby="long-h"><h3 id="long-h">Already running</h3>' +
        '<p>Longer camps that have started and still take bookings for the remaining days or the next intake.</p>' +
        '<div class="tiles">' + long.map(function (e) { return rowHTML(e, { tile: true }); }).join("") + '</div></section>';
    }
    box.innerHTML = h;
  }

  function emptyHTML() {
    return '<div class="empty"><p>Nothing matches right now. Try a wider date range or another type of camp.</p>' +
      '<button type="button" class="btn" data-reset="1">Show all upcoming camps</button></div>';
  }

  // ---------- calendar ----------
  var calSelected = null;
  function calMonth(list) {
    if (state.m) { var p = state.m.split("-"); return new Date(+p[0], +p[1] - 1, 1); }
    var r = range(state.when);
    var first = r[0];
    if (state.when === "all" || state.when === "later") {
      if (list.length) first = list.reduce(function (m, e) { var s = e._s < TODAY ? TODAY : e._s; return s < m ? s : m; }, list[0]._s < TODAY ? TODAY : list[0]._s);
    }
    return new Date(first.getFullYear(), first.getMonth(), 1);
  }
  function renderCalendar(list) {
    var box = document.getElementById("view-calendar");
    var m0 = calMonth(list);
    var r = range(state.when);
    var gridStart = startOfWeek(m0);
    var last = new Date(m0.getFullYear(), m0.getMonth() + 1, 0);
    var gridEnd = addDays(startOfWeek(last), 6);
    var phone = window.matchMedia("(max-width: 720px)").matches;
    var h = '<div class="cal-nav"><button type="button" class="btn" data-cal="-1" aria-label="Previous month">‹ <span class="long">Previous</span></button>' +
      '<h3 aria-live="polite">' + MONTHS[m0.getMonth()] + " " + m0.getFullYear() + '</h3>' +
      '<button type="button" class="btn" data-cal="1" aria-label="Next month"><span class="long">Next</span> ›</button></div>';
    h += '<div class="cal-grid" role="grid" aria-label="' + MONTHS[m0.getMonth()] + ' ' + m0.getFullYear() + '">';
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach(function (w) { h += '<div class="cal-wd" role="columnheader">' + w + '</div>'; });
    for (var d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
      var evs = list.filter(function (e) { return inDay(e, d); });
      var cls = "cal-day";
      if (d.getMonth() !== m0.getMonth()) cls += " other";
      if (+d === +TODAY) cls += " today";
      if (state.when !== "all") {
        var inR = d >= r[0] && (r[1] === null || d <= r[1]);
        cls += inR ? " in-range" : " dim";
      }
      if (calSelected && iso(d) === calSelected) cls += " selected";
      var label = WEEKDAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()] + ", " + plural(evs.length, "camp", "camps");
      h += '<button type="button" class="' + cls + '" data-day="' + iso(d) + '" aria-label="' + label + '">' +
        '<span class="cal-n" aria-hidden="true">' + d.getDate() + '</span>';
      var show = evs.slice(0, 3);
      show.forEach(function (e) { h += '<span class="cal-ev cat-' + e._cat + '" aria-hidden="true">' + esc(e.title) + '</span>'; });
      if (evs.length > 3) h += '<span class="cal-more" aria-hidden="true">+' + (evs.length - 3) + ' more</span>';
      if (evs.length) {
        h += '<span class="cal-dots" aria-hidden="true">' + evs.slice(0, 6).map(function (e) { return '<i class="cat-' + e._cat + '"></i>'; }).join("") + '</span>';
      }
      h += '</button>';
    }
    h += '</div><div class="cal-list" id="cal-list"></div>';
    box.innerHTML = h;
    void phone;
    if (calSelected) renderCalDay(list, parseD(calSelected));
  }
  function renderCalDay(list, d) {
    var evs = list.filter(function (e) { return inDay(e, d); });
    var el = document.getElementById("cal-list");
    if (!el) return;
    el.innerHTML = '<h3>' + rangeText(d, d) + ': ' + plural(evs.length, "camp", "camps") + '</h3>' +
      (evs.length ? '<div class="day-items">' + evs.map(function (e) { return rowHTML(e); }).join("") + '</div>' :
        '<p class="results-sub">No camps on this day with the current filters.</p>');
  }

  // ---------- map ----------
  var map = null, cluster = null, markerByEvent = {};
  function venueKey(e) { return e.lat.toFixed(5) + "," + e.lng.toFixed(5); }
  function initMap() {
    if (map || !window.L) return !!map;
    map = L.map("map", { scrollWheelZoom: false, worldCopyJump: true }).setView([30, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    return true;
  }
  function renderMap(list, focusIdx) {
    if (!initMap()) {
      document.getElementById("map-note").textContent = "The map could not load. Check your connection and try again.";
      return;
    }
    setTimeout(function () { map.invalidateSize(); }, 50);
    if (cluster) map.removeLayer(cluster);
    markerByEvent = {};
    cluster = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 45,
      iconCreateFunction: function (c) {
        var n = c.getAllChildMarkers().reduce(function (s, m) { return s + (m.options.count || 1); }, 0);
        return L.divIcon({ html: '<div class="cluster" aria-label="' + n + ' camps">' + n + '</div>', className: "", iconSize: [40, 40] });
      }
    });
    var venues = {}, order = [], noPin = 0;
    list.forEach(function (e) {
      if (e.lat == null || e.lng == null) { noPin++; return; }
      var k = venueKey(e);
      if (!venues[k]) { venues[k] = []; order.push(k); }
      venues[k].push(e);
    });
    var bounds = [];
    order.forEach(function (k) {
      var evs = venues[k];
      var tally = {};
      evs.forEach(function (e) { tally[e._cat] = (tally[e._cat] || 0) + 1; });
      var top = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a] || a - b; })[0];
      var icon = L.divIcon({
        className: "", iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24],
        html: '<div class="pin cat-' + top + '"><span>' + (evs.length > 1 ? evs.length : "") + '</span></div>'
      });
      var mk = L.marker([evs[0].lat, evs[0].lng], { icon: icon, count: evs.length, title: (evs[0].venue || evs[0].area || "Venue") + ", " + plural(evs.length, "camp", "camps"), keyboard: true });
      var name = evs[0].venue || evs[0].area || "";
      var pop = '<p class="pop-venue">' + esc(name) + '</p>' + evs.map(function (e) {
        return '<div class="pop-item cat-' + e._cat + '"><span class="tag">' + esc(e.category) + '</span>' +
          '<h4>' + esc(e.title) + '</h4><p>' + esc(spanText(e)) + (e.time ? ", from " + esc(e.time) : "") + '</p>' +
          '<div class="pop-actions"><a class="btn primary" href="' + esc(tagged(e.url)) + '" target="_blank" rel="noopener">View</a>' +
          '<a class="btn" href="' + esc(gcalURL(e)) + '" target="_blank" rel="noopener">Add to calendar</a></div></div>';
      }).join("");
      mk.bindPopup(pop, { maxWidth: 300, maxHeight: 320 });
      cluster.addLayer(mk);
      evs.forEach(function (e) { markerByEvent[e._i] = mk; });
      bounds.push([evs[0].lat, evs[0].lng]);
    });
    map.addLayer(cluster);
    var note = document.getElementById("map-note");
    note.textContent = noPin ? plural(noPin, "camp in this selection has", "camps in this selection have") +
      " no verified venue location, so " + (noPin === 1 ? "it isn't" : "they aren't") + " on the map. You'll find " + (noPin === 1 ? "it" : "them") + " in the List view." : "";
    if (focusIdx != null && markerByEvent[focusIdx]) {
      var m = markerByEvent[focusIdx];
      cluster.zoomToShowLayer(m, function () { m.openPopup(); });
    } else if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
    }
  }

  // ---------- render ----------
  var pendingFocus = null;
  function render() {
    var list = filtered();
    renderHeader();
    renderFilters();
    renderHeading(list);
    document.querySelectorAll(".seg button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === state.view)); });
    ["list", "calendar", "map"].forEach(function (v) { document.getElementById("view-" + v).hidden = v !== state.view; });
    if (state.view === "list") renderList(list);
    if (state.view === "calendar") renderCalendar(list);
    if (state.view === "map") {
      if (window.L) renderMap(list, pendingFocus);
      else window.addEventListener("load", function () { renderMap(filtered(), pendingFocus); }, { once: true });
      pendingFocus = null;
    }
    // keep a selected chip visible inside its horizontally scrolling row
    document.querySelectorAll(".chips").forEach(function (row) {
      var on = row.querySelector('[aria-pressed="true"]');
      if (!on) return;
      var l = on.offsetLeft - row.offsetLeft, r = l + on.offsetWidth;
      if (l < row.scrollLeft || r > row.scrollLeft + row.clientWidth) row.scrollLeft = Math.max(0, l - 16);
    });
    var qc = document.getElementById("q-clear");
    qc.hidden = !state.q;
    writeURL();
  }

  // ---------- events ----------
  var qInput = document.getElementById("q");
  qInput.value = state.q;
  var qTimer;
  qInput.addEventListener("input", function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { state.q = qInput.value.trim(); render(); }, 160);
  });
  qInput.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && qInput.value) { ev.preventDefault(); qInput.value = ""; state.q = ""; render(); }
  });
  document.getElementById("q-clear").addEventListener("click", function () {
    qInput.value = ""; state.q = ""; render(); qInput.focus();
  });
  document.getElementById("style-toggle").addEventListener("click", function () {
    filterStyle = filterStyle === "pills" ? "menus" : "pills";
    try { localStorage.setItem("ttc-filter-style", filterStyle); } catch (err) {}
    render();
    var first = document.querySelector("#filters button, #filters select");
    if (first) first.focus();
  });

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("button, a");
    if (!t) return;
    if (t.dataset.view) { state.view = t.dataset.view; render(); return; }
    if (t.dataset.when && t.matches(".chip, .kpi-btn")) {
      var key = t.dataset.when;
      state.when = state.when === key ? "all" : key;
      state.m = ""; calSelected = null;
      var refocus = t.matches(".kpi-btn") ? null : "[data-when='" + key + "'].chip";
      render();
      if (t.matches(".kpi-btn")) document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
      if (refocus) { var b = document.querySelector(refocus); if (b) b.focus(); }
      return;
    }
    if (t.dataset.cat !== undefined && t.matches(".chip")) {
      var c = t.dataset.cat;
      state.cat = state.cat === c ? "" : c;
      render();
      var b2 = document.querySelector('.chip[data-cat="' + c.replace(/"/g, '\\"') + '"]');
      if (b2) b2.focus();
      return;
    }
    if (t.dataset.clear) {
      if (t.dataset.clear === "when") { state.when = "all"; state.m = ""; }
      else if (t.dataset.clear === "place") { state.country = ""; state.city = ""; }
      else state.cat = "";
      render();
      var sel = document.getElementById({ when: "when-sel", cat: "cat-sel", place: "place-sel" }[t.dataset.clear]);
      if (sel) sel.focus();
      return;
    }
    if (t.dataset.reset) { state.when = "all"; state.cat = ""; state.country = ""; state.city = ""; state.q = ""; qInput.value = ""; render(); return; }
    if (t.dataset.country !== undefined && t.matches(".chip")) {
      var co = t.dataset.country;
      state.country = state.country === co ? "" : co;
      state.city = "";
      render();
      var b3 = document.querySelector('.chip[data-country="' + co.replace(/"/g, '\\"') + '"]');
      if (b3) b3.focus();
      return;
    }
    if (t.dataset.city !== undefined && t.matches(".chip")) {
      var ct = t.dataset.city;
      state.city = state.city === ct ? "" : ct;
      render();
      var b4 = document.querySelector('.chip[data-city="' + ct.replace(/"/g, '\\"') + '"]');
      if (b4) b4.focus();
      return;
    }
    if (t.dataset.pin) {
      pendingFocus = +t.dataset.pin;
      state.view = "map";
      render();
      document.getElementById("results").scrollIntoView({ block: "start" });
      return;
    }
    if (t.dataset.cal) {
      var m0 = calMonth(filtered());
      var nm = new Date(m0.getFullYear(), m0.getMonth() + +t.dataset.cal, 1);
      state.m = nm.getFullYear() + "-" + String(nm.getMonth() + 1).padStart(2, "0");
      calSelected = null;
      render();
      var nb = document.querySelector('[data-cal="' + t.dataset.cal + '"]');
      if (nb) nb.focus();
      return;
    }
    if (t.dataset.day) {
      calSelected = t.dataset.day;
      document.querySelectorAll(".cal-day.selected").forEach(function (x) { x.classList.remove("selected"); });
      t.classList.add("selected");
      renderCalDay(filtered(), parseD(t.dataset.day));
      var cl = document.getElementById("cal-list");
      if (cl && window.matchMedia("(max-width: 720px)").matches) cl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  document.addEventListener("change", function (ev) {
    if (ev.target.id === "when-sel") { state.when = ev.target.value; state.m = ""; calSelected = null; render(); document.getElementById("when-sel").focus(); }
    if (ev.target.id === "cat-sel") { state.cat = ev.target.value; render(); document.getElementById("cat-sel").focus(); }
    if (ev.target.id === "place-sel") {
      var v = ev.target.value;
      if (!v) { state.country = ""; state.city = ""; }
      else if (v.indexOf("c:") === 0) { state.country = v.slice(2); state.city = ""; }
      else { var parts = v.slice(2).split("|"); state.country = parts[0]; state.city = parts.slice(1).join("|"); }
      render();
      document.getElementById("place-sel").focus();
    }
  });
  var lastPhone = window.matchMedia("(max-width: 720px)").matches;
  window.addEventListener("resize", function () {
    var p = window.matchMedia("(max-width: 720px)").matches;
    if (p !== lastPhone) { lastPhone = p; if (state.view === "calendar") render(); }
  });

  render();
})();
