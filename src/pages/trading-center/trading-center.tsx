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

const TradingCenter = () => {
    const { connectionStatus } = useApiBase();
    const [symbol, setSymbol] = useState('R_100');
    const [ticks, setTicks] = useState<TickPoint[]>([]);
    const [streamState, setStreamState] = useState<'waiting' | 'connecting' | 'live' | 'offline' | 'error'>('waiting');
    const [lastError, setLastError] = useState('');

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
                const history = prices.map((quote, index) => ({
                    quote: Number(quote),
                    epoch: Number(times[index] || 0),
                    digit: getLastDigit(Number(quote), precision),
                })).slice(-100);
                setTicks(history);
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

        api.send({
            ticks_history: symbol,
            count: 100,
            end: 'latest',
            style: 'ticks',
            subscribe: 1,
        }).then((response: any) => {
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
                const history = prices.map((quote, index) => ({
                    quote: Number(quote),
                    epoch: Number(times[index] || 0),
                    digit: getLastDigit(Number(quote), symbolPrecision),
                })).slice(-100);
                setTicks(history);
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
            if (subscriptionId) {
                api.send({ forget: subscriptionId }).catch(() => undefined);
            }
        };
    }, [connectionStatus, symbol]);

    const stats = useMemo(() => {
        const even = ticks.filter(tick => tick.digit % 2 === 0).length;
        const odd = ticks.length - even;
        return {
            even,
            odd,
            evenPercent: ticks.length ? (even / ticks.length) * 100 : 0,
            oddPercent: ticks.length ? (odd / ticks.length) * 100 : 0,
        };
    }, [ticks]);

    const latest = ticks[ticks.length - 1];
    const signal = ticks.length < 20
        ? 'Collecting data'
        : stats.evenPercent > stats.oddPercent
          ? 'Even currently leads'
          : stats.oddPercent > stats.evenPercent
            ? 'Odd currently leads'
            : 'Even / Odd balanced';

    return (
        <section className='trading-center'>
            <header className='trading-center__header'>
                <div>
                    <p className='trading-center__eyebrow'>ODITRADERS.COM · STRATEGY MONITOR</p>
                    <h1>Trading Center</h1>
                    <p className='trading-center__subtitle'>Live Even / Odd market observation</p>
                </div>
                <span className={`trading-center__status trading-center__status--${streamState}`}>
                    <span /> {streamState === 'live' ? 'LIVE TICKS' : streamState.toUpperCase()}
                </span>
            </header>

            <div className='trading-center__notice'>
                <strong>OBSERVATION MODE</strong>
                <span>Signals only. Automatic trading and contract purchases are disabled.</span>
            </div>

            <div className='trading-center__toolbar'>
                <label htmlFor='trading-center-symbol'>Market</label>
                <select id='trading-center-symbol' value={symbol} onChange={event => setSymbol(event.target.value)}>
                    {SYMBOLS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <span className='trading-center__tick-count'>{ticks.length} / 100 ticks</span>
            </div>

            {lastError && <div className='trading-center__error'>{lastError}</div>}
            {streamState === 'offline' && (
                <div className='trading-center__offline'>Connect your Deriv account to start the live tick monitor.</div>
            )}

            <div className='trading-center__metrics'>
                <article className='trading-center__metric'>
                    <span>Latest quote</span>
                    <strong>{latest ? latest.quote : '—'}</strong>
                    <small>{latest ? `Last digit: ${latest.digit}` : 'Waiting for first tick'}</small>
                </article>
                <article className='trading-center__metric trading-center__metric--even'>
                    <span>Even digits</span>
                    <strong>{stats.evenPercent.toFixed(1)}%</strong>
                    <small>{stats.even} of {ticks.length} observed ticks</small>
                </article>
                <article className='trading-center__metric trading-center__metric--odd'>
                    <span>Odd digits</span>
                    <strong>{stats.oddPercent.toFixed(1)}%</strong>
                    <small>{stats.odd} of {ticks.length} observed ticks</small>
                </article>
            </div>

            <article className='trading-center__panel'>
                <div className='trading-center__panel-heading'>
                    <div><span>STRATEGY SIGNAL</span><h2>{signal}</h2></div>
                    <span className='trading-center__signal-tag'>ESTIMATED · NOT A GUARANTEE</span>
                </div>
                <div className='trading-center__bar'>
                    <div className='trading-center__bar-even' style={{ width: `${stats.evenPercent}%` }} />
                    <div className='trading-center__bar-odd' style={{ width: `${stats.oddPercent}%` }} />
                </div>
                <div className='trading-center__bar-labels'><span>Even {stats.evenPercent.toFixed(1)}%</span><span>Odd {stats.oddPercent.toFixed(1)}%</span></div>
                <p className='trading-center__disclaimer'>Percentages describe only the latest 100 received ticks. Past digit frequency does not predict the next tick or guarantee a profitable outcome.</p>
            </article>

            <article className='trading-center__panel'>
                <div className='trading-center__panel-heading'>
                    <div><span>LAST DIGITS</span><h2>Recent tick stream</h2></div>
                    <span className='trading-center__tick-count'>Newest first</span>
                </div>
                <div className='trading-center__digits'>
                    {[...ticks].slice(-24).reverse().map((tick, index) => (
                        <span key={`${tick.epoch}-${index}`} className={tick.digit % 2 === 0 ? 'is-even' : 'is-odd'} title={String(tick.quote)}>
                            {tick.digit}
                        </span>
                    ))}
                    {!ticks.length && <p>Waiting for live tick data…</p>}
                </div>
            </article>
        </section>
    );
};

export default TradingCenter;
