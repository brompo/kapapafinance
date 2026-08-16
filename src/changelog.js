export const CHANGELOG = [
    {
        version: "4.2.4",
        date: "2026-08-16",
        changes: [
            'Tapping an asset in Kapapa now opens its account detail view on a new Trends tab, showing a chart of invested (cost basis) vs. market value over time — sampled at each real purchase, sale, or valuation — plus summary stats (current value, total invested, unrealized gain, simple return, XIRR). The same Trends tab is now available for any asset account from the Accounts tab too.',
        ]
    },
    {
        version: "4.2.3",
        date: "2026-08-15",
        changes: [
            'Kapapa now displays returns as percentages throughout (the goal ring, goal target, group headers, and empty-state copy) instead of an "x" multiple, matching the per-asset rows. The goal-edit modal now asks for a target percentage (e.g. 50) rather than a multiplier (e.g. 1.5).',
        ]
    },
    {
        version: "4.2.2",
        date: "2026-08-15",
        changes: [
            'Kapapa now shows a simple "put in vs. got out" return as the primary number on the goal ring, group headers, and each asset row, with the annualized (XIRR) rate kept underneath as context — a quick, large gain no longer dominates the headline figure the way it did when XIRR alone was annualized to a compounded yearly rate.',
            'Fully divested assets (e.g. a stock you\'ve sold out of entirely) no longer clutter the Kapapa holdings list or account counts — their historical gains still feed the group and blended totals.',
            'Asset accounts now have a separate Valuations tab (DSE auto-prices, manual valuations) so History only shows real purchases, sales, and transfers.',
        ]
    },
    {
        version: "4.2.1",
        date: "2026-08-15",
        changes: [
            'The Kapapa tab now shows a portfolio allocation pie chart (by asset group) in place of the 12-month trend chart, and the group breakdown below (renamed HOLDINGS) lists each individual asset with its own annualized return instead of only a group rollup — sorted best to worst, with group headers keeping a consistent color between the chart and the list.',
        ]
    },
    {
        version: "4.2.0",
        date: "2026-08-09",
        changes: [
            'Rebuilt the Kapapa tab around a single question: is your money generating at least your target return per year? It now shows a blended trailing-12-month annualized return (money-weighted, across every Invest/Shares/Real Estate account) as an "x" multiple against an editable goal (default 1.5x), a 12-month trend chart, and a breakdown by asset group. Business capital accounts are netted against any linked debt so the return reflects your own equity. Budget Watch is replaced by this Returns view; DSE Watch stays as a toggle alongside it.',
        ]
    },
    {
        version: "4.1.4",
        date: "2026-08-09",
        changes: [
            'The Due From selection bar now shows the total amount of the selected transactions alongside the count.',
        ]
    },
    {
        version: "4.1.3",
        date: "2026-08-09",
        changes: [
            'Fixed a crash on the Accounts tab caused by the new Due From feature (a variable was referenced before it was initialized).',
        ]
    },
    {
        version: "4.1.2",
        date: "2026-08-09",
        changes: [
            'Added Due From tracking on debit accounts: multi-select transactions in a debit account\'s History and mark them as owed by another debit account. The new Due From tab groups pending items by that source account — settling a group moves the total from the source account into this one as a real transfer and marks the items received.',
        ]
    },
    {
        version: "4.1.1",
        date: "2026-08-03",
        changes: [
            'Transfer Between Buckets now leaves a trail: both buckets\' Activity tabs show the move ("Transferred to/from X"), styled distinctly (dashed indigo card, ⇄ icon) from real expenses/income, with red/green amounts by direction.',
            'The Transfer Between Buckets amount field now formats with commas as you type.',
        ]
    },
    {
        version: "4.1.0",
        date: "2026-08-03",
        changes: [
            'Added Projects: group planned Expenditures (name + projected cost) under a Project on any Flow/Kapapa bucket, log spend straight from an expenditure as a real tagged transaction, and see per-project progress plus a budget-fit check against the bucket\'s Balance.',
            'Added a "Start on Projects" toggle in Edit Card — tapping that card then opens straight to its Projects tab instead of the amount-entry screen.',
        ]
    },
    {
        version: "4.0.9",
        date: "2026-08-02",
        changes: [
            'Flow/Kapapa category rows now show "Before Dist" and "Balance"/"After Dist" in red when negative, instead of always green/gray.',
        ]
    },
    {
        version: "4.0.8",
        date: "2026-08-02",
        changes: [
            'Added a Family Goal to the Family tab: a target % of income for Upkeep (defaults to 50%), shown as a progress bar at the top in place of the old Distributed total — green while under the goal, red at or over. Tap it to edit; changes apply from the viewed month onward, like Growth pool %.',
        ]
    },
    {
        version: "4.0.7",
        date: "2026-08-02",
        changes: [
            'Added a "Force Update" row at the bottom of Settings → About — clears the cached app and reloads the latest version if the background auto-updater hasn\'t caught up yet. Doesn\'t touch your data.',
        ]
    },
    {
        version: "4.0.6",
        date: "2026-08-02",
        changes: [
            'The UPKEEP section header in Flow/Kapapa now includes what a fundsUpkeep Growth pool (e.g. "Up Buffer") redirected in, not just the monthly distribution — so Upkeep + Balance now totals Income for the period.',
        ]
    },
    {
        version: "4.0.5",
        date: "2026-08-02",
        changes: [
            'Flow/Kapapa category rows now always show "Before Dist" (equal to B/F when there\'s no spend yet), instead of only when there\'s an expense.',
            'Shortened "Expense:" to "Exp:" on those rows.',
        ]
    },
    {
        version: "4.0.4",
        date: "2026-08-02",
        changes: [
            'DSE Watch moved inside the Kapapa tab (a "Budget"/"DSE Watch" toggle at the top) instead of its own bottom-nav tab.',
            'Transaction is back to just Income and Expenses — Lifestyle/Growth stay exclusive to Flow and Kapapa\'s budget cascade.',
        ]
    },
    {
        version: "4.0.3",
        date: "2026-08-01",
        changes: [
            'The "Spend from Upkeep" picker now shows each Expense category\'s spend against its Monthly Target right on the row (red if over), instead of just a bare name list.',
            'Tightened the spacing between "+ Add Income" and the Upkeep section in Flow/Kapapa.',
        ]
    },
    {
        version: "4.0.2",
        date: "2026-08-01",
        changes: [
            'Flow and Kapapa can now add their own Upkeep, Income, Lifestyle, and Growth categories directly — a "+ Add category" option on the Upkeep/Income pickers, and a "+ Add" button on the Lifestyle/Growth section headers.',
        ]
    },
    {
        version: "4.0.0",
        date: "2026-08-01",
        changes: [
            'Ledgers are gone. In their place: three fixed tabs — Transaction (personal expenditure, always on, unchanged), Flow (family expenditure), and Kapapa (shared/community expenditure) — each with its own independent Upkeep/Lifestyle/Growth budget cascade. Flow and Kapapa are optional, toggled on in Settings → Features (off by default); no ledger switcher, no per-ledger account sharing.',
            'Accounts are no longer scoped to a ledger — every account is visible and spendable from all three tabs.',
            'Existing data is preserved automatically: all transactions stay in Transaction exactly as before, and if Flow Pipeline was on, its Lifestyle/Growth budget targets/percentages carry over as Flow\'s starting config (with an empty transaction history, since Flow now tracks its own spending independently).',
            'Insights is now optional too, toggled in Settings → Features (on by default).',
            'Removed the unused Business ledger type and its Cost of Sales/Operating Expenses categories.',
        ]
    },
    {
        version: "3.1.3",
        date: "2026-07-24",
        changes: [
            'Flow\'s Balance summary now shows a "Before Distribution" line (B/F minus Expense) in green, ahead of the final Balance, so it\'s clear how much this period\'s Distribution actually added.',
        ]
    },
    {
        version: "3.1.2",
        date: "2026-07-24",
        changes: [
            'Added a "Balance" summary to the bottom of Flow — rolls up B/F, Expense, Distribution, and Balance across every Lifestyle bucket and Growth pool (excluding Upkeep, and excluding a "Funds Upkeep" pool since its share already lives in Upkeep\'s own Balance).',
            'The Growth pool flagged "Funds Upkeep" (e.g. "Up Buffer") now renders grayed out in Flow, since it\'s a silent pass-through into Upkeep rather than its own spendable bucket.',
        ]
    },
    {
        version: "3.1.1",
        date: "2026-07-23",
        changes: [
            'The "+ Add" button on a category screen now names the actual category ("+ Add Emergency Fund", "+ Add Food") instead of its generic type ("+ Add Lifestyle", "+ Add Expense").',
            'A category\'s transaction history now groups by day (e.g. "Tue 21 Jul") with a per-day OUT/IN total, matching the Accounts screen\'s history layout, instead of one lump group per month.',
        ]
    },
    {
        version: "3.1.0",
        date: "2026-07-23",
        changes: [
            'Flow is now a spend/income entry point, not just a report: tap Upkeep to pick which Expense category the spend is for, tap a Lifestyle or Growth row to log against it directly, or tap the new "+ Add Income" button under the pie to log a Collection — each lands on the same entry screen Transactions uses, then returns you to Flow. The ✎ icon on Lifestyle/Growth rows still opens the target/%/opening-balance editor, now separate from the row tap.',
            'For personal ledgers with Flow Pipeline on, Transactions no longer takes a bottom-nav slot — Flow is the default tab instead. Transactions still exists exactly as before (category grid, +Add, history, reimbursements) and is one tap away via a new "Transactions" row in Settings; from there the bottom nav stays live so you can jump straight to any other tab.',
            'A transaction started from Flow now dates itself to whatever period Flow is viewing (this month by default, or the browsed-to month/year) instead of always defaulting to today.',
        ]
    },
    {
        version: "3.0.0",
        date: "2026-07-19",
        changes: [
            'Accounts can now belong to more than one ledger — edit an account and check every ledger that should see it (e.g. a shared Cash account visible in both Personal and Family). Shared accounts keep one combined balance; spending from either ledger draws from the same real total, and the account list shows a small badge (e.g. "Personal + Family") so it\'s obvious at a glance.',
            'Added a "Merge" action on the account detail screen for folding duplicate accounts together (e.g. two separate "Cash" accounts, one per ledger, that were really the same physical cash). Merging sums both balances onto the account you keep, unions the ledgers they were visible in, and re-points any category default-account settings — the absorbed account is archived rather than deleted, so its own transaction history stays intact as a record.',
            'Fixed a bug where a Growth pool flagged "Funds Upkeep" (Flow tab) only counted its ongoing monthly redirect toward Upkeep\'s Balance, leaving whatever it had already accumulated (its Opening Balance) stranded — not spendable, not transferable, and not reflected in Upkeep\'s total. That standing reserve is now folded into Upkeep\'s Balance continuously, the same way it stays frozen in the pool\'s own Balance, so it acts as a real live backstop instead of dead weight.',
        ]
    },
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
