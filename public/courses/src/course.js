/* MACKENZIE — the course plan.
 *
 * Below z13 this file does nothing. Above it, the aerial stops being the map
 * and becomes the ground the map is drawn on: the property is washed down to a
 * flat turf value and the course is redrawn from OSM geometry as a routing
 * plan — fairway, green, tee, bunker, water, cart path, and the numbered hole
 * centrelines that turn 18 shapes into a round.
 *
 * Why redraw something the photograph already shows: a satellite tile of a golf
 * course is a picture of a golf course, and a picture answers no questions. It
 * has no hole numbers, no par, no separation between a green and the fairway
 * apron, and no consistency — the same course is olive in one tile set and grey
 * in another. A drawing is legible at a glance and identical everywhere.
 *
 * Geometry comes from `data/holes/<slug>.geojson`, one file per course, fetched
 * the first time that course enters the viewport at plan zoom. Eagerly loading
 * all 76 would be ~5 MB for a session that mostly never leaves the continental
 * view. `data/holes/index.json` says which courses have enough mapped to be
 * worth washing the photo out for; the rest keep their aerial and just get
 * their features drawn on top.
 *
 * Depends on shared.js (TURF). Vanilla, one IIFE, same contract as map.js.
 */

const CoursePlan = (function () {
  "use strict";

  /* Zoom band over which the plan arrives. Below IN you are looking at a
   * photograph; above FULL you are looking at a drawing. The band is wide on
   * purpose — a hard switch at one zoom level reads as a bug. */
  const ZOOM_IN = 12.8;
  const ZOOM_FULL = 14.6;

  /* Courses held in memory at once. Panning a metro area can touch a dozen;
   * past that the least-recently-seen are dropped and refetched from the HTTP
   * cache if you come back. */
  const KEEP = 14;

  const state = {
    map: null,
    manifest: {},
    boxes: [],          // { slug, minx, miny, maxx, maxy }
    loaded: new Map(),  // slug -> features, in insertion order for LRU
    inflight: new Set(),
    failed: new Set(),
    mode: "plan",       // "plan" | "aerial" — the toggle in the chrome
    onChange: null,
  };

  /* Fade any paint value in over the band. MapLibre needs the stop values
   * inline, so this is the one shape repeated across every layer below. */
  const fade = (from, to) => ["interpolate", ["linear"], ["zoom"], ZOOM_IN, from, ZOOM_FULL, to];

  const isClass = (k) => ["==", ["get", "k"], k];
  const isAnyClass = (...ks) => ["match", ["get", "k"], ks, true, false];

  // ── source data ─────────────────────────────────────────────────────────

  function collection() {
    const features = [];
    for (const fs of state.loaded.values()) features.push(...fs);
    return { type: "FeatureCollection", features };
  }

  function flush() {
    const src = state.map.getSource("plan");
    if (src) src.setData(collection());
  }

  async function ensure(slug) {
    if (state.loaded.has(slug) || state.inflight.has(slug) || state.failed.has(slug)) return;
    if (!state.manifest[slug]) return;
    state.inflight.add(slug);
    try {
      const res = await fetch(`/data/holes/${slug}.geojson`);
      if (!res.ok) throw new Error(String(res.status));
      const fc = await res.json();
      // Stamp the slug on every feature so the selected-course highlight and
      // any future per-course filtering have something to filter on.
      for (const f of fc.features) f.properties.slug = slug;
      state.loaded.set(slug, fc.features);
      while (state.loaded.size > KEEP) state.loaded.delete(state.loaded.keys().next().value);
      flush();
      if (state.onChange) state.onChange();
    } catch {
      // One failure is enough. A course whose file 404s will 404 every pan.
      state.failed.add(slug);
    } finally {
      state.inflight.delete(slug);
    }
  }

  /** Load whatever the current viewport is looking at, if we're close enough. */
  function sweep() {
    const map = state.map;
    if (map.getZoom() < ZOOM_IN) return;
    const b = map.getBounds();
    const [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    for (const box of state.boxes) {
      if (box.maxx < w || box.minx > e || box.maxy < s || box.miny > n) continue;
      // Touch on re-entry so an on-screen course isn't the next one evicted.
      if (state.loaded.has(box.slug)) {
        const fs = state.loaded.get(box.slug);
        state.loaded.delete(box.slug);
        state.loaded.set(box.slug, fs);
        continue;
      }
      ensure(box.slug);
    }
  }

  // ── layers ──────────────────────────────────────────────────────────────

  /**
   * The stack, bottom to top. Order is the cartography: ground, then turf by
   * how short it's cut, then the hard edges (sand, water), then the marks a
   * human made (paths, routing). Nothing here is interactive — clicks belong to
   * the property polygon and the pin, both of which sit above this.
   */
  function addLayers(map, before) {
    const add = (spec) => map.addLayer(spec, before);

    /* The wash. This is what makes the rest legible: a flat turf value over the
     * property at 0.86 leaves just enough of the aerial's texture to read as
     * ground, and kills the photographic noise — parked cars, shadows, tile
     * seams — that every drawn line would otherwise have to compete with.
     *
     * Only for courses the manifest calls plan-ready. Washing a course we have
     * nothing to draw on top of would replace a good photograph with a green
     * blob, which is strictly worse. */
    add({
      id: "plan-wash",
      type: "fill",
      source: "polys",
      // Matches nothing until install() has the manifest and can say which
      // courses have a course mapped.
      filter: ["==", ["get", "facilitySlug"], " "],
      paint: { "fill-color": TURF.wash, "fill-opacity": fade(0, 0.88) },
    });

    add({
      id: "plan-wood",
      type: "fill",
      source: "plan",
      filter: isClass("wood"),
      paint: { "fill-color": TURF.wood, "fill-opacity": fade(0, 0.85) },
    });

    add({
      id: "plan-rough",
      type: "fill",
      source: "plan",
      filter: isAnyClass("rough", "range"),
      paint: { "fill-color": TURF.rough, "fill-opacity": fade(0, 0.9) },
    });

    add({
      id: "plan-fairway",
      type: "fill",
      source: "plan",
      filter: isClass("fairway"),
      paint: { "fill-color": TURF.fairway, "fill-opacity": fade(0, 0.94) },
    });

    add({
      id: "plan-tee",
      type: "fill",
      source: "plan",
      filter: isClass("tee"),
      paint: { "fill-color": TURF.tee, "fill-opacity": fade(0, 0.95) },
    });

    /* Dry penalty areas, under the water so a pond inside a staked area still
     * reads as a pond. Held deliberately quiet — a low fill and a dashed edge,
     * because the stakes are the boundary and the ground inside them is just
     * ground. The dash is the drawing convention for a line you may cross. */
    add({
      id: "plan-penalty",
      type: "fill",
      source: "plan",
      filter: isClass("penalty"),
      paint: { "fill-color": TURF.penalty, "fill-opacity": fade(0, 0.5) },
    });
    add({
      id: "plan-penalty-edge",
      type: "line",
      source: "plan",
      filter: isClass("penalty"),
      paint: {
        "line-color": TURF.penaltyEdge,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.7, 17, 1.6],
        "line-opacity": fade(0, 0.7),
        "line-dasharray": [2, 2],
      },
    });

    /* Water gets a lit edge. On a dark ground a flat navy shape is just a hole
     * in the map; the pale shoreline is what says "this is a surface". */
    add({
      id: "plan-water",
      type: "fill",
      source: "plan",
      filter: isClass("water"),
      paint: { "fill-color": TURF.water, "fill-opacity": fade(0, 0.94) },
    });
    add({
      id: "plan-water-edge",
      type: "line",
      source: "plan",
      filter: isClass("water"),
      paint: {
        "line-color": TURF.waterEdge,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.5, 17, 1.3],
        "line-opacity": fade(0, 0.65),
      },
    });
    add({
      id: "plan-stream",
      type: "line",
      source: "plan",
      filter: isClass("stream"),
      paint: {
        "line-color": TURF.water,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, 4],
        "line-opacity": fade(0, 0.9),
      },
    });

    /* Bunkers. The brightest fill on the map, with a dark casing — the same
     * treatment a printed course guide uses, and for the same reason: sand is
     * how you navigate a hole you have never played. */
    add({
      id: "plan-bunker",
      type: "fill",
      source: "plan",
      filter: isAnyClass("bunker", "sand"),
      paint: { "fill-color": TURF.sand, "fill-opacity": fade(0, 0.95) },
    });
    add({
      id: "plan-bunker-edge",
      type: "line",
      source: "plan",
      filter: isAnyClass("bunker", "sand"),
      paint: {
        "line-color": TURF.sandEdge,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.4, 18, 1.4],
        "line-opacity": fade(0, 0.9),
      },
    });

    add({
      id: "plan-green",
      type: "fill",
      source: "plan",
      filter: isClass("green"),
      paint: { "fill-color": TURF.green, "fill-opacity": fade(0, 0.95) },
    });
    add({
      id: "plan-green-edge",
      type: "line",
      source: "plan",
      filter: isClass("green"),
      paint: {
        "line-color": TURF.greenEdge,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.5, 18, 1.6],
        "line-opacity": fade(0, 0.8),
      },
    });

    add({
      id: "plan-path",
      type: "line",
      source: "plan",
      filter: isClass("path"),
      minzoom: 14.5,
      paint: {
        "line-color": TURF.path,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14.5, 0.5, 18, 1.8],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 14.5, 0, 16, 0.5],
      },
    });

    /* The routing. Tee to green, dashed, in the site accent — the one layer
     * that is not terrain and must never be read as terrain. The dash is what
     * makes it a line of play rather than a wall. */
    add({
      id: "plan-hole",
      type: "line",
      source: "plan",
      filter: isClass("hole"),
      paint: {
        "line-color": TURF.hole,
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.9, 15, 1.5, 18, 2.6],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], ZOOM_IN, 0, 14.2, 0.75],
        "line-dasharray": [3, 2.5],
      },
    });

    /* Hole numbers, mid-corridor. Par joins them a zoom level later — at 15 the
     * number alone is all there's room for, and a two-line label at that size
     * collides with its own neighbours. */
    add({
      id: "plan-hole-label",
      type: "symbol",
      source: "plan",
      filter: ["all", isClass("hole"), ["has", "ref"]],
      minzoom: 14.4,
      layout: {
        "symbol-placement": "line-center",
        "text-field": [
          "step",
          ["zoom"],
          ["get", "ref"],
          15.6,
          [
            "case",
            ["has", "par"],
            ["format", ["get", "ref"], { "font-scale": 1.0 }, "\n", {}, ["concat", "PAR ", ["get", "par"]], { "font-scale": 0.62 }],
            ["get", "ref"],
          ],
        ],
        "text-font": ["Open Sans Semibold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 14.4, 10, 17, 15],
        "text-letter-spacing": 0.04,
        "text-allow-overlap": false,
        "text-padding": 3,
      },
      paint: {
        "text-color": TOKENS.cream0,
        "text-halo-color": TOKENS.ink0,
        "text-halo-width": 1.5,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 14.4, 0, 15, 0.95],
      },
    });

    return "plan-wash";
  }

  // ── public ──────────────────────────────────────────────────────────────

  /**
   * @param map     a loaded MapLibre map that already has the `polys` source
   * @param polys   the course-polygon FeatureCollection, for viewport tests
   * @param before  layer id to insert beneath — the pins
   */
  async function install(map, polys, before, onChange) {
    state.map = map;
    state.onChange = onChange ?? null;

    map.addSource("plan", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    addLayers(map, before);

    // Bounding box per course, so "what's on screen" is arithmetic rather than
    // a render query — the query would depend on paint opacity, which is zero
    // for most of the band we care about.
    state.boxes = polys.features.map((f) => {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const ring of f.geometry.coordinates) {
        for (const [x, y] of ring) {
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
      }
      return { slug: f.properties.facilitySlug, minx, miny, maxx, maxy };
    });

    try {
      const res = await fetch("/data/holes/index.json");
      state.manifest = res.ok ? await res.json() : {};
    } catch {
      state.manifest = {};
    }

    // Only courses with a real course mapped get the photo washed out.
    const planSlugs = Object.entries(state.manifest)
      .filter(([, v]) => v.plan)
      .map(([k]) => k);
    map.setFilter("plan-wash", ["in", ["get", "facilitySlug"], ["literal", planSlugs]]);
    // Courses with no file at all never enter the sweep.
    state.boxes = state.boxes.filter((b) => state.manifest[b.slug]);

    map.on("moveend", sweep);
    sweep();
  }

  /** "aerial" hides the drawing and gives the photograph back, unchanged.
   *  Useful for exactly one thing, but it is the thing: checking the drawing. */
  function setMode(mode) {
    state.mode = mode;
    if (!state.map) return;
    const on = mode === "plan";
    for (const id of state.map.getStyle().layers.map((l) => l.id)) {
      if (id.startsWith("plan-")) {
        state.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
      }
    }
  }

  /**
   * What is actually drawn right now, for the legend.
   *
   * Asked of the renderer rather than computed from the manifest. Bounding
   * boxes overlap — Rustic Canyon's and Moorpark's do — so summing the
   * manifest over "boxes intersecting the viewport" reported 45 holes on a
   * screen showing one 18-hole course. A legend that miscounts what you can see
   * is worse than no legend.
   *
   * Deduped by course and hole number because MapLibre tiles its GeoJSON
   * sources internally and returns a hole once per tile it crosses.
   */
  function visibleSummary() {
    // The legend renders during boot, before install() has a map to ask.
    if (!state.map || state.map.getZoom() < ZOOM_IN) return null;
    if (!state.map.getLayer("plan-hole")) return null;

    const seen = new Set();
    for (const f of state.map.queryRenderedFeatures({ layers: ["plan-hole"] })) {
      seen.add(`${f.properties.slug}|${f.properties.ref ?? f.id}`);
    }
    const drawn = state.map.queryRenderedFeatures({ layers: ["plan-green", "plan-fairway", "plan-bunker"] }).length;
    return drawn || seen.size ? { features: drawn, holes: seen.size } : null;
  }

  return { install, setMode, visibleSummary, ZOOM_IN, ZOOM_FULL, get mode() { return state.mode; } };
})();
