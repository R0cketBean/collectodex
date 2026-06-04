import { describe, it, expect } from 'vitest';
import {
  shouldRunBackup,
  todayKey,
  DEFAULT_BACKUP_SETTINGS,
  BackupSettings,
} from './backupSettings';

const base: BackupSettings = {
  enabled: true,
  folder: '/tmp/backups',
  keep: 5,
};

describe('shouldRunBackup', () => {
  it('läuft, wenn aktiviert, Ordner gesetzt, Daten vorhanden und heute noch nicht gesichert', () => {
    expect(shouldRunBackup(base, '2026-06-04', true)).toBe(true);
  });

  it('läuft nicht, wenn deaktiviert', () => {
    expect(shouldRunBackup({ ...base, enabled: false }, '2026-06-04', true)).toBe(false);
  });

  it('läuft nicht ohne Ordner', () => {
    expect(shouldRunBackup({ ...base, folder: null }, '2026-06-04', true)).toBe(false);
  });

  it('läuft nicht ohne Daten', () => {
    expect(shouldRunBackup(base, '2026-06-04', false)).toBe(false);
  });

  it('läuft nicht, wenn heute bereits gesichert', () => {
    expect(
      shouldRunBackup({ ...base, lastBackup: '2026-06-04' }, '2026-06-04', true)
    ).toBe(false);
  });

  it('läuft wieder an einem neuen Tag', () => {
    expect(
      shouldRunBackup({ ...base, lastBackup: '2026-06-03' }, '2026-06-04', true)
    ).toBe(true);
  });

  it('Default-Einstellungen sind deaktiviert', () => {
    expect(DEFAULT_BACKUP_SETTINGS.enabled).toBe(false);
    expect(shouldRunBackup(DEFAULT_BACKUP_SETTINGS, '2026-06-04', true)).toBe(false);
  });
});

describe('todayKey', () => {
  it('formatiert als YYYY-MM-DD mit führenden Nullen', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(todayKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
