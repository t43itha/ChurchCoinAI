import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { isMovementCategory } from "../../lib/movementCategories";
import { can } from "../../lib/permissions";
import type { AppUser, Category } from "../../types";
import WizardFrame from "../wizard/WizardFrame";
import { Segmented, btnMd, btnPrimary, linkBtnSm, screenHelp, screenTitle, tagGrey, txtInput } from "../wizard/ui";

type CategoryType = "Income" | "Expenditure";

interface CategoriesSheetProps {
  currentUser: AppUser;
  categories: Category[];
  onAddCategory: (category: string, transactionType: CategoryType) => void;
  onRemoveCategory: (category: string) => void;
  onSetCategoryRetired: (categoryId: string, retired: boolean) => void;
  onClose: () => void;
}

export default function CategoriesSheet({
  currentUser,
  categories,
  onAddCategory,
  onRemoveCategory,
  onSetCategoryRetired,
  onClose,
}: CategoriesSheetProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("Income");

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    onAddCategory(name.trim(), type);
    setName("");
  };

  return (
    <WizardFrame ariaLabel="Categories" title="Categories" onClose={onClose}>
      <h2 className={screenTitle}>Categories</h2>
      <p className={screenHelp}>Used to sort income and spending across reports.</p>

      <form onSubmit={add} className="grid gap-3">
        <label htmlFor="category-name" className="sr-only">
          Category name
        </label>
        <input
          id="category-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Category name"
          className={txtInput}
        />
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <Segmented<CategoryType>
              label="Category type"
              options={["Income", "Expenditure"]}
              value={type}
              onChange={setType}
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className={`${btnPrimary} ${btnMd} !w-auto shrink-0 px-5`}
          >
            Add
          </button>
        </div>
      </form>

      <ul className="mt-5 divide-y divide-ledger overflow-hidden rounded-2xl border border-ledger bg-white">
        {categories.map((category) => (
          <li key={category._id} className="flex min-h-[52px] items-center gap-3 px-3.5">
            <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{category.name}</span>
            {category.isRetired && <span className={tagGrey}>Retired</span>}
            {can(currentUser.role, "categories.write") && !isMovementCategory(category) && (
              <button
                type="button"
                aria-label={`${category.isRetired ? "Restore" : "Retire"} category ${category.name}`}
                onClick={() => onSetCategoryRetired(category._id, !category.isRetired)}
                className={linkBtnSm}
              >
                {category.isRetired ? "Restore" : "Retire"}
              </button>
            )}
            {can(currentUser.role, "categories.delete") && (
              <button
                type="button"
                aria-label={`Delete category ${category.name}`}
                onClick={() => onRemoveCategory(category.name)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-mid hover:text-error"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-5 rounded-2xl border border-[#ecd8bd] bg-[#fcf7f0] px-3.5 py-3 text-xs leading-relaxed text-[#7a5a30]">
        <strong className="font-bold">Note:</strong> Deleting a category won't remove it from past transactions, but it
        can't be used for new entries or AI categorisation. Retiring it has the same effect on new entries. Rows already
        in it keep it and appear under Needs reclassifying in Transactions.
      </p>
    </WizardFrame>
  );
}
