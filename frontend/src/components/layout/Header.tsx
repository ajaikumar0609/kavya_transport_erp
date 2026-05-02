import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import { enterpriseNavConfig, NAV_CONFIG, type HeaderNavRole } from './nav/navConfig';
import { getRoleHomePage } from '@/utils/roleRouting';
import {
  Bell, Search, Settings, LogOut, User,
  ChevronDown, X, ChevronRight, Home
} from 'lucide-react';

type Crumb = { label: string; path: string; isLast: boolean };

const GROUP_LABEL_OVERRIDES: Record<string, string> = {
  'Fleet Manager': 'Fleet',
};

const toCrumbLabel = (s: string) => s
  .split(/[-_]/g)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const matchRoute = (pathname: string, routePath: string) =>
  pathname === routePath || pathname.startsWith(routePath + '/');

const buildBreadcrumbs = (pathname: string, homePath: string): Crumb[] => {
  const crumbs: Crumb[] = [{ label: 'Home', path: homePath, isLast: false }];

  if (pathname === homePath || pathname === '/dashboard') {
    return [...crumbs, { label: 'Dashboard', path: homePath, isLast: true }];
  }

  let bestGroupLabel: string | null = null;
  let bestGroupPath: string | null = null;
  let bestItemLabel: string | null = null;
  let bestItemPath: string | null = null;
  let bestMatchLen = 0;

  enterpriseNavConfig.forEach((group) => {
    if (group.path && matchRoute(pathname, group.path) && group.path.length > bestMatchLen) {
      bestGroupLabel = group.label;
      bestGroupPath = group.path;
      bestItemLabel = null;
      bestItemPath = null;
      bestMatchLen = group.path.length;
    }
    (group.items || []).forEach((item) => {
      if (matchRoute(pathname, item.path) && item.path.length > bestMatchLen) {
        bestGroupLabel = group.label;
        bestGroupPath = group.path || item.path;
        bestItemLabel = item.label;
        bestItemPath = item.path;
        bestMatchLen = item.path.length;
      }
    });
  });

  if (bestGroupLabel) {
    crumbs.push({
      label: GROUP_LABEL_OVERRIDES[bestGroupLabel] || bestGroupLabel,
      path: bestGroupPath || '/dashboard',
      isLast: !bestItemLabel,
    });
    if (bestItemLabel) {
      const itemLabel = bestGroupLabel === 'Fleet Manager'
        ? String(bestItemLabel ?? '').replace(/^Fleet\s+/, '')
        : String(bestItemLabel ?? '');
      crumbs.push({ label: itemLabel, path: bestItemPath || pathname, isLast: true });
    }
    if (crumbs.length > 0) {
      crumbs[crumbs.length - 1].isLast = true;
    }
    return crumbs;
  }

  const pathSegments = pathname.split('/').filter(Boolean);
  const fallback = pathSegments.map((seg, idx) => ({
    label: toCrumbLabel(seg),
    path: '/' + pathSegments.slice(0, idx + 1).join('/'),
    isLast: idx === pathSegments.length - 1,
  }));
  if (fallback.length > 0) {
    fallback[fallback.length - 1].isLast = true;
  }
  return [...crumbs, ...fallback];
};

const resolveRole = (rawRole?: string): HeaderNavRole => {
  const normalized = (rawRole || '').toUpperCase();
  if (normalized === 'MANAGER') return 'MANAGER';
  if (normalized === 'FLEET_MANAGER') return 'FLEET_MANAGER';
  if (normalized === 'ACCOUNTANT') return 'ACCOUNTANT';
  if (normalized === 'FINANCE_MANAGER') return 'FINANCE_MANAGER';
  if (normalized === 'PROJECT_ASSOCIATE' || normalized === 'PROJECT_ASSOCIATES') return 'PROJECT_ASSOCIATES';
  if (normalized === 'DRIVER') return 'DRIVER';
  if (normalized === 'PUMP_OPERATOR') return 'PUMP_OPERATOR';
  if (normalized === 'AUDITOR') return 'AUDITOR';
  if (normalized === 'TYRE_INSPECTOR') return 'TYRE_INSPECTOR';
  if (normalized === 'CLERK') return 'CLERK';
  return 'ADMIN';
};

export default function Header() {
  const { user, logout } = useAuthStore();
  const { notifications, unreadCount } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [openTab, setOpenTab] = useState<string | null>(null);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfile(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenTab(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const homePath = getRoleHomePage(user?.roles?.[0]);
  const breadcrumbs = buildBreadcrumbs(location.pathname, homePath);
  const userRole = resolveRole((user as any)?.role || user?.roles?.[0]);
  const sections = NAV_CONFIG[userRole]?.sections ?? [];

  const handleSectionClick = (label: string, route?: string, hasDropdown?: boolean) => {
    if (hasDropdown && route) {
      navigate(route);
      setOpenTab(null);
      return;
    }
    setOpenTab(openTab === label ? null : label);
  };

  return (
    <header className="bg-white border-b border-gray-200/80 flex-shrink-0 overflow-visible relative z-40">
      <style>{`nav[aria-label="Main navigation"]{display:none!important;}`}</style>
      <div className="h-14 flex items-center justify-between px-6">
        {/* Left: Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          <nav className="breadcrumb">
            <button onClick={() => navigate(homePath)} className="text-gray-400 hover:text-primary-600 transition-colors">
              <Home size={15} />
            </button>
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.path}-${crumb.label}-${index}`} className="flex items-center gap-1.5">
                <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />
                {crumb.isLast ? (
                  <span className="text-gray-900 font-semibold text-sm truncate max-w-[200px]">{crumb.label}</span>
                ) : (
                  <button
                    onClick={() => navigate(crumb.path)}
                    className="text-gray-500 hover:text-primary-600 transition-colors text-sm truncate max-w-[150px]"
                  >
                    {crumb.label}
                  </button>
                )}
              </span>
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
        {/* Search */}
        <div className={`relative transition-all duration-200 ${searchFocused ? 'w-80' : 'w-64'} hidden md:block`}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search jobs, LR, trips..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="pl-9 pr-8 py-2 w-full text-sm bg-gray-50 border border-gray-200 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 focus:bg-white
              transition-all duration-200 placeholder:text-gray-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Bell size={19} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-dropdown border border-gray-100 z-50 animate-slide-up">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-sm">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-xs text-primary-600 font-medium">{unreadCount} new</span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    <Bell size={24} className="mx-auto mb-2 text-gray-300" />
                    No notifications
                  </div>
                ) : (
                  notifications.slice(0, 10).map((notif) => (
                    <div key={notif.id} className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${!notif.is_read ? 'bg-primary-50/30' : ''}`}>
                      <p className="text-sm font-medium text-gray-900 leading-snug">{notif.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">
                        {new Date((notif.created_at) ?? 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <div className="p-2.5 border-t border-gray-100">
                  <button className="w-full text-xs text-primary-600 hover:text-primary-700 font-semibold py-1.5 rounded-lg hover:bg-primary-50 transition-colors"
                    onClick={() => { setShowNotifications(false); navigate('/settings/notifications'); }}
                  >
                    View all notifications
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-200 mx-1" />

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2.5 pl-2 pr-1.5 py-1 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center ring-2 ring-primary-100">
              <span className="text-white text-xs font-bold">
                {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="hidden lg:block text-left">
              <p className="text-sm font-semibold text-gray-800 leading-tight">{user?.full_name}</p>
              <p className="text-[10px] text-gray-400 capitalize font-medium">
                {user?.roles?.[0]?.replace('_', ' ')}
              </p>
            </div>
            <ChevronDown size={14} className="hidden lg:block text-gray-400" />
          </button>

          {showProfile && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-dropdown border border-gray-100 z-50 animate-slide-up">
              <div className="p-3 border-b border-gray-100">
                <p className="font-semibold text-gray-900 text-sm">{user?.full_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
              </div>
              <div className="p-1.5">
                <button
                  onClick={() => { setShowProfile(false); navigate('/profile'); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <User size={16} className="text-gray-400" /> Profile
                </button>
                <button
                  onClick={() => { setShowProfile(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <Settings size={16} className="text-gray-400" /> Settings
                </button>
                <hr className="my-1.5 border-gray-100" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut size={16} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      </div>

      <div className="h-12 border-t border-gray-100 px-6 overflow-visible relative z-40">
        <div ref={navRef} className="h-full flex items-center gap-1 overflow-visible relative z-40">
          {sections.map((section, sectionIndex) => (
            <div key={`section-${sectionIndex}-${section.label}`} className="relative">
              {(() => {
                const singleItem = section.items.length === 1 ? section.items[0] : undefined;
                const hasDropdown = section.items.length > 1;
                return (
              <button
                type="button"
                onClick={() => handleSectionClick(section.label, singleItem?.route, !hasDropdown)}
                className={`header-nav-tab group inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-transparent transform-gpu transition-all duration-200 ${
                  openTab === section.label
                    ? 'header-nav-tab-open text-blue-700'
                    : 'text-gray-700 hover:text-blue-900'
                }`}
              >
                <span>{section.label}</span>
                {hasDropdown && (
                  <ChevronDown
                    size={14}
                    className={`transition-all duration-200 ${openTab === section.label ? 'rotate-180 text-blue-600' : 'text-gray-400 group-hover:text-blue-700'}`}
                  />
                )}
              </button>
                );
              })()}

              {section.items.length > 1 && openTab === section.label && (
                <div
                  className={`absolute top-full z-[9999] bg-white rounded-xl shadow-2xl border border-gray-100 py-3 mt-2 max-w-[calc(100vw-2rem)] overflow-x-auto ${
                    sectionIndex >= sections.length - 3 ? 'right-0' : 'left-0'
                  }`}
                >
                  <div className="px-4 pb-2 mb-1 border-b border-gray-100">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {section.label}
                    </span>
                  </div>

                  {section.items.length > 5 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 min-w-[280px] sm:min-w-[520px]">
                      {section.items.map((item, idx) => (
                        <Link
                          key={`${section.label}-${item.label}-${idx}`}
                          to={item.route}
                          onClick={() => setOpenTab(null)}
                          className={`flex items-start gap-3 px-4 py-2.5 transition-colors group ${
                            location.pathname.startsWith(item.route) ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            location.pathname.startsWith(item.route)
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-100 text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600'
                          }`}>
                            <span className="text-xs font-bold">{item.label.charAt(0)}</span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={`text-sm font-medium leading-tight ${
                              location.pathname.startsWith(item.route)
                                ? 'text-blue-600'
                                : 'text-gray-800 group-hover:text-blue-600'
                            }`}>
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="text-xs text-gray-400 mt-0.5 leading-tight">{item.description}</span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="min-w-[280px]">
                      {section.items.map((item, idx) => (
                        <Link
                          key={`${section.label}-${item.label}-${idx}`}
                          to={item.route}
                          onClick={() => setOpenTab(null)}
                          className={`flex items-start gap-3 px-4 py-2.5 transition-colors group ${
                            location.pathname.startsWith(item.route) ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            location.pathname.startsWith(item.route)
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-100 text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600'
                          }`}>
                            <span className="text-xs font-bold">{item.label.charAt(0)}</span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className={`text-sm font-medium leading-tight ${
                              location.pathname.startsWith(item.route)
                                ? 'text-blue-600'
                                : 'text-gray-800 group-hover:text-blue-600'
                            }`}>
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="text-xs text-gray-400 mt-0.5 leading-tight">{item.description}</span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
