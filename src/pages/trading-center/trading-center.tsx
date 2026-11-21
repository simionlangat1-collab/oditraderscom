import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isDemoAccount } from '@/utils/account-helpers';
import { api_base } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import './trading-center.scss';

type TickPoint = { quote: number; epoch: number; digit: number };
type TradeRecord = { id: number; contractId: number; contractType: 'DIGITEVEN' | 'DIGITODD'; stake: number; profit: number; status: 'OPEN' | 'WON' | 'LOST'; exitSpot?: number };

const SYMBOLS = [
    { value: 'R_10', label: 'Volatility 10 Index' },
    { value: 'R_25', label: 'Volatility 25 Index' },
    { value: 'R_50', label: 'Volatility 50 Index' },
    { value: 'R_75', label: 'Volatility 75 Index' },
    { value: 'R_100', label: 'Volatility 100 Index' },
    { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
    { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
    { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
    { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
    { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
];

const getLastDigit = (quote: number, precision = 2) => {
    const formatted = Number(quote).toFixed(Math.max(0, Math.min(8, precision)));
    return Number(formatted.replace('.', '').slice(-1));
};

const TradingCenter = ({ onExit }: { onExit: () => void }) => {
    const { connectionStatus, authData, activeLoginid } = useApiBase();
    const [accountBalance, setAccountBalance] = useState<number | null>(null);
    const [accountCurrency, setAccountCurrency] = useState('USD');
    const [isDemoAccountState, setIsDemoAccountState] = useState<boolean | null>(null);
    const [symbol, setSymbol] = useState('R_25');
    const [ticks, setTicks] = useState<TickPoint[]>([]);
    const [streamState, setStreamState] = useState<'waiting' | 'connecting' | 'live' | 'offline' | 'error'>('waiting');
    const [lastError, setLastError] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [stake, setStake] = useState('1.00');
    const [targetProfit, setTargetProfit] = useState('5.00');
    const [stopLoss, setStopLoss] = useState('5.00');
    const [martingale, setMartingale] = useState('2.00');
    const [appliedSettings, setAppliedSettings] = useState({ stake: 1, targetProfit: 5, stopLoss: 5, martingale: 2 });
    const [settingsError, setSettingsError] = useState('');
    const [tickWindow, setTickWindow] = useState(30);
    const [selectedContract, setSelectedContract] = useState<'EVEN' | 'ODD' | null>(null);
    const [isTrading, setIsTrading] = useState(false);
    const [sessionProfit, setSessionProfit] = useState(0);
    const [tradeCount, setTradeCount] = useState(0);
    const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([]);
    const [latestTradeResult, setLatestTradeResult] = useState<{ profit: number; status: 'WON' | 'LOST' } | null>(null);
    const [targetProfitAchieved, setTargetProfitAchieved] = useState<number | null>(null);
    const [executionMessage, setExecutionMessage] = useState('Demo account required. Select EVEN or ODD to begin.');
    const contractMap = useRef(new Map<number, number>());
    const tradeSequence = useRef(0);
    const sessionProfitRef = useRef(0);
    const nextStakeRef = useRef(1);
    const tradingRef = useRef(false);
    const targetProfitPopupShownRef = useRef(false);


    useEffect(() => {
        const api = api_base.api;
        if (!api) return undefined;
        const listener = api.onMessage().subscribe(({ data }: { data: any }) => {
            if (data?.msg_type !== 'proposal_open_contract') return;
            const contract = data.proposal_open_contract;
            if (!contract || !contract.is_sold) return;
            const contractId = Number(contract.contract_id);
            const tradeId = contractMap.current.get(contractId);
            if (tradeId === undefined) return;
            contractMap.current.delete(contractId);
            const profit = Number((Number(contract.sell_price) - Number(contract.buy_price)).toFixed(2));
            if (!Number.isFinite(profit)) return;
            sessionProfitRef.current = Number((sessionProfitRef.current + profit).toFixed(2));
            setSessionProfit(sessionProfitRef.current);
            const status = profit > 0 ? 'WON' : 'LOST';
            setTradeHistory(rows => rows.map(row => row.id === tradeId ? { ...row, profit, status, exitSpot: Number(contract.exit_tick) } : row));
            setLatestTradeResult({ profit, status });
            nextStakeRef.current = profit < 0 ? Number((nextStakeRef.current * appliedSettings.martingale).toFixed(2)) : appliedSettings.stake;
            const targetReached = appliedSettings.targetProfit > 0 && sessionProfitRef.current >= appliedSettings.targetProfit;
            const stopLossReached = appliedSettings.stopLoss > 0 && sessionProfitRef.current <= -appliedSettings.stopLoss;
            if (targetReached) {
                if (!targetProfitPopupShownRef.current) {
                    targetProfitPopupShownRef.current = true;
                    setTargetProfitAchieved(sessionProfitRef.current);
                }
                tradingRef.current = false;
                setIsTrading(false);
                setExecutionMessage('Target Profit achieved. New trades stopped; open contracts remain monitored.');
            } else if (stopLossReached) {
                tradingRef.current = false;
                setIsTrading(false);
                setExecutionMessage('Stop Loss reached. New trades stopped; open contracts remain monitored.');
            }
        });
        return () => listener.unsubscribe();
    }, [appliedSettings, connectionStatus]);

    useEffect(() => {
        if (connectionStatus !== CONNECTION_STATUS.OPENED && tradingRef.current) {
            tradingRef.current = false;
            setIsTrading(false);
            setExecutionMessage('Connection lost. Trading stopped.');
        }
    }, [connectionStatus]);

    const startTrading = () => {
        if (!isDemoAccount(activeLoginid) || !authData?.is_virtual) {
            setExecutionMessage('DEMO ONLY: switch to a Demo account before starting.');
            return;
        }
        if (connectionStatus !== CONNECTION_STATUS.OPENED || streamState !== 'live' || ticks.length < 2) {
            setExecutionMessage('Wait for a connected account and live market ticks.');
            return;
        }
        if (!selectedContract) {
            setExecutionMessage('Select EVEN or ODD first.');
            return;
        }
        contractMap.current.clear();
        sessionProfitRef.current = 0;
        nextStakeRef.current = appliedSettings.stake;
        setSessionProfit(0);
        setTradeCount(0);
        setTradeHistory([]);
        setLatestTradeResult(null);
        targetProfitPopupShownRef.current = false;
        setTargetProfitAchieved(null);
        tradingRef.current = true;
        setIsTrading(true);
        setExecutionMessage('Demo trading active · one purchase cycle every second.');
    };

    useEffect(() => {
        if (!isTrading) return undefined;
        let stopped = false;
        const placeTrade = async () => {
            if (stopped || !tradingRef.current) return;
            const api = api_base.api;
            if (!isDemoAccount(activeLoginid) || !authData?.is_virtual) {
                tradingRef.current = false;
                setIsTrading(false);
                setExecutionMessage('Demo account changed or unavailable. Trading stopped.');
                return;
            }
            if (!api || api.connection.readyState !== 1) {
                tradingRef.current = false;
                setIsTrading(false);
                setExecutionMessage('Deriv connection unavailable. Trading stopped.');
                return;
            }
            if (contractMap.current.size >= 10) {
                tradingRef.current = false;
                setIsTrading(false);
                setExecutionMessage('Safety pause: 10 contracts are still unsettled. Wait for settlement before restarting.');
                return;
            }
            const contractType = selectedContract === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD';
            const stakeAmount = Math.max(0.35, Number(nextStakeRef.current.toFixed(2)));
            try {
                const proposalResponse: any = await api.send({
                    proposal: 1, amount: stakeAmount, basis: 'stake', contract_type: contractType,
                    currency: accountCurrency, duration: 1, duration_unit: 't', underlying_symbol: symbol,
                });
                if (stopped || !tradingRef.current) return;
                if (proposalResponse?.error || !proposalResponse?.proposal?.id) {
                    throw new Error(proposalResponse?.error?.message || 'No valid proposal returned by Deriv.');
                }
                const buyResponse: any = await api.send({ buy: proposalResponse.proposal.id, price: Number(proposalResponse.proposal.ask_price) });
                if (buyResponse?.error || !buyResponse?.buy?.contract_id) {
                    throw new Error(buyResponse?.error?.message || 'Deriv did not confirm the purchase.');
                }
                const buy = buyResponse.buy;
                const id = ++tradeSequence.current;
                contractMap.current.set(Number(buy.contract_id), id);
                setTradeCount(count => count + 1);
                setTradeHistory(rows => [{ id, contractId: Number(buy.contract_id), contractType, stake: Number(buy.buy_price ?? stakeAmount), profit: 0, status: 'OPEN' }, ...rows].slice(0, 50));
                const trackingResponse: any = await api.send({
                    proposal_open_contract: 1,
                    contract_id: Number(buy.contract_id),
                    subscribe: 1,
                });
                if (trackingResponse?.error) {
                    throw new Error(trackingResponse.error.message || 'Unable to subscribe to the contract settlement. Trading stopped for safety.');
                }
            } catch (error: any) {
                tradingRef.current = false;
                setIsTrading(false);
                setExecutionMessage(error?.message || 'Trade request failed. Trading stopped for safety.');
            }
        };
        placeTrade();
        const interval = window.setInterval(placeTrade, 1000);
        return () => { stopped = true; window.clearInterval(interval); };
    }, [isTrading, selectedContract, symbol, accountCurrency, activeLoginid, authData]);

    // Keep the displayed account balance aligned with the currently authorized account.
    useEffect(() => {
        if (!authData) {
            setAccountBalance(null);
            setIsDemoAccountState(null);
            return;
        }
        setAccountBalance(typeof authData.balance === 'number' ? authData.balance : Number(authData.balance));
        setAccountCurrency(authData.currency || 'USD');
        setIsDemoAccountState(Boolean(authData.is_virtual));
    }, [authData, activeLoginid]);

    // The account balance stream is already maintained by the shared Deriv API connection.
    useEffect(() => {
        const api = api_base.api;
        if (!api || connectionStatus !== CONNECTION_STATUS.OPENED || !activeLoginid) return undefined;
        const listener = api.onMessage().subscribe(({ data }: { data: any }) => {
            if (data?.msg_type !== 'balance' || !data.balance) return;
            if (data.balance.loginid && data.balance.loginid !== activeLoginid) return;
            const nextBalance = Number(data.balance.balance);
            if (Number.isFinite(nextBalance)) setAccountBalance(nextBalance);
            if (data.balance.currency) setAccountCurrency(data.balance.currency);
        });
        return () => listener.unsubscribe();
    }, [connectionStatus, activeLoginid]);

    // One Deriv subscription feeds both the digit stream and the live chart.
    useEffect(() => {
        const api = api_base.api;
        const symbolPrecision = Number(api_base.pip_sizes?.[symbol] ?? 2);
        if (connectionStatus !== CONNECTION_STATUS.OPENED || !api) {
            setStreamState('offline');
            return undefined;
        }

        let active = true;
        let subscriptionId: string | undefined;
        setTicks([]);
        setLastError('');
        setStreamState('connecting');

        const listener = api.onMessage().subscribe(({ data }: { data: any }) => {
            if (!active || !data) return;
            if (data.error) {
                setLastError(data.error.message || 'Unable to load live ticks.');
                setStreamState('error');
                return;
            }
            if (data.msg_type === 'history' && data.history) {
                const prices: number[] = data.history.prices || [];
                const times: number[] = data.history.times || [];
                const precision = Number(data.pip_size ?? symbolPrecision);
                setTicks(prices.map((quote, index) => ({
                    quote: Number(quote),
                    epoch: Number(times[index] || 0),
                    digit: getLastDigit(Number(quote), precision),
                })).slice(-1000));
                if (data.subscription?.id) subscriptionId = data.subscription.id;
                setStreamState('live');
            }
            if (data.msg_type === 'tick' && data.tick?.symbol === symbol) {
                const tick = data.tick;
                const quote = Number(tick.quote);
                const digit = getLastDigit(quote, Number(tick.pip_size ?? symbolPrecision));
                if (tick.id) subscriptionId = tick.id;
                setTicks(previous => [...previous, { quote, epoch: Number(tick.epoch), digit }].slice(-1000));
                setStreamState('live');
            }
        });

        api.send({ ticks_history: symbol, count: 1000, end: 'latest', style: 'ticks', subscribe: 1 }).then((response: any) => {
            if (response?.subscription?.id) subscriptionId = response.subscription.id;
            if (!active) {
                if (subscriptionId) api.send({ forget: subscriptionId }).catch(() => undefined);
                return;
            }
            if (response?.error) {
                setLastError(response.error.message || 'Unable to subscribe to ticks.');
                setStreamState('error');
                return;
            }
            if (response?.history) {
                const prices: number[] = response.history.prices || [];
                const times: number[] = response.history.times || [];
                setTicks(prices.map((quote, index) => ({
                    quote: Number(quote),
                    epoch: Number(times[index] || 0),
                    digit: getLastDigit(Number(quote), symbolPrecision),
                })).slice(-1000));
                setStreamState('live');
            }
        }).catch((error: Error) => {
            if (!active) return;
            setLastError(error?.message || 'Tick connection failed.');
            setStreamState('error');
        });

        return () => {
            active = false;
            listener.unsubscribe();
            if (subscriptionId) api.send({ forget: subscriptionId }).catch(() => undefined);
        };
    }, [connectionStatus, symbol]);

    const stats = useMemo(() => {
        const sample = ticks.slice(-tickWindow);
        const even = sample.filter(tick => tick.digit % 2 === 0).length;
        const odd = sample.length - even;
        return {
            even,
            odd,
            count: sample.length,
            evenPercent: sample.length ? (even / sample.length) * 100 : 0,
            oddPercent: sample.length ? (odd / sample.length) * 100 : 0,
        };
    }, [ticks, tickWindow]);

    const latest = ticks[ticks.length - 1];
    const signal = stats.count < 20
        ? 'Collecting data'
        : stats.evenPercent > stats.oddPercent
          ? 'Even currently leads'
          : stats.oddPercent > stats.evenPercent
            ? 'Odd currently leads'
            : 'Even / Odd balanced';
    const recentTicks = ticks.slice(-36).reverse();

    const resetSettings = () => {
        setStake('1.00');
        setTargetProfit('5.00');
        setStopLoss('5.00');
        setMartingale('2.00');
        setSettingsError('');
    };

    const applySettings = () => {
        const values = {
            stake: Number(stake),
            targetProfit: Number(targetProfit),
            stopLoss: Number(stopLoss),
            martingale: Number(martingale),
        };

        if (!Number.isFinite(values.stake) || values.stake < 0.35) {
            setSettingsError('Stake must be at least 0.35.');
            return;
        }
        if (!Number.isFinite(values.targetProfit) || values.targetProfit < 0) {
            setSettingsError('Target Profit must be 0 or greater.');
            return;
        }
        if (!Number.isFinite(values.stopLoss) || values.stopLoss < 0) {
            setSettingsError('Stop Loss must be 0 or greater.');
            return;
        }
        if (!Number.isFinite(values.martingale) || values.martingale < 1) {
            setSettingsError('Martingale multiplier must be at least 1.');
            return;
        }

        setAppliedSettings(values);
        setSettingsError('');
        setSettingsOpen(false);
    };

    return (
        <section className='trading-center'>
            <header className='tc-heading'>
                <button type='button' className='tc-exit-fullscreen' aria-label='Exit full-screen trading center' onClick={onExit}>← <span>EXIT</span></button>
                <div className='tc-heading__brand'><span className='tc-brand-mark'>◎</span><div><h1>ODITRADERS.COM</h1><p>TRADING CENTER <b>•</b> EVEN / ODD</p></div></div>
                <span className={'tc-live tc-live--' + streamState}><i />{streamState === 'live' ? 'LIVE TICKS' : streamState.toUpperCase()}</span>
            </header>

            <section className='tc-panel tc-market-panel'>
                <div className='tc-market-controls'>
                    <label className='tc-symbol'><span>◈</span><select aria-label='Market symbol' value={symbol} onChange={event => setSymbol(event.target.value)}>{SYMBOLS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                    <div className='tc-window' aria-live='polite'><span className='tc-sr-only'>Selected analysis window</span><strong>{tickWindow}</strong></div>
                    <div className='tc-window-buttons'>{[30, 60, 120, 1000].map(value => <button type='button' key={value} className={tickWindow === value ? 'active' : ''} onClick={() => setTickWindow(value)}>{value}</button>)}</div>
                </div>
                <div className='tc-digit-stream' aria-label='Live last digit stream'>
                    {recentTicks.map((tick, index) => <span key={tick.epoch + '-' + index} className={tick.digit % 2 === 0 ? 'even' : 'odd'} title={'Quote: ' + tick.quote}>{tick.digit}</span>)}
                    {!recentTicks.length && <span className='tc-empty-inline'>Waiting for live digits…</span>}
                </div>
                <div className='tc-stream-footer'><span className={'tc-stream-dot tc-stream-dot--' + streamState} />{streamState === 'live' ? 'Receiving live market ticks' : streamState === 'offline' ? 'Connect Deriv to receive live ticks' : streamState === 'error' ? lastError : 'Connecting to market…'}<small>{stats.count} / {tickWindow} sampled</small></div>
            </section>

            {lastError && <div className='tc-error'>{lastError}</div>}

            <section className='tc-panel tc-chart-panel'>
                <div className='tc-latest-price'>Latest Price: <strong>{latest ? latest.quote : '—'}</strong></div>
                <div className='tc-chart-legend'><span /> Percentage</div>
                <div className='tc-chart' role='img' aria-label={'Even ' + stats.evenPercent.toFixed(2) + ' percent, Odd ' + stats.oddPercent.toFixed(2) + ' percent'}>
                    <div className='tc-y-axis'>{[100, 80, 60, 40, 20, 0].map(value => <span key={value}>{value}</span>)}</div>
                    <div className='tc-chart-plot'>
                        <div className='tc-chart-grid'>{[100, 80, 60, 40, 20, 0].map(value => <i key={value} />)}</div>
                        <div className='tc-chart-bars'>
                            <div className='tc-chart-bar tc-chart-bar--even' style={{ height: Math.max(stats.evenPercent, 0.8) + '%' }}><strong>{stats.evenPercent.toFixed(2)}%</strong></div>
                            <div className='tc-chart-bar tc-chart-bar--odd' style={{ height: Math.max(stats.oddPercent, 0.8) + '%' }}><strong>{stats.oddPercent.toFixed(2)}%</strong></div>
                        </div>
                    </div>
                    <div className='tc-chart-x-labels'><span>Even</span><span>Odd</span></div>
                </div>
                <div className='tc-chart-footnote'>Calculated from the latest {tickWindow} available ticks. Frequencies are descriptive, not predictions.</div>
            </section>

            <div className='tc-performance-grid'>
                <article className='tc-panel tc-stat-panel'><small>{isDemoAccountState === null ? 'BALANCE' : isDemoAccountState ? 'D. Bal =' : 'R. Bal ='}</small><strong>{accountBalance === null || !Number.isFinite(accountBalance) ? '—' : accountBalance.toFixed(2)} {accountCurrency}</strong></article>
                <button type='button' className='tc-panel tc-stat-panel tc-stat-panel--start tc-start-button' onClick={isTrading ? () => { tradingRef.current = false; setIsTrading(false); setExecutionMessage('Trading stopped. Existing contracts remain tracked.'); } : startTrading}>{isTrading ? 'STOP TRADES' : 'START TRADES'}<small>{isTrading ? 'RUNNING · 1s CYCLE' : 'DEMO ONLY'}</small></button>
                <article className='tc-panel tc-stat-panel tc-stat-panel--money'><small>PROFIT / LOSS</small><strong>{sessionProfit >= 0 ? '+' : ''}{sessionProfit.toFixed(2)} {accountCurrency}</strong></article>
            </div>

            <div className='tc-summary-grid'>
                <article className='tc-panel tc-summary-label'>ⓘ &nbsp; SUMMARY</article>
                <button
                    type='button'
                    className='tc-panel tc-summary-even'
                    aria-pressed={selectedContract === 'EVEN'}
                    onClick={() => setSelectedContract('EVEN')}
                    style={{
                        background: selectedContract === 'EVEN' ? 'linear-gradient(100deg, #078d6c, #1bd6a0)' : 'linear-gradient(135deg, rgba(13, 39, 57, .98), rgba(6, 21, 39, .98))',
                        color: '#fff',
                        borderColor: selectedContract === 'EVEN' ? '#1bd6a0' : 'var(--tc-border)',
                        boxShadow: selectedContract === 'EVEN' ? '0 0 1rem rgba(27, 214, 160, .3)' : undefined,
                        appearance: 'none',
                    }}
                >EVEN: {stats.evenPercent.toFixed(2)}%</button>
                <button
                    type='button'
                    className='tc-panel tc-summary-odd'
                    aria-pressed={selectedContract === 'ODD'}
                    onClick={() => setSelectedContract('ODD')}
                    style={{
                        background: selectedContract === 'ODD' ? 'rgba(191, 61, 111, .58)' : 'linear-gradient(135deg, rgba(13, 39, 57, .98), rgba(6, 21, 39, .98))',
                        color: selectedContract === 'ODD' ? '#fff' : '#e5f2fa',
                        borderColor: selectedContract === 'ODD' ? '#e65a91' : 'var(--tc-border)',
                        boxShadow: selectedContract === 'ODD' ? '0 0 1rem rgba(230, 90, 145, .3)' : undefined,
                        appearance: 'none',
                    }}
                >ODD: {stats.oddPercent.toFixed(2)}%</button>
            </div>
            <div className='tc-signal-note'>{signal} · Based on observed tick frequency</div>

            <div className='tc-actions-grid'>
                <button type='button' className='tc-panel tc-action tc-action--settings' onClick={() => { setSettingsError(''); setSettingsOpen(true); }}>☷ <span>Settings</span></button>
                <article className='tc-panel tc-action tc-action--result' aria-live='polite'>
                    {latestTradeResult && (
                        <strong className={latestTradeResult.status === 'WON' ? 'tc-result-win' : 'tc-result-loss'}>
                            {latestTradeResult.profit > 0
                                ? '+ ' + latestTradeResult.profit.toFixed(2) + ' $ Win'
                                : '- ' + Math.abs(latestTradeResult.profit).toFixed(2) + ' $ Loss'}
                        </strong>
                    )}
                </article>
            </div>
            <div className='tc-signal-note' role='status'>{executionMessage} · {tradeCount} trades sent</div>
            <div className='tc-signal-note'>ACTIVE SETTINGS · Stake ${appliedSettings.stake.toFixed(2)} · Target ${appliedSettings.targetProfit.toFixed(2)}{appliedSettings.targetProfit === 0 ? ' (OFF)' : ''} · Stop Loss ${appliedSettings.stopLoss.toFixed(2)}{appliedSettings.stopLoss === 0 ? ' (OFF)' : ''} · Martingale ×{appliedSettings.martingale.toFixed(2)}</div>

            <section className='tc-panel tc-history-panel'>
                <div className='tc-history-columns'><span>PROFIT</span><span>STATUS</span><span>CONTRACT TYPE</span><span>STAKE</span><span>EXIT SPOT</span></div>
                <div className='tc-history-body'><div className='tc-history-title'>TRADE HISTORY <span>VIEW ALL</span></div><div className='tc-history-empty'>{tradeHistory.length === 0 ? <><strong>No trades yet</strong><p>Demo trade history will appear here after execution.</p></> : <div className='tc-trade-list'>{tradeHistory.map(item => <div className={`tc-trade-row tc-trade-row--${item.status.toLowerCase()}`} key={item.id}><strong>{item.status === 'OPEN' ? '—' : (item.profit > 0 ? '+' : '') + item.profit.toFixed(2)}</strong><span>{item.status}</span><span>{item.contractType === 'DIGITEVEN' ? 'EVEN' : 'ODD'}</span><span>{item.stake.toFixed(2)}</span><span>{item.exitSpot ?? '—'}</span></div>)}</div>}</div><button type='button' className='tc-history-menu' aria-label='Trade history menu' disabled>☰</button></div>
            </section>

            {settingsOpen && (
                <div className='tc-modal-backdrop' role='presentation' onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
                    <section className='tc-settings-modal' role='dialog' aria-modal='true' aria-labelledby='tc-settings-title'>
                        <header className='tc-settings-heading'><h2 id='tc-settings-title'>⚙ Settings</h2><button type='button' aria-label='Close settings' onClick={() => setSettingsOpen(false)}>×</button></header>
                        <div className='tc-settings-grid'>
                            <label className='tc-setting-field'><span>Stake</span><small>Trade amount (USD)</small><input type='number' min='0.35' step='0.01' value={stake} onChange={event => setStake(event.target.value)} /></label>
                            <label className='tc-setting-field'><span>Target Profit</span><small>Stop when profit reaches</small><input type='number' min='0' step='0.01' value={targetProfit} onChange={event => setTargetProfit(event.target.value)} /></label>
                            <label className='tc-setting-field'><span>Stop Loss</span><small>Stop when loss reaches</small><input type='number' min='0' step='0.01' value={stopLoss} onChange={event => setStopLoss(event.target.value)} /></label>
                            <label className='tc-setting-field'><span>Martingale</span><small>Multiplier after a loss</small><input type='number' min='1' step='0.1' value={martingale} onChange={event => setMartingale(event.target.value)} /></label>
                        </div>
                        {settingsError && <p className='tc-error' role='alert'>{settingsError}</p>}
                        <footer className='tc-settings-actions'><button type='button' className='tc-reset-button' onClick={resetSettings}>RESET</button><button type='button' className='tc-apply-button' onClick={applySettings}>APPLY SETTINGS</button></footer>
                        <p className='tc-settings-note'>Target Profit or Stop Loss set to 0 disables that limit. Stake must be at least 0.35; Martingale must be 1 or greater.</p>
                    </section>
                </div>
            )}

            {targetProfitAchieved !== null && (
                <div className='tc-target-backdrop' role='presentation' onMouseDown={event => { if (event.target === event.currentTarget) setTargetProfitAchieved(null); }}>
                    <section className='tc-target-modal' role='dialog' aria-modal='true' aria-labelledby='tc-target-title' aria-describedby='tc-target-description'>
                        <button type='button' className='tc-target-close' aria-label='Close target profit notification' onClick={() => setTargetProfitAchieved(null)}>×</button>
                        <div className='tc-target-confetti' aria-hidden='true'>✦　✧　✦　✧　✦</div>
                        <div className='tc-target-trophy' aria-hidden='true'>🏆</div>
                        <div className='tc-target-success'><span aria-hidden='true'>✓</span><h2 id='tc-target-title'>TARGET PROFIT <strong>ACHIEVED!</strong></h2></div>
                        <div className='tc-target-amount'>
                            <span>SESSION PROFIT</span>
                            <strong>+{targetProfitAchieved.toFixed(2)} {accountCurrency}</strong>
                            <small>Target: {appliedSettings.targetProfit.toFixed(2)} {accountCurrency}</small>
                        </div>
                        <p className='tc-target-message' id='tc-target-description'><span aria-hidden='true'>✓</span> New trades stopped automatically.</p>
                        <p className='tc-target-submessage'>Any open contracts will continue to be monitored until settlement.</p>
                        <button type='button' className='tc-target-acknowledge' onClick={() => setTargetProfitAchieved(null)}>👍 &nbsp; GREAT, GOT IT</button>
                    </section>
                </div>
            )}
        </section>
    );
};

export default TradingCenter;
