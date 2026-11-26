import { localize } from '@deriv-com/translations';
import { excludeOptionFromContextMenu, modifyContextMenu, runIrreversibleEvents } from '../../../utils';

window.Blockly.Blocks.trade_definition_targetprofit = {
    init() {
        this.jsonInit({
            message0: localize('Target Profit: %1'),
            args0: [
                {
                    type: 'field_number',
                    name: 'ICONIC_TARGET_PROFIT',
                    value: 0,
                    min: 0,
                    precision: 0.01,
                },
            ],
            colour: window.Blockly.Colours.Base.colour,
            colourSecondary: window.Blockly.Colours.Base.colourSecondary,
            colourTertiary: window.Blockly.Colours.Base.colourTertiary,
            previousStatement: null,
            nextStatement: null,
            category: window.Blockly.Categories.Trade_Definition,
        });

        this.setMovable(false);
        this.setDeletable(false);
    },
    customContextMenu(menu) {
        const menu_items = [localize('Enable Block'), localize('Disable Block')];
        excludeOptionFromContextMenu(menu, menu_items);
        modifyContextMenu(menu);
    },
    onchange(event) {
        if (!this.workspace || window.Blockly.derivWorkspace.isFlyoutVisible || this.workspace.isDragging()) {
            return;
        }

        if (
            event.type !== window.Blockly.Events.BLOCK_CREATE &&
            event.type !== window.Blockly.Events.BLOCK_CHANGE &&
            event.type !== window.Blockly.Events.BLOCK_DRAG
        ) {
            return;
        }

        this.enforceLimitations();
    },
    enforceLimitations() {
        runIrreversibleEvents(() => {
            if (!this.isDescendantOf('trade_definition')) {
                this.unplug(false);

                const top_blocks = this.workspace.getTopBlocks();
                const trade_definition_block = top_blocks.find(block => block.type === 'trade_definition');

                if (trade_definition_block) {
                    const connection = trade_definition_block.getLastConnectionInStatement('RISK_PARAMETERS');
                    if (connection) {
                        connection.connect(this.previousConnection);
                    }
                } else {
                    this.dispose();
                }
            } else if (this.getRootBlock().getParent() !== null) {
                this.unplug(false);
            }

            if (this.disabled) {
                this.setDisabled(false);
            }
        });
    },
};

window.Blockly.JavaScript.javascriptGenerator.forBlock.trade_definition_targetprofit = () => {};
