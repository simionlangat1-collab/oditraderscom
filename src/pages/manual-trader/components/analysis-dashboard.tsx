import React, { useMemo } from 'react';
import '../analysis-tool.scss';

type TTick = { quote: number; epoch: number; digit: number };
type Props = {
    ticks: TTick[];
    selectedWindow: number;
    onWindowChange: (window: number) => void;
    marketName: string;
    tickConnection: 'connecting' | 'connected' | 'disconnected';
    tickError?: string;
    tradeResultHighlight?: { digit: number; status: 'won' | 'lost'; key: string } | null;
    barrierDigit: number;
    onTradeResultAnimationEnd?: (key: string) => void;
};

const TICK_WINDOWS = [15, 30, 60, 120, 1000];

export const ManualTraderAnalysisDashboard = ({ ticks, selectedWindow, onWindowChange, marketName, tickConnection, tickError, tradeResultHighlight, barrierDigit, onTradeResultAnimationEnd }: Props) => {
    const frequencies = useMemo(
        () => Array.from({ length: 10 }, (_, digit) => {
            const count = ticks.filter(tick => tick.digit === digit).length;
            return { digit, count, percentage: ticks.length ? (count / ticks.length) * 100 : 0 };
        }),
        [ticks]
    );
    const highestDigit = useMemo(
        () => frequencies.reduce((best, item) => item.count > best.count ? item : best, frequencies[0]),
        [frequencies]
    );
    // Rank by distinct frequency levels, not by digit number. Exact ties stay
    // in the same rank so every tied digit receives the same color.
    const rankClassByDigit = useMemo(() => {
        const distinctCounts = Array.from(new Set(frequencies.map(item => item.count))).sort((a, b) => b - a);
        const highestCount = distinctCounts[0];
        const secondHighestCount = distinctCounts[1];
        const lowestCount = distinctCounts[distinctCounts.length - 1];
        const secondLowestCount = distinctCounts[distinctCounts.length - 2];

        return new Map(
            frequencies.map(item => {
                let rankClass = '';
                if (ticks.length && item.count === highestCount) {
                    rankClass = 'is-leading';
                } else if (ticks.length && distinctCounts.length > 1 && item.count === secondHighestCount) {
                    rankClass = 'is-second';
                } else if (ticks.length && item.count === lowestCount) {
                    rankClass = 'is-lowest';
                } else if (ticks.length && distinctCounts.length > 2 && item.count === secondLowestCount) {
                    rankClass = 'is-second-lowest';
                }
                return [item.digit, rankClass];
            })
        );
    }, [frequencies, ticks.length]);
    const latestTick = ticks.length ? ticks[ticks.length - 1] : null;
    return (
        <section className='analysis-tool manual-trader-analysis'>
            <header className='analysis-tool__header'>
                <div>
                    <span className='analysis-tool__eyebrow'>ODI TRADERS · MARKET INTELLIGENCE</span>
                    <h1>Live Market Analysis</h1>
                    <p>{marketName || 'Selected Volatility Index'} · rolling latest {selectedWindow.toLocaleString()}</p>
                </div>
                <div className={`analysis-tool__status analysis-tool__status--${tickConnection}`}>
                    <span />
                    {tickConnection === 'connected' ? 'Live tick stream' : tickConnection === 'connecting' ? 'Connecting' : 'Tick stream offline'}
                </div>
            </header>

            {tickError && <div className='analysis-tool__error' role='alert'>Tick subscription error: {tickError}</div>}

            <section className='analysis-tool__overview'>
                <div className='analysis-tool__panel analysis-tool__latest'>
                    <span className='analysis-tool__panel-label'>Latest tick digit</span>
                    <strong className='analysis-tool__metric-value'>{latestTick ? latestTick.digit : '–'}</strong>
                    <span className='analysis-tool__muted'>
                        {latestTick ? `Latest quote: ${latestTick.quote}` : 'Waiting for the first tick'}
                    </span>
                    <span className='analysis-tool__muted'>The glowing cursor follows the latest digit.</span>
                </div>
                <div className='analysis-tool__panel analysis-tool__leader'>
                    <span className='analysis-tool__panel-label'>Frequency leader</span>
                    <strong className='analysis-tool__metric-value analysis-tool__metric-value--leader'>
                        {ticks.length ? `${highestDigit.digit} · ${highestDigit.percentage.toFixed(2)}%` : '–'}
                    </strong>
                    <span className='analysis-tool__muted'>Highest observed frequency in the current tick window.</span>
                </div>
            </section>

            <section className='analysis-tool__panel analysis-tool__frequency'>
                <div className='analysis-tool__section-heading'>
                    <div>
                        <h2>Digit frequency</h2>
                        <div className='analysis-tool__window-selector'>
                            <span>Distribution across the latest:</span>
                            <div className='analysis-tool__window-options' role='group' aria-label='Choose analysis tick window'>
                                {TICK_WINDOWS.map(windowSize => (
                                    <button
                                        key={windowSize}
                                        type='button'
                                        className={`analysis-tool__window-button ${selectedWindow === windowSize ? 'is-selected' : ''}`}
                                        aria-pressed={selectedWindow === windowSize}
                                        onClick={() => onWindowChange(windowSize)}
                                    >{windowSize}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <span className='analysis-tool__selected-window' aria-live='polite'>{selectedWindow}</span>
                </div>
                <div className='analysis-tool__digit-grid'>
                    {frequencies.map(item => (
                        <div
                            className={[
                                'analysis-tool__digit-card',
                                rankClassByDigit.get(item.digit) || '',
                                latestTick?.digit === item.digit ? 'is-current' : '',
                                tradeResultHighlight?.digit === item.digit && tradeResultHighlight.status === 'won' ? 'is-trade-win' : '',
                                tradeResultHighlight?.digit === item.digit && tradeResultHighlight.status === 'lost' ? 'is-trade-loss' : '',
                            ].filter(Boolean).join(' ')}
                            key={tradeResultHighlight?.digit === item.digit ? tradeResultHighlight.key : item.digit}
                        >
                            <div
                                className={`analysis-tool__digit-circle ${item.digit === barrierDigit ? 'is-barrier' : ''} ${tradeResultHighlight?.digit === item.digit ? `is-trade-result is-trade-result-${tradeResultHighlight.status}` : ''}`}
                                onAnimationEnd={() => {
                                    if (tradeResultHighlight?.digit === item.digit) {
                                        onTradeResultAnimationEnd?.(tradeResultHighlight.key);
                                    }
                                }}
                                style={tradeResultHighlight?.digit === item.digit ? {
                                    background: tradeResultHighlight.status === 'won' ? '#d4a017' : '#dc2626',
                                    borderColor: tradeResultHighlight.status === 'won' ? '#f5cf55' : '#fb7185',
                                    color: '#ffffff',
                                    boxShadow: tradeResultHighlight.status === 'won'
                                        ? '0 0 .25rem #f5cf55, 0 0 1.8rem #d4a017, inset 0 0 1.2rem rgba(255,255,255,.28)'
                                        : '0 0 .25rem #fb7185, 0 0 1.8rem #dc2626, inset 0 0 1.2rem rgba(255,255,255,.22)',
                                    animation: tradeResultHighlight.status === 'won'
                                        ? 'manual-trader-trade-win 520ms ease-in-out 2 both'
                                        : 'manual-trader-trade-loss 520ms ease-in-out 2 both',
                                    zIndex: 3,
                                } : undefined}
                            >
                                <span className='analysis-tool__digit-number'>{item.digit}</span>
                                <strong className='analysis-tool__digit-percentage'>{item.percentage.toFixed(1)}%</strong>
                                {latestTick?.digit === item.digit && <span className='analysis-tool__tick-cursor' aria-label='Latest tick' />}
                            </div>
                            <span>{item.count.toLocaleString()} ticks</span>
                            <div className='analysis-tool__bar'><i style={{ width: `${item.percentage}%` }} /></div>
                        </div>
                    ))}
                </div>
            </section>
        </section>
    );
};
