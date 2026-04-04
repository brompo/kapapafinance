export const CHANGELOG = [
    {
        version: "1.4.2",
        date: "2026-04-04",
        changes: [
            'Added Activity and Future tabs to Category Detail and Transactions view.',
            'Grouped transactions by month instead of individual days for better scannability.',
            'Disabled automatic keyboard popup when editing existing transactions.'
        ]
    },
    {
        version: "1.4.1",
        date: "2026-03-15",
        changes: [
            'Restructured Insights screen to include Records, Summary, and Analysis sub-tabs.',
            'Renamed previous "Analysis" views into a dedicated "Summary" sub-page.',
            'Merged "Cashflow" and "Capital" dash-metrics into a unified consolidated "Analysis" segment.',
            'Created granular "Records" histories grouped by date with Daily headers and colored circular category icons correctly.',
            'Ensured full backward-compatible layout stability and initialized defaults protecting user presets overlays.'
        ]
    },
    {
        version: '1.4.0',
        date: '2026-03-15',
        changes: [
            'Implimented a new transaction tab in the insights page, to provide day to day transaction summary'
        ]
    },
    {
        version: '1.3.3',
        date: '2026-03-15',
        changes: [
            'Moved the Erase Data to Data Pages, so that its easy to find and use',
            'Modified the main input screen to add view transaction for easyness'
        ]
    },
    {
        version: '1.3.2',
        date: '2026-03-15',
        changes: [
            'Redesigned Transaction Input Modal with Large Amount display layout overlay.',
            'Upgraded custom 5-Row Calculator Pad with Arithmetic operators evaluate trigger states absolute securely!',
            'Grouped Action Grid Row items (Note, Account, Date, Repeat) loaded above keypad grid layout sequential safest!',
            'Defaulting Input View state overlay loaded upon dashboard card selection taps accurately sequential safest!'
        ]
    },
    {
        version: '1.3.1',
        date: '2026-03-15',
        changes: [
            'Implement own Input Keyboard for better mobile experience'
        ]
    },

    {
        version: '1.3.0',
        date: '2026-03-15',
        changes: [
            'Implemented Batch Edit Mode for transactions with a floating Action Bar for mass account, subcategory, and note updates.',
            'Added Sticky Header top-bar floating smoothly on scroll inside Category Detail view layouts.'
        ]
    },
    {
        version: '1.2.3',
        date: '2026-03-14',
        changes: [
            'Adding Visibility Setting, where you can change the visibility of the accounts and sort them differently']
    },
    {
        version: '1.2.2',
        date: '2026-03-14',
        changes: [
            'Added "Income Expense Analysis" tab with category-based breakdowns.',
            'Implemented interactive SVG Donut Charts for Income and Expense distribution.',
            'Restructured Capital Insights tab: logical allocation and source of capital prioritized.',
            'Cleaned up Insights UI by removing legacy/unused analytical sections.'
        ]
    },
    {
        version: '1.2.1',
        date: '2026-03-13',
        changes: [
            'Differentiated between actual and projected data in Cashflow graphs.',
            'Added a dedicated legend for Actual (solid) vs Projected (dashed) graph lines.',
            'Redesigned Cashflow metrics layout to focus on Actual figures in a single-row view.',
            'Enhanced graph Y-Axis with polished, compact numerical labels (e.g., 50k, 1M).',
            'Improved X-axis alignment by moving month labels into the SVG layer.'
        ]
    },
    {
        version: '1.2.0',
        date: '2026-03-12',
        changes: [
            'Added a dedicated tab system for Financial Insights (Cashflow and Capital).',
            'Migrated Capital insights metrics and analytics out of Accounts.',
            'Refined and reorganized Growth View and Capital Allocation visual hierarchy.'
        ]
    },
    {
        version: '1.1.0',
        date: '2026-03-11',
        changes: [
            'Added Financial Insights dashboards to track cash flow.',
            'Added PWA auto-updater feature for automatic background updates.',
            'Redesigned Settings page for a better, grouped configuration experience.',
            "Implemented a generic \"What's New\" changelog interface."
        ]
    },
    {
        version: '1.0.0',
        date: '2026-02-28',
        changes: [
            'Initial Kapapa Finance PWA release.',
            'Basic Ledger, Income, Expense, and Transaction functionality.',
            'Google Drive Cloud Backup support.'
        ]
    }
];
