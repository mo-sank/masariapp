/**
 * Trading components barrel.
 *
 * One import point for the trading feature's presentational pieces (the stock
 * detail chart and its controls) so the stock/[symbol] route and later trade
 * screens can pull what they need without reaching into individual files.
 */
export {
  barsToPoints,
  indexToX,
  nearestBarIndex,
  pointsToPolyline,
  priceDomain,
  priceToY,
  tradeMarkers,
  type ChartBar,
  type ChartLayout,
  type ChartMarker,
  type ChartPoint,
  type MarkerInput,
  type PriceDomain,
} from './chart-geometry';
export { LineChart, type LineChartProps } from './line-chart';
export {
  OrderConfirmation,
  priceSourceLabel,
  type OrderConfirmationProps,
} from './order-confirmation';
export { OrderTicket, type OrderTicketProps } from './order-ticket';
export { QuantityStepper, type QuantityStepperProps } from './quantity-stepper';
export { CHART_RANGES, RangeToggle, type RangeToggleProps } from './range-toggle';
export { RationaleChips, type RationaleChipsProps } from './rationale-chips';
export { ReflectionSheet, type ReflectionSheetProps } from './reflection-sheet';
export { TradeHistoryList, type TradeHistoryListProps } from './trade-history-list';
export { TradeButton, TRADE_UNLOCK_LESSON_ID, type TradeButtonProps } from './trade-button';
