export const CHANGELOG = [
    {
        version: '0.1.4',
        date: new Date().toISOString().split('T')[0],
        changes: [
            'Added "Income Expense Analysis" tab with category-based breakdowns.',
            'Implemented interactive SVG Donut Charts for Income and Expense distribution.',
            'Restructured Capital Insights tab: logical allocation and source of capital prioritized.',
            'Cleaned up Insights UI by removing legacy/unused analytical sections.'
        ]
    },
    {
        version: '0.1.3',
        date: new Date().toISOString().split('T')[0],
        changes: [
            'Differentiated between actual and projected data in Cashflow graphs.',
            'Added a dedicated legend for Actual (solid) vs Projected (dashed) graph lines.',
            'Redesigned Cashflow metrics layout to focus on Actual figures in a single-row view.',
            'Enhanced graph Y-Axis with polished, compact numerical labels (e.g., 50k, 1M).',
            'Improved X-axis alignment by moving month labels into the SVG layer.'
        ]
    },
    {
        version: '0.1.2',
        date: new Date().toISOString().split('T')[0],
        changes: [
            'Added a dedicated tab system for Financial Insights (Cashflow and Capital).',
            'Migrated Capital insights metrics and analytics out of Accounts.',
            'Refined and reorganized Growth View and Capital Allocation visual hierarchy.'
        ]
    },
    {
        version: '0.1.1',
        date: '2026-03-11',
        changes: [
            'Added Financial Insights dashboards to track cash flow.',
            'Added PWA auto-updater feature for automatic background updates.',
            'Redesigned Settings page for a better, grouped configuration experience.',
            "Implemented a generic \"What's New\" changelog interface."
        ]
    },
    {
        version: '0.1.0',
        date: '2026-02-28',
        changes: [
            'Initial Kapapa Finance PWA release.',
            'Basic Ledger, Income, Expense, and Transaction functionality.',
            'Google Drive Cloud Backup support.'
        ]
    }
];
