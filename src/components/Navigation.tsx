import React from "react";
import { t } from "../i18n";

export type NavTab = "feed" | "liked" | "playlists";

const FeedIcon = () => (
  <svg
    viewBox="0 0 18 18"
    fill="currentColor"
    aria-hidden="true"
    width="16"
    height="16"
  >
    <rect x="2" y="3" width="14" height="2.5" rx="1.2" />
    <rect x="2" y="7.75" width="10" height="2.5" rx="1.2" />
    <rect x="2" y="12.5" width="12" height="2.5" rx="1.2" />
  </svg>
);

const HeartIcon = () => (
  <svg
    viewBox="0 0 18 18"
    fill="currentColor"
    aria-hidden="true"
    width="16"
    height="16"
  >
    <path d="M9 15.2C8.6 14.9 2 10.8 2 6.6 2 4.1 3.8 2.5 6 2.5c1.4 0 2.5.8 3 1.6.5-.8 1.6-1.6 3-1.6 2.2 0 4 1.6 4 4.1 0 4.2-6.6 8.3-7 8.6Z" />
  </svg>
);

const ListIcon = () => (
  <svg
    viewBox="0 0 18 18"
    fill="currentColor"
    aria-hidden="true"
    width="16"
    height="16"
  >
    <rect x="2" y="3" width="2.5" height="2.5" rx="0.8" />
    <rect x="6" y="3.5" width="10" height="1.5" rx="0.75" />
    <rect x="2" y="7.75" width="2.5" height="2.5" rx="0.8" />
    <rect x="6" y="8.25" width="10" height="1.5" rx="0.75" />
    <rect x="2" y="12.5" width="2.5" height="2.5" rx="0.8" />
    <rect x="6" y="13" width="10" height="1.5" rx="0.75" />
  </svg>
);

interface TabDef {
  id: NavTab;
  labelKey: string;
  icon: React.ReactElement;
}

const TABS: TabDef[] = [
  { id: "feed", labelKey: "tab_feed", icon: <FeedIcon /> },
  { id: "liked", labelKey: "tab_liked", icon: <HeartIcon /> },
  { id: "playlists", labelKey: "tab_sets", icon: <ListIcon /> },
];

interface Props {
  active: NavTab;
  onChange: (tab: NavTab) => void;
}

export function Navigation({ active, onChange }: Props) {
  return (
    <nav className="sc-nav" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={`sc-nav__tab${active === tab.id ? " sc-nav__tab--active" : ""}`}
          onClick={() => onChange(tab.id)}
        >
          <span className="sc-nav__icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="sc-nav__label">{t(tab.labelKey)}</span>
        </button>
      ))}
    </nav>
  );
}
