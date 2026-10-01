import { DEFAULT_FPS, DEFAULT_GRID_SIZE, DEFAULT_SIZE } from './constants.js';
import { Attribute, LivePicLayoutTracking, LivePicOffscreenBehavior } from './types.js';

const LAYOUT_TRACKING_VALUES: readonly LivePicLayoutTracking[] = ['static', 'frame'];
const OFFSCREEN_BEHAVIOR_VALUES: readonly LivePicOffscreenBehavior[] = ['pause', 'continue'];

export const ATTRIBUTES: Attribute[] = [
  { name: 'size', type: 'number', defaultValue: DEFAULT_SIZE, positive: true },
  {
    name: 'gridSize',
    type: 'number',
    defaultValue: DEFAULT_GRID_SIZE,
    integer: true,
    min: 3,
    odd: true,
  },
  { name: 'sprite', type: 'string', required: true, aliases: ['spriteSrc'] },
  { name: 'placeholder', type: 'string' },
  { name: 'fps', type: 'number', defaultValue: DEFAULT_FPS, positive: true },
  {
    name: 'layoutTracking',
    type: 'string',
    defaultValue: 'static',
    values: LAYOUT_TRACKING_VALUES,
  },
  {
    name: 'offscreenBehavior',
    type: 'string',
    defaultValue: 'pause',
    values: OFFSCREEN_BEHAVIOR_VALUES,
  },
];
