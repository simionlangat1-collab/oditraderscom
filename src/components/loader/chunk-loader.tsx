import { LogoMark } from '@/components/layout/app-logo/LogoMark';
import './chunk-loader.scss';

export default function ChunkLoader({ message }: { message: string }) {
    return (
        <main className='odt-startup' role='status' aria-live='polite' aria-label='ODI TRADERS is starting'>
            <div className='odt-startup__ambient odt-startup__ambient--one' />
            <div className='odt-startup__ambient odt-startup__ambient--two' />
            <div className='odt-startup__grid' />

            <section className='odt-startup__content'>
                <div className='odt-startup__visual'>
                    <div className='odt-startup__orbit odt-startup__orbit--outer' />
                    <div className='odt-startup__orbit odt-startup__orbit--inner' />
                    <div className='odt-startup__logo'>
                        <LogoMark height={58} />
                    </div>
                    <div className='odt-startup__spark odt-startup__spark--one' />
                    <div className='odt-startup__spark odt-startup__spark--two' />
                </div>

                <div className='odt-startup__eyebrow'>THE NEXT LEVEL OF TRADING</div>
                <h1 className='odt-startup__title'>Trade with <span>precision.</span></h1>
                <p className='odt-startup__subtitle'>Your trading environment is coming online</p>

                <div className='odt-startup__market' aria-hidden='true'>
                    <div className='odt-startup__market-label'><span /> MARKET SYSTEMS INITIALIZING</div>
                    <svg viewBox='0 0 320 76' preserveAspectRatio='none'>
                        <defs>
                            <linearGradient id='odt-chart-line' x1='0' x2='1' y1='0' y2='0'>
                                <stop offset='0%' stopColor='#397bff' stopOpacity='.08' />
                                <stop offset='50%' stopColor='#4c9dff' />
                                <stop offset='100%' stopColor='#b28aff' />
                            </linearGradient>
                            <linearGradient id='odt-chart-fill' x1='0' x2='0' y1='0' y2='1'>
                                <stop offset='0%' stopColor='#4c8dff' stopOpacity='.22' />
                                <stop offset='100%' stopColor='#4c8dff' stopOpacity='0' />
                            </linearGradient>
                        </defs>
                        <path className='odt-startup__chart-area' d='M0 58 L22 51 L43 55 L65 35 L86 42 L108 25 L130 38 L151 31 L173 43 L195 18 L216 27 L238 12 L260 25 L282 8 L303 17 L320 4 L320 76 L0 76 Z' />
                        <path className='odt-startup__chart-line' d='M0 58 L22 51 L43 55 L65 35 L86 42 L108 25 L130 38 L151 31 L173 43 L195 18 L216 27 L238 12 L260 25 L282 8 L303 17 L320 4' />
                    </svg>
                </div>

                <div className='odt-startup__loading'>
                    <span className='odt-startup__loading-dot' />
                    <span className='odt-startup__loading-message'>{message}</span>
                    <span className='odt-startup__loading-pulse'><i /><i /><i /></span>
                </div>
                <div className='odt-startup__track'><span /></div>
                <div className='odt-startup__footer'><span>SECURE CONNECTION</span><span>POWERED FOR PERFORMANCE</span></div>
            </section>
        </main>
    );
}
