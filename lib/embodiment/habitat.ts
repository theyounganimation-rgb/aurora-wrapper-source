import type { AuroraHabitatZoneName, EmbodimentVector3 } from "../types";

export const AURORA_ROOM_LAYOUT = {
  floorY: -0.8,
  width: 6.8,
  depth: 7.2,
  wallHeight: 3.1,
  carpetWidth: 5.3,
  carpetDepth: 6
} as const;

type HabitatZone = {
  position: EmbodimentVector3;
  yaw: number;
};

export const AURORA_ROOM_ZONES: Record<AuroraHabitatZoneName, HabitatZone> = {
  center: {
    position: { x: 0, y: 0, z: 0 },
    yaw: 0
  },
  desk: {
    position: { x: -2.05, y: -0.44, z: 1.08 },
    yaw: -1.08
  },
  couch: {
    position: { x: 2.18, y: -0.42, z: 0.82 },
    yaw: -1.26
  },
  bed: {
    position: { x: -0.22, y: -0.18, z: -2.14 },
    yaw: 0
  }
};
