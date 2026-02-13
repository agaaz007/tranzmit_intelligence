export interface AmplitudeEvent {
  event_type: string;
  event_time: string; // "2024-01-15 10:30:00.000000"
  event_properties: Record<string, unknown>;
  user_properties: Record<string, unknown>;
  user_id: string | null;
  device_id: string;
  session_id: number; // Amplitude session IDs are epoch ms timestamps
  amplitude_id: number;
  event_id: number;
  platform: string;
  os_name: string;
  os_version: string;
  device_type: string;
  device_model: string;
  country: string;
  city: string;
  region: string;
  ip_address: string;
  language: string;
  library: string;
  $insert_id: string;
  // URL tracking
  event_properties_page_url?: string;
  // Amplitude auto-tracked properties use [Amplitude] prefix in event_properties
}

export interface AmplitudeSession {
  sessionId: number;
  userId: string;
  deviceId: string;
  events: AmplitudeEvent[];
  startTime: number;
  endTime: number;
  platform: string;
  osName: string;
  deviceType: string;
  country: string;
}

export interface AmplitudeExportParams {
  apiKey: string;
  secretKey: string;
  start: string; // YYYYMMDDTHH
  end: string;   // YYYYMMDDTHH
}
