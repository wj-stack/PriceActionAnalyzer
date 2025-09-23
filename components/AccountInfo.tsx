import React from 'react';
import type { AccountBalance, Order } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { KeyIcon } from './icons/KeyIcon';

interface AccountInfoProps {
    balances: AccountBalance[];
    openOrders: Order[];
    allOrders: Order[];
    isLoading: boolean;
    error: string | null;
    hasApiKeys: boolean;
    onAddKeys: () => void;
    onRefresh: () => void;
}

const OrderRow: React.FC<{ order: Order, t: (key: string) => string }> = ({ order, t }) => {
    const isBuy = order.side === 'BUY';
    const sideColor = isBuy ? 'text-green-400' : 'text-red-400';
    const statusColors: Record<Order['status'], string> = {
        'NEW': 'text-blue-400',
        'PARTIALLY_FILLED': 'text-yellow-400',
        'FILLED': 'text-green-400',
        'CANCELED': 'text-gray-500',
        'PENDING_CANCEL': 'text-yellow-600',
        'REJECTED': 'text-red-500',
        'EXPIRED': 'text-gray-600'
    };

    return (
        <tr className="border-b border-gray-700 text-xs">
            <td className="p-2">{new Date(order.time).toLocaleString()}</td>
            <td className="p-2">{order.symbol}</td>
            <td className="p-2">{order.type}</td>
            <td className={`p-2 font-semibold ${sideColor}`}>{order.side}</td>
            <td className="p-2">{parseFloat(order.price) > 0 ? parseFloat(order.price).toFixed(4) : 'Market'}</td>
            <td className="p-2">{parseFloat(order.origQty).toFixed(4)}</td>
            <td className="p-2">${parseFloat(order.cummulativeQuoteQty).toFixed(2)}</td>
            <td className={`p-2 font-semibold ${statusColors[order.status] || 'text-gray-300'}`}>{order.status}</td>
        </tr>
    );
};

export const AccountInfo: React.FC<AccountInfoProps> = ({ balances, openOrders, allOrders, isLoading, error, hasApiKeys, onAddKeys, onRefresh }) => {
    const { t } = useLanguage();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
            </div>
        );
    }
    
    if (!hasApiKeys) {
        return (
            <div className="flex flex-col items-center justify-center text-center h-full text-gray-500 p-4">
                <KeyIcon className="w-12 h-12 mb-4 text-gray-600" />
                <p className="mb-4">{t('addApiKeysPrompt')}</p>
                <button 
                    onClick={onAddKeys} 
                    className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-md transition-colors"
                >
                    {t('addKeys')}
                </button>
            </div>
        )
    }
    
    if (error) {
        return (
            <div className="p-4 text-center text-red-400 bg-red-500/10 border border-red-500/30 rounded-md">
                <p>{t('accountError')}</p>
                <p className="text-xs text-red-500/80 mb-4">{error}</p>
                <button 
                    onClick={onRefresh}
                    className="px-4 py-2 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-md transition-colors"
                >
                    {t('refresh')}
                </button>
            </div>
        );
    }


    return (
        <div className="space-y-6 text-sm">
            {/* Balances */}
            <div>
                <h4 className="font-semibold text-gray-200 mb-2">{t('balances')}</h4>
                <div className="overflow-auto max-h-48 bg-gray-900/50 p-2 rounded-md">
                    {balances.length > 0 ? (
                        <table className="w-full text-left">
                            <thead className="text-xs text-gray-400 uppercase">
                                <tr>
                                    <th className="p-2">{t('asset')}</th>
                                    <th className="p-2 text-right">{t('total')}</th>
                                    <th className="p-2 text-right">{t('available')}</th>
                                    <th className="p-2 text-right">{t('inOrder')}</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                {balances.map(b => (
                                    <tr key={b.asset} className="border-t border-gray-700">
                                        <td className="p-2 font-semibold">{b.asset}</td>
                                        <td className="p-2 text-right">{(parseFloat(b.free) + parseFloat(b.locked)).toFixed(6)}</td>
                                        <td className="p-2 text-right">{parseFloat(b.free).toFixed(6)}</td>
                                        <td className="p-2 text-right">{parseFloat(b.locked).toFixed(6)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-gray-500 text-center p-4">{t('noBalances')}</p>
                    )}
                </div>
            </div>

            {/* Open Orders */}
            <div>
                <h4 className="font-semibold text-gray-200 mb-2">{t('openOrders')}</h4>
                <div className="overflow-auto max-h-48 bg-gray-900/50 p-2 rounded-md">
                    {openOrders.length > 0 ? (
                         <table className="w-full text-left">
                            <thead className="text-xs text-gray-400 uppercase">
                                <tr>
                                    <th className="p-2">{t('orderDate')}</th>
                                    <th className="p-2">{t('orderPair')}</th>
                                    <th className="p-2">{t('orderType')}</th>
                                    <th className="p-2">{t('orderSide')}</th>
                                    <th className="p-2">{t('orderPrice')}</th>
                                    <th className="p-2">{t('orderAmount')}</th>
                                    <th className="p-2">{t('orderTotal')}</th>
                                    <th className="p-2">{t('orderStatus')}</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                {openOrders.map(o => <OrderRow key={o.orderId} order={o} t={t} />)}
                            </tbody>
                        </table>
                    ) : (
                         <p className="text-gray-500 text-center p-4">{t('noOpenOrders')}</p>
                    )}
                </div>
            </div>

            {/* Order History */}
            <div>
                <h4 className="font-semibold text-gray-200 mb-2">{t('orderHistory')}</h4>
                <div className="overflow-auto max-h-48 bg-gray-900/50 p-2 rounded-md">
                    {allOrders.length > 0 ? (
                         <table className="w-full text-left">
                            <thead className="text-xs text-gray-400 uppercase">
                                <tr>
                                    <th className="p-2">{t('orderDate')}</th>
                                    <th className="p-2">{t('orderPair')}</th>
                                    <th className="p-2">{t('orderType')}</th>
                                    <th className="p-2">{t('orderSide')}</th>
                                    <th className="p-2">{t('orderPrice')}</th>
                                    <th className="p-2">{t('orderAmount')}</th>
                                    <th className="p-2">{t('orderTotal')}</th>
                                    <th className="p-2">{t('orderStatus')}</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-300">
                                {allOrders.map(o => <OrderRow key={o.orderId} order={o} t={t} />)}
                            </tbody>
                        </table>
                    ) : (
                         <p className="text-gray-500 text-center p-4">{t('noOrderHistory')}</p>
                    )}
                </div>
            </div>
        </div>
    );
};