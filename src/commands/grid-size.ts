export function parseGridSize(value: string | number | undefined) {
  const gridSize = Number(value);

  if (!Number.isInteger(gridSize) || gridSize < 3 || gridSize % 2 !== 1) {
    console.error(`Invalid grid size: ${value}. Expected an odd integer >= 3.`);
    process.exit(1);
  }

  return gridSize;
}
