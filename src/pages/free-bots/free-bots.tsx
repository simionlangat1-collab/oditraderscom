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

        <article className='free-bots__card'>
            <div className='free-bots__card-top'>
                <div className='free-bots__icon' aria-hidden='true'>✦</div>
                <span className='free-bots__tag'>FREE BOT</span>
            </div>
            <h2>Iconic Bot</h2>
            <p className='free-bots__description'>
                Open the Iconic Bot workspace in Bot Builder.
            </p>
            <button className='free-bots__open' type='button' onClick={onOpenBotBuilder}>
                Open <span aria-hidden='true'>→</span>
            </button>
        </article>
    </section>
);

export default FreeBots;
