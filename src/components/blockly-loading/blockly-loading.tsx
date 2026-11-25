import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';

/**
 * Blockly initialization continues in the background.
 * The six-second premium startup is the only visual startup gate, so the
 * legacy five-bar loader must never appear over the dashboard.
 */
const BlocklyLoading = observer(() => {
    const { blockly_store } = useStore();
    void blockly_store.is_loading;
    return null;
});

export default BlocklyLoading;
