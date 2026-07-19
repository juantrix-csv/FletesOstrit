export const normalizeLocation = (value) => {
  if (!value || typeof value !== 'object') return value;
  const floor = Number.isInteger(value.floor) && value.floor >= 0 && value.floor <= 99
    ? value.floor
    : null;
  const hasElevator = floor != null && floor > 0 && value.hasElevator === true;
  return {
    ...value,
    floor,
    hasElevator,
    hasItemsThatDoNotFitElevator: hasElevator && value.hasItemsThatDoNotFitElevator === true,
  };
};

export const normalizeLocations = (values) => (
  Array.isArray(values) ? values.map(normalizeLocation) : []
);

export const isLocation = (value) => {
  if (
    !value
    || typeof value.address !== 'string'
    || !Number.isFinite(value.lat)
    || !Number.isFinite(value.lng)
  ) return false;
  if (value.floor != null && (!Number.isInteger(value.floor) || value.floor < 0 || value.floor > 99)) return false;
  if (value.hasElevator != null && typeof value.hasElevator !== 'boolean') return false;
  if (value.hasItemsThatDoNotFitElevator != null && typeof value.hasItemsThatDoNotFitElevator !== 'boolean') return false;
  if (value.hasItemsThatDoNotFitElevator === true && value.hasElevator !== true) return false;
  return true;
};

export const isLocationArray = (value) => Array.isArray(value) && value.every(isLocation);
