import React from 'react';
import { observer } from 'mobx-react-lite';
import Flyout from '@/components/flyout';
import { useStore } from '@/hooks/useStore';
import StopBotModal from '../dashboard/stop-bot-modal';
import Toolbar from './toolbar';
import Toolbox from './toolbox';
import './workspace.scss';

const WorkspaceWrapper = observer(() => {
    const { app, blockly_store } = useStore();
    const { onMount, onUnmount, is_loading } = blockly_store;

    React.useEffect(() => {
        onMount();

        let cancelled = false;
        let retry_timer: ReturnType<typeof setTimeout> | null = null;
        let retry_count = 0;

        const ensureWorkspace = async () => {
            if (cancelled || window.Blockly?.derivWorkspace) return;

            try {
                await app.onMount();
            } catch (error) {
                console.error('Failed to initialize Bot Builder workspace:', error);
            }

            if (cancelled || window.Blockly?.derivWorkspace) return;

            if (retry_count < 40) {
                retry_count += 1;
                retry_timer = setTimeout(ensureWorkspace, 250);
            }
        };

        void ensureWorkspace();

        return () => {
            cancelled = true;
            if (retry_timer) clearTimeout(retry_timer);
            onUnmount();
        };
    }, []);

    if (is_loading) return null;

    if (window.Blockly?.derivWorkspace)
        return (
            <React.Fragment>
                <Toolbox />
                <Toolbar />
                <Flyout />
                <StopBotModal />
            </React.Fragment>
        );

    return null;
});

export default WorkspaceWrapper;
