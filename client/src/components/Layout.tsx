import type { LucideIcon } from 'lucide-react';
import { BookOpen, Bot, ChevronDown, LayoutDashboard, LogOut, Menu, Moon, Settings, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { STAFF_ROLES, useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import type { Role } from '../types/api';
import { Avatar } from './Avatar';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Workspace',
    items: [
      { to: '/overview', label: 'Overview', icon: LayoutDashboard, roles: STAFF_ROLES },
      { to: '/assistant', label: 'AI Assistant', icon: Bot },
      { to: '/knowledge', label: 'Knowledge Base', icon: BookOpen, roles: STAFF_ROLES },
    ],
  },
  { title: 'Account', items: [{ to: '/settings', label: 'Settings', icon: Settings }] },
];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrator',
  SUPPORT_AGENT: 'Support agent',
  CUSTOMER: 'Customer',
};

function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar name={user.name} size="sm" />
        <span className="user-menu-name">{user.name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open ? (
        <div className="menu" role="menu">
          <div className="menu-header">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <Link to="/settings" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Settings size={16} aria-hidden="true" /> Account settings
          </Link>
          <button type="button" className="menu-item" role="menuitem" onClick={() => void handleSignOut()}>
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function Layout() {
  const { user } = useAuth();
  const { resolved, toggle } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (!user) return null;

  const visible = (item: NavItem) => !item.roles || item.roles.includes(user.role);

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Bot size={18} />
          </span>
          <span className="brand-text">
            <span className="brand-name">Support Desk</span>
            <span className="brand-sub">AI customer support</span>
          </span>
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
          {NAV_SECTIONS.map((section) => {
            const items = section.items.filter(visible);
            if (items.length === 0) return null;
            return (
              <div key={section.title} className="nav-section">
                <span className="nav-section-title">{section.title}</span>
                {items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} className="nav-link">
                    <Icon size={18} aria-hidden="true" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <span>
            Signed in as <strong>{ROLE_LABEL[user.role].toLowerCase()}</strong>
          </span>
        </div>
      </aside>

      {menuOpen ? <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" /> : null}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="topbar-spacer" />
          <button
            type="button"
            className="icon-button"
            onClick={toggle}
            aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={resolved === 'dark' ? 'Light theme' : 'Dark theme'}
          >
            {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <UserMenu />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
