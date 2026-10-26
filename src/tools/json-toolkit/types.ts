export interface ToolkitPanelProps {
  /** 工具箱共享的 JSON 输入，三个模式面板读写同一份内容。 */
  input: string;
  setInput: (value: string) => void;
  /** 面板是否处于当前模式，用于门控 ⌘Enter 等全局热键。 */
  active: boolean;
}
