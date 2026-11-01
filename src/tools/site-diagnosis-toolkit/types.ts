export interface SiteDiagnosisPanelProps {
  /** 工具箱共享的 URL / 域名输入（由父组件持有并持久化草稿）。 */
  url: string;
  setUrl: (value: string) => void;
  /** 当前模式是否为该面板（门控全局热键）。 */
  active: boolean;
}
