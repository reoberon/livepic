export type LivePicOptions = {
  size: number;
  gridSize: number;
  spriteSrc: string;
  fps: number;
};

export type NumberAttribute = {
  name: string;
  type: 'number';
  defaultValue?: number;
};

export type StringAttribute = {
  name: string;
  type: 'string';
  defaultValue?: string;
};

export type Attribute = StringAttribute | NumberAttribute;

export type Coordinate = {
  x: number;
  y: number;
};
