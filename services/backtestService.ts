export interface TradeLogEvent {
    type: 'ENTRY' | 'EXIT' | 'INFO' | 'TRADE_OPEN' | 'TRADE_CLOSE';
    time: number;
    price?: number;
    equity: number;
    message: string;
    profit?: number;
    profitPercent?: number;
    direction?: 'LONG' | 'SHORT';
}
