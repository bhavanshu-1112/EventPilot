import React from 'react';
import { useEvent } from '../../context/EventContext.js';

/**
 * Screen Reader Live Announcer
 * Provides aria-live="polite" and aria-live="assertive" regions.
 */
export const LiveAnnouncer: React.FC = () => {
  const { liveAnnouncement } = useEvent();

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {liveAnnouncement}
    </div>
  );
};
