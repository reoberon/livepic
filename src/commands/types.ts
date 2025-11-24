import Replicate from 'replicate';

export type Step = {
  x: number;
  y: number;
  index: number;
  rotate_yaw: number;
  rotate_pitch: number;
  pupil_x: number;
  pupil_y: number;
  filename: string;
  crop_factor: number;
  output_quality: number;
};

export type GridSetup = {
  X_STEPS: number;
  Y_STEPS: number;
  ROTATE_BOUND: number;
  PUPIL_BOUND: number;
  PHOTO_PREFIX: string;
  FILE_NAME: string;
};

export type GenerateContext = {
  setup: GridSetup;
  replicate: Replicate;
  image: Buffer;
  outputDir: string;
};
