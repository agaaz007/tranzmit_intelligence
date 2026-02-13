export interface MixpanelEvent {
  event: string;
  properties: {
    time: number;
    distinct_id: string;
    $insert_id?: string;
    $session_id?: string;
    $current_url?: string;
    $screen_width?: number;
    $screen_height?: number;
    mp_lib?: string;
    [key: string]: unknown;
  };
}

export interface MixpanelSession {
  sessionId: string;
  distinctId: string;
  events: MixpanelEvent[];
  startTime: number;
  endTime: number;
}
