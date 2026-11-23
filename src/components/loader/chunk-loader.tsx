import { LogoMark } from '@/components/layout/app-logo/LogoMark';
import './chunk-loader.scss';

export default function ChunkLoader({ message }: { message: string }) {
    return (
        <main className='odt-startup' role='status' aria-live='polite' aria-label='ODI TRADERS is starting'>
            <div className='odt-startup__glow odt-startup__glow--blue' />
            <div className='odt-startup__glow odt-startup__glow--violet' />
            <div className='odt-startup__floor' />

            <section className='odt-startup__content'>
                <div className='odt-stack-scene' aria-hidden='true'>
                    <div className='odt-stack odt-stack--base'>
                        <div className='odt-stack__rotator'>
                            <div className='odt-stack__surface odt-stack__surface--front'>
                                <div className='odt-stack__brand'>
                                    <span className='odt-stack__monogram'>ODI</span>
                                    <span className='odt-stack__brand-name'>TRADERS</span>
                                </div>
                                <span className='odt-stack__edge-light' />
                            </div>
                            <div className='odt-stack__surface odt-stack__surface--back'>
                                <span className='odt-stack__back-mark'>ODI</span>
                                <span className='odt-stack__back-copy'>TRADE SMARTER<br />TRADE SAFER</span>
                            </div>
                        </div>
                    </div>
                    <div className='odt-stack odt-stack--middle'>
                        <div className='odt-stack__rotator'>
                            <div className='odt-stack__surface odt-stack__surface--front'>
                                <div className='odt-stack__brand'>
                                    <span className='odt-stack__monogram'>ODI</span>
                                    <span className='odt-stack__brand-name'>TRADERS</span>
                                </div>
                                <span className='odt-stack__edge-light' />
                            </div>
                            <div className='odt-stack__surface odt-stack__surface--back'>
                                <span className='odt-stack__back-mark'>ODI</span>
                                <span className='odt-stack__back-copy'>TRADE SMARTER<br />TRADE SAFER</span>
                            </div>
                        </div>
                    </div>
                    <div className='odt-stack odt-stack--top'>
                        <div className='odt-stack__rotator'>
                            <div className='odt-stack__surface odt-stack__surface--front'>
                                <div className='odt-stack__brand'>
                                    <span className='odt-stack__monogram'>ODI</span>
                                    <span className='odt-stack__brand-name'>TRADERS</span>
                                </div>
                                <span className='odt-stack__edge-light' />
                            </div>
                            <div className='odt-stack__surface odt-stack__surface--back'>
                                <span className='odt-stack__back-mark'>ODI</span>
                                <span className='odt-stack__back-copy'>TRADE SMARTER<br />TRADE SAFER</span>
                            </div>
                        </div>
                    </div>
                    <div className='odt-stack__reflection' />
                    <div className='odt-stack__spark odt-stack__spark--one' />
                    <div className='odt-stack__spark odt-stack__spark--two' />
                </div>

                <div className='odt-startup__eyebrow'>THE NEXT LEVEL OF TRADING</div>
                <h1 className='odt-startup__title'>ODI <span>TRADERS</span></h1>
                <p className='odt-startup__subtitle'>Preparing your trading experience</p>

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
