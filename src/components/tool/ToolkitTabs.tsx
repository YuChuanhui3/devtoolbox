import { Segmented } from '@/components/ui/Segmented';
import type { SegmentedOption } from '@/components/ui/Segmented';

interface ToolkitTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  options: Array<SegmentedOption<T>>;
}

/** 工具箱页顶部的居中页签条：17 个 *ToolkitTool 共用同一形态。 */
export function ToolkitTabs<T extends string>({ value, onChange, ariaLabel, options }: ToolkitTabsProps<T>) {
  return (
    <div className="flex justify-center">
      <Segmented<T> value={value} onChange={onChange} ariaLabel={ariaLabel} options={options} />
    </div>
  );
}
