import { useEffect, useRef } from 'react';
import './chunk-loader.scss';

type ChunkLoaderProps = {
    message: string;
    onAnimationComplete?: () => void;
};

export default function ChunkLoader({ message, onAnimationComplete }: ChunkLoaderProps) {
    const completed = useRef(false);

    const handleOrbitComplete = () => {
        if (completed.current) return;
        completed.current = true;
        onAnimationComplete?.();
    };

    // CSS animation events can be missed when a mobile browser backgrounds,
    // throttles, or restores the page during startup. Keep the full 6-second
    // orbit, then fail safe shortly afterward so the dashboard cannot remain
    // trapped behind the splash screen forever.
    useEffect(() => {
        const fallbackTimer = window.setTimeout(handleOrbitComplete, 6500);
        return () => window.clearTimeout(fallbackTimer);
    }, []);

    return (
        <main className='odt-startup' role='status' aria-live='polite' aria-label='ODI TRADERS is starting'>
            <div className='odt-startup__ambient odt-startup__ambient--left' />
            <div className='odt-startup__ambient odt-startup__ambient--right' />
            <div className='odt-startup__falling-stars' aria-hidden='true'>
                <span className='odt-startup__star odt-startup__star--one'>★</span>
                <span className='odt-startup__star odt-startup__star--two'>✦</span>
                <span className='odt-startup__star odt-startup__star--three'>★</span>
                <span className='odt-startup__star odt-startup__star--four'>✧</span>
                <span className='odt-startup__star odt-startup__star--five'>★</span>
                <span className='odt-startup__star odt-startup__star--six'>✦</span>
                <span className='odt-startup__star odt-startup__star--seven'>✧</span>
                <span className='odt-startup__star odt-startup__star--eight'>★</span>
                <span className='odt-startup__star odt-startup__star--nine'>✦</span>
            </div>
            <div className='odt-startup__top-ribbons' aria-hidden='true'>
                <span className='odt-startup__top-ribbon odt-startup__top-ribbon--one' />
                <span className='odt-startup__top-ribbon odt-startup__top-ribbon--two' />
                <span className='odt-startup__top-ribbon odt-startup__top-ribbon--three' />
                <span className='odt-startup__top-ribbon odt-startup__top-ribbon--glint' />
            </div>
            <div className='odt-startup__bottom-arc' aria-hidden='true' />
            <div className='odt-startup__bottom-ribbon' aria-hidden='true' />
            <div className='odt-startup__gold-dust' aria-hidden='true' />

            <section className='odt-startup__content'>
                <div className='odt-startup__symbol'>
                    <div className='odt-startup__inner-ring' />
                    <div className='odt-startup__orbit' onAnimationEnd={handleOrbitComplete}>
                        <span className='odt-startup__orb' />
                    </div>
                    <div className='odt-startup__center-glow' />
                    <div className='odt-startup__brand-lockup'>
                        <h1 className='odt-startup__title'><span>ODI</span> TRADERS</h1>
                        <div className='odt-startup__eyebrow'>THE NEXT LEVEL OF TRADING</div>
                    </div>
                </div>

                <p className='odt-startup__subtitle'>Preparing your trading experience</p>

                <div className='odt-startup__loading'>
                    <span className='odt-startup__loading-message'>{message}</span>
                </div>
                <div className='odt-startup__track'><span /></div>
            </section>
        </main>
    );
}
