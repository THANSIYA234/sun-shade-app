import { Sun, Sunrise } from 'lucide-react';
import './Result.css';
import { BUCKET_LABELS, BUCKET_ORDER } from './Buckets';
import { formatDistance, formatDuration, formatDateTime, formatPct, sideKey } from '../lib/format';
import { explainRecommendation } from '../lib/exposure';

/**
 * The sun-exposure breakdown for a trip: the five distance-weighted buckets,
 * the recommended side and why it was picked.
 */
export default function Result({ results, onReset, actionLabel = 'New search' }) {
  const {
    preferred,
    distanceMeters,
    durationSeconds,
    startPoint,
    endPoint,
    time,
  } = results;

  const recommendedKey = sideKey(preferred);

  const when = formatDateTime(time);

  const tripLength = [formatDistance(distanceMeters), formatDuration(durationSeconds)]
    .filter(Boolean)
    .join(' · ');

  const explanation = explainRecommendation(results);

  const barLabel = BUCKET_ORDER.map(
    (bucket) => `${BUCKET_LABELS[bucket]} ${formatPct(results[bucket])}`,
  ).join(', ');

  return (
    <div className="result" role="region" aria-label="Sun exposure result">
      <header>
        {startPoint && endPoint && (
          <p className="eyebrow">{startPoint} → {endPoint}</p>
        )}
        <h2>
          {recommendedKey === 'Either' ? (
            <span className="pref recommend-Either">Either side works</span>
          ) : (
            <>
              Sit on the{' '}
              <span className={`pref recommend-${recommendedKey}`}>{preferred}</span>
            </>
          )}
        </h2>
        {when && <p className="when">{when}</p>}
        {tripLength && <p className="when">{tripLength}</p>}
      </header>

      <div className="bar" role="img" aria-label={barLabel}>
        {BUCKET_ORDER.map((bucket) => (
          <div
            key={bucket}
            className={`seg seg-${bucket}`}
            style={{ width: `${results[bucket]}%` }}
          />
        ))}
      </div>

      <ul className="legend">
        {BUCKET_ORDER.map((bucket) => (
          <li key={bucket}>
            <span className={`dot dot-${bucket}`} />
            {BUCKET_LABELS[bucket]}: <strong>{formatPct(results[bucket])}</strong>
          </li>
        ))}
      </ul>

      <p className="explain">
        <Sunrise size={15} aria-hidden="true" />
        {explanation}
      </p>

      {onReset && (
        <div className="actions">
          <button type="button" onClick={onReset}>
            <Sun size={15} aria-hidden="true" /> {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
