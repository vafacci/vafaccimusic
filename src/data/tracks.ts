/**
 * Track configuration for Visual Lab 01.
 * Replace the audio path with the first VAFACCI track when available.
 */
export type TrackSection = {
  type: string;
  start: number;
};

export type TrackConfig = {
  id: string;
  title: string;
  artist: string;
  audio: string;
  artwork?: string;
  world: string;
  sections: TrackSection[];
};

export const LAB_01_TRACK: TrackConfig = {
  id: "tusay-ft-facci",
  title: "TUSAY ft facci",
  artist: "VAFACCI",
  audio: "/audio/tusay-ft-facci.mp3",
  world: "lab-01",
  sections: [
    { type: "intro", start: 0 },
  ],
};
