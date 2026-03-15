export const CHANGELOG = [

    {
        version: '1.3.1',
        date: '2026-03-15',
        changes: [
            'Implement own Input Keyboard for better mobile experience.',
            'Redesigned Transaction Input display layout with Large Amount display display header.',
            'Upgraded custom 5-Row Calculator Pad with Arithmetic operators evaluation triggers.',
            'Grouped Action Grid Row (Note, Account, Date, Repeat) loaded above keypad grid layout index absolute.',
            'Continuous Default Input View state overlay loads on Category dashboard card taps sequential fittest!'
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
