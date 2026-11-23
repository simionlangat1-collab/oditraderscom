import { useRef } from 'react';
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

    return (
        <main className='odt-startup' role='status' aria-live='polite' aria-label='ODI TRADERS is starting'>
            <div className='odt-startup__ambient odt-startup__ambient--left' />
            <div className='odt-startup__ambient odt-startup__ambient--right' />

            <section className='odt-startup__content'>
                <div className='odt-startup__symbol' aria-hidden='true'>
                    <div className='odt-startup__inner-ring' />
                    <div className='odt-startup__orbit' onAnimationEnd={handleOrbitComplete}>
                        <span className='odt-startup__orb' />
                    </div>
                    <div className='odt-startup__center-glow' />
                </div>

                <h1 className='odt-startup__title'><span>ODI</span> TRADERS</h1>
                <div className='odt-startup__eyebrow'>THE NEXT LEVEL OF TRADING</div>
                <p className='odt-startup__subtitle'>Preparing your trading experience</p>

                <div className='odt-startup__loading'>
                    <span className='odt-startup__loading-message'>{message}</span>
                </div>
                <div className='odt-startup__track'><span /></div>
            </section>
        </main>
    );
}
