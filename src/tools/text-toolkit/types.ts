export interface TextPanelProps {
  /** 工具箱共享输入（由父组件持有并持久化草稿）。 */
  value: string;
  onValueChange: (value: string) => void;
  /** 当前模式是否为该面板（门控 ⌘Enter）。 */
  active: boolean;
}

export interface DiffPanelProps extends Omit<TextPanelProps, 'active'> {
  /** 对比工具的右侧输入。 */
  right: string;
  onRightChange: (value: string) => void;
}
