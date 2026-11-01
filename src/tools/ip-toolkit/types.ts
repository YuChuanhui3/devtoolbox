export interface IpPanelProps {
  /** 工具箱共享的 IP / 网段输入（由父组件持有并持久化草稿）。 */
  ip: string;
  setIp: (value: string) => void;
  /** 当前模式是否为该面板（门控 ⌘Enter）。 */
  active: boolean;
}

export interface IpActivePanelProps {
  /** 当前模式是否为该面板（门控全局热键）。 */
  active: boolean;
}
