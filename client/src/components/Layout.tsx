import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  Bot,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { STAFF_ROLES, useAuth } from '../auth/AuthContext';
import type { Role } from '../types/api';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
  /** Planned sections whose backend does not exist yet. Shown disabled, never as working. */
  planned?: boolean;
}

const NAV: NavItem[] = [
  { to: '/overview', label: 'Overview', icon: LayoutDashboard, roles: STAFF_ROLES },
  { to: '/tickets', label: 'Support Tickets', icon: Ticket, roles: STAFF_ROLES, planned: true },
  { to: '/assistant', label: 'AI Assistant', icon: Bot },
  { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen, roles: STAFF_ROLES },
  { to: '/customers', label: 'Customers', icon: Users, roles: STAFF_ROLES, planned: true },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: STAFF_ROLES, planned: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  SUPPORT_AGENT: 'Support agent',
  CUSTOMER: 'Customer',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer after navigating.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (!user) return null;

  const items = NAV.filter((item) => !item.roles || item.roles.includes(user.role));
  const current = items.find((item) => location.pathname.startsWith(item.to));

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Bot size={18} />
          </span>
          <span className="brand-name">Support Desk</span>
          <button
            type="button"
            className="icon-button sidebar-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="nav">
          {items.map(({ to, label, icon: Icon, planned }) =>
            planned ? (
              <span key={to} className="nav-link is-planned" aria-disabled="true" title="Not available yet">
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
                <span className="nav-soon">Soon</span>
              </span>
            ) : (
              <NavLink key={to} to={to} className="nav-link">
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ),
          )}
        </nav>

        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {initials(user.name)}
          </span>
          <span className="sidebar-user-text">
            <span className="sidebar-user-name">{user.name}</span>
            <span className="sidebar-user-role">{ROLE_LABEL[user.role]}</span>
          </span>
          <button type="button" className="icon-button" onClick={handleSignOut} aria-label="Sign out" title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {menuOpen ? <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" /> : null}

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <h1 className="topbar-title">{current?.label ?? 'Support Desk'}</h1>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
