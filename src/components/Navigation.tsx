import React from "react";
import { t } from "../i18n";

export type NavTab = "feed" | "search" | "liked" | "playlists" | "settings";

const FeedIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    width="14"
    height="14"
  >
    <rect x="1" y="2" width="14" height="2.2" rx="1.1" />
    <rect x="1" y="6.9" width="10" height="2.2" rx="1.1" />
    <rect x="1" y="11.8" width="12" height="2.2" rx="1.1" />
  </svg>
);

const SearchIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    width="14"
    height="14"
  >
    <path d="M7 1a6 6 0 1 0 3.73 10.73l2.77 2.77a.75.75 0 1 0 1.06-1.06l-2.77-2.77A6 6 0 0 0 7 1zm-4.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0z" />
  </svg>
);

const HeartIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    width="14"
    height="14"
  >
    <path d="M1.69 2.68A4.27 4.27 0 0 1 8 3.86a4.27 4.27 0 0 1 6.31-.02 4.6 4.6 0 0 1 .01 6.44L8.54 16a.75.75 0 0 1-1.08 0L1.68 9.12a4.6 4.6 0 0 1 .01-6.44z" />
  </svg>
);

const ListIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    width="14"
    height="14"
  >
    <rect x="1" y="2" width="2.2" height="2.2" rx="0.7" />
    <rect x="5" y="2.5" width="10" height="1.2" rx="0.6" />
    <rect x="1" y="6.9" width="2.2" height="2.2" rx="0.7" />
    <rect x="5" y="7.4" width="10" height="1.2" rx="0.6" />
    <rect x="1" y="11.8" width="2.2" height="2.2" rx="0.7" />
    <rect x="5" y="12.3" width="10" height="1.2" rx="0.6" />
  </svg>
);

const GearIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="currentColor"
    aria-hidden="true"
    width="14"
    height="14"
  >
    <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z" />
  </svg>
);

interface TabDef {
  id: NavTab;
  label: string;
  icon: React.ReactElement;
}

const TABS: TabDef[] = [
  { id: "feed", label: t("tab_feed"), icon: <FeedIcon /> },
  { id: "search", label: t("tab_search"), icon: <SearchIcon /> },
  { id: "liked", label: t("tab_liked"), icon: <HeartIcon /> },
  { id: "playlists", label: t("tab_sets"), icon: <ListIcon /> },
  { id: "settings", label: t("tab_settings"), icon: <GearIcon /> },
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
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
