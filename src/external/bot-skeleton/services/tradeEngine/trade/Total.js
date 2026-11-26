import { getRoundedNumber } from '@/components/shared';
import { getLocalizedErrorMessage } from '@/constants/backend-error-messages';
import { LogTypes } from '../../../constants/messages';
import { createError } from '../../../utils/error';
import { observer as globalObserver } from '../../../utils/observer';
import { info, log } from '../utils/broadcast';

const skeleton = {
    totalProfit: 0,
    totalWins: 0,
    totalLosses: 0,
    totalStake: 0,
    totalPayout: 0,
    totalRuns: 0,
};

const globalStat = {};

export default Engine =>
    class Total extends Engine {
        constructor() {
            super();
            this.sessionRuns = 0;
            this.sessionProfit = 0;
            this.riskManagement = { targetProfit: 0, stopLoss: 0, martingale: 0 };
            this.riskManagementState = {
                initialStake: null,
                multiplier: 1,
                recoveryActive: false,
                recoveryDigit: null,
                stopped: false,
            };

            globalObserver.register('statistics.clear', this.clearStatistics.bind(this));
        }

        configureRiskManagement(options = {}) {
            const asPositiveNumber = value => {
                const number = Number(value);
                return Number.isFinite(number) && number > 0 ? number : 0;
            };

            this.riskManagement = {
                targetProfit: asPositiveNumber(options.targetProfit),
                stopLoss: asPositiveNumber(options.stopLoss),
                martingale: asPositiveNumber(options.martingale),
            };
            this.sessionRuns = 0;
            this.sessionProfit = 0;
            this.riskManagementState = {
                initialStake: null,
                multiplier: 1,
                recoveryActive: false,
                recoveryDigit: null,
                stopped: false,
            };
        }

        isRiskManagementStopped() {
            return Boolean(this.riskManagementState?.stopped);
        }

        applyRiskManagement(tradeOptions) {
            const state = this.riskManagementState;
            const amount = Number(tradeOptions.amount);

            if (!Number.isFinite(amount) || amount <= 0) return tradeOptions;
            if (state.initialStake === null) state.initialStake = amount;

            const recoveryDigit = Number(tradeOptions.recoveryDigit);
            state.recoveryDigit =
                Number.isInteger(recoveryDigit) && recoveryDigit >= 0 && recoveryDigit <= 9
                    ? recoveryDigit
                    : null;

            const adjustedOptions = {
                ...tradeOptions,
                amount: getRoundedNumber(state.initialStake * state.multiplier, tradeOptions.currency),
            };

            if (state.recoveryActive && state.recoveryDigit !== null) {
                adjustedOptions.prediction = state.recoveryDigit;
            }

            return adjustedOptions;
        }

        clearStatistics() {
            this.sessionRuns = 0;
            this.sessionProfit = 0;
            if (!this.accountInfo) return;
            const { loginid: accountID } = this.accountInfo;
            globalStat[accountID] = { ...skeleton };
        }

        updateTotals(contract) {
            const { sell_price: sellPrice, buy_price: buyPrice, currency } = contract;

            const profit = getRoundedNumber(Number(sellPrice) - Number(buyPrice), currency);

            const win = profit > 0;

            const accountStat = this.getAccountStat();

            accountStat.totalWins += win ? 1 : 0;

            accountStat.totalLosses += !win ? 1 : 0;

            this.sessionProfit = getRoundedNumber(Number(this.sessionProfit) + Number(profit), currency);

            const risk_state = this.riskManagementState;
            if (risk_state) {
                if (win) {
                    risk_state.multiplier = 1;
                    risk_state.recoveryActive = false;
                } else {
                    if (this.riskManagement.martingale > 1) {
                        risk_state.multiplier *= this.riskManagement.martingale;
                    }
                    if (risk_state.recoveryDigit !== null) {
                        risk_state.recoveryActive = true;
                    }
                }

                const reached_target =
                    this.riskManagement.targetProfit > 0 &&
                    this.sessionProfit >= this.riskManagement.targetProfit;
                const reached_stop_loss =
                    this.riskManagement.stopLoss > 0 &&
                    this.sessionProfit <= -this.riskManagement.stopLoss;

                if (reached_target || reached_stop_loss) {
                    risk_state.stopped = true;
                }
            }

            accountStat.totalProfit = getRoundedNumber(Number(accountStat.totalProfit) + Number(profit), currency);

            accountStat.totalStake = getRoundedNumber(Number(accountStat.totalStake) + Number(buyPrice), currency);

            accountStat.totalPayout = getRoundedNumber(Number(accountStat.totalPayout) + Number(sellPrice), currency);

            info({
                profit,
                contract,
                accountID: this.accountInfo.loginid,
                totalProfit: accountStat.totalProfit,
                totalWins: accountStat.totalWins,
                totalLosses: accountStat.totalLosses,
                totalStake: accountStat.totalStake,
                totalPayout: accountStat.totalPayout,
            });

            log(win ? LogTypes.PROFIT : LogTypes.LOST, { currency, profit });
        }

        updateAndReturnTotalRuns() {
            this.sessionRuns++;
            const accountStat = this.getAccountStat();

            return ++accountStat.totalRuns;
        }

        /* eslint-disable class-methods-use-this */
        getTotalRuns() {
            const accountStat = this.getAccountStat();
            return accountStat.totalRuns;
        }

        getTotalProfit(toString, currency) {
            const accountStat = this.getAccountStat();

            return toString && accountStat.totalProfit !== 0
                ? getRoundedNumber(+accountStat.totalProfit, currency)
                : +accountStat.totalProfit;
        }

        /* eslint-enable */
        checkLimits(tradeOption) {
            if (!tradeOption.limitations) {
                return;
            }

            const {
                limitations: { maxLoss, maxTrades },
            } = tradeOption;

            if (maxLoss && maxTrades) {
                if (this.sessionRuns >= maxTrades) {
                    throw createError('CustomLimitsReached', getLocalizedErrorMessage('MaxTradesReached'));
                }
                if (this.sessionProfit <= -maxLoss) {
                    throw createError('CustomLimitsReached', getLocalizedErrorMessage('MaxLossReached'));
                }
            }
        }

        /* eslint-disable class-methods-use-this */
        validateTradeOptions(tradeOptions) {
            const take_profit = tradeOptions.take_profit;
            const stop_loss = tradeOptions.stop_loss;

            if (take_profit) {
                tradeOptions.limit_order.take_profit = take_profit;
            }
            if (stop_loss) {
                tradeOptions.limit_order.stop_loss = stop_loss;
            }

            return tradeOptions;
        }

        getAccountStat() {
            const { loginid: accountID } = this.accountInfo;

            if (!(accountID in globalStat)) {
                globalStat[accountID] = { ...skeleton };
            }

            return globalStat[accountID];
        }
    };
