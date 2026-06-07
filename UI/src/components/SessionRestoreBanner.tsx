import type { SavedSession } from '../types/index.js';

interface SessionRestoreBannerProps {
  session:   SavedSession;
  onRestore: (s: SavedSession) => void;
  onDismiss: () => void;
}

export function SessionRestoreBanner({ session, onRestore, onDismiss }: SessionRestoreBannerProps) {
  const userLabel = session.users.length === 1
    ? session.users[0]
    : `${session.users[0]} +${session.users.length - 1} more`;

  return (
    <div className="session-banner" role="status">
      <p className="session-banner__text">
        Resume last session: <strong>{userLabel}</strong>
        {' '}&middot;{' '}
        <strong>{session.startDate}</strong> to <strong>{session.endDate}</strong>
      </p>
      <div className="session-banner__actions">
        <button
          type="button"
          className="session-banner__btn session-banner__btn--restore"
          onClick={() => onRestore(session)}
        >
          Restore
        </button>
        <button
          type="button"
          className="session-banner__btn session-banner__btn--dismiss"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
