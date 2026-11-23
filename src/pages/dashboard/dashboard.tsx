import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useDevice } from '@deriv-com/ui';
import { localize } from '@deriv-com/translations';
import Cards from './cards';
import './dashboard.scss';

type TMobileIconGuide = {
    handleTabChange: (active_number: number) => void;
};

const DashboardComponent = observer(({ handleTabChange }: TMobileIconGuide) => {
    const { client, dashboard } = useStore();
    const { active_tour } = dashboard;
    const { isDesktop } = useDevice();

    return (
        <div
            className={classNames('gtr-dashboard', {
                'gtr-dashboard--tour-active': active_tour,
            })}
        >
            <div className='gtr-dashboard__hero'>
                <div className='gtr-dashboard__welcome'>
                    <h1>{localize('Bom dia')}</h1>
                    <div className='gtr-dashboard__dots' aria-hidden='true'>
                        <span /><span /><span /><span /><b /><span /><span /><span /><span /><span /><span /><span />
                    </div>
                    <p>“Cut losses short, let winners run.”</p>
                </div>

                <button
                    className='gtr-dashboard__announcement'
                    type='button'
                    aria-label={localize('Announcements')}
                    onClick={() => client.is_logged_in && handleTabChange(0)}
                >
                    <span>📣</span>
                </button>
            </div>

            <section className='gtr-dashboard__actions'>
                <div className='gtr-dashboard__section-title'>
                    <span />
                    <h2>QUICK ACTIONS</h2>
                    <span />
                </div>

                <Cards has_dashboard_strategies={false} is_mobile={!isDesktop} />
            </section>

            <section className='gtr-dashboard__partner'>
                <div>
                    <small>PARTNER REFERRAL</small>
                    <h3>Master Partner share</h3>
                    <button type='button' className='gtr-dashboard__learn-more'>
                        Learn more ↓
                    </button>
                </div>
                <button type='button' className='gtr-dashboard__refer'>
                    Refer a partner →
                </button>
            </section>

            <div className='gtr-dashboard__risk'>⚠ Risk Disclaimer</div>

            <button className='gtr-dashboard__ai' type='button' aria-label='AI assistant'>
                <span>AI</span>
                <i />
            </button>
        </div>
    );
});

export default DashboardComponent;
