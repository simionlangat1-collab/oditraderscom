import React, { useEffect, useMemo, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import './trading-center.scss';

type TickPoint = { quote: number; epoch: number; digit: number };

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
    const { connectionStatus } = useApiBase();
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
    const [tickWindow, setTickWindow] = useState(100);

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
                })).slice(-100));
                if (data.subscription?.id) subscriptionId = data.subscription.id;
                setStreamState('live');
            }
            if (data.msg_type === 'tick' && data.tick?.symbol === symbol) {
                const tick = data.tick;
                const quote = Number(tick.quote);
                const digit = getLastDigit(quote, Number(tick.pip_size ?? symbolPrecision));
                if (tick.id) subscriptionId = tick.id;
                setTicks(previous => [...previous, { quote, epoch: Number(tick.epoch), digit }].slice(-100));
                setStreamState('live');
            }
        });

        api.send({ ticks_history: symbol, count: 100, end: 'latest', style: 'ticks', subscribe: 1 }).then((response: any) => {
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
                })).slice(-100));
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
                    <label className='tc-window'><span className='tc-sr-only'>Tick sample size</span><select value={tickWindow} onChange={event => setTickWindow(Number(event.target.value))}><option value={60}>60</option><option value={100}>100</option></select></label>
                    <div className='tc-window-buttons'>{[30, 60, 120, 1000].map(value => <button type='button' key={value} className={tickWindow === value ? 'active' : ''} onClick={() => setTickWindow(value)}>{value}</button>)}</div>
                    <div className='tc-ratio'><div className='tc-ratio__even'>Even: <strong>{stats.evenPercent.toFixed(2)}%</strong></div><div className='tc-ratio__odd'>Odd: <strong>{stats.oddPercent.toFixed(2)}%</strong></div></div>
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
                <article className='tc-panel tc-stat-panel'><small>BALANCE</small><strong>— USD</strong></article>
                <article className='tc-panel tc-stat-panel'><small>TRADES TAKEN</small><strong>0</strong></article>
                <article className='tc-panel tc-stat-panel tc-stat-panel--money'><small>PROFIT / LOSS</small><strong>$0.00</strong></article>
            </div>

            <div className='tc-summary-grid'>
                <article className='tc-panel tc-summary-label'>ⓘ &nbsp; SUMMARY</article>
                <article className='tc-panel tc-summary-even'>EVEN: {stats.evenPercent.toFixed(2)}%</article>
                <article className='tc-panel tc-summary-odd'>ODD: {stats.oddPercent.toFixed(2)}%</article>
            </div>
            <div className='tc-signal-note'>{signal} · Based on observed tick frequency</div>

            <div className='tc-actions-grid'>
                <button type='button' className='tc-panel tc-action tc-action--settings' onClick={() => { setSettingsError(''); setSettingsOpen(true); }}>☷ <span>Settings</span></button>
                <button type='button' className='tc-panel tc-action tc-action--load' disabled>⇩ <span>Load Symbol</span></button>
            </div>
            <div className='tc-signal-note'>ACTIVE SETTINGS · Stake ${appliedSettings.stake.toFixed(2)} · Target ${appliedSettings.targetProfit.toFixed(2)}{appliedSettings.targetProfit === 0 ? ' (OFF)' : ''} · Stop Loss ${appliedSettings.stopLoss.toFixed(2)}{appliedSettings.stopLoss === 0 ? ' (OFF)' : ''} · Martingale ×{appliedSettings.martingale.toFixed(2)}</div>
            <div className='tc-start-row'><button type='button' className='tc-start-button' disabled>START TRADES</button><small>Trading execution will be connected in Phase 2</small></div>

            <section className='tc-panel tc-history-panel'>
                <div className='tc-history-columns'><span>PROFIT</span><span>STATUS</span><span>CONTRACT TYPE</span><span>STAKE</span><span>EXIT SPOT</span></div>
                <div className='tc-history-body'><div className='tc-history-title'>TRADE HISTORY <span>VIEW ALL</span></div><div className='tc-history-empty'><strong>No trades yet</strong><p>Trade history will appear here after execution is enabled.</p></div><button type='button' className='tc-history-menu' aria-label='Trade history menu' disabled>☰</button></div>
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
        </section>
    );
};

export default TradingCenter;
