import type Ably from "ably";

interface ConnectionBannerProps {
  connectionState: Ably.Types.ConnectionState;
}

const RECONNECTING_STATES: Ably.Types.ConnectionState[] = [
  "connecting",
  "disconnected",
  "suspended",
];

export function ConnectionBanner({ connectionState }: ConnectionBannerProps) {
  if (connectionState === "failed") {
    return (
      <div className="mb-6 rounded-2xl bg-red-600 px-4 py-3 text-center text-sm font-medium text-white shadow">
        Connection lost — refresh the page to reconnect.
      </div>
    );
  }

  if (RECONNECTING_STATES.includes(connectionState)) {
    return (
      <div className="mb-6 rounded-2xl bg-amber-500 px-4 py-3 text-center text-sm font-medium text-white shadow">
        Reconnecting…
      </div>
    );
  }

  return null;
}
