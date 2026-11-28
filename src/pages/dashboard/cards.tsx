import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

const Cards = observer(({ is_mobile: _is_mobile }: TCardProps) => {
    const { dashboard } = useStore();
    const { setActiveTab } = dashboard;

    const actions = [
        { id: 'bot-builder', label: 'Bot Builder', icon: '🤖', tab: DBOT_TABS.BOT_BUILDER },
        { id: 'trading-center', label: 'Trade Center', icon: '📈', tab: DBOT_TABS.TRADING_CENTER },
        { id: 'manual-trader', label: 'Manual Trader', icon: '👆', tab: DBOT_TABS.MANUAL_TRADER },
        { id: 'charts', label: 'Charts', icon: '📊', tab: DBOT_TABS.CHART },
        { id: 'tutorial', label: 'Tutorial', icon: '🎓', tab: DBOT_TABS.TUTORIAL },
        { id: 'success', label: 'Your Success', icon: '🏆', tab: null },
    ];

    return (
        <div className='gtr-action-grid'>
            {actions.map(action => (
                <button
                    key={action.id}
                    type='button'
                    className='gtr-action-card'
                    onClick={() => action.tab !== null && setActiveTab(action.tab)}
                    disabled={action.tab === null}
                >
                    <span className='gtr-action-card__icon' aria-hidden='true'>{action.icon}</span>
                    <span className='gtr-action-card__label'>{action.label}</span>
                </button>
            ))}
        </div>
    );
});

export default Cards;
