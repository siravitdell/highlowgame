"use client";

import { useMemo } from "react";
import type { Category } from "@/types";

interface CategoryPickerProps {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelect: (category: Category) => void;
}

export function CategoryPicker({
  categories,
  selectedCategoryId,
  onSelect,
}: CategoryPickerProps) {
  const groups = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const category of categories) {
      const list = map.get(category.group) ?? [];
      list.push(category);
      map.set(category.group, list);
    }
    return map;
  }, [categories]);

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([group, items]) => (
        <div key={group}>
          <h3 className="mb-2 text-sm font-semibold text-gray-500">{group}</h3>
          <div className="flex flex-wrap gap-2">
            {items.map((category) => (
              <button
                key={category.id}
                onClick={() => onSelect(category)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  selectedCategoryId === category.id
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:border-indigo-400"
                }`}
              >
                {category.metric}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
