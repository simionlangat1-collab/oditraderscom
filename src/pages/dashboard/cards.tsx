import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { DBOT_TABS } from '@/constants/bot-contents';

type TCardProps = {
    has_dashboard_strategies: boolean;
    is_mobile: boolean;
};

const Cards = observer(({ is_mobile }: TCardProps) => {
    const { load_modal, dashboard, quick_strategy } = useStore();
    const { toggleLoadModal, setActiveTabIndex } = load_modal;
    const { setActiveTab } = dashboard;
    const { setFormVisibility } = quick_strategy;

    const openUpload = () => {
        toggleLoadModal();
        setActiveTabIndex(is_mobile ? 0 : 1);
        setActiveTab(DBOT_TABS.BOT_BUILDER);
    };

    const openBotBuilder = () => setActiveTab(DBOT_TABS.BOT_BUILDER);

    const openQuickStrategy = () => {
        setActiveTab(DBOT_TABS.BOT_BUILDER);
        setFormVisibility(true);
    };

    const actions = [
        {
            id: 'upload-bot',
            label: 'Upload Bot',
            accent: 'orange',
            icon: '📁',
            onClick: openUpload,
        },
        {
            id: 'free-bots',
            label: 'Free Bots',
            accent: 'green',
            icon: '🤖',
            onClick: openBotBuilder,
        },
        {
            id: 'bot-editor',
            label: 'Bot Editor',
            accent: 'purple',
            icon: '🧩',
            onClick: openBotBuilder,
        },
        {
            id: 'quick-strategy',
            label: 'Quick Strategy',
            accent: 'yellow',
            icon: '⚡',
            onClick: openQuickStrategy,
        },
    ];

    return (
        <div className='gtr-action-grid'>
            {actions.map(action => (
                <button
                    key={action.id}
                    type='button'
                    className={`gtr-action-card gtr-action-card--${action.accent}`}
                    onClick={action.onClick}
                >
                    <span className='gtr-action-card__icon'>{action.icon}</span>
                    <span className='gtr-action-card__label'>{action.label}</span>
                    <span className='gtr-action-card__open'>Open →</span>
                </button>
            ))}
        </div>
    );
});

export default Cards;
