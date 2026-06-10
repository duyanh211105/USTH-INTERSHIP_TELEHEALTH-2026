import { Loader2, Video } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getAppointmentVideoRoom } from '../services/telehealthApi.js';
import Button from './Button.jsx';

function parseAppointmentStart(appointment) {
  if (!appointment?.scheduledDate || !appointment?.scheduledTime) {
    return null;
  }

  const date = String(appointment.scheduledDate).slice(0, 10);
  const time = String(appointment.scheduledTime).slice(0, 5);
  const value = new Date(`${date}T${time}:00Z`);

  return Number.isNaN(value.getTime()) ? null : value;
}

export function getVideoCallWindowState(appointment, now = new Date()) {
  if (appointment?.status !== 'CONFIRMED') {
    return {
      isVisible: false,
      isAvailable: false,
      helper: 'Video call is available only for confirmed appointments.',
    };
  }

  const startsAt = parseAppointmentStart(appointment);
  if (!startsAt) {
    return {
      isVisible: true,
      isAvailable: false,
      helper: 'Video call will be available 15 minutes before the confirmed appointment time.',
    };
  }

  const availableFrom = new Date(startsAt.getTime() - 15 * 60 * 1000);
  const availableUntil = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const isAvailable = now >= availableFrom && now <= availableUntil;

  return {
    isVisible: true,
    isAvailable,
    helper: isAvailable
      ? 'Video call is available only for confirmed appointments.'
      : 'Video call will be available 15 minutes before the confirmed appointment time.',
  };
}

export default function VideoCallButton({ appointment, showToast, className = '' }) {
  const [isLoading, setIsLoading] = useState(false);
  const state = useMemo(() => getVideoCallWindowState(appointment), [appointment]);

  if (!state.isVisible) {
    return null;
  }

  async function handleJoinVideoCall() {
    if (!appointment?.id || !state.isAvailable || isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      const videoRoom = await getAppointmentVideoRoom(appointment.id);
      window.open(videoRoom.videoRoomUrl, '_blank', 'noopener,noreferrer');
      showToast?.('Video call room opened.', 'success');
    } catch (error) {
      showToast?.(error.message || 'Unable to open video call room.', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <Button disabled={!state.isAvailable || isLoading} onClick={handleJoinVideoCall} variant="success">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Video className="h-4 w-4" aria-hidden="true" />
        )}
        {isLoading ? 'Opening video call...' : 'Join Video Call'}
      </Button>
      <p className="text-xs font-medium text-slate-500">{state.helper}</p>
    </div>
  );
}
