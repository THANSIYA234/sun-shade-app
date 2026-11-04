# Sit In Shade

A React + Vite app that recommends the **shadier side** of a vehicle trip
(start → destination, at a given departure time) by tracking where the sun is
relative to the route as you drive.

## The three screens

| Route | Screen | What it shows |
|---|---|---|
| `/` | **Landing / trip planner** | The night-park hero and the glass trip-planning card (start, destination, departure time). |
| `/route` | **Route overview** | The dark Leaflet map with the real route, the A/B markers, the recommended-side highlight, the distance/duration/departure cards and the **View Details** button. |
| `/details` | **Sun & seating analysis** | Sun altitude/azimuth/heading, sunrise & sunset, the sun path across the trip, a vehicle–route–sun diagram, the recommended side with the reason, the exposure breakdown and the trip summary. |

The trip is calculated **once**, in `src/state/TripProvider.jsx`, and shared
through React Context (`src/state/tripStore.js` → `src/state/useTrip.js`).
Moving between the screens never re-requests the route. The trip is also kept
in `sessionStorage`, so a refresh shows the same real trip; opening `/route` or
`/details` without a trip redirects to the planner with a notice instead of
showing invented data.

## Source layout

```
src/
  pages/Landing.jsx        hero + trip planner (page 1)
  pages/RouteOverview.jsx  map, recommended side, route stats (page 2)
  pages/TripDetails.jsx    sun position, seating side, exposure, summary (page 3)
  state/TripProvider.jsx   the one place the route is calculated
  state/tripStore.js       context, session storage, derived sun data
  state/useTrip.js         hook for the pages
  Components/Input.jsx     the trip-planning card (validation, loading, chips)
  Components/Result.jsx    the sun-exposure breakdown panel
  Components/SunDiagram.jsx  vehicle / heading / sun diagram (SVG)
  Components/SunPathChart.jsx sun altitude across the trip (SVG)
  Components/Routes.js     ORS proxy client (unchanged)
  Components/SunCalc.js    the sun maths (unchanged, plus position helpers)
  Components/Buckets.js    the shared bucket palette
  MapView.jsx              the dark Leaflet map
```

## How it works

1. Geocode start/destination via OpenRouteService (ORS), through the local dev
   proxy. The proxy asks for several candidates and re-orders them by how well
   the place name and the surrounding place match the query.
2. Fetch the driving route polyline together with the distance and the duration
   ORS reports for it.
3. Split the polyline into segments and classify each one:
   - **When** you reach it. The sun is sampled at the segment's midpoint, and the
     clock advances along the route by the **duration ORS reported for the whole
     route**, so the sun moves as you drive instead of standing still for the
     whole trip. (If ORS reports no duration, the trip is timed at a fallback
     13.4 m/s — ~30 mph.)
   - **Where** it is. The sun's azimuth is converted to the north-based,
     clockwise-from-north convention and compared with the segment's travel
     bearing. The signed lateral angle puts the segment in one of **five
     buckets**:
     | Bucket | Condition | Meaning |
     |---|---|---|
     | `right` | `45° < lateral ≤ 135°` | sun on the right flank |
     | `left` | `-135° ≤ lateral < -45°` | sun on the left flank |
     | `front` | `\|lateral\| ≤ 45°` | sun ahead, on the windshield |
     | `back` | `\|lateral\| > 135°` | sun behind, on the rear window |
     | `dark` | sun altitude ≤ 0 | sun below the horizon |

     The two side cones are symmetric halves of 45°–135° off the travel axis.
4. **Weight by distance, not by vertex count.** Each bucket accumulates the
   metres of the segments in it, and every percentage is `bucket metres / total
   route metres`, so how densely the polyline happens to be sampled cannot move
   the answer. The five percentages always sum to 100.
5. **Recommend the side with less sun.** If the left and right shares differ by
   at least 10 percentage points, the app names the shadier side ("Sit on the
   Right side"); otherwise it says "Either side works".

## Known limitations

- **No shadow modelling.** Only the sun's *direction* is modelled. Buildings,
  trees, terrain and the real horizon are not, so a tree-lined street still
  reads as full sun. The app therefore never claims a shaded-route percentage;
  the details screen states this explicitly.
- **The ORS proxy is dev-only.** `vite/ors-proxy.js` runs inside Vite's dev
  server; `npm run build` produces a frontend with no backend behind it. To go
  live, mount the same handler on your host of choice (Express, Fastify,
  Cloudflare Worker, serverless, …) and point the frontend at that URL instead
  of `/api/ors`.
- **Geocoding is only as good as ORS's data.** The proxy asks for five
  candidates and re-orders them by how well the name and the surrounding
  place match the query, which fixes cases such as "Central Park, New York"
  resolving to a locality called Bethpage. Some place names simply are not in
  ORS's dataset under the spelling you type ("Times Square, New York" has no
  Manhattan entry — try "Times Square, Manhattan"), and foreign place names
  are stored in the local language ("Tour Eiffel" vs "Eiffel Tower").
- **No live traffic, no alternative routes.** Each search returns the single
  ORS route for the query — there is no traffic-aware routing and no way to
  compare alternative routes.
- **ORS free-tier quota.** The free tier allows 2000 requests per day and a
  single search spends several upstream requests. The only mitigation is the
  dev proxy's TTL cache (24 h for geocoding, 10 min for directions); once the
  quota is spent, ORS rejects further requests until the daily reset.
- **Timezone handling.** The departure time is currently read in the *browser's*
  timezone, so a trip entered from another zone is offset. The destination's
  own local time (approximated from the route's longitude — 4 minutes of solar
  time per degree) is not shown yet, and that approximation ignores daylight
  saving time and the destination's actual time zone. The sun times on the
  details screen are labelled with the viewer's timezone so the offset is
  visible.
- **Deep links need a trip.** `/route` and `/details` redirect to the planner
  when there is no calculated trip in the session, because there is nothing
  real to show.

## Setup

```bash
npm install
cp .env.example .env       # then put your ORS key into OPENROUTESERVICE_API_KEY
npm run dev
```

The ORS key is read **server-side** by the dev-time proxy at `vite/ors-proxy.js`.
The browser only ever talks to `/api/ors/*`, so the key never ships in the
client bundle.

Get a key at <https://openrouteservice.org/dev/#/signup>.

## Scripts

| Script            | Purpose                                     |
| ----------------- | ------------------------------------------- |
| `npm run dev`     | Start Vite + the ORS proxy middleware        |
| `npm run build`   | Production build                             |
| `npm run preview` | Serve the production build                   |
| `npm run lint`    | Lint JS                                      |
| `npm test`        | Run the unit tests (`vitest run`)            |

## Production note

`vite/ors-proxy.js` only runs under Vite's dev server. To go live, mount the
same handler on your host of choice (Express, Fastify, Cloudflare Worker, …)
and point the frontend at that URL instead of `/api/ors`.

The app uses the History API, so the host must serve `index.html` for
`/route` and `/details` (an SPA fallback rewrite).

## Stack

- React 19 + Vite 6
- React Router 7 (`/` → `/route` → `/details`)
- Lucide React (icons)
- Leaflet / react-leaflet (map + polyline, dark Stadia tiles)
- suncalc (sun azimuth / altitude)
- OpenRouteService (geocoding + driving directions)
- Vitest (unit tests for the sun math and the ORS response parsing)
