export const CHANGELOG = [
    {
        version: "2.10.0",
        date: "2026-07-19",
        changes: [
            'Added "Transfer Between Buckets" to the Flow tab (bottom of the screen) — move Balance directly from one Lifestyle bucket or Growth pool to another, for when one runs dry and another is carrying a surplus.',
            'Transfers shift each bucket\'s Opening Balance by the moved amount, so it\'s a clean, reversible move that doesn\'t touch any other month\'s numbers. Upkeep can\'t be a transfer endpoint since its Balance has no movable top-up.',
        ]
    },
    {
        version: "2.9.2",
        date: "2026-07-14",
        changes: [
            'Growth pools can now be flagged "Funds Upkeep" (Edit Category, Growth type) — the pool goes silent (no more transactions against it) and its monthly distribution redirects into Upkeep\'s Balance instead of its own, so Upkeep\'s Flow card now shows Distribution, the funding pool\'s amount, and Balance (Distribution + funded amount − Expense) as three separate lines.',
            'Flipping the flag on immediately folds the pool\'s entire accumulated Balance into Upkeep (no manual transfer needed), and only one Growth pool can hold the flag at a time.',
        ]
    },
    {
        version: "2.9.1",
        date: "2026-07-14",
        changes: [
            'Flow cards now show a red "Expense" line under B/F whenever a category had real spend in the viewed period, for Upkeep, Lifestyle buckets, and Growth pools.',
            'Fixed a data-loss bug: a background app update could reload the page while an encrypted save was still writing to storage, silently discarding whatever you\'d just added (e.g. a transaction) — saves now finish before an update reload happens.',
            'Fixed a bug where renaming a category (Edit Card → Category Name) orphaned all of its existing transactions — they kept the old category name and silently dropped out of Balance/Spent, which could look like the transactions had disappeared. Renaming now re-points them to the new name.',
        ]
    },
    {
        version: "2.9.0",
        date: "2026-07-14",
        changes: [
            'Lifestyle buckets and Growth pools now support an Opening Balance — a one-time top-up added straight into Balance, for money a bucket already held before you started tracking it here, so you don\'t have to backfill old transactions.',
            'Opening Balance can be set from either the Flow tab\'s quick-edit (tap a card\'s pencil) or the "Edit Category" card, alongside the Monthly Target/Growth percent field.',
        ]
    },
    {
        version: "2.8.0",
        date: "2026-07-14",
        changes: [
            'Lifestyle bucket Monthly Targets are now month-scoped, like Growth pool percentages already were — editing one month\'s target no longer rewrites every other month, and later months just inherit the last-set value until they get their own edit.',
            'Fixed a bug where editing a category\'s Monthly Target or Growth percent from the "Edit Category" card always wrote to today\'s real calendar month instead of whichever month you were viewing — causing edits made while viewing one month (e.g. December) to silently overwrite edits made while viewing another (e.g. January).',
        ]
    },
    {
        version: "2.7.0",
        date: "2026-07-14",
        changes: [
            'Flow cards now show "B/F" (balance brought forward from last period) under the name, and "Balance" (the running balance after this period\'s distribution) under the amount — replacing the old single "Balance" line and, on Lifestyle cards, the "Budget" tag.',
        ]
    },
    {
        version: "2.5.0",
        date: "2026-07-13",
        changes: [
            'Growth pools can now be spent from directly — tap a pool in Transactions and add a real Expenditure (with an account), exactly like Lifestyle buckets, instead of only being auto-funded.',
            'Removed the virtual "Withdraw from Growth" action in Accounts — real Expenditure covers that need directly, so there\'s no separate bookkeeping-only event to keep track of anymore.',
            'Growth pool Balance and Spent totals now come from real transactions, and show up again in Insights\' cash flow/Breakeven views.',
            'Growth rows in Flow now show their name with percent inline (e.g. "Investments (50%)"), and are sorted by percent so the highest-priority pool is always on top.',
            'Lifestyle and Growth rows in Flow can be tapped to edit their Budget/Percent directly, without needing to go to Transactions.',
        ]
    },
    {
        version: "2.4.0",
        date: "2026-07-13",
        changes: [
            'Renamed Money Flow to Flow, and split it from Transactions: Transactions is now the single place to log real Expenditures; Flow is a read-only report showing how Income automatically distributes across Upkeep, Lifestyle, and Growth.',
            'Distribution is automatic — recognizing Income cascades it through Upkeep (sum of Expense budgets) → Lifestyle buckets (priority order) → Growth pools (percent of surplus), same math as before but now feeding a running Balance per category that rolls over month to month.',
            'Growth pools can be withdrawn from (Accounts → Withdraw from Growth) — the only manual, purely virtual money event; nothing here ever touches a real Account balance.',
            'Lifestyle and Growth cards in Transactions now show both Total Spent/Withdrawn and current Balance, so you can see what you have left before adding a transaction.',
            'Flow now has its own Year/Month view switcher (tap the period label), independent of the Transactions month picker.',
            'Flow\'s chart is now a solid, color-coded pie (Upkeep/Lifestyle/Growth) with on-slice percentages, replacing the earlier plain ring.',
            'Redesigned the bottom navigation icons for visual consistency across all five tabs.',
        ]
    },
    {
        version: "2.3.0",
        date: "2026-07-12",
        changes: [
            'Growth pools are no longer fixed to 3 — added "+ Add" and per-pool delete to the Growth section, so you can add/remove your own pools alongside the percentage split.',
            'Fixed Growth pool cards rendering left-aligned instead of centered.',
        ]
    },
    {
        version: "2.2.0",
        date: "2026-07-11",
        changes: [
            'New: Money Flow Pipeline — an opt-in Transactions screen for personal ledgers (Settings → Features) that replaces Income/Expenses/Allocations with a 5-stage flow: Collections → Income → Upkeep → Lifestyle → Growth.',
            'Collections: log gross receipts against the same categories as Income, with a per-category "Needs Compliance" setting — entries stay Pending (excluded from Income) until a compliance amount is cleared.',
            'Upkeep now reflects actual spend against your Expense categories, shown against an editable budget target.',
            'Lifestyle buckets (formerly "Allocations") fill in strict priority order (reorderable) with a visual fill indicator per card; Growth splits the remaining surplus by percentage across three pools once every bucket is fully funded.',
            'Classic screen stays the default for everyone — the pipeline is opt-in and never applies to business ledgers.',
            'Added category deletion (Edit Card → Delete Category) — previously categories could only be added, never removed.',
        ]
    },
    {
        version: "2.1.5",
        date: "2026-06-14",
        changes: [
            'Assets: Fixed market value using stale unit price — now uses the most recent price event (valuation, sale, or purchase) by date instead of always preferring valuations.',
        ]
    },
    {
        version: "2.1.4",
        date: "2026-06-14",
        changes: [
            'Asset Purchase: Fixed sub-account deduction — when paying from an account with sub-accounts, a sub-account picker now appears so the correct balance is deducted.',
        ]
    },
    {
        version: "2.1.3",
        date: "2026-06-14",
        changes: [
            'Asset Purchase: Added "Pay From" account picker so the purchasing bank/wallet account is shown and money is automatically deducted on buy.',
            'Asset Purchase: Fixed unit price calculation — Price per Unit now reflects the share price before transaction fees; fees are added to cost basis only.',
        ]
    },
    {
        version: "2.1.0",
        date: "2026-04-11",
        changes: [
            'Global Group Sync: Account groups are now synchronized across all ledgers (Personal, Business, etc.) for a consistent structural experience.',
            'Advanced Obligations Section: Consolidated Credits and Loans into a new unified "Obligations (Receivables & Payables)" meta-category.',
            'Savings Breakdown: Implemented "Owned vs Lent" metrics for Savings accounts, separating liquid cash from money loaned out from specific funds.',
            'Refined Hierarchy: Reorganized the account view order to Wallets -> Obligations -> Assets -> Savings for better logical progression.',
            'Enhanced Calculator Pad: Upgraded the transaction keypad with full arithmetic calculation support and a "Smart Save" auto-compute feature.',
            'High-Density UI: Compacted the transaction entry and account list layouts by removing redundant whitespace and standardizing spacing.'
        ]
    },
    {
        version: "2.0.0",
        date: "2026-04-04",
        changes: [
            'Changed the way the Codebase is designed for Faster Load Speed, and Development',
            'You should notice faster loads of the Pages and app In general',
            'Breakdown Drill-downs: Every amount in the Insights breakdown table is now clickable for details.',
            'Unified Navigation: Implemented consistent 3-column headers across all main tabs.',
            'Dual-Account Syncing: Overhauled processing to update both source and destination accounts simultaneously.',
            'Standardized Aesthetics: Harmonized card layouts and radii for a premium, high-fidelity experience.'
        ]
    },
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
