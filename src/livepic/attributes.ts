import { DEFAULT_FPS, DEFAULT_GRID_SIZE, DEFAULT_SIZE } from './constants.js';
import { Attribute } from './types.js';

export const ATTRIBUTES: Attribute[] = [
  { name: 'size', type: 'number', defaultValue: DEFAULT_SIZE },
  { name: 'gridSize', type: 'number', defaultValue: DEFAULT_GRID_SIZE },
  { name: 'sprite', type: 'string', required: true, aliases: ['spriteSrc'] },
  { name: 'placeholder', type: 'string' },
  { name: 'fps', type: 'number', defaultValue: DEFAULT_FPS },
];
