import React from 'react';
import './free-bots.scss';

type TFreeBotsProps = {
    onOpenBotBuilder: () => void;
};

const FreeBots = ({ onOpenBotBuilder }: TFreeBotsProps) => (
    <section className='free-bots'>
        <div className='free-bots__heading'>
            <span className='free-bots__eyebrow'>ODI TRADERS</span>
            <h1>Free Bots</h1>
            <p>Explore ready-made trading strategies.</p>
        </div>

        <div className='free-bots__cards'>
            <article className='free-bots__card'>
                <span className='free-bots__badge'>PREMIUM</span>

                <div className='free-bots__title-row'>
                    <span className='free-bots__accent' aria-hidden='true' />
                    <span className='free-bots__icon' aria-hidden='true'>🤖</span>
                    <h2>Iconic Bot</h2>
                </div>

                <p className='free-bots__description'>
                    Bot Builder engine · Ready-to-use trading strategy
                </p>

                <div className='free-bots__rating' aria-label='5 out of 5 stars'>
                    <span>★</span><span>★</span><span>★</span><span>★</span><span>★</span>
                </div>

                <button className='free-bots__open' type='button' onClick={onOpenBotBuilder}>
                    OPEN ICONIC BOT
                </button>
            </article>
        </div>
    </section>
);

export default FreeBots;
