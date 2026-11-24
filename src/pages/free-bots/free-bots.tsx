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
            <p>Ready-to-open trading strategies.</p>
        </div>

        <div className='free-bots__cards'>
            <article className='free-bots__card'>
                <div className='free-bots__icon' aria-hidden='true'>✦</div>
                <div className='free-bots__details'>
                    <h2>Iconic Bot</h2>
                    <p className='free-bots__description'>
                        Open the Iconic Bot workspace in Bot Builder.
                    </p>
                </div>
                <button className='free-bots__open' type='button' onClick={onOpenBotBuilder}>
                    Open <span aria-hidden='true'>→</span>
                </button>
            </article>
        </div>
    </section>
);

export default FreeBots;
