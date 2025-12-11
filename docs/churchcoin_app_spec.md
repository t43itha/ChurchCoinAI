<project_specification>
  <project_name>ChurchCoinAI - AI-First Church Finance Platform</project_name>

  <overview>
    ChurchCoinAI is a comprehensive, AI-powered financial management platform designed specifically for UK churches and faith organizations. The platform provides intelligent transaction management, donor relationship tracking, pledge fulfillment monitoring, and automated bank account synchronization via Plaid. Built with a focus on Charity Commission compliance, HMRC Gift Aid tracking, and fund-based accounting (Unrestricted, Restricted, Designated, Endowment), ChurchCoinAI transforms how churches manage their finances through automation, AI insights, and real-time bank connectivity.

    The platform targets small-to-medium UK churches (Pentecostal & Baptist focus initially) and provides:
    - Multi-tenant architecture with complete data isolation per organization
    - Real-time bank account synchronization via Plaid API
    - AI-powered transaction categorization and donor matching
    - Pledge tracking with automatic completion detection
    - Gift Aid compliance and HMRC reporting preparation
    - WhatsApp-integrated donor communication
    - Role-based access control for church leadership teams
  </overview>

  <technology_stack>
    <frontend>
      <framework>React 19 with TypeScript</framework>
      <build_tool>Vite 6</build_tool>
      <styling>Tailwind CSS (utility-first design system)</styling>
      <state_management>React hooks, Convex reactive queries</state_management>
      <routing>React Router for navigation</routing>
      <charts>Recharts for data visualization</charts>
      <animations>Framer Motion for micro-interactions</animations>
      <icons>Lucide React icon library</icons>
    </frontend>

    <backend>
      <database>Convex (serverless real-time backend)</database>
      <authentication>Clerk (OAuth, SSO, multi-tenant user management)</authentication>
      <ai_services>Google Gemini API for categorization and insights</ai_services>
      <bank_integration>Plaid API for account connectivity and transaction sync</bank_integration>
      <pdf_generation>HTML-to-PDF for donor statements and reports</pdf_generation>
    </backend>

    <communication>
      <realtime>Convex reactive subscriptions</realtime>
      <webhooks>Plaid webhooks for transaction updates</webhooks>
      <external>WhatsApp integration for donor messaging</external>
    </communication>

    <security>
      <encryption>AES-256-GCM for Plaid access token storage</encryption>
      <authentication>Clerk JWT verification</authentication>
      <webhook_verification>Plaid JWT signature validation</webhook_verification>
      <rbac>Role-based access control (Admin, Finance Team, Pastorate, Guest)</rbac>
    </security>
  </technology_stack>

  <core_features>
    <dashboard>
      <description>Financial command center with real-time KPIs and AI-powered insights</description>
      <features>
        - Cash Flow Health: Monthly income vs expenditure with trend indicators
        - Donor Momentum: Active donor count trending month-over-month
        - Campaign Velocity: Restricted fund progress toward targets
        - 6-month Income vs Expenditure chart (bar + line composite)
        - Priority Funds list highlighting restricted or low-balance funds
        - AI Insights Widget: Strategic recommendations from Gemini AI
        - Quick Actions: Import transactions, add donor, create pledge
        - Connected Accounts Status: Bank sync health indicators
      </features>
    </dashboard>

    <transaction_management>
      <description>Comprehensive ledger with multiple import methods and AI categorization</description>
      <import_methods>
        <csv_import>
          - Bank statement upload with format auto-detection
          - Supported formats: Barclays, HSBC, Metro Bank, Generic CSV
          - Column mapping with intelligent auto-detection
          - Split amount column support (Money In/Money Out)
          - Date parsing (ISO and UK DD/MM/YYYY formats)
          - Duplicate detection on date+amount+reference
          - Preview modal for review before import
        </csv_import>
        <plaid_sync>
          - One-click bank account connection via Plaid Link
          - Automatic daily transaction synchronization
          - Real-time webhook updates for new transactions
          - Pending transaction handling (authorization → cleared)
          - Multi-account support per bank connection
          - 90-day consent renewal management (UK Open Banking)
        </plaid_sync>
        <manual_entry>
          - Single transaction form with category suggestion
          - Quick income/expenditure toggle
          - Fund and donor assignment
          - Gift Aid eligibility marking
        </manual_entry>
      </import_methods>
      <features>
        - Full ledger view with running balance
        - Global search (description, category, donor, amount)
        - Date range, fund, and category filtering
        - Reconciliation status tracking
        - Bulk operations: categorize, reconcile, assign fund
        - Smart Link: AI-powered pledge matching for income
        - Transaction source indicator (CSV, Plaid, Manual)
        - Edit and delete with audit trail
      </features>
    </transaction_management>

    <donor_management>
      <description>Complete donor relationship management with giving history and communication</description>
      <features>
        - Donor directory with search and filtering
        - Lifetime Value (LTV) calculation per donor
        - Four-tab donor profile:
          1. Overview: Active giving schedules, giving trend chart
          2. History: Transaction ledger with pledge linking
          3. Profile: Contact details, Gift Aid status, preferences
          4. Communicate: WhatsApp message templates
        - Pledge scheduling (One-off, Weekly, Monthly, Annual)
        - Auto-complete pledges when cumulative giving reaches target
        - Duplicate detection with fuzzy name matching
        - Donor merge functionality (preserves all history)
        - Gift Aid declaration tracking with consent dates
        - Communication preference management (Email, Post, Phone, WhatsApp)
      </features>
      <communication_templates>
        - New Pledge: Thank you for signup
        - Pledge Reminder: Gentle giving nudge
        - Pledge Complete: Fulfillment celebration
        - General Update: Appreciation message
        - End of Year: Annual giving summary
      </communication_templates>
    </donor_management>

    <fund_management>
      <description>Fund-based accounting aligned with UK charity requirements</description>
      <fund_types>
        - Unrestricted: General operations, tithes, general offerings
        - Restricted: Donor-designated purpose (missions, building)
        - Designated: Board-designated purpose
        - Endowment: Permanent funds, investment income only
      </fund_types>
      <features>
        - Fund creation with purpose description
        - Target amount and deadline for campaigns
        - Real-time balance calculation from transactions
        - Fund-specific reporting and statements
        - Inter-fund transfer tracking
        - Campaign progress visualization
        - Fund logo/branding for campaigns
      </features>
    </fund_management>

    <pledge_management>
      <description>Track and fulfill donor giving commitments</description>
      <features>
        - Create pledges linked to donors and funds
        - Frequency options: One-off, Weekly, Monthly, Annual
        - Start and end date configuration
        - Auto-complete when cumulative income >= pledge amount
        - Smart Link: AI matches unlinked income to pledges
        - Status tracking: Active, Completed, Cancelled
        - Pledge progress visualization
        - Reminder scheduling for unfulfilled pledges
      </features>
    </pledge_management>

    <plaid_integration>
      <description>Secure bank account connectivity for automated transaction sync</description>
      <connection_flow>
        1. User clicks "Connect Bank Account" in Settings
        2. Backend generates short-lived link_token
        3. Plaid Link modal opens (bank selection, authentication)
        4. User completes Strong Customer Authentication (SCA)
        5. Success callback returns public_token
        6. Backend exchanges for permanent access_token
        7. Access token encrypted and stored securely
        8. Initial transaction sync triggered (30+ days history)
        9. Webhook subscription established for updates
      </connection_flow>
      <features>
        - Support for major UK banks (Barclays, HSBC, Lloyds, NatWest, etc.)
        - Neobank support (Monzo, Revolut, Starling, Wise)
        - Multi-account selection per bank login
        - Real-time balance retrieval (cached for efficiency)
        - Transaction categorization using Plaid categories + AI enhancement
        - Automatic pending → cleared transition handling
        - Re-authentication flow for expired connections
        - 90-day consent renewal reminders (UK Open Banking requirement)
        - Connection health status dashboard
        - Manual sync trigger option
        - Disconnect account functionality
      </features>
      <security>
        - Access tokens encrypted with AES-256-GCM before storage
        - Encryption key stored in Convex environment variables
        - Webhook signatures verified via Plaid JWT
        - Tokens never exposed to frontend
        - Audit logging for all Plaid operations (redacted)
        - /item/remove called on account deletion (GDPR compliance)
      </security>
    </plaid_integration>

    <ai_features>
      <description>AI-powered automation using Google Gemini</description>
      <features>
        - Transaction Categorization: Bulk categorize imports with confidence scores
        - Donor Name Extraction: Parse donor names from transaction descriptions
        - Gift Aid Detection: Identify potentially Gift Aid eligible transactions
        - Pledge Matching: Smart-link income to probable pledges
        - Dashboard Insights: Strategic recommendations based on financial trends
        - Chat Interface: Natural language queries about church finances
        - Category Suggestion: Real-time suggestions during manual entry
      </features>
    </ai_features>

    <reporting>
      <description>Financial reports for leadership and compliance</description>
      <report_types>
        - Monthly Summary: Income, expenditure, surplus by category
        - Annual Accounts: Full year financial statement
        - Fund Reports: Per-fund income and expenditure breakdown
        - Donor Statements: Individual giving history for tax purposes
        - Gift Aid Report: Eligible donations for HMRC claim preparation
        - Pledge Progress: Campaign completion tracking
        - Bank Reconciliation: Match Plaid transactions vs ledger
      </report_types>
      <export_formats>
        - PDF: Formatted statements with church branding
        - Excel: Detailed data for accountant review
        - CSV: Raw data export
      </export_formats>
    </reporting>

    <settings_configuration>
      <description>Organization and user preferences</description>
      <organization_settings>
        - Church name, charity number, address
        - Logo upload for branded reports
        - Financial year start month
        - Default fund for new transactions
        - Auto-categorization toggle
        - Currency (GBP default)
        - Connected bank accounts management
      </organization_settings>
      <user_preferences>
        - Theme (Light, Dark, System)
        - Notification preferences
        - Role assignment (Admin only)
      </user_preferences>
    </settings_configuration>

    <onboarding>
      <description>Guided setup for new organizations</description>
      <steps>
        1. Organization Details: Name, charity number, address
        2. Financial Setup: Year start, default fund creation
        3. Category Selection: Choose from Pentecostal/Baptist presets
        4. Bank Connection: Optional Plaid setup
        5. Team Invites: Add finance team members
        6. First Import: CSV upload or Plaid sync
      </steps>
    </onboarding>
  </core_features>

  <database_schema>
    <tables>
      <organizations>
        - _id: Convex ID (primary key)
        - name: string
        - charityNumber: string (optional)
        - address: string (optional)
        - email: string (optional)
        - website: string (optional)
        - reportingPeriod: string (optional)
        - logoUrl: string (optional)
        - createdAt: number (timestamp)
        - createdBy: string (Clerk user ID)
        - Index: by_createdBy
      </organizations>

      <users>
        - _id: Convex ID
        - clerkId: string
        - organizationId: Id<"organizations">
        - name: string
        - email: string
        - role: "Admin" | "Finance Team" | "Pastorate" | "Guest"
        - avatarUrl: string (optional)
        - createdAt: number
        - Indexes: by_clerkId, by_organization, by_clerkId_organization
      </users>

      <funds>
        - _id: Convex ID
        - organizationId: Id<"organizations">
        - name: string
        - type: "Unrestricted" | "Restricted" | "Designated" | "Endowment"
        - description: string (optional)
        - targetAmount: number (optional)
        - deadline: string (optional, ISO date)
        - logoUrl: string (optional)
        - createdAt: number
        - Indexes: by_organization, by_organization_type
      </funds>

      <donors>
        - _id: Convex ID
        - organizationId: Id<"organizations">
        - name: string
        - email: string (optional)
        - phone: string (optional)
        - address: string (optional)
        - postcode: string (optional)
        - notes: string (optional)
        - type: "Individual" | "Organization"
        - isGiftAidActive: boolean (optional)
        - giftAidDeclarationDate: number (optional)
        - communicationPreference: "Email" | "Post" | "Phone" | "WhatsApp" (optional)
        - createdAt: number
        - Indexes: by_organization, by_organization_name
      </donors>

      <pledges>
        - _id: Convex ID
        - organizationId: Id<"organizations">
        - donorId: Id<"donors"> (optional)
        - donorName: string
        - amount: number
        - fundId: Id<"funds">
        - frequency: "One-off" | "Weekly" | "Monthly" | "Annual"
        - startDate: string (ISO date)
        - endDate: string (optional, ISO date)
        - status: "Active" | "Completed" | "Cancelled"
        - createdAt: number
        - Indexes: by_organization, by_fund, by_donor, by_organization_status, by_donor_fund_amount
      </pledges>

      <transactions>
        - _id: Convex ID
        - organizationId: Id<"organizations">
        - date: string (ISO date)
        - description: string
        - amount: number (always positive, type determines direction)
        - type: "Income" | "Expenditure"
        - category: string
        - fundId: Id<"funds">
        - isReconciled: boolean
        - notes: string (optional)
        - isGiftAidEligible: boolean (optional)
        - donorName: string (optional)
        - donorId: Id<"donors"> (optional)
        - pledgeId: Id<"pledges"> (optional)
        - source: "manual" | "csv" | "plaid" (default: "manual")
        - plaidTransactionId: string (optional, unique identifier from Plaid)
        - plaidAccountId: string (optional)
        - plaidPending: boolean (optional, true if not yet cleared)
        - categorizationConfidence: number (optional, 0-1)
        - importBatchId: string (optional)
        - createdAt: number
        - Indexes: by_organization, by_fund, by_organization_date, by_pledge, by_donor, by_plaid_transaction
      </transactions>

      <categories>
        - _id: Convex ID
        - organizationId: Id<"organizations">
        - name: string
        - type: "income" | "expense" (optional)
        - sofaClassification: string (optional, Charity Commission mapping)
        - keywords: array<string> (optional, for auto-categorization)
        - isDefault: boolean (optional)
        - createdAt: number
        - Indexes: by_organization, by_organization_name
      </categories>

      <plaidItems>
        - _id: Convex ID
        - organizationId: Id<"organizations">
        - itemId: string (Plaid item identifier)
        - accessToken: object (encrypted: { iv: string, content: string, tag: string })
        - institutionId: string (optional, bank identifier)
        - institutionName: string (bank display name)
        - accounts: array<{
            accountId: string,
            name: string,
            mask: string (last 4 digits),
            type: "depository" | "credit" | "loan" | "investment",
            subtype: string (optional),
            isActive: boolean
          }>
        - transactionsCursor: string (optional, for incremental sync)
        - lastSyncedAt: number (optional)
        - status: "active" | "requires_reauth" | "disconnected"
        - consentExpiresAt: number (optional, 90-day UK Open Banking)
        - createdAt: number
        - createdBy: string (Clerk user ID)
        - Indexes: by_organization, by_item_id
      </plaidItems>

      <plaidSyncLog>
        - _id: Convex ID
        - organizationId: Id<"organizations">
        - plaidItemId: Id<"plaidItems">
        - syncType: "initial" | "incremental" | "webhook"
        - transactionsAdded: number
        - transactionsModified: number
        - transactionsRemoved: number
        - status: "success" | "partial" | "failed"
        - errorMessage: string (optional)
        - startedAt: number
        - completedAt: number (optional)
        - Index: by_organization
      </plaidSyncLog>

      <chatHistory>
        - _id: Convex ID
        - organizationId: Id<"organizations">
        - clerkId: string
        - messages: array<{ role: string, content: string, timestamp: number }>
        - createdAt: number
        - updatedAt: number
        - Index: by_organization_user
      </chatHistory>

      <importBatches>
        - _id: Convex ID
        - organizationId: Id<"organizations">
        - fileName: string
        - source: "csv" | "plaid"
        - transactionCount: number
        - status: "pending" | "processing" | "completed" | "failed"
        - errors: array<string>
        - importedAt: number
        - importedBy: string (Clerk user ID)
        - Index: by_organization
      </importBatches>
    </tables>
  </database_schema>

  <api_endpoints>
    <convex_queries>
      <organizations>
        - getByClerkUser: Get organization for current user
        - getById: Get organization details
      </organizations>
      <users>
        - getCurrentUser: Get authenticated user profile
        - getByOrganization: List organization members
      </users>
      <funds>
        - getByOrganization: List all funds with balances
        - getById: Get fund details
        - getWithBalance: Calculate balance from transactions
      </funds>
      <donors>
        - getByOrganization: List donors with filtering
        - getById: Get donor with giving history
        - search: Search donors by name
        - findDuplicates: Find potential duplicate donors
      </donors>
      <pledges>
        - getByOrganization: List all pledges with filtering
        - getByDonor: Get donor's pledges
        - getByFund: Get fund's pledges
        - getActive: List active pledges only
      </pledges>
      <transactions>
        - getByOrganization: List with pagination and filtering
        - getByFund: Filter by fund
        - getByDonor: Get donor's transactions
        - getUnlinkedIncome: Income transactions without pledge
        - getByDateRange: Date-filtered list
      </transactions>
      <categories>
        - getByOrganization: List organization categories
      </categories>
      <plaid>
        - getConnectedAccounts: List Plaid items with accounts
        - getSyncStatus: Get sync health for all connections
        - getAccountBalance: Cached balance for specific account
      </plaid>
      <dashboard>
        - getKPIs: Calculate key performance indicators
        - getMonthlyTrend: 6-month income/expenditure trend
        - getPriorityFunds: Funds needing attention
      </dashboard>
    </convex_queries>

    <convex_mutations>
      <organizations>
        - create: Create new organization
        - update: Update organization settings
      </organizations>
      <users>
        - createOrUpdate: Upsert user from Clerk
        - updateRole: Change user role (Admin only)
      </users>
      <funds>
        - create: Create new fund
        - update: Update fund details
        - delete: Delete fund (if no transactions)
      </funds>
      <donors>
        - create: Create new donor
        - update: Update donor profile
        - merge: Merge duplicate donors
        - delete: Delete donor (if no transactions)
      </donors>
      <pledges>
        - create: Create new pledge
        - update: Update pledge details
        - cancel: Mark pledge as cancelled
      </pledges>
      <transactions>
        - create: Create single transaction (checks pledge completion)
        - update: Update transaction (re-checks pledge)
        - delete: Delete transaction
        - bulkCreate: Import multiple transactions
        - bulkUpdate: Bulk update selected transactions
        - linkToPledge: Link transaction to pledge
      </transactions>
      <categories>
        - create: Create custom category
        - update: Update category
        - delete: Delete category (if unused)
        - seedDefaults: Create default UK church categories
      </categories>
      <plaid>
        - storeItem: Save new Plaid connection (encrypted)
        - updateItemStatus: Update connection status
        - updateSyncCursor: Save transaction sync cursor
        - removeItem: Disconnect and delete Plaid item
        - markAccountActive: Enable/disable specific accounts
      </plaid>
    </convex_mutations>

    <convex_actions>
      <plaid>
        - createLinkToken: Generate Plaid Link initialization token
        - exchangePublicToken: Exchange public_token for access_token
        - syncTransactions: Fetch and import transactions from Plaid
        - getAccountBalances: Retrieve real-time account balances
        - refreshAccessToken: Handle re-authentication flow
      </plaid>
      <ai>
        - categorizeTransactions: AI bulk categorization
        - reconcilePledges: Smart-link income to pledges
        - generateInsights: Dashboard strategic insights
        - extractDonorName: Parse donor from description
      </ai>
      <reports>
        - generateDonorStatement: Create PDF donor statement
        - generateGiftAidReport: Prepare HMRC Gift Aid data
        - exportTransactions: Generate CSV/Excel export
      </reports>
    </convex_actions>

    <convex_http_routes>
      <webhooks>
        - POST /webhooks/plaid: Handle Plaid webhook events
          - SYNC_UPDATES_AVAILABLE: Trigger incremental sync
          - ITEM_LOGIN_REQUIRED: Mark for re-authentication
          - PENDING_EXPIRATION: Consent renewal reminder
          - Verify Plaid-Verification JWT header
          - Return 200 immediately, process asynchronously
      </webhooks>
    </convex_http_routes>
  </api_endpoints>

  <plaid_integration_details>
    <environments>
      <sandbox>
        - Free, unlimited usage
        - Fake bank data for testing
        - Use for development and integration testing
      </sandbox>
      <limited_production>
        - Free up to 100 connected Items
        - Real bank accounts
        - Ideal for MVP and initial launch
      </limited_production>
      <production>
        - Pay-as-you-go pricing
        - Full access to all features
        - Volume discounts available
      </production>
    </environments>

    <uk_specific_requirements>
      - Strong Customer Authentication (SCA): Users authenticate via bank app
      - 90-Day Consent Renewal: Handle PENDING_EXPIRATION webhook
      - FCA Compliance: Plaid is FCA-authorized; verify your app's requirements
      - Open Banking APIs: Higher data quality than US screen scraping
      - App-to-App Authentication: Bank redirects instead of credential entry
    </uk_specific_requirements>

    <supported_banks>
      <major_banks>
        - Barclays
        - HSBC
        - Lloyds Banking Group (Lloyds, Halifax, Bank of Scotland)
        - NatWest Group (NatWest, RBS, Ulster Bank)
        - Santander UK
        - Nationwide
      </major_banks>
      <neobanks>
        - Monzo
        - Revolut
        - Starling Bank
        - Wise (TransferWise)
      </neobanks>
    </supported_banks>

    <transaction_sync_strategy>
      <initial_sync>
        1. After successful Link, call /transactions/sync with cursor: null
        2. Paginate through all results until has_more: false
        3. Transform Plaid transactions to ChurchCoinAI format
        4. Apply AI categorization with church-specific context
        5. Store transactions with source: "plaid"
        6. Save final cursor for incremental updates
      </initial_sync>
      <incremental_sync>
        1. Receive SYNC_UPDATES_AVAILABLE webhook
        2. Retrieve saved cursor for Item
        3. Call /transactions/sync with cursor
        4. Process added/modified/removed arrays
        5. Handle pending → cleared transitions
        6. Update cursor after successful processing
      </incremental_sync>
      <pending_transactions>
        - Display with visual indicator (dotted border)
        - Don't link to pledges until cleared
        - Handle Remove + Add pattern when clearing
        - Match on Plaid transaction_id for updates
      </pending_transactions>
    </transaction_sync_strategy>

    <error_handling>
      <connection_errors>
        - ITEM_LOGIN_REQUIRED: Prompt re-authentication
        - ITEM_PRODUCT_NOT_READY: Retry after delay
        - RATE_LIMIT_EXCEEDED: Implement exponential backoff
      </connection_errors>
      <user_actions>
        - "Your bank connection needs attention" notification
        - One-click re-authentication via Update Mode
        - Graceful degradation to CSV import
      </user_actions>
    </error_handling>

    <cost_estimation>
      <per_100_accounts>
        - Auth (one-time): £120 (~$150)
        - Transactions (monthly): £24 (~$30)
        - Balance checks (monthly, 4x/user): £32 (~$40)
        - Total monthly: ~£56 (~$70)
      </per_100_accounts>
      <cost_optimization>
        - Start with Limited Production (free 100 items)
        - Cache balances for 1-4 hours
        - Use webhooks, not polling
        - Negotiate Growth plan at 500+ items
      </cost_optimization>
    </cost_estimation>
  </plaid_integration_details>

  <security_implementation>
    <access_token_encryption>
      <algorithm>AES-256-GCM (authenticated encryption)</algorithm>
      <key_management>
        - Generate 32-byte random key
        - Store in Convex environment variables
        - Never commit to source control
      </key_management>
      <storage_format>
        {
          iv: string (16 bytes, hex),
          content: string (encrypted, hex),
          tag: string (auth tag, hex)
        }
      </storage_format>
    </access_token_encryption>

    <webhook_verification>
      <process>
        1. Extract Plaid-Verification header (JWT)
        2. Decode JWT to get key ID (kid)
        3. Fetch public key from Plaid API
        4. Verify JWT signature (ES256 algorithm)
        5. Reject if verification fails
      </process>
    </webhook_verification>

    <audit_logging>
      <log_events>
        - User linked bank account
        - User disconnected bank account
        - Transaction sync completed
        - Re-authentication required
        - Access token rotated
      </log_events>
      <redaction>
        - Never log access_token values
        - Never log account numbers
        - Mask sensitive fields with *****
      </redaction>
    </audit_logging>

    <gdpr_compliance>
      - Call /item/remove before deleting user data
      - Implement data export for users
      - Clear consent documentation for bank access
      - 90-day consent renewal aligns with UK requirements
    </gdpr_compliance>
  </security_implementation>

  <ui_layout>
    <main_structure>
      - Responsive sidebar navigation (collapsible on mobile)
      - Main content area with page-specific layout
      - Persistent header with organization name and user menu
      - Modal overlays for forms and confirmations
    </main_structure>

    <navigation_sidebar>
      - Dashboard (home icon)
      - Transactions (receipt icon)
      - Donors (users icon)
      - Funds (wallet icon)
      - Campaigns (target icon)
      - Reports (chart icon)
      - AI CoPilot (sparkles icon)
      - Settings (gear icon)
    </navigation_sidebar>

    <transaction_manager_layout>
      <header>
        - Page title with transaction count
        - Import dropdown: CSV Upload, Connect Bank
        - Bulk actions: Categorize, Reconcile, Assign Fund
      </header>
      <filters>
        - Search input (description, category, donor)
        - Date range picker
        - Fund selector dropdown
        - Category selector dropdown
        - Status filter (All, Reconciled, Unreconciled, Unlinked Income)
        - Source filter (All, Manual, CSV, Plaid)
      </filters>
      <ledger>
        - Checkbox column for bulk selection
        - Date column (sortable)
        - Description column with source badge
        - Category with edit-in-place
        - Fund with edit-in-place
        - Amount (green for income, red for expenditure)
        - Reconciled checkbox
        - Actions menu (Edit, Delete, Link to Pledge)
        - Pending indicator for Plaid transactions
      </ledger>
    </transaction_manager_layout>

    <settings_bank_connections>
      <connected_accounts_section>
        - List of connected banks with institution logo
        - Per-bank: account list with mask (****1234)
        - Status badge: Active, Needs Attention, Disconnected
        - Last synced timestamp
        - Actions: Sync Now, Re-authenticate, Disconnect
      </connected_accounts_section>
      <add_connection>
        - "Connect Bank Account" button
        - Triggers Plaid Link modal
        - Account selection step
        - Success confirmation with account list
      </add_connection>
      <consent_renewal>
        - Warning banner when consent expiring
        - One-click renewal flow
        - Countdown to expiration
      </consent_renewal>
    </settings_bank_connections>
  </ui_layout>

  <design_system>
    <color_palette>
      <light_mode>
        - Background: #FAFAF8 (paper white)
        - Surface: #FFFFFF
        - Border: #E8E8E6 (ledger gray)
        - Text Primary: #000000 (ink)
        - Text Secondary: #6B6B6B (grey mid)
        - Income/Success: #0A5F38 (sage green)
        - Expenditure/Error: #8B0000 (dark red)
        - Accent: #d4a574 (tan/amber)
        - Warning: #B8860B (dark goldenrod)
      </light_mode>
      <dark_mode>
        - Background: #1A1A1A
        - Surface: #2A2A2A
        - Border: #404040
        - Text Primary: #E5E5E5
        - Text Secondary: #9A9A9A
        - Income/Success: #10B981
        - Expenditure/Error: #EF4444
        - Accent: #d4a574
      </dark_mode>
    </color_palette>

    <typography>
      - Font Family: Inter, SF Pro, system-ui (sans-serif)
      - Monospace: JetBrains Mono, Consolas (financial data)
      - Headings: font-semibold, tracking-tight
      - Body: font-normal, leading-relaxed
      - Financial figures: tabular-nums, text-right alignment
    </typography>

    <component_patterns>
      <cards>
        - Subtle border (#E8E8E6)
        - Rounded corners (8px / rounded-lg)
        - Padding: p-4 to p-6
        - Shadow on hover for interactive cards
      </cards>
      <buttons>
        - Primary: Black background, white text
        - Secondary: Border with hover fill
        - Destructive: Red background for delete actions
        - Icon buttons: Square with rounded corners
      </buttons>
      <forms>
        - Label above input
        - Focus ring on inputs
        - Error states in red with message
        - Disabled state with reduced opacity
      </forms>
      <tables>
        - Alternating row backgrounds (subtle)
        - Sticky header on scroll
        - Monospace for amounts
        - Right-align financial columns
      </tables>
      <badges>
        - Source badges: Manual (gray), CSV (blue), Plaid (green)
        - Status badges: Active (green), Pending (amber), Error (red)
        - Fund type badges: Color-coded by type
      </badges>
    </component_patterns>

    <animations>
      - Page transitions: fade-in (150ms)
      - Modal: scale-up + fade (200ms)
      - Sidebar toggle: slide (300ms)
      - Loading states: pulse animation
      - Success feedback: subtle bounce
    </animations>
  </design_system>

  <implementation_phases>
    <phase_1>
      <title>Plaid Infrastructure Setup</title>
      <tasks>
        - Set up Plaid developer account and sandbox credentials
        - Add Plaid environment variables to Convex
        - Create plaidItems table in Convex schema
        - Implement access token encryption utilities
        - Create createLinkToken Convex action
        - Create exchangePublicToken Convex action
        - Set up Convex HTTP route for webhooks
        - Implement webhook signature verification
      </tasks>
    </phase_1>

    <phase_2>
      <title>Bank Connection UI</title>
      <tasks>
        - Install react-plaid-link package
        - Create BankConnectionCard component
        - Add "Connect Bank" button to Settings page
        - Implement Plaid Link modal integration
        - Build account selection interface
        - Create connected accounts list view
        - Add connection status indicators
        - Implement disconnect functionality
      </tasks>
    </phase_2>

    <phase_3>
      <title>Transaction Synchronization</title>
      <tasks>
        - Create syncTransactions Convex action
        - Implement initial sync logic (full history)
        - Build incremental sync with cursor management
        - Handle SYNC_UPDATES_AVAILABLE webhook
        - Transform Plaid transactions to ChurchCoinAI format
        - Map Plaid categories to church categories
        - Handle pending transaction states
        - Add source field to transaction display
        - Create plaidSyncLog table for tracking
      </tasks>
    </phase_3>

    <phase_4>
      <title>Error Handling & Re-authentication</title>
      <tasks>
        - Handle ITEM_LOGIN_REQUIRED webhook
        - Implement Update Mode for re-authentication
        - Build connection status banner component
        - Create re-authentication flow UI
        - Handle PENDING_EXPIRATION for 90-day renewal
        - Add consent expiration countdown
        - Implement graceful degradation messaging
        - Create sync error notifications
      </tasks>
    </phase_4>

    <phase_5>
      <title>Enhanced Features</title>
      <tasks>
        - Add real-time balance display
        - Implement balance caching strategy
        - Create bank reconciliation view
        - Add manual sync trigger
        - Build Plaid transaction → pledge matching
        - Enhance AI categorization with bank context
        - Create import source analytics
        - Add multi-account filtering
      </tasks>
    </phase_5>

    <phase_6>
      <title>Production Readiness</title>
      <tasks>
        - Switch from Sandbox to Limited Production
        - Test with real UK bank accounts
        - Implement comprehensive error logging
        - Add audit trail for Plaid operations
        - Create admin dashboard for sync monitoring
        - Document re-authentication user flows
        - Prepare for FCA compliance review (if needed)
        - Plan scaling to Production tier
      </tasks>
    </phase_6>
  </implementation_phases>

  <success_criteria>
    <functionality>
      - Bank accounts connect successfully via Plaid Link
      - Transactions sync automatically within 5 minutes of webhook
      - Pending transactions display with visual indicator
      - Re-authentication flow works seamlessly
      - 90-day consent renewal completes without data loss
      - CSV import continues to work as fallback
      - AI categorization works on Plaid transactions
      - Pledge matching works with Plaid income
    </functionality>

    <security>
      - Access tokens encrypted at rest
      - Tokens never exposed to frontend
      - Webhook signatures verified
      - Audit logs capture all operations (redacted)
      - GDPR compliance with /item/remove on deletion
    </security>

    <user_experience>
      - Bank connection completes in under 60 seconds
      - Clear status indicators for connection health
      - Intuitive re-authentication prompts
      - Transactions appear with correct categorization
      - Source (CSV vs Plaid) clearly visible
      - No user action needed for routine syncs
    </user_experience>

    <reliability>
      - Webhook handler returns 200 within 3 seconds
      - Sync failures logged and retried automatically
      - Connection errors surface user-friendly messages
      - Data integrity maintained across pending → cleared transitions
      - Cursor management prevents duplicate imports
    </reliability>

    <cost_efficiency>
      - Stay within free tier for MVP (100 items)
      - Balance API calls cached appropriately
      - Webhook-driven (no polling)
      - Clear path to Growth tier pricing
    </cost_efficiency>
  </success_criteria>

  <future_enhancements>
    <payment_initiation>
      - UK Payment Initiation Service (PIS) for instant donations
      - Donor can pay directly from bank account
      - Lower fees than card payments
      - Requires additional FCA compliance
    </payment_initiation>

    <recurring_payments>
      - Set up standing orders via Plaid
      - Automate pledge fulfillment
      - Reduce manual tracking burden
    </recurring_payments>

    <multi_account_management>
      - Connect multiple bank accounts per church
      - Consolidated transaction view
      - Cross-account reconciliation
    </multi_account_management>

    <advanced_categorization>
      - Train ML model on church-specific patterns
      - Learn from user corrections
      - Higher accuracy over time
    </advanced_categorization>

    <mobile_app>
      - React Native implementation
      - Plaid Link SDK for mobile
      - Push notifications for sync status
    </mobile_app>
  </future_enhancements>
</project_specification>
