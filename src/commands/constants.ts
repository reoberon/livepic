export const DEFAULT_PICTURE_SIZE = 160;
export const DEFAULT_GRID_SIZE = 5;
export const DEFAULT_ROTATE_BOUND = 20;
export const DEFAULT_PUPIL_BOUND = 13;
export const DEFAULT_PHOTO_PREFIX = 'avatar';
export const DEFAULT_INPUT_FILE = 'input/photo.jpeg'; // heic will not work here
export const DEFAULT_CONCURRENCY = 5;
export const DEFAULT_PORT = 3000;

export const MODEL_VERSION_ID = (process.env.LIVEPIC_MODEL_VERSION ||
  'fofr/expression-editor:bf913bc90e1c44ba288ba3942a538693b72e8cc7df576f3beebe56adc0a92b86') as `${string}/${string}:${string}`;

export const SPRITE_FILE = 'output/AvatarSprite.webp';
export const SPRITE_META = 'output/sprite.json';
