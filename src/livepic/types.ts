export type LivePicOptions = {
  size: number;
  gridSize: number;
  sprite: string;
  spriteSrc?: string;
  fps: number;
  placeholder?: string;
};

type BaseAttribute = {
  name: string;
  type: 'string' | 'number';
  defaultValue?: string | number;
  required?: boolean;
  deprecated?: boolean;
  replaces?: string;
  aliases?: string[];
};

export type NumberAttribute = BaseAttribute & {
  type: 'number';
  defaultValue?: number;
};

export type StringAttribute = BaseAttribute & {
  type: 'string';
  defaultValue?: string;
};

export type Attribute = StringAttribute | NumberAttribute;

export type Coordinate = {
  x: number;
  y: number;
};

export type ImageLoadStatus = 'loaded' | 'aborted' | 'failed' | 'loading' | 'not_started';
