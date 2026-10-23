/** 图标底色的唯一语义：这个工具是否处理密钥、口令、私钥等敏感输入。其余一律用品牌蓝。 */
export const SENSITIVE_CHIP = 'bg-warn-soft text-warn';
export const DEFAULT_CHIP = 'bg-accent-soft text-accent-strong';

export function toolChipTone(sensitive?: boolean): string {
  return sensitive ? SENSITIVE_CHIP : DEFAULT_CHIP;
}
