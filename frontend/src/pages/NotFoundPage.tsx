import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@/hooks';
import styles from './NotFoundPage.module.scss';

export function NotFoundPage() {
  const { t } = useTranslation();
  usePageTitle(t('notFound.title'));

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.code} aria-hidden="true">404</span>
        <h1 className={styles.title}>{t('notFound.title')}</h1>
        <p className={styles.message}>{t('notFound.message')}</p>
        <Link to="/" className={styles.homeLink}>
          {t('notFound.homeLink')}
        </Link>
      </div>
    </main>
  );
}
