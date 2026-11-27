import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isDemoAccount } from '@/utils/account-helpers';
import { api_base } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import './trading-center.scss';

type TickPoint = { quote: number; epoch: number; digit: number };
type TradeRecord = { id: number; contractId: number; contractType: 'DIGITEVEN' | 'DIGITODD'; stake: number; profit: number; status: 'OPEN' | 'WON' | 'LOST'; exitSpot?: number };

const SYMBOLS = [
    { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
    { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
    { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
    { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
    { value: '1HZ90V', label: 'Volatility 90 (1s) Index' },
    { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
];

const MAX_PENDING_PURCHASES = 3;

const durationToSeconds = (duration: unknown) => {
    const match = String(duration ?? '').match(/^(\d+)([smhd])$/);
    if (!match) return null;
    const unitSeconds: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return Number(match[1]) * unitSeconds[match[2]];
};

const getLastDigit = (quote: number, precision = 2) => {
    const formatted = Number(quote).toFixed(Math.max(0, Math.min(8, precision)));
    return Number(formatted.replace('.', '').slice(-1));
};

const TradingCenter = ({ onExit }: { onExit: () => void }) => {
    const { connectionStatus, authData, activeLoginid } = useApiBase();
    const [accountBalance, setAccountBalance] = useState<number | null>(null);
    const [accountCurrency, setAccountCurrency] = useState('USD');
    const [isDemoAccountState, setIsDemoAccountState] = useState<boolean | null>(null);
    const [symbol, setSymbol] = useState('1HZ25V');
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
    const [stopLossReachedAmount, setStopLossReachedAmount] = useState<number | null>(null);
    const [executionMessage, setExecutionMessage] = useState('Demo account required. Select EVEN or ODD to begin.');
    const contractMap = useRef(new Map<number, number>());
    const contractSubscriptionMap = useRef(new Map<number, string>());
    const tradeSequence = useRef(0);
    const sessionProfitRef = useRef(0);
    const nextStakeRef = useRef(1);
    const tradingRef = useRef(false);
    const pendingPurchaseCountRef = useRef(0);
    const contractAvailabilityPromiseRef = useRef<Promise<void> | null>(null);
    const checkedContractAvailabilityRef = useRef(new Set<string>());
    const targetStopTriggeredRef = useRef(false);
    const tradeGenerationRef = useRef(0);
    const buyRequestInFlightRef = useRef(false);
    const targetProfitPopupShownRef = useRef(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const soundEnabledRef = useRef(true);
    const soundQueueRef = useRef<Array<'WON' | 'LOST'>>([]);
    const soundPlayingRef = useRef(false);
    const [soundEnabled, setSoundEnabled] = useState(true);

    const playNextTradeSoundRef = useRef<() => void>(() => undefined);
    playNextTradeSoundRef.current = () => {
        const context = audioContextRef.current;
        if (!context || context.state !== 'running' || soundPlayingRef.current || soundQueueRef.current.length === 0) return;
        const result = soundQueueRef.current.shift();
        if (!result) return;
        soundPlayingRef.current = true;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(result === 'WON' ? 880 : 220, context.currentTime);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
            soundPlayingRef.current = false;
            playNextTradeSoundRef.current();
        };
        oscillator.start();
        oscillator.stop(context.currentTime + 0.3);
    };

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
            const subscriptionId = contractSubscriptionMap.current.get(contractId);
            if (subscriptionId) {
                contractSubscriptionMap.current.delete(contractId);
                api.send({ forget: subscriptionId }).catch(() => undefined);
            }
            const profit = Number((Number(contract.sell_price) - Number(contract.buy_price)).toFixed(2));
            if (!Number.isFinite(profit)) return;
            sessionProfitRef.current = Number((sessionProfitRef.current + profit).toFixed(2));
            setSessionProfit(sessionProfitRef.current);
            const status = profit > 0 ? 'WON' : 'LOST';
            setTradeHistory(rows => rows.map(row => row.id === tradeId ? { ...row, profit, status, exitSpot: Number(contract.exit_tick) } : row));
            setLatestTradeResult({ profit, status });
            if (soundEnabledRef.current) {
                soundQueueRef.current.push(status);
                playNextTradeSoundRef.current();
            }
            nextStakeRef.current = profit < 0 ? Number((nextStakeRef.current * appliedSettings.martingale).toFixed(2)) : appliedSettings.stake;
            const targetReached = appliedSettings.targetProfit > 0 && sessionProfitRef.current >= appliedSettings.targetProfit;
            const stopLossReached = appliedSettings.stopLoss > 0 && sessionProfitRef.current <= -appliedSettings.stopLoss;
            if (targetReached) {
                targetStopTriggeredRef.current = true;
                tradeGenerationRef.current += 1;
                if (!targetProfitPopupShownRef.current) {
                    targetProfitPopupShownRef.current = true;
                    setTargetProfitAchieved(sessionProfitRef.current);
                    setStopLossReachedAmount(null);
                }
                tradingRef.current = false;
                setIsTrading(false);
                setExecutionMessage('Target Profit achieved. New trades stopped; open contracts remain monitored.');
            } else if (stopLossReached) {
                targetStopTriggeredRef.current = true;
                tradeGenerationRef.current += 1;
                tradingRef.current = false;
                setIsTrading(false);
                setStopLossReachedAmount(sessionProfitRef.current);
                setTargetProfitAchieved(null);
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
        if (contractMap.current.size > 0) {
            setExecutionMessage('Wait for all existing contracts to settle before starting a new session.');
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
        const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
        if (!audioContextRef.current && AudioContextConstructor) {
            audioContextRef.current = new AudioContextConstructor();
        }
        void audioContextRef.current?.resume();
        sessionProfitRef.current = 0;
        nextStakeRef.current = appliedSettings.stake;
        setSessionProfit(0);
        setTradeCount(0);
        setTradeHistory([]);
        setLatestTradeResult(null);
        targetProfitPopupShownRef.current = false;
        targetStopTriggeredRef.current = false;
        tradeGenerationRef.current += 1;
        buyRequestInFlightRef.current = false;
        setTargetProfitAchieved(null);
        setStopLossReachedAmount(null);
        tradingRef.current = true;
        setIsTrading(true);
        setExecutionMessage('Demo trading active · one purchase cycle every second.');
    };

    useEffect(() => {
        if (!isTrading) return undefined;
        let stopped = false;
        const placeTrade = async () => {
            let purchaseCycleReleased = false;
            if (stopped || !tradingRef.current || targetStopTriggeredRef.current) return;
            // Never allow two scheduler cycles to cross the final BUY gate together.
            if (buyRequestInFlightRef.current) return;
            const cycleGeneration = tradeGenerationRef.current;
            // Bound outstanding proposal/buy cycles so a slow connection cannot build a delayed burst.
            if (pendingPurchaseCountRef.current >= MAX_PENDING_PURCHASES) return;
            // Contract settlement is tracked independently; an open contract must not block this 1-second scheduler cycle.

            // Re-check the session limits at the point of execution, not only on settlement.
            const profitLimitReached = appliedSettings.targetProfit > 0 && sessionProfitRef.current >= appliedSettings.targetProfit;
            const lossLimitReached = appliedSettings.stopLoss > 0 && sessionProfitRef.current <= -appliedSettings.stopLoss;
            if (profitLimitReached || lossLimitReached) {
                targetStopTriggeredRef.current = true;
                tradeGenerationRef.current += 1;
                tradingRef.current = false;
                setIsTrading(false);
                if (profitLimitReached) {
                    targetProfitPopupShownRef.current = true;
                    setTargetProfitAchieved(sessionProfitRef.current);
                    setStopLossReachedAmount(null);
                } else {
                    setStopLossReachedAmount(sessionProfitRef.current);
                    setTargetProfitAchieved(null);
                }
                setExecutionMessage(profitLimitReached
                    ? 'Target Profit reached. Trading permanently stopped for this session.'
                    : 'Stop Loss reached. Trading permanently stopped for this session.');
                return;
            }

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
            const contractType = selectedContract === 'EVEN' ? 'DIGITEVEN' : 'DIGITODD';
            const stakeAmount = Math.max(0.35, Number(nextStakeRef.current.toFixed(2)));
            pendingPurchaseCountRef.current += 1;
            try {
                // Verify availability once per symbol/type. If several scheduler cycles arrive
                // while this request is still in flight, they share the same promise instead
                // of sending duplicate contracts_for requests.
                const availabilityKey = `${symbol}:${contractType}`;
                if (!checkedContractAvailabilityRef.current.has(availabilityKey)) {
                    if (!contractAvailabilityPromiseRef.current) {
                        contractAvailabilityPromiseRef.current = (async () => {
                            const contractsResponse: any = await api.send({ contracts_for: symbol });
                            if (contractsResponse?.error) {
                                const code = contractsResponse.error.code ? ` (${contractsResponse.error.code})` : '';
                                throw new Error(`Unable to verify contract availability: ${contractsResponse.error.message || 'Deriv returned an error'}${code}`);
                            }
                            const availableContracts = contractsResponse?.contracts_for?.available;
                            if (!Array.isArray(availableContracts)) {
                                throw new Error('Deriv did not return contract availability for this market.');
                            }
                            const matchingContract = availableContracts.find((item: any) => item.contract_type === contractType);
                            if (!matchingContract) {
                                throw new Error(`${contractType} is not currently offered on ${symbol}. No trade was placed.`);
                            }
                            checkedContractAvailabilityRef.current.add(availabilityKey);
                        })().finally(() => {
                            contractAvailabilityPromiseRef.current = null;
                        });
                    }
                    await contractAvailabilityPromiseRef.current;
                    if (stopped || !tradingRef.current || targetStopTriggeredRef.current || tradeGenerationRef.current !== cycleGeneration) return;
                }

                const proposalResponse: any = await api.send({
                    proposal: 1, amount: stakeAmount, basis: 'stake', contract_type: contractType,
                    currency: accountCurrency, duration: 1, duration_unit: 't', underlying_symbol: symbol, subscribe: 1,
                });
                if (stopped || !tradingRef.current || targetStopTriggeredRef.current || tradeGenerationRef.current !== cycleGeneration) return;

                // Lock the final purchase section so overlapping scheduler cycles cannot
                // race through the stop check and both initiate a BUY.
                if (buyRequestInFlightRef.current) return;
                buyRequestInFlightRef.current = true;

                // Final hard gate: never send a buy after either session limit has been reached.
                const profitLimitReachedBeforeBuy = appliedSettings.targetProfit > 0 && sessionProfitRef.current >= appliedSettings.targetProfit;
                const lossLimitReachedBeforeBuy = appliedSettings.stopLoss > 0 && sessionProfitRef.current <= -appliedSettings.stopLoss;
                if (profitLimitReachedBeforeBuy || lossLimitReachedBeforeBuy || targetStopTriggeredRef.current || tradeGenerationRef.current !== cycleGeneration || stopped || !tradingRef.current) {
                    targetStopTriggeredRef.current = true;
                    tradeGenerationRef.current += 1;
                    tradingRef.current = false;
                    setIsTrading(false);
                    if (profitLimitReachedBeforeBuy) {
                        targetProfitPopupShownRef.current = true;
                        setTargetProfitAchieved(sessionProfitRef.current);
                        setStopLossReachedAmount(null);
                    } else if (lossLimitReachedBeforeBuy) {
                        setStopLossReachedAmount(sessionProfitRef.current);
                        setTargetProfitAchieved(null);
                    }
                    setExecutionMessage(profitLimitReachedBeforeBuy
                        ? 'Target Profit reached. No further purchases will be sent.'
                        : 'Stop Loss reached. No further purchases will be sent.');
                    return;
                }

                if (proposalResponse?.error || !proposalResponse?.proposal?.id) {
                    const proposalError = proposalResponse?.error;
                    const errorCode = proposalError?.code ? ` (${proposalError.code})` : '';
                    throw new Error(`${proposalError?.message || 'No valid proposal returned by Deriv.'}${errorCode}`);
                }
                const buyResponse: any = await api.send({ buy: proposalResponse.proposal.id, price: Number(proposalResponse.proposal.ask_price) });
                if (buyResponse?.error || !buyResponse?.buy?.contract_id) {
                    throw new Error(buyResponse?.error?.message || 'Deriv did not confirm the purchase.');
                }
                const buy = buyResponse.buy;
                const contractId = Number(buy.contract_id);
                const id = ++tradeSequence.current;
                contractMap.current.set(contractId, id);
                setTradeCount(count => count + 1);
                setTradeHistory(rows => [{ id, contractId, contractType, stake: Number(buy.buy_price ?? stakeAmount), profit: 0, status: 'OPEN' }, ...rows].slice(0, 50));

                // The purchase cycle ends as soon as BUY succeeds. Settlement tracking is
                // deliberately detached so a slow tracker cannot block the next 1-second
                // scheduler cycle.
                pendingPurchaseCountRef.current = Math.max(0, pendingPurchaseCountRef.current - 1);
                purchaseCycleReleased = true;

                void api.send({
                    proposal_open_contract: 1,
                    contract_id: contractId,
                    subscribe: 1,
                }).then((trackingResponse: any) => {
                    if (trackingResponse?.subscription?.id) {
                        contractSubscriptionMap.current.set(contractId, String(trackingResponse.subscription.id));
                    }
                    if (trackingResponse?.error) {
                        throw new Error(trackingResponse.error.message || 'Unable to subscribe to the contract settlement.');
                    }
                }).catch((trackingError: any) => {
                    if (!contractMap.current.has(contractId)) return;
                    tradingRef.current = false;
                    setIsTrading(false);
                    setExecutionMessage(trackingError?.message || 'Unable to track the purchased contract. New trades stopped for safety.');
                });
            } catch (error: any) {
                tradingRef.current = false;
                setIsTrading(false);
                setExecutionMessage(error?.message || 'Trade request failed. Trading stopped for safety.');
            } finally {
                buyRequestInFlightRef.current = false;
                if (!purchaseCycleReleased) {
                    pendingPurchaseCountRef.current = Math.max(0, pendingPurchaseCountRef.current - 1);
                }
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
    const completedTradeHistory = tradeHistory.filter(item => item.status !== 'OPEN');
    const activeTrade = tradeHistory.find(item => item.status === 'OPEN');

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
                <button type='button' className='tc-panel tc-stat-panel tc-stat-panel--start tc-start-button' onClick={isTrading ? () => { tradingRef.current = false; targetStopTriggeredRef.current = true; tradeGenerationRef.current += 1; setIsTrading(false); setExecutionMessage('Trading stopped. Existing contracts remain tracked.'); } : startTrading}>{isTrading && !targetStopTriggeredRef.current ? 'STOP TRADES' : 'START TRADES'}<small>{isTrading && !targetStopTriggeredRef.current ? 'RUNNING · 1s CYCLE' : 'DEMO ONLY'}</small></button>
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
            <div className='tc-signal-note'>ACTIVE SETTINGS · Result sounds {soundEnabled ? 'ON' : 'OFF'} · Stake ${appliedSettings.stake.toFixed(2)} · Target ${appliedSettings.targetProfit.toFixed(2)}{appliedSettings.targetProfit === 0 ? ' (OFF)' : ''} · Stop Loss ${appliedSettings.stopLoss.toFixed(2)}{appliedSettings.stopLoss === 0 ? ' (OFF)' : ''} · Martingale ×{appliedSettings.martingale.toFixed(2)}</div>

            <section className='tc-panel tc-history-panel'>
                {activeTrade && <div className='tc-history-body tc-active-trade'><div className='tc-history-title'>CURRENT TRADE <span>IN PROGRESS</span></div><div className='tc-history-columns'><span>PROFIT</span><span>STATUS</span><span>CONTRACT TYPE</span><span>STAKE</span><span>EXIT SPOT</span></div><div className='tc-trade-list'><div className='tc-trade-row tc-trade-row--open' key={activeTrade.id}><strong>—</strong><span>OPEN</span><span>{activeTrade.contractType === 'DIGITEVEN' ? 'EVEN' : 'ODD'}</span><span>{activeTrade.stake.toFixed(2)}</span><span>—</span></div></div></div>}
                <div className='tc-history-columns'><span>PROFIT</span><span>STATUS</span><span>CONTRACT TYPE</span><span>STAKE</span><span>EXIT SPOT</span></div>
                <div className='tc-history-body'><div className='tc-history-title'>TRADE HISTORY <span>COMPLETED</span></div><div className='tc-history-empty'>{completedTradeHistory.length === 0 ? <><strong>No completed trades yet</strong><p>Settled win and loss results will appear here.</p></> : <div className='tc-trade-list'>{completedTradeHistory.map(item => <div className={`tc-trade-row tc-trade-row--${item.status.toLowerCase()}`} key={item.id}><strong>{(item.profit > 0 ? '+' : '') + item.profit.toFixed(2)}</strong><span>{item.status}</span><span>{item.contractType === 'DIGITEVEN' ? 'EVEN' : 'ODD'}</span><span>{item.stake.toFixed(2)}</span><span>{item.exitSpot ?? '—'}</span></div>)}</div>}</div><button type='button' className='tc-history-menu' aria-label='Trade history menu' disabled>☰</button></div>
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
                        <label
                            className='tc-sound-toggle'
                            style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem', padding: '1rem', border: '1px solid #118d73', borderRadius: '1rem', background: '#0b2035', color: '#f5fbff' }}
                        >
                            <input
                                type='checkbox'
                                checked={soundEnabled}
                                style={{ width: '1.25rem', height: '1.25rem', accentColor: '#1bd9a2' }}
                                onChange={event => {
                                    soundEnabledRef.current = event.target.checked;
                                    setSoundEnabled(event.target.checked);
                                    if (!event.target.checked) soundQueueRef.current = [];
                                }}
                            />
                            <span style={{ display: 'flex', flexDirection: 'column', gap: '.2rem' }}><strong>Trade result sounds</strong><small style={{ color: '#91adbf' }}>WIN: Ding · LOSS: Doo</small></span>
                            <b style={{ marginLeft: 'auto', color: soundEnabled ? '#1bd9a2' : '#91adbf' }}>{soundEnabled ? 'ON' : 'OFF'}</b>
                        </label>
                        {settingsError && <p className='tc-error' role='alert'>{settingsError}</p>}
                        <footer className='tc-settings-actions'><button type='button' className='tc-reset-button' onClick={resetSettings}>RESET</button><button type='button' className='tc-apply-button' onClick={applySettings}>APPLY SETTINGS</button></footer>
                        <p className='tc-settings-note'>Target Profit or Stop Loss set to 0 disables that limit. Stake must be at least 0.35; Martingale must be 1 or greater.</p>
                    </section>
                </div>
            )}

            {(targetProfitAchieved !== null || stopLossReachedAmount !== null) && (
                <div
                    className='tc-iconic-backdrop'
                    role='presentation'
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) {
                            setTargetProfitAchieved(null);
                            setStopLossReachedAmount(null);
                        }
                    }}
                >
                    <section
                        className={'tc-iconic-modal ' + (targetProfitAchieved !== null ? 'tc-iconic-modal--profit' : 'tc-iconic-modal--loss')}
                        role='dialog'
                        aria-modal='true'
                        aria-labelledby='tc-iconic-title'
                        aria-describedby='tc-iconic-description'
                    >
                        <button
                            type='button'
                            className='tc-iconic-close'
                            aria-label='Close notification'
                            onClick={() => {
                                setTargetProfitAchieved(null);
                                setStopLossReachedAmount(null);
                            }}
                        >×</button>
                        <div className='tc-iconic-brand' aria-hidden='true'>♛ ICONIC BOT</div>
                        <div className='tc-iconic-trophy' aria-hidden='true'>{targetProfitAchieved !== null ? '🏆' : '🛑'}</div>
                        <div className='tc-iconic-titlebar'>
                            <span aria-hidden='true'>{targetProfitAchieved !== null ? '✓' : '!'}</span>
                            <h2 id='tc-iconic-title'>
                                {targetProfitAchieved !== null ? 'ICONIC TARGET PROFIT ACHIEVED' : 'STOP LOSS LIMIT REACHED'}
                            </h2>
                        </div>
                        <div className='tc-iconic-amount'>
                            <span>{targetProfitAchieved !== null ? 'SESSION PROFIT' : 'SESSION LOSS'}</span>
                            <strong>
                                {targetProfitAchieved !== null
                                    ? '+ ' + targetProfitAchieved.toFixed(2) + ' ' + accountCurrency
                                    : '- ' + Math.abs(stopLossReachedAmount ?? 0).toFixed(2) + ' ' + accountCurrency}
                            </strong>
                            <small>
                                {targetProfitAchieved !== null
                                    ? 'Target: ' + appliedSettings.targetProfit.toFixed(2) + ' ' + accountCurrency
                                    : 'Limit: -' + appliedSettings.stopLoss.toFixed(2) + ' ' + accountCurrency}
                            </small>
                        </div>
                        <p className='tc-iconic-message' id='tc-iconic-description'>
                            <span aria-hidden='true'>{targetProfitAchieved !== null ? '✓' : '!'}</span>
                            {targetProfitAchieved !== null
                                ? 'Trading has been stopped automatically.'
                                : 'Trading has been stopped automatically.'}
                        </p>
                        <p className='tc-iconic-submessage'>Any open contracts will continue to be monitored until settlement.</p>
                        <button
                            type='button'
                            className='tc-iconic-acknowledge'
                            onClick={() => {
                                setTargetProfitAchieved(null);
                                setStopLossReachedAmount(null);
                            }}
                        >OK</button>
                    </section>
                </div>
            )}
        </section>
    );
};

export default TradingCenter;
