import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock3, Compass, Route, Sun, TreePine } from 'lucide-react';
import heroImage from '../assets/hero.png';
import Input from '../Components/Input';
import { useTrip } from '../state/useTrip';
import './Landing.css';

const HIGHLIGHTS = [
  { icon: Route, title: 'Real routes', copy: 'OpenRouteService driving geometry, distance and duration.' },
  { icon: Sun, title: 'Tracked sun', copy: 'The sun is sampled at every point of the road, as you drive.' },
  { icon: Compass, title: 'One clear answer', copy: 'Left or right — whichever seat keeps the sun off you.' },
];

export default function Landing() {
  const { planTrip, status, error, trip } = useTrip();
  const navigate = useNavigate();
  const location = useLocation();
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [localError, setLocalError] = useState('');

  // The notice is shown once — it is then cleared from the history entry so a
  // reload does not bring it back.
  useEffect(() => {
    if (!location.state?.notice) return;
    setNotice(location.state.notice);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const submitting = status === 'loading';
  const shownError = submitting ? '' : error || localError;

  const handleSubmit = async (values) => {
    setLocalError('');
    try {
      await planTrip(values);
      navigate('/route');
    } catch {
      // The failure message is already stored in the trip context and shown in the card.
    }
  };

  return (
    <div className="landing">
      <div
        className="landing-hero"
        style={{ backgroundImage: `url(${heroImage})` }}
        role="img"
        aria-label="Night-time park with a large green tree, a winding road and a city skyline"
      >
        <div className="landing-scrim" aria-hidden="true" />

        <div className="landing-inner">
          <div className="landing-copy">
            <p className="landing-badge">
              <TreePine size={15} aria-hidden="true" /> Shade-aware travel
            </p>
            <h1 className="landing-title">Sit In Shade</h1>
            <p className="landing-subtitle">Find the shade. Travel comfortably.</p>
            <p className="landing-lede">
              Tell us where you are going and when. We follow the real driving route,
              track the sun across every segment, and recommend the seat that stays
              in the shade the whole way.
            </p>

            <ul className="landing-highlights">
              {HIGHLIGHTS.map(({ icon: Icon, title, copy }) => (
                <li key={title}>
                  <span className="hl-icon"><Icon size={17} aria-hidden="true" /></span>
                  <span>
                    <strong>{title}</strong>
                    <em>{copy}</em>
                  </span>
                </li>
              ))}
            </ul>

            {trip && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => navigate('/route')}
              >
                <Clock3 size={16} aria-hidden="true" />
                Open your last trip
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="landing-planner">
            {notice && (
              <p className="landing-notice" role="status">{notice}</p>
            )}
            <Input
              onSubmit={handleSubmit}
              defaults={trip?.query}
              submitting={submitting}
              error={shownError}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
