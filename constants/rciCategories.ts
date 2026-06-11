// RCI Missions Category Structure
// Hierarchical categories for Monthly Accounts and Annual Reports

export const RCI_INCOME_CATEGORIES: Record<string, string[]> = {
  "Donations": ["Tithes & First Fruits", "Offerings", "Thanksgiving"],
  "Building Fund": [],
  "Charitable Activities": ["Charity Fund", "Gender Ministries"],
  "Other Income": ["Merchandise", "Uncategorised"],
};

// Alias map: maps legacy/variant category names to canonical RCI names.
// Used by data migration and as a fallback in report grouping.
export const CATEGORY_ALIASES: Record<string, string> = {
  "Tithe": "Tithes & First Fruits",
  "Tithes": "Tithes & First Fruits",
  "First Fruit": "Tithes & First Fruits",
  "Offering": "Offerings",
  "Donations": "Donation",
  "Books": "Merchandise",
  "Other": "Uncategorised",
  "Rent-Premises For Worship": "Rent - Premises for Worship",
  "Rent Premises for Worship": "Rent - Premises for Worship",
  "Premises-Manse": "Premises - Manse",
  "Manse": "Premises - Manse",
  "Rent - Manse": "Premises - Manse",
};

export const RCI_EXPENDITURE_CATEGORIES: Record<string, string[]> = {
  "Major Programs": ["MP Honorarium", "MP Accommodation", "MP Refreshments"],
  "Ministry Costs": ["Church Provisions", "Travel & Transport"],
  "Staff & Volunteer Costs": ["Gross Salary", "Allowances"],
  "Premises Costs": ["Rent", "Rent - Premises for Worship", "Premises - Manse", "Utilities"],
  "Mission Costs": ["Missions-Tithe", "Mission Support"],
  "Admin & Governance": ["Bank Charges", "IT Costs", "Love Gifts"],
};

// Flat list of all income subcategories
export const ALL_INCOME_SUBCATEGORIES = Object.values(RCI_INCOME_CATEGORIES).flat();

// Flat list of all expenditure subcategories
export const ALL_EXPENDITURE_SUBCATEGORIES = Object.values(RCI_EXPENDITURE_CATEGORIES).flat();

// Get main category for a subcategory (for Income)
export const getIncomeMainCategory = (subcategory: string): string | undefined => {
  for (const [mainCategory, subcategories] of Object.entries(RCI_INCOME_CATEGORIES)) {
    if (subcategories.includes(subcategory) || (subcategories.length === 0 && subcategory === mainCategory)) {
      return mainCategory;
    }
  }
  return undefined;
};

// Get main category for a subcategory (for Expenditure)
export const getExpenditureMainCategory = (subcategory: string): string | undefined => {
  for (const [mainCategory, subcategories] of Object.entries(RCI_EXPENDITURE_CATEGORIES)) {
    if (subcategories.includes(subcategory) || (subcategories.length === 0 && subcategory === mainCategory)) {
      return mainCategory;
    }
  }
  return undefined;
};

// Ordered main categories for display
export const INCOME_MAIN_CATEGORY_ORDER = [
  "Donations",
  "Building Fund",
  "Charitable Activities",
  "Other Income",
];

export const EXPENDITURE_MAIN_CATEGORY_ORDER = [
  "Major Programs",
  "Ministry Costs",
  "Staff & Volunteer Costs",
  "Premises Costs",
  "Mission Costs",
  "Admin & Governance",
];

// Helper to build flat category list with metadata for seeding
export interface CategorySeedData {
  name: string;
  mainCategory: string;
  transactionType: "Income" | "Expenditure";
  displayOrder: number;
}

export const getRCICategorySeedData = (): CategorySeedData[] => {
  const categories: CategorySeedData[] = [];
  let order = 0;

  // Income categories
  for (const mainCategory of INCOME_MAIN_CATEGORY_ORDER) {
    const subcategories = RCI_INCOME_CATEGORIES[mainCategory];
    if (subcategories.length === 0) {
      // Main category with no subcategories (e.g., Building Fund)
      categories.push({
        name: mainCategory,
        mainCategory,
        transactionType: "Income",
        displayOrder: order++,
      });
    } else {
      for (const subcategory of subcategories) {
        categories.push({
          name: subcategory,
          mainCategory,
          transactionType: "Income",
          displayOrder: order++,
        });
      }
    }
  }

  // Expenditure categories
  for (const mainCategory of EXPENDITURE_MAIN_CATEGORY_ORDER) {
    const subcategories = RCI_EXPENDITURE_CATEGORIES[mainCategory];
    if (subcategories.length === 0) {
      categories.push({
        name: mainCategory,
        mainCategory,
        transactionType: "Expenditure",
        displayOrder: order++,
      });
    } else {
      for (const subcategory of subcategories) {
        categories.push({
          name: subcategory,
          mainCategory,
          transactionType: "Expenditure",
          displayOrder: order++,
        });
      }
    }
  }

  return categories;
};
