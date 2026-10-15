'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ROLE_VALUES, TOP_ROLE_CONFIG, TOP_STRINGS, type Role } from '../../../config/strings/top';
import { RoleStore } from '../../lib/roleStore';
import styles from './RoleSwitch.module.css';

/**
 * 役割の切替（発注者・投稿者）。役割はブラウザに保存し、この画面の表示の切り替えにだけ使う。
 * 初回の描画は既定の役割で行い、保存された役割は描画の後に読む（表示のずれを防ぐ）。
 */
export function RoleSwitch() {
  const [role, setRole] = useState<Role>(TOP_ROLE_CONFIG.defaultRole);

  useEffect(() => {
    setRole(new RoleStore().read());
  }, []);

  const choose = (next: Role): void => {
    setRole(next);
    new RoleStore().write(next);
  };

  const current = TOP_STRINGS.roles[role];

  return (
    <section className={styles.section} aria-labelledby="role-heading">
      <h2 id="role-heading" className={styles.heading}>
        {TOP_STRINGS.roleHeading}
      </h2>
      <p className={styles.notice}>{TOP_STRINGS.roleNotice}</p>
      <div className={styles.options} role="group" aria-label={TOP_STRINGS.roleGroupLabel}>
        {ROLE_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            className={value === role ? styles.optionActive : styles.option}
            aria-pressed={value === role}
            onClick={() => choose(value)}
          >
            {TOP_STRINGS.roles[value].label}
          </button>
        ))}
      </div>
      <p>{current.description}</p>
      <h3 className={styles.subheading}>{TOP_STRINGS.linksHeading}</h3>
      <ul className={styles.links}>
        {current.links.map((link) => (
          <li key={link.href}>
            <Link className={styles.link} href={link.href}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
