import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel } from '@/components/ui/Panel';
import { ToolAlert } from '@/components/tool/ToolAlert';
import { useI18n } from '@/i18n/I18nProvider';
import type { L10n, Localized } from '@/i18n/locale';
import { toToolError } from '@/lib/errors';
import { queryIpWho, type IpWhoResult } from './shared/ipInfoQuery';

export default function IpNearbyTool() {
  const { t } = useI18n();
  const [ipInput, setIpInput] = useState('');
  const [data, setData] = useState<IpWhoResult | null>(null);
  const [error, setError] = useState<Localized | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (ip: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await queryIpWho(ip));
    } catch (caught) {
      setData(null);
      setError(toToolError(caught).localized);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void lookup('');
  }, [lookup]);

  const lat = data?.latitude ?? 0;
  const lng = data?.longitude ?? 0;
  const hasCoords = data?.latitude !== undefined && data?.longitude !== undefined;
  const bbox = `${(lng - 0.02).toFixed(5)}%2C${(lat - 0.01).toFixed(5)}%2C${(lng + 0.02).toFixed(5)}%2C${(lat + 0.01).toFixed(5)}`;
  const coords = `${lat.toFixed(5)},${lng.toFixed(5)}`;

  const nearbyLinks: { label: L10n; url: string }[] = [
    { label: { zh: '高德地图', en: 'Amap' }, url: `https://uri.amap.com/marker?position=${lng.toFixed(6)},${lat.toFixed(6)}&name=${encodeURIComponent(data?.city || t({ zh: '当前位置', en: 'Current location' }))}` },
    { label: { zh: 'Google 地图', en: 'Google Maps' }, url: `https://www.google.com/maps/search/%E7%BE%8E%E9%A3%9F/@${lat},${lng},14z` },
    { label: { zh: 'OpenStreetMap', en: 'OpenStreetMap' }, url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}` },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input
            value={ipInput}
            onChange={(e) => setIpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void lookup(ipInput);
            }}
            placeholder={t({ zh: '输入 IP 定位，留空查询本机…', en: 'Enter an IP to locate, leave blank to query this device…' })}
            mono
            className="pl-9"
            aria-label={t({ zh: '要定位的 IP', en: 'IP to locate' })}
          />
        </div>
        <Button variant="primary" onClick={() => void lookup(ipInput)} disabled={loading}>
          {loading ? t({ zh: '定位中…', en: 'Locating…' }) : t({ zh: '定位', en: 'Locate' })}
        </Button>
      </div>

      {error ? <ToolAlert tone="error" title={error} hint={{ zh: '内网 IP 或隐私地址无公开定位数据。', en: 'Private or privacy-protected addresses have no public location data.' }} /> : null}

      {data && hasCoords ? (
        <>
          <Panel
            title={`${data.country ?? ''} ${data.region ?? ''} ${data.city ?? ''}`.trim() || t({ zh: '定位结果', en: 'Location' })}
            subtitle={t({
              zh: `经纬度 ${coords} · ${data.timezone?.id ?? '时区未知'}`,
              en: `Coordinates ${coords} · ${data.timezone?.id ?? 'Unknown timezone'}`,
            })}
            noPadding
          >
            <iframe
              title={t({ zh: '周边地图', en: 'Nearby map' })}
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`}
              className="h-[360px] w-full border-0"
              loading="lazy"
            />
          </Panel>

          <Panel title={t({ zh: '在地图中查看周边', en: 'View nearby on maps' })}>
            <div className="flex flex-wrap gap-2">
              {nearbyLinks.map((item) => (
                <a
                  key={item.label.zh}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-2 transition-colors hover:border-accent/40 hover:text-accent-strong"
                >
                  {t(item.label)}
                </a>
              ))}
            </div>
          </Panel>
        </>
      ) : (
        !error && (
          <Panel title={t({ zh: '周边信息', en: 'Nearby info' })}>
            <div className="flex min-h-[200px] items-center justify-center text-xs text-ink-3">
              {t({ zh: '定位成功后展示地图与周边入口', en: 'The map and nearby entries appear once the location is found' })}
            </div>
          </Panel>
        )
      )}

      <p className="text-center text-[11px] text-ink-3">
        {t({ zh: 'IP 定位精度为城市级，地图中心为该地区参考点而非精确位置；「周边」入口跳转至各地图服务在坐标处的搜索。', en: 'IP location is city-level; the map center is a reference point for the area, not an exact position. The "nearby" links open each map service’s search at those coordinates.' })}
      </p>
    </div>
  );
}
