import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { WS_SERVERS, isProduction } from '@/components/shared/utils/config';
import { CONNECTION_STATUS, connectionStatus$ } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { manualTradeService } from './services/manual-trade-service';
import { TradeControls } from './components/trade-controls';
import { TradeHistory } from './components/trade-history';
import { ManualTraderAnalysisDashboard } from './components/analysis-dashboard';
import { ManualTraderDistributionPanels } from './components/distribution-dashboard';
import { ManualContractType, ManualMarketSymbol, ManualTradeRecord } from './types';
import './manual-trader.scss';

const TICK_WINDOW = 1000;
type TDigitTick = { quote: number; epoch: number; digit: number };
type TradeSide = 'over' | 'under';
type PayoutQuotes = { over: number | null; under: number | null };
type TradeResultHighlight = { digit: number; status: 'won' | 'lost'; profit: number; currency: string; key: string };
type TradeNotification = { status: 'won' | 'lost'; profit: number; currency: string; key: string };

const getLastDigit = (quote: number | string, precision?: number) => {
    const numericQuote = Number(quote);
    const quoteText = Number.isFinite(precision) ? numericQuote.toFixed(precision) : String(quote);
    const decimals = quoteText.split('.')[1] || '';
    return Number((decimals || quoteText).slice(-1));
};

const ManualTrader = () => {
    const [symbols, setSymbols] = useState<ManualMarketSymbol[]>([]);
    const [symbol, setSymbol] = useState('');
    const [contractType, setContractType] = useState<ManualContractType>('DIGITOVER');
    const [duration, setDuration] = useState(1);
    const [stake, setStake] = useState('0.00');
    const [prediction, setPrediction] = useState(5);
    const [digitTicks, setDigitTicks] = useState<TDigitTick[]>([]);
    const [selectedAnalysisWindow, setSelectedAnalysisWindow] = useState(1000);
    const analysisTicks = useMemo(() => digitTicks.slice(-selectedAnalysisWindow), [digitTicks, selectedAnalysisWindow]);
    const [tickConnection, setTickConnection] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    const [socketReady, setSocketReady] = useState(false);
    const [socketGeneration, setSocketGeneration] = useState(0);
    const [tickError, setTickError] = useState('');
    const [payoutQuotes, setPayoutQuotes] = useState<PayoutQuotes>({ over: null, under: null });
    const [buyingSide, setBuyingSide] = useState<TradeSide | null>(null);
    const [tradeError, setTradeError] = useState('');
    const [tradeResultHighlight, setTradeResultHighlight] = useState<TradeResultHighlight | null>(null);
    const [tradeNotification, setTradeNotification] = useState<TradeNotification | null>(null);
    const notificationTimer = useRef<number | null>(null);
    const completedContracts = useRef(new Set<number>());
    const recoveryStartedContracts = useRef(new Set<number>());
    const latestDigitTickRef = useRef<TDigitTick | null>(null);
    const lastLiveTickAtRef = useRef(0);
    const buyLock = useRef(false);
    const accountKey = String((api_base.account_info as any)?.loginid || 'guest');
    const historyStorageKey = `gtraders_manual_trader_history_${accountKey}`;
    const [trades, setTrades] = useState<ManualTradeRecord[]>(() => {
        try {
            return JSON.parse(window.sessionStorage.getItem(historyStorageKey) || '[]') as ManualTradeRecord[];
        } catch {
            return [];
        }
    });
    const [connection, setConnection] = useState(api_base.getConnectionStatus());
    const currency = String((api_base.account_info as any)?.currency || 'USD');

    const loadSymbols = useCallback(async () => {
        try {
            if (!api_base.api) return;
            const available = api_base.active_symbols.length ? api_base.active_symbols : await api_base.getActiveSymbols();
            const orderedMarkets = (available || [])
                // Manual Trader is intentionally restricted to Volatility Indices.
                // Do not load/display Forex, Crypto, Commodities, Boom/Crash, etc.
                .filter(
                    (item: any) =>
                        item.market === 'synthetic_index' &&
                        /^Volatility\b/i.test(String(item.display_name || '')) &&
                        item.exchange_is_open &&
                        !item.is_trading_suspended
                )
                .map((item: any) => ({
                    symbol: item.symbol,
                    display_name: item.display_name || item.symbol,
                    market: item.market,
                    exchange_is_open: item.exchange_is_open,
                    is_trading_suspended: item.is_trading_suspended,
                }))
                .sort((a: ManualMarketSymbol, b: ManualMarketSymbol) => {
                    const aIsVolatility = a.market === 'synthetic_index';
                    const bIsVolatility = b.market === 'synthetic_index';

                    // Keep all Volatility Indices at the top. Within that group,
                    // put the regular indices before their 1-second variants.
                    if (aIsVolatility !== bIsVolatility) return aIsVolatility ? -1 : 1;

                    if (aIsVolatility && bIsVolatility) {
                        const aIsOneSecond = /\\(1s\\)/i.test(a.display_name);
                        const bIsOneSecond = /\\(1s\\)/i.test(b.display_name);
                        if (aIsOneSecond !== bIsOneSecond) return aIsOneSecond ? 1 : -1;
                    }

                    return a.display_name.localeCompare(b.display_name, undefined, { numeric: true, sensitivity: 'base' });
                });

            setSymbols(orderedMarkets);
            setSymbol(current => orderedMarkets.some(item => item.symbol === current) ? current : orderedMarkets[0]?.symbol || '');
        } catch {
            setSymbols([]);
        }
    }, []);

    useEffect(() => {
        const refresh = () => setConnection(api_base.getConnectionStatus());
        refresh();
        const interval = window.setInterval(refresh, 1500);
        void loadSymbols();
        return () => window.clearInterval(interval);
    }, [loadSymbols]);

    useEffect(() => {
        const updateSocketReady = (status: string) => {
            const isOpen = status === CONNECTION_STATUS.OPENED;
            setSocketReady(isOpen);
            if (isOpen) setSocketGeneration(previous => previous + 1);
        };
        const statusSubscription = connectionStatus$.subscribe(updateSocketReady);
        updateSocketReady(connectionStatus$.value);
        if (api_base.api?.connection?.readyState === 1) setSocketReady(true);
        return () => statusSubscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (connection === CONNECTION_STATUS.OPENED && symbols.length === 0) {
            void loadSymbols();
        }
    }, [connection, symbols.length, loadSymbols]);

    useEffect(() => {
        if (!symbol) {
            setTickConnection('disconnected');
            setDigitTicks([]);
            return undefined;
        }

        // A raw, component-owned WebSocket keeps Manual Trader market data
        // independent of APIBase/Bot Builder connection resets.
        let active = true;
        let marketSocket: WebSocket | null = null;
        let requestId = 0;
        let subscriptionId = '';
        let watchdog: number | null = null;
        let reconnectTimer: number | null = null;
        let reconnectInFlight = false;
        let hasEverConnected = false;
        const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
        latestDigitTickRef.current = null;
        lastLiveTickAtRef.current = Date.now();
        setDigitTicks([]);
        setTickError('');
        setTickConnection('connecting');

        const precision = (api_base.pip_sizes as Record<string, number>)?.[symbol];

        const sendRequest = (payload: Record<string, unknown>) => {
            if (!marketSocket || marketSocket.readyState !== WebSocket.OPEN) {
                return Promise.reject(new Error('Manual Trader market-data socket is not open.'));
            }
            const id = ++requestId;
            return new Promise<any>((resolve, reject) => {
                pending.set(id, { resolve, reject });
                marketSocket!.send(JSON.stringify({ ...payload, req_id: id }));
            });
        };

        const handleTick = (tick: any) => {
            if (!active || tick?.symbol !== symbol) return;
            const quote = Number(tick.quote);
            const epoch = Number(tick.epoch);
            if (!Number.isFinite(quote) || !Number.isFinite(epoch)) return;
            const nextTick = { quote, epoch, digit: getLastDigit(tick.quote, precision) };
            latestDigitTickRef.current = nextTick;
            lastLiveTickAtRef.current = Date.now();
            setTickConnection('connected');
            setDigitTicks(previous => [...previous, nextTick].slice(-TICK_WINDOW));
        };

        const handleMessage = (event: MessageEvent) => {
            let data: any;
            try { data = JSON.parse(String(event.data)); } catch { return; }

            if (data?.msg_type === 'tick') handleTick(data.tick);

            if (data?.req_id && pending.has(Number(data.req_id))) {
                const request = pending.get(Number(data.req_id))!;
                pending.delete(Number(data.req_id));
                if (data.error) request.reject(new Error(data.error.message || data.error.code || 'Deriv request failed.'));
                else request.resolve(data);
            }

            if (data?.subscription?.id && data?.msg_type === 'tick') {
                subscriptionId = String(data.subscription.id);
            }
        };

        const scheduleReconnect = () => {
            if (!active || reconnectTimer !== null) return;
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = null;
                void connectMarketFeed();
            }, 1000);
        };

        const connectMarketFeed = async () => {
            if (!active || reconnectInFlight) return;
            if (marketSocket?.readyState === WebSocket.OPEN || marketSocket?.readyState === WebSocket.CONNECTING) return;
            reconnectInFlight = true;
            try {
                // Completely separate raw WebSocket. Bot Builder/APIBase never receives
                // or owns this socket, so its reconnects cannot replace this feed.
                // Use the dedicated public market-data endpoint directly. Do not use
                // getSocketURL(): that helper may return the authenticated OTP/API URL.
                // Manual Trader must have its own market-data transport.
                const wsUrl = isProduction() ? WS_SERVERS.PRODUCTION : WS_SERVERS.STAGING;
                if (!active) return;
                marketSocket = new WebSocket(wsUrl);
                await new Promise<void>((resolve, reject) => {
                    const socket = marketSocket!;
                    const onOpen = () => { socket.removeEventListener('error', onError); resolve(); };
                    const onError = () => { socket.removeEventListener('open', onOpen); reject(new Error('Manual Trader market-data WebSocket failed to open.')); };
                    socket.addEventListener('open', onOpen, { once: true });
                    socket.addEventListener('error', onError, { once: true });
                });
                if (!active || !marketSocket) return;
                marketSocket.addEventListener('message', handleMessage);
                marketSocket.addEventListener('close', () => {
                    if (!active) return;
                    setTickError('');
                    scheduleReconnect();
                });

                const historyResponse = await sendRequest({
                    ticks_history: symbol,
                    end: 'latest',
                    count: TICK_WINDOW,
                    style: 'ticks',
                });
                if (!active) return;
                const history = historyResponse?.history;
                const prices: (number | string)[] = history?.prices || [];
                const times: number[] = history?.times || [];
                const historicalTicks = prices.map((price, index) => ({
                    quote: Number(price),
                    epoch: Number(times[index] || 0),
                    digit: getLastDigit(price, precision),
                })).filter(tick => Number.isFinite(tick.quote) && Number.isFinite(tick.epoch));
                if (historicalTicks.length) {
                    setDigitTicks(historicalTicks.slice(-TICK_WINDOW));
                    latestDigitTickRef.current = historicalTicks[historicalTicks.length - 1];
                }

                const subscriptionResponse = await sendRequest({ ticks: symbol, subscribe: 1 });
                if (!active) return;
                subscriptionId = String(subscriptionResponse?.subscription?.id || '');
                if (!subscriptionId) throw new Error('Deriv did not confirm the live tick subscription.');
                if (subscriptionResponse?.tick) handleTick(subscriptionResponse.tick);
                setTickError('');
                hasEverConnected = true;
                setTickConnection('connected');
            } catch (error: any) {
                if (!active) return;
                const detail = error?.message || error?.error?.message || String(error || '');
                setTickError(detail || 'Unable to start the Manual Trader market-data feed.');
                if (!hasEverConnected) setTickConnection('disconnected');
                scheduleReconnect();
            } finally {
                reconnectInFlight = false;
            }
        };

        void connectMarketFeed();
        watchdog = window.setInterval(() => {
            if (!active || !marketSocket || marketSocket.readyState !== WebSocket.OPEN) return;
            if (lastLiveTickAtRef.current && Date.now() - lastLiveTickAtRef.current > 8000) {
                lastLiveTickAtRef.current = Date.now();
                try { marketSocket.close(); } catch { /* already closed */ }
                marketSocket = null;
                scheduleReconnect();
            }
        }, 5000);

        return () => {
            active = false;
            if (watchdog !== null) window.clearInterval(watchdog);
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            pending.forEach(request => request.reject(new Error('Manual Trader stream restarted.')));
            pending.clear();
            if (marketSocket) {
                marketSocket.removeEventListener('message', handleMessage);
                try { marketSocket.close(); } catch { /* already closed */ }
            }
        };
    }, [symbol]);

    useEffect(() => {
        let active = true;
        const amount = Number(stake);
        if (!socketReady || !api_base.api || !api_base.is_authorized || !symbol || !Number.isFinite(amount) || amount <= 0) {
            setPayoutQuotes({ over: null, under: null });
            return () => { active = false; };
        }

        setPayoutQuotes({ over: null, under: null });
        const quoteTypes: Record<string, { over: ManualContractType; under: ManualContractType }> = {
            DIGITOVER: { over: 'DIGITOVER', under: 'DIGITUNDER' },
            DIGITEVEN: { over: 'DIGITEVEN', under: 'DIGITODD' },
            DIGITMATCH: { over: 'DIGITMATCH', under: 'DIGITDIFF' },
            CALL: { over: 'CALL', under: 'PUT' },
        };
        const group = contractType === 'DIGITUNDER' ? 'DIGITOVER'
            : contractType === 'DIGITODD' ? 'DIGITEVEN'
                : contractType === 'DIGITDIFF' ? 'DIGITMATCH'
                    : contractType === 'PUT' ? 'CALL' : contractType;
        const types = quoteTypes[group] || quoteTypes.DIGITOVER;
        const options = (side: TradeSide) => ({
            symbol,
            contractType: types[side],
            amount,
            currency,
            duration,
            prediction,
        });

        Promise.all([
            manualTradeService.getProposal(options('over')),
            manualTradeService.getProposal(options('under')),
        ]).then(([over, under]) => {
            if (active) setPayoutQuotes({ over: over.payout, under: under.payout });
        }).catch(() => {
            if (active) setPayoutQuotes({ over: null, under: null });
        });

        return () => { active = false; };
    }, [socketReady, symbol, contractType, stake, currency, duration, prediction]);

    useEffect(() => {
        try {
            window.sessionStorage.setItem(historyStorageKey, JSON.stringify(trades));
        } catch {
            // Keep the live workspace usable if browser storage is unavailable.
        }
    }, [historyStorageKey, trades]);

    const selectedSymbol = useMemo(() => symbols.find(item => item.symbol === symbol), [symbols, symbol]);

    const clearTradeResultHighlight = useCallback((key: string) => {
        setTradeResultHighlight(current => current?.key === key ? null : current);
    }, []);

    useEffect(() => () => {
        if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
    }, []);

    const executeTrade = useCallback(async (side: TradeSide) => {
        if (buyLock.current) return;
        buyLock.current = true;
        setBuyingSide(side);
        setTradeError('');
        const amount = Number(stake);
        let tradeStage: 'proposal' | 'purchase' | 'monitoring' = 'proposal';

        try {
            if (!api_base.api || !api_base.is_authorized) {
                throw new Error('Please connect and authorize your Deriv account first.');
            }
            if (!symbol) throw new Error('Please select a Volatility market.');
            if (!Number.isFinite(amount) || amount <= 0) throw new Error('Please set a stake greater than zero.');

            const quoteTypes: Record<string, { over: ManualContractType; under: ManualContractType }> = {
                DIGITOVER: { over: 'DIGITOVER', under: 'DIGITUNDER' },
                DIGITEVEN: { over: 'DIGITEVEN', under: 'DIGITODD' },
                DIGITMATCH: { over: 'DIGITMATCH', under: 'DIGITDIFF' },
                CALL: { over: 'CALL', under: 'PUT' },
            };
            const group = contractType === 'DIGITUNDER' ? 'DIGITOVER'
                : contractType === 'DIGITODD' ? 'DIGITEVEN'
                    : contractType === 'DIGITDIFF' ? 'DIGITMATCH'
                        : contractType === 'PUT' ? 'CALL' : contractType;
            const selectedContract = quoteTypes[group]?.[side];
            if (!selectedContract) throw new Error('This contract selection is not supported.');

            const proposal = await manualTradeService.getProposal({
                symbol,
                contractType: selectedContract,
                amount,
                currency,
                duration,
                prediction,
            });
            tradeStage = 'purchase';

            // Over 2 safeguard: recheck the newest received market tick after
            // the proposal round-trip and immediately before submitting the buy.
            // This is a client-side strategy filter; Deriv still determines the
            // contract's actual entry and settlement ticks on its servers.
            if (selectedContract === 'DIGITOVER' && prediction === 2) {
                const latestTick = latestDigitTickRef.current;
                if (!latestTick) {
                    throw new Error('Over 2 purchase rejected: waiting for a live market tick. Please try again.');
                }
                if (latestTick.digit >= 3) {
                    throw new Error(`Over 2 purchase rejected: the latest live digit is ${latestTick.digit}. Wait for a digit from 0 to 2.`);
                }
            }

            const purchase = await manualTradeService.buy(proposal.id, proposal.ask_price);
            const contractId = Number(purchase.contract_id);
            const record: ManualTradeRecord = {
                contract_id: contractId,
                contract_type: selectedContract,
                symbol,
                symbol_name: selectedSymbol?.display_name || symbol,
                buy_price: Number(purchase.buy_price ?? proposal.ask_price),
                stake_amount: amount,
                payout: proposal.payout,
                currency,
                status: 'open',
                purchase_time: Date.now(),
            };
            setContractType(selectedContract);
            setTrades(previous => [record, ...previous]);
            tradeStage = 'monitoring';
            void manualTradeService.observeContract(contractId, contract => {
                const contractStatus = String(contract.status || 'open');
                const status: ManualTradeRecord['status'] =
                    contractStatus === 'won' ? 'won'
                        : contractStatus === 'lost' ? 'lost'
                            : contractStatus === 'sold' ? 'sold' : 'open';
                const profit = Number(contract.profit);
                setTrades(previous => previous.map(item => item.contract_id === contractId ? {
                    ...item,
                    status,
                    ...(Number.isFinite(profit) ? { profit } : {}),
                    ...(contract.entry_spot !== undefined ? { entry_tick: contract.entry_spot } : contract.entry_tick !== undefined ? { entry_tick: contract.entry_tick } : {}),
                    ...(contract.exit_spot !== undefined ? { exit_tick: contract.exit_spot } : contract.exit_tick !== undefined ? { exit_tick: contract.exit_tick } : {}),
                } : item));

                const resultSpot = contract.exit_spot ?? contract.exit_tick ?? contract.current_spot;
                if ((status === 'won' || status === 'lost') && Number.isFinite(profit) && resultSpot !== undefined && !completedContracts.current.has(contractId)) {
                    completedContracts.current.add(contractId);
                    const exitPrecision = (api_base.pip_sizes as Record<string, number>)?.[symbol];
                    const resultDigit = getLastDigit(resultSpot, exitPrecision);
                    const resultKey = `${contractId}-${status}-${String(resultSpot)}-${Date.now()}`;
                    const result = { digit: resultDigit, status, profit, currency, key: resultKey } as TradeResultHighlight;
                    setTradeResultHighlight(result);
                    setTradeNotification({ status, profit, currency, key: resultKey });
                    if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
                    notificationTimer.current = window.setTimeout(() => setTradeNotification(null), 5000);
                }

                // One-step 1.5x recovery is limited to the exact Over 2 / Under 7 pair.
                // A losing manual Over 2 buys one Under 7; a losing manual Under 7 buys one Over 2.
                // Recovery contracts are explicitly marked and can never trigger another recovery.
                const isRecoveryPair =
                    !record.is_recovery &&
                    ((selectedContract === 'DIGITOVER' && prediction === 2) ||
                        (selectedContract === 'DIGITUNDER' && prediction === 7));
                if (status === 'lost' && isRecoveryPair && !recoveryStartedContracts.current.has(contractId)) {
                    recoveryStartedContracts.current.add(contractId);
                    const recoveryContractType: ManualContractType =
                        selectedContract === 'DIGITOVER' ? 'DIGITUNDER' : 'DIGITOVER';
                    const recoveryPrediction = selectedContract === 'DIGITOVER' ? 7 : 2;
                    const recoveryAmount = Number((amount * 1.5).toFixed(2));
                    const recoverySide: TradeSide = selectedContract === 'DIGITOVER' ? 'under' : 'over';

                    void (async () => {
                        buyLock.current = true;
                        setBuyingSide(recoverySide);
                        setTradeError('');
                        try {
                            if (!api_base.api || !api_base.is_authorized) {
                                throw new Error('Deriv authorization was lost before the recovery purchase.');
                            }
                            const recoveryProposal = await manualTradeService.getProposal({
                                symbol,
                                contractType: recoveryContractType,
                                amount: recoveryAmount,
                                currency,
                                duration,
                                prediction: recoveryPrediction,
                            });
                            const recoveryPurchase = await manualTradeService.buy(
                                recoveryProposal.id,
                                recoveryProposal.ask_price
                            );
                            const recoveryContractId = Number(recoveryPurchase.contract_id);
                            const recoveryRecord: ManualTradeRecord = {
                                contract_id: recoveryContractId,
                                contract_type: recoveryContractType,
                                symbol,
                                symbol_name: selectedSymbol?.display_name || symbol,
                                buy_price: Number(recoveryPurchase.buy_price ?? recoveryProposal.ask_price),
                                stake_amount: recoveryAmount,
                                payout: recoveryProposal.payout,
                                currency,
                                status: 'open',
                                purchase_time: Date.now(),
                                is_recovery: true,
                                recovery_for: contractId,
                            };

                            // Reflect the automatically selected opposite contract in the controls.
                            setContractType(recoveryContractType);
                            setPrediction(recoveryPrediction);
                            setTrades(previous => [recoveryRecord, ...previous]);

                            void manualTradeService.observeContract(recoveryContractId, recoveryContract => {
                                const recoveryStatusText = String(recoveryContract.status || 'open');
                                const recoveryStatus: ManualTradeRecord['status'] =
                                    recoveryStatusText === 'won' ? 'won'
                                        : recoveryStatusText === 'lost' ? 'lost'
                                            : recoveryStatusText === 'sold' ? 'sold' : 'open';

                                // Once the single recovery contract settles, restore the
                                // original contract and barrier selected for the manual trade.
                                if (recoveryStatus === 'won' || recoveryStatus === 'lost') {
                                    setContractType(selectedContract);
                                    setPrediction(prediction);
                                }

                                const recoveryProfit = Number(recoveryContract.profit);
                                setTrades(previous => previous.map(item => item.contract_id === recoveryContractId ? {
                                    ...item,
                                    status: recoveryStatus,
                                    ...(Number.isFinite(recoveryProfit) ? { profit: recoveryProfit } : {}),
                                    ...(recoveryContract.entry_spot !== undefined ? { entry_tick: recoveryContract.entry_spot } : recoveryContract.entry_tick !== undefined ? { entry_tick: recoveryContract.entry_tick } : {}),
                                    ...(recoveryContract.exit_spot !== undefined ? { exit_tick: recoveryContract.exit_spot } : recoveryContract.exit_tick !== undefined ? { exit_tick: recoveryContract.exit_tick } : {}),
                                } : item));

                                const recoveryResultSpot = recoveryContract.exit_spot ?? recoveryContract.exit_tick ?? recoveryContract.current_spot;
                                if ((recoveryStatus === 'won' || recoveryStatus === 'lost') &&
                                    Number.isFinite(recoveryProfit) &&
                                    recoveryResultSpot !== undefined &&
                                    !completedContracts.current.has(recoveryContractId)) {
                                    completedContracts.current.add(recoveryContractId);
                                    const exitPrecision = (api_base.pip_sizes as Record<string, number>)?.[symbol];
                                    const resultDigit = getLastDigit(recoveryResultSpot, exitPrecision);
                                    const resultKey = `${recoveryContractId}-${recoveryStatus}-${String(recoveryResultSpot)}-${Date.now()}`;
                                    setTradeResultHighlight({
                                        digit: resultDigit,
                                        status: recoveryStatus,
                                        profit: recoveryProfit,
                                        currency,
                                        key: resultKey,
                                    });
                                    setTradeNotification({
                                        status: recoveryStatus,
                                        profit: recoveryProfit,
                                        currency,
                                        key: resultKey,
                                    });
                                    if (notificationTimer.current !== null) window.clearTimeout(notificationTimer.current);
                                    notificationTimer.current = window.setTimeout(() => setTradeNotification(null), 5000);
                                }
                            }).catch(error => {
                                setTradeError(error instanceof Error
                                    ? `Recovery contract opened, but its updates could not be received: ${error.message}`
                                    : 'Recovery contract opened, but its updates could not be received.');
                            });
                        } catch (error: any) {
                            const message = error?.error?.message || error?.message || 'Deriv rejected the recovery purchase.';
                            setTradeError(`Automatic recovery failed: ${message}`);
                        } finally {
                            buyLock.current = false;
                            setBuyingSide(null);
                        }
                    })();
                }
            }).catch(error => {
                setTradeError(error instanceof Error ? error.message : 'Trade opened, but contract updates could not be received.');
            });
        } catch (error: any) {
            const apiMessage =
                (typeof error === 'string' && error) ||
                error?.error?.message ||
                error?.data?.error?.message ||
                error?.message ||
                error?.data?.message ||
                (error?.code ? `${error.code}: ${error?.message || 'Request rejected'}` : '');
            const fallback = 'Deriv returned an unexpected response. Please try again.';
            setTradeError(`${tradeStage === 'proposal' ? 'Quote request' : tradeStage === 'purchase' ? 'Purchase request' : 'Contract monitoring'} failed: ${apiMessage || fallback}`);
        } finally {
            buyLock.current = false;
            setBuyingSide(null);
        }
    }, [stake, symbol, contractType, currency, duration, prediction, selectedSymbol]);

    return (
        <main className='manual-trader'>
            {tradeNotification && (
                <div
                    className={`manual-trader__trade-notification manual-trader__trade-notification--${tradeNotification.status}`}
                    role='status'
                    aria-live='polite'
                >
                    {tradeNotification.status === 'won' ? '+' : '-'} {Math.abs(tradeNotification.profit).toFixed(2)} {tradeNotification.currency} {tradeNotification.status === 'won' ? 'Win' : 'Loss'}
                </div>
            )}

            <header className='manual-trader__header'>
                <div><h2>Manual Trader</h2><p>Trade Volatility Indices with digit contracts and tick durations.</p></div>
                <span className={`manual-trader__connection ${connection === CONNECTION_STATUS.OPENED ? 'is-ready' : ''}`}>{connection === CONNECTION_STATUS.OPENED ? 'Deriv connected' : connection}</span>
            </header>

            <div className='manual-trader__layout'>
                <div className='manual-trader__column'>
                    <ManualTraderAnalysisDashboard
                        ticks={analysisTicks}
                        selectedWindow={selectedAnalysisWindow}
                        onWindowChange={setSelectedAnalysisWindow}
                        marketName={selectedSymbol?.display_name || symbol}
                        tickConnection={tickConnection}
                        tickError={tickError}
                        tradeResultHighlight={tradeResultHighlight}
                        onTradeResultAnimationEnd={clearTradeResultHighlight}
                        barrierDigit={prediction}
                    />
                    <TradeControls
                        symbols={symbols}
                        symbol={symbol}
                        contractType={contractType}
                        duration={duration}
                        stake={stake}
                        prediction={prediction}
                        currency={currency}
                        overPayout={payoutQuotes.over}
                        underPayout={payoutQuotes.under}
                        buyingSide={buyingSide}
                        buyDisabled={!socketReady || !api_base.is_authorized || !symbol || Number(stake) <= 0}
                        tradeError={tradeError}
                        onBuy={executeTrade}
                        onSymbolChange={setSymbol}
                        onContractChange={setContractType}
                        onDurationChange={setDuration}
                        onStakeChange={setStake}
                        onPredictionChange={setPrediction}
                    />
                    <ManualTraderDistributionPanels ticks={analysisTicks} />
                    <TradeHistory trades={trades} currency={currency} />
                </div>
            </div>
        </main>
    );
};

export default ManualTrader;
