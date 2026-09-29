// SIGMA SNAP — camera route.
// The camera client is loaded with ssr:false: the lens SDK creates DOM
// canvases at import time, so it can only ever run in the browser.
import dynamic from 'next/dynamic';
import { Spinner } from '@/components/ui';

const CameraClient = dynamic(() => import('@/components/camera/CameraClient'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-black">
      <Spinner size={30} />
    </div>
  ),
});

export default function CameraPage() {
  return <CameraClient />;
}
