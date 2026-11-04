import { describe, it, expect } from 'vitest';
import SunCalc from 'suncalc';
import {
  FALLBACK_SPEED_MPS,
  SIDE_DECISION_MARGIN_PCT,
  SIDE_CONE_DEG,
  classifyLateral,
  getBearing,
  getSunExposure,
  getSunTimes,
  toNorthAzimuth,
  wrap180,
  wrap360,
} from './SunCalc.js';

const DELHI = { lat: 28.6139, lon: 77.209 };
const METRES_PER_DEG_LAT = 111_320;
const METRES_PER_DEG_LON = 111_320 * Math.cos((DELHI.lat * Math.PI) / 180);

/** Move metres east (positive) or west (negative) along the Delhi parallel. */
const eastWest = (metres) => [DELHI.lat, DELHI.lon + metres / METRES_PER_DEG_LON];

/** A straight route of `metres` starting at Delhi, heading east or west. */
const straightRoute = (metres, distanceMeters, durationSeconds) => ({
  coords: [
    [DELHI.lat, DELHI.lon],
    eastWest(metres),
  ],
  distanceMeters,
  durationSeconds,
});

const SOLAR_NOON = '2026-06-21T06:54:06Z';

describe('angle helpers', () => {
  it('wraps angles into [0,360) and (-180,180]', () => {
    expect(wrap360(370)).toBeCloseTo(10, 9);
    expect(wrap360(-10)).toBeCloseTo(350, 9);
    expect(wrap180(190)).toBeCloseTo(-170, 9);
    expect(wrap180(-190)).toBeCloseTo(170, 9);
  });

  it('converts suncalc south-based azimuth to north-based', () => {
    // Due south (suncalc azimuth 0) is 180° on the north-based compass.
    expect(toNorthAzimuth(0)).toBeCloseTo(180, 9);
    expect(toNorthAzimuth(Math.PI / 2)).toBeCloseTo(270, 9);
    expect(toNorthAzimuth(-Math.PI / 2)).toBeCloseTo(90, 9);
  });

  it('computes north-based bearings', () => {
    expect(getBearing(0, 0, 1, 0)).toBeCloseTo(0, 6);
    expect(getBearing(0, 0, 0, 1)).toBeCloseTo(90, 6);
    expect(getBearing(0, 0, -1, 0)).toBeCloseTo(180, 6);
    expect(getBearing(0, 0, 0, -1)).toBeCloseTo(270, 6);
  });

  it('classifies lateral angles into symmetric cones', () => {
    expect(SIDE_CONE_DEG).toBe(45);
    expect(classifyLateral(0)).toBe('front');
    expect(classifyLateral(45)).toBe('front');
    expect(classifyLateral(-45)).toBe('front');
    expect(classifyLateral(46)).toBe('right');
    expect(classifyLateral(135)).toBe('right');
    expect(classifyLateral(136)).toBe('back');
    expect(classifyLateral(-46)).toBe('left');
    expect(classifyLateral(-135)).toBe('left');
    expect(classifyLateral(-136)).toBe('back');
  });
});

describe('getSunExposure', () => {
  it('places the sun on the left of a westbound traveller at solar noon', () => {
    const westbound = straightRoute(-1000, 1000, 0);
    const exposure = getSunExposure(westbound, SOLAR_NOON);

    // At solar noon the sun is due south (180° north-based); heading west
    // (270°) puts it 90° to the traveller's left.
    expect(exposure.left).toBeCloseTo(100, 6);
    expect(exposure.right).toBeCloseTo(0, 6);
    expect(exposure.preferred).toBe('Right side');
  });

  it('places the sun on the right of an eastbound traveller at solar noon', () => {
    const eastbound = straightRoute(1000, 1000, 0);
    const exposure = getSunExposure(eastbound, SOLAR_NOON);

    expect(exposure.right).toBeCloseTo(100, 6);
    expect(exposure.left).toBeCloseTo(0, 6);
    expect(exposure.preferred).toBe('Left side');
  });

  it('recommends the shaded side, never the sunny side', () => {
    const exposure = getSunExposure(straightRoute(-1000, 1000, 0), SOLAR_NOON);

    expect(exposure.left).toBeGreaterThan(exposure.right);
    expect(exposure.preferred).not.toBe('Left side');
    expect(exposure.preferred).toBe('Right side');
  });

  it('weights percentages by distance, not by vertex count', () => {
    const coarse = getSunExposure(straightRoute(-1000, 1000, 0), SOLAR_NOON);

    const dense = [];
    for (let i = 0; i < 200; i += 1) {
      dense.push(eastWest((-1000 * i) / 199));
    }
    const fine = getSunExposure(
      { coords: dense, distanceMeters: 1000, durationSeconds: 0 },
      SOLAR_NOON,
    );

    expect(fine.left).toBeCloseTo(coarse.left, 3);
    expect(fine.right).toBeCloseTo(coarse.right, 3);
    expect(fine.front).toBeCloseTo(coarse.front, 3);
    expect(fine.back).toBeCloseTo(coarse.back, 3);
    expect(fine.dark).toBeCloseTo(coarse.dark, 3);
  });

  it('splits a route into front and back buckets', () => {
    const noonPosition = SunCalc.getPosition(new Date(SOLAR_NOON), DELHI.lat, DELHI.lon);
    const noonAzimuth = toNorthAzimuth(noonPosition.azimuth);

    const towardSun = [
      [DELHI.lat, DELHI.lon],
      [
        DELHI.lat + (1000 / METRES_PER_DEG_LAT) * Math.cos((noonAzimuth * Math.PI) / 180),
        DELHI.lon +
          (1000 / METRES_PER_DEG_LON) * Math.sin((noonAzimuth * Math.PI) / 180),
      ],
    ];
    const towardExposure = getSunExposure(
      { coords: towardSun, distanceMeters: 1000, durationSeconds: 0 },
      SOLAR_NOON,
    );
    expect(towardExposure.front).toBeGreaterThan(0);

    const awayFromSun = [
      towardSun[1],
      [
        DELHI.lat,
        DELHI.lon,
      ],
    ];
    const awayExposure = getSunExposure(
      { coords: awayFromSun, distanceMeters: 1000, durationSeconds: 0 },
      SOLAR_NOON,
    );
    expect(awayExposure.back).toBeGreaterThan(0);
  });

  it('reports a fully dark route at midnight', () => {
    const midnight = '2026-06-21T18:00:00Z'; // 23:30 local in Delhi
    const exposure = getSunExposure(straightRoute(-1000, 1000, 0), midnight);

    expect(exposure.dark).toBeCloseTo(100, 6);
    expect(exposure.isDark).toBe(true);
  });

  it('applies the decision margin before naming a side', () => {
    expect(SIDE_DECISION_MARGIN_PCT).toBe(10);

    // Two legs of 525 m and 475 m: a 5-point gap stays undecided.
    const nearTie = {
      coords: [
        [DELHI.lat, DELHI.lon],
        eastWest(-525),
        eastWest(-525 + 475),
      ],
      distanceMeters: 1000,
      durationSeconds: 0,
    };
    const tieExposure = getSunExposure(nearTie, SOLAR_NOON);
    expect(Math.abs(tieExposure.left - tieExposure.right)).toBeCloseTo(5, 6);
    expect(tieExposure.preferred).toBe('Either side');

    // Two legs of 650 m and 350 m: a 30-point gap picks a side.
    const clear = {
      coords: [
        [DELHI.lat, DELHI.lon],
        eastWest(-650),
        eastWest(-650 + 350),
      ],
      distanceMeters: 1000,
      durationSeconds: 0,
    };
    const clearExposure = getSunExposure(clear, SOLAR_NOON);
    expect(Math.abs(clearExposure.left - clearExposure.right)).toBeCloseTo(30, 6);
    expect(clearExposure.preferred).not.toBe('Either side');
  });

  it('advances the sun across the real route duration', () => {
    const noonPosition = SunCalc.getPosition(new Date(SOLAR_NOON), DELHI.lat, DELHI.lon);
    const noonAzimuth = toNorthAzimuth(noonPosition.azimuth);

    // Where the sun will be one hour after departure.
    const laterPosition = SunCalc.getPosition(
      new Date(new Date(SOLAR_NOON).getTime() + 3600 * 1000),
      DELHI.lat,
      DELHI.lon,
    );
    const laterAzimuth = toNorthAzimuth(laterPosition.azimuth);
    const azimuthShift = Math.abs(wrap180(laterAzimuth - noonAzimuth));
    expect(azimuthShift).toBeGreaterThan(10);

    // Aim the route at the sun's *later* position: only a trip whose duration
    // really is two hours samples the midpoint one hour after departure.
    const coords = [
      [DELHI.lat, DELHI.lon],
      [
        DELHI.lat +
          (1000 / METRES_PER_DEG_LAT) * Math.cos((laterAzimuth * Math.PI) / 180),
        DELHI.lon + (1000 / METRES_PER_DEG_LON) * Math.sin((laterAzimuth * Math.PI) / 180),
      ],
    ];

    const twoHours = getSunExposure(
      { coords, distanceMeters: 1000, durationSeconds: 7200 },
      SOLAR_NOON,
    );
    const fallback = getSunExposure(
      { coords, distanceMeters: 1000, durationSeconds: 0 },
      SOLAR_NOON,
    );

    expect(twoHours.front).toBeGreaterThan(0);
    expect(fallback.front).toBe(0);
    expect(twoHours.durationSeconds).toBe(7200);
    expect(fallback.durationSeconds).toBeCloseTo(1000 / FALLBACK_SPEED_MPS, 6);

    // The sampled azimuth moves by the route duration, not by the fallback speed.
    const sampledAt = (seconds) =>
      toNorthAzimuth(
        SunCalc.getPosition(
          new Date(new Date(SOLAR_NOON).getTime() + (seconds / 2) * 1000),
          DELHI.lat,
          DELHI.lon,
        ).azimuth,
      );
    const shift = Math.abs(
      wrap180(sampledAt(7200) - sampledAt(1000 / FALLBACK_SPEED_MPS)),
    );
    expect(shift).toBeGreaterThan(30);
  });

  it('falls back to the average driving speed when no duration is reported', () => {
    expect(FALLBACK_SPEED_MPS).toBe(13.4);
    const exposure = getSunExposure(
      { coords: straightRoute(-1000, 1000, 0).coords },
      SOLAR_NOON,
    );
    // Without a reported distance the route length is measured from the polyline.
    expect(exposure.durationSeconds).toBeCloseTo(
      exposure.distanceMeters / FALLBACK_SPEED_MPS,
      6,
    );
    expect(exposure.distanceMeters).toBeGreaterThan(990);
    expect(exposure.distanceMeters).toBeLessThan(1010);
  });

  it('returns a safe empty result for invalid input', () => {
    const empty = {
      left: 0,
      right: 0,
      front: 0,
      back: 0,
      dark: 100,
      preferred: 'Either side',
      isDark: true,
      distanceMeters: 0,
      durationSeconds: 0,
      segments: [],
    };

    expect(getSunExposure({ coords: [] }, '2026-06-21T12:00:00Z')).toEqual(empty);
    expect(getSunExposure({ coords: [[1, 1], [2, 2]] }, 'not-a-date')).toEqual(empty);
  });

  it('returns per-segment buckets with their polyline indices', () => {
    const exposure = getSunExposure(straightRoute(-1000, 1000, 0), SOLAR_NOON);

    expect(exposure.segments).toHaveLength(1);
    expect(exposure.segments[0]).toMatchObject({
      bucket: 'left',
      fromIndex: 0,
      toIndex: 1,
    });
    expect(exposure.segments[0].meters).toBeGreaterThan(900);
    expect(exposure.distanceMeters).toBe(1000);
    expect(exposure.left + exposure.right + exposure.front + exposure.back + exposure.dark).toBeCloseTo(100, 6);
  });
});

describe('getSunTimes', () => {
  it('returns sunrise, sunset and solar noon for the route midpoint', () => {
    const times = getSunTimes([[DELHI.lat, DELHI.lon]], new Date('2026-06-21T00:00:00Z'));

    expect(times.sunrise).toBeInstanceOf(Date);
    expect(times.sunset).toBeInstanceOf(Date);
    expect(times.solarNoon).toBeInstanceOf(Date);
    expect(times.solarNoon.toISOString()).toBe('2026-06-21T06:54:06.978Z');
    expect(times.sunrise.getTime()).toBeLessThan(times.solarNoon.getTime());
    expect(times.sunset.getTime()).toBeGreaterThan(times.solarNoon.getTime());
  });
});
