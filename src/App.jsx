import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TripProvider } from './state/TripProvider';
import { useTrip } from './state/useTrip';
import Landing from './pages/Landing';
import RouteOverview from './pages/RouteOverview';
import TripDetails from './pages/TripDetails';
import './App.css';

/**
 * Pages that show a calculated trip need one. Without it (a refresh on a deep
 * link, for example) the visitor is sent back to the planner with a notice
 * rather than being shown an empty or invented route.
 */
function RequireTrip({ children }) {
  const { hasTrip } = useTrip();

  if (!hasTrip) {
    return (
      <Navigate
        to="/"
        replace
        state={{
          notice:
            'No active trip found — plan a new route to see the map and sun analysis.',
        }}
      />
    );
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <TripProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/route"
            element={
              <RequireTrip>
                <RouteOverview />
              </RequireTrip>
            }
          />
          <Route
            path="/details"
            element={
              <RequireTrip>
                <TripDetails />
              </RequireTrip>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </TripProvider>
    </BrowserRouter>
  );
}
