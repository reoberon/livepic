export type LivePicLayoutTracking = 'static' | 'frame';

export type LivePicOptions = {
  size: number;
  gridSize: number;
  sprite: string;
  fps: number;
  layoutTracking: LivePicLayoutTracking;
  placeholder?: string;
};

export type LivePicInit = Pick<LivePicOptions, 'sprite'> & Partial<Omit<LivePicOptions, 'sprite'>>;

type BaseAttribute = {
  name: string;
  required?: boolean;
  deprecated?: boolean;
  replaces?: string;
  aliases?: string[];
};

export type NumberAttribute = BaseAttribute & {
  type: 'number';
  defaultValue?: number;
  integer?: boolean;
  min?: number;
  positive?: boolean;
  odd?: boolean;
};

export type StringAttribute = BaseAttribute & {
  type: 'string';
  defaultValue?: string;
  values?: readonly string[];
};

export type Attribute = StringAttribute | NumberAttribute;

export type Coordinate = {
  x: number;
  y: number;
};

export type ImageLoadStatus = 'loaded' | 'aborted' | 'failed' | 'loading' | 'not_started';
