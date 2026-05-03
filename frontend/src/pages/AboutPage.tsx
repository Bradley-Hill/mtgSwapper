import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "@/hooks";
import styles from "./AboutPage.module.scss";

export function AboutPage() {
  const { t } = useTranslation();
  usePageTitle(t("about.title"));

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t("about.title")}</h1>
          <p className={styles.intro}>{t("about.intro")}</p>
        </div>

        <div className={styles.sections}>
          {/* Getting Started */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("about.section1Title")}</h2>
            <p className={styles.sectionText}>{t("about.section1Intro")}</p>
            <ul className={styles.list}>
              <li>{t("about.section1Step1")}</li>
              <li>{t("about.section1Step2")}</li>
              <li>{t("about.section1Step3")}</li>
            </ul>
          </section>

          {/* Finding Cards */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("about.section2Title")}</h2>
            <p className={styles.sectionText}>{t("about.section2Intro")}</p>
            <ul className={styles.list}>
              <li>{t("about.section2Step1")}</li>
              <li>{t("about.section2Step2")}</li>
              <li>{t("about.section2Step3")}</li>
            </ul>
          </section>

          {/* Making an Offer */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("about.section3Title")}</h2>
            <p className={styles.sectionText}>{t("about.section3Intro")}</p>
            <ul className={styles.list}>
              <li>{t("about.section3Step1")}</li>
              <li>{t("about.section3Step2")}</li>
              <li>{t("about.section3Step3")}</li>
              <li>{t("about.section3Step4")}</li>
            </ul>
          </section>

          {/* Limitations */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t("about.section4Title")}</h2>
            <p className={styles.sectionText}>{t("about.section4Intro")}</p>
            <ul className={styles.list}>
              <li>{t("about.section4Point1")}</li>
              <li>{t("about.section4Point2")}</li>
              <li>{t("about.section4Point3")}</li>
            </ul>
          </section>
        </div>

        <Link to="/" className={styles.homeLink}>
          {t("about.homeLink")}
        </Link>
      </div>
    </main>
  );
}
