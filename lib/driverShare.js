export const DRIVER_OWNED_VEHICLE_COMPANY_HOURLY_MARGIN = 10000;

const roundMoney = (value) => Number(value.toFixed(2));

export const getDriverOwnedVehicleShare = ({
  hourlyBaseAmount,
  billedHours,
  companyHourlyMargin = DRIVER_OWNED_VEHICLE_COMPANY_HOURLY_MARGIN,
}) => {
  if (!Number.isFinite(hourlyBaseAmount) || !Number.isFinite(billedHours)) {
    return null;
  }
  const effectiveCompanyHourlyMargin = Number.isFinite(companyHourlyMargin) && companyHourlyMargin >= 0
    ? companyHourlyMargin
    : DRIVER_OWNED_VEHICLE_COMPANY_HOURLY_MARGIN;

  const companyShareAmount = roundMoney(Math.min(
    Math.max(0, hourlyBaseAmount),
    Math.max(0, billedHours) * effectiveCompanyHourlyMargin,
  ));
  const driverShareAmount = roundMoney(Math.max(0, hourlyBaseAmount - companyShareAmount));

  return {
    driverShareAmount,
    companyShareAmount,
    driverShareRatio: hourlyBaseAmount > 0 ? driverShareAmount / hourlyBaseAmount : 0,
  };
};
