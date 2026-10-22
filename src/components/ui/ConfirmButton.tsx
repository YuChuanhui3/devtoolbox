import { useEffect, useState, type ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';
import { useI18n } from '@/i18n/I18nProvider';
import type { Localized } from '@/i18n/locale';

interface ConfirmButtonProps extends Omit<ButtonProps, 'onClick' | 'children' | 'variant'> {
  children: ReactNode;
  confirmLabel?: Localized;
  onConfirm: () => void;
  variant?: ButtonProps['variant'];
}

const CONFIRM_WINDOW = 3000;

export function ConfirmButton({
  children,
  confirmLabel = { zh: '确认清空？', en: 'Click again to confirm' },
  onConfirm,
  variant = 'ghost',
  ...props
}: ConfirmButtonProps) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_WINDOW);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <Button
      {...props}
      variant={confirming ? 'danger' : variant}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setConfirming(false);
        onConfirm();
      }}
    >
      {confirming ? t(confirmLabel) : children}
    </Button>
  );
}
