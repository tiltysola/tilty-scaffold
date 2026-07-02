import { LaptopIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from 'lucide-react';

import { type AuthDeviceSession } from '@/lib/auth';

export function DeviceIcon({ deviceType }: { deviceType: AuthDeviceSession['deviceType'] }) {
  if (deviceType === 'mobile') {
    return <SmartphoneIcon className="size-4" />;
  }

  if (deviceType === 'tablet') {
    return <TabletIcon className="size-4" />;
  }

  return (
    <>
      <MonitorIcon className="hidden size-4 sm:block" />
      <LaptopIcon className="size-4 sm:hidden" />
    </>
  );
}
