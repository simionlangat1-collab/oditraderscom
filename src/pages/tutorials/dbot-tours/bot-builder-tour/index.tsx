type TBotBuilderTourHandler = {
    is_mobile: boolean;
};

// ODI TRADERS: permanently disable the automatic Bot Builder welcome tour.
// Users can still access learning material from the Tutorials tab.
const BotBuilderTourHandler = (_props: TBotBuilderTourHandler) => null;

export default BotBuilderTourHandler;
