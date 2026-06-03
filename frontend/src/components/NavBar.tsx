import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context";
import styles from "./NavBar.module.scss";

// NavLink automatically applies an "active" class when its route matches.
// We map that to our styles.active via the className callback prop.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.link} ${styles.active}` : styles.link;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.mobileLink} ${styles.active}` : styles.mobileLink;

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const { t, i18n } = useTranslation();

  const currentLang = i18n.language.startsWith("fr") ? "fr" : "en";

  function toggleLanguage() {
    void i18n.changeLanguage(currentLang === "en" ? "fr" : "en");
  }

  function close() {
    setIsOpen(false);
  }

  async function handleLogout() {
    close();
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <header>
      <nav className={styles.nav}>
        <div className={styles.inner}>
          <NavLink to="/" className={styles.brand} onClick={close}>
            MTG Swapper
          </NavLink>

          <ul className={styles.links}>
            <li>
              <NavLink to="/" end className={navLinkClass}>
                {t("nav.myCollection")}
              </NavLink>
            </li>
            <li>
              <NavLink to="/search" className={navLinkClass}>
                {t("nav.search")}
              </NavLink>
            </li>
            <li>
              <NavLink to="/scan" className={navLinkClass}>
                {t("nav.scan")}
              </NavLink>
            </li>
            <li>
              <NavLink to="/offers" className={navLinkClass}>
                {t("nav.offers")}
              </NavLink>
            </li>
            <li>
              <NavLink to="/about" className={navLinkClass}>
                {t("nav.about")}
              </NavLink>
            </li>
          </ul>

          <div className={styles.userSection}>
            <button
              type="button"
              onClick={toggleLanguage}
              className={styles.langToggle}
              aria-label={
                currentLang === "en" ? "Switch to French" : "Passer en anglais"
              }
            >
              {currentLang === "en" ? "FR" : "EN"}
            </button>
            {user && <span className={styles.username}>{user.username}</span>}
            <button
              type="button"
              onClick={handleLogout}
              className={styles.logoutBtn}
            >
              {t("nav.logOut")}
            </button>
          </div>

          <button
            type="button"
            aria-label={isOpen ? t("nav.closeMenu") : t("nav.openMenu")}
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
            onClick={() => setIsOpen((o) => !o)}
            className={`${styles.hamburger} ${isOpen ? styles.open : ""}`}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>

      {isOpen && (
        <div id="mobile-menu" className={styles.mobileMenu}>
          <NavLink to="/" end className={mobileNavLinkClass} onClick={close}>
            {t("nav.myCollection")}
          </NavLink>
          <NavLink to="/search" className={mobileNavLinkClass} onClick={close}>
            {t("nav.search")}
          </NavLink>
          <NavLink to="/scan" className={mobileNavLinkClass} onClick={close}>
            {t("nav.scan")}
          </NavLink>
          <NavLink to="/offers" className={mobileNavLinkClass} onClick={close}>
            {t("nav.offers")}
          </NavLink>
          <NavLink to="/about" className={mobileNavLinkClass} onClick={close}>
            {t("nav.about")}
          </NavLink>
          {user && (
            <span className={styles.mobileUsername}>{user.username}</span>
          )}
          <button
            type="button"
            onClick={toggleLanguage}
            className={styles.langToggle}
            aria-label={
              currentLang === "en" ? "Switch to French" : "Passer en anglais"
            }
          >
            {currentLang === "en" ? "FR" : "EN"}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className={styles.mobileLogoutBtn}
          >
            {t("nav.logOut")}
          </button>
        </div>
      )}
    </header>
  );
}
