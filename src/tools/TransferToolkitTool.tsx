import { Film, QrCode, SendHorizontal, ShieldCheck } from 'lucide-react';
import { ToolkitTabs } from '@/components/tool/ToolkitTabs';
import { useI18n } from '@/i18n/I18nProvider';
import { useToolkitMode } from '@/hooks/useToolkitMode';
import { LazyPanel } from '@/components/tool/LazyPanel';
import { useDqxSession } from '@/hooks/useDqxSession';
import DropPanel from './transfer-toolkit/DropPanel';
import { QrTransferPanel } from './transfer-toolkit/QrTransferPanel';
import { SalvagePanel } from './transfer-toolkit/SalvagePanel';

type TransferMode = 'drop' | 'qr' | 'send' | 'receive' | 'salvage';

const AIRGAP_MODES: TransferMode[] = ['qr', 'salvage'];

export default function TransferToolkitTool() {
  const { t } = useI18n();
  const [routeMode, setMode] = useToolkitMode<TransferMode>(['drop', 'qr', 'send', 'receive', 'salvage'], 'drop');
  const session = useDqxSession();
  // 旧 ?mode=send/receive 链接继续可用，并定位到合并页签里的对应方向。
  const mode = routeMode === 'send' || routeMode === 'receive' ? 'qr' : routeMode;
  const initialDirection = routeMode === 'send' || routeMode === 'receive' ? routeMode : undefined;
  const airgap = AIRGAP_MODES.includes(mode);

  return (
    <div className="space-y-4">
      <ToolkitTabs<TransferMode>
          value={mode}
          onChange={setMode}
          ariaLabel={t({ zh: '文件传输方式', en: 'Transfer mode' })}
          options={[
            { value: 'drop', label: t({ zh: '局域网互传 / 手机扫码', en: 'LAN Drop / Scan' }), icon: <SendHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> },
            { value: 'qr', label: t({ zh: '二维码传输', en: 'QR Transfer' }), icon: <QrCode className="h-3.5 w-3.5" aria-hidden="true" /> },
            { value: 'salvage', label: t({ zh: '截图/录屏回收', en: 'Salvage' }), icon: <Film className="h-3.5 w-3.5" aria-hidden="true" /> },
          ]}
      />

      <LazyPanel active={mode === 'drop'}>
        <DropPanel session={session} />
      </LazyPanel>
      <LazyPanel active={mode === 'qr'}>
        <QrTransferPanel active={mode === 'qr'} initialDirection={initialDirection} session={session} />
      </LazyPanel>
      <LazyPanel active={mode === 'salvage'}>
        <SalvagePanel active={mode === 'salvage'} session={session} />
      </LazyPanel>

      {airgap ? (
        <>
          <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5 text-[11px] leading-5 text-ink-3">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
            {t({
              zh: '面向内网/外网物理隔离场景：发送端逐帧播放二维码，接收端用手机或第二台设备的摄像头连续扫码还原；也可让对方录一段播放视频、事后逐帧回收。全程本地完成，内容不出机器。',
              en: 'Built for air-gapped transfer: the sender plays QR frames while a camera on the other side scans them continuously; the other end can also screen-record the playback and recover frames afterwards. Everything runs locally, content never leaves the machine.',
            })}
          </div>

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-3">
            <QrCode className="h-3 w-3" aria-hidden="true" />
            {t({
              zh: '小文件建议 < 200 KB：1000 字节/帧 · 2 帧/秒时约 17 秒传完 4 KB 压缩数据',
              en: 'Best for files under ~200 KB: at 1000 bytes/frame and 2 fps, 4 KB of compressed data takes about 17 seconds',
            })}
          </p>
        </>
      ) : null}
    </div>
  );
}
