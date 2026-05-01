import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
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
          {/* Brand / logo */}
          <NavLink to="/" className={styles.brand} onClick={close}>
            MTG Swapper
          </NavLink>

          {/* ── Desktop links ───────────────────────────────────────── */}
          <ul className={styles.links}>
            <li>
              <NavLink to="/" end className={navLinkClass}>
                My Collection
              </NavLink>
            </li>
            <li>
              <NavLink to="/search" className={navLinkClass}>
                Search
              </NavLink>
            </li>
            <li>
              <NavLink to="/scan" className={navLinkClass}>
                Scan
              </NavLink>
            </li>
            <li>
              <NavLink to="/offers" className={navLinkClass}>
                Offers
              </NavLink>
            </li>
          </ul>

          {/* Desktop user section */}
          <div className={styles.userSection}>
            {user && <span className={styles.username}>{user.username}</span>}
            <button
              type="button"
              onClick={handleLogout}
              className={styles.logoutBtn}
            >
              Log out
            </button>
          </div>

          {/* ── Hamburger (mobile) ──────────────────────────────────── */}
          <button
            type="button"
            aria-label={isOpen ? "Close menu" : "Open menu"}
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

      {/* ── Mobile dropdown ─────────────────────────────────────────── */}
      {isOpen && (
        <div id="mobile-menu" className={styles.mobileMenu}>
          <NavLink to="/" end className={mobileNavLinkClass} onClick={close}>
            My Collection
          </NavLink>
          <NavLink to="/search" className={mobileNavLinkClass} onClick={close}>
            Search
          </NavLink>
          <NavLink to="/scan" className={mobileNavLinkClass} onClick={close}>
            Scan
          </NavLink>
          <NavLink to="/offers" className={mobileNavLinkClass} onClick={close}>
            Offers
          </NavLink>

          <div className={styles.mobileUser}>
            {user && (
              <span className={styles.mobileUsername}>{user.username}</span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className={styles.mobileLogoutBtn}
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
