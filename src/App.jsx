// src/App.jsx
import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Link } from 'react-router-dom';
import styles from '@/App.module.css';

// Import providers and components
import { AuthProvider, useAuth } from '@/context/AuthContext.jsx';
import { TimerProvider } from '@/context/TimerContext.jsx';
import { signOut } from 'firebase/auth';
import { auth } from '@/firebaseConfig';
import ErrorBoundary from '@/components/ui/ErrorBoundary/ErrorBoundary';
import LoginPage from '@/pages/LoginPage/LoginPage';

// Main nav views — eagerly imported so React Router transitions are instant
import NowView from '@/pages/NowView/NowView';
import WeeklyView from '@/pages/WeeklyView/WeeklyView';
import DailyView from '@/pages/DailyView/DailyView';
import MonthlyView from '@/pages/MonthlyView/MonthlyView';
import YearlyView from '@/pages/YearlyView/YearlyView';
import ParetoView from '@/pages/ParetoView/ParetoView';
import LifeMapView from '@/pages/LifeMapView/LifeMapView';

// Public/demo pages — lazy is fine, they're rarely visited
const Welcome = React.lazy(() => import('@/pages/Welcome/Welcome.jsx'));
const Showcase = React.lazy(() => import('@/pages/Showcase/Showcase.jsx'));
const NowViewDemo = React.lazy(() => import('@/pages/NowView/NowViewDemo.jsx'));
const Contact = React.lazy(() => import('@/pages/Contact/Contact.jsx'));
const ParetoViewDemo = React.lazy(() => import('@/pages/ParetoView/ParetoViewDemo.jsx'));
const AIAdvisor = React.lazy(() => import('@/features/advisor/AIAdvisor/AIAdvisor'));

function AppLayout() {
    const { currentUser } = useAuth();
    const buttonStyle = { margin: '0.5rem', padding: '0.5rem 1rem', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#e7e7e7', transition: 'background-color 0.2s ease', fontSize: '0.9em', textDecoration: 'none', color: 'black' };
    const activeButtonStyle = { ...buttonStyle, backgroundColor: '#a0a0a0', fontWeight: 'bold', borderColor: '#888' };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    return (
        <div className={styles.appContainer}>
            {currentUser && (
                 <div style={{ marginBottom: '1rem', flexWrap: 'wrap', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', zIndex: 2000 }}>
                    <NavLink to="/life" style={({ isActive }) => isActive ? activeButtonStyle : buttonStyle}>Life Map</NavLink>
                    <NavLink to="/pareto" style={({ isActive }) => isActive ? activeButtonStyle : buttonStyle}>Pareto</NavLink>
                    <NavLink to="/yearly" style={({ isActive }) => isActive ? activeButtonStyle : buttonStyle}>Yearly</NavLink>
                    <NavLink to="/monthly" style={({ isActive }) => isActive ? activeButtonStyle : buttonStyle}>Monthly</NavLink>
                    <NavLink to="/weekly" style={({ isActive }) => isActive ? activeButtonStyle : buttonStyle}>Weekly</NavLink>
                    <NavLink to="/daily" style={({ isActive }) => isActive ? activeButtonStyle : buttonStyle}>Daily</NavLink>
                    <NavLink to="/now" end style={({ isActive }) => isActive ? activeButtonStyle : buttonStyle}>Now</NavLink>
                    {currentUser ? (
                        <button onClick={handleLogout} style={buttonStyle}>Logout</button>
                    ) : (
                        <Link to="/login" style={buttonStyle}>Login</Link>
                    )}
                </div>
            )}

            <div className={styles.contentArea}>
                <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Loading...</div>}>
                    <Routes>
                        {/* Public share paths. /demo is the portfolio entry and must stay reachable with no account. */}
                        <Route path="/" element={<ErrorBoundary><Welcome /></ErrorBoundary>} />
                        <Route path="/concepts" element={<ErrorBoundary><ParetoViewDemo /></ErrorBoundary>} />
                        <Route path="/showcase" element={<ErrorBoundary><Showcase /></ErrorBoundary>} />
                        <Route path="/demo" element={<ErrorBoundary><NowViewDemo /></ErrorBoundary>} />
                        <Route path="/contact" element={<ErrorBoundary><Contact /></ErrorBoundary>} />
                        <Route path="/now" element={<ErrorBoundary><NowView /></ErrorBoundary>} />
                        <Route path="/daily" element={<ErrorBoundary><DailyView /></ErrorBoundary>} />
                        <Route path="/weekly" element={<ErrorBoundary><WeeklyView /></ErrorBoundary>} />
                        <Route path="/monthly" element={<ErrorBoundary><MonthlyView /></ErrorBoundary>} />
                        <Route path="/yearly" element={<ErrorBoundary><YearlyView /></ErrorBoundary>} />
                        <Route path="/pareto" element={<ErrorBoundary><ParetoView /></ErrorBoundary>} />
                        <Route path="/life" element={<ErrorBoundary><LifeMapView /></ErrorBoundary>} />
                        <Route path="/login" element={<LoginPage />} />
                    </Routes>
                </Suspense>
            </div>
            {currentUser && (
                <Suspense fallback={null}>
                    <ErrorBoundary><AIAdvisor /></ErrorBoundary>
                </Suspense>
            )}
        </div>
    );
}

function App() {
  return (
    <AuthProvider>
        <TimerProvider>
            <Router>
                <AppLayout />
            </Router>
        </TimerProvider>
    </AuthProvider>
  );
}

export default App;