import clsx from 'clsx';
import { CATEGORIES, type Category } from '@/lib/config';

const ALL_CATEGORIES: Category[] = ['All', ...CATEGORIES];

interface CategoryTabsProps {
  selected: Category;
  onChange: (category: Category) => void;
}

export function CategoryTabs({ selected, onChange }: CategoryTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-none touch-pan-x">
      {ALL_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={clsx(
            'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            selected === cat
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-hover hover:text-white',
          )}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
