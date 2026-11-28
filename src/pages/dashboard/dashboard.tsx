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

const DashboardComponent = observer(({ handleTabChange: _handleTabChange }: TMobileIconGuide) => {
    const { dashboard } = useStore();
    const { active_tour } = dashboard;
    const { isDesktop } = useDevice();

    return (
        <div className={classNames('gtr-dashboard', { 'gtr-dashboard--tour-active': active_tour })}>
            <div className='gtr-dashboard__market-art' aria-hidden='true'>
                <div className='gtr-candle gtr-candle--1' />
                <div className='gtr-candle gtr-candle--2' />
                <div className='gtr-candle gtr-candle--3' />
                <div className='gtr-candle gtr-candle--4' />
                <div className='gtr-candle gtr-candle--5' />
                <div className='gtr-candle gtr-candle--6' />
                <div className='gtr-candle gtr-candle--7' />
                <div className='gtr-candle gtr-candle--8' />
                <div className='gtr-market-line gtr-market-line--one' />
                <div className='gtr-market-line gtr-market-line--two' />
                <div className='gtr-market-glow gtr-market-glow--left' />
                <div className='gtr-market-glow gtr-market-glow--right' />
            </div>

            <div className='gtr-dashboard__hero'>
                <div className='gtr-dashboard__welcome'>
                    <h1>{localize('Only The Best')}</h1>
                    <div className='gtr-dashboard__gold-line' aria-hidden='true' />
                    <img className='gtr-dashboard__logo' src='/assets/odi-traders-logo.svg' alt='ODI Traders' />
                    <p>“Cut losses short, let winners run.”</p>
                </div>
            </div>

            <section className='gtr-dashboard__actions'>
                <div className='gtr-dashboard__section-title'>
                    <span />
                    <h2>QUICK ACTIONS</h2>
                    <span />
                </div>
                <Cards has_dashboard_strategies={false} is_mobile={!isDesktop} />
            </section>

            <div className='gtr-dashboard__footer'>
                <span>★</span>
                <strong>Trade Smart. Trade with ODI Traders!</strong>
                <span>★</span>
            </div>

            <div className='gtr-dashboard__bottom-art' aria-hidden='true'>
                <div className='gtr-wave gtr-wave--one' />
                <div className='gtr-wave gtr-wave--two' />
                <div className='gtr-stars'>• • • • • • • • • • • •</div>
            </div>
        </div>
    );
});

export default DashboardComponent;
