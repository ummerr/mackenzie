/* MACKENZIE — the map.
 * Depends on shared.js and panel.js, loaded before this file. Vanilla, one
 * IIFE, passive listeners — same conventions as the essay layout on the site. */

(function () {
  "use strict";

  /* Esri World Imagery. Keyless, global, and the only reason to make this map
   * aerial: at z15+ you can read fairway lines, bunkering and the coast. The
   * reference layer on top carries place labels, without which a satellite
   * basemap is beautiful and unnavigable. Attribution is required for both. */
  const IMAGERY =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const LABELS =
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

  /* The glyph server only ships two fontstacks, and `Open Sans Regular` — the
   * obvious name, and the one this file used to ask for — is not one of them.
   * MapLibre answers a missing fontstack by drawing nothing at all, silently,
   * so every label on this map was absent rather than wrong. Verified live:
   * `Open Sans Semibold` and `Noto Sans Regular` both 200, everything else 404s. */
  const FONT = ["Open Sans Semibold"];

  /* Where the pin hands the map over to the drawn course. Two places paint it —
   * the circle layers at load, and `paintByLens` on every rail click — and if
   * they disagree a lens switch resurrects a dot the plan has already replaced.
   * So the band is written once. */
  const PIN_FADE = { in: 13.5, out: 14.8 };

  const state = { lens: "grint", data: null, selected: null, map: null };

  /**
   * A graticule, built rather than fetched — 271 two-point lines is less code
   * than any way of downloading them.
   *
   * It earns its place at exactly one zoom range. From space this map is
   * fourteen dots on a photograph of the Pacific, and a photograph has no
   * scale: there is nothing to tell you Kona and Barbados are a third of the
   * planet apart. Meridians say it without a word of copy. They stop at z9,
   * where the coastline takes the job over and lines on top of a city are just
   * lines on top of a city.
   *
   * Parallels are subdivided every 10° of longitude. In Web Mercator a parallel
   * is a straight line and two points would do, but MapLibre draws the segment
   * between vertices in projected space and a globe projection would bow it.
   */
  function graticule() {
    const features = [];
    const push = (coords, step, label) =>
      features.push({
        type: "Feature",
        properties: { step, label },
        geometry: { type: "LineString", coordinates: coords },
      });

    for (const step of [10, 2]) {
      for (let lon = -180; lon <= 180; lon += step) {
        if (step === 2 && lon % 10 === 0) continue; // already drawn as a major
        push([[lon, -84], [lon, 84]], step, `${Math.abs(lon)}°${lon < 0 ? "W" : lon > 0 ? "E" : ""}`);
      }
      for (let lat = -80; lat <= 80; lat += step) {
        if (step === 2 && lat % 10 === 0) continue;
        const pts = [];
        for (let lon = -180; lon <= 180; lon += 10) pts.push([lon, lat]);
        push(pts, step, `${Math.abs(lat)}°${lat < 0 ? "S" : lat > 0 ? "N" : ""}`);
      }
    }
    return { type: "FeatureCollection", features };
  }

  /**
   * A compass rose, drawn rather than iconified, that turns with the bearing.
   *
   * MapLibre's stock compass is a button with an arrow on it — a control that
   * happens to indicate north. This is the opposite: a piece of map furniture
   * that happens to be clickable. It exists because rotation is enabled here
   * and a rotated satellite map with no rose is genuinely disorienting; the
   * eight-point star is the convention that says "this is a map" faster than
   * any amount of chrome.
   */
  class CompassRose {
    onAdd(map) {
      this._map = map;
      /* Each blade is two triangles, one lit and one shaded, which is how a
       * rose has been engraved since they were engraved. It matters at this
       * size: filled as single kites the eight points merge into a star and
       * stop reading as directions. North is the accent — no letter needed,
       * that is what the odd-coloured point has always meant. */
      const blade = (deg, cls, len, shoulder) =>
        `<path class="${cls}" transform="rotate(${deg})" d="M0 ${-len} L${shoulder} -9 L0 0 Z"/>` +
        `<path class="${cls} rose-shade" transform="rotate(${deg})" d="M0 ${-len} L${-shoulder} -9 L0 0 Z"/>`;

      const el = document.createElement("div");
      el.className = "maplibregl-ctrl rose";
      el.innerHTML = `
        <svg viewBox="-50 -50 100 100" aria-hidden="true">
          <circle class="rose-ring" r="43"/>
          <circle class="rose-ring-in" r="33"/>
          <g class="rose-star">
            ${[45, 135, 225, 315].map((d) => blade(d, "rose-minor", 26, 4)).join("")}
            ${[90, 180, 270].map((d) => blade(d, "rose-major", 40, 7)).join("")}
            ${blade(0, "rose-north", 40, 7)}
          </g>
        </svg>`;
      el.title = "Reset north";
      el.addEventListener("click", () => map.easeTo({ bearing: 0, pitch: 0, duration: 500 }));

      const spin = () => {
        const b = map.getBearing();
        el.style.setProperty("--rose-turn", `${-b}deg`);
        // Straight north is the default state, so the rose recedes; the moment
        // the map is off-axis it is the thing you need and it comes forward.
        el.classList.toggle("off-axis", Math.abs(b) > 0.5);
      };
      map.on("rotate", spin);
      spin();

      this._el = el;
      return el;
    }
    onRemove() {
      this._el.remove();
      this._map = null;
    }
  }

  /**
   * PLAN / AERIAL. Appears only where it means something — below course zoom
   * there is no plan to turn off — and does exactly one useful thing: puts the
   * photograph back so you can check the drawing against it. OSM is volunteer
   * data and sometimes a green is a decade out of date; a map that draws over
   * its evidence with no way back is asking to be trusted further than it has
   * earned.
   */
  class ViewToggle {
    onAdd(map) {
      const el = document.createElement("div");
      el.className = "maplibregl-ctrl view-toggle";
      el.innerHTML = `<button data-view="plan" aria-pressed="true">Plan</button>
                      <button data-view="aerial" aria-pressed="false">Aerial</button>`;
      el.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        CoursePlan.setMode(btn.dataset.view);
        $$("button", el).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === btn.dataset.view)));
      });

      const show = () => el.classList.toggle("on", map.getZoom() >= CoursePlan.ZOOM_IN);
      map.on("zoom", show);
      show();

      this._el = el;
      return el;
    }
    onRemove() {
      this._el.remove();
    }
  }

  // ── data ────────────────────────────────────────────────────────────────

  async function load() {
    const [courses, polys] = await Promise.all([
      fetch("/data/courses.json").then((r) => {
        if (!r.ok) throw new Error(`courses.json ${r.status}`);
        return r.json();
      }),
      fetch("/data/course-polygons.geojson")
        .then((r) => (r.ok ? r.json() : { type: "FeatureCollection", features: [] }))
        .catch(() => ({ type: "FeatureCollection", features: [] })),
    ]);
    return { courses, polys };
  }

  const pointsFrom = (courses) => ({
    type: "FeatureCollection",
    features: courses.facilities
      .filter((f) => f.lat != null && f.lon != null)
      .map((f) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [f.lon, f.lat] },
        properties: {
          slug: f.slug,
          name: f.name,
          place: place(f),
          bestRank: f.bestRank,
          totalPlays: f.totalPlays,
          layoutCount: f.layoutCount,
          avg: f.layouts.find((l) => l.avgScore)?.avgScore ?? null,
          // One score property per lens, so switching the rail is a paint
          // change rather than a source rewrite.
          ...Object.fromEntries(
            Object.entries(f.scores).map(([k, v]) => [`s_${k}`, v == null ? -1 : v]),
          ),
        },
      })),
  });

  // ── chrome ──────────────────────────────────────────────────────────────

  function renderHead(courses) {
    const s = courses.stats;
    $("#head-stats").innerHTML = [
      `<span><b>${s.layouts}</b> courses</span>`,
      `<span><b>${s.facilities}</b> places</span>`,
      `<span><b>${s.usStates.length}</b> states</span>`,
      `<span><b>${s.countries.length}</b> countries</span>`,
    ].join("");
  }

  function renderRail() {
    $("#rail").innerHTML = RAIL.map(
      (r) =>
        `<button class="rail-btn" data-lens="${r.lens}" aria-pressed="${r.lens === state.lens}">
           <span class="rail-n">${r.n}</span>${r.label}
         </button>`,
    ).join("");

    $("#rail").addEventListener("click", (e) => {
      const btn = e.target.closest(".rail-btn");
      if (!btn) return;
      state.lens = btn.dataset.lens;
      $$(".rail-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lens === state.lens)));
      paintByLens();
      renderLegend();
    });
  }

  /* The key for whatever the map is currently saying.
   *
   * Two legends, because the map does two different things. Zoomed out it is a
   * choropleth of 84 dots and the ramp is the only thing worth explaining.
   * Zoomed in the dots are gone, the ramp explains nothing on screen, and the
   * question is what the colours of the drawing mean — so the ramp gives way to
   * a course key. A legend for marks that aren't visible is furniture. */
  const KEY = [
    ["fairway", "Fairway"],
    ["green", "Green"],
    ["sand", "Bunker"],
    ["water", "Water"],
  ];

  function renderLegend() {
    const rail = RAIL.find((r) => r.lens === state.lens);
    const lens = state.data.courses.lenses[state.lens];
    const plan = state.map && CoursePlan.mode === "plan" ? CoursePlan.visibleSummary() : null;

    const ramp = `
      <div class="legend-title">${esc(lens?.label ?? rail.label)}</div>
      <div class="legend-ramp"></div>
      <div class="legend-ends"><span>low</span><span>high</span></div>`;

    const html = plan
      ? `${ramp}
         <div class="legend-key">
           ${KEY.map(([k, label]) => `<span><i style="background:${TURF[k]}"></i>${label}</span>`).join("")}
           <span class="legend-route"><i></i>${plan.holes ? `${plan.holes} holes` : "Routing"}</span>
         </div>
         <div class="legend-src">Course detail © OpenStreetMap</div>`
      : `${ramp}<div class="legend-size">dot size = rounds played</div>`;

    // Called on every idle as well as every move, because the hole count comes
    // from what is actually rendered and that is only true once rendering has
    // settled. Diffing the string keeps that from being a DOM write per frame.
    if (html !== lastLegend) {
      lastLegend = html;
      $("#legend").innerHTML = html;
    }
  }
  let lastLegend = null;

  /* The zoom-out story. 84 pins at world zoom is a scatter; a list of
   * "11 states, 3 countries" with counts is the thing actually worth reading
   * before you dive in. Clicking a row flies to that region's bounds. */
  function renderRegions(courses) {
    const groups = new Map();
    for (const f of courses.facilities) {
      if (f.lat == null) continue;
      const key = f.country === "US" ? f.region : COUNTRY_LABEL[f.country] ?? f.country;
      if (!groups.has(key)) groups.set(key, { key, country: f.country, items: [], plays: 0 });
      const g = groups.get(key);
      g.items.push(f);
      g.plays += f.totalPlays;
    }
    const rows = [...groups.values()].sort((a, b) => b.items.length - a.items.length);
    const us = rows.filter((r) => r.country === "US");
    const intl = rows.filter((r) => r.country !== "US");

    const rowHtml = (r) =>
      `<button class="region-row" data-region="${esc(r.key)}">
         <span>${esc(r.key)}</span><b>${r.items.length}</b>
       </button>`;

    $("#region-list").innerHTML =
      `<div class="region-group">United States</div>${us.map(rowHtml).join("")}` +
      (intl.length ? `<div class="region-group">Elsewhere</div>${intl.map(rowHtml).join("")}` : "");

    $("#region-list").addEventListener("click", (e) => {
      const btn = e.target.closest(".region-row");
      if (!btn) return;
      const g = groups.get(btn.dataset.region);
      if (!g) return;
      const lons = g.items.map((f) => f.lon);
      const lats = g.items.map((f) => f.lat);
      state.map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: { top: 90, bottom: 90, left: 200, right: 90 }, maxZoom: 12, duration: 900 },
      );
    });

    $("#regions-head").addEventListener("click", () => $("#regions").classList.toggle("collapsed"));
  }

  // ── paint ───────────────────────────────────────────────────────────────

  /* Sequential ramp expressed as a MapLibre interpolation. -1 is the sentinel
   * for "this lens has no value here" (e.g. scoringDelta on a 9-hole average);
   * those render muted rather than being silently placed at the bottom of the
   * scale, which would be a claim we haven't earned. */
  function paintByLens() {
    const k = `s_${state.lens}`;
    state.map.setPaintProperty("facilities", "circle-color", [
      "case",
      ["<", ["get", k], 0],
      TOKENS.cream3,
      ["interpolate", ["linear"], ["get", k], 0, RAMP[0], 0.25, RAMP[1], 0.5, RAMP[2], 0.75, RAMP[3], 1, RAMP[4]],
    ]);
    /* Faded on the same handoff the stroke uses. The zoom test has to be the
     * outer expression — MapLibre only accepts `zoom` as the input to a
     * top-level step or interpolate — so the lens case rides along as the
     * interpolation's start value rather than multiplying it. */
    state.map.setPaintProperty("facilities", "circle-opacity", [
      "interpolate",
      ["linear"],
      ["zoom"],
      PIN_FADE.in,
      ["case", ["<", ["get", k], 0], 0.45, 0.92],
      PIN_FADE.out,
      0,
    ]);
  }

  // ── dossier ─────────────────────────────────────────────────────────────

  function openDossier(slug) {
    const f = state.data.courses.facilities.find((x) => x.slug === slug);
    if (!f) return;
    state.selected = slug;
    $("#dossier-content").innerHTML = renderDossier(f);
    $("#dossier").classList.add("on");
    $("#dossier").scrollTop = 0;
    state.map.setFilter("facility-selected", ["==", ["get", "slug"], slug]);
    state.map.setFilter("polygon-selected", ["==", ["get", "facilitySlug"], slug]);
  }

  function closeDossier() {
    state.selected = null;
    $("#dossier").classList.remove("on");
    state.map.setFilter("facility-selected", ["==", ["get", "slug"], " "]);
    state.map.setFilter("polygon-selected", ["==", ["get", "facilitySlug"], " "]);
  }

  // ── boot ────────────────────────────────────────────────────────────────

  async function boot() {
    let data;
    try {
      data = await load();
    } catch (err) {
      $("#boot").textContent = `Could not load data — ${err.message}. Run \`npm run all\`.`;
      return;
    }
    state.data = data;

    const map = new maplibregl.Map({
      container: "map",
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          imagery: {
            type: "raster",
            tiles: [IMAGERY],
            tileSize: 256,
            maxzoom: 19,
            attribution:
              'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics · Course data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
          labels: { type: "raster", tiles: [LABELS], tileSize: 256, maxzoom: 19 },
          polys: { type: "geojson", data: data.polys },
          points: { type: "geojson", data: pointsFrom(data.courses) },
          grat: { type: "geojson", data: graticule() },
        },
        layers: [
          { id: "bg", type: "background", paint: { "background-color": TOKENS.ink0 } },
          {
            id: "imagery",
            type: "raster",
            source: "imagery",
            /* Tone, not decoration. Esri's imagery is colour-balanced to look
             * good on white: bright cyan oceans, high-key greens. Dropped onto
             * ink chrome it reads as a browser window someone pasted a map
             * into. Pulling saturation most of the way out and capping the
             * highlights turns it into a ground — dark, low-contrast, one
             * material — which is the only state in which a cream label or an
             * orange dot on top of it is reliably readable.
             *
             * The tone eases off as you approach course zoom. Down there the
             * photograph is being read, not sat on, and by z16 either the plan
             * has replaced it or it is the best thing on screen. */
            paint: {
              "raster-saturation": ["interpolate", ["linear"], ["zoom"], 3, -0.66, 9, -0.48, 14, -0.18, 16, 0],
              "raster-contrast": ["interpolate", ["linear"], ["zoom"], 3, 0.06, 12, 0.02, 16, 0],
              "raster-brightness-max": ["interpolate", ["linear"], ["zoom"], 3, 0.74, 9, 0.82, 14, 0.95, 16, 1],
              "raster-brightness-min": 0.02,
            },
          },
          {
            id: "labels",
            type: "raster",
            source: "labels",
            /* Place names matter most when you're lost — at the extremes. Mid
             * range the course names and the region panel are carrying it, and
             * a second set of labels underneath is just noise. */
            paint: {
              "raster-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.5, 8, 0.28, 12, 0.2, 15, 0.4],
              "raster-saturation": -0.4,
            },
          },
          {
            id: "graticule",
            type: "line",
            source: "grat",
            maxzoom: 9,
            paint: {
              "line-color": TOKENS.cream0,
              "line-width": ["case", ["==", ["get", "step"], 10], 0.6, 0.4],
              "line-opacity": [
                "interpolate", ["linear"], ["zoom"],
                2, ["case", ["==", ["get", "step"], 10], 0.13, 0],
                5, ["case", ["==", ["get", "step"], 10], 0.12, 0.07],
                8, 0.05,
                9, 0,
              ],
            },
          },
          {
            id: "graticule-label",
            type: "symbol",
            source: "grat",
            maxzoom: 7,
            filter: ["==", ["get", "step"], 10],
            layout: {
              "symbol-placement": "line",
              "symbol-spacing": 420,
              "text-field": ["get", "label"],
              "text-font": FONT,
              "text-size": 9,
              "text-letter-spacing": 0.14,
              // Placed along the line but set horizontally. A meridian label
              // rotated onto its own line is a vertical word, which is a
              // decoration; the point of "120°W" is that you can read it.
              "text-rotation-alignment": "viewport",
              "text-padding": 12,
            },
            paint: {
              "text-color": TOKENS.cream0,
              "text-opacity": 0.2,
              "text-halo-color": TOKENS.ink0,
              "text-halo-width": 1,
            },
          },
        ],
      },
      center: [-104, 39],
      zoom: 3.1,
      maxZoom: 18,
      attributionControl: { compact: true },
    });
    state.map = map;
    window.__m = map; // debug handle; harmless in production, invaluable in headless

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 92, unit: "imperial" }), "bottom-left");
    map.addControl(new CompassRose(), "bottom-left");
    map.addControl(new ViewToggle(), "bottom-left");

    map.on("load", async () => {
      /* Course outlines, cased.
       *
       * A single hairline around a thousand-acre property disappears into the
       * imagery it is drawn on — satellite tiles contain every colour, so no
       * one stroke survives all of them. The fix is the printer's: a dark
       * blurred stroke underneath doing the separating, a fine bright stroke on
       * top doing the drawing. The property then reads as cut out and lifted
       * off the ground rather than outlined on it, which is also, usefully,
       * what a golf course is.
       *
       * The fill backs off above z13 rather than growing. By then the plan is
       * arriving and an orange tint over the top of it would shift every turf
       * value on the map. */
      map.addLayer({
        id: "polygon-fill",
        type: "fill",
        source: "polys",
        paint: {
          "fill-color": TOKENS.accent,
          /* Peaks at metro zoom and then gets out of the way. Between z11 and
           * z13 a city is a grey field and the courses are the subject, so the
           * tint is doing the work the pins are too sparse to do — Los Angeles
           * lights up green-space-by-green-space. Above z13 the plan arrives
           * and an orange veneer over it would shift every turf value. */
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0, 11, 0.16, 13, 0.15, 15, 0.04],
        },
      });
      map.addLayer({
        id: "polygon-shadow",
        type: "line",
        source: "polys",
        paint: {
          "line-color": TOKENS.ink0,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 5, 17, 8],
          "line-blur": ["interpolate", ["linear"], ["zoom"], 10, 2, 17, 6],
          /* Held back at metro zoom. The casing exists to separate a stroke
           * from a photograph, but at z11 the courses are small and a dark blur
           * around each one cancelled out the orange tint meant to light them
           * up — the net effect was a smudge. It earns its keep from z13, where
           * a property fills the screen and its edge has to be unambiguous. */
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0, 11, 0.2, 13, 0.5, 14, 0.6],
        },
      });
      map.addLayer({
        id: "polygon-line",
        type: "line",
        source: "polys",
        paint: {
          "line-color": TOKENS.accent,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 13, 1.4, 17, 1.9],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0, 11, 0.72, 14, 0.9],
        },
      });
      map.addLayer({
        id: "polygon-selected",
        type: "line",
        source: "polys",
        filter: ["==", ["get", "facilitySlug"], " "],
        paint: { "line-color": TOKENS.cream0, "line-width": 2.4, "line-opacity": 0.95 },
      });

      /* Dot radius. sqrt(plays) so Rancho Park at 10 rounds reads as roughly
       * three times a one-off rather than ten times it — otherwise the home
       * courses swamp everything. The +4.5 floor is what makes a single round
       * visible at continental zoom; without it two thirds of the map is
       * sub-pixel. */
      const radius = (floor, scale) => [
        "interpolate", ["linear"], ["zoom"],
        2, ["+", floor, ["*", scale, ["sqrt", ["get", "totalPlays"]]]],
        10, ["+", floor + 3, ["*", scale * 1.7, ["sqrt", ["get", "totalPlays"]]]],
      ];

      /* Once the plan arrives the dot is in the way. It was a stand-in for a
       * course we could not draw; now the course is drawn, and a 20px disc
       * parked on the 9th green hides the thing it was pointing at. So the mark
       * hands over across PIN_FADE.
       *
       * This is why polygon-fill takes clicks below — with no dot to hit, the
       * property has to be the target, which it should probably always have
       * been. */
      const handoff = (full) => ["interpolate", ["linear"], ["zoom"], PIN_FADE.in, full, PIN_FADE.out, 0];

      // Ink halo. Satellite imagery has no predictable background value, so
      // separation comes from this rather than from the fill colour.
      map.addLayer({
        id: "facility-halo",
        type: "circle",
        source: "points",
        paint: {
          "circle-color": TOKENS.ink0,
          "circle-opacity": handoff(0.8),
          "circle-radius": radius(8.5, 2.1),
          "circle-blur": 0.14,
        },
      });

      map.addLayer({
        id: "facilities",
        type: "circle",
        source: "points",
        paint: {
          "circle-radius": radius(4.5, 1.9),
          "circle-stroke-width": 1.4,
          "circle-stroke-color": TOKENS.ink0,
          "circle-stroke-opacity": handoff(1),
        },
      });

      map.addLayer({
        id: "facility-selected",
        type: "circle",
        source: "points",
        filter: ["==", ["get", "slug"], " "],
        paint: {
          "circle-radius": radius(12, 2.1),
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 1.6,
          "circle-stroke-color": TOKENS.cream0,
          "circle-stroke-opacity": handoff(1),
        },
      });

      /* Names, in tracked caps to match the rail and the region panel. At 10px
       * over a photograph, letterspaced capitals hold together where a
       * mixed-case line dissolves, and it keeps the map's own type from reading
       * as the basemap's. Where two labels collide the better course keeps its
       * name — MapLibre sorts the key ascending and rank 1 is best.
       *
       * Two layers rather than one with a zoom-varying opacity: a label faded
       * to zero still takes part in collision, so hiding the bottom of the list
       * that way would have it silently suppressing the names above it. A
       * zoom-banded layer with a static filter removes them from the layout
       * entirely, which is what "not shown yet" is supposed to mean. */
      const labelLayer = (id, band, filter) => ({
        id,
        type: "symbol",
        source: "points",
        ...band,
        ...(filter ? { filter } : {}),
        layout: {
          "text-field": ["get", "name"],
          "text-font": FONT,
          "text-size": ["interpolate", ["linear"], ["zoom"], 7, 9.5, 12, 11, 16, 12.5],
          "text-transform": "uppercase",
          "text-letter-spacing": 0.1,
          "text-offset": [0, 1.35],
          "text-anchor": "top",
          "text-max-width": 9,
          "text-allow-overlap": false,
          "text-padding": 3,
          "symbol-sort-key": ["get", "bestRank"],
        },
        paint: {
          "text-color": TOKENS.cream0,
          "text-halo-color": TOKENS.ink0,
          "text-halo-width": 1.8,
          "text-opacity": 0.92,
        },
      });

      // The top of the list while the map is still a continent; everything once
      // you are close enough that there is nothing left to collide with.
      map.addLayer(labelLayer("facility-label", { minzoom: 7, maxzoom: 11.5 }, ["<=", ["get", "bestRank"], 40]));
      map.addLayer(labelLayer("facility-label-near", { minzoom: 11.5 }, null));

      paintByLens();

      /* The plan slots in beneath the pins and above the property outline, so a
       * drawn course never covers its own mark. Failure is survivable: without
       * it the map is the aerial plus pins, exactly as it was. */
      try {
        await CoursePlan.install(map, data.polys, "facility-halo", renderLegend);
      } catch (err) {
        console.warn("course plan unavailable:", err?.message ?? err);
      }

      /* Open on the whole story rather than a guessed centre. The data spans
       * Kona to Barbados — ~96° of longitude — so a hardcoded US view silently
       * drops Hawaii and the Caribbean, which are 7 of the 84. */
      const pts = pointsFrom(data.courses).features.map((f) => f.geometry.coordinates);
      if (pts.length) {
        const lons = pts.map((p) => p[0]);
        const lats = pts.map((p) => p[1]);
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: { top: 60, bottom: 90, left: 205, right: 175 }, duration: 0, maxZoom: 6 },
        );
      }

      $("#boot").hidden = true;

      // ── interactions ────────────────────────────────────────────────────

      const card = $("#card");
      let hovered = null;

      map.on("mousemove", "facilities", (e) => {
        const p = e.features[0].properties;
        map.getCanvas().style.cursor = "pointer";
        if (hovered !== p.slug) {
          hovered = p.slug;
          const bits = [`${ordinal(p.bestRank)}`];
          if (p.avg) bits.push(`${Number(p.avg).toFixed(0)} avg`);
          bits.push(p.totalPlays === 1 ? "1 round" : `${p.totalPlays} rounds`);
          card.innerHTML = `
            <div class="card-name">${esc(p.name)}</div>
            <div class="card-place">${esc(p.place)}</div>
            <div class="card-meta"><b>${bits[0]}</b> · ${bits.slice(1).map(esc).join(" · ")}${
              p.layoutCount > 1 ? ` · ${p.layoutCount} layouts` : ""
            }</div>`;
        }
        card.classList.add("on");
        const pad = 14;
        const w = card.offsetWidth;
        const h = card.offsetHeight;
        let x = e.point.x + pad;
        let y = e.point.y + pad;
        if (x + w > map.getCanvas().clientWidth - 10) x = e.point.x - w - pad;
        if (y + h > map.getCanvas().clientHeight - 10) y = e.point.y - h - pad;
        card.style.transform = `translate(${x}px, ${y + 56}px)`;
      });

      map.on("mouseleave", "facilities", () => {
        hovered = null;
        map.getCanvas().style.cursor = "";
        card.classList.remove("on");
      });

      map.on("click", "facilities", (e) => {
        const slug = e.features[0].properties.slug;
        openDossier(slug);
        map.easeTo({ center: e.features[0].geometry.coordinates, zoom: Math.max(map.getZoom(), 14), duration: 800 });
      });

      /* The property is a click target too. It has to be: the dot fades out by
       * z15.5, and without this the only way to open the dossier for the course
       * filling your screen is to zoom back out until its pin returns. */
      map.on("click", "polygon-fill", (e) => {
        if (map.queryRenderedFeatures(e.point, { layers: ["facilities"] }).length) return;
        openDossier(e.features[0].properties.facilitySlug);
      });
      map.on("mouseenter", "polygon-fill", () => {
        if (map.getZoom() >= 13) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "polygon-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ["facilities", "polygon-fill"] });
        if (!hits.length) closeDossier();
      });

      /* The legend swaps between the ramp and the course key on zoom, and picks
       * up hole counts as each course's geometry lands. `idle` is the one that
       * matters: `moveend` fires before the newly-fetched plan has been drawn,
       * and the count is read off the renderer. */
      map.on("moveend", renderLegend);
      map.on("idle", renderLegend);
    });

    map.on("error", (e) => {
      // Tile 404s at extreme zoom are normal and not worth surfacing.
      if (e?.error?.status === 404) return;
      console.warn("map:", e?.error?.message ?? e);
    });

    renderHead(data.courses);
    renderRail();
    renderRegions(data.courses);
    renderLegend();

    $("#dossier-close").addEventListener("click", closeDossier);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDossier();
    });
  }

  boot();
})();
